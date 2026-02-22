from sqlmodel import create_engine, SQLModel, Session
import os
import sys
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("FATAL ERROR: DATABASE_URL environment variable is not set!", file=sys.stderr)
    print("Please set DATABASE_URL in your Render environment variables.", file=sys.stderr)
    sys.exit(1)

# Render gives 'postgres://' but SQLAlchemy needs 'postgresql://'
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

print(f"INFO: Connecting to database: {DATABASE_URL[:30]}...")

try:
    engine = create_engine(DATABASE_URL, echo=False)
except Exception as e:
    print(f"FATAL ERROR: Could not create database engine: {e}", file=sys.stderr)
    sys.exit(1)

def create_db_and_tables():
    try:
        SQLModel.metadata.create_all(engine)
        print("INFO: Database tables created/verified successfully.")
    except Exception as e:
        print(f"FATAL ERROR: Could not create database tables: {e}", file=sys.stderr)
        raise

def get_session():
    with Session(engine) as session:
        yield session
