import streamlit as st

def render_matchup_card(deck, first_id):
    return st.markdown(
        f"**{deck['name']}**  \n"
        f"Type: `{deck['type']}`  \n"
        f"Record: {deck['wins']}-{deck['losses']}  \n"
        f"{'🟢 Goes first' if deck['id'] == first_id else ''}"
    )

def current_matchup_section(d1: dict, d2: dict, first_id: int):
    st.subheader("Current Matchup")
    c1, c2 = st.columns(2)
    with c1:
        render_matchup_card(d1, first_id)
    with c2:
        render_matchup_card(d2, first_id)