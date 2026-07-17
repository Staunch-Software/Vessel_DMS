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
from sqlalchemy import func

from .. import template
from ..config import settings
from ..db.base import SessionLocal
from ..db import models
from ..graph import drive as gd
from ..graph.client import GraphError, graph
from ..ocr.dates import month_label
from ..ocr.extract import detect_document_month
from .classify import classify
from .errors import BadRequest, Conflict, NotFound, InternalServerError
from .normalize import normalize_vessel_name


def sanitize_folder_name(name: str) -> str:
    # Replace slashes and backslashes with hyphens
    name = name.replace("/", "-").replace("\\", "-")
    # Replace colons with hyphens
    name = name.replace(":", "-")
    # Remove/replace other forbidden SharePoint characters
    for c in '*?"<>|':
        name = name.replace(c, "_")
    # Strip any leading/trailing spaces or dots
    name = name.strip(" .")
    return name


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
            return [
                {
                    "id": str(v.id),
                    "name": v.name,
                    "imo": v.imo,
                    "shipyard": v.shipyard,
                    "hull_number": v.hull_number,
                    "vessel_type": v.vessel_type,
                }
                for v in rows
            ]

    # Characters that SharePoint / OneDrive forbid in folder names.
    _ILLEGAL_NAME_CHARS = set('/\\:*?"<>|')

    async def create_vessel(self, name, imo, shipyard=None, hull_number=None, vessel_type=None):
        name = (name or "").strip()
        name = sanitize_folder_name(name)
        imo = (imo or "").strip()
        if not name:
            raise BadRequest("Vessel name is required")
        if imo and (not imo.isdigit() or len(imo) != 7):
            raise BadRequest("IMO number must be exactly 7 digits")
        normalized_name = normalize_vessel_name(name)
        with SessionLocal() as db:
            existing = db.query(models.Vessel).filter(
                func.lower(
                    func.replace(
                        func.replace(
                            func.replace(
                                func.replace(models.Vessel.name, ' ', ''),
                                '_', ''
                            ),
                            "'", ''
                        ),
                        '"', ''
                    )
                ) == normalized_name
            ).first()
            if existing:
                raise Conflict("Vessel name already exists.")
            if imo and db.query(models.Vessel).filter_by(imo=imo).first():
                raise Conflict("A vessel with that IMO number already exists")

        await self.ensure_base_structure()
        drive_id = await self._drive()
        # Create the vessel row + capture main folder ids, then release the session.
        with SessionLocal() as db:
            vessel = models.Vessel(
                name=name,
                imo=imo or None,
                shipyard=shipyard,
                hull_number=hull_number,
                vessel_type=vessel_type,
            )
            db.add(vessel)
            db.flush()
            vessel_id, vname, vimo = vessel.id, vessel.name, vessel.imo
            vshipyard, vhull, vtype = vessel.shipyard, vessel.hull_number, vessel.vessel_type
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

        try:
            await asyncio.gather(*(provision_main(m) for m in template.MAIN_FOLDERS))
        except Exception as provision_err:
            # Roll back: remove the vessel row so the user can retry.
            with SessionLocal() as db:
                orphan = db.query(models.Vessel).filter_by(id=vessel_id).one_or_none()
                if orphan:
                    db.delete(orphan)
                    db.commit()
            raise BadRequest(
                f"Could not provision SharePoint folders for vessel '{name}'. "
                f"Please try again. ({type(provision_err).__name__}: {provision_err})"
            ) from provision_err

        return {
            "id": str(vessel_id),
            "name": vname,
            "imo": vimo,
            "shipyard": vshipyard,
            "hull_number": vhull,
            "vessel_type": vtype,
        }

    async def reprovision_vessel(self, vessel_id: str) -> dict:
        """Idempotently re-run folder provisioning for an existing vessel.

        Safe to call at any time: `ensure_folder` is a create-or-fetch operation,
        so existing folders are left untouched and only missing ones are created.
        """
        await self.ensure_base_structure()
        drive_id = await self._drive()

        with SessionLocal() as db:
            vessel = db.query(models.Vessel).filter_by(id=vessel_id).one_or_none()
            if vessel is None:
                raise NotFound(f"Vessel {vessel_id!r} not found")
            name = vessel.name
            vid = vessel.id
            main_ids = {
                m: db.query(models.Folder).filter_by(path=m).one().drive_item_id
                for m in template.MAIN_FOLDERS
            }

        async def reprovision_main(main):
            ship = await gd.ensure_folder(drive_id, main_ids[main], name)
            ship_path = f"{main}/{name}"
            with SessionLocal() as db:
                self._upsert(db, ship_path, name, "ship", ship["id"], False, vid)
                db.commit()
            await asyncio.gather(
                *(
                    self._ensure_node(drive_id, ship["id"], ship_path, spec, vid)
                    for spec in template.SHIP_TEMPLATE[main]
                )
            )

        await asyncio.gather(*(reprovision_main(m) for m in template.MAIN_FOLDERS))
        return {"ok": True, "vessel_id": vessel_id, "name": name}

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
                # The drive_item_id is stale — remove it from the DB cache so it
                # doesn't block future lookups, then tell the caller the folder is gone.
                with SessionLocal() as db:
                    stale = db.query(models.Folder).filter_by(drive_item_id=folder_id).one_or_none()
                    if stale:
                        db.delete(stale)
                        db.commit()
                raise NotFound(
                    f"Folder '{parent_path.split('/')[-1] if parent_path else folder_id}' "
                    "could not be found in SharePoint. It may have been deleted or moved. "
                    "Please navigate back and refresh."
                )
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
                        "size": it.get("size"),
                        "modified": it.get("lastModifiedDateTime"),
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
    async def _check_global_duplicate(
        self,
        drive_id: str,
        filename: str,
        target_folder_id: str,
        target_folder_path: str | None = None,
    ):
        """Check ALL folders in the entire container/drive for a file with the same name.
        Uses list items with webUrl to identify duplicates across all main folders and subfolders.

        Raises Conflict with a clear message when a duplicate is found.
        Any DB or Graph error is swallowed so infrastructure issues never block an upload.
        """
        from urllib.parse import unquote
        from ..graph.client import graph

        try:
            items = []
            url = f"/drives/{drive_id}/list/items?$top=1000"
            while url:
                data = await graph().get(url)
                items.extend(data.get("value", []))
                url = data.get("@odata.nextLink")
        except Exception:
            return  # degrade gracefully if Graph API fails

        name_lc = filename.lower()
        # Normalize target folder path for comparison
        target_norm = (
            target_folder_path.lower().replace(" ", "").replace("\\", "/").strip("/")
            if target_folder_path
            else None
        )

        for item in items:
            web_url = item.get("webUrl", "")
            web_url_decoded = unquote(web_url)
            
            # Find document library in url case-insensitively
            doc_lib_marker = "/document library/"
            idx = web_url_decoded.lower().find(doc_lib_marker)
            if idx == -1:
                continue
                
            rel_path = web_url_decoded[idx + len(doc_lib_marker):].replace("\\", "/").strip("/")
            if not rel_path:
                continue

            path_segments = [p.strip() for p in rel_path.split("/") if p.strip()]
            if not path_segments:
                continue

            found_filename = path_segments[-1]
            found_folder_path = "/".join(path_segments[:-1])
            found_folder_norm = found_folder_path.lower().replace(" ", "").strip("/")

            # Check if this item matches our duplicate filename
            if found_filename.lower() == name_lc:
                # If it's in a different folder (or checking all folders), raise Conflict
                if target_norm is None or found_folder_norm != target_norm:
                    parts_folder = [p.strip() for p in found_folder_path.split("/") if p.strip()]
                    if len(parts_folder) >= 2:
                        main_folder = parts_folder[0]
                        vessel_name = parts_folder[1]
                        leaf_folder = parts_folder[-1]
                        msg = (
                            f"Duplicate files upload, file already exists in folder '{leaf_folder}' "
                            f"under main folder '{main_folder}' and vessel '{vessel_name}'"
                        )
                    elif parts_folder:
                        msg = f"Duplicate files upload, file already exists in folder '{parts_folder[0]}'"
                    else:
                        msg = f"Duplicate files upload, file already exists in another folder"
                    raise Conflict(msg)

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
            # Build a descriptive message showing where the file lives
            parts = [p.strip() for p in path.split("/") if p.strip()]
            if len(parts) >= 2:
                main_folder = parts[0]
                vessel_name = parts[1]
                leaf_folder = parts[-1]
                msg = (
                    f"Duplicate files upload, file already exists in folder '{leaf_folder}' "
                    f"under main folder '{main_folder}' and vessel '{vessel_name}'"
                )
            elif parts:
                msg = f"Duplicate files upload, file already exists in folder '{parts[-1]}'"
            else:
                msg = f"Duplicate files upload, '{filename}' already exists in this folder"
            raise Conflict(msg)
        # Pass the folder's own path so _check_global_duplicate can scope by vessel
        await self._check_global_duplicate(drive_id, filename, folder_id, path)
        await gd.upload_file(drive_id, folder_id, filename, content, content_type)
        return self._make_job(filename, f"{path}/{filename}", None)


    async def delete_folder(self, folder_id: str) -> bool:
        """Delete a folder and all its contents via Graph API."""
        drive_id = await self._drive()
        from ..graph import drive as _gd

        # Resolve the logical path of this folder from SQLite cache before deleting
        with SessionLocal() as db:
            folder_row = db.query(models.Folder).filter(models.Folder.drive_item_id == folder_id).first()
            folder_path = folder_row.path if folder_row else None

        await _gd.delete_item(drive_id, folder_id)

        # Remove the folder and all of its descendant folders from the database cache
        with SessionLocal() as db:
            if folder_path:
                rows = (
                    db.query(models.Folder)
                    .filter((models.Folder.path == folder_path) | (models.Folder.path.like(f"{folder_path}/%")))
                    .all()
                )
            else:
                rows = (
                    db.query(models.Folder)
                    .filter(models.Folder.drive_item_id == folder_id)
                    .all()
                )
            for row in rows:
                db.delete(row)
            db.commit()
        return True

    async def create_subfolder(self, folder_id: str, name: str) -> dict:
        """Manually create a named sub-folder inside a month_driven folder,
        then provision its category children from the template."""
        from .normalize import clean_folder_name
        name = clean_folder_name(name)
        if not name:
            raise BadRequest("Folder name is required")
        if not any(c.isalpha() for c in name):
            raise BadRequest("Folder name must contain alphabetic characters (letters)")
        name = sanitize_folder_name(name)
        drive_id = await self._drive()
        parent_path = await self._folder_path(drive_id, folder_id)
        parent_parts = parent_path.split("/") if parent_path else []
        parent_flags = classify(parent_parts)
        if not parent_flags.get("month_driven"):
            raise BadRequest("Can only create sub-folders inside month-driven folders")
        
        # Check for duplicate folder names (case-insensitive and normalized)
        from .normalize import normalize_folder_name
        normalized_new_name = normalize_folder_name(name)
        existing_items = await gd.list_children(drive_id, folder_id)
        for it in existing_items:
            if "folder" in it:
                if normalize_folder_name(it["name"]) == normalized_new_name:
                    raise Conflict(f"A folder with a similar name '{it['name']}' already exists here (ignoring casing, spaces, and special characters)")

        new_item = await gd.ensure_folder(drive_id, folder_id, name)
        mpath = f"{parent_path}/{name}"
        cats = parent_flags.get("categories", [])
        with SessionLocal() as db:
            parent_row = self._folder_by_item(db, folder_id)
            vessel_id = parent_row.vessel_id if parent_row else None
            self._upsert(db, mpath, name, "month", new_item["id"], False, vessel_id)
            for cat_name in cats:
                cat_item = await gd.ensure_folder(drive_id, new_item["id"], cat_name)
                self._upsert(db, f"{mpath}/{cat_name}", cat_name, "leaf",
                             cat_item["id"], False, vessel_id)
            db.commit()
        return {
            "id": new_item["id"],
            "name": name,
            "kind": "month",
            "upload": True,
            "month_driven": False,
            "has_children": bool(cats),
        }

    async def month_upload(self, folder_id, filename, category, content, content_type):
        drive_id = await self._drive()
        md_path = await self._folder_path(drive_id, folder_id)
        md_parts = md_path.split("/")
        flags = classify(md_parts)
        if not flags.get("month_driven"):
            raise BadRequest("This folder is not a month-driven folder")
        categories = flags.get("categories", [])
        md_spec = {"month_children": [{"name": c, "kind": "leaf"} for c in categories]}

        # Check duplicate first globally before anything else
        await self._check_global_duplicate(drive_id, filename, "")

        # Check fitz (PyMuPDF) and paddleocr installations explicitly
        try:
            import fitz
            from paddleocr import PaddleOCR
        except (ImportError, ModuleNotFoundError) as ocr_err:
            raise InternalServerError(
                "Extraction pdf is not working and so upload not possible kindly create the manual folder and contact technical support team for installation"
            ) from ocr_err

        try:
            detected = await asyncio.to_thread(
                detect_document_month, content, filename, content_type or ""
            )
        except Exception as ocr_err:
            # If any other error occurs (corrupt file, paddleocr missing, etc.), treat as empty page / no text
            raise InternalServerError("text is empty and no content so there is no effective date") from ocr_err

        # Check the detection results
        if detected.get("text_empty"):
            raise InternalServerError("text is empty and no content so there is no effective date")
        if detected.get("year") is None:
            raise InternalServerError("effective or issue date is not there in the file")

        # 1. Determine target folder path and dest_path beforehand
        y, m = detected["year"], detected["month"]
        detected_label = detected["label"]
        cat_name = category if category in categories else "To be Classified"
        target_folder_path = f"{md_path}/{detected_label}/{cat_name}"
        dest_path = f"{md_path}/{detected_label}/{cat_name}/{filename}"


        # 2. Check duplicate in the specific target folder if it exists
        # Check target folder directly if it already exists in the DB cache
        with SessionLocal() as db:
            existing_folder = db.query(models.Folder).filter_by(path=target_folder_path).one_or_none()
            if existing_folder:
                existing_file = await gd.find_child(drive_id, existing_folder.drive_item_id, filename)
                if existing_file and "file" in existing_file:
                    parts = [p.strip() for p in target_folder_path.split("/") if p.strip()]
                    if len(parts) >= 2:
                        main_folder = parts[0]
                        vessel_name = parts[1]
                        leaf_folder = parts[-1]
                        msg = (
                            f"Duplicate files upload, file already exists in folder '{leaf_folder}' "
                            f"under main folder '{main_folder}' and vessel '{vessel_name}'"
                        )
                    elif parts:
                        msg = f"Duplicate files upload, file already exists in folder '{parts[-1]}'"
                    else:
                        msg = f"Duplicate files upload, '{filename}' already exists in this folder"
                    raise Conflict(msg)

        # 3. Create/provision folders only when there is no duplicate conflict
        with SessionLocal() as db:
            if detected["year"] is None:
                target = await gd.ensure_folder(drive_id, folder_id, "To be Classified")
                self._upsert(
                    db, f"{md_path}/To be Classified", "To be Classified", "leaf",
                    target["id"], False, None,
                )
                target_id = target["id"]
            else:
                y, m = detected["year"], detected["month"]
                month_item = await self._ensure_month(
                    db, drive_id, folder_id, md_path, md_spec, y, m, None
                )
                cat_name = category if category in categories else "To be Classified"
                cat_item = await gd.ensure_folder(drive_id, month_item["id"], cat_name)
                target_id = cat_item["id"]
            db.commit()

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

    async def archive_item(self, item_id: str, item_type: str):
        with SessionLocal() as db:
            row = db.query(models.ArchivedItem).filter_by(item_id=item_id).one_or_none()
            if not row:
                row = models.ArchivedItem(item_id=item_id, item_type=item_type)
                db.add(row)
                db.commit()

    async def restore_item(self, item_id: str):
        with SessionLocal() as db:
            row = db.query(models.ArchivedItem).filter_by(item_id=item_id).one_or_none()
            if row:
                db.delete(row)
                db.commit()

    async def get_archived_ids(self) -> list[str]:
        with SessionLocal() as db:
            rows = db.query(models.ArchivedItem).all()
            return [r.item_id for r in rows]

    async def get_archived_nodes(self):
        drive_id = await self._drive()
        ids = await self.get_archived_ids()
        out = []
        for i in ids:
            try:
                it = await gd.get_item(drive_id, i)
                is_folder = "folder" in it
                kind = "folder" if is_folder else "file"

                # Derive logical path and main folder from parentReference
                ref = (it.get("parentReference") or {}).get("path", "")
                rel = ref.split("root:", 1)[1].lstrip("/") if "root:" in ref else ""
                original_path = f"{rel}/{it['name']}".strip("/") if rel else it["name"]
                main_folder = original_path.split("/", 1)[0] if "/" in original_path else original_path

                node = {
                    "id": it["id"],
                    "name": it["name"],
                    "kind": kind,
                    "upload": False,
                    "month_driven": False,
                    "has_children": is_folder and it.get("folder", {}).get("childCount", 0) > 0,
                    "main_folder": main_folder,
                    "original_path": original_path,
                }
                if not is_folder:
                    node["ext"] = it["name"].rsplit(".", 1)[-1].lower() if "." in it["name"] else ""
                    node["size"] = it.get("size")
                    node["modified"] = it.get("lastModifiedDateTime")
                out.append(node)
            except Exception:
                pass
        return out

    async def get_deleted_ids(self) -> list[str]:
        try:
            url = f"/storage/fileStorage/containers/{settings.container_id}/recycleBin/items"
            data = await graph().get(url)
            items = data.get("value", [])
            return [it["id"] for it in items]
        except Exception:
            return []

    async def get_deleted_nodes(self):
        try:
            url = f"/storage/fileStorage/containers/{settings.container_id}/recycleBin/items"
            data = await graph().get(url)
            items = data.get("value", [])
            out = []
            for it in items:
                name = it["name"]
                is_folder = "." not in name
                kind = "folder" if is_folder else "file"

                # Parse main folder and original path from deletedFromLocation
                loc = it.get("deletedFromLocation", "")
                main_folder = ""
                original_path = ""
                if "Document Library/" in loc:
                    rel_part = loc.split("Document Library/", 1)[1]
                    original_path = rel_part
                    if "/" in rel_part:
                        main_folder = rel_part.split("/", 1)[0]
                    else:
                        main_folder = rel_part

                node = {
                    "id": it["id"],
                    "name": name,
                    "kind": kind,
                    "upload": False,
                    "month_driven": False,
                    "has_children": False,
                    "main_folder": main_folder,
                    "original_path": original_path,
                }
                if not is_folder:
                    node["ext"] = name.rsplit(".", 1)[-1].lower() if "." in name else ""
                    node["size"] = it.get("size")
                    node["modified"] = it.get("deletedDateTime") or it.get("lastModifiedDateTime")
                out.append(node)
            return out
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Failed to get deleted nodes: {e}")
            return []

    async def restore_deleted_item(self, item_id: str) -> bool:
        url = f"/storage/fileStorage/containers/{settings.container_id}/recycleBin/items/restore"
        try:
            await graph().post(url, json={"ids": [item_id]})
            return True
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Failed to restore deleted item {item_id}: {e}")
            return False

    async def permanent_delete_item(self, item_id: str, item_type: str) -> bool:
        url = f"/storage/fileStorage/containers/{settings.container_id}/recycleBin/items/delete"
        try:
            await graph().post(url, json={"ids": [item_id]})
            return True
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Failed to permanently delete item {item_id}: {e}")
            return False

