import argparse
import json

from app.db import get_db
from app.services.sync_service import sync_recent_strava_activities


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Synchroniser les activites recentes d'un athlete Strava.")
    parser.add_argument("--athlete-id", type=int, required=True, help="Identifiant athlete a synchroniser.")
    parser.add_argument("--per-page", type=int, default=30, help="Nombre max d'activites a recuperer.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    with get_db() as session:
        result = sync_recent_strava_activities(
            session=session,
            athlete_id=args.athlete_id,
            per_page=args.per_page,
        )

    print(json.dumps(result, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
