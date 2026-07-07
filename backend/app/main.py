"""FastAPI entry point for the Vessel DMS.

One code path over a backend interface: real SharePoint Embedded + PostgreSQL
when configured (see backend/.env), otherwise the in-memory stub. See
`app/services/__init__.py`.
"""
import asyncio

import httpx

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


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------

class CheckEmailIn(BaseModel):
    email: str


class LoginIn(BaseModel):
    access_token: str
    tenant_id: str = ""


class LogoutIn(BaseModel):
    email: str | None = None


@app.post("/api/auth/check-email")
async def check_email(payload: CheckEmailIn):
    """Pre-flight check: confirm the email is a member/guest in the Entra tenant.

    When Graph is not configured (stub mode) we let all emails through so that
    development still works without Azure credentials.
    """
    # TEMPORARY: Bypass email check for development
    return {"allowed": True}
    
    if not settings.graph_configured:
        return {"allowed": True}

    email = payload.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(400, "Invalid email address")

    # Acquire an app-only token for Graph
    token_url = f"{settings.graph_authority}/{settings.azure_tenant_id}/oauth2/v2.0/token"
    async with httpx.AsyncClient(verify=settings.graph_verify_ssl) as client:
        # 1. Get an app-only access token
        token_resp = await client.post(
            token_url,
            data={
                "grant_type": "client_credentials",
                "client_id": settings.graph_client_id,
                "client_secret": settings.graph_client_secret,
                "scope": settings.graph_scope,
            },
        )
        if token_resp.status_code != 200:
            # If we can't reach Graph, fail open so the user can still try MSAL.
            return {"allowed": True}

        app_token = token_resp.json().get("access_token", "")

        # 2. Look up the user in the directory
        user_resp = await client.get(
            f"{settings.graph_base_url}/users/{email}",
            headers={"Authorization": f"Bearer {app_token}"},
        )

    if user_resp.status_code == 200:
        return {"allowed": True}
    if user_resp.status_code == 404:
        raise HTTPException(
            403,
            detail="This email address is not authorised. Contact your administrator.",
        )
    # Any other error from Graph — fail open
    return {"allowed": True}


@app.post("/api/auth/login")
async def auth_login(payload: LoginIn):
    """Validate the MSAL access token by calling Graph /me and return user info."""
    async with httpx.AsyncClient(verify=settings.graph_verify_ssl) as client:
        me_resp = await client.get(
            f"{settings.graph_base_url}/me",
            headers={"Authorization": f"Bearer {payload.access_token}"},
        )

    if me_resp.status_code != 200:
        raise HTTPException(401, "Token validation failed")

    me = me_resp.json()
    return {
        "display_name": me.get("displayName") or me.get("userPrincipalName", ""),
        "email": me.get("mail") or me.get("userPrincipalName", ""),
    }


@app.post("/api/auth/logout")
async def auth_logout(payload: LogoutIn):
    """Session-end signal from the frontend. Returns 200 immediately.

    Any server-side session state (e.g. token cache entries) can be cleared here.
    """
    return {"ok": True}


# ---------------------------------------------------------------------------

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
