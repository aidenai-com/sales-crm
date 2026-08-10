#!/usr/bin/env bash
# Applies migrations, seeds if the database is empty, then hands off to the CMD.
#
# Migrations run here rather than in the application's lifespan so that two API replicas
# never race to migrate the same database, and so a failed migration stops the container
# instead of leaving it serving against a half-built schema.
set -euo pipefail

echo "==> Waiting for Postgres at ${POSTGRES_HOST:-db}:${POSTGRES_PORT:-5432}"
python <<'PYTHON'
import asyncio
import sys

import asyncpg

from app.core.config import settings


async def wait() -> None:
    for attempt in range(1, 61):
        try:
            conn = await asyncpg.connect(
                host=settings.postgres_host,
                port=settings.postgres_port,
                user=settings.postgres_user,
                password=settings.postgres_password,
                database=settings.postgres_db,
            )
            await conn.close()
            print(f"    Postgres is ready (attempt {attempt})")
            return
        except Exception as exc:  # noqa: BLE001 - any connection failure is worth retrying
            print(f"    not ready yet ({exc.__class__.__name__}); retrying in 1s")
            await asyncio.sleep(1)

    print("    gave up waiting for Postgres", file=sys.stderr)
    sys.exit(1)


asyncio.run(wait())
PYTHON

echo "==> Applying migrations"
alembic upgrade head

if [ "${SEED_ON_START:-true}" = "true" ]; then
  echo "==> Seeding (skipped automatically if data already exists)"
  python -m app.seed
fi

echo "==> Starting: $*"
exec "$@"
