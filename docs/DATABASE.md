# Working with the database

Everything here targets the running container: **`crm-postgres`**, Postgres 17-alpine,
mapped to **host port 5433**.

`RUNNING.md` covers starting the stack and the migration/seed commands. This document is
about *looking inside* — GUI, VS Code, psql, inspection, and the day-to-day workflow.

---

## The one number that causes every connection failure

| | Host | Port | Reason |
|---|---|---|---|
| From your machine (DBeaver, VS Code, psql on host, FastAPI) | `localhost` | **5433** | 5433 is the *host-side* half of the `5433:5432` mapping. |
| From another container on the compose network (API in `docker-compose.app.yml`) | **`db`** | **5432** | Containers talk on the compose network, where the service is named `db` and Postgres listens on its native 5432. The host mapping is irrelevant there. |
| Inside the container itself (`docker exec`) | `localhost` | 5432 | You are already past the mapping. |

This machine **already runs a local PostgreSQL 18 service on `0.0.0.0:5432`**. It wins the
IPv4 bind, so `localhost:5432` silently reaches *that* server — you get
`password authentication failed for user "crm"`, or worse, you connect successfully to the
wrong database and wonder why your tables are missing. If a tool can't authenticate,
check the port before anything else.

Credentials are dev-only and identical everywhere: user `crm`, password `crm`, database
`crm`.

---

## 1. GUI — DBeaver

**Use DBeaver Community Edition**, not pgAdmin, for this project:

- One tool for every database you'll ever touch, not just Postgres.
- Real data grid: inline cell editing, generated `UPDATE` preview, filter/sort per column.
- ER diagrams generated from foreign keys — useful here, where `accounts → leads → deals`
  is the whole point of the product.
- No server component. pgAdmin 4 is a web app that runs its own process and stores its
  own config; that's overhead you don't need for one local container.

Pick pgAdmin instead only if you specifically want Postgres server admin surfaces —
per-backend activity dashboards, vacuum/analyze scheduling, role management UI.

### Install

```powershell
winget install dbeaver.dbeaver
```

Or download the Community Edition installer from <https://dbeaver.io/download/>.

### Connect

**Database → New Database Connection → PostgreSQL**, then:

| Field | Value |
|---|---|
| Host | `localhost` |
| Port | `5433` |
| Database | `crm` |
| Username | `crm` |
| Password | `crm` — tick *Save password* |

Two settings worth changing before you click Finish:

- **Main tab → Show all databases** — on. Lets you see `postgres` and `template1`
  alongside `crm`, which matters when you're checking whether a `createdb` actually
  landed where you thought.
- **PostgreSQL tab → Show template databases** — off. Noise.

Click **Test Connection** first. DBeaver will offer to download the JDBC driver on first
use; allow it.

Then expand: `crm` → **Schemas** → `public` → Tables. You should see seven tables:
`users`, `accounts`, `leads`, `deals`, `activities`, `pipeline_templates`, `stages`, plus
Alembic's `alembic_version`.

### Worth knowing

- **Double-click a table** → Data tab is an editable grid. Change a cell, then press
  **Save** (Ctrl+S) — DBeaver shows you the generated SQL first if you enable
  *Preferences → Editors → Data Editor → Confirm data save*.
- **ER Diagram tab** on any table or on the `public` schema draws the foreign-key graph.
- **SQL Editor (Ctrl+])** — Ctrl+Enter runs the statement under the cursor,
  Alt+X runs the whole script.
- **Read-only connections**: if you ever point DBeaver at something that isn't local,
  tick *Connection settings → General → Read-only connection*. Never needed here; always
  needed there.

---

## 2. VS Code

Two good options, and they solve different problems.

### Recommended: the official PostgreSQL extension

**`ms-ossdata.vscode-pgsql`** ("PostgreSQL" by Microsoft). It's the strongest Postgres
experience in the editor: schema tree, query editor with results grid, `EXPLAIN`
visualisation, and context-aware SQL completion that knows your actual table and column
names.

Install, then **PostgreSQL icon in the activity bar → Add Connection**, and enter the
same host/port/database/user/password as above. Connections live in the extension's own
profile store, not in `settings.json`, so this one can't be committed for you.

### Also configured: SQLTools

**`mtxr.sqltools`** + **`mtxr.sqltools-driver-pg`**. Fewer features, but its connection
lives in workspace settings — which means it's already set up for you in
[`.vscode/settings.json`](../.vscode/settings.json) and works the moment you install the
two extensions. No dialog, nothing to type.

Both are listed in [`.vscode/extensions.json`](../.vscode/extensions.json), so VS Code
will offer them when you open the repo.

### Browsing from the editor

With either extension, the sidebar tree is the fast path:

- **Schemas** → `public`. Alembic's `alembic_version` sits here too; that's the table
  holding the current migration revision.
- **Tables** → expand one to get its **Columns** with types and nullability, then
  **Indexes**, **Constraints**, and **Foreign Keys**. This is the quickest way to confirm
  a migration actually created the index you wrote.
- **Views** — this schema has none yet. The node will be empty; that's correct, not a
  connection problem.
- **Right-click a table → Select Top 1000** (SQLTools: *Show Table Records*) opens a
  results grid without you writing SQL.

For anything beyond browsing, open a `.sql` file in the repo and run it against the
connection — a saved query beats a re-typed one. `Ctrl+Shift+E` (SQLTools) or the
**Run Query** button executes the selection.

---

## 3. Command line

The container has `psql` inside it, so nothing needs installing on the host.

### Interactive session

```bash
docker exec -it crm-postgres psql -U crm -d crm
```

`-it` is what makes it interactive — without it you get a session you can't type into.
You'll land at a `crm=#` prompt.

### One-off query without entering the session

```bash
docker exec crm-postgres psql -U crm -d crm -c "select count(*) from deals;"
```

Note: no `-it`, and `-c` takes the SQL. This is the form to use in scripts.

### If you have psql on the host

The local PostgreSQL 18 install ships one. Point it at the right port:

```bash
psql -h localhost -p 5433 -U crm -d crm
```

Set `PGPASSWORD=crm` in the environment to skip the prompt (fine for a dev container,
never for anything real).

### The psql commands you'll actually use

Backslash commands are psql's own, not SQL — no semicolon needed.

| Command | What it does |
|---|---|
| `\l` | List databases |
| `\dn` | List schemas |
| `\dt` | List tables in the search path |
| `\dt *.*` | List tables in *every* schema, system ones included |
| `\d deals` | Describe `deals` — columns, types, indexes, FK constraints |
| `\d+ deals` | Same, plus storage, stats target, and column comments |
| `\di` | List indexes |
| `\dv` | List views |
| `\df` | List functions |
| `\du` | List roles and their attributes |
| `\dp deals` | Show table privileges |
| `select * from deals limit 10;` | View table contents |
| `\x` | Toggle expanded output — **essential** for wide rows like `stages`, which has five long methodology text columns |
| `\timing` | Toggle query timing |
| `\e` | Open the last query in an editor |
| `\i file.sql` | Run a SQL file |
| `\copy deals to 'out.csv' csv header` | Export a table (client-side, so paths are yours) |
| `\?` | All backslash commands |
| `\h alter table` | SQL syntax help for a statement |
| `\q` | Quit |

Two habits that pay off immediately: `\x auto` (expanded output only when rows are too
wide to fit) and `\timing on` at the start of any session where you're chasing a slow
query.

---

## 4. Inspecting the database

### Schemas and tables

```sql
-- Schemas, excluding the system ones
select schema_name from information_schema.schemata
where schema_name not in ('pg_catalog', 'information_schema');

-- Tables with their on-disk size, biggest first
select table_name,
       pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) as size
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by pg_total_relation_size(quote_ident(table_name)) desc;
```

### Structure

`\d deals` in psql is faster than any query, but when you need it programmatically:

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'deals'
order by ordinal_position;

-- Foreign keys out of a table: what it depends on
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'deals'::regclass and contype = 'f';

-- Indexes, as the CREATE INDEX statements that would rebuild them
select indexname, indexdef from pg_indexes
where schemaname = 'public' and tablename = 'deals';
```

### Browsing records

```sql
-- Row counts across the CRM tables, the fastest sanity check after a seed
select 'users' as t, count(*) from users
union all select 'accounts',           count(*) from accounts
union all select 'leads',              count(*) from leads
union all select 'deals',              count(*) from deals
union all select 'activities',         count(*) from activities
union all select 'pipeline_templates', count(*) from pipeline_templates
union all select 'stages',             count(*) from stages;

-- The hierarchy the product is built on: account → lead → deal
select a.name as account, l.business_unit, d.name as deal, s.name as stage, d.value
from deals d
join leads l          on l.id = d.lead_id
join accounts a       on a.id = l.account_id
join stages s         on s.id = d.stage_id
order by a.name, d.value desc;

-- Pipeline health: deals and value per stage, the way the dashboard shows it.
-- Filter by template — there are two pipelines (R6) and their stage positions overlap,
-- so grouping on position alone interleaves Direct Customer and Partner stages.
select s.position, s.name, s.probability, count(d.id) as deals, sum(d.value) as value
from stages s
join pipeline_templates p on p.id = s.pipeline_template_id
left join deals d         on d.stage_id = s.id
where p.name = 'Direct Customer'
group by s.position, s.name, s.probability
order by s.position;

-- Current migration revision — compare against `alembic current`
select * from alembic_version;
```

Column names above are the SQLAlchemy defaults from `backend/app/models/`. If a query
errors on an unknown column, `\d <table>` is the source of truth, not this document.

### Mutating data safely during development

**Wrap it in a transaction and look before you commit.** This is the single habit that
prevents a lost afternoon:

```sql
begin;

update deals set value = 950000 where name = 'Regulatory Reporting Agents';

-- Verify. If this isn't what you meant:
select id, name, value from deals where name = 'Regulatory Reporting Agents';

rollback;   -- or: commit;
```

Three more rules:

1. **Write the `where` clause first, as a `select`.** Run it, count the rows, *then* turn
   `select *` into `update … set` or `delete`. An `update` without a `where` clause
   rewrites every row and there is no undo outside a transaction.
2. **Never hand-edit schema.** Adding a column in DBeaver diverges the database from your
   models and Alembic's history, and the next `--autogenerate` will produce a confusing
   diff. Change the model, generate a migration, apply it. Schema changes go through
   Alembic; only *data* gets touched by hand.
3. **Prefer reseeding to repairing.** When dev data gets tangled,
   `python -m app.seed --force` is faster and more reliable than surgical fixes, and it
   gives you a known-good state.

`delete` cascades matter here: removing an account takes its leads and deals with it if
the FKs are `ON DELETE CASCADE`. Check with `pg_get_constraintdef` (above) before you
assume either way.

---

## 5. Workflow

### Verify the database is running

```bash
docker compose ps                     # crm-postgres should read "healthy", not just "Up"
docker compose logs -f db             # follow the logs
docker exec crm-postgres pg_isready -U crm -d crm
```

`healthy` comes from the compose healthcheck, which passes `-d crm` deliberately:
`pg_isready` returns success mid-initialisation without a database name, so without it a
migration can fire before the database actually exists.

The API's own check is better than any of the above, because it does a real round-trip
through SQLAlchemy:

```bash
curl -s http://localhost:8000/health
```

`degraded` means the API is up but can't reach Postgres.

### Connecting from FastAPI

`backend/app/core/config.py` builds the URL from the `POSTGRES_*` variables in
`backend/.env`, and `backend/app/db/session.py` owns the engine and session factory.
Routes get a session through the dependency in `backend/app/api/deps.py` — so the way to
change connection behaviour is to edit those, never to construct an engine in a route.

The critical detail: **`backend/.env` and the root `.env` must agree on
`POSTGRES_PORT`.** The root file configures the container's port mapping; the backend
file tells the app where to dial. If they disagree, the app connects to whatever else is
on that port — on this machine, the local PostgreSQL 18 service.

### Inspecting data while testing APIs

The loop that works:

1. Keep a psql session or a DBeaver SQL editor open on the side — not a fresh connection
   per check.
2. Drive the API from Swagger at <http://localhost:8000/api/v1/docs>. Its **Authorize**
   button works, so you get a real authenticated session without curl gymnastics.
3. Re-run your verification `select` after each call. In psql, `\g` re-runs the previous
   query — no retyping.

For the write path specifically, watch `activities`: the app logs activity against
accounts, leads and deals (spec R4), so a mutation that *looks* successful but leaves no
activity row usually means the service layer bailed before its side effects.

### Debugging database issues

**Turn on SQL logging.** `LOG_SQL=true` in `backend/.env` makes SQLAlchemy echo every
statement. It's the fastest way to see the query your ORM code actually produced, and the
fastest way to spot N+1 queries — a list endpoint emitting one `select` per row is doing
a lazy load it shouldn't.

**Then, in the database:**

```sql
-- What is running right now
select pid, state, wait_event_type, left(query, 80) as query, age(now(), query_start) as elapsed
from pg_stat_activity
where datname = 'crm' and pid <> pg_backend_pid()
order by query_start;

-- Blocked queries and what is blocking them. First stop for a hung request.
select pid, left(query, 60) as query, pg_blocking_pids(pid) as blocked_by
from pg_stat_activity
where cardinality(pg_blocking_pids(pid)) > 0;

-- Read the planner's mind on a slow query
explain (analyze, buffers) select * from deals where stage_id = 'stage-d4';
```

A hung request with an idle-in-transaction backend almost always means a session was
opened and never committed or rolled back — check that the code path goes through the
`get_db` dependency rather than creating its own session.

**Common failures and what they actually mean:**

| Symptom | Cause |
|---|---|
| `password authentication failed for user "crm"` | You reached the local PostgreSQL 18 on 5432. Fix `POSTGRES_PORT` in both `.env` files. |
| `connection refused` | The container isn't running. `docker compose up -d`. |
| `relation "deals" does not exist` | Migrations never ran. `alembic upgrade head`. |
| `alembic current` disagrees with `select * from alembic_version` | You're pointing at a different database than you think. Check the port again. |
| Tables exist but everything is empty | Schema created, never seeded. `python -m app.seed`. |

### Backup and restore

```bash
# Backup — plain SQL, readable and diffable
docker exec crm-postgres pg_dump -U crm -d crm > backup.sql

# Backup — custom format, needed for selective/parallel restore
docker exec crm-postgres pg_dump -U crm -d crm -Fc > backup.dump

# Data only, no schema — the useful one when Alembic owns the schema
docker exec crm-postgres pg_dump -U crm -d crm --data-only > data.sql

# Restore a plain dump
docker exec -i crm-postgres psql -U crm -d crm < backup.sql

# Restore a custom-format dump, replacing what's there
docker exec -i crm-postgres pg_restore -U crm -d crm --clean --if-exists < backup.dump
```

`docker exec -i` on the restores — `-i` pipes stdin in, and it's the part people forget.
Redirect with `<`, not `|`.

The nuclear option, and honestly the right one most of the time in dev:

```bash
docker compose down -v          # deletes the volume, and therefore all data
docker compose up -d
cd backend
./.venv/Scripts/python.exe -m alembic upgrade head
./.venv/Scripts/python.exe -m app.seed
```

Because the schema is in migrations and the data is in `app/seed_data.py`, this database
is disposable by design. Treat it that way: a backup is for when you've hand-crafted a
state you can't easily recreate, not a routine.

---

## 6. Best practices for this stack

**Alembic owns the schema. Always.**
Model change → `alembic revision --autogenerate -m "what changed"` → **read the generated
file** → `alembic upgrade head`. Autogenerate is a first draft, not an answer: it misses
table and column renames (it sees a drop plus an add, which destroys data), server-side
defaults, `CHECK` constraints, and enum value changes. It also can't know that an index
should be partial or concurrent.

**Keep a downgrade that works.** You'll need it the first time you apply a migration and
immediately spot the mistake. Test it once — `alembic downgrade -1 && alembic upgrade
head` — while the change is still fresh.

**One migration per logical change.** A migration that renames a column *and* adds a
table is one you can't partially revert.

**Never let two sources define the schema.** If you've ever run
`Base.metadata.create_all()`, Alembic's history no longer describes the database and
autogenerate output becomes fiction. This project creates its schema through migrations
only; keep it that way.

**Sessions come from the dependency.** `Depends(get_db)` gives you a session scoped to the
request and closed afterwards. A module-level session or one created inside a service
leaks connections and eventually exhausts the pool — which surfaces as requests hanging,
not as an error.

**Let SQLAlchemy tell you what it did.** `LOG_SQL=true` during any query-shaped work.
Verifying the emitted SQL as you write repository code is dramatically cheaper than
inferring it from a slow endpoint later.

**Query with `select`, not `.query()`.** SQLAlchemy 2.0's `select()` API is what this
project uses; the legacy `Query` interface is a different mental model and mixing the two
in one codebase makes the repository layer inconsistent.

**Eager-load deliberately.** `selectinload` for collections (`account.leads`),
`joinedload` for many-to-one (`deal.stage`). The account tree endpoint touches three
levels — that's exactly where a missing eager load turns one request into hundreds of
queries.

**Reseed rather than repair.** `python -m app.seed --force` is the reset button. Close
dates are generated relative to today, so a fresh seed always produces live at-risk and
closing-soon deals — a hand-patched database drifts away from that.

**Keep the guides truthful.** `RUNNING.md` and this file are what a new developer reads
first. When a port, command, or credential changes, they change too.

**Two panes, always open.** Swagger for driving the API, and a SQL editor for verifying
what it wrote. Almost every backend bug is visible in the gap between what the endpoint
returned and what actually landed in the table.
