from app.db import create_db_and_tables


def main() -> None:
    create_db_and_tables()
    print("Base de données initialisée avec succès.")


if __name__ == "__main__":
    main()