"""
Router for Playback Listening History.
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database import get_db
from app.models.history import ListeningHistory
from app.models.song import Song
from app.schemas.history import HistoryCreate, HistoryRead
from app.services.user_profile import update_user_preferences

router = APIRouter(prefix="/api/history", tags=["History"])


@router.get("", response_model=List[HistoryRead])
def get_history(limit: int = 50, db: Session = Depends(get_db)):
    """Retrieve recent playback listening history."""
    events = (
        db.query(ListeningHistory)
        .order_by(desc(ListeningHistory.played_at))
        .limit(limit)
        .all()
    )

    song_ids = {e.song_id for e in events}
    songs_map = {}
    if song_ids:
        songs = db.query(Song).filter(Song.id.in_(song_ids)).all()
        songs_map = {s.id: s for s in songs}

    res = []
    for e in events:
        read_obj = HistoryRead(
            id=e.id,
            song_id=e.song_id,
            played_at=e.played_at,
            play_duration=e.play_duration or 0,
            completed=e.completed,
            skipped=e.skipped,
            liked_at_play_time=e.liked_at_play_time,
            song=songs_map.get(e.song_id),
        )
        res.append(read_obj)

    return res


@router.post("", status_code=status.HTTP_201_CREATED)
def record_history(event_data: HistoryCreate, db: Session = Depends(get_db)):
    """
    Record a playback event in listening_history, increment song play_count,
    and trigger a fast lightweight preference profile update.
    """
    song = db.query(Song).filter(Song.id == event_data.song_id).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    # Increment play count if not skipped
    if not event_data.skipped:
        song.play_count = (song.play_count or 0) + 1

    event = ListeningHistory(
        song_id=event_data.song_id,
        play_duration=event_data.play_duration or 0,
        completed=bool(event_data.completed),
        skipped=bool(event_data.skipped),
        liked_at_play_time=bool(event_data.liked_at_play_time),
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    # Lightweight update of user preferences
    update_user_preferences(db)

    return {"status": "success", "event_id": event.id}


@router.delete("", status_code=status.HTTP_200_OK)
def clear_history(db: Session = Depends(get_db)):
    """Clear all listening history."""
    db.query(ListeningHistory).delete()
    db.commit()
    update_user_preferences(db)
    return {"status": "cleared"}
