"""
Router for Recommendations, Made For You, Trending, New Releases, and Model Refresh.
"""
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.song import SongRead
from app.schemas.recommendation import RecommendationResponse, RecommendationItem
from app.services.recommendation_engine import (
    get_made_for_you,
    get_trending_songs,
    get_new_release_recommendations,
    get_foreign_music,
)
from app.services.metadata_features import rebuild_feature_matrix
from app.services.categorization import run_clustering
from app.services.user_profile import build_user_profile

router = APIRouter(prefix="/api", tags=["Recommendations"])


@router.get("/made-for-you", response_model=RecommendationResponse)
def made_for_you_endpoint(
    limit: int = Query(20, ge=1, le=100),
    category: Optional[str] = Query(None, description="Optional category filter: romance, workout, party, lofi, punjabi, bollywood"),
    db: Session = Depends(get_db),
):
    """
    Returns personalized recommendations calculated using the ML scoring formula
    over real metadata and listening history, enforcing artist diversity and category filtering.
    """
    raw_recs = get_made_for_you(db, limit=limit, category=category)
    items = [
        RecommendationItem(
            song=SongRead.model_validate(r["song"]),
            score=r["score"],
            reason=r["reason"],
            cluster_id=r["cluster_id"],
        )
        for r in raw_recs
    ]
    return {"total": len(items), "items": items}


@router.get("/recommendations", response_model=RecommendationResponse)
def recommendations_alias(
    limit: int = Query(20, ge=1, le=100),
    category: Optional[str] = Query(None, description="Optional category filter"),
    db: Session = Depends(get_db),
):
    """Alias for /api/made-for-you."""
    return made_for_you_endpoint(limit=limit, category=category, db=db)


@router.get("/trending", response_model=List[SongRead])
def trending_endpoint(
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Returns top trending tracks ranked by catalog play count."""
    songs = get_trending_songs(db, limit=limit)
    return [SongRead.model_validate(s) for s in songs]


@router.get("/new-releases", response_model=List[SongRead])
def new_releases_endpoint(
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Returns freshest releases via the active ReleaseProvider."""
    songs = get_new_release_recommendations(db, limit=limit)
    return [SongRead.model_validate(s) for s in songs]


@router.get("/foreign-music")
def foreign_music_endpoint(
    limit_per_lang: int = Query(8, ge=1, le=20),
    db: Session = Depends(get_db),
):
    """Returns songs organized by language for international discovery."""
    grouped = get_foreign_music(db, limit_per_lang=limit_per_lang)
    result = {}
    for lang, songs in grouped.items():
        result[lang] = [SongRead.model_validate(s) for s in songs]
    return result


@router.post("/recommendations/refresh")
def refresh_recommendations(db: Session = Depends(get_db)):
    """
    Triggers batch retraining:
      1. Rebuilds the metadata TF-IDF and categorical feature matrix
      2. Re-runs KMeans clustering and assigns cluster_ids
      3. Rebuilds user preference profile
    """
    feat_result = rebuild_feature_matrix(db)
    matrix = feat_result.get("matrix")
    shape = list(matrix.shape) if matrix is not None else [0, 0]

    cluster_result = run_clustering(db)
    profile = build_user_profile(db)

    return {
        "status": "success",
        "feature_matrix_shape": shape,
        "clustering": cluster_result,
        "profile_updated": True,
    }
