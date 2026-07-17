"""Async adapter over the in-memory `store` (stub mode).

Presents the same interface as RealBackend so the API layer is backend-agnostic.
"""
from ..store import store
from .normalize import normalize_vessel_name
from .errors import BadRequest, Conflict, NotFound


class StubBackend:
    async def list_vessels(self):
        return [
            {
                "id": v["id"],
                "name": v["name"],
                "imo": v.get("imo"),
                "shipyard": v.get("shipyard"),
                "hull_number": v.get("hull_number"),
                "vessel_type": v.get("vessel_type"),
            }
            for v in store.vessels
        ]

    async def create_vessel(self, name, imo, shipyard=None, hull_number=None, vessel_type=None):
        name = (name or "").strip()
        imo = (imo or "").strip()
        if not name:
            raise BadRequest("Vessel name is required")
        if imo and not imo.isdigit() or (imo and len(imo) != 7):
            raise BadRequest("IMO number must be exactly 7 digits")
        
        normalized_name = normalize_vessel_name(name)
        if any(normalize_vessel_name(v["name"]) == normalized_name for v in store.vessels):
            raise Conflict("Vessel name already exists.")
        if imo and any(v.get("imo") == imo for v in store.vessels):
            raise Conflict("A vessel with that IMO number already exists")
        return store.add_vessel(
            name, imo or None, shipyard=shipyard, hull_number=hull_number, vessel_type=vessel_type
        )

    async def reprovision_vessel(self, vessel_id: str) -> dict:
        """Stub: no-op — the in-memory store always uses the current template."""
        vessel = next((v for v in store.vessels if v["id"] == vessel_id), None)
        if vessel is None:
            raise NotFound(f"Vessel {vessel_id!r} not found")
        return {"ok": True, "vessel_id": vessel_id, "name": vessel["name"]}

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

    async def upload(self, folder_id, filename, content, content_type):
        node = store.get_node(folder_id)
        if node is None:
            raise NotFound("Folder not found")
        # Allow uploads into leaf, month_driven, and month folders
        if not node["upload"] or node["month_driven"]:
            raise BadRequest("This folder does not accept direct uploads")
        return store.upload(folder_id, filename, content, content_type)

    async def month_upload(self, folder_id, filename, category, content, content_type):
        node = store.get_node(folder_id)
        if node is None:
            raise NotFound("Folder not found")
        if not node["month_driven"]:
            raise BadRequest("This folder is not a month-driven folder")
        return store.month_upload(folder_id, filename, category, content, content_type)

    async def create_subfolder(self, folder_id: str, name: str):
        """Manually create a named sub-folder inside a month_driven folder."""
        return store.create_subfolder(folder_id, name)

    async def delete_folder(self, folder_id: str) -> bool:
        node = store.get_node(folder_id)
        if node is None:
            raise NotFound("Folder not found")
        return store.delete_folder(folder_id)

    async def get_file(self, file_id):
        return store.get_file(file_id)

    async def delete_file(self, file_id):
        return store.delete_file(file_id)

    async def search(self, q):
        return store.search(q)

    async def get_job(self, job_id):
        return store.get_job(job_id)

    async def archive_item(self, item_id: str, item_type: str):
        store.archive_item(item_id, item_type)

    async def restore_item(self, item_id: str):
        store.restore_item(item_id)

    async def get_archived_ids(self) -> list[str]:
        return store.get_archived_ids()

    def _stub_original_path(self, node_id: str) -> str:
        path_parts = []
        curr = store.get_node(node_id)
        while curr:
            path_parts.insert(0, curr["name"])
            parent_id = curr.get("parent_id")
            curr = store.get_node(parent_id) if parent_id else None
        return "/".join(path_parts)

    async def get_archived_nodes(self):
        ids = store.get_archived_ids()
        out = []
        for i in ids:
            node = store.get_node(i)
            if node:
                s = store.serialize(node, depth=0)
                original_path = self._stub_original_path(i)
                main_folder = original_path.split("/", 1)[0] if "/" in original_path else original_path
                s["main_folder"] = main_folder
                s["original_path"] = original_path
                out.append(s)
        return out

    async def get_deleted_ids(self) -> list[str]:
        return store.get_deleted_ids()

    async def get_deleted_nodes(self):
        ids = store.get_deleted_ids()
        out = []
        for i in ids:
            node = store.get_node(i)
            if node:
                s = store.serialize(node, depth=0)
                original_path = self._stub_original_path(i)
                main_folder = original_path.split("/", 1)[0] if "/" in original_path else original_path
                s["main_folder"] = main_folder
                s["original_path"] = original_path
                out.append(s)
        return out

    async def restore_deleted_item(self, item_id: str) -> bool:
        return store.restore_deleted_item(item_id)

    async def permanent_delete_item(self, item_id: str, item_type: str) -> bool:
        return store.permanent_delete_item(item_id, item_type)

