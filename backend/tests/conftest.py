"""Test fixtures.

Every test gets a fresh SQLite file in a temporary directory, so tests never
touch the developer's working database and can run in any order.
"""

from __future__ import annotations

import os
import sys
from collections.abc import Iterator
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
SAMPLE_DATA_DIR = REPO_ROOT / "sample-data"

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


@pytest.fixture
def db_path(tmp_path: Path) -> Path:
    return tmp_path / "test-aegislens.db"


def _build_app(db_file: Path, seed: bool):
    """Import the app with configuration pointed at a throwaway database.

    ``app.config`` reads the environment at import time, so the modules are
    dropped from ``sys.modules`` first to force a clean re-import per test.
    """
    os.environ["AEGISLENS_DATABASE_URL"] = f"sqlite:///{db_file}"
    os.environ["AEGISLENS_SAMPLE_DATA_DIR"] = str(SAMPLE_DATA_DIR)
    os.environ["AEGISLENS_STATIC_DIR"] = str(db_file.parent / "no-frontend-here")
    os.environ["AEGISLENS_SEED_ON_STARTUP"] = "true" if seed else "false"

    for module in [name for name in list(sys.modules) if name == "app" or name.startswith("app.")]:
        del sys.modules[module]

    from app.main import create_app

    return create_app()


@pytest.fixture
def client(db_path: Path) -> Iterator:
    """TestClient backed by a freshly seeded sample dataset."""
    from fastapi.testclient import TestClient

    with TestClient(_build_app(db_path, seed=True)) as test_client:
        yield test_client


@pytest.fixture
def empty_client(db_path: Path) -> Iterator:
    """TestClient backed by an empty database (seeding disabled)."""
    from fastapi.testclient import TestClient

    with TestClient(_build_app(db_path, seed=False)) as test_client:
        yield test_client


@pytest.fixture
def new_finding_payload() -> dict:
    return {
        "title": "Service account key rotation is not enforced",
        "description": "Long-lived service account keys are not rotated on a schedule.",
        "category": "Access Control",
        "severity": "High",
        "likelihood": 3,
        "impact": 4,
        "status": "Open",
        "owner": "Platform Engineering",
        "affected_asset": "Internal Build Server",
        "security_impact": "A leaked long-lived key stays valid indefinitely.",
        "recommended_action": "Introduce a 90-day rotation schedule and alert on key age.",
        "due_date": "2026-12-01",
    }
