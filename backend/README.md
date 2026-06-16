# Manufacturing Performance Monitor Backend

This backend is the future central API/database layer for the dashboard.

The frontend now calls this API instead of browser localStorage.

## Current Database

The implemented backend database is server-owned SQLite. The API owns all reads/writes; browsers should not open or write the database file directly.

For local development, the default database is kept outside the project folder so file watchers do not reload the website every time you save or import data:

```text
%LOCALAPPDATA%\ManufacturingPerformanceMonitor\manufacturing.db
```

For production on a Windows IT server, set `APP_ENV=production`. The default database location becomes:

```text
%PROGRAMDATA%\ManufacturingPerformanceMonitor\manufacturing.db
```

For a managed deployment, the recommended setup is to set `APP_DATA_DIR` or `SQLITE_PATH` explicitly to a shared server folder that is included in backups.

If the runtime database does not exist yet, the API seeds it once from:

```text
backend/data/manufacturing.db
```

## Environment Variables

```text
APP_ENV=development
DB_BACKEND=sqlite
APP_DATA_DIR=
SQLITE_PATH=
CORS_ORIGINS=http://localhost:8000,http://127.0.0.1:8000,http://localhost:8765,http://127.0.0.1:8765
```

For the IT server, prefer something explicit:

```text
APP_ENV=production
APP_DATA_DIR=C:\ProgramData\ManufacturingPerformanceMonitor
```

`DB_BACKEND=postgres` is reserved for the future PostgreSQL adapter.

## Install

```bash
pip install -r backend/requirements.txt
```

## Run

From the project root:

```bash
uvicorn backend.server:app --reload --host 127.0.0.1 --port 8000
```

Then open the dashboard at:

```text
http://127.0.0.1:8000
```

The same command serves both the frontend and the API. API docs are available at:

```text
http://127.0.0.1:8000/docs
```

If you serve the frontend separately (for example on port 8765), keep the backend running on port 8000. The frontend will call `http://127.0.0.1:8000/api` automatically.

For production, run without `--reload` behind your server/service manager:

```bash
uvicorn backend.server:app --host 0.0.0.0 --port 8000
```

## Main API Groups

```text
GET/POST/DELETE /api/actual-costs
GET/POST/DELETE /api/ob-targets
GET/POST/DELETE /api/runrate/monthly
GET/POST/DELETE /api/runrate/weekly
GET/POST/DELETE /api/manhours
GET             /api/dashboard/cost
GET             /api/dashboard/production
GET             /api/dashboard/runrate-summary
GET             /api/dashboard/manhours-summary
GET             /api/dashboard/ob-actual
```
