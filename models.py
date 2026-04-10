from datetime import datetime, timezone
from typing import Optional, List
from sqlmodel import Field, SQLModel, Relationship

class UserBase(SQLModel):
    username: str = Field(unique=True, index=True)
    email: str = Field(unique=True, index=True)
    profile_pic: Optional[str] = None
    # AI Intelligence
    ai_personality: str = Field(default="Professional")
    auto_decomposition: bool = Field(default=True)
    smart_prioritization: bool = Field(default=False)
    # Appearance
    ui_theme: str = Field(default="Dark")
    desktop_notifications: bool = Field(default=True)
    # Sync
    calendar_sync_enabled: bool = Field(default=False)

class User(UserBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    hashed_password: str
    tasks: List["Task"] = Relationship(back_populates="owner")

class UserCreate(UserBase):
    password: str

class UserRead(UserBase):
    id: int

class UserUpdate(SQLModel):
    username: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    profile_pic: Optional[str] = None
    ai_personality: Optional[str] = None
    auto_decomposition: Optional[bool] = None
    smart_prioritization: Optional[bool] = None
    ui_theme: Optional[str] = None
    desktop_notifications: Optional[bool] = None
    calendar_sync_enabled: Optional[bool] = None

class TaskBase(SQLModel):
    title: str = Field(index=True)
    description: Optional[str] = None
    priority: str = Field(default="medium") # low, medium, high
    status: str = Field(default="todo") # todo, in-progress, completed
    category: Optional[str] = Field(default="General", index=True)
    due_date: Optional[datetime] = None
    estimated_minutes: Optional[int] = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    reminder_sent: bool = Field(default=False)
    owner_id: Optional[int] = Field(default=None, foreign_key="user.id")

class SubTask(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    is_completed: bool = Field(default=False)
    task_id: int = Field(foreign_key="task.id")
    task: "Task" = Relationship(back_populates="subtasks")

class Task(TaskBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    owner: Optional[User] = Relationship(back_populates="tasks")
    subtasks: List[SubTask] = Relationship(back_populates="task", sa_relationship_kwargs={"cascade": "all, delete-orphan"})

class TaskCreate(SQLModel):
    title: str
    description: Optional[str] = None
    priority: str = "medium"
    category: Optional[str] = "General"
    due_date: Optional[datetime] = None
    estimated_minutes: Optional[int] = None

class TaskRead(TaskBase):
    id: int
    subtasks: List["SubTask"] = []

class TaskUpdate(SQLModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    category: Optional[str] = None
    due_date: Optional[datetime] = None

class GoogleLoginRequest(SQLModel):
    credential: str

# --- Web Push Subscriptions ---
class PushSubscription(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    endpoint: str = Field(sa_column_kwargs={"unique": True})
    p256dh: str       # browser public key
    auth: str         # browser auth secret
    created_at: datetime = Field(default_factory=datetime.utcnow)

class PushSubscriptionCreate(SQLModel):
    endpoint: str
    p256dh: str
    auth: str

