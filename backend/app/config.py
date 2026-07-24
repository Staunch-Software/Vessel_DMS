"""Application configuration (Phase B).

Reads from environment / `backend/.env`. When the Graph/Azure values are absent
the app runs in **stub mode** (in-memory store, fake OCR) so the UI keeps working
during development. Once the real values are provided it switches to the live
SharePoint Embedded + PostgreSQL backend.
"""
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote_plus

from pydantic_settings import BaseSettings, SettingsConfigDict


ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE), env_file_encoding="utf-8", extra="ignore"
    )

    # --- Microsoft Entra / Graph (backend app, app-only) ---
    azure_tenant_id: str = ""
    graph_client_id: str = ""
    graph_client_secret: str = ""
    graph_authority: str = "https://login.microsoftonline.com"
    graph_scope: str = "https://graph.microsoft.com/.default"
    graph_base_url: str = "https://graph.microsoft.com/v1.0"

    # --- SharePoint Embedded container ---
    container_type_id: str = ""
    container_id: str = ""  # filled after the container is created
    container_display_name: str = "Vessel DMS Documents"

    # Drive ID (same b!... value as container_id for SPE)
    drive_id: str = ""

    # Comma-separated drive item IDs of the main folders (Technical & Crewing,
    # Commercial & Chartering, Insurance, Kaizen - Knowledge Bank)
    main_folder_ids: str = ""

    # --- Database ---
    database_url: str = ""  # e.g. postgresql+psycopg2://user:pass@host:5432/dms
    db_host: str = ""
    db_port: int = 5432
    db_name: str = ""
    db_user: str = ""
    db_password: str = ""

    # --- Behaviour ---
    month_folder_format: str = "%B %Y"  # e.g. "June 2026"
    ocr_min_confidence: float = 0.5
    graph_verify_ssl: bool = True  # set false only to bypass TLS verification

    # --- Approval workflow ---
    # Comma-separated emails authorised to review/approve pending uploads.
    admin_emails: str = "spe.admin@sg-nissenkaiun.com"
    # Mailbox Graph sends notifications from (requires the app-only Mail.Send
    # permission, which is NOT part of the current Graph permission set — see
    # docs/SETUP.md). Leave blank to only log notifications instead of emailing.
    notify_sender_email: str = ""

    # --- Session tracking ---
    # How long (minutes) a session can be idle before it is marked Expired.
    session_idle_timeout_minutes: int = 30
    # Maximum absolute session lifetime in hours regardless of activity.
    session_max_lifetime_hours: int = 8
    # How often (minutes) the scheduler spot-checks active accounts via Graph.
    # Bounds worst-case revocation lag to this interval + sweep cadence (15 min).
    session_revalidation_interval_minutes: int = 60
    # Number of trusted reverse proxies in front of this app.
    # Used by get_client_ip() to correctly parse X-Forwarded-For.
    # 0 = no proxy (use request.client.host directly).
    trusted_proxy_hops: int = 1

    @property
    def main_folder_id_list(self) -> list[str]:
        return [fid.strip() for fid in self.main_folder_ids.split(",") if fid.strip()]

    @property
    def graph_configured(self) -> bool:
        return bool(
            self.azure_tenant_id
            and self.graph_client_id
            and self.graph_client_secret
            and self.container_type_id
        )

    @property
    def db_configured(self) -> bool:
        return bool(self.database_url_resolved)

    @property
    def database_url_resolved(self) -> str:
        """Resolved DB URL.

        Priority:
        1) DATABASE_URL (existing behavior)
        2) DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD
        """
        if self.database_url:
            return self.database_url
        if all([self.db_host, self.db_name, self.db_user, self.db_password]):
            user = quote_plus(self.db_user)
            password = quote_plus(self.db_password)
            return (
                f"postgresql+psycopg2://{user}:{password}"
                f"@{self.db_host}:{self.db_port}/{self.db_name}"
            )
        return ""

    @property
    def authority_url(self) -> str:
        return f"{self.graph_authority}/{self.azure_tenant_id}"

    @property
    def admin_email_set(self) -> set[str]:
        return {e.strip().lower() for e in self.admin_emails.split(",") if e.strip()}


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
