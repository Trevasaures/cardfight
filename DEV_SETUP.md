# Developer Setup & Usage Guide 🛠️

This document explains how to set up and run the **Cardfight!! Deck Battle Simulator** locally.

---

## 1. Clone the repo first from the README.md file

- Instructions on how and where to clone in your local machine are included there.

## 2. Install Dependencies

- Run `pip install -r requirements.txt`

## 3. Run the backend

- Windows PowerShell
  - $env:FLASK_APP = "backend.app"
  - $env:FLASK_ENV = "development"
  - python -m flask run

# 4. Seed the database

- Run `python -m backend.seed`

# 5. Run the frontend

- In a second terminal, run `python -m streamlit run frontend/gui.py`

# 6. Make a new instance for the database (optional if needed to re-seed)

- Run `python -m flask --app backend.app run`
- Run `python -m backend.seed`
