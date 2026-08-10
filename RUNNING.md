# Running the CRM

Two processes: **Postgres in Docker**, **FastAPI on the host**. The frontend runs on the
host too, via Vite.

The API runs locally rather than in Docker because this network's TLS-inspecting proxy
presents a certificate the build container does not trust, so `pip install` fails inside
Docker. The containerised setup is kept in `docker-compose.app.yml` for when that CA is
available.

---

## Ports

| Port | What | Why not the obvious one |
|---|---|---|
| **5433** | Postgres (container) | **Not 5432.** This machine already runs a local PostgreSQL 18 service bound to `0.0.0.0:5432`. It wins the IPv4 bind, so `localhost:5432` reaches *that* server, not the container. |
| 8000 | FastAPI | |
| 5173 | Vite dev server | |
| 5050 | pgAdmin | Only with `--profile tools`. |

---

## First-time setup

Run once, from the repo root (`c:\crm\v1`).

```bash
# 1. Environment files
cp .env.example .env
cp backend/.env.example backend/.env

# 2. Start Postgres
docker compose up -d

# 3. Python environment
cd backend
python -m venv .venv
./.venv/Scripts/python.exe -m pip install --upgrade pip
./.venv/Scripts/python.exe -m pip install -r requirements.txt

# 4. Create the schema
./.venv/Scripts/python.exe -m alembic upgrade head

# 5. Seed sample data
./.venv/Scripts/python.exe -m app.seed
```

---

## Everyday startup

Three terminals, or run the first two in the background.

```bash
# Terminal 1 — database
cd c:\crm\v1
docker compose up -d

# Terminal 2 — API
cd c:\crm\v1\backend
./.venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000

# Terminal 3 — frontend
cd c:\crm\v1
npm run dev
```

Then open:

- **http://localhost:5173** — the app
- **http://localhost:8000/api/v1/docs** — Swagger, with a working Authorize button
- **http://localhost:8000/health** — liveness plus a real database round-trip

---

## Sign in

| Role | Email | Password |
|---|---|---|
| admin | `admin@aidenai.com` | `admin1234` |
| admin | `aisha.bennett@aidenai.com` | `password1234` |
| rep | `priya.raghavan@aidenai.com` | `password1234` |
| rep | `marcus.feld@aidenai.com` | `password1234` |
| rep | `dana.okonkwo@aidenai.com` | `password1234` |
| rep | `tomas.lindqvist@aidenai.com` | `password1234` |

Only admins can edit pipeline templates and stages (spec §6.3). Reps get a 403 on those
routes and everything else works.

---

## Live database preview — pgAdmin

pgAdmin runs behind a compose profile, so it is opt-in rather than always on:

```bash
# Postgres + pgAdmin
docker compose --profile tools up -d

# Postgres alone (the default)
docker compose up -d
```

Then open **http://localhost:5050** and sign in with `admin@aidenai.com` / `admin1234`.

The **CRM (docker)** server is already registered — expand it, enter the password `crm`,
tick *Save password*, and you are in. Tables live under
`Servers → CRM (docker) → Databases → crm → Schemas → public → Tables`.

Two things that trip people up:

- Inside pgAdmin the host is **`db`** on port **5432**, not `localhost:5433`. The container
  talks to Postgres over the compose network, where the host-side port mapping does not
  exist. This is already configured for you.
- pgAdmin is **development only**. It is a second web app with its own login, and nothing
  in production should reach the database through it.

If you would rather not run a container, you already have pgAdmin 4 bundled with your local
PostgreSQL 18 install — point it at `localhost` port **5433**, user/password/database all
`crm`.

---

## Database

Quick commands below. For GUI setup (DBeaver), VS Code integration, inspection queries,
backup/restore and the debugging workflow, see **[docs/DATABASE.md](docs/DATABASE.md)**.

```bash
# psql inside the container
docker exec -it crm-postgres psql -U crm -d crm

# Tables
docker exec crm-postgres psql -U crm -d crm -c "\dt"

# Row counts
docker exec crm-postgres psql -U crm -d crm -c \
  "select 'users' t, count(*) from users
   union all select 'accounts', count(*) from accounts
   union all select 'leads', count(*) from leads
   union all select 'deals', count(*) from deals
   union all select 'activities', count(*) from activities
   union all select 'stages', count(*) from stages;"

# Stop, keeping data
docker compose down

# Stop and DELETE all data (the volume goes too)
docker compose down -v
```

---

## Migrations

```bash
cd backend

# After changing a model, generate a migration
./.venv/Scripts/python.exe -m alembic revision --autogenerate -m "what changed"

# Apply
./.venv/Scripts/python.exe -m alembic upgrade head

# Roll back one
./.venv/Scripts/python.exe -m alembic downgrade -1

# Current revision
./.venv/Scripts/python.exe -m alembic current
```

Always read the generated file before applying it — autogenerate misses table renames and
some constraint changes.

---

## Seeding

```bash
cd backend

# Safe: does nothing if users already exist
./.venv/Scripts/python.exe -m app.seed

# Wipe CRM tables and reseed from scratch
./.venv/Scripts/python.exe -m app.seed --force
```

Seeded content: 6 users, 11 accounts (7 customers + 4 partners), 12 leads, 22 deals,
16 activities, and 2 pipelines — the six real AidenAI stages with full methodology text,
plus a Partner pipeline with the onboarding stage (R7). Two deals sit in a Closed Lost
stage so the open-pipeline maths is exercised.

Close dates are generated relative to today, so at-risk and closing-soon deals appear
whenever you seed.

---

## Quick API check from the shell

```bash
# Log in and keep the token
TOKEN=$(curl -s -X POST http://127.0.0.1:8000/api/v1/auth/login \
  -d "username=priya.raghavan@aidenai.com&password=password1234" \
  | python -c "import json,sys; print(json.load(sys.stdin)['accessToken'])")

# Who am I
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8000/api/v1/auth/me

# Dashboard
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8000/api/v1/dashboard/summary

# All deals
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8000/api/v1/deals

# Account tree (R3)
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8000/api/v1/accounts/tree

# Pipelines with stages
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8000/api/v1/pipelines
```

---

## Frontend checks

```bash
cd c:\crm\v1
npm run typecheck
npm test
npm run build
```

---

## Troubleshooting

**`password authentication failed for user "crm"`**
You are reaching the local PostgreSQL 18 service on 5432 instead of the container. Confirm
`POSTGRES_PORT=5433` in **both** `.env` and `backend/.env`.

**`[Errno 10048] error while attempting to bind on address ('127.0.0.1', 8000)`**
An old uvicorn still holds the port. `pkill` does not work on Windows processes from Git
Bash — use PowerShell:

```powershell
Get-NetTCPConnection -LocalPort 8000 -State Listen |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

**`SSL: CERTIFICATE_VERIFY_FAILED` during `docker compose build`**
The proxy's CA is not in the build container. This is why the API runs on the host. To fix
properly, add your corporate root CA to `backend/Dockerfile` before
`pip install`, then use `docker-compose.app.yml`.

**Health check returns `degraded`**
The API is up but cannot reach Postgres. Check `docker compose ps` shows `crm-postgres` as
`healthy`.

---

## Optional: everything in Docker

Only works once the proxy CA is baked into `backend/Dockerfile`.

```bash
docker compose -f docker-compose.yml -f docker-compose.app.yml up --build
```

That adds the API and an Nginx container serving the built frontend with `/api` proxied,
on **http://localhost:8080** as a single origin.
