"""
Play page
- Random tab: roll matchup, pick winner, add notes, save
- Custom tab: choose decks manually, choose who goes first, pick winner/undecided, add notes, save
"""
import streamlit as st
from common import (
    settings_expander,
    fetch_random,
    submit_match,
    fetch_decks,
)

st.set_page_config(page_title="Play", page_icon="🎲", layout="centered")
st.title("🎲 Play")

settings_expander()

# ---------- modal confirmation machinery ----------
def show_saved_dialog():
    """If a saved-match payload exists, show modal and short-circuit page rendering."""
    payload = st.session_state.get("__saved_match__")
    if not payload:
        return False  # nothing to show

    title = payload.get("title", "Match saved")
    summary_lines = payload.get("summary_lines", [])
    mode = payload.get("mode", "Any")

    @st.dialog(title)
    def _dialog():
        st.success("The match has been recorded successfully ✅")
        if mode:
            st.caption(f"Format: **{mode}**")
        for line in summary_lines:
            st.write(line)

        st.divider()
        c1, c2 = st.columns([1, 1])
        with c1:
            if st.button("Close", type="primary"):
                # clear the flag and refresh page
                st.session_state.pop("__saved_match__", None)
                st.rerun()
        with c2:
            # optional quick-action: go to Head-to-Head page (if you want)
            if st.button("View stats", help="Opens the Stats tab"):
                st.session_state.pop("__saved_match__", None)
                st.switch_page("pages/3_Stats.py")  # adjust path if needed

    _dialog()
    return True  # dialog rendered; caller should skip rest of page


# If we have a saved confirmation to show, render it and stop
if show_saved_dialog():
    st.stop()


# ---------- Shared format selector ----------
mode = st.radio(
    "Choose mode (affects deck pool)",
    options=["any", "standard", "stride"],
    index=0,
    horizontal=True,
    help="Filters deck pool by type for both Random and Custom.",
)

tab_random, tab_custom = st.tabs(["🎲 Random", "🛠️ Custom"])


# ---------------------- RANDOM TAB ----------------------
with tab_random:
    col1, col2 = st.columns(2)
    with col1:
        if st.button("Generate Matchup", width="stretch"):
            try:
                data = fetch_random(mode)
                st.session_state["matchup"] = data
                # clear widget-bound keys so defaults apply cleanly
                for k in ("notes_random", "winner_random"):
                    st.session_state.pop(k, None)
                st.toast("Matchup generated 🎲")
                st.rerun()
            except Exception as e:
                st.error(f"Failed to generate matchup: {e}")

    with col2:
        if st.button("Clear", width="stretch"):
            for k in ("matchup", "notes_random", "winner_random"):
                st.session_state.pop(k, None)

    matchup = st.session_state.get("matchup")
    if matchup:
        d1 = matchup["deck1"]; d2 = matchup["deck2"]; first_id = matchup["first_player_id"]

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
        radio_kwargs = dict(
            options=[d1["id"], d2["id"], None],
            format_func=lambda x: {d1["id"]: d1["name"], d2["id"]: d2["name"], None: "Undecided / Log without winner"}[x],
            horizontal=True,
            key="winner_random",
        )
        if "winner_random" not in st.session_state:
            radio_kwargs["index"] = 2  # default to undecided
        st.radio("Winner", **radio_kwargs)

        st.text_area(
            "Match notes (optional)",
            key="notes_random",
            placeholder="e.g., Came down to last turn, double trigger, etc.",
        )

        if st.button("Save Result", type="primary", width="stretch"):
            try:
                fmt = "Standard" if mode == "standard" else "Stride" if mode == "stride" else "Any"
                submit_match(
                    d1["id"],
                    d2["id"],
                    st.session_state.get("winner_random"),
                    st.session_state.get("notes_random", ""),
                    first_player_id=first_id,  # from random roll
                    fmt=fmt,
                )

                # Prepare confirmation payload and clear page panels
                st.session_state["__saved_match__"] = {
                    "title": "Match saved",
                    "mode": fmt,
                    "summary_lines": [
                        f"**{d1['name']}** vs **{d2['name']}**",
                        f"First player: **{(d1['name'] if first_id == d1['id'] else d2['name'])}**",
                        f"Winner: **{(d1['name'] if st.session_state.get('winner_random') == d1['id'] else (d2['name'] if st.session_state.get('winner_random') == d2['id'] else 'Undecided'))}**",
                    ],
                }
                for k in ("matchup", "notes_random", "winner_random"):
                    st.session_state.pop(k, None)
                st.rerun()
            except Exception as e:
                st.error(f"Failed to save: {e}")


# ---------------------- CUSTOM TAB ----------------------
with tab_custom:
    st.caption("Build your own matchup: pick two decks, who goes first, set winner, add notes.")

    try:
        all_decks = fetch_decks(include_inactive=False)
    except Exception as e:
        st.error(f"Failed to load decks: {e}")
        all_decks = []

    def _type_ok(t: str) -> bool:
        m = mode.lower()
        return (m == "any") or (m == "standard" and t == "Standard") or (m == "stride" and t == "Stride")

    decks = [d for d in all_decks if _type_ok(d["type"])]
    if not decks or len(decks) < 2:
        st.warning("Not enough active decks in this mode to create a custom match.")
        st.stop()

    left, right = st.columns(2)
    opts = [f"{d['name']} ({d['type']})" for d in decks]
    with left:
        d1_label = st.selectbox("Deck A", options=opts, index=0, key="custom_d1_label")
    with right:
        d2_default_idx = 1 if len(decks) > 1 else 0
        d2_label = st.selectbox("Deck B", options=opts, index=d2_default_idx, key="custom_d2_label")

    by_label = {f"{d['name']} ({d['type']})": d for d in decks}
    d1 = by_label[d1_label]
    d2 = by_label[d2_label]

    if d1["id"] == d2["id"]:
        st.error("Deck A and Deck B must be different.")
        st.stop()

    st.subheader("Who goes first?")
    first_options = [d1["id"], d2["id"]]
    first_labels = {d1["id"]: d1["name"], d2["id"]: d2["name"]}
    st.radio(
        "First player",
        options=first_options,
        index=0 if "custom_first" not in st.session_state else None,
        format_func=lambda x: first_labels[x],
        horizontal=True,
        key="custom_first",
    )

    st.subheader("Winner")
    win_options = [d1["id"], d2["id"], None]
    win_labels = {d1["id"]: d1["name"], d2["id"]: d2["name"], None: "Undecided / Log without winner"}
    st.radio(
        "Result",
        options=win_options,
        index=2 if "custom_winner" not in st.session_state else None,
        format_func=lambda x: win_labels[x],
        horizontal=True,
        key="custom_winner",
    )

    st.text_area(
        "Match notes (optional)",
        key="notes_custom",
        placeholder="e.g., Mulliganed to 5; trigger flood; misplay on T3; etc.",
    )

    if st.button("Save Custom Match", type="primary", width="stretch"):
        try:
            fmt = "Standard" if mode == "standard" else "Stride" if mode == "stride" else "Any"
            submit_match(
                d1["id"],
                d2["id"],
                st.session_state.get("custom_winner"),
                st.session_state.get("notes_custom", ""),
                first_player_id=st.session_state.get("custom_first"),
                fmt=fmt,
            )

            # Prepare confirmation payload and clear inputs
            winner_id = st.session_state.get("custom_winner")
            first_id = st.session_state.get("custom_first")
            st.session_state["__saved_match__"] = {
                "title": "Custom match saved",
                "mode": fmt,
                "summary_lines": [
                    f"**{d1['name']}** vs **{d2['name']}**",
                    f"First player: **{(d1['name'] if first_id == d1['id'] else d2['name'])}**",
                    f"Winner: **{(d1['name'] if winner_id == d1['id'] else (d2['name'] if winner_id == d2['id'] else 'Undecided'))}**",
                ],
            }
            for k in ("notes_custom", "custom_winner", "custom_first", "custom_d1_label", "custom_d2_label"):
                st.session_state.pop(k, None)
            st.rerun()
        except Exception as e:
            st.error(f"Failed to save: {e}")