"""APScheduler job: pre-create next month's folders on/after the 20th.

Runs daily. On or after the 20th of the month, for every month-driven folder of
every vessel it ensures next month's `{Month YYYY}` folder (+ category
sub-folders) exists. Upload-time creation remains the fallback for any gaps.
Only active in real (Graph + DB) mode.
"""
from datetime import date

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from .config import settings
from .db import models
from .db.base import SessionLocal
from .services.classify import classify

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


def start_scheduler() -> AsyncIOScheduler | None:
    if not (settings.graph_configured and settings.db_configured):
        return None
    sched = AsyncIOScheduler()
    sched.add_job(
        precreate_next_month,
        "cron",
        hour=1,
        minute=0,
        id="precreate_next_month",
        replace_existing=True,
    )
    sched.start()
    return sched
