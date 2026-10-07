"""Importing this package registers every table on Base.metadata (used by Alembic and tests)."""

from app.models import assessment, catalog, engagement, identity, outputs, site, student  # noqa: F401
