from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings, read from the environment or a .env file."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    project_name: str = "Sales CRM API"
    api_v1_prefix: str = "/api/v1"
    environment: str = "development"

    # Database. Defaults to localhost because the API runs on the host against the
    # Postgres container; the compose overlay sets this to "db" when containerised.
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_user: str = "crm"
    postgres_password: str = "crm"
    postgres_db: str = "crm"

    # Auth. The default secret is fine for local Docker and refused in production;
    # see `main.py`, which will not start with this value when environment=production.
    secret_key: str = "dev-only-change-me"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 14

    # Comma-separated list of allowed origins for CORS.
    cors_origins: str = "http://localhost:5173,http://localhost:8080,http://localhost"

    # Seeded admin. Used only by `python -m app.seed`.
    seed_admin_email: str = "admin@aidenai.com"
    seed_admin_password: str = "admin1234"
    seed_user_password: str = "password1234"

    # Object storage for deal deliverable attachments. Written against the S3 API, so the
    # same settings drive MinIO locally and AWS S3 / Cloudflare R2 / Backblaze B2 in
    # production. An empty endpoint URL means real AWS S3, which is boto3's own default.
    s3_endpoint_url: str = "http://localhost:9000"
    s3_bucket: str = "crm-attachments"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_region: str = "us-east-1"
    s3_presign_expiry_seconds: int = 900
    max_upload_bytes: int = 26_214_400  # 25 MiB

    # Reminders. Delivery is chosen by whether `smtp_host` is set: blank falls back to a
    # notifier that logs the message instead of sending it, so a fresh checkout works with
    # no credentials and real ones in .env switch sending on without a code change.
    reminders_enabled: bool = True
    reminder_sweep_interval_seconds: int = 900
    reminder_due_within_days: int = 7
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "crm@example.invalid"
    smtp_use_tls: bool = True

    log_sql: bool = Field(default=False, description="Echo SQL statements to stdout.")

    @property
    def database_url(self) -> str:
        """Async driver URL, used by the application."""
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment.lower() in {"production", "prod"}

    @property
    def smtp_configured(self) -> bool:
        """Whether real email can be sent. See `app.services.notifications`."""
        return bool(self.smtp_host.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
