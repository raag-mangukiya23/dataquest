"""Live job-postings feed from the Adzuna API (India, country code 'in').

What it measures: the number of live job ads matching a career's keywords, nationally and per city,
plus the mean advertised salary. Snapshots are stored daily; demand and velocity are derived from them:

  demand_index  = mid-rank percentile of a career's posting count among all careers in the same region
  job_velocity  = (count_now - count_then) / count_then   against the snapshot ~30 days earlier

Budget: the free tier allows 250 calls a day. National counts for every career are fetched first, then
the remaining budget rotates through career x city pairs, so every pair is refreshed every few days.
Without ADZUNA_APP_ID / ADZUNA_APP_KEY the adapter is disabled and says so; nothing else breaks.
Limitation: Adzuna aggregates online listings, so it over-represents urban, white-collar jobs.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date

import httpx

from app.schemas.common import Provenance, VerificationStatus

API_ROOT = "https://api.adzuna.com/v1/api/jobs"
DOCS_URL = "https://developer.adzuna.com"
NATIONAL = "IN"


@dataclass(frozen=True)
class PostingQuery:
    career_slug: str
    keywords: str
    region_code: str
    where: str | None  # None = all of India


@dataclass(frozen=True)
class PostingCount:
    query: PostingQuery
    count: int
    mean_salary: float | None
    fetched_on: date


@dataclass(frozen=True)
class FetchResult:
    counts: list[PostingCount]
    errors: list[str]
    calls: int


@dataclass(frozen=True)
class SignalDraft:
    career_slug: str
    region_code: str
    demand_index: float
    job_velocity: float | None
    posting_count: int
    mean_salary: float | None
    as_of: date
    keywords: str

    def provenance(self) -> Provenance:
        where = "India" if self.region_code == NATIONAL else self.region_code
        return Provenance(
            source_name="Adzuna job-search API",
            source_url=DOCS_URL,
            as_of=self.as_of,
            confidence=0.7,
            is_estimate=False,
            verification=VerificationStatus.VERIFIED,
            verified_on=self.as_of,
            evidence=f"{self.posting_count} live ads for '{self.keywords}' in {where} on {self.as_of.isoformat()}",
        )


class AdzunaAdapter:
    key = "adzuna"

    def __init__(
        self,
        app_id: str | None,
        app_key: str | None,
        *,
        client: httpx.Client | None = None,
        country: str = "in",
        timeout: float = 10.0,
    ) -> None:
        self.app_id = app_id
        self.app_key = app_key
        self.country = country
        self.timeout = timeout
        self._client = client

    @property
    def enabled(self) -> bool:
        return bool(self.app_id and self.app_key)

    def _http(self) -> httpx.Client:
        if self._client is None:
            self._client = httpx.Client(timeout=self.timeout)
        return self._client

    def count(self, q: PostingQuery, today: date) -> PostingCount:
        params: dict[str, str | int] = {
            "app_id": self.app_id or "",
            "app_key": self.app_key or "",
            "what": q.keywords,
            "results_per_page": 1,
            "content-type": "application/json",
        }
        if q.where:
            params["where"] = q.where
        r = self._http().get(f"{API_ROOT}/{self.country}/search/1", params=params)
        r.raise_for_status()
        data = r.json()
        count = data.get("count", 0)
        mean = data.get("mean")
        return PostingCount(
            query=q,
            count=max(0, int(count)) if isinstance(count, int | float) else 0,
            mean_salary=float(mean) if isinstance(mean, int | float) else None,
            fetched_on=today,
        )

    def fetch(self, queries: Sequence[PostingQuery], today: date, max_calls: int) -> FetchResult:
        if not self.enabled:
            return FetchResult([], ["Adzuna feed disabled: set ADZUNA_APP_ID and ADZUNA_APP_KEY"], 0)
        counts: list[PostingCount] = []
        errors: list[str] = []
        calls = 0
        for q in queries[:max_calls]:
            calls += 1
            try:
                counts.append(self.count(q, today))
            except httpx.HTTPStatusError as e:
                errors.append(f"{q.career_slug}@{q.region_code}: HTTP {e.response.status_code}")
                if e.response.status_code == 429:
                    errors.append("rate limit reached; stopping this run")
                    break
            except (httpx.HTTPError, ValueError) as e:
                errors.append(f"{q.career_slug}@{q.region_code}: {type(e).__name__}")
        return FetchResult(counts, errors, calls)


def plan_queries(
    careers: Sequence[tuple[str, str]], cities: Sequence[tuple[str, str]], budget: int, day_index: int
) -> list[PostingQuery]:
    """careers = (slug, keywords); cities = (region_code, city name). National queries always go first."""
    national = [PostingQuery(slug, kw, NATIONAL, None) for slug, kw in careers]
    if budget <= len(national):
        return national[:budget]
    pairs = [PostingQuery(slug, kw, code, city) for slug, kw in careers for code, city in cities]
    if not pairs:
        return national
    remaining = budget - len(national)
    start = (day_index * remaining) % len(pairs)
    rotated = pairs[start:] + pairs[:start]
    return national + rotated[:remaining]


def to_signals(counts: Sequence[PostingCount], previous: Mapping[tuple[str, str], int]) -> list[SignalDraft]:
    """previous maps (career_slug, region_code) to the posting count ~30 days earlier."""
    by_region: dict[str, list[PostingCount]] = {}
    for c in counts:
        by_region.setdefault(c.query.region_code, []).append(c)
    out: list[SignalDraft] = []
    for region, rows in by_region.items():
        values = [r.count for r in rows]
        n = len(values)
        for r in rows:
            below = sum(1 for v in values if v < r.count)
            equal = sum(1 for v in values if v == r.count)
            demand = (below + 0.5 * equal) / n
            before = previous.get((r.query.career_slug, region))
            velocity = round((r.count - before) / before, 4) if before else None
            out.append(
                SignalDraft(
                    career_slug=r.query.career_slug,
                    region_code=region,
                    demand_index=round(demand, 4),
                    job_velocity=velocity,
                    posting_count=r.count,
                    mean_salary=r.mean_salary,
                    as_of=r.fetched_on,
                    keywords=r.query.keywords,
                )
            )
    return out
