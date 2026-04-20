import argparse
import json
from datetime import date

from sqlmodel import Session

from app.db import engine
from app.services.metrics_service import recompute_metrics_for_athlete


def _parse_date(value: str | None) -> date | None:
    if value is None:
        return None
    return date.fromisoformat(value)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Recalculer les metriques d'un athlete.")
    parser.add_argument("--athlete-id", type=int, required=True, help="Identifiant athlete cible.")
    parser.add_argument("--start-date", type=str, default=None, help="Date debut (YYYY-MM-DD).")
    parser.add_argument("--end-date", type=str, default=None, help="Date fin (YYYY-MM-DD).")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    start_date = _parse_date(args.start_date)
    end_date = _parse_date(args.end_date)

    with Session(engine) as session:
        result = recompute_metrics_for_athlete(
            session=session,
            athlete_id=args.athlete_id,
            start_date=start_date,
            end_date=end_date,
        )

    print(json.dumps(result, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
