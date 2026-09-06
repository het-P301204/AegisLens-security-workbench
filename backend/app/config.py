"""Application configuration, read from the environment with safe defaults.

No secrets are stored in this file. Values that differ between environments are
read from environment variables (see ``.env.example`` in the repository root).
"""

from __future__ import annotations

import os
from pathlib import Path

# backend/app/config.py -> backend/app -> backend -> repository root
REPO_ROOT = Path(__file__).resolve().parents[2]

#: Where the SQLite file lives. Overridable so tests and containers can relocate it.
DATABASE_URL = os.getenv("AEGISLENS_DATABASE_URL", f"sqlite:///{REPO_ROOT / 'backend' / 'aegislens.db'}")

#: Directory holding the synthetic seed dataset.
SAMPLE_DATA_DIR = Path(os.getenv("AEGISLENS_SAMPLE_DATA_DIR", REPO_ROOT / "sample-data"))

#: Optional directory containing a built frontend bundle. When present it is served
#: by the API so the whole application runs from a single container.
_static_env = os.getenv("AEGISLENS_STATIC_DIR")
STATIC_DIR = Path(_static_env) if _static_env else REPO_ROOT / "frontend" / "dist"

#: Browser origins allowed to call the API. Comma separated.
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "AEGISLENS_CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

#: Seed the database with the synthetic dataset when it is empty.
SEED_ON_STARTUP = os.getenv("AEGISLENS_SEED_ON_STARTUP", "true").lower() == "true"

APP_NAME = "AegisLens"
APP_SUBTITLE = "Security Evidence & Risk Intelligence Workbench"
APP_VERSION = "1.0.0"
