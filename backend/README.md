# Manufacturing Performance Monitor Backend

This backend is the central API/database layer for the dashboard.

The frontend calls this API instead of browser localStorage.

---

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

For a managed deployment, set `APP_DATA_DIR` or `SQLITE_PATH` explicitly to a shared server folder included in backups.

If the runtime database does not exist yet, the API seeds it once from:

```text
backend/data/manufacturing.db
```

---

## Environment Variables

```text
APP_ENV=development
DB_BACKEND=sqlite
APP_DATA_DIR=
SQLITE_PATH=
CORS_ORIGINS=http://localhost:8000,http://127.0.0.1:8000,http://localhost:8765,http://127.0.0.1:8765

# Auth (set these before running in production)
JWT_SECRET=replace-this-with-a-long-random-string
JWT_EXPIRE_MINUTES=480
```

For the IT server, prefer something explicit:

```text
APP_ENV=production
APP_DATA_DIR=C:\ProgramData\ManufacturingPerformanceMonitor
JWT_SECRET=replace-this-with-a-long-random-string
```

`DB_BACKEND=postgres` is reserved for the future PostgreSQL adapter.

> **Important:** Always set `JWT_SECRET` to a long random string before going to production.
> You can generate one with: `python -c "import secrets; print(secrets.token_hex(32))"`

---

## Install

```bash
pip install -r backend/requirements.txt
```

New dependencies added for auth:

- `argon2-cffi` — Argon2id password hashing
- `python-jose[cryptography]` — JWT token signing and verification

---

## Run

From the project root:

```bash
uvicorn backend.server:app --reload --host 127.0.0.1 --port 8000
```

Then open the dashboard at:

```text
http://127.0.0.1:8000
```

The same command serves both the frontend and the API. API docs (Swagger UI) are available at:

```text
http://127.0.0.1:8000/docs
```

If you serve the frontend separately (for example on port 8765), keep the backend running on port 8000. The frontend will call `http://127.0.0.1:8000/api` automatically.

For production, run without `--reload` behind your server/service manager:

```bash
uvicorn backend.server:app --host 0.0.0.0 --port 8000
```

---

## Roles & Permissions

The system has three roles:

| Role | What they can access |
|---|---|
| `user` | Dashboard read-only (`/api/dashboard/*`) |
| `superuser` | Dashboard + all data entry endpoints |
| `admin` | Everything above + account management (create accounts with elevated roles, change roles, enable/disable users) |

---

## Auth API Endpoints

```text
POST    /api/auth/register              → Create a new account
POST    /api/auth/login                 → Log in and get a token
GET     /api/auth/me                    → Get your own profile (requires token)
GET     /api/auth/users                 → List all users (admin only)
PATCH   /api/auth/users/{id}/role       → Change a user's role (admin only)
PATCH   /api/auth/users/{id}/active     → Enable or disable a user (admin only)
PATCH   /api/auth/users/{id}            → Update a user's username and/or password (admin only)
DELETE  /api/auth/users/{id}            → Permanently delete a user (admin only)
```

---

## Main API Endpoints

All endpoints below require a valid Bearer token. Role requirements are noted.

```text
# Dashboard — accessible to all roles (user, superuser, admin)
GET  /api/dashboard/cost
GET  /api/dashboard/production
GET  /api/dashboard/runrate-summary
GET  /api/dashboard/manhours-summary
GET  /api/dashboard/ob-actual
GET  /api/months

# Data entry — superuser and admin only
GET/POST/DELETE  /api/actual-costs
GET/POST/DELETE  /api/ob-targets
GET/POST/DELETE  /api/runrate/monthly
GET/POST/DELETE  /api/runrate/weekly
GET/POST/DELETE  /api/manhours
```

---

## Testing with Postman

### Base URL

```
http://127.0.0.1:8000
```

---

### Step 1 — Register the first admin account

Since there are no accounts yet, the first registration is open. You need to bootstrap
one admin account directly — the easiest way is to register a normal user first, then
promote them in the database, or use the method below.

**Option A — Register as a regular user (open to anyone)**

```
POST /api/auth/register
Content-Type: application/json
```

Body:
```json
{
  "username": "alice",
  "password": "StrongPassword123"
}
```

This creates a `user` role account.

**Option B — Register an admin account (must already be authenticated as admin)**

If you already have an admin token (from bootstrapping, see below), pass it as a Bearer
token and include the role in the body:

```
POST /api/auth/register
Content-Type: application/json
Authorization: Bearer <your_admin_token>
```

Body:
```json
{
  "username": "bob",
  "password": "StrongPassword123",
  "role": "superuser"
}
```

Valid values for `role`: `"user"`, `"superuser"`, `"admin"`

**Bootstrapping the very first admin (one-time setup)**

After running the server for the first time, open the SQLite database and run:

```sql
-- Register normally first, then promote:
UPDATE users SET role = 'admin' WHERE username = 'alice';
```

Or use DB Browser for SQLite to edit the `role` column directly.
After that, all further account creation can be done through the API.

**Success response (201 Created):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "role": "user",
  "username": "alice"
}
```

---

### Step 2 — Log in

```
POST /api/auth/login
Content-Type: application/json
```

Body:
```json
{
  "username": "alice",
  "password": "StrongPassword123"
}
```

**Success response (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "role": "admin",
  "username": "alice"
}
```

Copy the `access_token` value — you will use it in every subsequent request.

---

### Step 3 — Set up the Bearer token in Postman

For each protected request:

1. Go to the **Authorization** tab of your request
2. Set type to **Bearer Token**
3. Paste the `access_token` value into the Token field

Or set it once at the **Collection** level so all requests inherit it automatically.

---

### Step 4 — Check your own profile

```
GET /api/auth/me
Authorization: Bearer <your_token>
```

No request body needed.

**Success response (200 OK):**
```json
{
  "id": 1,
  "username": "alice",
  "role": "admin",
  "is_active": true
}
```

---

### Step 5 — Access a protected endpoint

**Dashboard (any role):**
```
GET /api/dashboard/cost
Authorization: Bearer <your_token>
```

**Data entry (superuser or admin only):**
```
GET /api/actual-costs
Authorization: Bearer <your_token>
```

If your role is too low you will get:
```json
{
  "detail": "Insufficient permissions."
}
```

---

### Admin: List all users

```
GET /api/auth/users
Authorization: Bearer <admin_token>
```

**Response:**
```json
[
  { "id": 1, "username": "alice", "role": "admin", "is_active": true },
  { "id": 2, "username": "bob",   "role": "user",  "is_active": true }
]
```

---

### Admin: Change a user's role

```
PATCH /api/auth/users/2/role
Content-Type: application/json
Authorization: Bearer <admin_token>
```

Body:
```json
{
  "role": "superuser"
}
```

**Response (200 OK):** the updated user object.

---

### Admin: Disable or re-enable a user

```
PATCH /api/auth/users/2/active
Content-Type: application/json
Authorization: Bearer <admin_token>
```

Body:
```json
{
  "is_active": false
}
```

Set `true` to re-enable. Disabled users cannot log in and get a 403 if they try.

---

### Admin: Update a user's username and/or password

Either field is optional, but at least one must be provided.

```
PATCH /api/auth/users/2
Content-Type: application/json
Authorization: Bearer <admin_token>
```

**Change username only:**
```json
{
  "username": "new_username"
}
```

**Change password only:**
```json
{
  "password": "NewStrongPassword123"
}
```

**Change both at once:**
```json
{
  "username": "new_username",
  "password": "NewStrongPassword123"
}
```

**Success response (200 OK):** the updated user object.

```json
{
  "id": 2,
  "username": "new_username",
  "role": "user",
  "is_active": true
}
```

**Guards — these will return 403:**
- Editing another admin's account
- (Admins can only edit their own account details via this endpoint if they are the target)

---

### Admin: Delete a user permanently

```
DELETE /api/auth/users/2
Authorization: Bearer <admin_token>
```

No request body needed.

**Success response (200 OK):**
```json
{
  "ok": true,
  "deleted": true
}
```

**Guards — these will return 403:**
- Deleting your own account
- Deleting another admin's account

---

## Common Error Responses

| HTTP Status | `detail` message | What it means |
|---|---|---|
| 401 | `Not authenticated.` | No token was sent |
| 401 | `Invalid or expired token.` | Token is wrong or has expired (default 8 hours) |
| 401 | `Invalid username or password.` | Login failed |
| 403 | `Account is disabled.` | Admin has deactivated this account |
| 403 | `Insufficient permissions.` | Your role cannot access this endpoint |
| 403 | `Only admins can create accounts with elevated roles.` | Tried to register superuser/admin without being an admin |
| 409 | `Username already taken.` | That username already exists |
| 422 | `Month must use YYYY-MM format.` | Bad month parameter |

---

## Full Postman Testing Flow (Quick Reference)

```
1.  POST /api/auth/register        → create account (role: "user" by default)
2.  POST /api/auth/login           → get token
3.  GET  /api/auth/me              → confirm who you are
4.  GET  /api/dashboard/cost       → test dashboard access (all roles)
5.  GET  /api/actual-costs         → test data entry access (superuser/admin only)
6.  --- as admin ---
7.  GET  /api/auth/users           → list accounts
8.  PATCH /api/auth/users/{id}/role    → promote someone
9.  PATCH /api/auth/users/{id}/active  → disable someone
```