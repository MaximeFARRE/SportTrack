"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"

export type CreateSessionPayload = {
  planned_date: string
  sport_type: string
  session_type: string
  planned_duration_min: number | null
  description: string | null
}

export async function createPlannedSession(payload: CreateSessionPayload) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Non authentifié" }

  const { error } = await supabase.from("planned_sessions").insert({
    user_id: user.id,
    ...payload,
  })

  if (error) return { error: error.message }
  revalidatePath("/planning")
  revalidatePath("/calendar")
  return { success: true }
}

export async function movePlannedSession(id: string, newDate: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Non authentifié" }

  const { error } = await supabase
    .from("planned_sessions")
    .update({ planned_date: newDate })
    .eq("id", id)
    .eq("user_id", user.id)

  if (error) return { error: error.message }
  revalidatePath("/planning")
  return { success: true }
}

export async function deletePlannedSession(id: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Non authentifié" }

  const { error } = await supabase
    .from("planned_sessions")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)

  if (error) return { error: error.message }
  revalidatePath("/planning")
  revalidatePath("/calendar")
  return { success: true }
}

export type CreateBlockPayload = {
  name: string
  start_date: string
  end_date: string
}

export async function createTrainingBlock(payload: CreateBlockPayload) {
  const supabase = (await createClient()) as any
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Non authentifié" }

  const { error } = await supabase.from("training_blocks").insert({
    user_id: user.id,
    ...payload,
  })

  if (error) return { error: error.message }
  revalidatePath("/planning")
  return { success: true }
}

export async function deleteTrainingBlock(id: string) {
  const supabase = (await createClient()) as any
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Non authentifié" }

  const { error } = await supabase
    .from("training_blocks")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)

  if (error) return { error: error.message }
  revalidatePath("/planning")
  return { success: true }
}

export type CreateGoalPayload = {
  type: "race" | "weekly_volume" | "weekly_workouts"
  name: string
  target_date?: string | null
  target_value?: number | null
}

export async function createTrainingGoal(payload: CreateGoalPayload) {
  const supabase = (await createClient()) as any
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Non authentifié" }

  const { error } = await supabase.from("training_goals").insert({
    user_id: user.id,
    ...payload,
  })

  if (error) return { error: error.message }
  revalidatePath("/planning")
  return { success: true }
}

export async function deleteTrainingGoal(id: string) {
  const supabase = (await createClient()) as any
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Non authentifié" }

  const { error } = await supabase
    .from("training_goals")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)

  if (error) return { error: error.message }
  revalidatePath("/planning")
  return { success: true }
}

