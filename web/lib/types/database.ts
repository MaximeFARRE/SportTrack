/**
 * Placeholder for Supabase-generated types.
 *
 * Once the project is connected to Supabase, regenerate with:
 *   supabase gen types typescript --project-id <id> > lib/types/database.ts
 *
 * Until then, this minimal shape lets clients compile against `Database`.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          display_name: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          display_name?: string | null
          avatar_url?: string | null
        }
        Update: {
          display_name?: string | null
          avatar_url?: string | null
        }
        Relationships: []
      }
      athlete_profiles: {
        Row: {
          id: string
          user_id: string
          first_name: string | null
          last_name: string | null
          birth_date: string | null
          gender: "male" | "female" | "other" | "prefer_not_to_say" | null
          height_cm: number | null
          weight_kg: number | null
          hr_max: number | null
          hr_rest: number | null
          vma_kmh: number | null
          ftp_watts: number | null
          css_pace_per_100m: string | null
          primary_sport: string | null
          practiced_sports: string[]
          training_years: number | null
          weekly_target_hours: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          first_name?: string | null
          last_name?: string | null
          birth_date?: string | null
          gender?: "male" | "female" | "other" | "prefer_not_to_say" | null
          height_cm?: number | null
          weight_kg?: number | null
          hr_max?: number | null
          hr_rest?: number | null
          vma_kmh?: number | null
          ftp_watts?: number | null
          css_pace_per_100m?: string | null
          primary_sport?: string | null
          practiced_sports?: string[]
          training_years?: number | null
          weekly_target_hours?: number | null
        }
        Update: {
          first_name?: string | null
          last_name?: string | null
          birth_date?: string | null
          gender?: "male" | "female" | "other" | "prefer_not_to_say" | null
          height_cm?: number | null
          weight_kg?: number | null
          hr_max?: number | null
          hr_rest?: number | null
          vma_kmh?: number | null
          ftp_watts?: number | null
          css_pace_per_100m?: string | null
          primary_sport?: string | null
          practiced_sports?: string[]
          training_years?: number | null
          weekly_target_hours?: number | null
        }
        Relationships: []
      }
      hr_zones: {
        Row: {
          id: string
          user_id: string
          zone_number: number
          zone_name: string
          hr_min: number
          hr_max: number | null
          pct_min: number
          pct_max: number | null
          is_custom: boolean
          color_hex: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          zone_number: number
          zone_name: string
          hr_min: number
          hr_max?: number | null
          pct_min: number
          pct_max?: number | null
          is_custom?: boolean
          color_hex: string
        }
        Update: {
          zone_name?: string
          hr_min?: number
          hr_max?: number | null
          pct_min?: number
          pct_max?: number | null
          is_custom?: boolean
          color_hex?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
