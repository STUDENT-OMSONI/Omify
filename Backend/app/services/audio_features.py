"""
Pluggable audio feature extraction module.

Hard constraint: Audio-based ML features (librosa/MFCC/tempo) must remain
optional and pluggable — never required for the app to function.
Some songs have audio_url = None (commercial audio stripped).
This module gracefully returns None if librosa is not installed,
if audio_url is None or missing, or if the file does not exist locally.
"""
import os
import logging
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

# Check if librosa is available without hard crashing
try:
    # pyrefly: ignore [missing-import]
    import librosa
    import numpy as np
    LIBROSA_AVAILABLE = True
except ImportError:
    LIBROSA_AVAILABLE = False


def extract_audio_features(song) -> Optional[Dict[str, Any]]:
    """
    Extract MFCC, tempo, and spectral features for a given song if a local
    legal audio file is available and librosa is installed.

    Returns:
        dict with feature values, or None if extraction is unavailable.
    """
    if not LIBROSA_AVAILABLE:
        return None

    audio_url = getattr(song, "audio_url", None)
    if not audio_url or not isinstance(audio_url, str):
        return None

    # Resolve local audio path. Only proceed if file actually exists locally
    possible_paths = [
        audio_url,
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), audio_url),
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), audio_url),
    ]

    local_path = None
    for p in possible_paths:
        if os.path.isfile(p):
            local_path = p
            break

    if not local_path:
        return None

    try:
        # Load audio safely with a duration cap for efficiency
        y, sr = librosa.load(local_path, sr=22050, duration=30.0)
        if len(y) == 0:
            return None

        # 1. Tempo (BPM)
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        if hasattr(tempo, "__len__"):
            tempo = float(tempo[0]) if len(tempo) > 0 else 120.0
        else:
            tempo = float(tempo)

        # 2. Spectral Centroid (brightness of sound)
        spectral_centroids = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
        mean_spectral_centroid = float(np.mean(spectral_centroids))

        # 3. RMS Energy (loudness / power)
        rms = librosa.feature.rms(y=y)[0]
        mean_rms = float(np.mean(rms))

        # 4. MFCCs (timbre / texture - first 5 coefficients)
        mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=5)
        mfcc_means = [float(np.mean(mfccs[i])) for i in range(5)]

        return {
            "tempo": tempo,
            "spectral_centroid": mean_spectral_centroid,
            "rms_energy": mean_rms,
            "mfcc_1": mfcc_means[0],
            "mfcc_2": mfcc_means[1],
            "mfcc_3": mfcc_means[2],
            "mfcc_4": mfcc_means[3],
            "mfcc_5": mfcc_means[4],
        }
    except Exception as exc:
        logger.warning("Audio extraction failed gracefully for %s: %s", getattr(song, 'id', 'unknown'), exc)
        return None


if __name__ == "__main__":
    import sys
    import json

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    print("=" * 60)
    print("Omify Audio Feature Extraction CLI")
    print("=" * 60)
    print(f"librosa installed: {LIBROSA_AVAILABLE}")

    if not LIBROSA_AVAILABLE:
        print("\n[NOTE] librosa is currently NOT installed in this virtual environment.")
        print("Audio feature extraction (BPM/MFCC) is optional in Omify.")
        print("If you want to install librosa, run in terminal:")
        print("    .\\venv\\Scripts\\pip.exe install librosa soundfile\n")
    else:
        print("[OK] librosa is available for audio feature extraction!\n")

    try:
        from app.database import SessionLocal
        from app.models.song import Song

        db = SessionLocal()
        arg = sys.argv[1] if len(sys.argv) > 1 else None
        target_song = None

        if arg:
            target_song = db.query(Song).filter(Song.id == arg).first()
            if not target_song:
                class FileSong:
                    id = "local-file"
                    title = os.path.basename(arg)
                    audio_url = arg
                target_song = FileSong()
        else:
            # Check for a song with an existing local audio file
            active_songs = db.query(Song).filter(Song.audio_url.isnot(None)).limit(100).all()
            for s in active_songs:
                cand_paths = [
                    s.audio_url,
                    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), s.audio_url),
                    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), s.audio_url),
                ]
                if any(os.path.isfile(p) for p in cand_paths):
                    target_song = s
                    break

        if target_song:
            print(f"Target song: [{getattr(target_song, 'id', 'custom')}] {getattr(target_song, 'title', 'Track')}")
            print(f"Audio file: {getattr(target_song, 'audio_url', 'N/A')}")
            res = extract_audio_features(target_song)
            if res:
                print("\n[OK] Extracted Audio Features (BPM, Centroid, RMS, MFCCs):")
                print(json.dumps(res, indent=2))
            else:
                print("\n[INFO] extract_audio_features returned None.")
                if not LIBROSA_AVAILABLE:
                    print("Reason: librosa is not installed in this environment.")
                else:
                    print("Reason: Audio file could not be decoded.")
        else:
            print("No local playable song found in database to test with.")
            print("\nUsage:")
            print("    .\\venv\\Scripts\\python.exe -m app.services.audio_features [song_id or path/to/file.mp3]")
    except Exception as e:
        print(f"CLI Note: {e}")

