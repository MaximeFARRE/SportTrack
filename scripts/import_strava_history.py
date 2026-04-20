import argparse
import json

from sqlmodel import Session

from app.db import engine
from app.services.sync_service import import_strava_history


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Importer l'historique Strava d'un athlete.")
    parser.add_argument("--athlete-id", type=int, required=True, help="Identifiant athlete a synchroniser.")
    parser.add_argument("--per-page", type=int, default=100, help="Taille de page Strava.")
    parser.add_argument("--max-pages", type=int, default=10, help="Nombre max de pages a recuperer.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    with Session(engine) as session:
        result = import_strava_history(
            session=session,
            athlete_id=args.athlete_id,
            per_page=args.per_page,
            max_pages=args.max_pages,
        )

    print(json.dumps(result, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
