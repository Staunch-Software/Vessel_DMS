"""Live backend: SharePoint Embedded (Graph) + PostgreSQL + PaddleOCR.

- Provisioning walks the declarative template and creates folders via Graph
  (idempotent), caching each logical-path -> driveItem id in Postgres.
- Uploads go straight to Graph; month-driven uploads run OCR to pick the month,
  auto-create the `{Month YYYY}` folder (+ category sub-folders), and file the doc.
- Folder semantics (kind / upload / month_driven) are derived from the template
  via `classify`, so the UI renders identically to stub mode.
"""
import asyncio
import json
import uuid
from datetime import date, datetime
from sqlalchemy import func, or_ as sa_or

from .. import template
from ..config import settings
from ..db.base import SessionLocal
from ..db import models
from ..graph import drive as gd
from ..graph.client import GraphError, graph
from ..ocr.dates import month_label
from ..ocr.drawing_category import classify_drawing_category
from ..ocr.extract import detect_document_month, extract_text
from .classify import classify
from .errors import BadRequest, Conflict, NotFound, InternalServerError
from .normalize import normalize_vessel_name
from .notify import notify_email

import logging
log = logging.getLogger(__name__)

STAGING_FOLDER_NAME = "Pending Approvals"


def _get_template_node_for_path(main_folder: str, rel_path: list[str]) -> dict | None:
    """Find a node inside the SHIP_TEMPLATE hierarchy (or FLAT_TEMPLATE, for a
    flat shared main folder) matching the given relative path."""
    if main_folder in template.FLAT_MAIN_FOLDERS:
        nodes = template.FLAT_TEMPLATE[main_folder]
    elif main_folder in template.SHIP_TEMPLATE:
        nodes = template.SHIP_TEMPLATE[main_folder]
    else:
        return None

    current_node = {"kind": "folder", "children": nodes}
    
    for segment in rel_path:
        found = None
        children = current_node.get("children", [])
        for child in children:
            if child.get("name", "").lower() == segment.lower():
                found = child
                break
        if not found:
            return None
        current_node = found
        
    return current_node


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
        self._staging_id = None

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

    async def _staging_folder(self, drive_id: str) -> str:
        """Idempotent "Pending Approvals" holding area, outside the ship/main
        folder hierarchy — not tracked in the `folders` cache since it isn't
        part of the document template and shouldn't appear in the explorer."""
        if not self._staging_id:
            root = await gd.get_root_item_id(drive_id)
            item = await gd.ensure_folder(drive_id, root, STAGING_FOLDER_NAME)
            self._staging_id = item["id"]
        return self._staging_id

    async def _stage_file(self, drive_id, filename, content, content_type) -> str:
        staging_id = await self._staging_folder(drive_id)
        staged_name = f"{uuid.uuid4().hex[:12]}__{filename}"
        item = await gd.upload_file(drive_id, staging_id, staged_name, content, content_type)
        return item["id"]

    async def _resolve_reject_target(self, drive_id, destination_folder_id) -> str:
        """The sibling fallback folder for a rejected upload — found inside
        the same parent as the originally-selected destination. Reuses
        whichever fallback-named leaf already exists there ("To be
        Classified", "Other Drawings", or "Other Manuals"); if the
        destination itself already is one of those, reuse it as-is."""
        item = await gd.get_item(drive_id, destination_folder_id)
        if item.get("name", "").strip().lower() in template.FALLBACK_LEAF_NAMES:
            return destination_folder_id
        parent_id = (item.get("parentReference") or {}).get("id")
        if not parent_id:
            return destination_folder_id  # fallback: reuse destination
        siblings = await gd.list_children(drive_id, parent_id)
        existing = next(
            (s for s in siblings if s.get("name", "").strip().lower() in template.FALLBACK_LEAF_NAMES),
            None,
        )
        if existing:
            return existing["id"]
        tbc = await gd.ensure_folder(drive_id, parent_id, "To be Classified")
        parent_path = await self._folder_path(drive_id, parent_id)
        with SessionLocal() as db:
            self._upsert(
                db, f"{parent_path}/To be Classified", "To be Classified", "leaf",
                tbc["id"], False, None,
            )
            db.commit()
        return tbc["id"]

    async def _resolve_drawing_target(self, drive_id, folder_id, path, filename, content, content_type):
        """OCR the document and match it against the Drawings sub-categories;
        fall back to "Other Drawings" (never "To be Classified") when nothing
        matches. See ocr/drawing_category.py."""
        text = await asyncio.to_thread(extract_text, content, filename, content_type or "")
        category = classify_drawing_category(text)
        target_name = category or "Other Drawings"
        target = await gd.ensure_folder(drive_id, folder_id, target_name)
        target_path = f"{path}/{target_name}"
        with SessionLocal() as db:
            self._upsert(db, target_path, target_name, "leaf", target["id"], False, None)
            db.commit()
        return target["id"], target_path

    def _upsert(self, db, path, name, kind, item_id, month_driven, vessel_id):
        row = db.query(models.Folder).filter_by(path=path).one_or_none()
        if row is None:
            # Also check by drive_item_id to avoid duplicates after renames
            row = db.query(models.Folder).filter_by(drive_item_id=item_id).one_or_none()
            if row is not None:
                # Update path to the new one if it changed
                old_path_row = db.query(models.Folder).filter_by(path=path).one_or_none()
                if old_path_row and old_path_row.id != row.id:
                    db.delete(old_path_row)
                row.path = path
            else:
                row = models.Folder(path=path)
                db.add(row)
        row.name = name
        row.kind = kind
        row.drive_item_id = item_id
        row.month_driven = month_driven
        if vessel_id is not None:
            row.vessel_id = vessel_id
        elif row.vessel_id is None and kind == "ship":
            # Auto-link: try to find a vessel whose name matches this ship folder
            vessel = db.query(models.Vessel).filter(
                func.lower(models.Vessel.name) == func.lower(name)
            ).one_or_none()
            if vessel:
                row.vessel_id = vessel.id
        return row

    def _folder_by_item(self, db, item_id):
        return db.query(models.Folder).filter_by(drive_item_id=item_id).one_or_none()

    async def _folder_path(self, drive_id, folder_id) -> str:
        with SessionLocal() as db:
            row = self._folder_by_item(db, folder_id)
            if row:
                return row.path
        # Fallback: derive from Graph parentReference (fetch only needed fields).
        item = await gd.get_item(drive_id, folder_id, select="id,name,parentReference")
        ref = (item.get("parentReference") or {}).get("path", "")
        rel = ref.split("root:", 1)[1].lstrip("/") if "root:" in ref else ""
        return f"{rel}/{item['name']}".strip("/") if rel else item["name"]

    # ---------------------------------------------------------- admin/activity
    def _is_admin(self, email: str | None) -> bool:
        return (email or "").strip().lower() in settings.admin_email_set

    def _display(self, email: str | None, name: str | None) -> str:
        if name:
            return name
        if email:
            return email.split("@")[0]
        return "A user"

    async def _resolve_department_vessel(self, folder_id: str):
        """(department, vessel_id, vessel_name, folder_name) for a folder in
        the template hierarchy, derived from its cached path + vessel_id."""
        with SessionLocal() as db:
            row = self._folder_by_item(db, folder_id)
            if row is not None:
                department = row.path.split("/")[0] if row.path else "All Departments"
                vessel_name = None
                if row.vessel_id:
                    v = db.query(models.Vessel).filter_by(id=row.vessel_id).one_or_none()
                    vessel_name = v.name if v else None
                return department, row.vessel_id, vessel_name, row.name
        drive_id = await self._drive()
        path = await self._folder_path(drive_id, folder_id)
        parts = path.split("/") if path else []
        department = parts[0] if parts else "All Departments"
        name = parts[-1] if parts else folder_id
        return department, None, None, name

    async def _admin_or_pending(
        self,
        *,
        action_type: str,
        requesting_email: str | None,
        requesting_name: str | None,
        department: str | None,
        vessel_id=None,
        vessel_name: str | None = None,
        target_id: str | None = None,
        target_description: str | None = None,
        payload: dict,
        changes: list[dict] | None = None,
        pending_message: str,
        activity_message: str,
        execute,
    ) -> dict:
        """Gate a mutating action on admin status.

        SPE Admins: run `execute()` immediately and record it as a completed
        activity notification. Everyone else: create a pending approval and
        defer `execute()`-equivalent work until an admin approves it (see
        approve_request's action_type branching below).
        """
        if self._is_admin(requesting_email):
            result = await execute()
            await self._create_activity(
                action_type=action_type,
                requesting_email=requesting_email or "",
                requesting_name=requesting_name,
                department=department,
                vessel_id=vessel_id,
                vessel_name=vessel_name,
                target_id=target_id,
                target_description=target_description,
                payload=payload,
                changes=changes,
                message=activity_message,
            )
            return {"status": "completed", "message": activity_message, "result": result}
        approval = await self._create_pending_action(
            action_type=action_type,
            requesting_email=requesting_email or "",
            requesting_name=requesting_name,
            department=department,
            vessel_id=vessel_id,
            vessel_name=vessel_name,
            target_id=target_id,
            target_description=target_description,
            payload=payload,
            changes=changes,
            message=pending_message,
        )
        return {"status": "pending", "approval_id": approval["id"], "message": pending_message}

    async def _create_activity(
        self, *, action_type, requesting_email, requesting_name=None,
        department=None, vessel_id=None, vessel_name=None, target_id=None,
        target_description=None, payload=None, changes=None, message=None,
        filename=None, content_type=None, destination_folder_id=None,
        destination_path=None, is_month_upload=False, category=None,
        detected_month=None, final_path=None, size=0,
    ):
        with SessionLocal() as db:
            row = models.ApprovalRequest(
                filename=filename,
                content_type=content_type,
                size=size,
                uploaded_by_email=requesting_email,
                uploaded_by_name=requesting_name or "",
                destination_folder_id=destination_folder_id,
                destination_path=destination_path,
                is_month_upload=is_month_upload,
                category=category,
                detected_month=detected_month,
                status="completed",
                entry_kind="activity",
                action_type=action_type,
                department=department,
                vessel_id=int(vessel_id) if vessel_id else None,
                vessel_name=vessel_name,
                target_id=target_id,
                target_description=target_description,
                payload_json=json.dumps(payload or {}),
                changes_json=json.dumps(changes or []),
                message=message,
                decided_by_email=requesting_email,
                decided_at=datetime.utcnow(),
                final_path=final_path,
            )
            db.add(row)
            db.commit()
            db.refresh(row)
            return self._approval_public(row)

    async def _create_pending_action(
        self, *, action_type, requesting_email, requesting_name=None,
        department=None, vessel_id=None, vessel_name=None, target_id=None,
        target_description=None, payload=None, changes=None, message=None,
    ):
        with SessionLocal() as db:
            row = models.ApprovalRequest(
                uploaded_by_email=requesting_email,
                uploaded_by_name=requesting_name or "",
                status="pending",
                entry_kind="approval",
                action_type=action_type,
                department=department,
                vessel_id=int(vessel_id) if vessel_id else None,
                vessel_name=vessel_name,
                target_id=target_id,
                target_description=target_description,
                payload_json=json.dumps(payload or {}),
                changes_json=json.dumps(changes or []),
                message=message,
            )
            db.add(row)
            db.commit()
            db.refresh(row)
            return self._approval_public(row)

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
            existing_rows = {
                r.path: r
                for r in db.query(models.Folder).filter_by(kind="main")
            }
            missing = [m for m in template.MAIN_FOLDERS if m not in existing_rows]
            if not missing:
                self._base_ready = True
                return
            root = await gd.get_root_item_id(drive_id)
            main_items = {}
            for main in template.MAIN_FOLDERS:
                row = existing_rows.get(main)
                if row is not None and row.drive_item_id:
                    main_items[main] = row.drive_item_id
                    continue

                item = await gd.ensure_folder(drive_id, root, main)
                self._upsert(db, main, main, "main", item["id"], False, None)
                main_items[main] = item["id"]
            db.commit()
        # Subtrees for all mains, concurrently — flat mains get their spec
        # list placed directly under the main folder; the rest get their
        # single "Common for all ships" subtree.
        tasks = []
        for main in template.MAIN_FOLDERS:
            if main in template.FLAT_MAIN_FOLDERS:
                tasks.extend(
                    self._ensure_node(drive_id, main_items[main], main, spec, None)
                    for spec in template.FLAT_TEMPLATE[main]
                )
            else:
                tasks.append(
                    self._ensure_node(
                        drive_id, main_items[main], main, template.COMMON_TEMPLATE[main], None
                    )
                )
        await asyncio.gather(*tasks)
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

    def _validate_vessel_input(self, name, imo, exclude_vessel_id=None):
        name = (name or "").strip()
        name = sanitize_folder_name(name)
        imo = (imo or "").strip()
        if not name:
            raise BadRequest("Vessel name is required")
        if not imo:
            raise BadRequest("IMO number is required")
        if not imo.isdigit() or len(imo) != 7:
            raise BadRequest("IMO number must be exactly 7 digits")
        normalized_name = normalize_vessel_name(name)
        with SessionLocal() as db:
            q = db.query(models.Vessel).filter(
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
            )
            if exclude_vessel_id:
                q = q.filter(models.Vessel.id != int(exclude_vessel_id))
            if q.first():
                raise Conflict("Vessel name already exists.")
            imo_q = db.query(models.Vessel).filter_by(imo=imo)
            if exclude_vessel_id:
                imo_q = imo_q.filter(models.Vessel.id != int(exclude_vessel_id))
            if imo_q.first():
                raise Conflict("A vessel with that IMO number already exists")
        return name, imo

    async def create_vessel(
        self, name, imo, shipyard=None, hull_number=None, vessel_type=None,
        requesting_email=None, requesting_name=None,
    ):
        """Creating a vessel never requires approval — for anyone, admin or
        not. It always executes immediately and is always recorded as a
        completed activity entry for audit purposes."""
        clean_name, clean_imo = self._validate_vessel_input(name, imo)
        payload = {
            "name": clean_name, "imo": clean_imo, "shipyard": shipyard,
            "hull_number": hull_number, "vessel_type": vessel_type,
        }
        display = self._display(requesting_email, requesting_name)
        vessel = await self._provision_vessel(payload)
        activity_message = (
            f"{display} ({requesting_email}) created vessel '{clean_name}'. "
            f"No approval was required."
        )
        await self._create_activity(
            action_type="create_vessel",
            requesting_email=requesting_email or "",
            requesting_name=requesting_name,
            department="All Departments",
            target_description=clean_name,
            payload=payload,
            message=activity_message,
        )
        return {"status": "completed", "message": activity_message, "result": vessel}

    async def _provision_vessel(self, payload):
        # Re-validate at execution time — covers the approve-time path, where
        # the name/IMO may have been taken by someone else since the request
        # was filed.
        name, imo = self._validate_vessel_input(payload["name"], payload["imo"])
        shipyard = payload.get("shipyard")
        hull_number = payload.get("hull_number")
        vessel_type = payload.get("vessel_type")

        await self.ensure_base_structure()
        drive_id = await self._drive()
        # Create the vessel row + capture main folder ids, then release the session.
        with SessionLocal() as db:
            vessel = models.Vessel(
                name=name,
                imo=imo,
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

        try:
            await asyncio.gather(*(
                provision_main(m) for m in template.MAIN_FOLDERS
                if m not in template.FLAT_MAIN_FOLDERS
            ))
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

    def _validate_vessel_update(self, vessel_id, name, imo, shipyard, hull_number, vessel_type):
        with SessionLocal() as db:
            vessel = db.query(models.Vessel).filter_by(id=int(vessel_id)).first()
            if not vessel:
                raise NotFound("Vessel not found")
            old_values = {
                "name": vessel.name, "imo": vessel.imo, "shipyard": vessel.shipyard,
                "hull_number": vessel.hull_number, "vessel_type": vessel.vessel_type,
            }
        old_name, old_imo = old_values["name"], old_values["imo"]

        new_name = name.strip() if name is not None else None
        if new_name is not None:
            new_name = sanitize_folder_name(new_name)
        new_imo = imo.strip() if imo is not None else None

        if new_name is not None and new_name == "":
            raise BadRequest("Vessel name cannot be empty")
        if new_imo is not None and new_imo == "":
            raise BadRequest("IMO number cannot be empty")
        if new_imo and (not new_imo.isdigit() or len(new_imo) != 7):
            raise BadRequest("IMO number must be exactly 7 digits")

        if new_name and new_name.lower() != old_name.lower():
            normalized_name = normalize_vessel_name(new_name)
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
                    ) == normalized_name,
                    models.Vessel.id != int(vessel_id),
                ).first()
                if existing:
                    raise Conflict("Vessel name already exists.")

        if new_imo and new_imo != old_imo:
            with SessionLocal() as db:
                if db.query(models.Vessel).filter(
                    models.Vessel.imo == new_imo, models.Vessel.id != int(vessel_id)
                ).first():
                    raise Conflict("A vessel with that IMO number already exists")

        return old_values, new_name, new_imo

    async def update_vessel(
        self, vessel_id: str, name: str | None = None, imo: str | None = None,
        shipyard: str | None = None, hull_number: str | None = None, vessel_type: str | None = None,
        requesting_email=None, requesting_name=None,
    ):
        old_values, new_name, new_imo = self._validate_vessel_update(
            vessel_id, name, imo, shipyard, hull_number, vessel_type
        )
        changes = []
        if new_name and new_name != old_values["name"]:
            changes.append({"field": "Name", "old": old_values["name"], "new": new_name})
        if new_imo and new_imo != old_values["imo"]:
            changes.append({"field": "IMO", "old": old_values["imo"], "new": new_imo})
        if shipyard is not None and (shipyard.strip() or None) != old_values["shipyard"]:
            changes.append({"field": "Shipyard", "old": old_values["shipyard"], "new": shipyard.strip() or None})
        if hull_number is not None and (hull_number.strip() or None) != old_values["hull_number"]:
            changes.append({"field": "Hull Number", "old": old_values["hull_number"], "new": hull_number.strip() or None})
        if vessel_type is not None and (vessel_type.strip() or None) != old_values["vessel_type"]:
            changes.append({"field": "Vessel Type", "old": old_values["vessel_type"], "new": vessel_type.strip() or None})

        payload = {
            "vessel_id": vessel_id, "name": new_name, "imo": new_imo,
            "shipyard": shipyard, "hull_number": hull_number, "vessel_type": vessel_type,
        }
        display = self._display(requesting_email, requesting_name)
        change_summary = (
            ", ".join(f"{c['field']} ('{c['old']}' → '{c['new']}')" for c in changes)
            or "no field changes"
        )
        return await self._admin_or_pending(
            action_type="update_vessel",
            requesting_email=requesting_email,
            requesting_name=requesting_name,
            department="All Departments",
            vessel_id=vessel_id,
            vessel_name=old_values["name"],
            target_id=vessel_id,
            target_description=old_values["name"],
            payload=payload,
            changes=changes,
            pending_message=(
                f"{display} ({requesting_email}) is requesting approval to update the "
                f"vessel details for {old_values['name']} ({change_summary})."
            ),
            activity_message=(
                f"SPE Admin ({requesting_email}) updated the vessel details for "
                f"{old_values['name']}. No approval was required."
            ),
            execute=lambda: self._execute_update_vessel(payload),
        )

    async def _execute_update_vessel(self, payload):
        vessel_id = payload["vessel_id"]
        old_values, new_name, new_imo = self._validate_vessel_update(
            vessel_id, payload["name"], payload["imo"],
            payload["shipyard"], payload["hull_number"], payload["vessel_type"],
        )
        old_name = old_values["name"]
        shipyard, hull_number, vessel_type = (
            payload["shipyard"], payload["hull_number"], payload["vessel_type"]
        )

        sp_success = True
        sp_errors = []
        if new_name and new_name != old_name:
            drive_id = await self._drive()
            from ..graph import drive as _gd
            with SessionLocal() as db:
                # Rename all ship folders linked to this vessel in SharePoint
                vessel_folders = db.query(models.Folder).filter_by(vessel_id=int(vessel_id), kind="ship").all()
                for folder in vessel_folders:
                    try:
                        await _gd.graph().patch(f"/drives/{drive_id}/items/{folder.drive_item_id}", json={"name": new_name})
                    except Exception as e:
                        sp_success = False
                        sp_errors.append(f"Folder '{folder.name}': {e}")
                        print(f"Error renaming folder {folder.path} in SharePoint: {e}")

                # Also find orphaned ship folders (vessel_id=None) with the old name
                # and rename + link them to this vessel
                orphaned = db.query(models.Folder).filter(
                    models.Folder.kind == "ship",
                    models.Folder.vessel_id == None,  # noqa: E711
                    func.lower(models.Folder.name) == func.lower(old_name)
                ).all()
                for folder in orphaned:
                    try:
                        await _gd.graph().patch(f"/drives/{drive_id}/items/{folder.drive_item_id}", json={"name": new_name})
                        folder.vessel_id = int(vessel_id)
                    except Exception as e:
                        sp_success = False
                        sp_errors.append(f"Orphaned folder '{folder.name}': {e}")
                        print(f"Error renaming orphaned folder {folder.path} in SharePoint: {e}")
                db.commit()

        with SessionLocal() as db:
            v = db.query(models.Vessel).filter_by(id=int(vessel_id)).one()
            if new_name:
                v.name = new_name
            if new_imo:
                v.imo = new_imo
            if shipyard is not None:
                v.shipyard = shipyard.strip() or None
            if hull_number is not None:
                v.hull_number = hull_number.strip() or None
            if vessel_type is not None:
                v.vessel_type = vessel_type.strip() or None
            
            if new_name and new_name != old_name:
                folders = db.query(models.Folder).filter_by(vessel_id=v.id).all()
                for folder in folders:
                    if folder.kind == "ship" and folder.name == old_name:
                        folder.name = new_name
                    for main in template.MAIN_FOLDERS:
                        old_prefix = f"{main}/{old_name}"
                        new_prefix = f"{main}/{new_name}"
                        if folder.path == old_prefix:
                            folder.path = new_prefix
                        elif folder.path.startswith(f"{old_prefix}/"):
                            folder.path = new_prefix + folder.path[len(old_prefix):]
            db.commit()
            
            v_updated = db.query(models.Vessel).filter_by(id=int(vessel_id)).one()
            return {
                "id": str(v_updated.id),
                "name": v_updated.name,
                "imo": v_updated.imo,
                "shipyard": v_updated.shipyard,
                "hull_number": v_updated.hull_number,
                "vessel_type": v_updated.vessel_type,
                "sp_success": sp_success,
                "sp_errors": sp_errors,
            }

    async def repair_vessel_links(self) -> dict:
        """Scan all ship-kind folders with vessel_id=None and try to link them
        to a vessel row by matching the folder name (case-insensitive).
        Returns a summary of how many were fixed."""
        with SessionLocal() as db:
            # Build name -> vessel_id map
            vessels = db.query(models.Vessel).all()
            name_to_id: dict[str, int] = {v.name.lower(): v.id for v in vessels}

            # Find orphaned ship folders
            orphans = (
                db.query(models.Folder)
                .filter(models.Folder.kind == "ship", models.Folder.vessel_id == None)  # noqa: E711
                .all()
            )
            fixed = 0
            unmatched = []
            for folder in orphans:
                vid = name_to_id.get(folder.name.lower())
                if vid is not None:
                    folder.vessel_id = vid
                    fixed += 1
                else:
                    unmatched.append(folder.name)
            db.commit()
        return {"fixed": fixed, "unmatched": unmatched}

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

        await asyncio.gather(*(
            reprovision_main(m) for m in template.MAIN_FOLDERS
            if m not in template.FLAT_MAIN_FOLDERS
        ))
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

        parts = parent_path.split("/") if parent_path else []

        # Only check for missing template folders when we're inside a vessel
        # subtree (parts >= 2) or a flat main — skip for main-level folders
        # to avoid unnecessary Graph calls on every top-level navigation.
        if parts:
            main_folder = parts[0]
            if main_folder in template.FLAT_MAIN_FOLDERS:
                node_spec = _get_template_node_for_path(main_folder, parts[1:])
            elif len(parts) >= 2:
                node_spec = _get_template_node_for_path(main_folder, parts[2:])
            else:
                node_spec = None

            if node_spec is not None and "children" in node_spec:
                expected_specs = node_spec["children"]
                existing_names = {it["name"].lower() for it in items}
                missing_specs = [
                    spec for spec in expected_specs
                    if spec["name"].lower() not in existing_names
                    and spec.get("kind") != "month_driven"
                ]
                if missing_specs:
                    with SessionLocal() as db:
                        parent_row = self._folder_by_item(db, folder_id)
                        vessel_id = parent_row.vessel_id if parent_row else None

                    async def create_missing(spec):
                        try:
                            item = await gd.ensure_folder(drive_id, folder_id, spec["name"])
                            path = f"{parent_path}/{spec['name']}"
                            with SessionLocal() as db:
                                self._upsert(
                                    db, path, spec["name"], spec["kind"], item["id"],
                                    spec["kind"] == "month_driven", vessel_id
                                )
                                db.commit()
                            return item
                        except Exception as create_err:
                            log.warning("On-demand folder creation failed for %s: %s", spec["name"], create_err)
                            return None

                    created_items = await asyncio.gather(*(create_missing(spec) for spec in missing_specs))
                    for item in created_items:
                        if item:
                            items.append(item)

        parent_parts = parts
        out = []

        # Determine if any item in this listing could be a ship folder
        # (only true when parent is a main folder, i.e. parts length == 1).
        # Avoid the JOIN query entirely for deeper levels.
        is_main_level = len(parts) == 1

        with SessionLocal() as db:
            parent_row = self._folder_by_item(db, folder_id)
            parent_vessel_id = parent_row.vessel_id if parent_row else None

            # Only load ship->vessel name map when at main-folder level
            ship_id_to_name: dict[str, str] = {}
            if is_main_level:
                ship_rows = (
                    db.query(models.Folder.drive_item_id, models.Vessel.name)
                    .join(models.Vessel, models.Folder.vessel_id == models.Vessel.id)
                    .filter(models.Folder.kind == "ship")
                    .all()
                )
                ship_id_to_name = {
                    row.drive_item_id: row.name for row in ship_rows if row.drive_item_id
                }

            for it in items:
                sharepoint_name = it["name"]
                if "folder" in it:
                    child_parts = parent_parts + [sharepoint_name]
                    flags = classify(child_parts)
                    vessel_id = parent_vessel_id

                    if flags["kind"] == "ship":
                        existing = (
                            db.query(models.Folder)
                            .filter_by(drive_item_id=it["id"])
                            .one_or_none()
                        )
                        if existing and existing.vessel_id:
                            vessel_id = existing.vessel_id

                    self._upsert(
                        db, "/".join(child_parts), sharepoint_name, flags["kind"], it["id"],
                        flags["month_driven"], vessel_id,
                    )

                    display_name = sharepoint_name
                    if flags["kind"] == "ship" and it["id"] in ship_id_to_name:
                        display_name = ship_id_to_name[it["id"]]

                    node = {
                        "id": it["id"],
                        "name": display_name,
                        **flags,
                        "has_children": (it.get("folder") or {}).get("childCount", 0) > 0,
                    }
                else:
                    ext = sharepoint_name.rsplit(".", 1)[-1].lower() if "." in sharepoint_name else ""
                    node = {
                        "id": it["id"],
                        "name": sharepoint_name,
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

    async def upload(self, folder_id, filename, content, content_type, uploaded_by_email, uploaded_by_name):
        """Non-admin uploads stage a pending approval exactly as before.
        SPE Admin uploads are filed immediately and recorded as an activity
        notification instead."""
        drive_id = await self._drive()
        path = await self._folder_path(drive_id, folder_id)
        flags = classify(path.split("/"))
        if flags.get("month_driven"):
            raise BadRequest("Use the month upload for this folder")
        if not flags.get("upload"):
            raise BadRequest("This folder does not accept direct uploads")
        target_id, dest_path = folder_id, path
        if flags.get("kind") == "drawing_classifier":
            target_id, dest_path = await self._resolve_drawing_target(
                drive_id, folder_id, path, filename, content, content_type
            )
        existing = await gd.find_child(drive_id, target_id, filename)
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

        department, vessel_id, vessel_name, _ = await self._resolve_department_vessel(target_id)
        display = self._display(uploaded_by_email, uploaded_by_name)

        if self._is_admin(uploaded_by_email):
            item = await gd.upload_file(drive_id, target_id, filename, content, content_type)
            approval = await self._create_activity(
                action_type="upload",
                requesting_email=uploaded_by_email or "",
                requesting_name=uploaded_by_name,
                department=department,
                vessel_id=vessel_id,
                vessel_name=vessel_name,
                target_id=item["id"],
                target_description=filename,
                payload={},
                message=(
                    f"SPE Admin ({uploaded_by_email}) uploaded '{filename}' to {dest_path}. "
                    f"No approval was required."
                ),
                filename=filename,
                content_type=content_type,
                destination_folder_id=target_id,
                destination_path=dest_path,
                final_path=f"{dest_path}/{filename}",
                size=len(content),
            )
            return _approval_as_job(approval, completed=True)

        approval = await self._create_approval(
            drive_id, target_id, dest_path, filename, content, content_type,
            uploaded_by_email, uploaded_by_name,
            department=department, vessel_id=vessel_id, vessel_name=vessel_name,
            message=(
                f"{display} ({uploaded_by_email}) is requesting approval to upload "
                f"'{filename}' to {dest_path}."
            ),
        )
        return _approval_as_job(approval)


    async def delete_folder(
        self, folder_id: str, requesting_email=None, requesting_name=None,
    ) -> dict:
        drive_id = await self._drive()
        try:
            await gd.get_item(drive_id, folder_id)
        except GraphError as e:
            if e.status == 404:
                raise NotFound("Folder not found")
            raise
        department, vessel_id, vessel_name, folder_name = await self._resolve_department_vessel(folder_id)
        display = self._display(requesting_email, requesting_name)
        vessel_clause = f" from vessel {vessel_name}" if vessel_name else ""
        return await self._admin_or_pending(
            action_type="delete_folder",
            requesting_email=requesting_email,
            requesting_name=requesting_name,
            department=department,
            vessel_id=vessel_id,
            vessel_name=vessel_name,
            target_id=folder_id,
            target_description=folder_name,
            payload={},
            pending_message=(
                f"{display} ({requesting_email}) is requesting approval to delete the "
                f"folder '{folder_name}'{vessel_clause}."
            ),
            activity_message=(
                f"SPE Admin ({requesting_email}) deleted the folder '{folder_name}'"
                f"{vessel_clause}. No approval was required."
            ),
            execute=lambda: self._execute_delete_folder(folder_id),
        )

    async def _execute_delete_folder(self, folder_id: str) -> bool:
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

    async def create_subfolder(
        self, folder_id: str, name: str, requesting_email=None, requesting_name=None,
    ) -> dict:
        """Manually create a named sub-folder inside a month_driven folder."""
        from .normalize import clean_folder_name
        cleaned = clean_folder_name(name)
        if not cleaned:
            raise BadRequest("Folder name is required")
        if not any(c.isalpha() for c in cleaned):
            raise BadRequest("Folder name must contain alphabetic characters (letters)")
        cleaned = sanitize_folder_name(cleaned)
        drive_id = await self._drive()
        parent_path = await self._folder_path(drive_id, folder_id)
        parent_parts = parent_path.split("/") if parent_path else []
        parent_flags = classify(parent_parts)
        if not parent_flags.get("month_driven"):
            raise BadRequest("Can only create sub-folders inside month-driven folders")

        department = parent_parts[0] if parent_parts else "All Departments"
        parent_name = parent_parts[-1] if parent_parts else folder_id
        with SessionLocal() as db:
            parent_row = self._folder_by_item(db, folder_id)
            vessel_id = parent_row.vessel_id if parent_row else None
            vessel_name = None
            if vessel_id:
                v = db.query(models.Vessel).filter_by(id=vessel_id).one_or_none()
                vessel_name = v.name if v else None

        display = self._display(requesting_email, requesting_name)
        vessel_clause = f" for vessel {vessel_name}" if vessel_name else ""
        payload = {"parent_folder_id": folder_id, "name": cleaned}
        return await self._admin_or_pending(
            action_type="create_folder",
            requesting_email=requesting_email,
            requesting_name=requesting_name,
            department=department,
            vessel_id=vessel_id,
            vessel_name=vessel_name,
            target_id=folder_id,
            target_description=cleaned,
            payload=payload,
            pending_message=(
                f"{display} ({requesting_email}) is requesting approval to create the "
                f"folder '{cleaned}' inside '{parent_name}'{vessel_clause}."
            ),
            activity_message=(
                f"SPE Admin ({requesting_email}) created the folder '{cleaned}' inside "
                f"'{parent_name}'{vessel_clause}. No approval was required."
            ),
            execute=lambda: self._execute_create_subfolder(payload),
        )

    async def _execute_create_subfolder(self, payload) -> dict:
        """Manually create a named sub-folder inside a month_driven folder,
        then provision its category children from the template."""
        folder_id = payload["parent_folder_id"]
        name = payload["name"]
        drive_id = await self._drive()
        parent_path = await self._folder_path(drive_id, folder_id)
        parent_parts = parent_path.split("/") if parent_path else []
        parent_flags = classify(parent_parts)

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

    async def month_upload(self, folder_id, filename, category, content, content_type, uploaded_by_email, uploaded_by_name):
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
                target_id, detected_label = target["id"], None
                dest_path = f"{md_path}/To be Classified"
            else:
                y, m = detected["year"], detected["month"]
                month_item = await self._ensure_month(
                    db, drive_id, folder_id, md_path, md_spec, y, m, None
                )
                cat_name = category if category in categories else "To be Classified"
                cat_item = await gd.ensure_folder(drive_id, month_item["id"], cat_name)
                target_id, detected_label = cat_item["id"], detected["label"]
                dest_path = f"{md_path}/{detected['label']}/{cat_name}"
            db.commit()

        existing = await gd.find_child(drive_id, target_id, filename)
        if existing and "file" in existing:
            # Build a descriptive message showing where the file lives
            parts = [p.strip() for p in dest_path.split("/") if p.strip()]
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

        department, vessel_id, vessel_name, _ = await self._resolve_department_vessel(target_id)
        display = self._display(uploaded_by_email, uploaded_by_name)

        if self._is_admin(uploaded_by_email):
            item = await gd.upload_file(drive_id, target_id, filename, content, content_type)
            approval = await self._create_activity(
                action_type="upload",
                requesting_email=uploaded_by_email or "",
                requesting_name=uploaded_by_name,
                department=department,
                vessel_id=vessel_id,
                vessel_name=vessel_name,
                target_id=item["id"],
                target_description=filename,
                payload={},
                message=(
                    f"SPE Admin ({uploaded_by_email}) uploaded '{filename}' to {dest_path}. "
                    f"No approval was required."
                ),
                filename=filename,
                content_type=content_type,
                destination_folder_id=target_id,
                destination_path=dest_path,
                is_month_upload=True,
                category=category,
                detected_month=detected_label,
                final_path=f"{dest_path}/{filename}",
                size=len(content),
            )
            return _approval_as_job(approval, completed=True)

        approval = await self._create_approval(
            drive_id, target_id, dest_path, filename, content, content_type,
            uploaded_by_email, uploaded_by_name,
            is_month_upload=True, category=category, detected_month=detected_label,
            department=department, vessel_id=vessel_id, vessel_name=vessel_name,
            message=(
                f"{display} ({uploaded_by_email}) is requesting approval to upload "
                f"'{filename}' to {dest_path}."
            ),
        )
        return _approval_as_job(approval)

    # ------------------------------------------------------------ files
    async def get_file(self, file_id):
        drive_id = await self._drive()
        try:
            return await gd.download_file(drive_id, file_id)
        except GraphError:
            return None

    async def delete_file(self, file_id: str, requesting_email=None, requesting_name=None, reason=None):
        drive_id = await self._drive()
        try:
            item = await gd.get_item(drive_id, file_id)
        except GraphError as e:
            if e.status == 404:
                raise NotFound("File not found")
            raise
        clean_reason = (reason or "").strip()
        if not self._is_admin(requesting_email) and not clean_reason:
            raise BadRequest("A reason for deletion is required")
        parent_id = (item.get("parentReference") or {}).get("id")
        filename = item.get("name") or file_id
        if parent_id:
            department, vessel_id, vessel_name, _ = await self._resolve_department_vessel(parent_id)
        else:
            department, vessel_id, vessel_name = "All Departments", None, None
        display = self._display(requesting_email, requesting_name)
        vessel_clause = f" from vessel {vessel_name}" if vessel_name else ""
        reason_clause = f" Reason: \"{clean_reason}\"" if clean_reason else ""
        return await self._admin_or_pending(
            action_type="delete_document",
            requesting_email=requesting_email,
            requesting_name=requesting_name,
            department=department,
            vessel_id=vessel_id,
            vessel_name=vessel_name,
            target_id=file_id,
            target_description=filename,
            payload={"reason": clean_reason} if clean_reason else {},
            pending_message=(
                f"{display} ({requesting_email}) is requesting approval to delete the "
                f"document '{filename}'{vessel_clause}.{reason_clause}"
            ),
            activity_message=(
                f"SPE Admin ({requesting_email}) deleted the document '{filename}'"
                f"{vessel_clause}. No approval was required."
            ),
            execute=lambda: self._execute_delete_file(file_id),
        )

    async def _execute_delete_file(self, file_id):
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

    async def search(self, q, vessel_id=None):
        """Search folders + files by name. When `vessel_id` is given, results
        are restricted to that vessel's own ship folders (one per main
        folder) — never other vessels' folders, and never the shared "Common
        for all ships" areas.
        """
        ql = q.strip()
        if not ql:
            return []
        vid = int(vessel_id) if vessel_id and str(vessel_id).isdigit() else None
        out, seen = [], set()
        # 1) Folders from our DB cache — always available, no index lag.
        #    vessel_id is an indexed FK, so scoping here is a cheap filter,
        #    not a scan of every vessel's folders.
        with SessionLocal() as db:
            query = db.query(models.Folder).filter(models.Folder.name.ilike(f"%{ql}%"))
            if vid is not None:
                query = query.filter(models.Folder.vessel_id == vid)
            rows = query.limit(50).all()
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

            # A vessel has no single root — it has one ship folder under each
            # of the 3 main folders — so file search below is scoped to all
            # of them rather than one shared "vessel root".
            ship_root_ids = []
            if vid is not None:
                ship_root_ids = [
                    r.drive_item_id
                    for r in db.query(models.Folder).filter_by(vessel_id=vid, kind="ship").all()
                ]

        # 2) Files via Graph search (best-effort; may lag or be unavailable).
        try:
            drive_id = await self._drive()
            if vid is not None:
                # Scoped, recursive search inside just this vessel's ship
                # folders — Graph does the subtree walk server-side, so other
                # vessels' documents are never scanned or returned.
                per_root = await asyncio.gather(
                    *(gd.search_items_in(drive_id, root_id, ql) for root_id in ship_root_ids)
                )
                items = [it for lst in per_root for it in lst]
            else:
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

    async def _resolve_item_context(
        self, item_id, item_type, item_name=None, department=None, vessel_name=None,
    ):
        """Best-effort name/department/vessel resolution for archive/restore
        actions. Frontend-supplied overrides win (needed for recycle-bin
        items that Graph may no longer resolve); otherwise try a live Graph
        lookup, degrading gracefully to defaults on any failure."""
        if item_name and department:
            return item_name, department, vessel_name
        try:
            drive_id = await self._drive()
            item = await gd.get_item(drive_id, item_id)
            if not item_name:
                item_name = item.get("name", item_id)
            if not department or not vessel_name:
                if item_type == "folder":
                    dept, _, vess, _ = await self._resolve_department_vessel(item_id)
                else:
                    parent_id = (item.get("parentReference") or {}).get("id")
                    dept, _, vess, _ = (
                        await self._resolve_department_vessel(parent_id)
                        if parent_id else ("All Departments", None, None, None)
                    )
                department = department or dept
                vessel_name = vessel_name or vess
        except Exception:
            pass
        return item_name or item_id, department or "All Departments", vessel_name

    async def archive_item(
        self, item_id: str, item_type: str, requesting_email=None, requesting_name=None,
        item_name=None, department=None, vessel_name=None, reason=None,
    ):
        name, dept, vessel = await self._resolve_item_context(item_id, item_type, item_name, department, vessel_name)
        clean_reason = (reason or "").strip()
        if item_type == "file" and not self._is_admin(requesting_email) and not clean_reason:
            raise BadRequest("A reason for archiving is required")
        display = self._display(requesting_email, requesting_name)
        vessel_clause = f" from vessel {vessel}" if vessel else ""
        reason_clause = f" Reason: \"{clean_reason}\"" if clean_reason else ""
        payload = {"item_type": item_type}
        if clean_reason:
            payload["reason"] = clean_reason
        return await self._admin_or_pending(
            action_type="archive_item",
            requesting_email=requesting_email,
            requesting_name=requesting_name,
            department=dept,
            vessel_name=vessel,
            target_id=item_id,
            target_description=name,
            payload=payload,
            pending_message=(
                f"{display} ({requesting_email}) is requesting approval to archive "
                f"'{name}'{vessel_clause}.{reason_clause}"
            ),
            activity_message=(
                f"SPE Admin ({requesting_email}) archived '{name}'{vessel_clause}. "
                f"No approval was required."
            ),
            execute=lambda: self._execute_archive(item_id, item_type),
        )

    async def _execute_archive(self, item_id, item_type):
        with SessionLocal() as db:
            row = db.query(models.ArchivedItem).filter_by(item_id=item_id).one_or_none()
            if not row:
                row = models.ArchivedItem(item_id=item_id, item_type=item_type)
                db.add(row)
                db.commit()
        return {"archived": True}

    async def restore_item(
        self, item_id: str, item_type: str = "folder", requesting_email=None, requesting_name=None,
        item_name=None, department=None, vessel_name=None,
    ):
        name, dept, vessel = await self._resolve_item_context(item_id, item_type, item_name, department, vessel_name)
        display = self._display(requesting_email, requesting_name)
        vessel_clause = f" from vessel {vessel}" if vessel else ""
        return await self._admin_or_pending(
            action_type="restore_item",
            requesting_email=requesting_email,
            requesting_name=requesting_name,
            department=dept,
            vessel_name=vessel,
            target_id=item_id,
            target_description=name,
            payload={},
            pending_message=(
                f"{display} ({requesting_email}) is requesting approval to restore "
                f"'{name}'{vessel_clause}."
            ),
            activity_message=(
                f"SPE Admin ({requesting_email}) restored '{name}'{vessel_clause}. "
                f"No approval was required."
            ),
            execute=lambda: self._execute_restore(item_id),
        )

    async def _execute_restore(self, item_id):
        with SessionLocal() as db:
            row = db.query(models.ArchivedItem).filter_by(item_id=item_id).one_or_none()
            if row:
                db.delete(row)
                db.commit()
        return {"restored": True}

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

                # Derive item_type label for display
                if is_folder:
                    item_type = "File folder"
                else:
                    ext = name.rsplit(".", 1)[-1].upper() if "." in name else ""
                    item_type = f"{ext} File" if ext else "File"

                node = {
                    "id": it["id"],
                    "name": name,
                    "kind": kind,
                    "upload": False,
                    "month_driven": False,
                    "has_children": False,
                    "main_folder": main_folder,
                    "original_path": original_path,
                    "size": it.get("size"),
                    "deleted_at": it.get("deletedDateTime"),
                    "modified": it.get("lastModifiedDateTime"),
                    "item_type": item_type,
                    "ext": name.rsplit(".", 1)[-1].lower() if "." in name else "",
                }
                out.append(node)
            return out
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Failed to get deleted nodes: {e}")
            return []

    async def restore_deleted_item(
        self, item_id: str, item_type: str = "folder", requesting_email=None, requesting_name=None,
        item_name=None, department=None, vessel_name=None,
    ):
        name, dept, vessel = await self._resolve_item_context(item_id, item_type, item_name, department, vessel_name)
        display = self._display(requesting_email, requesting_name)
        vessel_clause = f" from vessel {vessel}" if vessel else ""
        return await self._admin_or_pending(
            action_type="restore_from_recycle_bin",
            requesting_email=requesting_email,
            requesting_name=requesting_name,
            department=dept,
            vessel_name=vessel,
            target_id=item_id,
            target_description=name,
            payload={"item_type": item_type},
            pending_message=(
                f"{display} ({requesting_email}) is requesting approval to restore "
                f"'{name}' from the Recycle Bin{vessel_clause}."
            ),
            activity_message=(
                f"SPE Admin ({requesting_email}) restored '{name}' from the Recycle Bin"
                f"{vessel_clause}. No approval was required."
            ),
            execute=lambda: self._execute_restore_deleted(item_id),
        )

    async def _execute_restore_deleted(self, item_id):
        url = f"/storage/fileStorage/containers/{settings.container_id}/recycleBin/items/restore"
        try:
            await graph().post(url, json={"ids": [item_id]})
            return {"restored": True}
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Failed to restore deleted item {item_id}: {e}")
            return {"restored": False}

    async def permanent_delete_item(
        self, item_id: str, item_type: str, requesting_email=None, requesting_name=None,
        item_name=None, department=None, vessel_name=None,
    ):
        name, dept, vessel = await self._resolve_item_context(item_id, item_type, item_name, department, vessel_name)
        display = self._display(requesting_email, requesting_name)
        vessel_clause = f" from vessel {vessel}" if vessel else ""
        return await self._admin_or_pending(
            action_type="permanent_delete",
            requesting_email=requesting_email,
            requesting_name=requesting_name,
            department=dept,
            vessel_name=vessel,
            target_id=item_id,
            target_description=name,
            payload={"item_type": item_type},
            pending_message=(
                f"{display} ({requesting_email}) is requesting approval to permanently "
                f"delete '{name}'{vessel_clause}."
            ),
            activity_message=(
                f"SPE Admin ({requesting_email}) permanently deleted '{name}'"
                f"{vessel_clause}. No approval was required."
            ),
            execute=lambda: self._execute_permanent_delete(item_id, item_type),
        )

    async def _execute_permanent_delete(self, item_id, item_type):
        url = f"/storage/fileStorage/containers/{settings.container_id}/recycleBin/items/delete"
        try:
            await graph().post(url, json={"ids": [item_id]})
            return {"deleted": True}
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Failed to permanently delete item {item_id}: {e}")
            return {"deleted": False}

    # -------------------------------------------------------------- approvals
    async def _create_approval(
        self, drive_id, destination_folder_id, destination_path, filename, content,
        content_type, uploaded_by_email, uploaded_by_name, *,
        is_month_upload=False, category=None, detected_month=None,
        department=None, vessel_id=None, vessel_name=None, message=None,
    ):
        # Prevent duplicate requests when the same file is uploaded again
        # before an existing approval has been decided.
        with SessionLocal() as db:
            existing_pending = (
                db.query(models.ApprovalRequest)
                .filter(
                    models.ApprovalRequest.status == "pending",
                    models.ApprovalRequest.action_type == "upload",
                    models.ApprovalRequest.destination_folder_id == destination_folder_id,
                    func.lower(models.ApprovalRequest.filename) == filename.lower(),
                )
                .first()
            )
            if existing_pending is not None:
                raise Conflict(
                    f"A request for '{filename}' in this folder is already pending approval"
                )

        staged_item_id = await self._stage_file(drive_id, filename, content, content_type)
        try:
            with SessionLocal() as db:
                row = models.ApprovalRequest(
                    filename=filename,
                    content_type=content_type or "application/octet-stream",
                    size=len(content),
                    uploaded_by_email=uploaded_by_email,
                    uploaded_by_name=uploaded_by_name or "",
                    destination_folder_id=destination_folder_id,
                    destination_path=destination_path,
                    is_month_upload=is_month_upload,
                    category=category,
                    detected_month=detected_month,
                    drive_item_id=staged_item_id,
                    entry_kind="approval",
                    action_type="upload",
                    department=department,
                    vessel_id=int(vessel_id) if vessel_id else None,
                    vessel_name=vessel_name,
                    message=message,
                )
                db.add(row)
                db.commit()
                db.refresh(row)
                public = self._approval_public(row)
        except Exception:
            # Don't leave an orphaned staged file if the DB write failed.
            try:
                await gd.delete_item(drive_id, staged_item_id)
            except GraphError:
                pass
            raise
        await notify_email(
            settings.admin_emails,
            f"New document pending approval: {filename}",
            f"{uploaded_by_name or uploaded_by_email} uploaded '{filename}' to "
            f"{destination_path}. Review it in the DMS approvals page.",
        )
        return public

    async def list_approvals(self, status=None, q=None):
        with SessionLocal() as db:
            query = db.query(models.ApprovalRequest)
            if status and status != "all":
                query = query.filter_by(status=status)
            if q:
                ql = f"%{q.strip()}%"
                query = query.filter(
                    sa_or(
                        models.ApprovalRequest.filename.ilike(ql),
                        models.ApprovalRequest.uploaded_by_email.ilike(ql),
                        models.ApprovalRequest.destination_path.ilike(ql),
                        models.ApprovalRequest.target_description.ilike(ql),
                        models.ApprovalRequest.vessel_name.ilike(ql),
                        models.ApprovalRequest.message.ilike(ql),
                    )
                )
            rows = query.order_by(models.ApprovalRequest.uploaded_at.desc()).all()
            return [self._approval_public(r) for r in rows]

    async def get_approval(self, request_id):
        with SessionLocal() as db:
            row = db.get(models.ApprovalRequest, int(request_id)) if request_id.isdigit() else None
            if row is None:
                raise NotFound("Approval request not found")
            return self._approval_public(row)

    async def get_approval_file(self, request_id):
        if not request_id.isdigit():
            return None
        with SessionLocal() as db:
            row = db.get(models.ApprovalRequest, int(request_id))
            if row is None:
                return None
            item_id, content_type, filename = row.drive_item_id, row.content_type, row.filename
        drive_id = await self._drive()
        try:
            content, _, _ = await gd.download_file(drive_id, item_id)
        except GraphError:
            return None
        return content, content_type, filename

    def _claim_pending(self, request_id: str, new_status: str):
        """Row-lock the request and flip it to `new_status` iff still pending —
        this is what makes concurrent approve/reject calls safe: whichever call
        commits first wins the lock, and the loser sees a non-pending status."""
        if not request_id.isdigit():
            raise NotFound("Approval request not found")
        with SessionLocal() as db:
            row = (
                db.query(models.ApprovalRequest)
                .filter_by(id=int(request_id))
                .with_for_update()
                .one_or_none()
            )
            if row is None:
                raise NotFound("Approval request not found")
            if row.status != "pending":
                raise Conflict(f"This request has already been {row.status}")
            row.status = new_status
            row.decided_at = datetime.utcnow()
            db.commit()
            return {
                "action_type": row.action_type or "upload",
                "filename": row.filename,
                "content_type": row.content_type,
                "drive_item_id": row.drive_item_id,
                "destination_folder_id": row.destination_folder_id,
                "uploaded_by_email": row.uploaded_by_email,
                "target_id": row.target_id,
                "payload": json.loads(row.payload_json) if row.payload_json else {},
            }

    def _revert_to_pending(self, request_id: str):
        with SessionLocal() as db:
            row = db.get(models.ApprovalRequest, int(request_id))
            if row is not None:
                row.status = "pending"
                row.decided_by_email = None
                row.decided_at = None
                row.rejection_reason = None
                db.commit()

    def _finalize(self, request_id: str, decided_by_email: str, final_path: str, reason=None):
        with SessionLocal() as db:
            row = db.get(models.ApprovalRequest, int(request_id))
            row.decided_by_email = decided_by_email
            row.final_path = final_path
            if reason is not None:
                row.rejection_reason = reason
            db.commit()
            db.refresh(row)
            return self._approval_public(row)

    def _mark_approved_row(self, request_id: str, decided_by_email: str):
        """Non-upload actions: the claim already flipped status to 'approved'
        — this just records who decided it, after the deferred mutation has
        already run successfully."""
        with SessionLocal() as db:
            row = db.get(models.ApprovalRequest, int(request_id))
            row.decided_by_email = decided_by_email
            db.commit()
            db.refresh(row)
            return self._approval_public(row)

    def _mark_rejected_row(self, request_id: str, decided_by_email: str, reason=None):
        with SessionLocal() as db:
            row = db.get(models.ApprovalRequest, int(request_id))
            row.status = "rejected"
            row.decided_by_email = decided_by_email
            row.rejection_reason = reason
            db.commit()
            db.refresh(row)
            return self._approval_public(row)

    async def approve_request(self, request_id, decided_by_email):
        claimed = self._claim_pending(request_id, "approved")
        action_type = claimed.get("action_type") or "upload"

        if action_type == "upload":
            drive_id = await self._drive()
            try:
                existing = await gd.find_child(drive_id, claimed["destination_folder_id"], claimed["filename"])
                if existing and "file" in existing:
                    raise Conflict(f"'{claimed['filename']}' already exists in the destination folder")
                await gd.move_item(
                    drive_id, claimed["drive_item_id"], claimed["destination_folder_id"],
                    new_name=claimed["filename"],
                )
            except Exception:
                self._revert_to_pending(request_id)
                raise
            dest_path = await self._folder_path(drive_id, claimed["destination_folder_id"])
            result = self._finalize(request_id, decided_by_email, f"{dest_path}/{claimed['filename']}")
            await notify_email(
                claimed["uploaded_by_email"],
                f"Your document '{claimed['filename']}' was approved",
                f"'{claimed['filename']}' has been approved and filed to {result['final_path']}.",
            )
            return result

        # Non-upload actions: re-validate the target still exists, execute
        # the deferred mutation, then finalize. If the target vanished in the
        # meantime, resolve the request as rejected rather than erroring.
        payload = claimed.get("payload") or {}
        target_id = claimed.get("target_id")
        try:
            if action_type == "delete_document":
                drive_id = await self._drive()
                try:
                    await gd.get_item(drive_id, target_id)
                except GraphError as e:
                    if e.status == 404:
                        return self._mark_rejected_row(request_id, decided_by_email, "Target no longer exists")
                    raise
                await self._execute_delete_file(target_id)
            elif action_type == "delete_folder":
                drive_id = await self._drive()
                try:
                    await gd.get_item(drive_id, target_id)
                except GraphError as e:
                    if e.status == 404:
                        return self._mark_rejected_row(request_id, decided_by_email, "Target no longer exists")
                    raise
                await self._execute_delete_folder(target_id)
            elif action_type == "create_folder":
                await self._execute_create_subfolder(payload)
            elif action_type == "create_vessel":
                await self._provision_vessel(payload)
            elif action_type == "update_vessel":
                with SessionLocal() as db:
                    exists = db.query(models.Vessel).filter_by(id=int(payload["vessel_id"])).one_or_none()
                if not exists:
                    return self._mark_rejected_row(request_id, decided_by_email, "Target no longer exists")
                await self._execute_update_vessel(payload)
            elif action_type == "archive_item":
                await self._execute_archive(target_id, payload.get("item_type", "folder"))
            elif action_type == "restore_item":
                await self._execute_restore(target_id)
            elif action_type == "restore_from_recycle_bin":
                await self._execute_restore_deleted(target_id)
            elif action_type == "permanent_delete":
                await self._execute_permanent_delete(target_id, payload.get("item_type", "folder"))
            else:
                raise BadRequest(f"Unknown action type: {action_type}")
        except Exception:
            self._revert_to_pending(request_id)
            raise
        return self._mark_approved_row(request_id, decided_by_email)

    async def reject_request(self, request_id, decided_by_email, reason=None):
        claimed = self._claim_pending(request_id, "rejected")
        action_type = claimed.get("action_type") or "upload"

        if action_type == "upload":
            drive_id = await self._drive()
            try:
                target_id = await self._resolve_reject_target(drive_id, claimed["destination_folder_id"])
                target_path = await self._folder_path(drive_id, target_id)
                existing = await gd.find_child(drive_id, target_id, claimed["filename"])
                if existing and "file" in existing:
                    raise Conflict(
                        f"'{claimed['filename']}' already exists in the "
                        f"'{target_path.split('/')[-1]}' folder"
                    )
                await gd.move_item(drive_id, claimed["drive_item_id"], target_id, new_name=claimed["filename"])
            except Exception:
                self._revert_to_pending(request_id)
                raise
            result = self._finalize(
                request_id, decided_by_email, f"{target_path}/{claimed['filename']}", reason
            )
            await notify_email(
                claimed["uploaded_by_email"],
                f"Your document '{claimed['filename']}' was rejected",
                f"'{claimed['filename']}' was rejected"
                + (f" ({reason})" if reason else "")
                + f" and moved to {result['final_path']}.",
            )
            return result

        # Non-upload actions: nothing was staged/created, so rejection is
        # just a state transition (the claim already flipped status).
        return self._mark_rejected_row(request_id, decided_by_email, reason)

    @staticmethod
    def _approval_public(row):
        return {
            "id": str(row.id),
            "filename": row.filename,
            "content_type": row.content_type,
            "size": row.size,
            "uploaded_by_email": row.uploaded_by_email,
            "uploaded_by_name": row.uploaded_by_name,
            "uploaded_at": row.uploaded_at.isoformat() if row.uploaded_at else None,
            "destination_folder_id": row.destination_folder_id,
            "destination_path": row.destination_path,
            "is_month_upload": row.is_month_upload,
            "category": row.category,
            "detected_month": row.detected_month,
            "status": row.status,
            "decided_by_email": row.decided_by_email,
            "decided_at": row.decided_at.isoformat() if row.decided_at else None,
            "rejection_reason": row.rejection_reason,
            "final_path": row.final_path,
            "entry_kind": row.entry_kind,
            "action_type": row.action_type,
            "department": row.department,
            "vessel_id": str(row.vessel_id) if row.vessel_id else None,
            "vessel_name": row.vessel_name,
            "target_id": row.target_id,
            "target_description": row.target_description,
            "payload": json.loads(row.payload_json) if row.payload_json else {},
            "changes": json.loads(row.changes_json) if row.changes_json else [],
            "message": row.message,
        }


def _approval_as_job(approval, completed=False):
    """Shape an approval request like the existing Job contract so the
    frontend's upload-toast + polling code needs no structural changes.
    completed=True (SPE Admin bypass) reports "done" so the frontend shows
    its normal immediate-success toast instead of "Awaiting approval"."""
    return {
        "id": approval["id"],
        "filename": approval["filename"],
        "status": "done" if completed else "pending",
        "destination": (approval.get("final_path") or approval["destination_path"]),
        "detected_month": approval["detected_month"],
    }
