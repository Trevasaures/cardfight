"""
Application factory for the Flask app.
Includes health check endpoint and registers API routes.
"""
import os
from flask import Flask, jsonify
from backend.database import db
from backend.routes import bp as api_bp

from flask_cors import CORS
from sqlalchemy import event
from sqlalchemy.engine import Engine


def create_app():
    app = Flask(__name__)

    app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv("DATABASE_URL", "sqlite:///cardfight.db")
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

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

    # Create tables if not present
    with app.app_context():
        db.create_all()

    @app.get("/health")
    def health():
        return jsonify(status="ok")

    @app.errorhandler(400)
    def bad_request(e):
        return jsonify(error=str(e.description) if hasattr(e, "description") else "bad request"), 400

    @app.errorhandler(404)
    def not_found(e):
        return jsonify(error="not found"), 404

    app.register_blueprint(api_bp)
    return app

app = create_app()