import streamlit as st

def show_saved_dialog():
    """
    If st.session_state["__saved_match__"] exists, show a modal and return True.
    Caller can st.stop() after this returns True.
    """
    payload = st.session_state.get("__saved_match__")
    if not payload:
        return False

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

        # Left-close, big spacer, right-view
        col_left, col_spacer, col_right = st.columns([3, 7, 3])

        with col_left:
            if st.button("Close", type="primary", key="dlg_close", width="content"):
                st.session_state.pop("__saved_match__", None)
                st.rerun()

        with col_right:
            if st.button("View stats", key="dlg_view_stats", help="Open the Stats page", width="content"):
                st.session_state.pop("__saved_match__", None)
                st.switch_page("pages/3_Stats.py")

    _dialog()
    return True