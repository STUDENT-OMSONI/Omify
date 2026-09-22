from app.schemas.song import SongBase, SongRead, SongListResponse, ArtistSummary, AlbumSummary
from app.schemas.history import HistoryCreate, HistoryRead
from app.schemas.favorite import FavoriteRead
from app.schemas.playlist import PlaylistCreate, PlaylistRead, PlaylistSongAdd
from app.schemas.recommendation import RecommendationItem, RecommendationResponse

__all__ = [
    "SongBase",
    "SongRead",
    "SongListResponse",
    "ArtistSummary",
    "AlbumSummary",
    "HistoryCreate",
    "HistoryRead",
    "FavoriteRead",
    "PlaylistCreate",
    "PlaylistRead",
    "PlaylistSongAdd",
    "RecommendationItem",
    "RecommendationResponse",
]
