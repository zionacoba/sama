export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_config: {
        Row: {
          created_at: string | null
          id: string
          key: string
          value: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          key: string
          value: string
        }
        Update: {
          created_at?: string | null
          id?: string
          key?: string
          value?: string
        }
        Relationships: []
      }
      booking_participants: {
        Row: {
          booking_id: number | null
          completed: boolean | null
          created_at: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          full_name: string | null
          id: string
          medical_notes: string | null
          meeting_point: string | null
          slot_number: number
          token: string
          waiver_accepted: boolean | null
          waiver_accepted_at: string | null
          waiver_ip: string | null
          waiver_text_snapshot: string | null
        }
        Insert: {
          booking_id?: number | null
          completed?: boolean | null
          created_at?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string | null
          id?: string
          medical_notes?: string | null
          meeting_point?: string | null
          slot_number: number
          token?: string
          waiver_accepted?: boolean | null
          waiver_accepted_at?: string | null
          waiver_ip?: string | null
          waiver_text_snapshot?: string | null
        }
        Update: {
          booking_id?: number | null
          completed?: boolean | null
          created_at?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string | null
          id?: string
          medical_notes?: string | null
          meeting_point?: string | null
          slot_number?: number
          token?: string
          waiver_accepted?: boolean | null
          waiver_accepted_at?: string | null
          waiver_ip?: string | null
          waiver_text_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_participants_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          amount_due: number | null
          balance_collected: boolean
          balance_payment_gateway_status: string | null
          balance_payment_id: string | null
          balance_paymongo_payment_id: string | null
          cancellation_policy: string | null
          commission_rate_used: number | null
          created_at: string | null
          custom_question_answer: string | null
          custom_question_answers: Json | null
          custom_questions_snapshot: Json | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          full_name: string | null
          id: number
          medical_notes: string | null
          meeting_point: string | null
          notes: string | null
          participants: Json | null
          payment_gateway_status: string | null
          payment_id: string | null
          payment_method: string | null
          payment_option: string | null
          paymongo_payment_id: string | null
          payout_id: string | null
          payout_status: string | null
          phone: string | null
          platform_commission: number | null
          platform_waiver_agreed: boolean
          platform_waiver_snapshot: string | null
          pre_trip_reminder_sent_at: string | null
          reconcile_escalated_at: string | null
          reconcile_first_failed_at: string | null
          refund_amount: number | null
          refund_issued: boolean | null
          refund_status: string | null
          refunded_at: string | null
          reminder_sent_at: string | null
          slots: number | null
          status: string | null
          total_amount: number | null
          transferred_at: string | null
          transferred_by: string | null
          transferred_to_email: string | null
          trip_id: number | null
          user_id: string | null
          waiver_agreed: boolean | null
          waiver_agreed_at: string | null
          waiver_ip: string | null
          waiver_text_snapshot: string | null
        }
        Insert: {
          amount_due?: number | null
          balance_collected?: boolean
          balance_payment_gateway_status?: string | null
          balance_payment_id?: string | null
          balance_paymongo_payment_id?: string | null
          cancellation_policy?: string | null
          commission_rate_used?: number | null
          created_at?: string | null
          custom_question_answer?: string | null
          custom_question_answers?: Json | null
          custom_questions_snapshot?: Json | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string | null
          id?: never
          medical_notes?: string | null
          meeting_point?: string | null
          notes?: string | null
          participants?: Json | null
          payment_gateway_status?: string | null
          payment_id?: string | null
          payment_method?: string | null
          payment_option?: string | null
          paymongo_payment_id?: string | null
          payout_id?: string | null
          payout_status?: string | null
          phone?: string | null
          platform_commission?: number | null
          platform_waiver_agreed?: boolean
          platform_waiver_snapshot?: string | null
          pre_trip_reminder_sent_at?: string | null
          reconcile_escalated_at?: string | null
          reconcile_first_failed_at?: string | null
          refund_amount?: number | null
          refund_issued?: boolean | null
          refund_status?: string | null
          refunded_at?: string | null
          reminder_sent_at?: string | null
          slots?: number | null
          status?: string | null
          total_amount?: number | null
          transferred_at?: string | null
          transferred_by?: string | null
          transferred_to_email?: string | null
          trip_id?: number | null
          user_id?: string | null
          waiver_agreed?: boolean | null
          waiver_agreed_at?: string | null
          waiver_ip?: string | null
          waiver_text_snapshot?: string | null
        }
        Update: {
          amount_due?: number | null
          balance_collected?: boolean
          balance_payment_gateway_status?: string | null
          balance_payment_id?: string | null
          balance_paymongo_payment_id?: string | null
          cancellation_policy?: string | null
          commission_rate_used?: number | null
          created_at?: string | null
          custom_question_answer?: string | null
          custom_question_answers?: Json | null
          custom_questions_snapshot?: Json | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string | null
          id?: never
          medical_notes?: string | null
          meeting_point?: string | null
          notes?: string | null
          participants?: Json | null
          payment_gateway_status?: string | null
          payment_id?: string | null
          payment_method?: string | null
          payment_option?: string | null
          paymongo_payment_id?: string | null
          payout_id?: string | null
          payout_status?: string | null
          phone?: string | null
          platform_commission?: number | null
          platform_waiver_agreed?: boolean
          platform_waiver_snapshot?: string | null
          pre_trip_reminder_sent_at?: string | null
          reconcile_escalated_at?: string | null
          reconcile_first_failed_at?: string | null
          refund_amount?: number | null
          refund_issued?: boolean | null
          refund_status?: string | null
          refunded_at?: string | null
          reminder_sent_at?: string | null
          slots?: number | null
          status?: string | null
          total_amount?: number | null
          transferred_at?: string | null
          transferred_by?: string | null
          transferred_to_email?: string | null
          trip_id?: number | null
          user_id?: string | null
          waiver_agreed?: boolean | null
          waiver_agreed_at?: string | null
          waiver_ip?: string | null
          waiver_text_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bookings_trip"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      organizer_deductions: {
        Row: {
          amount: number
          applied_payout_id: string | null
          booking_id: number
          created_at: string | null
          id: string
          organizer_id: string
          reason: string
          status: string
        }
        Insert: {
          amount: number
          applied_payout_id?: string | null
          booking_id: number
          created_at?: string | null
          id?: string
          organizer_id: string
          reason: string
          status?: string
        }
        Update: {
          amount?: number
          applied_payout_id?: string | null
          booking_id?: number
          created_at?: string | null
          id?: string
          organizer_id?: string
          reason?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizer_deductions_applied_payout_id_fkey"
            columns: ["applied_payout_id"]
            isOneToOne: false
            referencedRelation: "payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizer_deductions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizer_deductions_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizers"
            referencedColumns: ["id"]
          },
        ]
      }
      organizers: {
        Row: {
          activity_types: string[] | null
          bank_account_name: string | null
          bank_account_number: string | null
          bank_name: string | null
          bio: string
          commission_rate: number | null
          cover_image_url: string | null
          created_at: string
          display_name: string | null
          email: string
          emergency_certified: boolean | null
          facebook_url: string | null
          full_name: string
          gcash_name: string | null
          gcash_number: string | null
          id: string
          is_founding_partner: boolean
          operating_locations: string | null
          past_trips_evidence: string | null
          payout_method: string | null
          phone: string
          photo_url: string | null
          social_links: Json | null
          status: string
          trips_per_month: string | null
          user_id: string
          years_experience: number | null
        }
        Insert: {
          activity_types?: string[] | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          bio: string
          commission_rate?: number | null
          cover_image_url?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          emergency_certified?: boolean | null
          facebook_url?: string | null
          full_name: string
          gcash_name?: string | null
          gcash_number?: string | null
          id?: string
          is_founding_partner?: boolean
          operating_locations?: string | null
          past_trips_evidence?: string | null
          payout_method?: string | null
          phone: string
          photo_url?: string | null
          social_links?: Json | null
          status?: string
          trips_per_month?: string | null
          user_id: string
          years_experience?: number | null
        }
        Update: {
          activity_types?: string[] | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          bio?: string
          commission_rate?: number | null
          cover_image_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          emergency_certified?: boolean | null
          facebook_url?: string | null
          full_name?: string
          gcash_name?: string | null
          gcash_number?: string | null
          id?: string
          is_founding_partner?: boolean
          operating_locations?: string | null
          past_trips_evidence?: string | null
          payout_method?: string | null
          phone?: string
          photo_url?: string | null
          social_links?: Json | null
          status?: string
          trips_per_month?: string | null
          user_id?: string
          years_experience?: number | null
        }
        Relationships: []
      }
      payouts: {
        Row: {
          booking_ids: string[]
          created_at: string | null
          id: string
          needs_reconciliation: boolean
          net_amount: number
          notes: string | null
          organizer_id: string
          payout_destination: Json | null
          platform_commission: number
          remittance_reference: string | null
          remitted_at: string | null
          status: string
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          booking_ids: string[]
          created_at?: string | null
          id?: string
          needs_reconciliation?: boolean
          net_amount: number
          notes?: string | null
          organizer_id: string
          payout_destination?: Json | null
          platform_commission: number
          remittance_reference?: string | null
          remitted_at?: string | null
          status?: string
          total_amount: number
          updated_at?: string | null
        }
        Update: {
          booking_ids?: string[]
          created_at?: string | null
          id?: string
          needs_reconciliation?: boolean
          net_amount?: number
          notes?: string | null
          organizer_id?: string
          payout_destination?: Json | null
          platform_commission?: number
          remittance_reference?: string | null
          remitted_at?: string | null
          status?: string
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payouts_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          birthdate: string | null
          created_at: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          facebook_url: string | null
          first_name: string | null
          id: string
          last_name: string | null
          nickname: string | null
          phone: string | null
          pronouns: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          birthdate?: string | null
          created_at?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          facebook_url?: string | null
          first_name?: string | null
          id: string
          last_name?: string | null
          nickname?: string | null
          phone?: string | null
          pronouns?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          birthdate?: string | null
          created_at?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          facebook_url?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          nickname?: string | null
          phone?: string | null
          pronouns?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      refunds: {
        Row: {
          amount: number
          attempts: number
          booking_id: number
          completed_at: string | null
          created_at: string
          id: number
          last_error: string | null
          payment_id: string
          paymongo_refund_id: string | null
          reason: string | null
          source: string
          status: string
        }
        Insert: {
          amount: number
          attempts?: number
          booking_id: number
          completed_at?: string | null
          created_at?: string
          id?: never
          last_error?: string | null
          payment_id: string
          paymongo_refund_id?: string | null
          reason?: string | null
          source: string
          status?: string
        }
        Update: {
          amount?: number
          attempts?: number
          booking_id?: number
          completed_at?: string | null
          created_at?: string
          id?: never
          last_error?: string | null
          payment_id?: string
          paymongo_refund_id?: string | null
          reason?: string | null
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          approved: boolean
          body: string
          booking_id: number | null
          created_at: string
          full_name: string
          id: number
          organizer_id: string | null
          organizer_responded_at: string | null
          organizer_response: string | null
          rating: number
          trip_id: number
          user_id: string
        }
        Insert: {
          approved?: boolean
          body: string
          booking_id?: number | null
          created_at?: string
          full_name: string
          id?: number
          organizer_id?: string | null
          organizer_responded_at?: string | null
          organizer_response?: string | null
          rating: number
          trip_id: number
          user_id: string
        }
        Update: {
          approved?: boolean
          body?: string
          booking_id?: number | null
          created_at?: string
          full_name?: string
          id?: number
          organizer_id?: string | null
          organizer_responded_at?: string | null
          organizer_response?: string | null
          rating?: number
          trip_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_slug_redirects: {
        Row: {
          created_at: string | null
          new_slug: string
          old_slug: string
          trip_id: number
        }
        Insert: {
          created_at?: string | null
          new_slug: string
          old_slug: string
          trip_id: number
        }
        Update: {
          created_at?: string | null
          new_slug?: string
          old_slug?: string
          trip_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "trip_slug_redirects_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          activity_type: string | null
          cancellation_policy: string | null
          cancellation_policy_custom: string | null
          created_at: string
          custom_question: string | null
          custom_questions: Json | null
          date_end: string | null
          date_start: string | null
          description: string | null
          destination: string | null
          difficulty: string | null
          downpayment_cutoff_days: number | null
          duration: string | null
          id: number
          includes: string | null
          is_template: boolean | null
          meeting_point: string | null
          meeting_points: Json | null
          messenger_gc_link: string | null
          min_downpayment: number | null
          organizer_id: string | null
          payment_type: string
          photos: string[] | null
          price: number | null
          region: string | null
          remaining_slots: number | null
          slug: string | null
          status: string | null
          template_id: number | null
          title: string | null
          total_slots: number | null
          waitlist_enabled: boolean | null
          waiver_text: string | null
          what_to_bring: string | null
        }
        Insert: {
          activity_type?: string | null
          cancellation_policy?: string | null
          cancellation_policy_custom?: string | null
          created_at?: string
          custom_question?: string | null
          custom_questions?: Json | null
          date_end?: string | null
          date_start?: string | null
          description?: string | null
          destination?: string | null
          difficulty?: string | null
          downpayment_cutoff_days?: number | null
          duration?: string | null
          id?: number
          includes?: string | null
          is_template?: boolean | null
          meeting_point?: string | null
          meeting_points?: Json | null
          messenger_gc_link?: string | null
          min_downpayment?: number | null
          organizer_id?: string | null
          payment_type?: string
          photos?: string[] | null
          price?: number | null
          region?: string | null
          remaining_slots?: number | null
          slug?: string | null
          status?: string | null
          template_id?: number | null
          title?: string | null
          total_slots?: number | null
          waitlist_enabled?: boolean | null
          waiver_text?: string | null
          what_to_bring?: string | null
        }
        Update: {
          activity_type?: string | null
          cancellation_policy?: string | null
          cancellation_policy_custom?: string | null
          created_at?: string
          custom_question?: string | null
          custom_questions?: Json | null
          date_end?: string | null
          date_start?: string | null
          description?: string | null
          destination?: string | null
          difficulty?: string | null
          downpayment_cutoff_days?: number | null
          duration?: string | null
          id?: number
          includes?: string | null
          is_template?: boolean | null
          meeting_point?: string | null
          meeting_points?: Json | null
          messenger_gc_link?: string | null
          min_downpayment?: number | null
          organizer_id?: string | null
          payment_type?: string
          photos?: string[] | null
          price?: number | null
          region?: string | null
          remaining_slots?: number | null
          slug?: string | null
          status?: string | null
          template_id?: number | null
          title?: string | null
          total_slots?: number | null
          waitlist_enabled?: boolean | null
          waiver_text?: string | null
          what_to_bring?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trips_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist: {
        Row: {
          created_at: string | null
          email: string
          full_name: string
          id: string
          notified: boolean | null
          notified_at: string | null
          phone: string | null
          slots: number
          trip_id: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name: string
          id?: string
          notified?: boolean | null
          notified_at?: string | null
          phone?: string | null
          slots?: number
          trip_id?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          notified?: boolean | null
          notified_at?: string | null
          phone?: string | null
          slots?: number
          trip_id?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      book_slot_and_create_booking: {
        Args: {
          p_amount_due: number
          p_commission_rate_used: number
          p_custom_question_answers?: Json
          p_custom_questions_snapshot?: Json
          p_email: string
          p_emergency_contact_name: string
          p_emergency_contact_phone: string
          p_full_name: string
          p_medical_notes: string
          p_meeting_point: string
          p_notes: string
          p_participants: Json
          p_payment_option: string
          p_phone: string
          p_platform_commission: number
          p_platform_waiver_agreed: boolean
          p_platform_waiver_snapshot: string
          p_slots_requested: number
          p_status: string
          p_total_amount: number
          p_trip_id: number
          p_user_id: string
          p_waiver_agreed: boolean
          p_waiver_agreed_at: string
          p_waiver_ip: string
          p_waiver_text_snapshot: string
        }
        Returns: number
      }
      cancel_and_restore_slot: {
        Args: {
          p_booking_id: number
          p_slots_requested: number
          p_trip_id: number
        }
        Returns: boolean
      }
      create_payout_atomic: {
        Args: {
          p_booking_ids: number[]
          p_credit_ids: string[]
          p_deduction_ids: string[]
          p_net_amount: number
          p_organizer_id: string
          p_platform_commission: number
          p_total_amount: number
        }
        Returns: string
      }
      get_admin_email: { Args: never; Returns: string }
      restore_slot: {
        Args: { p_slots_to_restore: number; p_trip_id: number }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
