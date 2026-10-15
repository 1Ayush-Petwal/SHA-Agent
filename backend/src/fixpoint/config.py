import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


@dataclass(frozen=True)
class Settings:
    database_url: str = field(default_factory=lambda: _env("DATABASE_URL"))
    admin_token: str = field(default_factory=lambda: _env("ADMIN_TOKEN"))
    fast_model: str = field(default_factory=lambda: _env("FAST_MODEL", "gemini-3.8-flash"))
    strong_model: str = field(default_factory=lambda: _env("STRONG_MODEL", "gemini-pro-latest"))
    embed_model: str = field(default_factory=lambda: _env("EMBED_MODEL", "gemini-embedding-001"))
    cors_origins: list[str] = field(
        default_factory=lambda: [
            o.strip() for o in _env("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()
        ]
    )
    # USD per 1M tokens (input, output).
    # ponytail: list prices typed in by hand, check https://ai.google.dev/pricing when models change
    fast_price: tuple[float, float] = (0.30, 2.50)
    strong_price: tuple[float, float] = (1.25, 10.00)
    ip_questions_per_hour: int = 10
    daily_question_cap: int = int(_env("DAILY_QUESTION_CAP", "300"))
    max_question_chars: int = 500
    max_repairs: int = 3


settings = Settings()
