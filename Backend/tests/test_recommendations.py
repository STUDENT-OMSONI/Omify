"""
Tests for Recommendation Engine: scoring, diversity, explanation, and API endpoints.
"""
from collections import Counter
from app.models.song import Song
from app.services.recommendation_engine import get_made_for_you


def test_made_for_you_returns_real_songs_and_diversity(db_session):
    """
    Verify get_made_for_you:
      1. Returns real songs from the database
      2. Enforces diversity: max 2 songs per artist in top results
      3. Supplies a non-empty human-readable reason per song
      4. Produces real numerical scores
    """
    # Create multiple songs by the same artist to test the diversity constraint
    extra_songs = [
        Song(
            id=f"artist1-extra-{i}",
            title=f"Artist 1 Track {i}",
            artist="Artist 1",
            album="Artist 1 Album",
            genre="Pop",
            language="English",
            mood="Uplifting",
            release_year=2024,
            play_count=5000 + i * 100,
            is_active=True,
        )
        for i in range(5)
    ]
    db_session.add_all(extra_songs)
    db_session.commit()

    recs = get_made_for_you(db_session, limit=10)

    # 1. Not empty and real songs
    assert len(recs) > 0
    for item in recs:
        assert isinstance(item["song"], Song)
        assert item["song"].id is not None
        assert item["score"] > 0.0
        assert isinstance(item["reason"], str)
        assert len(item["reason"]) > 5

    # 2. Diversity constraint: no artist may have > 2 songs in top results
    artist_counts = Counter(item["song"].artist for item in recs)
    for artist, count in artist_counts.items():
        assert count <= 2, f"Artist {artist} exceeded diversity limit with {count} songs"


def test_made_for_you_api_endpoint(client):
    """Verify GET /api/made-for-you returns expected JSON schema and valid data."""
    res = client.get("/api/made-for-you?limit=10")
    assert res.status_code == 200
    data = res.json()
    assert "items" in data
    assert "total" in data
    assert len(data["items"]) > 0

    first_item = data["items"][0]
    assert "song" in first_item
    assert "score" in first_item
    assert "reason" in first_item
    assert first_item["song"]["id"].startswith("test-")


def test_made_for_you_with_category_filter(client):
    """Verify GET /api/made-for-you with category parameter filters properly."""
    res = client.get("/api/made-for-you?limit=10&category=romantic")
    assert res.status_code == 200
    data = res.json()
    assert "items" in data
    for it in data["items"]:
        assert "song" in it
        assert "reason" in it
        assert "score" in it


def test_trending_and_new_releases_endpoints(client):
    """Verify /api/trending and /api/new-releases endpoints."""
    trend_res = client.get("/api/trending?limit=5")
    assert trend_res.status_code == 200
    trend_data = trend_res.json()
    assert len(trend_data) > 0
    # Trending should be sorted by play_count descending
    assert trend_data[0]["play_count"] >= trend_data[-1]["play_count"]

    new_res = client.get("/api/new-releases?limit=5")
    assert new_res.status_code == 200
    new_data = new_res.json()
    assert len(new_data) > 0


def test_health_endpoint(client):
    """Verify /api/health returns status ok."""
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
