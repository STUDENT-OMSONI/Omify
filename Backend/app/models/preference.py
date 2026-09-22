from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from app.database import Base


class UserPreference(Base):
    """
    Precomputed preference profile — one row, rebuilt (not
    retrained) whenever /api/recommendations/refresh runs or enough
    new history has accumulated. genre_scores / language_scores /
    mood_scores / artist_scores are stored as JSON text blobs, e.g.
    {"Pop": 0.85, "R&B": 0.72}. Kept as a single row for the
    single-user version; add a user_id column when multi-user support
    is introduced.
    """
    __tablename__ = "user_preferences"

    id = Column(Integer, primary_key=True, autoincrement=True)
    genre_scores = Column(String, nullable=False, default="{}")
    language_scores = Column(String, nullable=False, default="{}")
    mood_scores = Column(String, nullable=False, default="{}")
    artist_scores = Column(String, nullable=False, default="{}")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())