"""APScheduler jobs for Vessel DMS.

Jobs:
  precreate_next_month  – daily @ 01:00, creates next month's SP folders.
  session_sweep         – every 15 min, expires stale sessions and runs
                          periodic Graph spot-checks for active accounts.

Both jobs are only active when Graph + DB are configured (real mode).
"""
from datetime import date
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from .config import settings
from .db import models
from .db.base import SessionLocal
from .services.classify import classify

log = logging.getLogger(__name__)

PRECREATE_DAY = 20


def _next_month(year, month):
    return (year + 1, 1) if month == 12 else (year, month + 1)


async def precreate_next_month(force: bool = False) -> int:
    """Ensure next month's folders exist. Returns how many were processed."""
    from .services import get_backend

    backend = get_backend()
    if backend.__class__.__name__ != "RealBackend":
        return 0
    today = date.today()
    if not force and today.day < PRECREATE_DAY:
        return 0

    ny, nm = _next_month(today.year, today.month)
    drive_id = await backend._drive()
    with SessionLocal() as db:
        rows = [
            (r.drive_item_id, r.path, r.vessel_id)
            for r in db.query(models.Folder).filter_by(month_driven=True).all()
        ]
    for item_id, path, vessel_id in rows:
        categories = classify(path.split("/")).get("categories", [])
        spec = {"month_children": [{"name": c, "kind": "leaf"} for c in categories]}
        with SessionLocal() as db:
            await backend._ensure_month(db, drive_id, item_id, path, spec, ny, nm, vessel_id)
            db.commit()
    return len(rows)


def _sweep_sessions() -> None:
    """Synchronous job: expire stale sessions + Graph account revalidation.

    Designed to be resilient — any exception is caught and logged so the
    scheduler doesn't drop the job entirely on a transient DB error.

    Multi-instance safety: expire_old_sessions / revalidate_active_accounts
    are both idempotent (status transitions are only written once per row),
    so running on multiple pods produces at-most-one audit entry per event
    in practice (the second write hits a row already in Expired/Revoked state
    and is a no-op).
    """
    if not settings.db_configured:
        return

    try:
        from .services.session_service import expire_old_sessions, revalidate_active_accounts

        with SessionLocal() as db:
            expired = expire_old_sessions(db)
            if expired:
                log.info("[session_sweep] Expired %d session(s)", expired)

        # Acquire an app-only token for Graph spot-checks (best-effort)
        app_token: str | None = None
        if settings.graph_configured:
            try:
                import httpx
                from .graph.http import verify as graph_tls_verify

                token_url = (
                    f"{settings.graph_authority}/{settings.azure_tenant_id}"
                    "/oauth2/v2.0/token"
                )
                resp = httpx.post(
                    token_url,
                    data={
                        "grant_type": "client_credentials",
                        "client_id": settings.graph_client_id,
                        "client_secret": settings.graph_client_secret,
                        "scope": settings.graph_scope,
                    },
                    verify=graph_tls_verify(),
                    timeout=10.0,
                )
                if resp.status_code == 200:
                    app_token = resp.json().get("access_token")
            except Exception as exc:
                log.debug("[session_sweep] Could not acquire app-only token: %s", exc)

        with SessionLocal() as db:
            revoked = revalidate_active_accounts(db, app_token=app_token)
            if revoked:
                log.info("[session_sweep] Revoked %d session(s) (account disabled)", revoked)

    except Exception as exc:
        log.warning("[session_sweep] Unhandled error: %s", exc)


def start_scheduler() -> AsyncIOScheduler | None:
    if not (settings.graph_configured and settings.db_configured):
        return None
    sched = AsyncIOScheduler()

    # Pre-create next month's SharePoint folders (daily at 01:00)
    sched.add_job(
        precreate_next_month,
        "cron",
        hour=1,
        minute=0,
        id="precreate_next_month",
        replace_existing=True,
    )

    # Session expiry sweep + Graph account revalidation (every 15 minutes)
    sched.add_job(
        _sweep_sessions,
        "interval",
        minutes=15,
        id="session_sweep",
        replace_existing=True,
    )

    sched.start()
    log.info("Scheduler started: precreate_next_month (daily) + session_sweep (15 min)")
    return sched
