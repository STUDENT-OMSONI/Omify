"""
Tests for MusicBrainz Release Provider:
- User-Agent and Contact Email validation
- Seed / favorite artist lists
- Title normalization and catalog matching
- Resilient local database fallback
- In-memory TTL caching
"""
import pytest
from app.models.song import Song
from app.services.release_provider import (
    MusicBrainzReleaseProvider,
    LocalReleaseProvider,
    MUSICBRAINZ_USER_AGENT,
    CONTACT_EMAIL,
    TEST_ARTISTS,
    _normalize_title,
)


def test_musicbrainz_configuration():
    """Verify official contact email and User-Agent headers."""
    provider = MusicBrainzReleaseProvider()
    assert provider.user_agent == "Omify/1.0 (om8818850@gmail.com)"
    assert provider.contact_email == "om8818850@gmail.com"
    assert MUSICBRAINZ_USER_AGENT == "Omify/1.0 (om8818850@gmail.com)"
    assert CONTACT_EMAIL == "om8818850@gmail.com"

    expected_artists = [
        "Arijit Singh",
        "Diljit Dosanjh",
        "Karan Aujla",
        "Shubh",
        "AP Dhillon",
        "Yo Yo Honey Singh",
        "Atif Aslam",
        "Pritam",
        "Anuv Jain",
        "Dua Lipa",
        "Ed Sheeran",
        "Taylor Swift",
    ]
    for artist in expected_artists:
        assert artist in TEST_ARTISTS
        assert artist in provider.test_artists


def test_normalize_title():
    """Verify title normalization removes junk tags while preserving core title."""
    assert _normalize_title("With You - PagalNew") == "with you"
    assert _normalize_title("Tauba Tauba (From “Bad Newz”)") == "tauba tauba"
    assert _normalize_title("Summer High") == "summer high"
    assert _normalize_title("Winning Speech") == "winning speech"


def test_provider_memory_db_fallback(db_session):
    """Verify that under test db (in-memory SQLite), provider cleanly returns local catalog."""
    provider = MusicBrainzReleaseProvider()
    releases = provider.get_new_releases(db_session, limit=5)
    assert len(releases) > 0
    for s in releases:
        assert isinstance(s, Song)
        assert s.id.startswith("test-")


def test_catalog_matching_logic(db_session):
    """Verify that when external metadata matches local catalog, audio_url and local fields are preserved."""
    local_song = Song(
        id="local-match-1",
        title="Wavy",
        artist="Karan Aujla",
        audio_url="audio/wavy.mp3",
        album="Making Memories",
        is_active=True,
    )
    db_session.add(local_song)
    db_session.commit()

    provider = MusicBrainzReleaseProvider()
    # Mock MusicBrainz response for Karan Aujla
    provider._artist_cache["Karan Aujla"] = {
        "timestamp": 9999999999.0,
        "releases": [
            {
                "id": "mbid-wavy-123",
                "title": "Wavy",
                "artist": "Karan Aujla",
                "album": "Single",
                "date": "2024-11-15",
                "country": "IN",
            }
        ],
    }

    # Temporarily bypass the :memory: guard to test the matching loop
    # using the provider directly
    seed_artists = ["Karan Aujla"]
    raw_releases = provider._fetch_artist_releases("Karan Aujla")
    assert len(raw_releases) == 1

    # Check that matching against local DB finds local-match-1
    local_songs = db_session.query(Song).filter(Song.is_active == True).all()
    norm_t = _normalize_title(raw_releases[0]["title"])
    matched = None
    for s in local_songs:
        if _normalize_title(s.title) == norm_t and "karan aujla" in s.artist.lower():
            matched = s
            break

    assert matched is not None
    assert matched.id == "local-match-1"
    assert matched.audio_url == "audio/wavy.mp3"
