"""
Song categorization and clustering service.

Performs KMeans clustering over the precomputed metadata feature matrix
to group musically and stylistically related songs into clusters.
Assigns cluster_id back to the Song table in SQLite and fills metadata
gaps without overwriting existing ground truth labels.
"""
import logging
from typing import Optional, Dict, Any, List
from collections import Counter
from sklearn.cluster import KMeans

from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.song import Song
from app.services.metadata_features import get_feature_matrix

logger = logging.getLogger(__name__)


def run_clustering(
    db: Optional[Session] = None,
    n_clusters: int = 15,
) -> Dict[str, Any]:
    """
    Runs KMeans over the metadata feature matrix, assigns cluster_id to each song,
    and commits the assignments to the Song table.
    """
    should_close = False
    if db is None:
        db = SessionLocal()
        should_close = True

    try:
        feature_data = get_feature_matrix(db)
        matrix = feature_data.get("matrix")
        song_ids = feature_data.get("song_ids", [])

        if matrix is None or matrix.shape[0] == 0:
            logger.warning("No feature matrix available for clustering.")
            return {"status": "empty", "clusters": {}}

        # Adjust clusters if dataset is smaller than n_clusters
        actual_clusters = min(n_clusters, matrix.shape[0])
        if actual_clusters <= 1:
            actual_clusters = 1

        kmeans = KMeans(
            n_clusters=actual_clusters,
            random_state=42,
            n_init=10,
            max_iter=300,
        )
        cluster_labels = kmeans.fit_predict(matrix)

        # Map song_id -> cluster_id
        cluster_map = {song_ids[i]: int(cluster_labels[i]) for i in range(len(song_ids))}

        # Batch update Song table
        all_songs = db.query(Song).filter(Song.is_active == True).all()
        cluster_genre_counter: Dict[int, Counter] = {c: Counter() for c in range(actual_clusters)}
        cluster_mood_counter: Dict[int, Counter] = {c: Counter() for c in range(actual_clusters)}

        updated_count = 0
        for song in all_songs:
            cid = cluster_map.get(song.id)
            if cid is not None:
                song.cluster_id = cid
                updated_count += 1
                if song.genre:
                    cluster_genre_counter[cid][song.genre] += 1
                if song.mood:
                    cluster_mood_counter[cid][song.mood] += 1

        # Fill metadata gaps (only where genre/mood is missing, never overwriting existing truth)
        infilled_count = 0
        for song in all_songs:
            cid = song.cluster_id
            if cid is not None:
                if (not song.genre or song.genre.lower() in ("unknown", "other", "")) and cluster_genre_counter[cid]:
                    top_genre = cluster_genre_counter[cid].most_common(1)[0][0]
                    song.genre = top_genre
                    infilled_count += 1

                if (not song.mood or song.mood.lower() in ("unknown", "other", "")) and cluster_mood_counter[cid]:
                    top_mood = cluster_mood_counter[cid].most_common(1)[0][0]
                    song.mood = top_mood
                    infilled_count += 1

        db.commit()

        # Build cluster summary
        cluster_summaries = {}
        for c in range(actual_clusters):
            top_genres = [g for g, _ in cluster_genre_counter[c].most_common(3)]
            top_moods = [m for m, _ in cluster_mood_counter[c].most_common(3)]
            cluster_summaries[c] = {
                "size": sum(cluster_genre_counter[c].values()),
                "dominant_genres": top_genres,
                "dominant_moods": top_moods,
            }

        logger.info(
            "Clustering complete: %d songs assigned to %d clusters (infilled %d gaps)",
            updated_count,
            actual_clusters,
            infilled_count,
        )

        return {
            "status": "success",
            "updated_count": updated_count,
            "infilled_count": infilled_count,
            "n_clusters": actual_clusters,
            "clusters": cluster_summaries,
        }
    finally:
        if should_close:
            db.close()
