"""
Pydantic schemas for ListeningHistory entities.
"""
from typing import Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict
from app.schemas.song import SongRead


class HistoryCreate(BaseModel):
    song_id: str
    play_duration: Optional[int] = 0
    completed: Optional[bool] = False
    skipped: Optional[bool] = False
    liked_at_play_time: Optional[bool] = False


class HistoryRead(BaseModel):
    id: int
    song_id: str
    played_at: datetime
    play_duration: int
    completed: bool
    skipped: bool
    liked_at_play_time: bool
    song: Optional[SongRead] = None

    model_config = ConfigDict(from_attributes=True)
