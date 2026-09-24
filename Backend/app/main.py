"""
Omify backend entrypoint.
Run with:  uvicorn app.main:app --reload --port 8000
"""

from contextlib import asynccontextmanager
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from app.database import init_db
from app.routers import songs, favorites, history, playlists, recommendations
from app.services.metadata_features import get_feature_matrix


# Frontend URL
# Local development uses localhost:3000.
# Render will use the FRONTEND_URL environment variable.
FRONTEND_URL = os.getenv(
    "FRONTEND_URL",
    "http://localhost:3000"
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()

    # Warm up / verify feature matrix cache
    try:
        get_feature_matrix()
    except Exception as exc:
        print(
            f"Warning: feature cache warm-up failed on startup: {exc}"
        )

    # Warm up release provider cache in background
    try:
        from threading import Thread
        from app.database import SessionLocal
        from app.services.release_provider import get_default_release_provider

        def _bg_warm_releases():
            try:
                with SessionLocal() as db:
                    provider = get_default_release_provider()

                    if hasattr(provider, "warm_cache"):
                        provider.warm_cache(db)

            except Exception as e:
                print(
                    f"Warning: release provider cache warm-up failed: {e}"
                )

        Thread(
            target=_bg_warm_releases,
            daemon=True
        ).start()

    except Exception as exc:
        print(
            f"Warning: could not start release provider warm-up: {exc}"
        )

    yield


# Create FastAPI application
app = FastAPI(
    title="Omify API",
    version="0.1.0",
    lifespan=lifespan,
)


# Allow requests from the configured frontend
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://omify-pearl.vercel.app",
]

if FRONTEND_URL and FRONTEND_URL not in ALLOWED_ORIGINS:
    ALLOWED_ORIGINS.append(FRONTEND_URL)


app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse(url="/docs")


@app.get("/api/health")
def health():
    return {"status": "ok"}


# Register all routers
app.include_router(songs.router)
app.include_router(favorites.router)
app.include_router(history.router)
app.include_router(playlists.router)
app.include_router(recommendations.router)