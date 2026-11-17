import re

from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from sqlalchemy.engine import make_url

from backend.config import PROJECT_ROOT, default_config, environment_int
from backend.auth import init_auth
from backend.database import db
from backend.errors import register_api_errors
from backend.postgres import PG_CONNECTION_ARGS
from backend.routes import all_blueprints
from backend.schema import ensure_schema_current

load_dotenv(PROJECT_ROOT / ".env")


def create_app(config=None):
    """Build an isolated app; explicit overrides are useful for tests/WSGI setup."""
    app = Flask(__name__, instance_relative_config=True)
    app.config.update(default_config())
    if config is not None:
        app.config.update(config)
    app.json.sort_keys = False
    (PROJECT_ROOT / "instance").mkdir(exist_ok=True)

    url = make_url(app.config["SQLALCHEMY_DATABASE_URI"])
    if url.get_backend_name() == "postgresql":
        if url.drivername != "postgresql+psycopg" or not url.database or not url.username:
            raise ValueError("Use a postgresql+psycopg DATABASE_URL with a database and username.")
        options = app.config.get("SQLALCHEMY_ENGINE_OPTIONS", {})
        app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
            "pool_size": environment_int("CARDFIGHT_DB_POOL_SIZE", 5, minimum=1),
            "max_overflow": environment_int("CARDFIGHT_DB_MAX_OVERFLOW", 5, minimum=0),
            "pool_pre_ping": True,
            **options,
            "connect_args": {**options.get("connect_args", {}), **PG_CONNECTION_ARGS},
        }
    db.init_app(app)
    # Flask-CORS accepts regexes; compile escaped full matches so configuration
    # remains a list of literal origins, including IPv6 addresses.
    origins = [
        re.compile(rf"\A{re.escape(origin)}\Z") for origin in app.config["CORS_ORIGINS"]
    ]
    if app.config["AUTH_MODE"] == "local":
        CORS(app, resources={r"/api/*": {"origins": origins}})

    with app.app_context():
        ensure_schema_current(
            db.engine, hosted=app.config["AUTH_MODE"] in {"oidc", "oidc-dev"}
        )

    init_auth(app)

    @app.get("/health")
    @app.get("/api/health")
    def health():
        return jsonify(status="ok", service="cardfight-api")

    @app.after_request
    def response_headers(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        return response

    for blueprint in all_blueprints:
        app.register_blueprint(blueprint)
    register_api_errors(app)

    return app


app = create_app()

if __name__ == "__main__":
    # Use `flask --app backend.app run --debug` for an explicit development session.
    app.run(host="127.0.0.1", port=5000, debug=False)
