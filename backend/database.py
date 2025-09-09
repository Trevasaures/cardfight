"""
Database setup using SQLAlchemy.
Includes the database instance for use in models and application setup.
"""
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()