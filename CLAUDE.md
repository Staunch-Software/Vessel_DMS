# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Vessel DMS — a document management system for ship/vessel management built on **SharePoint Embedded (SPE)**. Documents are uploaded through a React UI and stored in a single shared SPE container under a strict, opinionated folder hierarchy (three top-level areas × per-ship folders + a "Common for all ships" folder). Certain folders are "month-driven": uploads are auto-filed into `{Month YYYY}` sub-folders based on a date OCR'd/parsed from the document itself, with a fallback scheduler that pre-creates next month's folders on the 20th.

Uploads are never filed directly: every upload creates a staged **approval request** that an admin must approve or reject (see "Approval workflow" below).

```
React + Vite + Tailwind  ──HTTP──>  FastAPI  ──Microsoft Graph (app-only)──>  SPE container (one drive)
                                       │
                                       ├── PaddleOCR (month detection)
                                       └── PostgreSQL (vessels, folder map, jobs)
```

## Running locally

**Backend** (from `backend/`):
```
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env   # fill in values — see docs/SETUP.md
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8010 --reload
```

**Frontend** (from `frontend/`):
```
npm install
npm run dev        # http://localhost:5173, proxies /api -> http://localhost:8010 (see vite.config.ts)
```

**Frontend build/lint:**
```
npm run build       # tsc -b && vite build — this IS the type-check step, there's no separate lint script
npm run preview
```

There is no backend test suite or lint config currently configured (no pytest, no ruff/flake8 config found). `backend/test_azure.py` and `backend/test_user.py` at the backend root are untracked ad hoc scripts, not a test suite.

One-time container setup (real Graph mode only):
```
cd backend && .\.venv\Scripts\python.exe -m scripts.create_container
```
Then `alembic upgrade head` to run DB migrations. Full walkthrough in [docs/SETUP.md](docs/SETUP.md).

## Stub vs. live mode — the central architectural fact

The backend has **two complete implementations of the same interface**, selected once at startup by [backend/app/services/__init__.py](backend/app/services/__init__.py):

- **Stub mode** (default, no config needed): [backend/app/services/stub_backend.py](backend/app/services/stub_backend.py) wraps the in-memory [backend/app/store.py](backend/app/store.py). Fake OCR parses month/year out of the *filename* (regexes at the bottom of `store.py`). Nothing persists across restarts.
- **Live mode** (when `settings.graph_configured and settings.db_configured`): [backend/app/services/real_backend.py](backend/app/services/real_backend.py) talks to Microsoft Graph (SPE container) + PostgreSQL, and runs real PaddleOCR/PyMuPDF text extraction on uploaded documents.

`backend/app/config.py`'s `Settings.graph_configured`/`db_configured` properties are booleans derived from whether the relevant `.env` values are present — there's no explicit mode flag. **Both backends must be kept behavior-identical** (same routes, same response shapes, same error types) since `main.py` has one code path (`get_backend()`) regardless of mode. When adding a feature, implement it in both `stub_backend.py` and `real_backend.py`.

Domain errors (`BadRequest`, `Conflict`, `NotFound`, `DuplicateFile` in [backend/app/services/errors.py](backend/app/services/errors.py)) carry an HTTP `status` and are translated to `HTTPException` centrally in `main.py`'s `_raise()`.

## The folder template — single source of truth

[backend/app/template.py](backend/app/template.py) declaratively defines the *entire* folder hierarchy as nested dicts built from three helpers:
- `leaf(name)` — accepts direct uploads.
- `folder(name, children)` — pure container, no upload button.
- `month_driven(name, month_children)` — upload button lives at its root; uploads get OCR'd for a month/year and routed into an auto-created `{Month YYYY}` folder containing the given category leaves.

`MAIN_FOLDERS` (Technical & Crewing / Commercial & Chartering / Insurance) are the three roots. `SHIP_TEMPLATE[main]` is cloned under every vessel; `COMMON_TEMPLATE[main]` exists once per main folder ("Common for all ships").

This template is consumed by **three different places** that must stay in sync conceptually:
1. `store.py` (stub) — builds the whole tree eagerly as in-memory nodes when a vessel is added.
2. `real_backend.py` — walks the template to provision real Graph folders (idempotent — re-running never duplicates), and caches `path -> driveItem id` (+ semantic flags) in the `folders` Postgres table.
3. `services/classify.py` — given a folder's path (list of names from a main folder down), re-derives its semantic kind (`main`/`ship`/`folder`/`leaf`/`month_driven`/`month`) by walking the template. Used by the real backend when Graph is the source of truth for the tree shape but the template is the source of truth for *meaning*.

If you change the hierarchy, change `template.py` only — the stub, real backend, and classifier all read from it.

## Backend module map

- `app/main.py` — all FastAPI routes; thin, delegates to `get_backend()`.
- `app/config.py` — `pydantic-settings` reading `backend/.env`; `graph_configured`/`db_configured` gate stub-vs-live.
- `app/store.py` — in-memory stub data store + fake filename-based month detection.
- `app/template.py` — folder hierarchy source of truth (see above).
- `app/services/` — `real_backend.py`, `stub_backend.py` (the two interface implementations), `classify.py` (path -> semantic kind), `errors.py` (domain exceptions).
- `app/graph/` — Graph API layer: `client.py` (MSAL app-only token acquisition + retrying request wrapper with 429/503 backoff), `drive.py` (driveItem operations: `ensure_folder` is idempotent create-or-get, chunked large-file upload, download, search), `http.py` (TLS verification via `truststore` for corporate MITM proxies — see its docstring before touching `GRAPH_VERIFY_SSL`).
- `app/ocr/` — `dates.py` (pure regex-based month/year parsing from text, weighted by keyword proximity — unit-testable without OCR deps), `extract.py` (PaddleOCR/PyMuPDF text extraction, lazily imported since these are heavy deps).
- `app/scheduler.py` — APScheduler job, active only in live mode, pre-creates next month's folders on/after the 20th of the prior month (`PRECREATE_DAY`).
- `app/db/` — SQLAlchemy models (`Vessel`, `Folder` — the path/driveItem cache, `UploadJob`) and session factory; `engine`/`SessionLocal` are `None` in stub mode.
- `scripts/create_container.py` — one-time script to provision the shared SPE container.

## Frontend module map

- `src/App.tsx` — the whole app shell: auth gating, dashboard/explorer view switch, folder navigation (breadcrumb path state), upload/delete handlers with toast feedback and job polling.
- `src/api.ts` — typed axios client for all `/api/*` endpoints; `FolderNode`/`Job`/`Vessel` types mirror the backend's serialized shapes.
- `src/authConfig.ts` — MSAL `PublicClientApplication` config (reads `VITE_AZURE_*` env vars), session-storage cache.
- `src/components/Login.tsx` — login/signed-out marketing-style pages; email pre-check hits `/api/auth/check-email` before `loginRedirect`.
- Other components (`Sidebar`, `Dashboard`, `Breadcrumb`, `UploadControl`, `TreeNode`, `SearchBar`, `Toast`, `CreateVesselModal`, `nodeStyle`) are presentational pieces driven by the `FolderNode` shape from `api.ts`.

Auth flow: MSAL handles the Microsoft redirect; on a cached session the app silently acquires a token and POSTs it to `/api/auth/login`, which the backend validates via Graph `/me` and returns `{display_name, email}`. Sign-out clears MSAL cache + local/session storage and redirects to `/signout`.

## Known in-progress state

Per [README.md](README.md): Phase A (full UI on stub backend) is done. Phase B (real Graph client, container script, Postgres models/migrations, PaddleOCR) is built, but the real provisioner + upload wiring + scheduler are still being finished, and SSO (Entra) is being wired in ahead of full live-Graph verification — `/api/auth/check-email` currently has a hardcoded early return that bypasses the tenant-membership check (see the `TEMPORARY` comment in `main.py`).

**Never commit `backend/.env`** — secrets go only in the local, git-ignored `.env`; `.env.example` is the template.
