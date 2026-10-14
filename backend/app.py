import re

from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

from backend.config import PROJECT_ROOT, default_config
from backend.database import db
from backend.errors import register_api_errors
from backend.routes import all_blueprints
from backend.schema import ensure_schema_upgrades

load_dotenv(PROJECT_ROOT / ".env")


def create_app(config=None):
    """Build an isolated app; explicit overrides are useful for tests/WSGI setup."""
    app = Flask(__name__, instance_relative_config=True)
    app.config.update(default_config())
    if config is not None:
        app.config.update(config)
    app.json.sort_keys = False
    (PROJECT_ROOT / "instance").mkdir(exist_ok=True)

    db.init_app(app)
    # Flask-CORS accepts regexes; compile escaped full matches so configuration
    # remains a list of literal origins, including IPv6 addresses.
    origins = [
        re.compile(rf"\A{re.escape(origin)}\Z") for origin in app.config["CORS_ORIGINS"]
    ]
    CORS(app, resources={r"/api/*": {"origins": origins}})

    with app.app_context():
        db.create_all()
        ensure_schema_upgrades()

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
