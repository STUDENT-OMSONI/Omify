"""
Song table. Denormalized on purpose (artist/album/genre as plain
strings): with a single-user, ~1,000-song catalog, normalizing into
separate Artist/Album/Genre tables adds join overhead without a real
benefit yet. Revisit if the catalog grows past ~20k songs or
multi-user support is added.
"""
from sqlalchemy import Column, String, Integer, Float, Boolean, Index
from app.database import Base


class Song(Base):
    __tablename__ = "songs"

    # Stable string ID carried over from the existing frontend catalog
    # (e.g. "sp-81", "omify-0001") so re-importing never creates
    # duplicates and existing localStorage favorite/playlist IDs on
    # the frontend keep working unchanged.
    id = Column(String, primary_key=True, index=True)

    title = Column(String, nullable=False, default="Unknown Title")
    artist = Column(String, nullable=False, default="Unknown Artist", index=True)
    album = Column(String, nullable=True, default="Single")
    album_art = Column(String, nullable=True)

    # Nullable on purpose: songs sourced from the root catalog that
    # pointed at local copyrighted MP3s are imported with audio_url
    # set to NULL. See scripts/import_songs.py for the exact rule.
    audio_url = Column(String, nullable=True)

    duration = Column(Integer, nullable=True, default=0)  # seconds

    genre = Column(String, nullable=True, index=True)
    language = Column(String, nullable=True, index=True)
    mood = Column(String, nullable=True, index=True)
    country = Column(String, nullable=True)

    release_year = Column(Integer, nullable=True, index=True)
    # Optional exact date, used later for the "new releases" window.
    # Most of your existing metadata only has a year, so this stays
    # nullable and falls back to Jan 1 of release_year when absent.
    release_date = Column(String, nullable=True)  # ISO "YYYY-MM-DD"

    play_count = Column(Integer, nullable=True, default=0)  # seed popularity signal

    source = Column(String, nullable=False, default="omify_js")
    # "omify_js" | "root_js" | "foreign_seed" — lets the import script
    # and later auditing tell where a record came from.

    is_active = Column(Boolean, nullable=False, default=True)
    cluster_id = Column(Integer, nullable=True, index=True)


Index("ix_songs_genre_language", Song.genre, Song.language)