from dataclasses import dataclass
import os
from pathlib import Path
from typing import List, Optional


BASE_DIR = Path(__file__).resolve().parent
LEGACY_DATA_DIR = BASE_DIR / "data"
APP_DIR_NAME = "ManufacturingPerformanceMonitor"
DEFAULT_SQLITE_SEED_PATH = LEGACY_DATA_DIR / "manufacturing.db"


def _csv_env(name: str, default: str = "") -> List[str]:
    value = os.getenv(name, default)
    return [item.strip() for item in value.split(",") if item.strip()]


def _default_data_dir(environment: str) -> Path:
    if os.name == "nt":
        if environment == "production":
            base = os.getenv("PROGRAMDATA") or os.getenv("LOCALAPPDATA")
        else:
            base = os.getenv("LOCALAPPDATA") or os.getenv("PROGRAMDATA")
        return Path(base or Path.home()) / APP_DIR_NAME

    if environment == "production":
        return Path("/var/lib") / "manufacturing-performance-monitor"

    return Path(os.getenv("XDG_DATA_HOME", str(Path.home() / ".local" / "share"))) / "manufacturing-performance-monitor"


@dataclass(frozen=True)
class Settings:
    app_name: str
    environment: str
    database_backend: str
    sqlite_path: Path
    sqlite_seed_path: Optional[Path]
    cors_origins: List[str]


def get_settings() -> Settings:
    environment = os.getenv("APP_ENV", "development").lower()
    has_custom_sqlite_path = bool(os.getenv("SQLITE_PATH"))
    data_dir = Path(os.getenv("APP_DATA_DIR", str(_default_data_dir(environment)))).resolve()
    sqlite_path = Path(os.getenv("SQLITE_PATH", str(data_dir / "manufacturing.db"))).resolve()
    sqlite_seed_path = None if has_custom_sqlite_path else DEFAULT_SQLITE_SEED_PATH.resolve()

    return Settings(
        app_name=os.getenv("APP_NAME", "Manufacturing Performance Monitor API"),
        environment=environment,
        database_backend=os.getenv("DB_BACKEND", "sqlite").lower(),
        sqlite_path=sqlite_path,
        sqlite_seed_path=sqlite_seed_path,
        cors_origins=_csv_env(
            "CORS_ORIGINS",
            "http://localhost:8000,http://127.0.0.1:8000,"
            "http://localhost:8765,http://127.0.0.1:8765,"
            "http://localhost:5500,http://127.0.0.1:5500,"
            "http://localhost:3000,http://127.0.0.1:3000",
        ),
    )
