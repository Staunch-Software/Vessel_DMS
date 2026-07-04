"""FastAPI entry point for the Vessel DMS.

One code path over a backend interface: real SharePoint Embedded + PostgreSQL
when configured (see backend/.env), otherwise the in-memory stub. See
`app/services/__init__.py`.
"""
import asyncio

from fastapi import FastAPI, Form, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .config import settings
from .services import backend_mode, get_backend
from .services.errors import BadRequest, Conflict, NotFound

app = FastAPI(title="Vessel DMS", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _raise(e: Exception):
    """Map domain exceptions to HTTP errors."""
    status = getattr(e, "status", None)
    if status:
        raise HTTPException(status, str(e))
    raise


class VesselIn(BaseModel):
    name: str
    imo: str | None = None


@app.on_event("startup")
async def _startup():
    from .scheduler import precreate_next_month, start_scheduler

    app.state.scheduler = start_scheduler()
    if settings.graph_configured and settings.db_configured:
        # Catch-up in case the server started after the 20th.
        asyncio.create_task(precreate_next_month())


@app.get("/api/health")
def health():
    return {"status": "ok", "mode": backend_mode()}


@app.get("/api/vessels")
async def list_vessels():
    return await get_backend().list_vessels()


@app.post("/api/vessels", status_code=201)
async def create_vessel(payload: VesselIn):
    try:
        return await get_backend().create_vessel(payload.name, payload.imo)
    except (BadRequest, Conflict) as e:
        _raise(e)


@app.get("/api/mains")
async def mains():
    return await get_backend().mains()


@app.get("/api/stats")
async def stats():
    return await get_backend().stats()


@app.get("/api/folders/{folder_id}/children")
async def children(folder_id: str):
    try:
        return await get_backend().children(folder_id)
    except (NotFound, BadRequest) as e:
        _raise(e)


@app.get("/api/folders/{folder_id}")
async def folder(folder_id: str):
    try:
        return await get_backend().get_folder(folder_id)
    except (NotFound, BadRequest) as e:
        _raise(e)


@app.post("/api/folders/{folder_id}/upload")
async def upload(folder_id: str, file: UploadFile):
    data = await file.read()
    try:
        return await get_backend().upload(folder_id, file.filename, data, file.content_type)
    except (NotFound, BadRequest, Conflict) as e:
        _raise(e)


@app.post("/api/folders/{folder_id}/month-upload")
async def month_upload(folder_id: str, file: UploadFile, category: str = Form(None)):
    data = await file.read()
    try:
        return await get_backend().month_upload(
            folder_id, file.filename, category, data, file.content_type
        )
    except (NotFound, BadRequest, Conflict) as e:
        _raise(e)


@app.get("/api/files/{file_id}/content")
async def file_content(file_id: str):
    result = await get_backend().get_file(file_id)
    if result is None:
        raise HTTPException(404, "File not found")
    content, content_type, name = result
    return Response(
        content=content,
        media_type=content_type,
        headers={"Content-Disposition": f'inline; filename="{name}"'},
    )


@app.delete("/api/files/{file_id}", status_code=204)
async def delete_file(file_id: str):
    if not await get_backend().delete_file(file_id):
        raise HTTPException(404, "File not found")
    return Response(status_code=204)


@app.get("/api/search")
async def search(q: str = ""):
    return await get_backend().search(q)


@app.get("/api/jobs/{job_id}")
async def get_job(job_id: str):
    job = await get_backend().get_job(job_id)
    if job is None:
        raise HTTPException(404, "Job not found")
    return job
