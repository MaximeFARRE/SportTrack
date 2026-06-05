import { SupabaseClient } from "@supabase/supabase-js"

export type GroupMemberWithProfile = {
  group_id: string
  user_id: string
  role: "admin" | "coach" | "athlete"
  target_time_sec: number | null
  created_at: string
  profiles: {
    display_name: string | null
    avatar_url: string | null
    email: string
  } | null
}

export type GroupMember = Omit<GroupMemberWithProfile, "profiles">

export type Group = {
  id: string
  name: string
  description: string | null
  target_event_name: string
  target_event_date: string
  target_distance_km: number
  invite_code: string
  created_by: string
  created_at: string
}

export async function getGroupById(supabase: SupabaseClient, groupId: string): Promise<Group | null> {
  const { data, error } = await supabase
    .from("groups")
    .select("*")
    .eq("id", groupId)
    .maybeSingle()

  if (error) {
    console.error("Error fetching group:", error)
    return null
  }
  return data
}

export async function getGroupMember(
  supabase: SupabaseClient,
  groupId: string,
  userId: string
): Promise<GroupMember | null> {
  const { data, error } = await supabase
    .from("group_members")
    .select("group_id, user_id, role, target_time_sec, created_at")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle()

  if (error) {
    console.error("Error fetching group member:", error)
    return null
  }
  return data
}

export async function getGroupMembers(supabase: SupabaseClient, groupId: string): Promise<GroupMemberWithProfile[]> {
  const { data, error } = await supabase
    .from("group_members")
    .select(`
      group_id,
      user_id,
      role,
      target_time_sec,
      created_at,
      profiles (
        display_name,
        avatar_url,
        email
      )
    `)
    .eq("group_id", groupId)

  if (error) {
    console.error("Error fetching group members:", error)
    return []
  }
  return (data as any) || []
}

export async function getUserGroups(supabase: SupabaseClient, userId: string): Promise<Group[]> {
  const { data, error } = await supabase
    .from("group_members")
    .select("groups (*)")
    .eq("user_id", userId)

  if (error) {
    console.error("Error fetching user groups:", error)
    return []
  }

  return (data?.map((row: any) => row.groups).filter(Boolean) as Group[]) || []
}

export async function getGroupActivities(
  supabase: SupabaseClient,
  groupId: string,
  daysAgo: number = 28
): Promise<any[]> {
  // 1. Obtenir les IDs des membres du groupe
  const { data: members, error: membersError } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)

  if (membersError || !members) {
    console.error("Error fetching group member IDs:", membersError)
    return []
  }

  const userIds = members.map((m) => m.user_id)
  if (userIds.length === 0) return []

  // 2. Obtenir les activités récentes de ces membres
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - daysAgo)

  const { data: activities, error: activitiesError } = await supabase
    .from("activities")
    .select("*, profiles:user_id(display_name, avatar_url)")
    .in("user_id", userIds)
    .gte("start_date", cutoff.toISOString())
    .order("start_date", { ascending: false })

  if (activitiesError) {
    console.error("Error fetching group activities:", activitiesError)
    return []
  }

  return activities || []
}

export async function getGroupPlannedSessions(supabase: SupabaseClient, groupId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from("group_planned_sessions")
    .select("*")
    .eq("group_id", groupId)
    .order("planned_date", { ascending: true })

  if (error) {
    console.error("Error fetching group planned sessions:", error)
    return []
  }
  return data || []
}

export async function getGroupTrainingBlocks(supabase: SupabaseClient, groupId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from("group_training_blocks")
    .select("*")
    .eq("group_id", groupId)
    .order("start_date", { ascending: true })

  if (error) {
    console.error("Error fetching group training blocks:", error)
    return []
  }
  return data || []
}
