"""
User preference profile service.

Calculates time-decayed, behavioral-weighted preference scores across
genres, languages, moods, and artists based on real listening_history
and favorites stored in SQLite.

Behavioral weighting:
  Liked > Completed > Multiple plays > Single play; Skipped = negative weight.
Time decay:
  Exponential decay giving higher weight to recent playback events.
"""
import math
import json
from datetime import datetime, timezone, timedelta
from typing import Dict, Any
from sqlalchemy.orm import Session

from app.models.history import ListeningHistory
from app.models.favorite import Favorite
from app.models.song import Song
from app.models.preference import UserPreference


IGNORE_ARTIST_TOKENS = {"t-series", "tseries", "single", "various artists", "unknown", "topic", "vevo"}


def split_artists(artist_str: str) -> list[str]:
    """Extract distinct singers and producers from composite artist strings."""
    if not artist_str:
        return []
    import re
    raw_parts = re.split(r",|\s+&\s+|\s+feat\.?\s+|\s+ft\.?\s+", artist_str, flags=re.IGNORECASE)
    parts = []
    for p in raw_parts:
        c = p.strip()
        if c and len(c) > 1 and c.lower() not in IGNORE_ARTIST_TOKENS:
            parts.append(c)
    if artist_str.strip() and artist_str.strip().lower() not in IGNORE_ARTIST_TOKENS:
        parts.append(artist_str.strip())
    return list(dict.fromkeys(parts))


def normalize_scores(scores: Dict[str, float]) -> Dict[str, float]:
    """
    Normalize raw aggregated scores into [0.0, 1.0] range.
    Clamps negative values (from skips) to 0.0.
    """
    if not scores:
        return {}

    clamped = {k: max(0.0, v) for k, v in scores.items() if v is not None}
    max_val = max(clamped.values()) if clamped else 0.0

    if max_val <= 0.0:
        return {k: 0.0 for k in clamped}

    return {k: round(v / max_val, 4) for k, v in clamped.items()}


def build_user_profile(db: Session, days: int = 10) -> Dict[str, Any]:
    """
    Reads listening_history rows from the last `days` days, applies time-decay
    and behavioral weights, aggregates preference by genre/language/mood/artist,
    and updates the single UserPreference row in the database.
    """
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days)

    # Fetch recent history
    events = (
        db.query(ListeningHistory)
        .filter(ListeningHistory.played_at >= cutoff)
        .all()
    )

    # If recent history is sparse, include older history up to 30 days
    if len(events) < 5:
        cutoff_fallback = now - timedelta(days=30)
        events = (
            db.query(ListeningHistory)
            .filter(ListeningHistory.played_at >= cutoff_fallback)
            .all()
        )

    # Collect song IDs needed for lookup
    song_ids = {e.song_id for e in events}
    favorites = db.query(Favorite).all()
    for fav in favorites:
        song_ids.add(fav.song_id)

    songs_by_id = {}
    if song_ids:
        songs = db.query(Song).filter(Song.id.in_(song_ids)).all()
        songs_by_id = {s.id: s for s in songs}

    genre_raw: Dict[str, float] = {}
    lang_raw: Dict[str, float] = {}
    mood_raw: Dict[str, float] = {}
    artist_raw: Dict[str, float] = {}

    # 1. Process listening history events
    for event in events:
        song = songs_by_id.get(event.song_id)
        if not song:
            continue

        # Time decay: exponential decay with ~5 day half-life (decay rate ~0.14)
        played_at = event.played_at
        if played_at.tzinfo is None:
            played_at = played_at.replace(tzinfo=timezone.utc)
        age_days = max(0.0, (now - played_at).total_seconds() / 86400.0)
        time_decay = math.exp(-0.14 * age_days)

        # Behavioral weight
        # liked > completed > multiple plays > single play; skipped = negative weight
        if event.skipped:
            action_weight = -1.0
        elif event.liked_at_play_time:
            action_weight = 3.0
        elif event.completed:
            action_weight = 2.0
        else:
            # Single play
            action_weight = 1.0

        effective_weight = time_decay * action_weight

        if song.genre:
            genre_raw[song.genre] = genre_raw.get(song.genre, 0.0) + effective_weight
        if song.language:
            lang_raw[song.language] = lang_raw.get(song.language, 0.0) + effective_weight
        if song.mood:
            mood_raw[song.mood] = mood_raw.get(song.mood, 0.0) + effective_weight
        if song.artist:
            for art in split_artists(song.artist):
                artist_raw[art] = artist_raw.get(art, 0.0) + effective_weight

    # 2. Add liked songs (persistent positive signal, weight 2.5)
    for fav in favorites:
        song = songs_by_id.get(fav.song_id)
        if not song:
            continue
        fav_weight = 2.5
        if song.genre:
            genre_raw[song.genre] = genre_raw.get(song.genre, 0.0) + fav_weight
        if song.language:
            lang_raw[song.language] = lang_raw.get(song.language, 0.0) + fav_weight
        if song.mood:
            mood_raw[song.mood] = mood_raw.get(song.mood, 0.0) + fav_weight
        if song.artist:
            for art in split_artists(song.artist):
                artist_raw[art] = artist_raw.get(art, 0.0) + fav_weight

    # 3. Normalize each dimension to [0, 1]
    genre_scores = normalize_scores(genre_raw)
    lang_scores = normalize_scores(lang_raw)
    mood_scores = normalize_scores(mood_raw)
    artist_scores = normalize_scores(artist_raw)

    profile_data = {
        "genre_scores": genre_scores,
        "language_scores": lang_scores,
        "mood_scores": mood_scores,
        "artist_scores": artist_scores,
    }

    # 4. Persist to user_preferences table (single row)
    pref = db.query(UserPreference).first()
    if not pref:
        pref = UserPreference(
            genre_scores=json.dumps(genre_scores),
            language_scores=json.dumps(lang_scores),
            mood_scores=json.dumps(mood_scores),
            artist_scores=json.dumps(artist_scores),
        )
        db.add(pref)
    else:
        pref.genre_scores = json.dumps(genre_scores)
        pref.language_scores = json.dumps(lang_scores)
        pref.mood_scores = json.dumps(mood_scores)
        pref.artist_scores = json.dumps(artist_scores)
        pref.updated_at = now

    db.commit()
    db.refresh(pref)

    return profile_data


def get_user_preferences(db: Session) -> Dict[str, Dict[str, float]]:
    """
    Retrieve current persisted user preferences or build fresh if not found.
    """
    pref = db.query(UserPreference).first()
    if not pref:
        return build_user_profile(db)

    try:
        return {
            "genre_scores": json.loads(pref.genre_scores or "{}"),
            "language_scores": json.loads(pref.language_scores or "{}"),
            "mood_scores": json.loads(pref.mood_scores or "{}"),
            "artist_scores": json.loads(pref.artist_scores or "{}"),
        }
    except Exception:
        return build_user_profile(db)


def update_user_preferences(db: Session) -> Dict[str, Any]:
    """
    Fast update called after new history rows or favorites are added.
    Lightweight, linear scan over recent events without full model retrain.
    """
    return build_user_profile(db, days=10)
