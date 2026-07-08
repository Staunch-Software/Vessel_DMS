"""Async adapter over the in-memory `store` (stub mode).

Presents the same interface as RealBackend so the API layer is backend-agnostic.
"""
from ..store import store
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
        if any(v["name"].lower() == name.lower() for v in store.vessels):
            raise Conflict("A vessel with that name already exists")
        if imo and any(v.get("imo") == imo for v in store.vessels):
            raise Conflict("A vessel with that IMO number already exists")
        return store.add_vessel(
            name, imo or None, shipyard=shipyard, hull_number=hull_number, vessel_type=vessel_type
        )

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

    async def get_file(self, file_id):
        return store.get_file(file_id)

    async def delete_file(self, file_id):
        return store.delete_file(file_id)

    async def search(self, q):
        return store.search(q)

    async def get_job(self, job_id):
        return store.get_job(job_id)
