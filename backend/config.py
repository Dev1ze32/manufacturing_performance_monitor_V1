from dataclasses import dataclass
import os
from pathlib import Path
from typing import List


BASE_DIR = Path(__file__).resolve().parent
DEFAULT_DATA_DIR = BASE_DIR / "data"


def _csv_env(name: str, default: str = "") -> List[str]:
    value = os.getenv(name, default)
    return [item.strip() for item in value.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    app_name: str
    environment: str
    database_backend: str
    sqlite_path: Path
    cors_origins: List[str]


def get_settings() -> Settings:
    data_dir = Path(os.getenv("APP_DATA_DIR", str(DEFAULT_DATA_DIR))).resolve()
    sqlite_path = Path(os.getenv("SQLITE_PATH", str(data_dir / "manufacturing.db"))).resolve()

    return Settings(
        app_name=os.getenv("APP_NAME", "Manufacturing Performance Monitor API"),
        environment=os.getenv("APP_ENV", "development"),
        database_backend=os.getenv("DB_BACKEND", "sqlite").lower(),
        sqlite_path=sqlite_path,
        cors_origins=_csv_env(
            "CORS_ORIGINS",
            "http://localhost:8000,http://127.0.0.1:8000,http://localhost:8765,http://127.0.0.1:8765",
        ),
    )
