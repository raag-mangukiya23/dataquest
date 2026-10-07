"""Backend selection. Routers depend on `get_gateway` and never know whether they are talking to fixtures
(MOCK_MODE=true) or to the database-backed live gateway. Both return identical schemas."""

from collections.abc import Iterator
from functools import lru_cache
from typing import Any

from app.core.config import get_settings


@lru_cache
def _mock() -> Any:
    from app.mocks.gateway import MockGateway

    return MockGateway()


def get_gateway() -> Iterator[Any]:
    if get_settings().mock_mode:
        yield _mock()
        return
    from app.db.session import get_sessionmaker
    from app.services.live import LiveGateway

    db = get_sessionmaker()()
    try:
        yield LiveGateway(db)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
