"""Live backend: SharePoint Embedded (Graph) + PostgreSQL + PaddleOCR.

- Provisioning walks the declarative template and creates folders via Graph
  (idempotent), caching each logical-path -> driveItem id in Postgres.
- Uploads go straight to Graph; month-driven uploads run OCR to pick the month,
  auto-create the `{Month YYYY}` folder (+ category sub-folders), and file the doc.
- Folder semantics (kind / upload / month_driven) are derived from the template
  via `classify`, so the UI renders identically to stub mode.
"""
import asyncio
from datetime import date

from .. import template
from ..config import settings
from ..db.base import SessionLocal
from ..db import models
from ..graph import drive as gd
from ..graph.client import GraphError
from ..ocr.dates import month_label
from ..ocr.extract import detect_document_month
from .classify import classify
from .errors import BadRequest, Conflict, NotFound


def _next_month(year, month):
    return (year + 1, 1) if month == 12 else (year, month + 1)


class RealBackend:
    def __init__(self):
        self._drive_id = None
        self._base_ready = False
        self._sem = None

    def _semaphore(self):
        # Bound concurrent Graph folder creation to speed up provisioning
        # without tripping SharePoint throttling.
        if self._sem is None:
            self._sem = asyncio.Semaphore(5)
        return self._sem

    # ------------------------------------------------------------- infra
    async def _drive(self) -> str:
        if not self._drive_id:
            self._drive_id = await gd.get_container_drive_id(settings.container_id)
        return self._drive_id

    def _upsert(self, db, path, name, kind, item_id, month_driven, vessel_id):
        row = db.query(models.Folder).filter_by(path=path).one_or_none()
        if row is None:
            row = models.Folder(path=path)
            db.add(row)
        row.name = name
        row.kind = kind
        row.drive_item_id = item_id
        row.month_driven = month_driven
        if vessel_id is not None:
            row.vessel_id = vessel_id
        return row

    def _folder_by_item(self, db, item_id):
        return db.query(models.Folder).filter_by(drive_item_id=item_id).one_or_none()

    async def _folder_path(self, drive_id, folder_id) -> str:
        with SessionLocal() as db:
            row = self._folder_by_item(db, folder_id)
            if row:
                return row.path
        # Fallback: derive from Graph parentReference.
        item = await gd.get_item(drive_id, folder_id)
        ref = (item.get("parentReference") or {}).get("path", "")
        rel = ref.split("root:", 1)[1].lstrip("/") if "root:" in ref else ""
        return f"{rel}/{item['name']}".strip("/") if rel else item["name"]

    # --------------------------------------------------------- provisioning
    async def _ensure_node(self, drive_id, parent_id, parent_path, spec, vessel_id):
        """Create a folder + its subtree via Graph. Siblings are created
        concurrently (bounded by the semaphore); each task uses its own DB
        session so concurrency is safe."""
        name = spec["name"]
        async with self._semaphore():
            item = await gd.ensure_folder(drive_id, parent_id, name)
        path = f"{parent_path}/{name}" if parent_path else name
        kind = spec["kind"]
        with SessionLocal() as db:
            self._upsert(db, path, name, kind, item["id"], kind == "month_driven", vessel_id)
            db.commit()
        # Month folders are created on upload + by the scheduler, not here.
        if kind != "month_driven":
            children = spec.get("children", [])
            await asyncio.gather(
                *(
                    self._ensure_node(drive_id, item["id"], path, child, vessel_id)
                    for child in children
                )
            )

    async def _ensure_month(self, db, drive_id, md_id, md_path, md_spec, year, month, vessel_id):
        label = month_label(year, month)
        month_item = await gd.ensure_folder(drive_id, md_id, label)
        mpath = f"{md_path}/{label}"
        self._upsert(db, mpath, label, "month", month_item["id"], False, vessel_id)
        for cat in md_spec.get("month_children", []):
            cat_item = await gd.ensure_folder(drive_id, month_item["id"], cat["name"])
            self._upsert(
                db, f"{mpath}/{cat['name']}", cat["name"], "leaf", cat_item["id"], False, vessel_id
            )
        return month_item

    async def ensure_base_structure(self):
        drive_id = await self._drive()
        with SessionLocal() as db:
            have = {r.path for r in db.query(models.Folder).filter_by(kind="main")}
            if len(have) >= len(template.MAIN_FOLDERS):
                self._base_ready = True
                return
            root = await gd.get_root_item_id(drive_id)
            main_items = {}
            for main in template.MAIN_FOLDERS:
                item = await gd.ensure_folder(drive_id, root, main)
                self._upsert(db, main, main, "main", item["id"], False, None)
                main_items[main] = item["id"]
            db.commit()
        # Common subtrees for all mains, concurrently.
        await asyncio.gather(
            *(
                self._ensure_node(
                    drive_id, main_items[main], main, template.COMMON_TEMPLATE[main], None
                )
                for main in template.MAIN_FOLDERS
            )
        )
        self._base_ready = True

    # -------------------------------------------------------------- vessels
    async def list_vessels(self):
        with SessionLocal() as db:
            rows = db.query(models.Vessel).order_by(models.Vessel.created_at).all()
            return [{"id": str(v.id), "name": v.name, "imo": v.imo} for v in rows]

    async def create_vessel(self, name, imo):
        name = (name or "").strip()
        imo = (imo or "").strip()
        if not name:
            raise BadRequest("Vessel name is required")
        if imo and (not imo.isdigit() or len(imo) != 7):
            raise BadRequest("IMO number must be exactly 7 digits")
        with SessionLocal() as db:
            if db.query(models.Vessel).filter(models.Vessel.name.ilike(name)).first():
                raise Conflict("A vessel with that name already exists")
            if imo and db.query(models.Vessel).filter_by(imo=imo).first():
                raise Conflict("A vessel with that IMO number already exists")

        await self.ensure_base_structure()
        drive_id = await self._drive()
        # Create the vessel row + capture main folder ids, then release the session.
        with SessionLocal() as db:
            vessel = models.Vessel(name=name, imo=imo or None)
            db.add(vessel)
            db.flush()
            vessel_id, vname, vimo = vessel.id, vessel.name, vessel.imo
            main_ids = {
                m: db.query(models.Folder).filter_by(path=m).one().drive_item_id
                for m in template.MAIN_FOLDERS
            }
            db.commit()

        async def provision_main(main):
            ship = await gd.ensure_folder(drive_id, main_ids[main], name)
            ship_path = f"{main}/{name}"
            with SessionLocal() as db:
                self._upsert(db, ship_path, name, "ship", ship["id"], False, vessel_id)
                db.commit()
            await asyncio.gather(
                *(
                    self._ensure_node(drive_id, ship["id"], ship_path, spec, vessel_id)
                    for spec in template.SHIP_TEMPLATE[main]
                )
            )

        await asyncio.gather(*(provision_main(m) for m in template.MAIN_FOLDERS))
        return {"id": str(vessel_id), "name": vname, "imo": vimo}

    # ----------------------------------------------------------- navigation
    async def mains(self):
        await self.ensure_base_structure()
        with SessionLocal() as db:
            out = []
            for main in template.MAIN_FOLDERS:
                row = db.query(models.Folder).filter_by(path=main).one_or_none()
                if row:
                    out.append(
                        {
                            "id": row.drive_item_id,
                            "name": row.name,
                            "kind": "main",
                            "upload": False,
                            "month_driven": False,
                            "has_children": True,
                        }
                    )
            return out

    async def get_folder(self, folder_id):
        drive_id = await self._drive()
        path = await self._folder_path(drive_id, folder_id)
        parts = path.split("/")
        flags = classify(parts)
        return {"id": folder_id, "name": parts[-1], "has_children": True, **flags}

    async def children(self, folder_id):
        drive_id = await self._drive()
        parent_path = await self._folder_path(drive_id, folder_id)
        try:
            items = await gd.list_children(drive_id, folder_id)
        except GraphError as e:
            if e.status == 404:
                raise NotFound("Folder not found")
            raise
        parent_parts = parent_path.split("/") if parent_path else []
        out = []
        with SessionLocal() as db:
            parent_row = self._folder_by_item(db, folder_id)
            vessel_id = parent_row.vessel_id if parent_row else None
            for it in items:
                name = it["name"]
                if "folder" in it:
                    parts = parent_parts + [name]
                    flags = classify(parts)
                    self._upsert(
                        db, "/".join(parts), name, flags["kind"], it["id"],
                        flags["month_driven"], vessel_id,
                    )
                    node = {
                        "id": it["id"],
                        "name": name,
                        **flags,
                        "has_children": (it.get("folder") or {}).get("childCount", 0) > 0,
                    }
                else:
                    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
                    node = {
                        "id": it["id"],
                        "name": name,
                        "kind": "file",
                        "upload": False,
                        "month_driven": False,
                        "has_children": False,
                        "ext": ext,
                    }
                out.append(node)
            db.commit()
        return out

    async def stats(self):
        with SessionLocal() as db:
            vessels = db.query(models.Vessel).count()
            month_driven = db.query(models.Folder).filter_by(month_driven=True).count()
            months = db.query(models.Folder).filter_by(kind="month").count()
        return {
            "vessels": vessels,
            "main_folders": len(template.MAIN_FOLDERS),
            "month_driven": month_driven,
            "months": months,
            "documents": None,  # not tracked in DB; would require a Graph walk
        }

    # -------------------------------------------------------------- uploads
    async def upload(self, folder_id, filename, content, content_type):
        drive_id = await self._drive()
        path = await self._folder_path(drive_id, folder_id)
        flags = classify(path.split("/"))
        if flags.get("month_driven"):
            raise BadRequest("Use the month upload for this folder")
        if not flags.get("upload"):
            raise BadRequest("This folder does not accept direct uploads")
        existing = await gd.find_child(drive_id, folder_id, filename)
        if existing and "file" in existing:
            raise Conflict(f"'{filename}' already exists in this folder")
        await gd.upload_file(drive_id, folder_id, filename, content, content_type)
        return self._make_job(filename, f"{path}/{filename}", None)

    async def month_upload(self, folder_id, filename, category, content, content_type):
        drive_id = await self._drive()
        md_path = await self._folder_path(drive_id, folder_id)
        md_parts = md_path.split("/")
        flags = classify(md_parts)
        if not flags.get("month_driven"):
            raise BadRequest("This folder is not a month-driven folder")
        categories = flags.get("categories", [])
        md_spec = {"month_children": [{"name": c, "kind": "leaf"} for c in categories]}

        detected = await asyncio.to_thread(
            detect_document_month, content, filename, content_type or ""
        )
        with SessionLocal() as db:
            if detected["year"] is None:
                target = await gd.ensure_folder(drive_id, folder_id, "To be Classified")
                self._upsert(
                    db, f"{md_path}/To be Classified", "To be Classified", "leaf",
                    target["id"], False, None,
                )
                target_id, detected_label = target["id"], None
                dest_path = f"{md_path}/To be Classified/{filename}"
            else:
                y, m = detected["year"], detected["month"]
                month_item = await self._ensure_month(
                    db, drive_id, folder_id, md_path, md_spec, y, m, None
                )
                cat_name = category if category in categories else "To be Classified"
                cat_item = await gd.ensure_folder(drive_id, month_item["id"], cat_name)
                target_id, detected_label = cat_item["id"], detected["label"]
                dest_path = f"{md_path}/{detected['label']}/{cat_name}/{filename}"
            db.commit()

        existing = await gd.find_child(drive_id, target_id, filename)
        if existing and "file" in existing:
            raise Conflict(f"'{filename}' already exists in the target folder")
        await gd.upload_file(drive_id, target_id, filename, content, content_type)
        return self._make_job(filename, dest_path, detected_label)

    # ------------------------------------------------------------ files
    async def get_file(self, file_id):
        drive_id = await self._drive()
        try:
            return await gd.download_file(drive_id, file_id)
        except GraphError:
            return None

    async def delete_file(self, file_id):
        drive_id = await self._drive()
        try:
            await gd.delete_item(drive_id, file_id)
            return True
        except GraphError as e:
            if e.status == 404:
                return False
            raise

    def _trail(self, db, parts, leaf_id):
        """Build [{id,name}] for each path segment, resolving ids from the DB."""
        trail = []
        for i in range(len(parts)):
            if i == len(parts) - 1 and leaf_id:
                trail.append({"id": leaf_id, "name": parts[i]})
            else:
                prefix = "/".join(parts[: i + 1])
                row = db.query(models.Folder).filter_by(path=prefix).one_or_none()
                trail.append({"id": row.drive_item_id if row else "", "name": parts[i]})
        return trail

    async def search(self, q):
        ql = q.strip()
        if not ql:
            return []
        out, seen = [], set()
        # 1) Folders from our DB cache — always available, no index lag.
        with SessionLocal() as db:
            rows = (
                db.query(models.Folder)
                .filter(models.Folder.name.ilike(f"%{ql}%"))
                .limit(50)
                .all()
            )
            for r in rows:
                parts = r.path.split("/")
                out.append(
                    {
                        "id": r.drive_item_id,
                        "name": r.name,
                        "kind": r.kind,
                        "trail": self._trail(db, parts, r.drive_item_id),
                        "path": r.path,
                    }
                )
                seen.add(r.drive_item_id)
        # 2) Files via Graph search (best-effort; may lag or be unavailable).
        try:
            drive_id = await self._drive()
            items = await gd.search_items(drive_id, ql)
            with SessionLocal() as db:
                for it in items:
                    if "file" not in it or it["id"] in seen:
                        continue
                    ref = (it.get("parentReference") or {}).get("path", "")
                    rel = ref.split("root:", 1)[1].lstrip("/") if "root:" in ref else ""
                    parts = [p for p in rel.split("/") if p] + [it["name"]]
                    out.append(
                        {
                            "id": it["id"],
                            "name": it["name"],
                            "kind": "file",
                            "trail": self._trail(db, parts, it["id"]),
                            "path": "/".join(parts),
                        }
                    )
        except GraphError:
            pass
        return out[:50]

    # -------------------------------------------------------------- jobs
    def _make_job(self, filename, destination, detected_month):
        with SessionLocal() as db:
            job = models.UploadJob(
                filename=filename,
                status="done",
                destination=destination,
                detected_month=detected_month,
            )
            db.add(job)
            db.commit()
            return self._job_public(job)

    async def get_job(self, job_id):
        with SessionLocal() as db:
            job = db.get(models.UploadJob, int(job_id)) if job_id.isdigit() else None
            return self._job_public(job) if job else None

    @staticmethod
    def _job_public(job):
        return {
            "id": str(job.id),
            "filename": job.filename,
            "status": job.status,
            "destination": job.destination,
            "detected_month": job.detected_month,
        }
