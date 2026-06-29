# Vessel DMS — SharePoint Embedded Setup (Phase B)

This is the one-time setup to connect the app to your real SharePoint Embedded
(SPE) storage. Some steps require a Microsoft 365 / SharePoint admin.

## 0. Apps (already created by your IT team)

- **Backend app** (confidential) — used by the API for app-only Graph access.
  We need its **tenant id**, **client id**, and a **client secret**.
- **Frontend app** (SPA) — used later for SSO (Phase B+). Not needed yet.

## 1. Graph permission (admin)

On the **backend app**, add Microsoft Graph **application** permission:

- `FileStorageContainer.Selected`  → then **Grant admin consent**.

## 2. Container type (admin / your IT team)

A container type is owned by exactly one app. It must be owned by — or authorize
— the **backend app**.

1. Register the container type (SharePoint Online Management Shell / PnP), with
   the **backend app as the owning application**.
2. Grant the backend app permissions on the container type
   (`AppOnly` full / read+write+manage).
3. (Standard/billed types only) configure billing with an Azure subscription.
   A **trial** container type needs no billing and is fine for development.
4. Hand over the **ContainerTypeId** (GUID).

## 3. Configure the backend

```
cd backend
copy .env.example .env       # then edit .env
```

Fill in: `AZURE_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`,
`CONTAINER_TYPE_ID`, `DATABASE_URL`.

Install dependencies:

```
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

## 4. Create the shared container (one-time)

```
.\.venv\Scripts\python.exe -m scripts.create_container
```

Copy the printed `CONTAINER_ID=...` line into `.env`.

## 5. Database

Point `DATABASE_URL` at your PostgreSQL instance, then run migrations:

```
.\.venv\Scripts\python.exe -m alembic upgrade head
```

## 6. Run

```
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8010
```

When `graph_configured` and `db_configured` are both true, the app uses real
SharePoint Embedded + PostgreSQL. If they are blank, it falls back to the
in-memory stub so the UI still runs.

## Notes

- Folder creation is idempotent — re-running provisioning never duplicates folders.
- Month folders (`June 2026`, …) are created automatically on the 20th of the
  prior month by the scheduler, and on upload if a document's month is missing.
