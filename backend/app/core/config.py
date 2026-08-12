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

    # AI assistant. Chosen the same way SMTP is: a blank key falls back to a provider that
    # explains itself instead of answering, so the drawer, the streaming transport, the tool
    # dispatch and the usage dashboard are all exercisable before any credentials exist.
    assistant_enabled: bool = True
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-5-nano"
    #: Ceiling per reply. Small on purpose: this answers questions about a pipeline, and an
    #: assistant that can emit an essay costs more and gets read less.
    assistant_max_output_tokens: int = 800

    #: Sent as `reasoning_effort`, and only when non-empty.
    #:
    #: Must be "none" for the reasoning models on /v1/chat/completions: that endpoint refuses
    #: function tools and reasoning in the same request, and this assistant is built on tools, so
    #: tools win. Anything else produces
    #:
    #:     Function tools with reasoning_effort are not supported for <model> in
    #:     /v1/chat/completions. To use function tools, use /v1/responses or set
    #:     reasoning_effort to 'none'.
    #:
    #: Set to an empty string for a model that has no reasoning setting at all — those reject the
    #: parameter as unknown rather than ignoring it.
    openai_reasoning_effort: str = "none"
    #: How many tool round-trips one question may take before the answer is forced. Without a
    #: cap a model that keeps calling tools bills indefinitely for a single question.
    assistant_max_tool_rounds: int = 4

    #: USD per million tokens, for the usage dashboard.
    #:
    #: Zero by default and deliberately not guessed: published prices change, and a dashboard
    #: reporting a confidently wrong cost is worse than one reporting none. Set these from
    #: OpenAI's current pricing page and the dashboard starts costing usage; until then it shows
    #: token counts and says the rate is unset.
    openai_input_cost_per_1m: float = 0.0
    openai_output_cost_per_1m: float = 0.0

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

    @property
    def assistant_configured(self) -> bool:
        """Whether the assistant can reach a model. See `app.services.assistant.provider`."""
        return bool(self.openai_api_key.strip())

    @property
    def assistant_pricing_configured(self) -> bool:
        return self.openai_input_cost_per_1m > 0 or self.openai_output_cost_per_1m > 0


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
