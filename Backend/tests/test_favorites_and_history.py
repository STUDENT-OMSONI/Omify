"""
Tests for Favorites and Listening History persistence and API behavior.
"""
from app.models.favorite import Favorite
from app.models.history import ListeningHistory
from app.models.song import Song


def test_favorites_persist(db_session, client):
    """Verify that adding and deleting favorites persists to the database."""
    song_id = "test-0001"

    # 1. Add favorite via API
    res = client.post(f"/api/favorites/{song_id}")
    assert res.status_code == 201
    assert res.json()["liked"] is True

    # Check database persistence
    fav = db_session.query(Favorite).filter(Favorite.song_id == song_id).first()
    assert fav is not None

    # 2. Query favorites list
    list_res = client.get("/api/favorites")
    assert list_res.status_code == 200
    fav_list = list_res.json()
    assert any(s["id"] == song_id for s in fav_list)

    # 3. Remove favorite
    del_res = client.delete(f"/api/favorites/{song_id}")
    assert del_res.status_code == 200
    assert del_res.json()["liked"] is False

    # Confirm removed from database
    fav_after = db_session.query(Favorite).filter(Favorite.song_id == song_id).first()
    assert fav_after is None


def test_listening_history_persists(db_session, client):
    """Verify that playback events persist in listening_history and update play_count."""
    song_id = "test-0002"
    song = db_session.query(Song).filter(Song.id == song_id).first()
    initial_play_count = song.play_count or 0

    # Record playback event
    payload = {
        "song_id": song_id,
        "play_duration": 150,
        "completed": True,
        "skipped": False,
        "liked_at_play_time": True,
    }
    res = client.post("/api/history", json=payload)
    assert res.status_code == 201
    assert res.json()["status"] == "success"

    # Confirm history row persisted
    history_row = (
        db_session.query(ListeningHistory)
        .filter(ListeningHistory.song_id == song_id)
        .order_by(ListeningHistory.id.desc())
        .first()
    )
    assert history_row is not None
    assert history_row.completed is True
    assert history_row.play_duration == 150

    # Confirm play count was incremented
    db_session.refresh(song)
    assert song.play_count == initial_play_count + 1
