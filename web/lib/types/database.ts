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
          is_admin: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          display_name?: string | null
          avatar_url?: string | null
          is_admin?: boolean
        }
        Update: {
          display_name?: string | null
          avatar_url?: string | null
          is_admin?: boolean
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
      provider_connections: {
        Row: {
          id: string
          user_id: string
          provider: "strava" | "terra"
          provider_user_id: string
          access_token: string | null
          refresh_token: string | null
          token_expires_at: number | null
          scopes: string[] | null
          is_active: boolean
          last_sync_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          provider: "strava" | "terra"
          provider_user_id: string
          access_token?: string | null
          refresh_token?: string | null
          token_expires_at?: number | null
          scopes?: string[] | null
          is_active?: boolean
          last_sync_at?: string | null
        }
        Update: {
          access_token?: string | null
          refresh_token?: string | null
          token_expires_at?: number | null
          scopes?: string[] | null
          is_active?: boolean
          last_sync_at?: string | null
        }
        Relationships: []
      }
      activities: {
        Row: {
          id: string
          user_id: string
          provider: string
          provider_activity_id: string
          name: string | null
          sport_type: string
          start_date: string
          timezone: string | null
          duration_sec: number | null
          moving_time_sec: number | null
          distance_m: number | null
          elevation_gain_m: number | null
          average_speed: number | null
          max_speed: number | null
          average_heartrate: number | null
          max_heartrate: number | null
          average_cadence: number | null
          average_power: number | null
          calories: number | null
          raw_data_json: Json | null
          source: string
          rpe: number | null
          feel_score: number | null
          motivation_score: number | null
          perceived_recovery: number | null
          post_session_notes: string | null
          body_feeling_tags: Json
          context_tags: Json
          session_quality_tags: Json
          temperature_c: number | null
          weather_condition: string | null
          time_in_zones_json: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          provider: string
          provider_activity_id: string
          name?: string | null
          sport_type: string
          start_date: string
          timezone?: string | null
          duration_sec?: number | null
          moving_time_sec?: number | null
          distance_m?: number | null
          elevation_gain_m?: number | null
          average_speed?: number | null
          max_speed?: number | null
          average_heartrate?: number | null
          max_heartrate?: number | null
          average_cadence?: number | null
          average_power?: number | null
          calories?: number | null
          raw_data_json?: Json | null
          source?: string
          rpe?: number | null
          feel_score?: number | null
          motivation_score?: number | null
          perceived_recovery?: number | null
          post_session_notes?: string | null
          body_feeling_tags?: Json
          context_tags?: Json
          session_quality_tags?: Json
          temperature_c?: number | null
          weather_condition?: string | null
          time_in_zones_json?: Json | null
        }
        Update: {
          name?: string | null
          sport_type?: string
          duration_sec?: number | null
          moving_time_sec?: number | null
          distance_m?: number | null
          elevation_gain_m?: number | null
          average_speed?: number | null
          max_speed?: number | null
          average_heartrate?: number | null
          max_heartrate?: number | null
          average_cadence?: number | null
          average_power?: number | null
          calories?: number | null
          raw_data_json?: Json | null
          rpe?: number | null
          feel_score?: number | null
          motivation_score?: number | null
          perceived_recovery?: number | null
          post_session_notes?: string | null
          body_feeling_tags?: Json
          context_tags?: Json
          session_quality_tags?: Json
          temperature_c?: number | null
          weather_condition?: string | null
          time_in_zones_json?: Json | null
        }
        Relationships: []
      }
      daily_metrics: {
        Row: {
          id: string
          user_id: string
          metric_date: string
          sessions_count: number | null
          duration_sec: number | null
          distance_m: number | null
          elevation_gain_m: number | null
          training_load: number | null
          resting_hr: number | null
          hrv_rmssd: number | null
          hrv_status: "balanced" | "low" | "unbalanced" | "poor" | "no_status" | null
          sleep_score: number | null
          sleep_duration_min: number | null
          sleep_deep_min: number | null
          sleep_rem_min: number | null
          sleep_light_min: number | null
          sleep_awake_min: number | null
          body_battery_morning: number | null
          body_battery_evening: number | null
          training_readiness: number | null
          stress_score_avg: number | null
          spo2_avg: number | null
          respiration_avg: number | null
          vo2max_estimated: number | null
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          metric_date: string
          sessions_count?: number | null
          duration_sec?: number | null
          distance_m?: number | null
          elevation_gain_m?: number | null
          training_load?: number | null
          resting_hr?: number | null
          hrv_rmssd?: number | null
          hrv_status?: "balanced" | "low" | "unbalanced" | "poor" | "no_status" | null
          sleep_score?: number | null
          sleep_duration_min?: number | null
          sleep_deep_min?: number | null
          sleep_rem_min?: number | null
          sleep_light_min?: number | null
          sleep_awake_min?: number | null
          body_battery_morning?: number | null
          body_battery_evening?: number | null
          training_readiness?: number | null
          stress_score_avg?: number | null
          spo2_avg?: number | null
          respiration_avg?: number | null
          vo2max_estimated?: number | null
        }
        Update: {
          sessions_count?: number | null
          duration_sec?: number | null
          distance_m?: number | null
          elevation_gain_m?: number | null
          training_load?: number | null
          resting_hr?: number | null
          hrv_rmssd?: number | null
          hrv_status?: "balanced" | "low" | "unbalanced" | "poor" | "no_status" | null
          sleep_score?: number | null
          sleep_duration_min?: number | null
          sleep_deep_min?: number | null
          sleep_rem_min?: number | null
          sleep_light_min?: number | null
          sleep_awake_min?: number | null
          body_battery_morning?: number | null
          body_battery_evening?: number | null
          training_readiness?: number | null
          stress_score_avg?: number | null
          spo2_avg?: number | null
          respiration_avg?: number | null
          vo2max_estimated?: number | null
        }
        Relationships: []
      }
      risk_assessments: {
        Row: {
          id: string
          user_id: string
          assessment_date: string
          score: number
          level: "none" | "low" | "moderate" | "high" | "critical"
          reasons: string[]
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          assessment_date: string
          score: number
          level: "none" | "low" | "moderate" | "high" | "critical"
          reasons?: string[]
        }
        Update: {
          score?: number
          level?: "none" | "low" | "moderate" | "high" | "critical"
          reasons?: string[]
        }
        Relationships: []
      }
      injuries: {
        Row: {
          id: string
          user_id: string
          body_zone: string
          injury_type: "muscular" | "tendinous" | "bone" | "ligament" | "other" | null
          severity: number | null
          start_date: string
          end_date: string | null
          description: string | null
          treatment: string | null
          related_activity_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          body_zone: string
          injury_type?: "muscular" | "tendinous" | "bone" | "ligament" | "other" | null
          severity?: number | null
          start_date: string
          end_date?: string | null
          description?: string | null
          treatment?: string | null
          related_activity_id?: string | null
        }
        Update: {
          body_zone?: string
          injury_type?: "muscular" | "tendinous" | "bone" | "ligament" | "other" | null
          severity?: number | null
          start_date?: string
          end_date?: string | null
          description?: string | null
          treatment?: string | null
          related_activity_id?: string | null
        }
        Relationships: []
      }
      planned_sessions: {
        Row: {
          id: string
          user_id: string
          planned_date: string
          planned_time: string | null
          sport_type: string
          session_type: string
          planned_duration_min: number | null
          planned_distance_km: number | null
          planned_load: number | null
          description: string | null
          target_zones: number[] | null
          status: "planned" | "completed" | "skipped" | "modified"
          actual_activity_id: string | null
          completion_score: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          planned_date: string
          planned_time?: string | null
          sport_type: string
          session_type: string
          planned_duration_min?: number | null
          planned_distance_km?: number | null
          planned_load?: number | null
          description?: string | null
          target_zones?: number[] | null
          status?: "planned" | "completed" | "skipped" | "modified"
          actual_activity_id?: string | null
          completion_score?: number | null
        }
        Update: {
          planned_date?: string
          planned_time?: string | null
          sport_type?: string
          session_type?: string
          planned_duration_min?: number | null
          planned_distance_km?: number | null
          planned_load?: number | null
          description?: string | null
          target_zones?: number[] | null
          status?: "planned" | "completed" | "skipped" | "modified"
          actual_activity_id?: string | null
          completion_score?: number | null
        }
        Relationships: []
      }
      strava_config: {
        Row: {
          id: 1
          client_id: string
          client_secret: string
          webhook_verify_token: string
          updated_at: string
        }
        Insert: {
          id?: 1
          client_id?: string
          client_secret?: string
          webhook_verify_token?: string
        }
        Update: {
          client_id?: string
          client_secret?: string
          webhook_verify_token?: string
        }
        Relationships: []
      }
      terra_config: {
        Row: {
          id: 1
          dev_id: string
          api_key: string
          webhook_secret: string
          updated_at: string
        }
        Insert: {
          id?: 1
          dev_id?: string
          api_key?: string
          webhook_secret?: string
        }
        Update: {
          dev_id?: string
          api_key?: string
          webhook_secret?: string
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
