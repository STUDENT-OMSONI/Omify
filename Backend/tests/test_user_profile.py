"""
Tests for user preference profiling, time-decay, and behavioral weighting.
"""
from datetime import datetime, timezone, timedelta
from app.models.history import ListeningHistory
from app.models.favorite import Favorite
from app.models.preference import UserPreference
from app.services.user_profile import build_user_profile, get_user_preferences


def test_build_user_profile_normalized_scores(db_session):
    """Verify that build_user_profile produces normalized scores in [0.0, 1.0]."""
    now = datetime.now(timezone.utc)

    # Add playback events:
    # 2 plays of Pop song (test-0001, Artist 1, English, Uplifting)
    # 1 skipped play of Electronic song (test-0008, Artist 4, Korean, Chill)
    db_session.add_all([
        ListeningHistory(
            song_id="test-0001",
            played_at=now - timedelta(hours=2),
            completed=True,
            skipped=False,
            liked_at_play_time=True,
        ),
        ListeningHistory(
            song_id="test-0001",
            played_at=now - timedelta(days=1),
            completed=True,
            skipped=False,
            liked_at_play_time=False,
        ),
        ListeningHistory(
            song_id="test-0008",
            played_at=now - timedelta(days=2),
            completed=False,
            skipped=True,
            liked_at_play_time=False,
        ),
    ])
    # Add a favorite
    db_session.add(Favorite(song_id="test-0001"))
    db_session.commit()

    profile = build_user_profile(db_session, days=10)

    # Check structure
    assert "genre_scores" in profile
    assert "language_scores" in profile
    assert "mood_scores" in profile
    assert "artist_scores" in profile

    # Check normalization: all values must be between 0.0 and 1.0
    for category in ["genre_scores", "language_scores", "mood_scores", "artist_scores"]:
        for key, score in profile[category].items():
            assert 0.0 <= score <= 1.0, f"Score for {key} ({score}) out of bounds"

    # Pop and English (associated with test-0001) should dominate
    assert profile["genre_scores"].get("Pop", 0) > profile["genre_scores"].get("Electronic", 0)
    assert profile["language_scores"].get("English", 0) >= profile["language_scores"].get("Korean", 0)

    # Verify single row in user_preferences table
    pref_row = db_session.query(UserPreference).first()
    assert pref_row is not None
    assert "Pop" in pref_row.genre_scores


def test_user_profile_empty_history(db_session):
    """Verify profile builds cleanly even with zero history."""
    profile = build_user_profile(db_session, days=10)
    assert isinstance(profile, dict)
    assert profile["genre_scores"] == {}
