r"""
Imports song metadata from the existing frontend catalog files into
the SQLite database. Safe to re-run — upserts by song id, never
duplicates.

Handles catalog imports from data/songs.js:
  `const SONGS = [ {...}, {...} ];`               (root data/songs.js)

Usage:
    cd Backend
    .\venv\Scripts\python.exe scripts\import_songs.py --file ..\data\songs.js
"""
import argparse
import json
import re
import sys
import os
import hashlib

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal, init_db
from app.models.song import Song
from app.models.favorite import Favorite
from app.services.user_profile import build_user_profile



def slugify(text: str) -> str:
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", (text or "").lower()))


def extract_song_array(js_text: str) -> list[dict]:
    """Case 1: a literal `const SONGS = [ {...}, ... ];` array."""
    match = re.search(r"const\s+SONGS\s*=\s*(\[.*?\]);", js_text, re.DOTALL)
    if not match:
        return None
    raw = re.sub(r",\s*([\]}])", r"\1", match.group(1))
    return json.loads(raw)


def extract_raw_tracks(js_text: str) -> list[dict]:
    """
    Case 2: `const RAW_TRACKS = [ [title, artist, album, language,
    genre, country, releaseYear, mood, playCount, durationSeed], ... ];`
    """
    match = re.search(r"const\s+RAW_TRACKS\s*=\s*(\[.*?\]);", js_text, re.DOTALL)
    if not match:
        return None
    raw = re.sub(r",\s*([\]}])", r"\1", match.group(1))
    rows = json.loads(raw)

    records = []
    for i, row in enumerate(rows):
        title, artist, album, language, genre, country, release_year, mood, play_count, duration_seed = row
        records.append({
            "id": f"omify-{str(i + 1).zfill(4)}",
            "title": title,
            "artist": artist,
            "album": album,
            "albumArt": None,
            "audioUrl": f"assets/audio/demo-{(i % 8) + 1}.wav",
            "duration": 150 + (duration_seed % 120),
            "genre": genre,
            "language": language,
            "country": country,
            "releaseYear": release_year,
            "playCount": play_count,
            "mood": mood,
        })
    return records


def normalize_record(raw: dict, source_label: str, strip_audio: bool) -> dict:
    song_id = raw.get("id")
    if not song_id:
        raise ValueError(f"Song record missing 'id': {raw}")

    audio_url = raw.get("audioUrl")
    if strip_audio:
        audio_url = None

    release_year = raw.get("releaseYear")
    try:
        release_year = int(release_year) if release_year is not None else None
    except (TypeError, ValueError):
        release_year = None
    release_date = f"{release_year}-01-01" if release_year else None

    return {
        "id": str(song_id),
        "title": (raw.get("title") or "Unknown Title").strip(),
        "artist": (raw.get("artist") or "Unknown Artist").strip(),
        "album": (raw.get("album") or "Single").strip(),
        "album_art": raw.get("albumArt"),
        "audio_url": audio_url,
        "duration": int(raw.get("duration") or 0),
        "genre": raw.get("genre"),
        "language": raw.get("language"),
        "mood": raw.get("mood"),
        "country": raw.get("country"),
        "release_year": release_year,
        "release_date": release_date,
        "play_count": int(raw.get("playCount") or 0),
        "source": source_label,
        "is_active": True,
    }


def run_import(file_path: str, strip_audio: bool):
    init_db()
    with open(file_path, "r", encoding="utf-8") as f:
        js_text = f.read()

    raw_records = extract_song_array(js_text)
    if raw_records is not None:
        source_label = "root_js" if "spotify playlist" in js_text else "omify_js"
    else:
        raw_records = extract_raw_tracks(js_text)
        source_label = "omify_js"
        if raw_records is None:
            raise ValueError(
                "Could not find a 'const SONGS = [...]' or 'const RAW_TRACKS = [...]' "
                f"array in {file_path}"
            )

    db = SessionLocal()
    inserted, updated, failed, favs_added = 0, 0, 0, 0
    try:
        for raw in raw_records:
            try:
                data = normalize_record(raw, source_label, strip_audio)
            except ValueError as e:
                print(f"  [skip] {e}")
                failed += 1
                continue

            existing = db.get(Song, data["id"])
            if existing:
                for key, value in data.items():
                    setattr(existing, key, value)
                updated += 1
            else:
                db.add(Song(**data))
                inserted += 1

            # Check for initial favorite / liked flag
            if raw.get("liked") is True:
                fav = db.get(Favorite, data["id"])
                if not fav:
                    db.add(Favorite(song_id=data["id"]))
                    favs_added += 1

        db.commit()
        # Refresh user preference profile with new favorites
        build_user_profile(db)
    finally:
        db.close()

    print(f"\nImport complete from {file_path}")
    print(f"  inserted:   {inserted}")
    print(f"  updated:    {updated}")
    print(f"  favs added: {favs_added}")
    print(f"  failed:     {failed}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True)
    parser.add_argument("--strip-audio", action="store_true")
    args = parser.parse_args()
    run_import(args.file, args.strip_audio)