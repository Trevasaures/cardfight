"""
Application factory for the Flask app.
Includes health check endpoint and registers API routes.
"""
import os
from flask import Flask, jsonify
from backend.database import db
from backend.routes import bp as api_bp

def create_app():
    app = Flask(__name__)

    # SQLite DB in project root (cardfight/cardfight.db)
    app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv("DATABASE_URL", "sqlite:///cardfight.db")
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    db.init_app(app)

    # Create tables if not present
    with app.app_context():
        db.create_all()

    @app.get("/health")
    def health():
        return jsonify(status="ok")

    # REST API routes
    app.register_blueprint(api_bp)
    return app

# WSGI entrypoint
app = create_app()