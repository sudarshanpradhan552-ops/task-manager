from sqlmodel import create_engine, SQLModel, Session
import os
from dotenv import load_dotenv

load_dotenv()

# MySQL Connection String format: mysql+pymysql://user:password@host:port/database
# Defaulting to a placeholder if not set
# Password 'Kanha@123' needs to be URL encoded to 'Kanha%40123'
DATABASE_URL = os.getenv("DATABASE_URL", "mysql+pymysql://root:Kanha%40123@localhost:3306/task_manager")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(DATABASE_URL, echo=True)

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

def get_session():
    with Session(engine) as session:
        yield session
