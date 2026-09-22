"""
Pydantic schemas for Playlist entities.
"""
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, ConfigDict
from app.schemas.song import SongRead


class PlaylistCreate(BaseModel):
    name: str
    description: Optional[str] = ""


class PlaylistSongAdd(BaseModel):
    song_id: str


class PlaylistRead(BaseModel):
    id: int
    name: str
    description: Optional[str] = ""
    created_at: Optional[datetime] = None
    song_count: int = 0
    songs: Optional[List[SongRead]] = []

    model_config = ConfigDict(from_attributes=True)
