from pydantic import BaseModel
import os

class Settings(BaseModel):
    database_url: str = os.getenv("DATABASE_URL", "postgresql+psycopg://sfas:sfas_password_change_me@localhost:5432/sfas")
    app_master_key: str = os.getenv("APP_MASTER_KEY", "CHANGE_ME")
    cookie_secure: bool = os.getenv("COOKIE_SECURE", "false").lower() == "true"
    cookie_domain: str | None = os.getenv("COOKIE_DOMAIN") or None
    cookie_name: str = "sfas_session"
    csrf_cookie_name: str = "sfas_csrf"

settings = Settings()
