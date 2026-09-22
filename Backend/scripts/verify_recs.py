import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from collections import Counter
from app.database import SessionLocal, init_db

from app.services.recommendation_engine import get_made_for_you, calculate_recommendation_score
from app.services.metadata_features import get_feature_matrix
from app.services.categorization import run_clustering
from app.models.song import Song


def verify():
    init_db()
    db = SessionLocal()
    try:
        # 1. Check songs count
        total_songs = db.query(Song).filter(Song.is_active == True).count()
        print(f"Active songs in database: {total_songs}")
        assert total_songs >= 1000

        # 2. Check feature matrix shape
        feat = get_feature_matrix(db)
        matrix = feat.get("matrix")
        print(f"Feature matrix shape: {matrix.shape}")
        assert matrix.shape[0] == total_songs

        # 3. Check cluster assignments
        clustered = db.query(Song).filter(Song.cluster_id.isnot(None)).count()
        print(f"Songs with cluster_id: {clustered}")
        if clustered < total_songs:
            print("Running clustering...")
            run_clustering(db)
            clustered = db.query(Song).filter(Song.cluster_id.isnot(None)).count()
            print(f"Songs with cluster_id after run: {clustered}")

        # 4. Generate Made For You top 20
        recs = get_made_for_you(db, limit=20)
        print(f"\nMade For You generated {len(recs)} recommendations:")
        for i, r in enumerate(recs):
            print(f"  #{i+1:02d} [{r['score']:.4f}] {r['song'].title} — {r['song'].artist} ({r['song'].genre})")
            print(f"       Reason: {r['reason']}")

        assert len(recs) == 20

        # 5. Check artist diversity
        artists = Counter(r["song"].artist for r in recs)
        max_artist_count = max(artists.values())
        print(f"\nMax songs by single artist in top 20: {max_artist_count}")
        assert max_artist_count <= 2

        # 6. Check single score calculation
        sample_id = recs[0]["song"].id
        single_score = calculate_recommendation_score(sample_id, db)
        print(f"Single score calculation for {sample_id}: {single_score}")
        assert single_score > 0.0

        print("\nALL VERIFICATIONS PASSED SUCCESSFULLY!")
    finally:
        db.close()


if __name__ == "__main__":
    verify()
