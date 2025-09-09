import os
import requests
import streamlit as st

API_BASE = os.getenv("CARDFIGHT_API_URL", "http://127.0.0.1:5000")


# ---------- helpers ----------
def api_get(path: str, **kwargs):
    r = requests.get(f"{API_BASE}{path}", timeout=10, **kwargs)
    r.raise_for_status()
    return r.json()

def api_post(path: str, payload: dict):
    r = requests.post(f"{API_BASE}{path}", json=payload, timeout=10)
    if r.status_code >= 400:
        try:
            msg = r.json().get("error", r.text)
        except Exception:
            msg = r.text
        raise RuntimeError(f"POST {path} failed ({r.status_code}): {msg}")
    return r.json() if r.content else None

def fetch_stats():
    return api_get("/api/decks")

def fetch_random(mode: str):
    return api_get("/api/random", params={"mode": mode})

def submit_match(deck1_id: int, deck2_id: int, winner_id: int | None, notes: str, first_player_id: int | None = None, fmt: str | None = None):
    payload = {
        "deck1_id": deck1_id,
        "deck2_id": deck2_id,
        "winner_id": winner_id,
        "notes": notes,
        "first_player_id": first_player_id,
        "format": fmt,
    }
    return api_post("/api/matches", payload)


# ---------- streamlit UI ----------
st.set_page_config(page_title="Cardfight Matchups", page_icon="🎴", layout="centered")

st.title("🎴 Cardfight!! Deck Matchup")
st.caption("Local GUI for generating matchups, picking a winner, and tracking stats.")

with st.expander("Advanced: API settings"):
    api_input = st.text_input("API base URL", value=API_BASE, help="Change if your API is hosted elsewhere.")
    if api_input != API_BASE:
        API_BASE = api_input
        st.session_state.clear()
        st.success(f"API base set to {API_BASE}")

mode = st.radio(
    "Choose mode",
    options=["any", "standard", "stride"],
    index=0,
    horizontal=True,
    help="Filter the pool used to roll a matchup.",
)

col1, col2 = st.columns(2)
with col1:
    if st.button("🎲 Generate Matchup", use_container_width=True):
        try:
            data = fetch_random(mode)
            st.session_state["matchup"] = data
            st.session_state["notes"] = ""
            st.session_state["winner_id"] = None
            st.success("Matchup generated!")
        except Exception as e:
            st.error(f"Failed to generate matchup: {e}")

with col2:
    if st.button("🔄 Clear", use_container_width=True):
        st.session_state.pop("matchup", None)
        st.session_state.pop("notes", None)
        st.session_state.pop("winner_id", None)

matchup = st.session_state.get("matchup")
if matchup:
    d1 = matchup["deck1"]
    d2 = matchup["deck2"]
    first_id = matchup["first_player_id"]

    st.subheader("Current Matchup")
    c1, c2 = st.columns(2)

    with c1:
        st.markdown(
            f"**{d1['name']}**  \n"
            f"Type: `{d1['type']}`  \n"
            f"Record: {d1['wins']}-{d1['losses']}  \n"
            f"{'🟢 Goes first' if d1['id'] == first_id else ''}"
        )

    with c2:
        st.markdown(
            f"**{d2['name']}**  \n"
            f"Type: `{d2['type']}`  \n"
            f"Record: {d2['wins']}-{d2['losses']}  \n"
            f"{'🟢 Goes first' if d2['id'] == first_id else ''}"
        )

    st.subheader("Pick the Winner")
    winner_label_map = {
        d1["id"]: f"{d1['name']}",
        d2["id"]: f"{d2['name']}",
        None: "Undecided / Log without winner",
    }

    default_index = 2
    options = [d1["id"], d2["id"], None]
    labels = [winner_label_map[o] for o in options]
    chosen = st.radio("Winner", options=options, index=default_index, format_func=lambda x: winner_label_map[x], horizontal=True, key="winner")

    notes = st.text_area("Match notes (optional)", value=st.session_state.get("notes", ""), key="notes", placeholder="e.g., Came down to last turn, double trigger, etc.")

    if st.button("✅ Save Result", type="primary", use_container_width=True):
        try:
            res = submit_match(
                d1["id"], d2["id"],
                st.session_state.get("winner"),
                st.session_state.get("notes", ""),
                first_player_id=first_id,
                fmt=("Standard" if mode=="standard" else "Stride" if mode=="stride" else "Any"),
            )
        except Exception as e:
            st.error(f"Failed to save: {e}")

st.divider()

st.subheader("Deck Stats")
try:
    stats = fetch_stats()
    if stats:
        for row in stats:
            row["win %"] = f"{row['win_pct']*100:.1f}%"
            row.pop("win_pct", None)
        st.dataframe(stats, use_container_width=True, hide_index=True)
    else:
        st.info("No decks found.")
except Exception as e:
    st.error(f"Failed to load stats: {e}")