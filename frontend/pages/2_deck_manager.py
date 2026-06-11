"""
Page for managing decks.

Supports:
- Add deck
- Rename deck
- Toggle active/inactive
- Delete deck when it has no match history
"""

import streamlit as st

from common import (
    settings_expander,
    fetch_decks,
    add_deck,
    update_deck,
    delete_deck,
)


VALID_DECK_TYPES = ["Standard", "Stride"]


# -----------------------------
# Page styling
# -----------------------------
def inject_page_styles():
    st.markdown(
        """
        <style>
            /* Tighten the page a little */
            .block-container {
                padding-top: 2.25rem;
                padding-bottom: 3rem;
                max-width: 1500px;
            }

            /* Softer section cards */
            div[data-testid="stVerticalBlockBorderWrapper"] {
                border-radius: 14px;
            }

            /* Reduce vertical breathing room inside rows */
            div[data-testid="stHorizontalBlock"] {
                align-items: center;
            }

            /* Make captions a bit calmer */
            .stCaptionContainer {
                color: rgba(250, 250, 250, 0.62);
            }

            /* Subtle helper text */
            .muted-note {
                color: rgba(250, 250, 250, 0.60);
                font-size: 0.92rem;
                margin-top: -0.35rem;
                margin-bottom: 0.75rem;
            }

            /* Small pill badges */
            .deck-pill {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: 0.35rem 0.65rem;
                border: 1px solid rgba(250, 250, 250, 0.15);
                border-radius: 999px;
                font-size: 0.85rem;
                font-weight: 600;
                background: rgba(250, 250, 250, 0.045);
                white-space: nowrap;
            }

            .record-text {
                font-size: 0.95rem;
                font-weight: 600;
            }

            .record-subtext {
                color: rgba(250, 250, 250, 0.58);
                font-size: 0.82rem;
                margin-top: 0.10rem;
            }

            .row-label {
                color: rgba(250, 250, 250, 0.58);
                font-size: 0.78rem;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.035em;
                margin-bottom: 0.25rem;
            }

            /* Hide extra empty label spacing where Streamlit insists on labels */
            label[data-testid="stWidgetLabel"] {
                min-height: 1rem;
            }
        </style>
        """,
        unsafe_allow_html=True,
    )


# -----------------------------
# Delete confirmation dialog
# -----------------------------
def show_delete_dialog(deck_id: int, deck_name: str):
    @st.dialog("Confirm delete")
    def _dialog():
        st.error(
            "This will permanently remove the deck.\n\n"
            "If the deck has match history, deletion will be blocked.\n"
            "You can set the deck to Inactive instead."
        )

        st.write(f"Deck: **{deck_name}**")
        st.caption(f"Deck ID: {deck_id}")

        confirm_text = st.text_input(
            "Type the deck name to confirm",
            placeholder=deck_name,
        )

        col_cancel, col_delete = st.columns(2)

        with col_cancel:
            if st.button("Cancel", width="stretch"):
                st.rerun()

        with col_delete:
            disabled = confirm_text.strip() != deck_name.strip()

            if st.button(
                "Delete",
                type="primary",
                disabled=disabled,
                width="stretch",
            ):
                try:
                    delete_deck(deck_id)
                    st.success(f"Deleted {deck_name}")
                    st.rerun()
                except Exception as e:
                    st.error(str(e))

    _dialog()


# -----------------------------
# Page setup
# -----------------------------
st.set_page_config(page_title="Deck Manager", page_icon="🗂️", layout="wide")
inject_page_styles()

st.title("🗂️ Deck Manager")
settings_expander()


# -----------------------------
# Add deck
# -----------------------------
st.subheader("Add a deck")

with st.form("add_deck_form", clear_on_submit=True):
    col_name, col_type, col_active, col_submit = st.columns([5, 2, 1.3, 1.8])

    with col_name:
        new_name = st.text_input("Name", placeholder="Example: Blangdmire")

    with col_type:
        new_type = st.selectbox("Type", VALID_DECK_TYPES, index=0)

    with col_active:
        st.write("")
        new_active = st.checkbox("Active", value=True)

    with col_submit:
        st.write("")
        submitted = st.form_submit_button("➕ Add", width="stretch")

    if submitted:
        name = new_name.strip()

        if not name:
            st.warning("Deck name cannot be empty.")
        else:
            try:
                add_deck(name, new_type, new_active)
                st.success(f"Added deck: {name}")
                st.rerun()
            except Exception as e:
                st.error(str(e))


st.divider()


# -----------------------------
# Fetch decks
# -----------------------------
try:
    decks = fetch_decks(include_inactive=True)
except Exception as e:
    st.error(str(e))
    decks = []


# -----------------------------
# Manage decks
# -----------------------------
st.subheader("Deck Library")

if not decks:
    st.info("No decks yet.")
    st.stop()


active_count = sum(1 for d in decks if d.get("active", True))
inactive_count = len(decks) - active_count

metric_1, metric_2, metric_3 = st.columns(3)
metric_1.metric("Total Decks", len(decks))
metric_2.metric("Active", active_count)
metric_3.metric("Inactive", inactive_count)

st.markdown(
    '<div class="muted-note">Set old decks to inactive instead of deleting them if they have match history.</div>',
    unsafe_allow_html=True,
)


# Header row
header_cols = st.columns([4.2, 1.25, 1.7, 1.25, 1.8])
header_cols[0].markdown('<div class="row-label">Deck</div>', unsafe_allow_html=True)
header_cols[1].markdown('<div class="row-label">Type</div>', unsafe_allow_html=True)
header_cols[2].markdown('<div class="row-label">Record</div>', unsafe_allow_html=True)
header_cols[3].markdown('<div class="row-label">Status</div>', unsafe_allow_html=True)
header_cols[4].markdown('<div class="row-label">Actions</div>', unsafe_allow_html=True)


for d in decks:
    deck_id = d["id"]
    original_name = d["name"]
    deck_type = d["type"]
    active = d.get("active", True)

    name_key = f"name_{deck_id}"
    active_key = f"active_{deck_id}"

    if name_key not in st.session_state:
        st.session_state[name_key] = original_name

    if active_key not in st.session_state:
        st.session_state[active_key] = active

    wins = int(d.get("wins", 0) or 0)
    losses = int(d.get("losses", 0) or 0)
    games = wins + losses
    win_pct = (wins / games * 100.0) if games else 0.0

    with st.container(border=True):
        col_name, col_type, col_record, col_active, col_actions = st.columns(
            [4.2, 1.25, 1.7, 1.25, 1.8]
        )

        with col_name:
            st.text_input(
                "Deck name",
                key=name_key,
                label_visibility="collapsed",
            )

        with col_type:
            st.markdown(
                f'<span class="deck-pill">{deck_type}</span>',
                unsafe_allow_html=True,
            )

        with col_record:
            st.markdown(
                f"""
                <div class="record-text">{wins}-{losses}</div>
                <div class="record-subtext">{games} games · {win_pct:.1f}%</div>
                """,
                unsafe_allow_html=True,
            )

        with col_active:

            def _toggle(deck_id=deck_id, key=active_key):
                try:
                    update_deck(deck_id, active=st.session_state[key])
                    st.toast("Saved ✔")
                except Exception as e:
                    st.session_state[key] = not st.session_state[key]
                    st.error(str(e))

            st.checkbox(
                "Active",
                key=active_key,
                on_change=_toggle,
            )

        with col_actions:
            save_col, delete_col = st.columns([1, 1])

            with save_col:
                if st.button("Save", key=f"save_{deck_id}", width="stretch"):
                    try:
                        new_value = st.session_state[name_key].strip()

                        if not new_value:
                            st.warning("Name cannot be empty.")
                        elif new_value == original_name:
                            st.toast("No changes to save.")
                        else:
                            update_deck(deck_id, name=new_value)
                            st.toast("Renamed ✔")
                            st.rerun()
                    except Exception as e:
                        st.error(str(e))

            with delete_col:
                if st.button("🗑️", key=f"delete_{deck_id}", width="stretch"):
                    show_delete_dialog(deck_id, original_name)