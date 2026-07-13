"""Async adapter over the in-memory `store` (stub mode).

Presents the same interface as RealBackend so the API layer is backend-agnostic.
"""
from ..config import settings
from ..store import store
from .errors import BadRequest, Conflict, NotFound
from .notify import notify_email


class StubBackend:
    async def list_vessels(self):
        return [{"id": v["id"], "name": v["name"], "imo": v.get("imo")} for v in store.vessels]

    async def create_vessel(self, name, imo):
        name = (name or "").strip()
        imo = (imo or "").strip()
        if not name:
            raise BadRequest("Vessel name is required")
        if imo and not imo.isdigit() or (imo and len(imo) != 7):
            raise BadRequest("IMO number must be exactly 7 digits")
        if any(v["name"].lower() == name.lower() for v in store.vessels):
            raise Conflict("A vessel with that name already exists")
        if imo and any(v.get("imo") == imo for v in store.vessels):
            raise Conflict("A vessel with that IMO number already exists")
        return store.add_vessel(name, imo or None)

    async def mains(self):
        return store.mains()

    async def get_folder(self, folder_id):
        node = store.get_node(folder_id)
        if node is None:
            raise NotFound("Folder not found")
        return store.serialize(node, depth=0)

    async def children(self, folder_id):
        if store.get_node(folder_id) is None:
            raise NotFound("Folder not found")
        return store.children(folder_id)

    async def stats(self):
        return store.stats()

    async def upload(self, folder_id, filename, content, content_type, uploaded_by_email, uploaded_by_name):
        """Uploads no longer land directly — this creates a pending approval
        request for the admin, returned in the same Job shape the frontend
        already polls (status "pending" is terminal, so no polling occurs)."""
        node = store.get_node(folder_id)
        if node is None:
            raise NotFound("Folder not found")
        if not node["upload"] or node["month_driven"]:
            raise BadRequest("This folder does not accept direct uploads")
        approval = store.create_approval(
            folder_id,
            store.path_of(folder_id),
            filename,
            content,
            content_type,
            uploaded_by_email,
            uploaded_by_name,
        )
        await notify_email(
            settings.admin_emails,
            f"New document pending approval: {filename}",
            f"{uploaded_by_name or uploaded_by_email} uploaded '{filename}' to "
            f"{approval['destination_path']}. Review it in the DMS approvals page.",
        )
        return _approval_as_job(approval)

    async def month_upload(self, folder_id, filename, category, content, content_type, uploaded_by_email, uploaded_by_name):
        node = store.get_node(folder_id)
        if node is None:
            raise NotFound("Folder not found")
        if not node["month_driven"]:
            raise BadRequest("This folder is not a month-driven folder")
        target, detected = store.resolve_month_target(folder_id, filename, category)
        approval = store.create_approval(
            target["id"],
            store.path_of(target["id"]),
            filename,
            content,
            content_type,
            uploaded_by_email,
            uploaded_by_name,
            is_month_upload=True,
            category=category,
            detected_month=detected,
        )
        await notify_email(
            settings.admin_emails,
            f"New document pending approval: {filename}",
            f"{uploaded_by_name or uploaded_by_email} uploaded '{filename}' to "
            f"{approval['destination_path']}. Review it in the DMS approvals page.",
        )
        return _approval_as_job(approval)

    async def get_file(self, file_id):
        return store.get_file(file_id)

    async def delete_file(self, file_id):
        return store.delete_file(file_id)

    async def search(self, q):
        return store.search(q)

    async def get_job(self, job_id):
        return store.get_job(job_id)

    # -------------------------------------------------------------- approvals
    async def list_approvals(self, status=None, q=None):
        return store.list_approvals(status, q)

    async def get_approval(self, request_id):
        approval = store.get_approval(request_id)
        if approval is None:
            raise NotFound("Approval request not found")
        return approval

    async def get_approval_file(self, request_id):
        return store.get_approval_file(request_id)

    async def approve_request(self, request_id, decided_by_email):
        approval = store.get_approval(request_id)
        if approval is None:
            raise NotFound("Approval request not found")
        result = store.approve_approval(request_id, decided_by_email)
        await notify_email(
            approval["uploaded_by_email"],
            f"Your document '{approval['filename']}' was approved",
            f"'{approval['filename']}' has been approved and filed to "
            f"{result['final_path']}.",
        )
        return result

    async def reject_request(self, request_id, decided_by_email, reason=None):
        approval = store.get_approval(request_id)
        if approval is None:
            raise NotFound("Approval request not found")
        result = store.reject_approval(request_id, decided_by_email, reason)
        await notify_email(
            approval["uploaded_by_email"],
            f"Your document '{approval['filename']}' was rejected",
            f"'{approval['filename']}' was rejected"
            + (f" ({reason})" if reason else "")
            + f" and moved to {result['final_path']}.",
        )
        return result


def _approval_as_job(approval):
    """Shape an approval request like the existing Job contract so the
    frontend's upload-toast + polling code needs no structural changes."""
    return {
        "id": approval["id"],
        "filename": approval["filename"],
        "status": "pending",
        "destination": approval["destination_path"],
        "detected_month": approval["detected_month"],
    }
