export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          auth_user_id: string;
          full_name: string;
          phone: string | null;
          role: Database["public"]["Enums"]["profile_role"];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          auth_user_id: string;
          full_name: string;
          phone?: string | null;
          role: Database["public"]["Enums"]["profile_role"];
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      technicians: {
        Row: {
          id: string;
          auth_user_id: string | null;
          display_name: string;
          phone: string | null;
          specialties: string[];
          is_active: boolean;
          last_seen_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          auth_user_id?: string | null;
          display_name: string;
          phone?: string | null;
          specialties?: string[];
          is_active?: boolean;
          last_seen_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["technicians"]["Insert"]>;
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          external_client_number: string | null;
          full_name: string;
          email: string | null;
          company_name: string | null;
          service_address_line_1: string;
          phone: string;
          service_address_line_2: string | null;
          service_city: string;
          service_state_or_region: string | null;
          service_postal_code: string;
          legacy_created_at: string | null;
          source: Database["public"]["Enums"]["lead_source"];
          preferred_service_type: Database["public"]["Enums"]["service_type"] | null;
          notes: string | null;
          lifecycle_status: Database["public"]["Enums"]["customer_lifecycle_status"] | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          external_client_number?: string | null;
          full_name: string;
          email?: string | null;
          company_name?: string | null;
          service_address_line_1: string;
          phone: string;
          service_address_line_2?: string | null;
          service_city?: string;
          service_state_or_region?: string | null;
          service_postal_code?: string;
          legacy_created_at?: string | null;
          source?: Database["public"]["Enums"]["lead_source"];
          preferred_service_type?: Database["public"]["Enums"]["service_type"] | null;
          notes?: string | null;
          lifecycle_status?: Database["public"]["Enums"]["customer_lifecycle_status"] | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["customers"]["Insert"]>;
        Relationships: [];
      };
      services: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          service_type: Database["public"]["Enums"]["service_type"];
          default_price_cents: number;
          duration_minutes: number;
          is_active: boolean;
          sort_position: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          service_type: Database["public"]["Enums"]["service_type"];
          default_price_cents?: number;
          duration_minutes?: number;
          is_active?: boolean;
          sort_position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["services"]["Insert"]>;
        Relationships: [];
      };
      leads: {
        Row: {
          id: string;
          full_name: string;
          phone: string;
          email: string | null;
          service_address_line_1: string;
          service_address_line_2: string | null;
          service_city: string;
          service_state_or_region: string | null;
          service_postal_code: string;
          source: Database["public"]["Enums"]["lead_source"];
          service_type: Database["public"]["Enums"]["service_type"];
          description: string | null;
          status: Database["public"]["Enums"]["lead_status"];
          customer_id: string | null;
          converted_job_id: string | null;
          created_by_auth_user_id: string | null;
          disposition: Database["public"]["Enums"]["lead_disposition"] | null;
          disposition_reason: Database["public"]["Enums"]["lead_disposition_reason"] | null;
          disposition_note: string | null;
          disposition_at: string | null;
          disposition_by_auth_user_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          full_name: string;
          phone: string;
          email?: string | null;
          service_address_line_1: string;
          service_address_line_2?: string | null;
          service_city: string;
          service_state_or_region?: string | null;
          service_postal_code: string;
          source?: Database["public"]["Enums"]["lead_source"];
          service_type: Database["public"]["Enums"]["service_type"];
          description?: string | null;
          status?: Database["public"]["Enums"]["lead_status"];
          customer_id?: string | null;
          converted_job_id?: string | null;
          created_by_auth_user_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["leads"]["Insert"]>;
        Relationships: [];
      };
      jobs: {
        Row: {
          id: string;
          customer_id: string;
          service_id: string | null;
          assigned_technician_id: string | null;
          title: string;
          description: string | null;
          lead_source: Database["public"]["Enums"]["lead_source"];
          requested_service_type: Database["public"]["Enums"]["service_type"];
          job_type: Database["public"]["Enums"]["job_type"];
          status: Database["public"]["Enums"]["job_status"];
          service_address_line_1: string;
          service_address_line_2: string | null;
          service_city: string;
          service_state_or_region: string | null;
          service_postal_code: string;
          scheduled_for: string | null;
          scheduled_window: string | null;
          requested_at: string;
          on_the_way_at: string | null;
          started_at: string | null;
          completed_at: string | null;
          paid_at: string | null;
          cancellation_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          created_by_auth_user_id: string | null;
          updated_by_auth_user_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          service_id?: string | null;
          assigned_technician_id?: string | null;
          title: string;
          description?: string | null;
          lead_source: Database["public"]["Enums"]["lead_source"];
          requested_service_type: Database["public"]["Enums"]["service_type"];
          job_type: Database["public"]["Enums"]["job_type"];
          status?: Database["public"]["Enums"]["job_status"];
          service_address_line_1: string;
          service_address_line_2?: string | null;
          service_city: string;
          service_state_or_region?: string | null;
          service_postal_code: string;
          scheduled_for?: string | null;
          scheduled_window?: string | null;
          requested_at?: string;
          on_the_way_at?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          paid_at?: string | null;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          created_by_auth_user_id?: string | null;
          updated_by_auth_user_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["jobs"]["Insert"]>;
        Relationships: [];
      };
      job_notes: {
        Row: {
          id: number;
          job_id: string;
          author_profile_id: string | null;
          findings: string | null;
          recommendations: string | null;
          photo_urls: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: never;
          job_id: string;
          author_profile_id?: string | null;
          findings?: string | null;
          recommendations?: string | null;
          photo_urls?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["job_notes"]["Insert"]>;
        Relationships: [];
      };
      quotes: {
        Row: {
          id: string;
          job_id: string;
          description: string;
          price_cents: number;
          status: Database["public"]["Enums"]["quote_status"];
          sent_at: string | null;
          approved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          job_id: string;
          description: string;
          price_cents: number;
          status?: Database["public"]["Enums"]["quote_status"];
          sent_at?: string | null;
          approved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["quotes"]["Insert"]>;
        Relationships: [];
      };
      invoices: {
        Row: {
          id: string;
          job_id: string;
          description: string;
          amount_cents: number;
          status: Database["public"]["Enums"]["invoice_status"];
          issued_at: string;
          paid_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          job_id: string;
          description: string;
          amount_cents: number;
          status?: Database["public"]["Enums"]["invoice_status"];
          issued_at?: string;
          paid_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["invoices"]["Insert"]>;
        Relationships: [];
      };
      job_status_events: {
        Row: {
          id: number;
          job_id: string;
          author_profile_id: string | null;
          status: Database["public"]["Enums"]["job_status"];
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: never;
          job_id: string;
          author_profile_id?: string | null;
          status: Database["public"]["Enums"]["job_status"];
          note?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["job_status_events"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      profile_role: "owner" | "admin" | "office_admin" | "dispatcher" | "csr" | "technician" | "viewer";
      lead_source: "phone" | "website" | "google" | "facebook" | "referral" | "repeat_customer" | "other";
      customer_lifecycle_status: "prospect" | "active" | "past" | "archived";
      service_type: "inspection" | "cleaning" | "repair" | "rebuild";
      job_type: "inspection" | "installation_repair" | "callback_warranty";
      lead_status: "new_lead" | "contacted" | "converted";
      lead_disposition: "not_booked";
      lead_disposition_reason:
        | "price"
        | "no_availability"
        | "researching"
        | "no_response"
        | "outside_area"
        | "other_company"
        | "other";
      job_status: "new_lead" | "contacted" | "scheduled" | "on_the_way" | "in_progress" | "waiting_for_approval" | "completed" | "paid" | "cancelled";
      quote_status: "draft" | "sent" | "approved" | "rejected";
      invoice_status: "unpaid" | "paid";
    };
    CompositeTypes: Record<string, never>;
  };
};
