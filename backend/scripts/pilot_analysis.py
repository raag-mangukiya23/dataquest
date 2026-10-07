"""Item analysis for a questionnaire pilot (run it after 25-40 students have taken the instruments).

Input: a CSV with columns respondent_id,question_id,value (question_id = the public q_... id or the bank id).
Output, per trait: Cronbach's alpha and each item's corrected item-total correlation; per aptitude item:
the share answering correctly (difficulty) and the correlation with the rest of the section (discrimination).

  python scripts/pilot_analysis.py responses.csv

Rules of thumb used to flag items: alpha below 0.6, item-total correlation below 0.2, aptitude items
answered correctly by fewer than 20 % or more than 90 % of students.
"""

import csv
import os
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("LOG_LEVEL", "WARNING")

from app.assessment.bank import get_bank  # noqa: E402
from app.engine.psychometrics import cronbach_alpha, item_total_correlations, keyed  # noqa: E402

MIN_ALPHA = 0.6
MIN_ITEM_TOTAL = 0.2
P_RANGE = (0.2, 0.9)


def load(path: Path) -> dict[str, dict[str, str]]:
    bank = get_bank()
    answers: dict[str, dict[str, str]] = defaultdict(dict)
    with path.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            qid = row["question_id"].strip()
            item = bank.by_public_id.get(qid) or bank.items.get(qid)
            if item is None:
                print(f"skipping unknown question id {qid}", file=sys.stderr)
                continue
            answers[row["respondent_id"].strip()][item[1].id] = row["value"].strip()
    return answers


def analyse(answers: dict[str, dict[str, str]]) -> list[str]:
    bank = get_bank()
    out: list[str] = []
    for inst in bank.instruments.values():
        for dim in inst.dimensions:
            items = [i for i in inst.items if i.dimension == dim]
            rows = []
            for resp in answers.values():
                if not all(i.id in resp for i in items):
                    continue  # complete cases only
                if inst.scale.value == "mcq":
                    rows.append([1.0 if resp[i.id] == i.answer else 0.0 for i in items])
                else:
                    rows.append([float(keyed(int(resp[i.id]), i.reverse)) for i in items])
            if len(rows) < 3:
                out.append(f"{dim:16s} not enough complete responses ({len(rows)})")
                continue
            alpha = cronbach_alpha(rows)
            flag = "" if alpha is not None and alpha >= MIN_ALPHA else "  <- below 0.6"
            out.append(f"{dim:16s} n={len(rows):3d}  alpha={alpha if alpha is not None else 'n/a'}{flag}")
            for item, r in zip(items, item_total_correlations(rows), strict=True):
                note = ""
                if r is None or r < MIN_ITEM_TOTAL:
                    note = "  <- weak: rewrite or replace"
                if inst.scale.value == "mcq":
                    p = sum(row[items.index(item)] for row in rows) / len(rows)
                    if not P_RANGE[0] <= p <= P_RANGE[1]:
                        note += f"  <- {'too hard' if p < P_RANGE[0] else 'too easy'} (p={p:.2f})"
                    out.append(f"    {item.id:28s} p={p:.2f} item-total={r}{note}")
                else:
                    out.append(f"    {item.id:28s} item-total={r}{note}")
    return out


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    answers = load(Path(sys.argv[1]))
    print(f"{len(answers)} respondents\n")
    print("\n".join(analyse(answers)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
