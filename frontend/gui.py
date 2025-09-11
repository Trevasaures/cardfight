"""
Frontend main page
- Sets page config
- Title and caption
- Instructions
- Settings expander
"""
import streamlit as st
from common import settings_expander

st.set_page_config(page_title="Cardfight!! Simulator", page_icon="🎴", layout="centered")
st.title("🎴 Cardfight!! Deck Battle Simulator")
st.caption("Pick a page in the sidebar to get started.")

settings_expander()

st.markdown("""
**Pages**
- **Play**: Roll random matchups, pick a winner, log notes.
- **Deck Manager**: Add/rename decks, toggle active, delete.
- **Stats**: Overall table and win% chart.
- **Head-to-Head**: Per-opponent breakdown and recent history.
""")