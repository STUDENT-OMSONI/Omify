from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Index
from sqlalchemy.sql import func
from app.database import Base


class ListeningHistory(Base):
    """
    One row per playback event. This is the raw signal the
    recommendation engine reads to build the user preference profile
    (Step 11) — never overwritten, only appended to.
    """
    __tablename__ = "listening_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    song_id = Column(String, ForeignKey("songs.id"), nullable=False, index=True)

    played_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
    play_duration = Column(Integer, nullable=True, default=0)  # seconds actually listened
    completed = Column(Boolean, nullable=False, default=False)
    skipped = Column(Boolean, nullable=False, default=False)
    liked_at_play_time = Column(Boolean, nullable=False, default=False)


Index("ix_history_song_played", ListeningHistory.song_id, ListeningHistory.played_at)