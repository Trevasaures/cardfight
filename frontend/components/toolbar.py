# frontend/components/toolbar.py
import streamlit as st

def format_selector(key: str = "mode"):
    options = ["any", "standard", "stride"]
    labels = {"any": "Any", "standard": "Standard", "stride": "Stride"}
    if key not in st.session_state:
        st.session_state[key] = "any"
    return st.radio(
        "Choose mode (affects deck pool)",
        options=options,
        index=options.index(st.session_state[key]),
        format_func=lambda x: labels[x],
        horizontal=True,
        key=key,
        help="Filters deck pool by type for both Random and Custom."
    )