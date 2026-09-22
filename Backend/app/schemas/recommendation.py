"""
Pydantic schemas for Recommendation responses.
"""
from typing import Optional, List
from pydantic import BaseModel, ConfigDict
from app.schemas.song import SongRead


class RecommendationItem(BaseModel):
    song: SongRead
    score: float
    reason: str
    cluster_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class RecommendationResponse(BaseModel):
    total: int
    items: List[RecommendationItem]
