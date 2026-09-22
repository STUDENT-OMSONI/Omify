"""
Pydantic schemas for Favorite entities.
"""
from typing import Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict
from app.schemas.song import SongRead


class FavoriteRead(BaseModel):
    song_id: str
    created_at: Optional[datetime] = None
    song: Optional[SongRead] = None

    model_config = ConfigDict(from_attributes=True)
