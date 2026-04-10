import os
import json
import asyncio
import logging
logging.basicConfig(level=logging.INFO)
from datetime import datetime, timezone
from fastapi import FastAPI, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from fastapi.encoders import jsonable_encoder
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlmodel import Session, select
from typing import List, Dict
from database import create_db_and_tables, get_session, engine
from models import Task, TaskCreate, TaskRead, TaskUpdate, User, UserCreate, UserRead, SubTask, UserUpdate, GoogleLoginRequest, PushSubscription, PushSubscriptionCreate
from ai_handler import parse_task_with_ai, generate_daily_briefing, decompose_task_with_ai
from auth import get_password_hash, verify_password, create_access_token, decode_access_token
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

# Web Push
try:
    from pywebpush import webpush, WebPushException
    PUSH_ENABLED = True
except ImportError:
    PUSH_ENABLED = False
    logging.warning("pywebpush not installed — push notifications disabled")

# Load VAPID config
from dotenv import load_dotenv
load_dotenv()

VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY", "")
VAPID_PUBLIC_KEY  = os.getenv("VAPID_PUBLIC_KEY",  "")
VAPID_EMAIL       = os.getenv("VAPID_EMAIL", "mailto:admin@taskmanager.app")

# ─── Helper: send a single Web Push message ───────────────────────────────────
def send_push(sub: PushSubscription, payload: dict) -> bool:
    """Send a push message to one browser subscription. Returns True on success."""
    if not PUSH_ENABLED or not VAPID_PRIVATE_KEY:
        return False
    try:
        subscription_info = {
            "endpoint": sub.endpoint,
            "keys": {"p256dh": sub.p256dh, "auth": sub.auth}
        }
        webpush(
            subscription_info=subscription_info,
            data=json.dumps(payload),
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims={"sub": VAPID_EMAIL, "aud": sub.endpoint.split("/")[:3][-1]}
        )
        return True
    except WebPushException as e:
        logging.warning(f"Push failed for sub {sub.id}: {e}")
        # 410 Gone = subscription expired/revoked — remove it
        if "410" in str(e) or "404" in str(e):
            try:
                with Session(engine) as session:
                    stale = session.get(PushSubscription, sub.id)
                    if stale:
                        session.delete(stale)
                        session.commit()
            except Exception:
                pass
        return False
    except Exception as e:
        logging.warning(f"Push error: {e}")
        return False

# ─── Background Reminder Scheduler ───────────────────────────────────────────
#
#  Runs every 60 s on the SERVER (no browser needed).
#  Scenario 1: Fires 5 min before any task's due_date.
#  Scenario 2: Fires 2 days before for tasks with span > 2 days.
#
# Each reminder type tracked with a separate in-memory Set so both can fire.
_notified_5min:   set = set()   # task ids already sent 5-min push
_notified_2day:   set = set()   # task ids already sent 2-day push
_notified_overdue: set = set()  # task ids already sent overdue push

FIVE_MIN_S    = 5 * 60          # 5 minutes in seconds
TWO_DAYS_S    = 2 * 24 * 3600  # 48 hours in seconds
OVERDUE_WIN_S = 2 * 60         # 2-minute grace window

def _check_and_send_reminders():
    """Called every 60 s. Queries DB, sends push to subscribed users."""
    now = datetime.now(timezone.utc)
    try:
        with Session(engine) as session:
            tasks = session.exec(
                select(Task).where(Task.status != "completed", Task.due_date != None)
            ).all()

            for task in tasks:
                due = task.due_date.replace(tzinfo=timezone.utc) if task.due_date.tzinfo is None else task.due_date
                created = task.created_at.replace(tzinfo=timezone.utc) if task.created_at.tzinfo is None else task.created_at
                diff_s = (due - now).total_seconds()
                span_s = (due - created).total_seconds()

                subs = session.exec(
                    select(PushSubscription).where(PushSubscription.user_id == task.owner_id)
                ).all()
                if not subs:
                    continue

                def push_all(msg: str, title: str = "⏰ Task Reminder"):
                    payload = {"title": title, "body": msg, "task_id": task.id}
                    for s in subs:
                        send_push(s, payload)

                # — Scenario 1: 5-minute reminder for meetings / short tasks —
                key1 = f"5m_{task.id}"
                if 0 < diff_s <= FIVE_MIN_S and key1 not in _notified_5min:
                    _notified_5min.add(key1)
                    mins = max(1, round(diff_s / 60))
                    push_all(
                        f'"​{task.title}​" starts in {mins} min​—​get ready!',
                        title="⏰ Meeting Starting Soon"
                    )

                # — Scenario 2: 2-day early warning for multi-day tasks —
                key2 = f"2d_{task.id}"
                if span_s > TWO_DAYS_S and 0 < diff_s <= TWO_DAYS_S and key2 not in _notified_2day:
                    _notified_2day.add(key2)
                    hours = round(diff_s / 3600)
                    label = "2 days" if hours >= 36 else f"{round(hours/24)} day" if hours >= 12 else f"{hours} hours"
                    push_all(
                        f'"​{task.title}​" is due in ~{label}. Time to wrap up!',
                        title="📅 Deadline Approaching"
                    )

                # — Overdue alert —
                key3 = f"ov_{task.id}"
                if -OVERDUE_WIN_S <= diff_s <= 0 and key3 not in _notified_overdue:
                    _notified_overdue.add(key3)
                    push_all(
                        f'"​{task.title}​" was due just now! Please take action.',
                        title="🚨 Task Overdue"
                    )
    except Exception as e:
        logging.error(f"Reminder scheduler error: {e}")


async def _reminder_loop():
    """Async wrapper that runs _check_and_send_reminders in a thread every 60s."""
    import concurrent.futures
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    loop = asyncio.get_event_loop()
    while True:
        await loop.run_in_executor(executor, _check_and_send_reminders)
        await asyncio.sleep(60)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup — create tables then launch background reminder task
    create_db_and_tables()
    asyncio.create_task(_reminder_loop())
    yield
    # Shutdown (empty)

app = FastAPI(title="AI Task Manager API", lifespan=lifespan)

# Configure CORS — allow LAN IP frontend + localhost
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://10.172.225.37:5173",   # LAN frontend (Vite dev server)
        "http://localhost:5173",        # local dev fallback
        "http://127.0.0.1:5173",
        "http://10.172.225.37:8000",   # backend itself (for service workers)
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

@app.get("/api/health")
def root():
    return {"message": "AI Task Manager API is running"}

# OAuth2 setup
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# --- WebSocket Manager for Real-time Notifications ---
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: int):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)

    def disconnect(self, websocket: WebSocket, user_id: int):
        if user_id in self.active_connections:
            self.active_connections[user_id].remove(websocket)

    async def send_personal_message(self, message: dict, user_id: int):
        if user_id in self.active_connections:
            for connection in self.active_connections[user_id]:
                await connection.send_json(message)

manager = ConnectionManager()

# --- Auth Dependencies ---
def get_current_user(token: str = Depends(oauth2_scheme), session: Session = Depends(get_session)):
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    username: str = payload.get("sub")
    user = session.exec(select(User).where(User.username == username)).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


# --- Auth Routes ---
@app.get("/users/me", response_model=UserRead)
def read_current_user(current_user: User = Depends(get_current_user)):
    return current_user

@app.patch("/users/update_me")
def update_user(user_update: UserUpdate, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    print(f"Update request for user {current_user.username}: {user_update.dict(exclude_unset=True)}")
    
    new_token = None
    
    if user_update.username and user_update.username != current_user.username:
        # Check if username is taken
        existing = session.exec(select(User).where(User.username == user_update.username)).first()
        if existing and existing.id != current_user.id:
            raise HTTPException(status_code=400, detail="Username already taken")
        current_user.username = user_update.username
        # Generate new token since sub changed
        new_token = create_access_token(data={"sub": current_user.username})
        
    if user_update.email:
        current_user.email = user_update.email
        
    if user_update.password:
        current_user.hashed_password = get_password_hash(user_update.password)
        
    if user_update.profile_pic is not None:
        current_user.profile_pic = user_update.profile_pic

    if user_update.ai_personality:
        current_user.ai_personality = user_update.ai_personality
    if user_update.auto_decomposition is not None:
        current_user.auto_decomposition = user_update.auto_decomposition
    if user_update.smart_prioritization is not None:
        current_user.smart_prioritization = user_update.smart_prioritization
    if user_update.ui_theme:
        current_user.ui_theme = user_update.ui_theme
    if user_update.desktop_notifications is not None:
        current_user.desktop_notifications = user_update.desktop_notifications
    if user_update.calendar_sync_enabled is not None:
        current_user.calendar_sync_enabled = user_update.calendar_sync_enabled
        
    session.add(current_user)
    try:
        session.commit()
        session.refresh(current_user)
    except Exception as e:
        session.rollback()
        print(f"Update error: {e}")
        raise HTTPException(status_code=500, detail="Could not update profile")
        
    response_data = {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "profile_pic": current_user.profile_pic,
        "ai_personality": current_user.ai_personality,
        "auto_decomposition": current_user.auto_decomposition,
        "smart_prioritization": current_user.smart_prioritization,
        "ui_theme": current_user.ui_theme,
        "desktop_notifications": current_user.desktop_notifications,
        "calendar_sync_enabled": current_user.calendar_sync_enabled
    }
    
    if new_token:
        response_data["new_token"] = new_token
        
    return response_data

@app.post("/signup", response_model=UserRead)
def signup(user_data: UserCreate, session: Session = Depends(get_session)):
    hashed_pwd = get_password_hash(user_data.password)
    db_user = User(username=user_data.username, email=user_data.email, hashed_password=hashed_pwd)
    session.add(db_user)
    try:
        session.commit()
        session.refresh(db_user)
        return db_user
    except Exception as e:
        session.rollback()
        print(f"Signup error: {e}") # Log the actual error to your terminal
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/token")
def login(form_data: OAuth2PasswordRequestForm = Depends(), session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.username == form_data.username)).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    
    access_token = create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/auth/google")
def google_auth(request: GoogleLoginRequest, session: Session = Depends(get_session)):
    try:
        # Get Client ID from environment
        client_id = os.getenv("GOOGLE_CLIENT_ID")
        if not client_id:
            raise HTTPException(status_code=500, detail="Google Client ID not configured on server")
        
        logging.info(f"Google auth attempt — Client ID: {client_id[:20]}...")
        
        # Verify the Google ID token
        # clock_skew_in_seconds allows up to 10s of clock difference between client and server
        idinfo = id_token.verify_oauth2_token(
            request.credential,
            google_requests.Request(),
            client_id,
            clock_skew_in_seconds=10
        )

        # ID token is valid. Get the user's Google Account ID from the decoded token.
        email = idinfo['email']
        name = idinfo.get('name', email.split('@')[0])
        picture = idinfo.get('picture')
        
        logging.info(f"Google auth success for email: {email}")

        # Check if user exists
        user = session.exec(select(User).where(User.email == email)).first()
        
        if not user:
            # Create new user — handle case where name is already taken as username
            base_username = name
            username_candidate = base_username
            counter = 1
            while session.exec(select(User).where(User.username == username_candidate)).first():
                username_candidate = f"{base_username}{counter}"
                counter += 1
            
            user = User(
                username=username_candidate,
                email=email,
                profile_pic=picture,
                hashed_password=get_password_hash(os.urandom(24).hex()) # Dummy password
            )
            session.add(user)
            session.commit()
            session.refresh(user)
        
        access_token = create_access_token(data={"sub": user.username})
        return {"access_token": access_token, "token_type": "bearer"}
    except ValueError as e:
        # This is thrown when the token is invalid — log the actual reason
        logging.error(f"Google token verification FAILED: {e}")
        raise HTTPException(status_code=400, detail=f"Invalid Google token: {str(e)}")
    except Exception as e:
        logging.error(f"Google auth unexpected error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# --- WebSocket Endpoint ---
@app.websocket("/ws/{token}")
async def websocket_endpoint(websocket: WebSocket, token: str, session: Session = Depends(get_session)):
    payload = decode_access_token(token)
    if not payload:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    
    username = payload.get("sub")
    user = session.exec(select(User).where(User.username == username)).first()
    if not user:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await manager.connect(websocket, user.id)
    try:
        while True:
            await websocket.receive_text() # Keep connection alive
    except WebSocketDisconnect:
        manager.disconnect(websocket, user.id)

# --- Tasks Routes ---
@app.get("/tasks/briefing")
def get_briefing(current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """
    Get an AI-generated briefing of your current tasks.
    """
    tasks = session.exec(select(Task).where(Task.owner_id == current_user.id)).all()
    task_strings = [f"{t.title} (Priority: {t.priority}, Due: {t.due_date})" for t in tasks]
    briefing = generate_daily_briefing(task_strings)
    return {"briefing": briefing}

@app.post("/tasks/", response_model=TaskRead)
async def create_task(task: TaskCreate, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    db_task = Task(**task.dict(), owner_id=current_user.id)
    session.add(db_task)
    session.commit()
    session.refresh(db_task)
    
    # Notify user via WebSocket
    task_data = jsonable_encoder(db_task)
    await manager.send_personal_message({
        "type": "TASK_CREATED",
        "task": task_data,
        "message": f"New task created: {db_task.title}"
    }, current_user.id)
    return db_task

@app.post("/tasks/smart-add", response_model=TaskRead)
async def smart_add_task(prompt: str, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """
    Create a task using AI natural language parsing.
    """
    ai_data = parse_task_with_ai(prompt)
    if not ai_data:
        raise HTTPException(status_code=400, detail="AI could not parse the task.")
    
    db_task = Task(**ai_data, owner_id=current_user.id)
    session.add(db_task)
    session.commit()
    session.refresh(db_task)
    
    # Notify user via WebSocket
    task_data = jsonable_encoder(db_task)
    await manager.send_personal_message({
        "type": "TASK_CREATED",
        "task": task_data,
        "message": f"💡 AI added task: {db_task.title}"
    }, current_user.id)
    return db_task

@app.post("/tasks/{task_id}/decompose", response_model=TaskRead)
async def decompose_task(task_id: int, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """
    Use AI to break an existing task into sub-tasks.
    """
    db_task = session.exec(select(Task).where(Task.id == task_id, Task.owner_id == current_user.id)).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    subtask_titles = decompose_task_with_ai(db_task.title, db_task.description or "")
    
    for title in subtask_titles:
        subtask = SubTask(title=title, task_id=db_task.id)
        session.add(subtask)
    
    session.commit()
    session.refresh(db_task)
    
    # Notify user
    task_data = jsonable_encoder(db_task)
    await manager.send_personal_message({
        "type": "TASK_UPDATED", 
        "task": task_data,
        "message": f"🧠 AI decomposed task: {db_task.title}"
    }, current_user.id)
    
    return db_task

@app.get("/tasks/", response_model=List[TaskRead])
def read_tasks(
    offset: int = 0,
    limit: int = Query(default=100, le=100),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    tasks = session.exec(select(Task).where(Task.owner_id == current_user.id).offset(offset).limit(limit)).all()
    return tasks

@app.get("/tasks/{task_id}", response_model=TaskRead)
def read_task(task_id: int, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    task = session.exec(select(Task).where(Task.id == task_id, Task.owner_id == current_user.id)).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

@app.patch("/tasks/{task_id}", response_model=TaskRead)
async def update_task(task_id: int, task_data: TaskUpdate, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    db_task = session.exec(select(Task).where(Task.id == task_id, Task.owner_id == current_user.id)).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    data = task_data.dict(exclude_unset=True)
    for key, value in data.items():
        setattr(db_task, key, value)
    
    session.add(db_task)
    session.commit()
    session.refresh(db_task)
    
    # Notify user
    task_data = jsonable_encoder(db_task)
    await manager.send_personal_message({
        "type": "TASK_UPDATED",
        "task": task_data,
        "message": f"Task updated: {db_task.title}"
    }, current_user.id)
    return db_task

@app.delete("/tasks/{task_id}")
async def delete_task(task_id: int, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    task = session.exec(select(Task).where(Task.id == task_id, Task.owner_id == current_user.id)).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    session.delete(task)
    session.commit()
    
    # Notify user
    await manager.send_personal_message({
        "type": "TASK_DELETED",
        "task_id": task_id,
        "message": "Task deleted."
    }, current_user.id)
    return {"ok": True}

# ─── Web Push Subscription Endpoints ────────────────────────────────────────

@app.get("/push/vapid-public-key")
def get_vapid_public_key():
    """Frontend calls this to get the VAPID public key for push subscription."""
    return {"public_key": VAPID_PUBLIC_KEY}

@app.post("/push/subscribe")
def subscribe_push(
    sub_data: PushSubscriptionCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Save (or update) a browser's push subscription for the current user."""
    # Check if this endpoint is already stored
    existing = session.exec(
        select(PushSubscription).where(PushSubscription.endpoint == sub_data.endpoint)
    ).first()
    if existing:
        # Refresh keys in case they changed
        existing.p256dh = sub_data.p256dh
        existing.auth   = sub_data.auth
        existing.user_id = current_user.id
        session.add(existing)
    else:
        new_sub = PushSubscription(
            user_id  = current_user.id,
            endpoint = sub_data.endpoint,
            p256dh   = sub_data.p256dh,
            auth     = sub_data.auth,
        )
        session.add(new_sub)
    session.commit()
    return {"ok": True}

@app.delete("/push/unsubscribe")
def unsubscribe_push(
    endpoint: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    sub = session.exec(
        select(PushSubscription).where(
            PushSubscription.endpoint == endpoint,
            PushSubscription.user_id  == current_user.id
        )
    ).first()
    if sub:
        session.delete(sub)
        session.commit()
    return {"ok": True}

# --- Serve React Frontend (must be LAST, after all API routes) ---
FRONTEND_BUILD_DIR = os.path.join(os.path.dirname(__file__), "task-manager", "dist")

if os.path.exists(FRONTEND_BUILD_DIR):
    # Serve static assets (JS, CSS, images)
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_BUILD_DIR, "assets")), name="assets")

    # Catch-all: serve index.html for any non-API route (React Router support)
    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_react_app(full_path: str):
        index_file = os.path.join(FRONTEND_BUILD_DIR, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return {"message": "Frontend not built yet"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
