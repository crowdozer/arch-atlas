"""Entry - wires API routes and starts the app surface."""
from app.api.routes import create_app
from app.lib.logger import info
from app.services.user_service import bootstrap_users


def main() -> None:
    bootstrap_users()
    app = create_app()
    info("demo-python-app ready", routes=len(app.url_map._rules))
    app.run(debug=False)


if __name__ == "__main__":
    main()
