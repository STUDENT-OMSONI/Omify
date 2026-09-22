"""
Router for Songs, Search, Artists, Albums, and Taxonomy metadata.
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from app.database import get_db
from app.models.song import Song
from app.schemas.song import SongRead, SongListResponse, ArtistSummary, AlbumSummary

router = APIRouter(prefix="/api", tags=["Songs"])


@router.get("/songs", response_model=SongListResponse)
def list_songs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    genre: Optional[str] = None,
    language: Optional[str] = None,
    mood: Optional[str] = None,
    artist: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Retrieve paginated list of songs with optional filters."""
    query = db.query(Song).filter(Song.is_active == True)

    if genre:
        query = query.filter(Song.genre == genre)
    if language:
        query = query.filter(Song.language == language)
    if mood:
        query = query.filter(Song.mood == mood)
    if artist:
        query = query.filter(Song.artist == artist)

    total = query.count()
    songs = query.order_by(Song.id.asc()).offset(skip).limit(limit).all()

    return {"total": total, "items": songs}


@router.get("/search")
def search_catalog(
    q: str = Query("", description="Search term for songs, artists, and albums"),
    limit: int = Query(30, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Search active songs, artists, and albums matching the query string."""
    q_term = (q or "").strip()
    if not q_term:
        return {"songs": [], "artists": [], "albums": []}

    like_pat = f"%{q_term}%"

    # Search songs
    matched_songs = (
        db.query(Song)
        .filter(
            Song.is_active == True,
            (Song.title.ilike(like_pat)) | (Song.artist.ilike(like_pat)) | (Song.album.ilike(like_pat)),
        )
        .limit(limit)
        .all()
    )

    # Distinct matching artists
    artist_rows = (
        db.query(Song.artist, func.count(Song.id).label("song_count"), func.max(Song.album_art).label("art"))
        .filter(Song.is_active == True, Song.artist.ilike(like_pat))
        .group_by(Song.artist)
        .limit(10)
        .all()
    )
    artists = [
        {"name": a[0], "song_count": a[1], "sample_art": a[2]}
        for a in artist_rows
    ]

    # Distinct matching albums
    album_rows = (
        db.query(Song.album, Song.artist, func.count(Song.id).label("song_count"), func.max(Song.album_art).label("art"), func.max(Song.release_year).label("year"))
        .filter(Song.is_active == True, Song.album.ilike(like_pat))
        .group_by(Song.album, Song.artist)
        .limit(10)
        .all()
    )
    albums = [
        {"title": al[0], "artist": al[1], "song_count": al[2], "album_art": al[3], "release_year": al[4]}
        for al in album_rows
    ]

    return {
        "songs": [SongRead.model_validate(s) for s in matched_songs],
        "artists": artists,
        "albums": albums,
    }


@router.get("/songs/{song_id}", response_model=SongRead)
def get_song(song_id: str, db: Session = Depends(get_db)):
    """Retrieve details of a specific song."""
    song = db.query(Song).filter(Song.id == song_id, Song.is_active == True).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    return song


@router.get("/artists", response_model=List[ArtistSummary])
def get_artists(limit: int = Query(50, ge=1, le=200), db: Session = Depends(get_db)):
    """Retrieve distinct artists sorted by catalog song count."""
    rows = (
        db.query(
            Song.artist,
            func.max(Song.country).label("country"),
            func.count(Song.id).label("song_count"),
            func.max(Song.album_art).label("sample_art"),
        )
        .filter(Song.is_active == True)
        .group_by(Song.artist)
        .order_by(desc("song_count"))
        .limit(limit)
        .all()
    )
    return [
        {"name": r[0], "country": r[1], "song_count": r[2], "sample_art": r[3]}
        for r in rows
    ]


@router.get("/albums", response_model=List[AlbumSummary])
def get_albums(limit: int = Query(50, ge=1, le=200), db: Session = Depends(get_db)):
    """Retrieve distinct albums sorted by release year descending."""
    rows = (
        db.query(
            Song.album,
            Song.artist,
            func.max(Song.release_year).label("release_year"),
            func.count(Song.id).label("song_count"),
            func.max(Song.album_art).label("album_art"),
        )
        .filter(Song.is_active == True, Song.album.isnot(None), Song.album != "")
        .group_by(Song.album, Song.artist)
        .order_by(desc("release_year"), desc("song_count"))
        .limit(limit)
        .all()
    )
    return [
        {
            "title": r[0],
            "artist": r[1],
            "release_year": r[2],
            "song_count": r[3],
            "album_art": r[4],
        }
        for r in rows
    ]


@router.get("/genres", response_model=List[dict])
def get_genres(db: Session = Depends(get_db)):
    """Retrieve list of distinct genres with song counts."""
    rows = (
        db.query(Song.genre, func.count(Song.id).label("cnt"))
        .filter(Song.is_active == True, Song.genre.isnot(None), Song.genre != "")
        .group_by(Song.genre)
        .order_by(desc("cnt"))
        .all()
    )
    return [{"name": r[0], "song_count": r[1]} for r in rows]


@router.get("/languages", response_model=List[dict])
def get_languages(db: Session = Depends(get_db)):
    """Retrieve list of distinct languages with song counts."""
    rows = (
        db.query(Song.language, func.count(Song.id).label("cnt"))
        .filter(Song.is_active == True, Song.language.isnot(None), Song.language != "")
        .group_by(Song.language)
        .order_by(desc("cnt"))
        .all()
    )
    return [{"name": r[0], "song_count": r[1]} for r in rows]


@router.get("/moods", response_model=List[dict])
def get_moods(db: Session = Depends(get_db)):
    """Retrieve list of distinct moods with song counts."""
    rows = (
        db.query(Song.mood, func.count(Song.id).label("cnt"))
        .filter(Song.is_active == True, Song.mood.isnot(None), Song.mood != "")
        .group_by(Song.mood)
        .order_by(desc("cnt"))
        .all()
    )
    return [{"name": r[0], "song_count": r[1]} for r in rows]
