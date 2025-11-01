import streamlit as st

def winner_radio(key: str, d1: dict, d2: dict):
    """
    Radio returning selected winner id or None.
    Uses safe default only if key not present in session_state.
    """
    options = [d1["id"], d2["id"], None]
    labels = {d1["id"]: d1["name"], d2["id"]: d2["name"], None: "Undecided / Log without winner"}

    kwargs = dict(
        options=options,
        format_func=lambda x: labels[x],
        horizontal=True,
        key=key,
    )
    if key not in st.session_state:
        kwargs["index"] = 2  # default: Undecided
    st.radio("Winner", **kwargs)
    return st.session_state.get(key)

def first_player_radio(key: str, d1: dict, d2: dict):
    kwargs = dict(
        options=[d1["id"], d2["id"]],
        format_func=lambda x: {d1["id"]: d1["name"], d2["id"]: d2["name"]}[x],
        horizontal=True,
        key=key,
    )
    if key not in st.session_state:
        kwargs["index"] = 0
    st.radio("First player", **kwargs)
    return st.session_state.get(key)

def notes_area(key: str, placeholder: str):
    st.text_area("Match notes (optional)", key=key, placeholder=placeholder)
    return st.session_state.get(key, "")

def clear_keys(*keys: str):
    for k in keys:
        st.session_state.pop(k, None)