"""
Metadata feature extraction pipeline.

Extracts TF-IDF text representations, one-hot encodes categorical metadata,
and normalizes numeric features (release year, play count) into a single
sparse feature matrix for content-based similarity.

Precomputed and cached to backend/models/song_features.pkl via joblib.
"""
import os
import re
import logging
from typing import Optional, Dict, Any, List, Tuple
import numpy as np
from scipy import sparse
from sklearn.feature_extraction.text import TfidfVectorizer, ENGLISH_STOP_WORDS
from sklearn.preprocessing import OneHotEncoder, MinMaxScaler
import joblib

from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.song import Song

logger = logging.getLogger(__name__)

MUSIC_STOP_WORDS = {
    "pagalworld", "pagalnew", "pagalsongs", "official", "video", "audio",
    "song", "songs", "full", "lyrics", "lyrical", "remix", "single", "feat",
    "ft", "mp3", "tseries", "t-series", "vevo", "topic", "hd", "4k", "teaser",
    "promo", "ost", "soundtrack", "clean", "edit", "version", "download",
    "com", "net", "org", "ringtone", "status", "bgm", "www", "free"
}
COMBINED_STOP_WORDS = list(ENGLISH_STOP_WORDS.union(MUSIC_STOP_WORDS))


def clean_music_text(text: str) -> str:
    """Strip bracketed IDs, rip domains, and symbols from song metadata text."""
    if not text:
        return ""
    t = re.sub(r"\[[^\]]*\]|\([^\)]*\)", " ", text.lower())
    t = re.sub(r"[_\-\|\/\\\:\;\,\.\'\"\`\(\)\[\]]", " ", t)
    tokens = [w for w in t.split() if len(w) > 1 and w not in MUSIC_STOP_WORDS]
    return " ".join(tokens)


BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CACHE_DIR = os.path.join(BASE_DIR, "models")
CACHE_FILE = os.path.join(CACHE_DIR, "song_features.pkl")

# Global in-memory cache reference so we don't repeatedly unpickle on every request
_MEMORY_FEATURE_CACHE: Optional[Dict[str, Any]] = None


def get_cache_path() -> str:
    os.makedirs(CACHE_DIR, exist_ok=True)
    return CACHE_FILE


def rebuild_feature_matrix(db: Optional[Session] = None) -> Dict[str, Any]:
    """
    Pulls all active songs from SQLite, constructs the TF-IDF, categorical,
    and normalized numerical feature representations, concatenates them into
    a unified CSR matrix, and persists it to disk via joblib.
    """
    global _MEMORY_FEATURE_CACHE
    should_close = False
    if db is None:
        db = SessionLocal()
        should_close = True

    try:
        songs: List[Song] = (
            db.query(Song)
            .filter(Song.is_active == True)
            .order_by(Song.id.asc())
            .all()
        )

        if not songs:
            logger.warning("No active songs found in database to build features.")
            empty_data = {
                "matrix": sparse.csr_matrix((0, 0)),
                "song_ids": [],
                "id_to_idx": {},
                "tfidf": None,
                "ohe": None,
                "scaler": None,
            }
            _MEMORY_FEATURE_CACHE = empty_data
            return empty_data

        song_ids = [s.id for s in songs]
        id_to_idx = {sid: i for i, sid in enumerate(song_ids)}


        # 1. Text feature vectorization (Title + Artist + Album + Genre + Mood + Language)
        text_corpus = [
            clean_music_text(f"{s.title or ''} {s.artist or ''} {s.album or ''} {s.genre or ''} {s.mood or ''} {s.language or ''}")
            for s in songs
        ]
        tfidf = TfidfVectorizer(
            max_features=600,
            stop_words=COMBINED_STOP_WORDS,
            token_pattern=r"(?u)\b[\w-]+\b",
            ngram_range=(1, 2),
        )
        text_features = tfidf.fit_transform(text_corpus)

        # 2. One-hot encoding for categorical fields (genre, language, mood, country)
        cat_data = [
            [
                s.genre or "Unknown",
                s.language or "Unknown",
                s.mood or "Unknown",
                s.country or "Unknown",
            ]
            for s in songs
        ]
        ohe = OneHotEncoder(handle_unknown="ignore", sparse_output=True)
        cat_features = ohe.fit_transform(cat_data)

        # 3. Numeric normalization (release_year, play_count)
        num_data = np.array([
            [
                float(s.release_year) if s.release_year else 2020.0,
                float(s.play_count) if s.play_count else 0.0,
            ]
            for s in songs
        ])
        scaler = MinMaxScaler()
        num_scaled = scaler.fit_transform(num_data)
        num_features = sparse.csr_matrix(num_scaled)

        # 4. Concatenate into unified sparse feature matrix
        # Text weight 1.0, categorical weight 1.2, numerical weight 0.5
        feature_matrix = sparse.hstack([
            text_features,
            cat_features * 1.2,
            num_features * 0.5,
        ]).tocsr()

        cache_data = {
            "matrix": feature_matrix,
            "song_ids": song_ids,
            "id_to_idx": id_to_idx,
            "tfidf": tfidf,
            "ohe": ohe,
            "scaler": scaler,
        }

        # Cache to disk
        cache_path = get_cache_path()
        joblib.dump(cache_data, cache_path)
        logger.info(
            "Precomputed feature matrix saved to %s (shape: %s)",
            cache_path,
            feature_matrix.shape,
        )

        _MEMORY_FEATURE_CACHE = cache_data
        return cache_data
    finally:
        if should_close:
            db.close()


def get_feature_matrix(db: Optional[Session] = None) -> Dict[str, Any]:
    """
    Returns the feature matrix, loading from in-memory cache or disk if available,
    or rebuilding if the cache does not exist yet or if catalog count differs.
    """
    global _MEMORY_FEATURE_CACHE
    if _MEMORY_FEATURE_CACHE is not None:
        if db is not None:
            active_count = db.query(Song).filter(Song.is_active == True).count()
            if len(_MEMORY_FEATURE_CACHE.get("song_ids", [])) == active_count and active_count > 0:
                return _MEMORY_FEATURE_CACHE
        else:
            return _MEMORY_FEATURE_CACHE

    cache_path = get_cache_path()
    if os.path.exists(cache_path):
        try:
            data = joblib.load(cache_path)
            if (
                isinstance(data, dict)
                and "matrix" in data
                and "song_ids" in data
                and "id_to_idx" in data
            ):
                if db is not None:
                    active_count = db.query(Song).filter(Song.is_active == True).count()
                    if len(data["song_ids"]) == active_count:
                        _MEMORY_FEATURE_CACHE = data
                        return data
                else:
                    _MEMORY_FEATURE_CACHE = data
                    return data
        except Exception as exc:
            logger.warning("Failed to load cached feature matrix: %s. Rebuilding.", exc)

    return rebuild_feature_matrix(db)

