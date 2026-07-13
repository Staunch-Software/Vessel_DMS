"""In-memory store for the stub backend.

Builds the folder tree from the declarative template, supports adding vessels
(which clones the per-ship sub-tree under all three main folders), and fakes the
upload + month-folder behaviour so the UI can be built against realistic data.
"""
import itertools
import re
from datetime import date, datetime

from . import template

from .services.errors import Conflict, DuplicateFile  # noqa: E402  (re-exported for callers)

_ids = itertools.count(1)


def _new_id():
    return str(next(_ids))


class Store:
    def __init__(self):
        # Flat map: id -> node dict.
        self.nodes = {}
        # Ordered list of vessel ids.
        self.vessels = []
        # id -> job dict.
        self.jobs = {}
        self._job_ids = itertools.count(1)
        # id -> pending/approved/rejected approval request dict.
        self.approvals = {}
        self._approval_ids = itertools.count(1)
        self._build_roots()

    # ------------------------------------------------------------------ build
    def _make_node(self, name, kind, parent_id, *, month_children=None, ext=None):
        node = {
            "id": _new_id(),
            "name": name,
            "kind": kind,
            "parent_id": parent_id,
            "children": [],
            "upload": kind in ("leaf", "month_driven"),
            "month_driven": kind == "month_driven",
        }
        if month_children is not None:
            node["month_children"] = month_children
        if ext is not None:
            node["ext"] = ext  # for file nodes
        self.nodes[node["id"]] = node
        if parent_id is not None:
            self.nodes[parent_id]["children"].append(node["id"])
        return node

    def _build_subtree(self, spec, parent_id):
        node = self._make_node(
            spec["name"],
            spec["kind"],
            parent_id,
            month_children=spec.get("month_children"),
        )
        for child in spec.get("children", []):
            self._build_subtree(child, node["id"])
        return node

    def _build_roots(self):
        self.roots = []
        self.main_folders = {}  # name -> node
        for name in template.MAIN_FOLDERS:
            main = self._make_node(name, "main", None)
            self.roots.append(main["id"])
            self.main_folders[name] = main
            # The "Common for all ships" branch lives once per main folder.
            self._build_subtree(template.COMMON_TEMPLATE[name], main["id"])

    # ----------------------------------------------------------------- vessels
    def add_vessel(self, name, imo=None):
        ship_folder_ids = {}
        for main_name, main in self.main_folders.items():
            ship = self._make_node(name, "ship", main["id"])
            ship["vessel"] = name
            for spec in template.SHIP_TEMPLATE[main_name]:
                self._build_subtree(spec, ship["id"])
            ship_folder_ids[main_name] = ship["id"]
        vessel = {
            "id": _new_id(),
            "name": name,
            "imo": imo,
            "ship_folders": ship_folder_ids,
        }
        self.vessels.append(vessel)
        # Pre-seed the current + next month folders to showcase scheduled creation.
        today = date.today()
        for ship_id in ship_folder_ids.values():
            for md in self._descendant_month_driven(ship_id):
                self.ensure_month_folder(md["id"], today.year, today.month)
                nm_year, nm_month = _next_month(today.year, today.month)
                self.ensure_month_folder(md["id"], nm_year, nm_month)
        return vessel

    def _descendant_month_driven(self, root_id):
        out = []
        stack = [root_id]
        while stack:
            nid = stack.pop()
            node = self.nodes[nid]
            if node["month_driven"]:
                out.append(node)
            stack.extend(node["children"])
        return out

    # ----------------------------------------------------------------- folders
    def get_node(self, node_id):
        return self.nodes.get(node_id)

    def serialize(self, node, depth=1):
        """Return a node with `depth` levels of nested children (depth<0 = all)."""
        out = {
            "id": node["id"],
            "name": node["name"],
            "kind": node["kind"],
            "upload": node["upload"],
            "month_driven": node["month_driven"],
            "has_children": bool(node["children"]),
        }
        if "ext" in node:
            out["ext"] = node["ext"]
        if node["kind"] == "file":
            out["size"] = node.get("size")
            out["modified"] = node.get("modified")
        if node["month_driven"]:
            out["categories"] = [c["name"] for c in node.get("month_children", [])]
        if depth != 0:
            out["children"] = [
                self.serialize(self.nodes[c], depth - 1) for c in node["children"]
            ]
        return out

    def tree(self):
        return [self.serialize(self.nodes[r], depth=-1) for r in self.roots]

    def mains(self):
        return [self.serialize(self.nodes[r], depth=0) for r in self.roots]

    def stats(self):
        files = months = month_driven = 0
        for node in self.nodes.values():
            if node["kind"] == "file":
                files += 1
            elif node["kind"] == "month":
                months += 1
            if node["month_driven"]:
                month_driven += 1
        return {
            "vessels": len(self.vessels),
            "main_folders": len(self.roots),
            "month_driven": month_driven,
            "months": months,
            "documents": files,
        }

    def children(self, node_id):
        node = self.nodes[node_id]
        return [self.serialize(self.nodes[c], depth=1) for c in node["children"]]

    # ------------------------------------------------------------ month folders
    def ensure_month_folder(self, month_driven_id, year, month):
        """Create `{Month YYYY}` (+ its category children) under a month_driven
        folder if absent; return the month folder node."""
        md = self.nodes[month_driven_id]
        label = f"{_MONTHS[month - 1]} {year}"
        for cid in md["children"]:
            if self.nodes[cid]["name"] == label:
                return self.nodes[cid]
        month_node = self._make_node(label, "month", md["id"])
        month_node["is_month"] = True
        for cat in md.get("month_children", []):
            self._build_subtree(cat, month_node["id"])
        return month_node

    # ----------------------------------------------------------------- uploads
    def _add_file(self, parent_id, filename, content=b"", content_type=""):
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        node = self._make_node(filename, "file", parent_id, ext=ext)
        node["content"] = content
        node["content_type"] = content_type or "application/octet-stream"
        node["size"] = len(content)
        node["modified"] = datetime.now().isoformat()
        return node

    def _has_child_named(self, parent_id, name):
        return any(
            self.nodes[c]["name"].lower() == name.lower()
            for c in self.nodes[parent_id]["children"]
        )

    def _path_of(self, node_id):
        parts = []
        nid = node_id
        while nid is not None:
            n = self.nodes[nid]
            parts.append(n["name"])
            nid = n["parent_id"]
        return " / ".join(reversed(parts))

    def path_of(self, node_id):
        return self._path_of(node_id)

    def place_file(self, folder_id, filename, content=b"", content_type=""):
        """Actually add a file node under folder_id. Raises DuplicateFile on collision.

        This is the low-level primitive shared by the approval workflow's
        approve step (whichever folder was ultimately resolved for a request).
        """
        if self._has_child_named(folder_id, filename):
            raise DuplicateFile(filename)
        self._add_file(folder_id, filename, content, content_type)
        return self._path_of(folder_id)

    def resolve_month_target(self, month_driven_id, filename, category=None):
        """Fake OCR month detection + ensure the month/category folders exist;
        return (target_node, detected_month_label) without placing any file."""
        year, month = _detect_month(filename)
        md = self.nodes[month_driven_id]
        if year is None:
            # No confident date -> month-agnostic "To be Classified".
            target = self.ensure_to_be_classified(md["id"])
            detected = None
        else:
            month_node = self.ensure_month_folder(month_driven_id, year, month)
            target = month_node
            cat_name = category or "To be Classified"
            for cid in month_node["children"]:
                if self.nodes[cid]["name"] == cat_name:
                    target = self.nodes[cid]
                    break
            detected = f"{_MONTHS[month - 1]} {year}"
        return target, detected

    def reject_target_for(self, destination_folder_id):
        """The sibling "To be Classified" folder for a rejected upload — found
        inside the same parent as the originally-selected destination. If the
        destination already IS a "To be Classified" folder, reuse it as-is."""
        node = self.nodes[destination_folder_id]
        if node["name"].strip().lower() == "to be classified":
            return destination_folder_id
        return self.ensure_to_be_classified(node["parent_id"])["id"]

    def ensure_to_be_classified(self, parent_id):
        for cid in self.nodes[parent_id]["children"]:
            if self.nodes[cid]["name"].strip().lower() == "to be classified":
                return self.nodes[cid]
        return self._make_node("To be Classified", "leaf", parent_id)

    # ----------------------------------------------------------- files / search
    def get_file(self, node_id):
        node = self.nodes.get(node_id)
        if not node or node["kind"] != "file":
            return None
        return node["content"], node["content_type"], node["name"]

    def delete_file(self, node_id):
        node = self.nodes.get(node_id)
        if not node or node["kind"] != "file":
            return False
        pid = node["parent_id"]
        if pid is not None and node_id in self.nodes[pid]["children"]:
            self.nodes[pid]["children"].remove(node_id)
        self.nodes.pop(node_id, None)
        return True

    def search(self, query):
        ql = query.lower().strip()
        if not ql:
            return []
        results = []

        def walk(nid, trail):
            node = self.nodes[nid]
            t2 = trail + [{"id": nid, "name": node["name"]}]
            if node["kind"] != "main" and ql in node["name"].lower():
                results.append(
                    {
                        "id": nid,
                        "name": node["name"],
                        "kind": node["kind"],
                        "trail": t2,
                        "path": self._path_of(nid),
                    }
                )
            for c in node["children"]:
                walk(c, t2)

        for r in self.roots:
            walk(r, [])
        return results[:50]

    # ------------------------------------------------------------- approvals
    def create_approval(
        self,
        destination_id,
        destination_path,
        filename,
        content,
        content_type,
        uploaded_by_email,
        uploaded_by_name,
        *,
        is_month_upload=False,
        category=None,
        detected_month=None,
    ):
        for a in self.approvals.values():
            if (
                a["status"] == "pending"
                and a["destination_folder_id"] == destination_id
                and a["filename"].lower() == filename.lower()
            ):
                raise Conflict(
                    f"A request for '{filename}' in this folder is already pending approval"
                )
        if self._has_child_named(destination_id, filename):
            raise DuplicateFile(filename)
        req = {
            "id": str(next(self._approval_ids)),
            "filename": filename,
            "content": content,
            "content_type": content_type or "application/octet-stream",
            "size": len(content),
            "uploaded_by_email": uploaded_by_email,
            "uploaded_by_name": uploaded_by_name or "",
            "uploaded_at": datetime.now().isoformat(),
            "destination_folder_id": destination_id,
            "destination_path": destination_path,
            "is_month_upload": is_month_upload,
            "category": category,
            "detected_month": detected_month,
            "status": "pending",
            "decided_by_email": None,
            "decided_at": None,
            "rejection_reason": None,
            "final_path": None,
        }
        self.approvals[req["id"]] = req
        return self.public_approval(req)

    def list_approvals(self, status=None, q=None):
        items = list(self.approvals.values())
        if status and status != "all":
            items = [a for a in items if a["status"] == status]
        if q:
            ql = q.lower().strip()
            items = [
                a
                for a in items
                if ql in a["filename"].lower()
                or ql in a["uploaded_by_email"].lower()
                or ql in a["destination_path"].lower()
            ]
        items.sort(key=lambda a: a["uploaded_at"], reverse=True)
        return [self.public_approval(a) for a in items]

    def get_approval(self, request_id):
        req = self.approvals.get(request_id)
        return self.public_approval(req) if req else None

    def get_approval_file(self, request_id):
        req = self.approvals.get(request_id)
        if not req:
            return None
        return req["content"], req["content_type"], req["filename"]

    def approve_approval(self, request_id, decided_by_email):
        req = self.approvals.get(request_id)
        if req is None:
            return None
        if req["status"] != "pending":
            raise Conflict(f"This request has already been {req['status']}")
        req["status"] = "approved"
        req["decided_by_email"] = decided_by_email
        req["decided_at"] = datetime.now().isoformat()
        try:
            path = self.place_file(
                req["destination_folder_id"], req["filename"], req["content"], req["content_type"]
            )
        except Exception:
            req["status"] = "pending"
            req["decided_by_email"] = None
            req["decided_at"] = None
            raise
        req["final_path"] = path
        req["content"] = b""  # release staged bytes once filed
        return self.public_approval(req)

    def reject_approval(self, request_id, decided_by_email, reason=None):
        req = self.approvals.get(request_id)
        if req is None:
            return None
        if req["status"] != "pending":
            raise Conflict(f"This request has already been {req['status']}")
        req["status"] = "rejected"
        req["decided_by_email"] = decided_by_email
        req["decided_at"] = datetime.now().isoformat()
        req["rejection_reason"] = reason
        try:
            target_id = self.reject_target_for(req["destination_folder_id"])
            path = self.place_file(target_id, req["filename"], req["content"], req["content_type"])
        except Exception:
            req["status"] = "pending"
            req["decided_by_email"] = None
            req["decided_at"] = None
            req["rejection_reason"] = None
            raise
        req["final_path"] = path
        req["content"] = b""
        return self.public_approval(req)

    @staticmethod
    def public_approval(req):
        return {k: v for k, v in req.items() if k != "content"}

    # -------------------------------------------------------------------- jobs
    def _make_job(self, filename, status, dest_path, detected_month):
        job = {
            "id": str(next(self._job_ids)),
            "filename": filename,
            "status": "processing",  # flips to `status` after first poll
            "final_status": status,
            "destination": dest_path,
            "detected_month": detected_month,
            "polls": 0,
        }
        self.jobs[job["id"]] = job
        return self.public_job(job)

    def get_job(self, job_id):
        job = self.jobs.get(job_id)
        if not job:
            return None
        # Simulate async processing: first poll still "processing", then done.
        job["polls"] += 1
        if job["polls"] >= 2:
            job["status"] = job["final_status"]
        return self.public_job(job)

    @staticmethod
    def public_job(job):
        return {
            "id": job["id"],
            "filename": job["filename"],
            "status": job["status"],
            "destination": job["destination"],
            "detected_month": job["detected_month"],
        }


# --------------------------------------------------------------------- helpers
_MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]
_MONTH_LOOKUP = {m.lower(): i + 1 for i, m in enumerate(_MONTHS)}
_MONTH_LOOKUP.update({m[:3].lower(): i + 1 for i, m in enumerate(_MONTHS)})


def _next_month(year, month):
    return (year + 1, 1) if month == 12 else (year, month + 1)


def _detect_month(filename):
    """Fake the PaddleOCR step by parsing a month/year out of the filename.

    Recognises `2026-07`, `2026_07`, `07-2026`, and month names (`July 2026`,
    `Jul-2026`). Returns (year, month) or (None, None)."""
    name = filename.lower()
    m = re.search(r"(20\d{2})[-_.](0[1-9]|1[0-2])", name)
    if m:
        return int(m.group(1)), int(m.group(2))
    m = re.search(r"(0[1-9]|1[0-2])[-_.](20\d{2})", name)
    if m:
        return int(m.group(2)), int(m.group(1))
    m = re.search(r"(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-_ ]?(20\d{2})", name)
    if m:
        return int(m.group(2)), _MONTH_LOOKUP[m.group(1)]
    return None, None


store = Store()
