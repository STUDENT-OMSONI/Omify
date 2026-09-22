# Omify — Music Streaming Platform & ML Recommendation Engine

A high-performance, dark-themed music streaming web application with an authentic 1,098-track catalog, client-side WebAudio playback, and a Python FastAPI Machine Learning recommendation engine.

---

## 🚀 Quick Start

### 1. Start the Machine Learning Backend
```bash
cd Backend
.\venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8000 --reload
```
- **Backend API Docs**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **Health Check**: [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health)

### 2. Start the Frontend Streaming Server
In the root directory:
```bash
node server.js
```
- **Frontend App**: [http://localhost:3000/](http://localhost:3000/)

---

## 🎧 Architecture & Features

### Frontend (Vanilla HTML5 / CSS3 / JavaScript)
- **Authentic Catalog**: 1,098 curated songs from the local audio library with authentic extracted cover art and metadata.
- **Audio Streaming Engine**: Custom WebAudio player supporting play/pause, seek, volume control, shuffle, repeat, queue management, and keyboard shortcuts.
- **Dynamic Hash Routing**: Instant SPA navigation without page refreshes (`#/home`, `#/made-for-you`, `#/trending`, `#/new-releases`, `#/foreign`, `#/favorites`, `#/playlists`, `#/settings`, `#/profile`).
- **Live Sync**: Playback history and favorites sync in real time with the backend SQLite database.

### Backend (Python / FastAPI / SQLAlchemy / Scikit-Learn)
- **TF-IDF + Metadata Feature Matrix**: 524-dimensional feature vector per song incorporating genres, moods, languages, artist similarity, and normalized release years/play counts.
- **KMeans Categorization**: Unsupervised 15-cluster grouping for diverse music discovery.
- **User Preference Profile**: Real-time listening history decay and behavioral weighting ($W_{\text{like}} = 2.0$, $W_{\text{finish}} = 1.5$, $W_{\text{skip}} = -0.5$).
- **Personalized Recommendations**: `/api/made-for-you` calculates content scores with diversity constraints ($\le 2$ tracks per artist) and clear human-readable explanations.
- **Discovery Endpoints**: `/api/trending`, `/api/new-releases`, `/api/foreign-music`, `/api/history`, `/api/favorites`, `/api/playlists`.
- **Automated Retraining**: `/api/recommendations/refresh` triggers full feature matrix recomputation, clustering, and user profile updates.

---

## 🧪 Testing the ML Engine
```bash
cd Backend
.\venv\Scripts\python.exe -m pytest tests/ -v
```
All 10 integration and unit test suites pass, verifying:
- Feature matrix construction
- KMeans clustering consistency
- User profile preference decay
- Diversity enforcement
- Playback history & favorites endpoints
