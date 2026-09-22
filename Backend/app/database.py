"""
SQLite engine + session setup for Omify backend.
Zero external DB setup required — the file omify.db is created
automatically on first run in the backend/ directory.
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "omify.db")
DATABASE_URL = f"sqlite:///{DB_PATH}"

# check_same_thread=False is required for SQLite + FastAPI's threaded
# request handling; SQLAlchemy's session-per-request pattern still
# guarantees each request gets its own session, so this is safe.
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """FastAPI dependency — yields a session, always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables if they don't exist. Called on app startup."""
    # Import models here (not at module top) so they register on Base
    # before create_all runs, without causing circular imports.
    from app.models import song, history, favorite, playlist, preference  # noqa: F401
    Base.metadata.create_all(bind=engine)

    # Lightweight migration: ensure cluster_id exists on songs table
    from sqlalchemy import text
    with engine.connect() as conn:
        cols = [row[1] for row in conn.execute(text("PRAGMA table_info(songs)")).fetchall()]
        if cols and "cluster_id" not in cols:
            conn.execute(text("ALTER TABLE songs ADD COLUMN cluster_id INTEGER"))
            conn.commit()