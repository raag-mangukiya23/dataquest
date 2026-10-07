import os

os.environ["MOCK_MODE"] = "true"
os.environ["DEMO_MODE"] = "true"  # developer tools on for tests and fixtures
os.environ["DEMO_TODAY"] = "2026-10-07"
os.environ["RATE_LIMIT_PER_MINUTE"] = "0"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.config import get_settings  # noqa: E402

get_settings.cache_clear()

from app.main import create_app  # noqa: E402


@pytest.fixture(scope="session")
def client() -> TestClient:
    return TestClient(create_app())


PARENT = {"X-Mock-Role": "parent"}
ADMIN = {"X-Mock-Role": "admin"}
