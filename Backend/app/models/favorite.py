from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.database import Base


class Favorite(Base):
    __tablename__ = "favorites"

    song_id = Column(String, ForeignKey("songs.id"), primary_key=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())