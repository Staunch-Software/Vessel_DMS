"""Stub FastAPI for the SharePoint Embedded DMS — Phase A (UI-first).

Serves realistic, correctly-shaped data from an in-memory store so the React UI
can be built against the final endpoint contracts. No Graph/OCR/DB yet.
"""
import re

from fastapi import FastAPI, Form, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .store import DuplicateFile, store

app = FastAPI(title="Vessel DMS (stub)", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class VesselIn(BaseModel):
    name: str
    imo: str | None = None


@app.get("/api/vessels")
def list_vessels():
    return [
        {"id": v["id"], "name": v["name"], "imo": v.get("imo")}
        for v in store.vessels
    ]


@app.post("/api/vessels", status_code=201)
def create_vessel(payload: VesselIn):
    name = payload.name.strip()
    imo = (payload.imo or "").strip()
    if not name:
        raise HTTPException(400, "Vessel name is required")
    if imo and not re.fullmatch(r"\d{7}", imo):
        raise HTTPException(400, "IMO number must be exactly 7 digits")
    if any(v["name"].lower() == name.lower() for v in store.vessels):
        raise HTTPException(409, "A vessel with that name already exists")
    if imo and any(v.get("imo") == imo for v in store.vessels):
        raise HTTPException(409, "A vessel with that IMO number already exists")
    return store.add_vessel(name, imo or None)


@app.get("/api/tree")
def get_tree():
    return store.tree()


@app.get("/api/folders/{folder_id}/children")
def get_children(folder_id: str):
    if store.get_node(folder_id) is None:
        raise HTTPException(404, "Folder not found")
    return store.children(folder_id)


@app.post("/api/folders/{folder_id}/upload")
async def upload(folder_id: str, file: UploadFile):
    node = store.get_node(folder_id)
    if node is None:
        raise HTTPException(404, "Folder not found")
    if not node["upload"] or node["month_driven"]:
        raise HTTPException(400, "This folder does not accept direct uploads")
    data = await file.read()
    try:
        return store.upload(folder_id, file.filename, data, file.content_type)
    except DuplicateFile:
        raise HTTPException(409, f"'{file.filename}' already exists in this folder")


@app.post("/api/folders/{folder_id}/month-upload")
async def month_upload(folder_id: str, file: UploadFile, category: str = Form(None)):
    node = store.get_node(folder_id)
    if node is None:
        raise HTTPException(404, "Folder not found")
    if not node["month_driven"]:
        raise HTTPException(400, "This folder is not a month-driven folder")
    data = await file.read()
    try:
        return store.month_upload(
            folder_id, file.filename, category, data, file.content_type
        )
    except DuplicateFile:
        raise HTTPException(
            409, f"'{file.filename}' already exists in the target month folder"
        )


@app.get("/api/files/{file_id}/content")
def file_content(file_id: str):
    result = store.get_file(file_id)
    if result is None:
        raise HTTPException(404, "File not found")
    content, content_type, name = result
    return Response(
        content=content,
        media_type=content_type,
        headers={"Content-Disposition": f'inline; filename="{name}"'},
    )


@app.delete("/api/files/{file_id}", status_code=204)
def delete_file(file_id: str):
    if not store.delete_file(file_id):
        raise HTTPException(404, "File not found")
    return Response(status_code=204)


@app.get("/api/search")
def search(q: str = ""):
    return store.search(q)


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str):
    job = store.get_job(job_id)
    if job is None:
        raise HTTPException(404, "Job not found")
    return job


@app.get("/api/health")
def health():
    return {"status": "ok"}
