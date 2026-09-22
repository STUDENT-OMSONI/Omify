"""
Router for User Favorites.
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database import get_db
from app.models.favorite import Favorite
from app.models.song import Song
from app.schemas.song import SongRead
from app.services.user_profile import update_user_preferences

router = APIRouter(prefix="/api/favorites", tags=["Favorites"])


@router.get("", response_model=List[SongRead])
def list_favorites(db: Session = Depends(get_db)):
    """List all favorited songs."""
    favs = (
        db.query(Song)
        .join(Favorite, Favorite.song_id == Song.id)
        .order_by(desc(Favorite.created_at))
        .all()
    )
    return favs


@router.post("/{song_id}", status_code=status.HTTP_201_CREATED)
def add_favorite(song_id: str, db: Session = Depends(get_db)):
    """Mark a song as favorite."""
    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    existing = db.query(Favorite).filter(Favorite.song_id == song_id).first()
    if not existing:
        fav = Favorite(song_id=song_id)
        db.add(fav)
        db.commit()
        # Fast profile update
        update_user_preferences(db)

    return {"status": "success", "song_id": song_id, "liked": True}


@router.delete("/{song_id}", status_code=status.HTTP_200_OK)
def remove_favorite(song_id: str, db: Session = Depends(get_db)):
    """Remove a song from favorites."""
    fav = db.query(Favorite).filter(Favorite.song_id == song_id).first()
    if fav:
        db.delete(fav)
        db.commit()
        update_user_preferences(db)

    return {"status": "success", "song_id": song_id, "liked": False}
