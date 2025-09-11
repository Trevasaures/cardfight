"""
Common utilities for frontend pages
- API access
- Shared UI components"""
import os
import requests
import streamlit as st


def get_api_base() -> str:
    if "api_base" not in st.session_state:
        st.session_state["api_base"] = os.getenv("CARDFIGHT_API_URL", "http://127.0.0.1:5000")
    return st.session_state["api_base"]

def set_api_base(url: str):
    st.session_state["api_base"] = url


# ---- low-level HTTP ----
def api_get(path: str, **kwargs):
    base = get_api_base()
    r = requests.get(f"{base}{path}", timeout=10, **kwargs)
    try:
        r.raise_for_status()
    except requests.HTTPError as e:
        try:
            detail = r.json().get("error", r.text)
        except Exception:
            detail = r.text
        raise RuntimeError(f"GET {path} failed ({r.status_code}): {detail}") from e
    return r.json()

def api_req(method: str, path: str, payload: dict | None = None):
    base = get_api_base()
    r = requests.request(method, f"{base}{path}", json=payload, timeout=10)
    if r.status_code >= 400:
        try:
            msg = r.json().get("error", r.text)
        except Exception:
            msg = r.text
        raise RuntimeError(f"{method} {path} failed ({r.status_code}): {msg}")
    return r.json() if r.content else None


# ---- typed helpers ----
def fetch_decks(include_inactive: bool = True):
    params = {"include_inactive": "true"} if include_inactive else {}
    return api_get("/api/decks", params=params)

def fetch_random(mode: str):
    return api_get("/api/random", params={"mode": mode})

def submit_match(deck1_id: int, deck2_id: int, winner_id: int | None, notes: str,
                 first_player_id: int | None = None, fmt: str | None = None):
    payload = {
        "deck1_id": deck1_id,
        "deck2_id": deck2_id,
        "winner_id": winner_id,
        "notes": notes,
        "first_player_id": first_player_id,
        "format": fmt,
    }
    return api_req("POST", "/api/matches", payload)

def add_deck(name: str, dtype: str, active: bool = True):
    return api_req("POST", "/api/decks", {"name": name, "type": dtype, "active": active})

def update_deck(deck_id: int, **fields):
    return api_req("PATCH", f"/api/decks/{deck_id}", fields)

def delete_deck(deck_id: int):
    return api_req("DELETE", f"/api/decks/{deck_id}", None)

def fetch_versus(deck_id: int):
    return api_get(f"/api/stats/versus/{deck_id}")

def fetch_stats_table():
    return fetch_decks(include_inactive=True)

def fetch_matrix():
    return api_get("/api/stats/matrix")


# ---- shared UI bits ----
def settings_expander():
    with st.sidebar.expander("API settings"):
        current = get_api_base()
        val = st.text_input("API base URL", value=current, help="e.g. http://127.0.0.1:5000")
        if val != current:
            set_api_base(val)
            st.success("API base saved")