# Manufacturing Performance Monitor Backend

This backend is the future central API/database layer for the dashboard.

The frontend now calls this API instead of browser localStorage.

## Current Database

The implemented backend database is server-owned SQLite:

```text
backend/data/manufacturing.db
```

SQLite is accessed only through the Python API. Browsers should not open or write the database file directly.

## Environment Variables

```text
DB_BACKEND=sqlite
APP_DATA_DIR=backend/data
SQLITE_PATH=backend/data/manufacturing.db
CORS_ORIGINS=http://localhost:8000,http://127.0.0.1:8000,http://localhost:8765,http://127.0.0.1:8765
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
