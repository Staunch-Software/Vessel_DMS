# Vessel DMS — SharePoint Embedded Document Management

A document management system for vessel/ship management built on **SharePoint
Embedded (SPE)**. Users upload documents through the app; they are stored in a
single SPE container under a strict, opinionated folder hierarchy. Month-wise
folders are created automatically — on a schedule and from the document's own
date (via OCR).

## Architecture

```
React + Vite + Tailwind  ──HTTP──>  FastAPI  ──Microsoft Graph (app-only)──>  SPE container (one drive)
                                       │
                                       ├── PaddleOCR (month detection)
                                       └── PostgreSQL (vessels, folder map, jobs)
```

- **Single shared container.** Three top-level main folders — *Technical &
  Crewing*, *Commercial & Chartering*, *Insurance* — each containing one folder
  **per ship** plus a **"Common for all ships"** folder.
- **Folder template** (`backend/app/template.py`) is the single source of truth
  for the whole hierarchy.
- **Month-driven folders** (Month End Reports, Invoices & Payments, Claims &
  Disputes): the `{Month YYYY}` folder is created automatically (a) on the 20th
  of the prior month by the scheduler, and (b) on upload from the document's
  detected date (PaddleOCR). Undetectable dates fall back to *To be Classified*.

## Stub vs. live mode

The backend runs in **stub mode** (in-memory, fake OCR) until Microsoft Graph
and PostgreSQL are configured in `backend/.env`, then it switches to the live
SharePoint Embedded + PostgreSQL backend. See [`docs/SETUP.md`](docs/SETUP.md).

## Running locally

**Backend**
```
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env   # then fill in values (see docs/SETUP.md)
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8010 --reload
```

**Frontend**
```
cd frontend
npm install
npm run dev        # http://localhost:5173 (proxies /api -> http://localhost:8010)
```

## Status

- ✅ Phase A — full file-explorer UI on a stub backend (vessels + IMO, dashboard,
  drill-down folders, breadcrumbs, upload, search, file view/delete, validation).
- 🔧 Phase B — Graph client, container script, PostgreSQL (models + migrations),
  and PaddleOCR are built; real provisioner + upload wiring + scheduler in
  progress. SSO (Entra) deferred until after live Graph is verified.

> **Security:** never commit `backend/.env`. Secrets belong only in your local
> `.env` (git-ignored). Use `.env.example` as the template.
