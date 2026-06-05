import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import {
  getGroupActivities,
  getGroupById,
  getGroupMember,
  getGroupMembers,
  getGroupPlannedSessions,
  getGroupTrainingBlocks,
} from "@/lib/server/groups"
import { GroupDashboardClient } from "./group-dashboard-client"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const group = await getGroupById(supabase, id)

  return {
    title: group ? `${group.name} · SportTrack` : "Groupe · SportTrack",
  }
}

export default async function GroupPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: groupId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  // 1. Charger le groupe et vérifier son existence
  const group = await getGroupById(supabase, groupId)
  if (!group) notFound()

  // 2. Vérifier l'appartenance avec une requête dédiée au membre courant
  const currentMember = await getGroupMember(supabase, groupId, user.id)
  if (!currentMember) {
    // Si l'utilisateur n'est pas membre, retour à l'accueil coaching
    redirect("/coaching")
  }

  // 3. Charger le reste des données du groupe
  const [members, activities, groupSessions, groupBlocks] = await Promise.all([
    getGroupMembers(supabase, groupId),
    getGroupActivities(supabase, groupId),
    getGroupPlannedSessions(supabase, groupId),
    getGroupTrainingBlocks(supabase, groupId),
  ])

  return (
    <GroupDashboardClient
      group={group}
      members={members}
      activities={activities}
      groupSessions={groupSessions}
      groupBlocks={groupBlocks}
      currentUserId={user.id}
      currentUserRole={currentMember.role}
    />
  )
}
