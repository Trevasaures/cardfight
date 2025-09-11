"""
Page for managing decks
- Add, rename, toggle active, delete
"""
import streamlit as st
from common import settings_expander, fetch_decks, add_deck, update_deck, delete_deck


# --- Delete confirmation dialog ---
def show_delete_dialog(deck_id: int, deck_name: str):
    @st.dialog("Confirm delete")
    def _dialog():
        st.error(
            "This will permanently remove the deck.\n\n"
            "If the deck has match history, deletion will be blocked.\n"
            "You can set it Inactive instead."
        )
        st.write(f"Deck: **{deck_name}** (id: {deck_id})")

        confirm_text = st.text_input("Type the deck name to confirm")
        colA, colB = st.columns(2)
        with colA:
            if st.button("Cancel"):
                st.rerun()
        with colB:
            disabled = confirm_text.strip() != deck_name.strip()
            if st.button("Delete", type="primary", disabled=disabled):
                try:
                    delete_deck(deck_id)
                    st.success(f"Deleted {deck_name}")
                    st.rerun()
                except Exception as e:
                    st.error(str(e))
    _dialog()

st.set_page_config(page_title="Deck Manager", page_icon="🗂️", layout="wide")
st.title("🗂️ Deck Manager")

settings_expander()


# --- Add Deck ---
with st.form("add_deck_form", clear_on_submit=True):
    st.markdown("### Add a deck")
    new_name = st.text_input("Name")
    new_type = st.selectbox("Type", ["Standard", "Stride"], index=0)
    new_active = st.checkbox("Active", value=True)
    submitted = st.form_submit_button("➕ Add Deck")
    if submitted:
        try:
            add_deck(new_name.strip(), new_type, new_active)
            st.success(f"Added deck: {new_name}")
            st.rerun()
        except Exception as e:
            st.error(str(e))

st.divider()


# --- Manage Decks ---
try:
    decks = fetch_decks(include_inactive=True)
except Exception as e:
    st.error(str(e))
    decks = []

if not decks:
    st.info("No decks yet.")
else:
    for d in decks:
        col1, col2, col3, col4 = st.columns([4, 2, 2, 2])
        with col1:
            key = f"name_{d['id']}"
            if key not in st.session_state:
                st.session_state[key] = d["name"]
            st.text_input("Name", key=key, label_visibility="collapsed")

        with col2:
            st.markdown(f"Type: `{d['type']}`")

        with col3:
            akey = f"active_{d['id']}"
            if akey not in st.session_state:
                st.session_state[akey] = d.get("active", True)

            def _toggle(deck_id=d["id"], key=akey):
                try:
                    update_deck(deck_id, active=st.session_state[key])
                    st.toast("Saved ✔")
                except Exception as e:
                    st.session_state[key] = not st.session_state[key]
                    st.error(str(e))

            st.checkbox("Active", key=akey, on_change=_toggle)

        with col4:
            cA, cB = st.columns(2)
            with cA:
                if st.button("Save", key=f"save_{d['id']}"):
                    try:
                        val = st.session_state[f"name_{d['id']}"].strip()
                        if not val:
                            st.warning("Name cannot be empty.")
                        elif val != d["name"]:
                            update_deck(d["id"], name=val)
                            st.toast("Renamed ✔")
                            st.rerun()
                    except Exception as e:
                        st.error(str(e))
            with cB:
                if st.button("🗑️", key=f"del_{d['id']}"):
                    show_delete_dialog(d["id"], d["name"])


# --- Delete confirmation modal ---
if st.session_state.get("show_delete_modal"):
    deck_id = st.session_state.get("delete_target_id")
    deck_name = st.session_state.get("delete_target_name", "")

    with st.dialog("Confirm delete"):
        st.error(
            "This will permanently remove the deck. "
            "If the deck has match history, deletion will be blocked. "
            "You can set it Inactive instead."
        )
        st.write(f"Deck: **{deck_name}** (id: {deck_id})")

        confirm_text = st.text_input("Type the deck name to confirm")
        colA, colB = st.columns(2)

        with colA:
            if st.button("Cancel"):
                st.session_state.pop("show_delete_modal", None)
                st.session_state.pop("delete_target_id", None)
                st.session_state.pop("delete_target_name", None)
                st.rerun()

        with colB:
            disabled = (confirm_text.strip() != (deck_name or "").strip())
            if st.button("Delete", type="primary", disabled=disabled):
                try:
                    # call your existing helper
                    from common import delete_deck
                    delete_deck(deck_id)
                    st.session_state.pop("show_delete_modal", None)
                    st.session_state.pop("delete_target_id", None)
                    st.session_state.pop("delete_target_name", None)
                    st.success(f"Deleted {deck_name}")
                    st.rerun()
                except Exception as e:
                    st.error(str(e))