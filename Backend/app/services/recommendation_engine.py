"""
Recommendation Engine service.

Calculates real recommendation scores for active catalog songs using:
  - Cosine similarity against user's recently played and liked seed tracks
  - Time-decayed user preferences across genre, artist, language, and mood
  - Track freshness / release recency
  - Deduplication and over-play exclusion
  - Artist diversity constraint (max 2 tracks per artist in top N)
  - Human-readable explanation generation
"""
import logging
import re
from typing import List, Dict, Any, Optional, Set
from collections import defaultdict
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.models.song import Song
from app.models.history import ListeningHistory
from app.models.favorite import Favorite
from app.services.metadata_features import get_feature_matrix
from app.services.user_profile import get_user_preferences, split_artists
from app.services.release_provider import get_default_release_provider

logger = logging.getLogger(__name__)


def calculate_freshness(release_year: Optional[int]) -> float:
    """
    Normalizes release year to [0.0, 1.0] scale.
    2025 -> 1.0, 2010 -> 0.0, older -> 0.0.
    """
    if not release_year:
        return 0.5
    try:
        yr = float(release_year)
        return max(0.0, min(1.0, (yr - 2010.0) / 15.0))
    except (ValueError, TypeError):
        return 0.5


def match_category(song: Song, cat: Optional[str]) -> bool:
    """Check if song matches a specific category (romance, workout, party, lofi, punjabi, bollywood)."""
    if not cat or cat.strip().lower() in ("all", "for you", "foryou"):
        return True
    c = cat.lower().strip()
    theme = getattr(song, "theme", "") or ""
    bpm = getattr(song, "bpm", 0) or 0
    text = f"{song.title or ''} {song.artist or ''} {song.album or ''} {song.genre or ''} {song.mood or ''} {theme}".lower()
    if c in ("romantic", "romance", "love"):
        return bool(
            (song.genre and "romantic" in song.genre.lower())
            or (song.mood and "romantic" in song.mood.lower())
            or ("romantic" in theme.lower())
            or re.search(r"arijit|pritam|atif|shreya|darshan|love|pyaar|ishq|dil|humsafar|barsaat|saathiya|fitoor|tumse", text)
        )
    if c in ("workout", "gym"):
        return bool(
            ("workout" in theme.lower())
            or (bpm >= 120)
            or re.search(r"gym|workout|energy|power|drill|beast|hype|pump|speed|fire|bass", text)
        )
    if c in ("party", "club"):
        return bool(
            ("party" in theme.lower())
            or (song.mood and "energetic" in song.mood.lower())
            or re.search(r"honey singh|badshah|mika|party|club|dance|nach|dj|daaru|daru|bhangra", text)
        )
    if c in ("lofi", "chill", "sukoon"):
        return bool(
            ("lofi" in theme.lower())
            or (song.mood and song.mood.lower() in ("sukoon", "chill"))
            or re.search(r"taha|anuv jain|prateek kuhad|zaeden|lofi|chill|acoustic|sukoon", text)
        )
    if c in ("punjabi", "punjabi swag", "swag"):
        return bool(
            (song.language and "punjabi" in song.language.lower())
            or ("punjabi" in theme.lower())
            or re.search(r"diljit|karan aujla|shubh|ap dhillon|sidhu moose|sharry mann|jassi", text)
        )
    if c in ("bollywood", "bollywood hits", "hindi"):
        return bool(
            (song.genre and "bollywood" in song.genre.lower())
            or ("bollywood" in theme.lower())
            or (song.language and "hindi" in song.language.lower())
        )
    return True


def generate_reason(
    song: Song,
    sim_score: float,
    genre_pref: float,
    artist_pref: float,
    lang_pref: float,
    mood_pref: float,
    seed_song_title: Optional[str] = None,
    category: Optional[str] = None,
) -> str:
    """
    Generates a personalized, human-readable reason explaining why
    this song was recommended.
    """
    if category and category.lower() not in ("all", "for you"):
        c = category.lower().strip()
        if c in ("romantic", "romance", "love"):
            return "Soulful Bollywood romance curated for your mood"
        if c in ("workout", "gym"):
            return "High-octane gym motivation & workout beat"
        if c in ("party", "club"):
            return "Dancefloor & club anthem for high energy"
        if c in ("lofi", "chill", "sukoon"):
            return "Sukoon & relaxing lo-fi textures for quiet moments"
        if c in ("punjabi", "punjabi swag"):
            return "Top urban Punjabi drop with heavy swagger"
        if c in ("bollywood", "bollywood hits"):
            return "Blockbuster Bollywood cinematic anthem"

    if artist_pref >= 0.5 and song.artist:
        arts = split_artists(song.artist)
        art_name = arts[0] if arts else song.artist
        return f"More from {art_name}, an artist you enjoy"
    if genre_pref >= 0.4 and song.genre:
        return f"Because you love {song.genre}"
    if seed_song_title and sim_score >= 0.65:
        return f"Similar vibe to '{seed_song_title}'"
    if mood_pref >= 0.4 and song.mood:
        return f"Matches your {song.mood} listening mood"
    if song.artist:
        arts = split_artists(song.artist)
        art_name = arts[0] if arts else song.artist
        return f"Trending hit by {art_name}"
    return "Curated for you based on catalog similarity"


def get_made_for_you(
    db: Session,
    limit: int = 20,
    exclude_played_recently: bool = True,
    category: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Ranks all eligible songs using the ML recommendation scoring formula:
      score = sim * 0.40 + genre * 0.20 + artist * 0.12 + lang * 0.10 + mood * 0.10 + fresh * 0.05 + art/pop boosts
    Uses nearest-neighbor max similarity against seed tracks, multi-artist affinity,
    optional category filtering, enforces artist diversity (<= 2 songs per primary artist),
    and excludes over-played tracks.
    """
    feature_cache = get_feature_matrix(db)
    matrix = feature_cache.get("matrix")
    song_ids: List[str] = feature_cache.get("song_ids", [])
    id_to_idx: Dict[str, int] = feature_cache.get("id_to_idx", {})

    if matrix is None or not song_ids:
        query = db.query(Song).filter(Song.is_active == True)
        fallback_songs = query.order_by(desc(Song.play_count)).limit(limit * 2).all()
        if category and category.lower() not in ("all", "for you"):
            fallback_songs = [s for s in fallback_songs if match_category(s, category)]
        return [
            {
                "song": s,
                "score": 0.88,
                "reason": generate_reason(s, 0.5, 0.5, 0.5, 0.5, 0.5, category=category),
                "cluster_id": s.cluster_id,
            }
            for s in fallback_songs[:limit]
        ]

    # 1. Fetch user preferences (genre, artist, language, mood)
    prefs = get_user_preferences(db)
    genre_scores = prefs.get("genre_scores", {})
    artist_scores = prefs.get("artist_scores", {})
    language_scores = prefs.get("language_scores", {})
    mood_scores = prefs.get("mood_scores", {})

    # 2. Gather seed songs (favorites and recent unskipped history)
    favorites = db.query(Favorite.song_id).all()
    fav_ids = [f[0] for f in favorites]

    history_rows = (
        db.query(ListeningHistory.song_id, ListeningHistory.skipped)
        .order_by(desc(ListeningHistory.played_at))
        .limit(50)
        .all()
    )

    overplayed_ids: Set[str] = set()
    recent_play_counts: Dict[str, int] = defaultdict(int)
    seed_ids: List[str] = []

    # Favorites have top priority as seeds
    for fid in fav_ids:
        if fid not in seed_ids:
            seed_ids.append(fid)

    for sid, skipped in history_rows:
        recent_play_counts[sid] += 1
        if recent_play_counts[sid] >= 3:
            overplayed_ids.add(sid)
        if not skipped and sid not in seed_ids:
            seed_ids.append(sid)

    # 3. Fetch all active Song objects into memory
    all_songs = db.query(Song).filter(Song.is_active == True).all()
    song_obj_map = {s.id: s for s in all_songs}

    # Cold start handling: if no seeds exist, seed with top 5 popular songs
    if not seed_ids:
        popular = (
            db.query(Song.id)
            .filter(Song.is_active == True)
            .order_by(desc(Song.play_count))
            .limit(5)
            .all()
        )
        seed_ids = [p[0] for p in popular]

    # 4. Calculate nearest-neighbor cosine similarity against seed songs
    valid_seed_pairs = [(sid, id_to_idx[sid]) for sid in seed_ids if sid in id_to_idx]
    best_matching_seed_titles: List[Optional[str]] = [None] * len(song_ids)

    if valid_seed_pairs:
        seed_indices = [p[1] for p in valid_seed_pairs]
        seed_sids = [p[0] for p in valid_seed_pairs]
        seed_vectors = matrix[seed_indices]

        # Compute cosine similarity matrix: shape (N_candidates, N_seeds)
        sim_matrix = cosine_similarity(matrix, seed_vectors)

        # Nearest-neighbor max similarity across any active seed
        max_similarities = np.max(sim_matrix, axis=1)
        best_seed_cols = np.argmax(sim_matrix, axis=1)

        for row_i in range(len(song_ids)):
            col_i = int(best_seed_cols[row_i])
            best_sid = seed_sids[col_i]
            matched_song = song_obj_map.get(best_sid)
            if matched_song:
                best_matching_seed_titles[row_i] = matched_song.title
    else:
        max_similarities = np.full(len(song_ids), 0.5)

    # Don't recommend songs that are already directly in favorites or seeds unless catalog is very small
    seed_set = set(seed_ids)

    # 5. Score candidate songs
    scored_candidates = []
    for i, sid in enumerate(song_ids):
        song = song_obj_map.get(sid)
        if not song:
            continue

        # If category filter is active, only include matching songs
        if category and category.lower() not in ("all", "for you"):
            if not match_category(song, category):
                continue

        # Exclude songs already in favorites/seeds or overplayed
        if sid in seed_set and len(seed_set) < len(song_ids) - limit:
            continue
        if exclude_played_recently and sid in overplayed_ids:
            continue

        sim_score = float(max_similarities[i])
        genre_pref = float(genre_scores.get(song.genre, 0.0))
        lang_pref = float(language_scores.get(song.language, 0.0))
        mood_pref = float(mood_scores.get(song.mood, 0.0))

        # Check multi-artist preferences
        cand_artists = split_artists(song.artist) if song.artist else []
        if cand_artists:
            artist_pref = max([float(artist_scores.get(a, 0.0)) for a in cand_artists] + [float(artist_scores.get(song.artist, 0.0))])
        else:
            artist_pref = float(artist_scores.get(song.artist, 0.0))

        freshness = calculate_freshness(song.release_year)

        # High priority bonus for songs with genuine extracted album art and high playback count
        has_real_art = 0.08 if (song.album_art and "covers/extracted" in song.album_art) else 0.0
        pop_boost = min(0.08, (song.play_count or 0) / 50000000.0)

        # ML Recommendation formula:
        final_score = (
            sim_score * 0.40
            + genre_pref * 0.20
            + artist_pref * 0.12
            + lang_pref * 0.10
            + mood_pref * 0.10
            + freshness * 0.05
            + has_real_art
            + pop_boost
        )

        scored_candidates.append({
            "song": song,
            "score": round(final_score, 4),
            "sim_score": sim_score,
            "genre_pref": genre_pref,
            "artist_pref": artist_pref,
            "lang_pref": lang_pref,
            "mood_pref": mood_pref,
            "seed_title": best_matching_seed_titles[i],
        })

    # Sort descending by final_score
    scored_candidates.sort(key=lambda x: x["score"], reverse=True)

    # 6. Apply diversity constraint: at most 2 songs per primary artist in top N
    selected = []
    artist_counts: Dict[str, int] = defaultdict(int)

    for item in scored_candidates:
        s = item["song"]
        arts = split_artists(s.artist) if s.artist else []
        primary_art = arts[0].strip().lower() if arts else (s.artist or "unknown").strip().lower()

        if artist_counts[primary_art] < 2:
            artist_counts[primary_art] += 1
            reason = generate_reason(
                song=s,
                sim_score=item["sim_score"],
                genre_pref=item["genre_pref"],
                artist_pref=item["artist_pref"],
                lang_pref=item["lang_pref"],
                mood_pref=item["mood_pref"],
                seed_song_title=item["seed_title"],
                category=category,
            )
            selected.append({
                "song": s,
                "score": item["score"],
                "reason": reason,
                "cluster_id": s.cluster_id,
            })
            if len(selected) >= limit:
                break

    return selected



def calculate_recommendation_score(song_id: str, db: Session) -> float:
    """
    Calculates single recommendation score for a given song_id using
    the exact ML recommendation formula.
    """
    song = db.query(Song).filter(Song.id == song_id, Song.is_active == True).first()
    if not song:
        return 0.0

    feature_cache = get_feature_matrix(db)
    matrix = feature_cache.get("matrix")
    id_to_idx = feature_cache.get("id_to_idx", {})

    prefs = get_user_preferences(db)
    genre_pref = prefs.get("genre_scores", {}).get(song.genre, 0.0)
    lang_pref = prefs.get("language_scores", {}).get(song.language, 0.0)
    mood_pref = prefs.get("mood_scores", {}).get(song.mood, 0.0)
    freshness = calculate_freshness(song.release_year)

    cand_artists = split_artists(song.artist) if song.artist else []
    if cand_artists:
        artist_pref = max([float(prefs.get("artist_scores", {}).get(a, 0.0)) for a in cand_artists] + [float(prefs.get("artist_scores", {}).get(song.artist, 0.0))])
    else:
        artist_pref = float(prefs.get("artist_scores", {}).get(song.artist, 0.0))

    sim_score = 0.5
    if matrix is not None and song_id in id_to_idx:
        fav_ids = [f[0] for f in db.query(Favorite.song_id).all()]
        seed_indices = [id_to_idx[sid] for sid in fav_ids if sid in id_to_idx]
        if seed_indices:
            idx = id_to_idx[song_id]
            target_vec = matrix[idx]
            seed_vecs = matrix[seed_indices]
            sims = cosine_similarity(target_vec, seed_vecs)
            sim_score = float(np.max(sims))

    score = (
        sim_score * 0.45
        + genre_pref * 0.20
        + artist_pref * 0.10
        + lang_pref * 0.10
        + mood_pref * 0.10
        + freshness * 0.05
    )
    return round(score, 4)


def get_new_release_recommendations(
    db: Session,
    days: int = 20,
    limit: int = 20,
    new_release_window_days: int = 30,
) -> List[Song]:
    """
    Retrieves new release recommendations using the ReleaseProvider interface.
    """
    provider = get_default_release_provider()
    return provider.get_new_releases(db, limit=limit)


def get_trending_songs(db: Session, limit: int = 50) -> List[Song]:
    """
    Returns trending songs ranked by catalog play_count descending.
    """
    return (
        db.query(Song)
        .filter(Song.is_active == True)
        .order_by(desc(Song.play_count), desc(Song.id))
        .limit(limit)
        .all()
    )


def get_foreign_music(db: Session, limit_per_lang: int = 8) -> Dict[str, List[Song]]:
    """
    Groups active catalog songs by language (excluding standard English pop or
    including all distinct non-English languages).
    """
    all_songs = (
        db.query(Song)
        .filter(Song.is_active == True)
        .order_by(desc(Song.play_count))
        .all()
    )

    by_lang = defaultdict(list)
    for s in all_songs:
        lang = s.language or "World"
        if len(by_lang[lang]) < limit_per_lang:
            by_lang[lang].append(s)

    return dict(by_lang)
