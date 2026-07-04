"""Backend service selection.

Exposes a single `get_backend()` returning either the real SharePoint Embedded +
PostgreSQL backend (when configured) or the in-memory stub. Both implement the
same async interface so the API layer has one code path.
"""
from ..config import settings

_backend = None


def get_backend():
    global _backend
    if _backend is None:
        if settings.graph_configured and settings.db_configured:
            from .real_backend import RealBackend

            _backend = RealBackend()
        else:
            from .stub_backend import StubBackend

            _backend = StubBackend()
    return _backend


def backend_mode() -> str:
    return get_backend().__class__.__name__.replace("Backend", "").lower()
