"""
Router for User Playlists and Playlist Songs.
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database import get_db
from app.models.playlist import Playlist, PlaylistSong
from app.models.song import Song
from app.schemas.playlist import PlaylistCreate, PlaylistRead
from app.schemas.song import SongRead

router = APIRouter(prefix="/api/playlists", tags=["Playlists"])


@router.get("", response_model=List[PlaylistRead])
def list_playlists(db: Session = Depends(get_db)):
    """Retrieve all user playlists with song count."""
    playlists = db.query(Playlist).order_by(desc(Playlist.created_at)).all()
    results = []
    for p in playlists:
        count = db.query(PlaylistSong).filter(PlaylistSong.playlist_id == p.id).count()
        results.append(
            PlaylistRead(
                id=p.id,
                name=p.name,
                description=p.description or "",
                created_at=p.created_at,
                song_count=count,
                songs=[],
            )
        )
    return results


@router.post("", response_model=PlaylistRead, status_code=status.HTTP_201_CREATED)
def create_playlist(payload: PlaylistCreate, db: Session = Depends(get_db)):
    """Create a new playlist."""
    playlist = Playlist(name=payload.name, description=payload.description or "")
    db.add(playlist)
    db.commit()
    db.refresh(playlist)
    return PlaylistRead(
        id=playlist.id,
        name=playlist.name,
        description=playlist.description or "",
        created_at=playlist.created_at,
        song_count=0,
        songs=[],
    )


@router.get("/{playlist_id}", response_model=PlaylistRead)
def get_playlist(playlist_id: int, db: Session = Depends(get_db)):
    """Retrieve a playlist and its ordered tracks."""
    playlist = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")

    ps_records = (
        db.query(PlaylistSong)
        .filter(PlaylistSong.playlist_id == playlist_id)
        .order_by(PlaylistSong.position.asc())
        .all()
    )
    song_ids = [ps.song_id for ps in ps_records]

    songs_map = {}
    if song_ids:
        songs = db.query(Song).filter(Song.id.in_(song_ids)).all()
        songs_map = {s.id: SongRead.model_validate(s) for s in songs}

    ordered_songs = [songs_map[sid] for sid in song_ids if sid in songs_map]

    return PlaylistRead(
        id=playlist.id,
        name=playlist.name,
        description=playlist.description or "",
        created_at=playlist.created_at,
        song_count=len(ordered_songs),
        songs=ordered_songs,
    )


@router.post("/{playlist_id}/songs/{song_id}", status_code=status.HTTP_201_CREATED)
def add_song_to_playlist(playlist_id: int, song_id: str, db: Session = Depends(get_db)):
    """Add a song to a playlist."""
    playlist = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")

    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    max_pos = (
        db.query(PlaylistSong.position)
        .filter(PlaylistSong.playlist_id == playlist_id)
        .order_by(desc(PlaylistSong.position))
        .first()
    )
    next_pos = (max_pos[0] + 1) if max_pos else 0

    ps = PlaylistSong(playlist_id=playlist_id, song_id=song_id, position=next_pos)
    db.add(ps)
    db.commit()
    return {"status": "success", "playlist_id": playlist_id, "song_id": song_id}


@router.delete("/{playlist_id}/songs/{song_id}", status_code=status.HTTP_200_OK)
def remove_song_from_playlist(playlist_id: int, song_id: str, db: Session = Depends(get_db)):
    """Remove a song from a playlist."""
    ps = (
        db.query(PlaylistSong)
        .filter(PlaylistSong.playlist_id == playlist_id, PlaylistSong.song_id == song_id)
        .first()
    )
    if ps:
        db.delete(ps)
        db.commit()
    return {"status": "success", "playlist_id": playlist_id, "song_id": song_id}


@router.delete("/{playlist_id}", status_code=status.HTTP_200_OK)
def delete_playlist(playlist_id: int, db: Session = Depends(get_db)):
    """Delete a playlist and all its associations."""
    playlist = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")

    db.query(PlaylistSong).filter(PlaylistSong.playlist_id == playlist_id).delete()
    db.delete(playlist)
    db.commit()
    return {"status": "deleted", "playlist_id": playlist_id}
