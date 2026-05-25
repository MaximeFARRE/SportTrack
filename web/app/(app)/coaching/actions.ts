"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

// Génère un code d'invitation aléatoire de 6 caractères majuscules
function generateInviteCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  let code = ""
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

export async function createGroup(payload: {
  name: string
  description?: string
  targetEventName: string
  targetEventDate: string
  targetDistanceKm: number
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: "Non authentifié" }

  const inviteCode = generateInviteCode()

  // 1. Créer le groupe
  const { data: group, error: groupError } = await supabase
    .from("groups")
    .insert({
      name: payload.name,
      description: payload.description || null,
      target_event_name: payload.targetEventName,
      target_event_date: payload.targetEventDate,
      target_distance_km: payload.targetDistanceKm,
      invite_code: inviteCode,
      created_by: user.id,
    })
    .select()
    .single()

  if (groupError || !group) {
    return { error: groupError?.message || "Erreur lors de la création du groupe" }
  }

  // 2. Ajouter le créateur comme membre admin
  const { error: memberError } = await supabase.from("group_members").insert({
    group_id: group.id,
    user_id: user.id,
    role: "admin",
  })

  if (memberError) {
    return { error: memberError.message }
  }

  revalidatePath("/coaching")
  return { success: true, groupId: group.id }
}

export async function joinGroup(inviteCode: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: "Non authentifié" }

  const codeUpper = inviteCode.trim().toUpperCase()

  // 1. Trouver le groupe par son code
  const { data: group, error: groupError } = await supabase
    .from("groups")
    .select("id")
    .eq("invite_code", codeUpper)
    .maybeSingle()

  if (groupError) return { error: groupError.message }
  if (!group) return { error: "Code d'invitation introuvable" }

  // 2. Ajouter l'utilisateur au groupe
  const { error: memberError } = await supabase.from("group_members").insert({
    group_id: group.id,
    user_id: user.id,
    role: "athlete",
  })

  if (memberError) {
    // Si l'utilisateur est déjà membre
    if (memberError.code === "23505") {
      return { error: "Vous faites déjà partie de ce groupe" }
    }
    return { error: memberError.message }
  }

  revalidatePath("/coaching")
  revalidatePath(`/coaching/${group.id}`)
  return { success: true, groupId: group.id }
}

export async function updateGroupMemberTargetTime(groupId: string, targetTimeSec: number | null) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: "Non authentifié" }

  const { error } = await supabase
    .from("group_members")
    .update({ target_time_sec: targetTimeSec })
    .eq("group_id", groupId)
    .eq("user_id", user.id)

  if (error) return { error: error.message }

  revalidatePath(`/coaching/${groupId}`)
  return { success: true }
}

export async function promoteMemberToCoach(groupId: string, targetUserId: string, newRole: "coach" | "athlete") {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: "Non authentifié" }

  // Vérifier que l'appelant est admin ou coach du groupe
  const { data: callingMember } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (!callingMember || callingMember.role !== "admin") {
    return { error: "Seul l'administrateur du groupe peut promouvoir des membres" }
  }

  const { error } = await supabase
    .from("group_members")
    .update({ role: newRole })
    .eq("group_id", groupId)
    .eq("user_id", targetUserId)

  if (error) return { error: error.message }

  revalidatePath(`/coaching/${groupId}`)
  return { success: true }
}

export async function createGroupPlannedSession(
  groupId: string,
  payload: {
    planned_date: string
    planned_time?: string
    sport_type: string
    session_type: string
    planned_duration_min: number | null
    planned_distance_km: number | null
    description: string | null
  }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: "Non authentifié" }

  // Vérifier les droits de coach/admin
  const { data: callingMember } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (!callingMember || (callingMember.role !== "admin" && callingMember.role !== "coach")) {
    return { error: "Seuls les coachs ou l'administrateur peuvent planifier des séances" }
  }

  const { error } = await supabase.from("group_planned_sessions").insert({
    group_id: groupId,
    created_by: user.id,
    ...payload,
  })

  if (error) return { error: error.message }

  revalidatePath(`/coaching/${groupId}`)
  revalidatePath("/planning")
  revalidatePath("/calendar")
  return { success: true }
}

export async function deleteGroupPlannedSession(groupId: string, sessionId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: "Non authentifié" }

  // Vérifier les droits de coach/admin
  const { data: callingMember } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (!callingMember || (callingMember.role !== "admin" && callingMember.role !== "coach")) {
    return { error: "Seuls les coachs ou l'administrateur peuvent supprimer des séances" }
  }

  // 1. Supprimer les séances individuelles associées qui ne sont pas commencées (status = planned)
  await supabase
    .from("planned_sessions")
    .delete()
    .eq("group_planned_session_id", sessionId)
    .eq("status", "planned")

  // 2. Supprimer la séance collective
  const { error } = await supabase
    .from("group_planned_sessions")
    .delete()
    .eq("id", sessionId)

  if (error) return { error: error.message }

  revalidatePath(`/coaching/${groupId}`)
  revalidatePath("/planning")
  revalidatePath("/calendar")
  return { success: true }
}

export async function createGroupTrainingBlock(
  groupId: string,
  payload: {
    name: string
    start_date: string
    end_date: string
  }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: "Non authentifié" }

  // Vérifier les droits de coach/admin
  const { data: callingMember } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (!callingMember || (callingMember.role !== "admin" && callingMember.role !== "coach")) {
    return { error: "Seuls les coachs ou l'administrateur peuvent créer des blocs" }
  }

  const { error } = await supabase.from("group_training_blocks").insert({
    group_id: groupId,
    created_by: user.id,
    ...payload,
  })

  if (error) return { error: error.message }

  revalidatePath(`/coaching/${groupId}`)
  revalidatePath("/planning")
  return { success: true }
}

export async function deleteGroupTrainingBlock(groupId: string, blockId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: "Non authentifié" }

  // Vérifier les droits de coach/admin
  const { data: callingMember } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (!callingMember || (callingMember.role !== "admin" && callingMember.role !== "coach")) {
    return { error: "Seuls les coachs ou l'administrateur peuvent supprimer des blocs" }
  }

  const { error } = await supabase
    .from("group_training_blocks")
    .delete()
    .eq("id", blockId)

  if (error) return { error: error.message }

  revalidatePath(`/coaching/${groupId}`)
  revalidatePath("/planning")
  return { success: true }
}

export async function leaveGroup(groupId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: "Non authentifié" }

  // Supprimer l'utilisateur du groupe
  const { error } = await supabase
    .from("group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", user.id)

  if (error) return { error: error.message }

  revalidatePath("/coaching")
  return { success: true }
}
