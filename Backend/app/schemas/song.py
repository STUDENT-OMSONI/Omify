"""
Pydantic schemas for Song entities.
"""
from typing import Optional, List
from pydantic import BaseModel, ConfigDict


class SongBase(BaseModel):
    title: str
    artist: str
    album: Optional[str] = "Single"
    album_art: Optional[str] = None
    audio_url: Optional[str] = None
    duration: Optional[int] = 0
    genre: Optional[str] = None
    language: Optional[str] = None
    mood: Optional[str] = None
    country: Optional[str] = None
    release_year: Optional[int] = None
    release_date: Optional[str] = None
    play_count: Optional[int] = 0
    source: Optional[str] = "omify_js"
    is_active: Optional[bool] = True
    cluster_id: Optional[int] = None


class SongRead(SongBase):
    id: str

    model_config = ConfigDict(from_attributes=True)


class SongListResponse(BaseModel):
    total: int
    items: List[SongRead]


class ArtistSummary(BaseModel):
    name: str
    country: Optional[str] = None
    song_count: int
    sample_art: Optional[str] = None


class AlbumSummary(BaseModel):
    title: str
    artist: str
    release_year: Optional[int] = None
    song_count: int
    album_art: Optional[str] = None
