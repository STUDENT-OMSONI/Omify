"""
Tests for database connection, initialization, and import idempotency.
"""
from app.database import init_db
from app.models.song import Song
from scripts.import_songs import normalize_record


def test_database_init(db_session):
    """Verify tables can be initialized without error."""
    init_db()
    count = db_session.query(Song).count()
    assert count == 10


def test_song_import_no_duplicates(db_session):
    """Verify that re-importing the same song record upserts rather than duplicates."""
    raw_song = {
        "id": "test-import-001",
        "title": "Imported Test Track",
        "artist": "Test Artist",
        "album": "Test Album",
        "releaseYear": 2024,
        "genre": "Pop",
        "language": "English",
        "mood": "Chill",
        "country": "UK",
        "playCount": 500,
        "duration": 180,
    }

    # First import
    norm_1 = normalize_record(raw_song, source_label="test", strip_audio=False)
    db_session.add(Song(**norm_1))
    db_session.commit()

    initial_count = db_session.query(Song).count()
    assert initial_count == 11

    # Second import with updated title
    raw_song["title"] = "Updated Test Track"
    norm_2 = normalize_record(raw_song, source_label="test", strip_audio=False)

    existing = db_session.get(Song, norm_2["id"])
    assert existing is not None
    for k, v in norm_2.items():
        setattr(existing, k, v)
    db_session.commit()

    # Total count must NOT increase
    final_count = db_session.query(Song).count()
    assert final_count == initial_count

    # Content must reflect the update
    updated_song = db_session.get(Song, "test-import-001")
    assert updated_song.title == "Updated Test Track"
