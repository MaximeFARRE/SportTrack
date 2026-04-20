import pandas as pd
import streamlit as st

from ui.api_client import add_group_member, create_group, list_group_members, list_groups, remove_group_member
from ui.session import require_login


st.set_page_config(page_title="Groupes", page_icon="👥", layout="wide")
st.title("Groupes")

user = require_login()
actor_user_id = user["id"]

with st.expander("Creer un groupe", expanded=False):
    with st.form("create_group_form"):
        name = st.text_input("Nom du groupe")
        description = st.text_area("Description", height=100)
        submit_group = st.form_submit_button("Creer")

    if submit_group:
        try:
            created_group = create_group(
                name=name,
                description=description or None,
                owner_user_id=actor_user_id,
            )
            st.success(f"Groupe cree: #{created_group['id']} - {created_group['name']}")
        except RuntimeError as exc:
            st.error(str(exc))

try:
    groups = list_groups(user_id=actor_user_id)
except RuntimeError as exc:
    st.error(str(exc))
    st.stop()

if not groups:
    st.info("Aucun groupe pour le moment.")
    st.stop()

group_map = {f"#{g['id']} - {g['name']}": g for g in groups}
selected_group_label = st.selectbox("Mes groupes", list(group_map.keys()))
selected_group = group_map[selected_group_label]
group_id = selected_group["id"]

st.write(f"Owner: {selected_group['owner_user_id']}")
st.write(f"Description: {selected_group.get('description') or '-'}")

try:
    members = list_group_members(group_id=group_id, actor_user_id=actor_user_id)
except RuntimeError as exc:
    st.error(str(exc))
    st.stop()

st.subheader("Membres actifs")
if members:
    members_df = pd.DataFrame(members)
    st.dataframe(members_df, use_container_width=True)
else:
    st.info("Aucun membre actif.")

st.subheader("Ajouter un membre")
with st.form("add_member_form"):
    member_user_id = st.number_input("user_id a ajouter", min_value=1, step=1)
    member_role = st.selectbox("Role", ["member", "owner"])
    submit_add = st.form_submit_button("Ajouter")

if submit_add:
    try:
        added = add_group_member(
            group_id=group_id,
            user_id=int(member_user_id),
            actor_user_id=actor_user_id,
            role=member_role,
        )
        st.success(f"Membre ajoute: user_id={added['user_id']}")
        st.rerun()
    except RuntimeError as exc:
        st.error(str(exc))

st.subheader("Retirer un membre")
if members:
    removable_options = [m for m in members if m["user_id"] != actor_user_id]
    if removable_options:
        remove_map = {f"user_id={m['user_id']} ({m['role']})": m for m in removable_options}
        remove_label = st.selectbox("Membre a retirer", list(remove_map.keys()))
        if st.button("Retirer"):
            selected_member = remove_map[remove_label]
            try:
                remove_group_member(
                    group_id=group_id,
                    user_id=selected_member["user_id"],
                    actor_user_id=actor_user_id,
                )
                st.success("Membre retire.")
                st.rerun()
            except RuntimeError as exc:
                st.error(str(exc))
    else:
        st.info("Aucun membre retirable (owner uniquement).")
