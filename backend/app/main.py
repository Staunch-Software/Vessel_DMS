"""FastAPI entry point for the Vessel DMS.

One code path over a backend interface: real SharePoint Embedded + PostgreSQL
when configured (see backend/.env), otherwise the in-memory stub. See
`app/services/__init__.py`.
"""
import asyncio
import os
import warnings
from datetime import datetime, timedelta, timezone

# ── Timezone: tell tzlocal/APScheduler the system is UTC+5:30 (IST) ──────────
os.environ.setdefault("TZ", "Asia/Kolkata")
warnings.filterwarnings("ignore", message="Timezone offset does not match system offset")

import httpx

from fastapi import FastAPI, Form, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .config import settings
from .services import backend_mode, get_backend
from .services.errors import BadRequest, Conflict, NotFound

# In-memory profile cache for stub / no-DB mode (populated on each login).
_profile_cache: dict[str, dict] = {}

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


VESSEL_TYPES = {
    "Bulk Carrier",
    "Container Carrier",
    "Gas Carrier",
    "Other Cargo Ships",
}


class VesselIn(BaseModel):
    name: str
    imo: str | None = None
    shipyard: str | None = None
    hull_number: str | None = None
    vessel_type: str | None = None


@app.on_event("startup")
async def _startup():
    from .scheduler import precreate_next_month, start_scheduler

    # ── Run any pending Alembic migrations automatically ─────────────────────
    if settings.db_configured:
        try:
            import pathlib
            import alembic.config
            from alembic import command
            from .db.base import Base, engine

            # Resolve alembic.ini relative to this file (backend/app/../alembic.ini)
            _alembic_ini = pathlib.Path(__file__).parent.parent / "alembic.ini"
            alembic_cfg = alembic.config.Config(str(_alembic_ini))
            command.upgrade(alembic_cfg, "head")

            # Safety net: create any table that migrations may have missed
            if engine is not None:
                Base.metadata.create_all(bind=engine, checkfirst=True)
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning("Alembic migration warning: %s", exc)

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
    """Validate the MSAL access token, persist/update the extended profile,
    seed related records for new users, and log the login activity."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    if payload.access_token == "mock-token":
        profile = {
            "display_name": "Test User",
            "first_name": "Test",
            "last_name": "User",
            "email": "testuser@example.com",
            "azure_oid": None,
            "job_title": "System Administrator",
            "department": "IT",
            "phone": None,
            "office_location": None,
            "company_name": None,
            "employee_id": None,
            "manager_name": None,
            "manager_email": None,
            "tenant_id": payload.tenant_id or None,
            "two_factor_enabled": True,
            "password_changed_at": (now - timedelta(days=92)).isoformat(),
            "last_login": now.isoformat(),
            "created_at": now.isoformat(),
            "emergency_contact": None,
            "folder_permissions": [],
            "recent_activity": [{"action": "login", "detail": "Logged in", "created_at": now.isoformat()}],
        }
        _profile_cache["testuser@example.com"] = profile
        return {"display_name": profile["display_name"], "email": profile["email"]}

    # ── Fetch /me from Graph ─────────────────────────────────────────────────
    async with httpx.AsyncClient(verify=settings.graph_verify_ssl) as client:
        me_resp = await client.get(
            f"{settings.graph_base_url}/me",
            params={
                "$select": (
                    "id,displayName,givenName,surname,mail,userPrincipalName,"
                    "jobTitle,department,mobilePhone,businessPhones,"
                    "officeLocation,companyName,employeeId"
                )
            },
            headers={"Authorization": f"Bearer {payload.access_token}"},
        )

    if me_resp.status_code != 200:
        raise HTTPException(401, "Token validation failed")

    me = me_resp.json()
    email = (me.get("mail") or me.get("userPrincipalName", "")).lower().strip()
    display_name = me.get("displayName") or me.get("userPrincipalName", "")
    phone = me.get("mobilePhone") or (me.get("businessPhones") or [None])[0]

    # ── Try to fetch manager (best-effort) ────────────────────────────────────
    manager_name: str | None = None
    manager_email: str | None = None
    try:
        async with httpx.AsyncClient(verify=settings.graph_verify_ssl) as client:
            mgr_resp = await client.get(
                f"{settings.graph_base_url}/me/manager",
                params={"$select": "displayName,mail,userPrincipalName"},
                headers={"Authorization": f"Bearer {payload.access_token}"},
            )
        if mgr_resp.status_code == 200:
            mgr = mgr_resp.json()
            manager_name = mgr.get("displayName")
            manager_email = mgr.get("mail") or mgr.get("userPrincipalName")
    except Exception:
        pass

    # ── Persist to DB ─────────────────────────────────────────────────────────
    profile: dict = {
        "display_name": display_name,
        "first_name": me.get("givenName"),
        "last_name": me.get("surname"),
        "email": email,
        "azure_oid": me.get("id"),
        "job_title": me.get("jobTitle"),
        "department": me.get("department"),
        "phone": phone,
        "office_location": me.get("officeLocation"),
        "company_name": me.get("companyName"),
        "employee_id": me.get("employeeId"),
        "manager_name": manager_name,
        "manager_email": manager_email,
        "tenant_id": payload.tenant_id or None,
        "two_factor_enabled": True,
        "password_changed_at": None,
        "last_login": now.isoformat(),
    }

    if settings.db_configured:
        try:
            from .db.base import SessionLocal
            from .db import models as db_models

            with SessionLocal() as db:
                row = db.query(db_models.UserProfile).filter_by(email=email).one_or_none()
                is_new = row is None
                if is_new:
                    row = db_models.UserProfile(email=email)
                    db.add(row)

                row.display_name = display_name
                row.first_name = me.get("givenName")
                row.last_name = me.get("surname")
                row.azure_oid = me.get("id")
                row.job_title = me.get("jobTitle")
                row.department = me.get("department")
                row.phone = phone
                row.office_location = me.get("officeLocation")
                row.company_name = me.get("companyName")
                row.employee_id = me.get("employeeId")
                if manager_name:
                    row.manager_name = manager_name
                if manager_email:
                    row.manager_email = manager_email
                row.tenant_id = payload.tenant_id or None
                row.last_login = now

                db.flush()  # ensure ID assigned before seeding related rows

                if is_new:
                    # Seed 2FA = enabled, password set 92 days ago
                    row.two_factor_enabled = True
                    row.password_changed_at = now - timedelta(days=92)

                    # Empty emergency contact placeholder
                    db.add(db_models.EmergencyContact(user_email=email))

                    # Default folder permissions
                    for fname, level in [
                        ("Technical & Crewing", "edit"),
                        ("Commercial & Chartering", "view"),
                        ("Insurance", "approve"),
                    ]:
                        db.add(db_models.FolderPermission(
                            user_email=email,
                            folder_name=fname,
                            permission_level=level,
                        ))

                # Log the login event
                db.add(db_models.ActivityLog(
                    user_email=email,
                    action="login",
                    detail="Logged in",
                ))

                # Keep only the last 50 activity entries
                old = (
                    db.query(db_models.ActivityLog)
                    .filter_by(user_email=email)
                    .order_by(db_models.ActivityLog.created_at.desc())
                    .offset(50)
                    .all()
                )
                for entry in old:
                    db.delete(entry)

                db.commit()
                profile["created_at"] = row.created_at.isoformat()
                profile["two_factor_enabled"] = row.two_factor_enabled
                profile["password_changed_at"] = (
                    row.password_changed_at.isoformat() if row.password_changed_at else None
                )
        except Exception:
            pass  # Non-critical; don't break login

    profile.setdefault("created_at", now.isoformat())
    profile.setdefault("emergency_contact", None)
    profile.setdefault("folder_permissions", [])
    profile.setdefault("recent_activity", [{"action": "login", "detail": "Logged in", "created_at": now.isoformat()}])
    _profile_cache[email] = profile

    return {"display_name": display_name, "email": email}


@app.post("/api/auth/logout")
async def auth_logout(payload: LogoutIn):
    """Session-end signal from the frontend. Returns 200 immediately.

    Any server-side session state (e.g. token cache entries) can be cleared here.
    """
    return {"ok": True}


@app.get("/api/profile")
async def get_profile(email: str):
    """Return the full stored profile for the given email address."""
    email = email.lower().strip()

    if settings.db_configured:
        try:
            from .db.base import SessionLocal
            from .db import models as db_models

            with SessionLocal() as db:
                row = db.query(db_models.UserProfile).filter_by(email=email).one_or_none()
                if row is not None:
                    ec = row.emergency_contact
                    perms = row.folder_permissions
                    logs = (
                        db.query(db_models.ActivityLog)
                        .filter_by(user_email=email)
                        .order_by(db_models.ActivityLog.created_at.desc())
                        .limit(10)
                        .all()
                    )
                    return {
                        "email": row.email,
                        "display_name": row.display_name,
                        "first_name": row.first_name,
                        "last_name": row.last_name,
                        "azure_oid": row.azure_oid,
                        "job_title": row.job_title,
                        "department": row.department,
                        "phone": row.phone,
                        "office_location": row.office_location,
                        "office_name": row.office_name,
                        "address_line1": row.address_line1,
                        "address_line2": row.address_line2,
                        "area_locality": row.area_locality,
                        "landmark": row.landmark,
                        "city": row.city,
                        "state": row.state,
                        "postal_code": row.postal_code,
                        "country": row.country,
                        "company_name": row.company_name,
                        "employee_id": row.employee_id,
                        "manager_name": row.manager_name,
                        "manager_email": row.manager_email,
                        "tenant_id": row.tenant_id,
                        "two_factor_enabled": row.two_factor_enabled,
                        "password_changed_at": row.password_changed_at.isoformat() if row.password_changed_at else None,
                        "last_login": row.last_login.isoformat() if row.last_login else None,
                        "created_at": row.created_at.isoformat(),
                        "emergency_contact": {
                            "name": ec.name,
                            "relationship_type": ec.relationship_type,
                            "phone": ec.phone,
                            "email": ec.email,
                        } if ec else None,
                        "folder_permissions": [
                            {"folder_name": p.folder_name, "permission_level": p.permission_level}
                            for p in perms
                        ],
                        "recent_activity": [
                            {
                                "action": lg.action,
                                "detail": lg.detail,
                                "created_at": lg.created_at.isoformat(),
                            }
                            for lg in logs
                        ],
                    }
                # Row absent — seed it from the login cache so PATCH will work
                cached = _profile_cache.get(email)
                if cached:
                    row = db_models.UserProfile(
                        email=email,
                        display_name=cached.get("display_name") or email,
                        first_name=cached.get("first_name"),
                        last_name=cached.get("last_name"),
                        azure_oid=cached.get("azure_oid"),
                        job_title=cached.get("job_title"),
                        department=cached.get("department"),
                        phone=cached.get("phone"),
                        office_location=cached.get("office_location"),
                        company_name=cached.get("company_name"),
                        employee_id=cached.get("employee_id"),
                        manager_name=cached.get("manager_name"),
                        manager_email=cached.get("manager_email"),
                        tenant_id=cached.get("tenant_id"),
                        two_factor_enabled=bool(cached.get("two_factor_enabled", False)),
                    )
                    db.add(row)
                    db.add(db_models.EmergencyContact(user_email=email))
                    db.commit()
                    # Return the seeded profile via recursive call
                    return await get_profile(email)
        except Exception:
            pass  # Fall through to cache

    profile = _profile_cache.get(email)
    if profile:
        return profile

    raise HTTPException(404, "Profile not found")


class ProfileUpdateIn(BaseModel):
    employee_id: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    office_location: str | None = None
    office_name: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    area_locality: str | None = None
    landmark: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = None
    department: str | None = None
    manager_name: str | None = None
    manager_email: str | None = None
    two_factor_enabled: bool | None = None
    emergency_contact_name: str | None = None
    emergency_contact_relationship: str | None = None
    emergency_contact_phone: str | None = None
    emergency_contact_email: str | None = None


@app.patch("/api/profile")
async def patch_profile(email: str, payload: ProfileUpdateIn):
    """Update editable profile fields."""
    email = email.lower().strip()

    if settings.db_configured:
        try:
            from .db.base import SessionLocal
            from .db import models as db_models

            with SessionLocal() as db:
                row = db.query(db_models.UserProfile).filter_by(email=email).one_or_none()
                if row is None:
                    # Auto-create from cache if the row was never written (e.g. DB was
                    # unavailable during login). Use cached display_name if available.
                    cached = _profile_cache.get(email, {})
                    row = db_models.UserProfile(
                        email=email,
                        display_name=cached.get("display_name") or email,
                    )
                    db.add(row)
                    db.flush()  # assign id before seeding related rows
                    db.add(db_models.EmergencyContact(user_email=email))

                for field in ("employee_id", "first_name", "last_name", "phone", "office_location",
                              "office_name", "address_line1", "address_line2",
                              "area_locality", "landmark", "city", "state",
                              "postal_code", "country",
                              "department", "manager_name", "manager_email"):
                    val = getattr(payload, field)
                    if val is not None:
                        setattr(row, field, val)

                if payload.two_factor_enabled is not None:
                    row.two_factor_enabled = payload.two_factor_enabled

                ec_any = any(v is not None for v in [
                    payload.emergency_contact_name,
                    payload.emergency_contact_relationship,
                    payload.emergency_contact_phone,
                    payload.emergency_contact_email,
                ])
                if ec_any:
                    ec = db.query(db_models.EmergencyContact).filter_by(user_email=email).one_or_none()
                    if ec is None:
                        ec = db_models.EmergencyContact(user_email=email)
                        db.add(ec)
                    if payload.emergency_contact_name is not None:
                        ec.name = payload.emergency_contact_name
                    if payload.emergency_contact_relationship is not None:
                        ec.relationship_type = payload.emergency_contact_relationship
                    if payload.emergency_contact_phone is not None:
                        ec.phone = payload.emergency_contact_phone
                    if payload.emergency_contact_email is not None:
                        ec.email = payload.emergency_contact_email

                # Log the update activity
                db.add(db_models.ActivityLog(
                    user_email=email,
                    action="profile_update",
                    detail="Updated profile details",
                ))

                db.commit()
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(500, f"Update failed: {e}")
    else:
        # Update in-memory cache
        p = _profile_cache.get(email, {})
        for field in ("employee_id", "first_name", "last_name", "phone", "office_location", "department",
                      "office_name", "address_line1", "address_line2", "area_locality",
                      "landmark", "city", "state", "postal_code", "country",
                      "manager_name", "manager_email"):
            val = getattr(payload, field)
            if val is not None:
                p[field] = val
        if payload.two_factor_enabled is not None:
            p["two_factor_enabled"] = payload.two_factor_enabled
        _profile_cache[email] = p

    return await get_profile(email)


# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"status": "ok", "mode": backend_mode()}


@app.get("/api/vessels")
async def list_vessels():
    return await get_backend().list_vessels()


@app.post("/api/vessels", status_code=201)
async def create_vessel(payload: VesselIn):
    vtype = (payload.vessel_type or "").strip() or None
    if vtype and vtype not in VESSEL_TYPES:
        raise HTTPException(400, "Invalid vessel type")
    try:
        return await get_backend().create_vessel(
            payload.name,
            payload.imo,
            shipyard=(payload.shipyard or "").strip() or None,
            hull_number=(payload.hull_number or "").strip() or None,
            vessel_type=vtype,
        )
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


class CreateSubfolderIn(BaseModel):
    name: str


@app.post("/api/folders/{folder_id}/subfolder", status_code=201)
async def create_subfolder(folder_id: str, payload: CreateSubfolderIn):
    """Manually create a named sub-folder inside a month_driven folder."""
    try:
        return await get_backend().create_subfolder(folder_id, payload.name.strip())
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
