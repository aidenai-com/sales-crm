-- Creates the CRM role and database on a local PostgreSQL server.
--
-- Run as a superuser. It is idempotent: running it twice does nothing the second time,
-- and it never touches anything outside the `crm` role and `crm` database.
--
--   "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5432 -U postgres ^
--       -f backend\scripts\setup_local_db.sql
--
-- psql prompts for the postgres password, so it is never written to a file or a shell
-- history.

\set ON_ERROR_STOP on

-- CREATE ROLE and CREATE DATABASE cannot run inside DO blocks or transactions, so the
-- conditional is built as a string and executed with \gexec.
SELECT 'CREATE ROLE crm LOGIN PASSWORD ''crm'''
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crm')
\gexec

SELECT 'CREATE DATABASE crm OWNER crm ENCODING ''UTF8'''
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'crm')
\gexec

GRANT ALL PRIVILEGES ON DATABASE crm TO crm;

-- Everything below applies inside the new database.
\connect crm

-- Postgres 15 removed the implicit CREATE grant on `public`. Alembic creates tables there,
-- so the role that runs migrations needs to own it — otherwise the first migration fails
-- with "permission denied for schema public".
ALTER SCHEMA public OWNER TO crm;
GRANT ALL ON SCHEMA public TO crm;

SELECT
    current_database() AS database,
    (SELECT rolname FROM pg_roles WHERE rolname = 'crm') AS role_created,
    (SELECT nspowner::regrole::text FROM pg_namespace WHERE nspname = 'public') AS public_owner;
