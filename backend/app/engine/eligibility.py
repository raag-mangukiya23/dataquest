"""Evaluates a scholarship's machine-readable rules against what we know about the student and family.

Result per rule: True, False, or None when we don't have the fact (we never guess a missing fact).
Overall: False if any rule fails, True if all pass, otherwise None ("check eligibility yourself").
Facts never include gender, caste, religion or community.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from app.schemas.catalog import EligibilityCheck

_OPS = {
    "==": lambda a, b: a == b,
    "!=": lambda a, b: a != b,
    "<": lambda a, b: a < b,
    "<=": lambda a, b: a <= b,
    ">": lambda a, b: a > b,
    ">=": lambda a, b: a >= b,
    "in": lambda a, b: a in b,
}


def _clause(clause: Mapping[str, Any], facts: Mapping[str, Any]) -> bool | None:
    value = facts.get(clause["field"])
    if value is None:
        return None
    try:
        return bool(_OPS[clause["op"]](value, clause["value"]))
    except (KeyError, TypeError):
        return None


def evaluate(
    rules: Mapping[str, Any], facts: Mapping[str, Any]
) -> tuple[bool | None, list[EligibilityCheck]]:
    checks: list[EligibilityCheck] = []
    verdicts: list[bool | None] = []
    for combinator, clauses in rules.items():
        results = [_clause(c, facts) for c in clauses]
        checks += [
            EligibilityCheck(rule=f"{c['field']} {c['op']} {c['value']}", passed=r)
            for c, r in zip(clauses, results, strict=True)
        ]
        if combinator == "all":
            verdicts.append(
                False if False in results else (True if all(r is True for r in results) else None)
            )
        elif combinator == "any":
            verdicts.append(
                True if True in results else (False if all(r is False for r in results) else None)
            )
    if False in verdicts:
        return False, checks
    if verdicts and all(v is True for v in verdicts):
        return True, checks
    return None, checks
