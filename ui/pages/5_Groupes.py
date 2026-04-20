import streamlit as st

from app.db import get_db
from app.services.group_service import (
    add_member_to_group,
    create_group,
    list_group_members,
    list_groups_for_user,
    remove_member_from_group,
)
from app.schemas.group import GroupCreate
from ui.session import require_login


st.set_page_config(page_title="Groupes", page_icon="👥", layout="wide")
st.title("Groupes")

user = require_login()
user_id = user["id"]

with st.expander("Creer un groupe", expanded=False):
    with st.form("create_group_form"):
        name = st.text_input("Nom du groupe")
        description = st.text_area("Description", height=100)
        submit_group = st.form_submit_button("Creer")

    if submit_group:
        try:
            with get_db() as session:
                group = create_group(session=session, payload=GroupCreate(
                    name=name, description=description or None, owner_user_id=user_id
                ))
            st.success(f"Groupe cree : #{group.id} — {group.name}")
        except Exception as exc:
            st.error(str(exc))

with get_db() as session:
    groups = list_groups_for_user(session=session, user_id=user_id)

if not groups:
    st.info("Aucun groupe pour le moment.")
    st.stop()

group_map = {f"#{g.id} — {g.name}": g for g in groups}
selected_label = st.selectbox("Mes groupes", list(group_map.keys()))
selected_group = group_map[selected_label]

st.write(f"Description : {selected_group.description or '—'}")

with get_db() as session:
    members = list_group_members(session=session, group_id=selected_group.id)

st.subheader("Membres actifs")
if members:
    for m in members:
        st.write(f"- user_id={m.user_id} ({m.role})")
else:
    st.info("Aucun membre actif.")

st.subheader("Ajouter un membre")
with st.form("add_member_form"):
    member_user_id = st.number_input("user_id a ajouter", min_value=1, step=1)
    member_role = st.selectbox("Role", ["member", "owner"])
    submit_add = st.form_submit_button("Ajouter")

if submit_add:
    try:
        with get_db() as session:
            added = add_member_to_group(session=session, group_id=selected_group.id,
                                        user_id=int(member_user_id), role=member_role)
        st.success(f"Membre ajoute : user_id={added.user_id}")
        st.rerun()
    except Exception as exc:
        st.error(str(exc))

st.subheader("Retirer un membre")
removable = [m for m in members if m.user_id != user_id]
if removable:
    remove_map = {f"user_id={m.user_id} ({m.role})": m for m in removable}
    remove_label = st.selectbox("Membre a retirer", list(remove_map.keys()))
    if st.button("Retirer"):
        try:
            with get_db() as session:
                remove_member_from_group(session=session, group_id=selected_group.id,
                                         user_id=remove_map[remove_label].user_id)
            st.success("Membre retire.")
            st.rerun()
        except Exception as exc:
            st.error(str(exc))
else:
    st.info("Aucun membre retirable.")
