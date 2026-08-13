import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.v1.router import api_router
from app.core.config import settings
from app.db.session import SessionLocal, engine
from app.services import lemlist_sync
from app.services import reminders as reminders_service

logger = logging.getLogger("app")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Refuse to start in production with the development signing key. A leaked default
    # secret means anyone can mint valid tokens.
    if settings.is_production and settings.secret_key == "dev-only-change-me":
        raise RuntimeError("SECRET_KEY must be set to a real value when ENVIRONMENT=production")

    logger.info("Starting %s (%s)", settings.project_name, settings.environment)

    # The reminder sweep. A plain asyncio task rather than a scheduler dependency — one
    # interval loop does not justify APScheduler or Celery, along with a broker and a second
    # deployment target. See `app.services.reminders.sweep_forever`.
    sweep: asyncio.Task | None = None
    if settings.reminders_enabled:
        sweep = asyncio.create_task(reminders_service.sweep_forever(SessionLocal))
    else:
        logger.info("REMINDERS_ENABLED is false — no reminder sweep will run")

    # The lemlist reconcile, on the same pattern and off by default. Webhooks keep contacts current in
    # normal operation; this catches missed deliveries and field edits, which fire no event at all. Off by
    # default because it spends a user's own lemlist rate limit, and nothing should do that unasked.
    reconcile: asyncio.Task | None = None
    if settings.lemlist_nightly_sync_enabled:
        reconcile = asyncio.create_task(lemlist_sync.reconcile_forever(SessionLocal))
    else:
        logger.info("LEMLIST_NIGHTLY_SYNC_ENABLED is false — no lemlist reconcile will run")

    yield

    for task in (sweep, reconcile):
        if task is None:
            continue
        task.cancel()
        # Awaited rather than left dangling, so shutdown waits for the task to unwind its
        # database session instead of racing `engine.dispose()` below.
        with contextlib.suppress(asyncio.CancelledError):
            await task

    await engine.dispose()
    logger.info("Shut down cleanly")


app = FastAPI(
    title=settings.project_name,
    version="1.0.0",
    description=(
        "Enterprise Sales CRM API. Accounts hold leads, leads hold deals, and deals move "
        "through stages defined by pipeline templates that are data rather than code."
    ),
    openapi_url=f"{settings.api_v1_prefix}/openapi.json",
    docs_url=f"{settings.api_v1_prefix}/docs",
    redoc_url=None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.api_v1_prefix)


@app.exception_handler(Exception)
async def unhandled_exception(request: Request, exc: Exception) -> JSONResponse:
    """
    Logs the real error server-side and returns a generic message, so stack traces and
    SQL fragments never reach a client.
    """
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Something went wrong on our end"},
    )


@app.get("/health", tags=["meta"], summary="Liveness and database connectivity")
async def health() -> dict[str, str]:
    """
    Used by the Docker healthcheck. It touches the database on purpose: an API that cannot
    reach Postgres is not healthy, however well the process is running.
    """
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
    except Exception:
        logger.exception("Health check could not reach the database")
        return JSONResponse(  # type: ignore[return-value]
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "degraded", "database": "unreachable"},
        )

    return {"status": "ok", "database": "ok"}
