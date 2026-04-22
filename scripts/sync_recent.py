import argparse
import json

from sqlmodel import Session

from app.db import engine
from app.services.sync_service import sync_recent_strava_activities


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync recent Strava activities for a given athlete.")
    parser.add_argument("--athlete-id", type=int, required=True, help="ID of the athlete to sync.")
    parser.add_argument("--per-page", type=int, default=30, help="Maximum number of activities to fetch.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    with Session(engine) as session:
        result = sync_recent_strava_activities(
            session=session,
            athlete_id=args.athlete_id,
            per_page=args.per_page,
        )

    print(json.dumps(result, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
