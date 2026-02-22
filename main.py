import os
from fastapi import FastAPI, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from fastapi.encoders import jsonable_encoder
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlmodel import Session, select
from typing import List, Dict
from database import create_db_and_tables, get_session
from models import Task, TaskCreate, TaskRead, TaskUpdate, User, UserCreate, UserRead, SubTask, UserUpdate, GoogleLoginRequest
from ai_handler import parse_task_with_ai, generate_daily_briefing, decompose_task_with_ai
from auth import get_password_hash, verify_password, create_access_token, decode_access_token
from google.oauth2 import id_token
from google.auth.transport import requests

from fastapi.middleware.cors import CORSMiddleware

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    create_db_and_tables()
    yield
    # Shutdown (empty for now)

app = FastAPI(title="AI Task Manager API", lifespan=lifespan)

# Configure CORS - More permissive for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow all for development to clear CORS hurdles
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
             # If not set, we can't verify, but for dev we might want a fallback or just error
             raise HTTPException(status_code=500, detail="Google Client ID not configured")
             
        idinfo = id_token.verify_oauth2_token(request.credential, requests.Request(), client_id)

        # ID token is valid. Get the user's Google Account ID from the decoded token.
        email = idinfo['email']
        name = idinfo.get('name', email.split('@')[0])
        picture = idinfo.get('picture')

        # Check if user exists
        user = session.exec(select(User).where(User.email == email)).first()
        
        if not user:
            # Create new user
            user = User(
                username=name,
                email=email,
                profile_pic=picture,
                hashed_password=get_password_hash(os.urandom(24).hex()) # Dummy password
            )
            session.add(user)
            session.commit()
            session.refresh(user)
        
        access_token = create_access_token(data={"sub": user.username})
        return {"access_token": access_token, "token_type": "bearer"}
    except ValueError:
        # Invalid token
        raise HTTPException(status_code=400, detail="Invalid Google token")
    except Exception as e:
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
