"""
Pytest configuration and shared test fixtures.
"""
import pytest
import os
import sys
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

# Ensure backend directory is in sys.path
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.database import Base, get_db
from app.models.song import Song
from app.models.history import ListeningHistory
from app.models.favorite import Favorite
from app.models.playlist import Playlist, PlaylistSong
from app.models.preference import UserPreference
from app.main import app
from app.services.metadata_features import rebuild_feature_matrix

# In-memory SQLite database using StaticPool to share state across threads & connections
TEST_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db_session():
    """Provides a fresh, isolated in-memory database session per test."""
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()

    # Seed 10 test songs across distinct artists, genres, moods, and languages
    sample_songs = [
        Song(
            id=f"test-{i+1:04d}",
            title=f"Track {i+1}",
            artist=f"Artist {((i % 4) + 1)}",
            album=f"Album {((i % 3) + 1)}",
            genre="Pop" if i < 4 else ("R&B" if i < 7 else "Electronic"),
            language="English" if i < 6 else "Korean",
            mood="Uplifting" if i % 2 == 0 else "Chill",
            country="United States" if i < 6 else "South Korea",
            release_year=2020 + (i % 5),
            play_count=1000 * (10 - i),
            is_active=True,
            cluster_id=i % 3,
        )
        for i in range(10)
    ]
    session.add_all(sample_songs)
    session.commit()

    # Build feature matrix for this in-memory test session
    rebuild_feature_matrix(session)

    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db_session):
    """FastAPI TestClient with overridden database dependency."""
    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
