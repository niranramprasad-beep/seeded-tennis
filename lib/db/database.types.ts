// Hand-written Supabase schema types.
//
// `supabase gen types typescript` needs a live project read via the
// Supabase CLI/MCP tooling, and that connectivity was confirmed down for
// this task (`list_projects` → `net::ERR_FAILED`). These types are instead
// transcribed by hand, column-for-column, from every migration in
// supabase/migrations/*.sql (0001_init through 017_coach_outreach_reply_note)
// — the best available ground truth without a live schema read. If/when
// generation becomes possible, run:
//   supabase gen types typescript --project-id <id> > lib/db/database.types.ts
// and reconcile any drift against this file (there shouldn't be much: every
// column below traces to a specific migration, noted inline).
//
// Columns from migrations 011/013/014/015/016/017 are marked "not yet
// applied" in their own files — those files are tracked in git but, per
// this project's standing discipline, must be run by hand against the
// shared dev/prod Supabase project. Typed here as already-applied (the
// target end state) since every lib/db reader already degrades gracefully
// (42P01/42703) when a column or table doesn't exist yet.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      families: {
        Row: {
          id: string;
          code: string;
          name: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["families"]["Insert"]>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          name: string;
          email: string | null;
          country: string | null;
          gender: "male" | "female" | null;
          grade: number | null;
          role: "player" | "parent";
          family_code: string | null;
          current_utr: number | null;
          graduation_year: number | null;
          commitment_date: string | null;
          target_school_slugs: string[];
          weaknesses: string[];
          tournaments_played: number;
          tournaments_goal: number;
          onboarded: boolean;
          username: string | null;
          privacy_level: "public" | "friends" | "private";
          subscription_tier: "free" | "player" | "family";
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          whop_membership_id: string | null;
          // migration 014_profile_fields_and_deletion.sql
          home_area: string | null;
          utr_profile_link: string | null;
          gpa: number | null;
          deletion_requested_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name?: string;
          email?: string | null;
          country?: string | null;
          gender?: "male" | "female" | null;
          grade?: number | null;
          role?: "player" | "parent";
          family_code?: string | null;
          current_utr?: number | null;
          graduation_year?: number | null;
          commitment_date?: string | null;
          target_school_slugs?: string[];
          weaknesses?: string[];
          tournaments_played?: number;
          tournaments_goal?: number;
          onboarded?: boolean;
          username?: string | null;
          privacy_level?: "public" | "friends" | "private";
          subscription_tier?: "free" | "player" | "family";
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          whop_membership_id?: string | null;
          home_area?: string | null;
          utr_profile_link?: string | null;
          gpa?: number | null;
          deletion_requested_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      utr_entries: {
        Row: {
          id: string;
          user_id: string;
          utr: number;
          recorded_at: string;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          utr: number;
          recorded_at?: string;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["utr_entries"]["Insert"]>;
        Relationships: [];
      };
      training_plans: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          goal: string | null;
          active: boolean;
          source: "custom" | "seeded" | "template";
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          goal?: string | null;
          active?: boolean;
          source?: "custom" | "seeded" | "template";
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["training_plans"]["Insert"]>;
        Relationships: [];
      };
      workout_sessions: {
        Row: {
          id: string;
          user_id: string;
          training_plan_id: string;
          title: string;
          session_type: string;
          scheduled_date: string | null;
          weekday: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun" | null;
          start_time: string | null;
          duration_minutes: number;
          intensity: "low" | "moderate" | "high";
          notes: string | null;
          goals: string | null;
          completed: boolean;
          order_index: number;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          training_plan_id: string;
          title: string;
          session_type: string;
          scheduled_date?: string | null;
          weekday?: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun" | null;
          start_time?: string | null;
          duration_minutes?: number;
          intensity?: "low" | "moderate" | "high";
          notes?: string | null;
          goals?: string | null;
          completed?: boolean;
          order_index?: number;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["workout_sessions"]["Insert"]>;
        Relationships: [];
      };
      exercises: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          exercise_type: string | null;
          description: string | null;
          default_duration_minutes: number | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          exercise_type?: string | null;
          description?: string | null;
          default_duration_minutes?: number | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["exercises"]["Insert"]>;
        Relationships: [];
      };
      session_exercises: {
        Row: {
          id: string;
          user_id: string;
          workout_session_id: string;
          exercise_id: string;
          order_index: number;
          sets: number | null;
          reps: string | null;
          duration_minutes: number | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          workout_session_id: string;
          exercise_id: string;
          order_index?: number;
          sets?: number | null;
          reps?: string | null;
          duration_minutes?: number | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["session_exercises"]["Insert"]>;
        Relationships: [];
      };
      saved_templates: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          template_type: "session" | "plan";
          description: string | null;
          payload: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          template_type?: "session" | "plan";
          description?: string | null;
          payload?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["saved_templates"]["Insert"]>;
        Relationships: [];
      };
      user_settings: {
        Row: {
          user_id: string;
          theme: "grass" | "clay" | "night" | "hard";
          default_training_view: "day" | "week" | "month";
          notification_preferences: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          theme?: "grass" | "clay" | "night" | "hard";
          default_training_view?: "day" | "week" | "month";
          notification_preferences?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["user_settings"]["Insert"]>;
        Relationships: [];
      };
      family_codes: {
        Row: {
          code: string;
          player_id: string | null;
          created_at: string;
        };
        Insert: {
          code: string;
          player_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["family_codes"]["Insert"]>;
        Relationships: [];
      };
      parent_accounts: {
        Row: {
          id: string;
          user_id: string;
          family_code: string;
          player_id: string | null;
          relationship: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          family_code: string;
          player_id?: string | null;
          relationship?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["parent_accounts"]["Insert"]>;
        Relationships: [];
      };
      daily_checkins: {
        Row: {
          id: string;
          user_id: string;
          family_code: string | null;
          checkin_date: string;
          mood: number;
          focus_areas: string[];
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          family_code?: string | null;
          checkin_date: string;
          mood: number;
          focus_areas?: string[];
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["daily_checkins"]["Insert"]>;
        Relationships: [];
      };
      matches: {
        Row: {
          id: string;
          user_id: string;
          family_code: string | null;
          match_date: string;
          opponent: string | null;
          opponent_utr: number | null;
          tournament_name: string | null;
          surface: "hard" | "clay" | "grass" | "indoor";
          prep_plan: Json;
          notification_requested: boolean;
          result: "win" | "loss" | null;
          score: string | null;
          worked: string | null;
          needs_work: string | null;
          notes: string | null;
          video_url: string | null;
          ai_analysis: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          family_code?: string | null;
          match_date: string;
          opponent?: string | null;
          opponent_utr?: number | null;
          tournament_name?: string | null;
          surface?: "hard" | "clay" | "grass" | "indoor";
          prep_plan?: Json;
          notification_requested?: boolean;
          result?: "win" | "loss" | null;
          score?: string | null;
          worked?: string | null;
          needs_work?: string | null;
          notes?: string | null;
          video_url?: string | null;
          ai_analysis?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["matches"]["Insert"]>;
        Relationships: [];
      };
      badges: {
        Row: {
          id: string;
          user_id: string;
          badge_key: string;
          badge_type: string;
          title: string;
          description: string | null;
          earned_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          badge_key: string;
          badge_type: string;
          title: string;
          description?: string | null;
          earned_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["badges"]["Insert"]>;
        Relationships: [];
      };
      friendships: {
        Row: {
          id: string;
          requester_id: string;
          addressee_id: string;
          status: "pending" | "accepted" | "declined";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          requester_id: string;
          addressee_id: string;
          status?: "pending" | "accepted" | "declined";
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["friendships"]["Insert"]>;
        Relationships: [];
      };
      cost_calculations: {
        Row: {
          id: string;
          user_id: string;
          family_code: string | null;
          name: string;
          inputs: Json;
          results: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          family_code?: string | null;
          name?: string;
          inputs?: Json;
          results?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["cost_calculations"]["Insert"]>;
        Relationships: [];
      };
      parent_reports: {
        Row: {
          id: string;
          family_code: string;
          player_id: string | null;
          month: string;
          title: string;
          summary: Json;
          storage_path: string | null;
          public_url: string | null;
          emailed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          family_code: string;
          player_id?: string | null;
          month: string;
          title: string;
          summary?: Json;
          storage_path?: string | null;
          public_url?: string | null;
          emailed_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["parent_reports"]["Insert"]>;
        Relationships: [];
      };
      encouragement_notes: {
        Row: {
          id: string;
          family_code: string;
          parent_id: string;
          player_id: string | null;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          family_code: string;
          parent_id: string;
          player_id?: string | null;
          body: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["encouragement_notes"]["Insert"]>;
        Relationships: [];
      };
      // migration 009_coach_outreach.sql, widened by 011 (status enum,
      // remind_at — "not yet applied", see file header) and 017 (reply_note
      // — "not yet applied").
      coach_outreach: {
        Row: {
          id: string;
          user_id: string;
          family_code: string | null;
          school_slug: string;
          status: "researching" | "emailed" | "replied" | "call_visit" | "offer" | "committed";
          remind_at: string | null;
          reply_note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          family_code?: string | null;
          school_slug: string;
          status: "researching" | "emailed" | "replied" | "call_visit" | "offer" | "committed";
          remind_at?: string | null;
          reply_note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["coach_outreach"]["Insert"]>;
        Relationships: [];
      };
      // migration 013_tournament_entries.sql — "not yet applied", see file header.
      tournament_entries: {
        Row: {
          id: string;
          user_id: string;
          family_code: string | null;
          name: string;
          level: "L1" | "L2" | "L3" | "L4" | "L5" | "L6" | "L7" | "utr";
          event_date: string;
          city: string | null;
          state: string | null;
          travel_hours: number | null;
          distance_miles: number | null;
          draw_utr: number | null;
          goal_utr: number | null;
          entry_cost: number | null;
          travel_cost: number | null;
          status: "saved" | "entered";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          family_code?: string | null;
          name: string;
          level: "L1" | "L2" | "L3" | "L4" | "L5" | "L6" | "L7" | "utr";
          event_date: string;
          city?: string | null;
          state?: string | null;
          travel_hours?: number | null;
          distance_miles?: number | null;
          draw_utr?: number | null;
          goal_utr?: number | null;
          entry_cost?: number | null;
          travel_cost?: number | null;
          status?: "saved" | "entered";
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["tournament_entries"]["Insert"]>;
        Relationships: [];
      };
      // migration 015_family_overview_and_budget.sql — "not yet applied".
      season_budgets: {
        Row: {
          id: string;
          family_code: string;
          season_label: string;
          total_budget: number;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          family_code: string;
          season_label?: string;
          total_budget?: number;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["season_budgets"]["Insert"]>;
        Relationships: [];
      };
      budget_expenses: {
        Row: {
          id: string;
          family_code: string;
          created_by: string;
          category: "entries" | "travel" | "camps";
          label: string;
          amount: number;
          expense_date: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          family_code: string;
          created_by: string;
          category: "entries" | "travel" | "camps";
          label: string;
          amount: number;
          expense_date?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["budget_expenses"]["Insert"]>;
        Relationships: [];
      };
      // migration 016_recruiting_checklist.sql — "not yet applied".
      recruiting_checklist_items: {
        Row: {
          id: string;
          user_id: string;
          item_key: string;
          is_custom: boolean;
          label: string | null;
          completed: boolean;
          hidden: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          item_key: string;
          is_custom?: boolean;
          label?: string | null;
          completed?: boolean;
          hidden?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["recruiting_checklist_items"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      // 004_fix_profiles_recursion.sql
      current_family_code: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      // 005_feature_expansion.sql
      is_family_member: {
        Args: { target_family_code: string | null };
        Returns: boolean;
      };
      // 005_feature_expansion.sql
      are_friends: {
        Args: { a: string; b: string };
        Returns: boolean;
      };
      // 010_enforce_tier_gating.sql
      has_tier: {
        Args: { required_tier: string };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
