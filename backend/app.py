import os

from flask import Flask, jsonify
from flask_cors import CORS
from sqlalchemy import event
from sqlalchemy.engine import Engine

from backend.database import db
from backend.routes import all_blueprints
from backend.schema import ensure_schema_upgrades

from pathlib import Path
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(PROJECT_ROOT / ".env")


def create_app():
    app = Flask(__name__, instance_relative_config=True)

    base_dir = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
    default_db_path = os.path.join(base_dir, "instance", "cardfight.db")
    os.makedirs(os.path.dirname(default_db_path), exist_ok=True)

    app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv(
        "DATABASE_URL",
        f"sqlite:///{default_db_path}",
    )
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["JSON_SORT_KEYS"] = False

    db.init_app(app)
    CORS(app)

    @event.listens_for(Engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        try:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()
        except Exception:
            pass

    with app.app_context():
        db.create_all()
        ensure_schema_upgrades()

    @app.get("/health")
    @app.get("/api/health")
    def health():
        return jsonify(status="ok", service="cardfight-api")

    @app.errorhandler(400)
    def bad_request(error):
        description = getattr(error, "description", None)
        return jsonify(error=description or "bad request"), 400

    @app.errorhandler(404)
    def not_found(error):
        return jsonify(error="not found"), 404

    @app.errorhandler(500)
    def server_error(error):
        return jsonify(error="internal server error"), 500

    for blueprint in all_blueprints:
        app.register_blueprint(blueprint)

    return app


app = create_app()

if __name__ == "__main__":
    app.run(debug=True, port=5000)