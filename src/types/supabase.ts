// =============================================================================
// src/types/supabase.ts
//
// Hand-authored in the shape `supabase gen types typescript` produces, kept
// in sync with:
//   supabase/migrations/0001_core_schema.sql
//   supabase/migrations/0002_rpc_and_policies.sql (RPCs)
//   supabase/migrations/0003_storage.sql (storage bucket only, not typed here)
//
// If you have the Supabase CLI linked to the project, prefer regenerating
// this file instead of hand-editing it:
//   npx supabase gen types typescript --project-id <ref> > src/types/supabase.ts
// =============================================================================

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type UserRole = 'passenger' | 'captain' | 'parent' | 'student' | 'admin' | 'super_admin';
export type AccountStatus = 'pending_setup' | 'active' | 'suspended' | 'deleted';
export type GenderPreference = 'men_only' | 'women_only' | 'everyone';
export type VehicleType = 'private' | 'bus' | 'suzuki';
export type Gender = 'male' | 'female';
export type JourneyType = 'daily' | 'weekly' | 'monthly';
export type JourneyStatus =
  | 'draft'
  | 'published'
  | 'active'
  | 'receiving_bookings'
  | 'full'
  | 'in_progress'
  | 'completed'
  | 'cancelled';
export type BookingStatus =
  | 'pending'
  | 'captain_review'
  | 'accepted'
  | 'rejected'
  | 'cancelled_by_passenger'
  | 'cancelled_by_captain'
  | 'expired'
  | 'completed';
export type SubscriptionPlan = 'weekly' | 'monthly';
export type SubscriptionStatus = 'trial' | 'active' | 'completed' | 'cancelled';
export type ReportTargetType = 'journey' | 'booking' | 'profile' | 'message';
export type ReportStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          phone_number: string | null;
          role: UserRole;
          governorate: string;
          city: string;
          gender_pref: GenderPreference;
          avatar_url: string | null;
          terms_accepted: boolean;
          terms_version: string;
          status: AccountStatus;
          trust_score: number;
          total_trips_completed: number;
          gender: Gender | null;
          national_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string;
          phone_number?: string | null;
          role?: UserRole;
          governorate?: string;
          city?: string;
          gender_pref?: GenderPreference;
          avatar_url?: string | null;
          terms_accepted?: boolean;
          terms_version?: string;
          status?: AccountStatus;
          trust_score?: number;
          total_trips_completed?: number;
          gender?: Gender | null;
          national_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [];
      };

      profiles_child: {
        Row: {
          id: string;
          parent_id: string;
          full_name: string;
          gender_pref: GenderPreference;
          age: number | null;
          school: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          parent_id: string;
          full_name: string;
          gender_pref?: GenderPreference;
          age?: number | null;
          school?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['profiles_child']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'profiles_child_parent_id_fkey';
            columns: ['parent_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          }
        ];
      };

      vehicles: {
        Row: {
          id: string;
          captain_id: string;
          make: string;
          model: string;
          color: string | null;
          plate_number: string | null;
          seats: number;
          type: VehicleType;
          is_ac: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          captain_id: string;
          make: string;
          model: string;
          color?: string | null;
          plate_number?: string | null;
          seats: number;
          type: VehicleType;
          is_ac?: boolean;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['vehicles']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'vehicles_captain_id_fkey';
            columns: ['captain_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          }
        ];
      };

      journeys: {
        Row: {
          id: string;
          captain_id: string;
          vehicle_id: string;
          start_lat: number;
          start_lng: number;
          end_lat: number;
          end_lng: number;
          // Generated PostGIS geography columns — Supabase types these as
          // `unknown` since the JS client never needs to read/write them
          // directly (start_lat/lng and end_lat/lng are the plain columns
          // the client actually uses).
          start_point: unknown;
          end_point: unknown;
          start_address: string;
          end_address: string;
          departure_time: string;
          journey_type: JourneyType;
          total_seats: number;
          available_seats: number;
          price_per_seat: number;
          gender_pref: GenderPreference;
          notes: string | null;
          status: JourneyStatus;
          created_at: string;
          updated_at: string;
          // 0005_admin_dashboard_fofi.sql — soft delete for a captain's own
          // "حذف الرحلة" action. Row stays intact for admins until they
          // permanently delete it or 15 days pass (auto-purge).
          deleted_at: string | null;
          deleted_by: string | null;
        };
        Insert: {
          id?: string;
          captain_id: string;
          vehicle_id: string;
          start_lat: number;
          start_lng: number;
          end_lat: number;
          end_lng: number;
          start_address: string;
          end_address: string;
          departure_time: string;
          journey_type?: JourneyType;
          total_seats: number;
          available_seats: number;
          price_per_seat: number;
          gender_pref?: GenderPreference;
          notes?: string | null;
          status?: JourneyStatus;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['journeys']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'journeys_captain_id_fkey';
            columns: ['captain_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'journeys_vehicle_id_fkey';
            columns: ['vehicle_id'];
            referencedRelation: 'vehicles';
            referencedColumns: ['id'];
          }
        ];
      };

      bookings: {
        Row: {
          id: string;
          journey_id: string;
          passenger_id: string;
          seats_booked: number;
          price_offered: number;
          final_price: number;
          status: BookingStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          journey_id: string;
          passenger_id: string;
          seats_booked: number;
          price_offered: number;
          final_price: number;
          status?: BookingStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['bookings']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'bookings_journey_id_fkey';
            columns: ['journey_id'];
            referencedRelation: 'journeys';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bookings_passenger_id_fkey';
            columns: ['passenger_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          }
        ];
      };

      subscriptions: {
        Row: {
          id: string;
          booking_id: string;
          journey_id: string;
          captain_id: string;
          passenger_id: string;
          plan: SubscriptionPlan;
          status: SubscriptionStatus;
          trial_ends_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          journey_id: string;
          captain_id: string;
          passenger_id: string;
          plan: SubscriptionPlan;
          status?: SubscriptionStatus;
          trial_ends_at: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['subscriptions']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'subscriptions_booking_id_fkey';
            columns: ['booking_id'];
            referencedRelation: 'bookings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'subscriptions_journey_id_fkey';
            columns: ['journey_id'];
            referencedRelation: 'journeys';
            referencedColumns: ['id'];
          }
        ];
      };

      notifications: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          body: string | null;
          link: string | null;
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          body?: string | null;
          link?: string | null;
          is_read?: boolean;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['notifications']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'notifications_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          }
        ];
      };

      messages: {
        Row: {
          id: string;
          booking_id: string;
          sender_id: string;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          sender_id: string;
          content: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['messages']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'messages_booking_id_fkey';
            columns: ['booking_id'];
            referencedRelation: 'bookings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_sender_id_fkey';
            columns: ['sender_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          }
        ];
      };

      reviews: {
        Row: {
          id: string;
          booking_id: string;
          reviewer_id: string;
          reviewee_id: string;
          rating: number;
          comment: string | null;
          is_hidden: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          reviewer_id: string;
          reviewee_id: string;
          rating: number;
          comment?: string | null;
          is_hidden?: boolean;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['reviews']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'reviews_booking_id_fkey';
            columns: ['booking_id'];
            referencedRelation: 'bookings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reviews_reviewer_id_fkey';
            columns: ['reviewer_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reviews_reviewee_id_fkey';
            columns: ['reviewee_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          }
        ];
      };

      reports: {
        Row: {
          id: string;
          reporter_id: string;
          target_type: ReportTargetType;
          target_id: string;
          reason: string;
          status: ReportStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          reporter_id: string;
          target_type: ReportTargetType;
          target_id: string;
          reason: string;
          status?: ReportStatus;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['reports']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'reports_reporter_id_fkey';
            columns: ['reporter_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          }
        ];
      };

      audit_logs: {
        Row: {
          id: string;
          actor_id: string | null;
          action: string;
          target_type: string | null;
          target_id: string | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id?: string | null;
          action: string;
          target_type?: string | null;
          target_id?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['audit_logs']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'audit_logs_actor_id_fkey';
            columns: ['actor_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          }
        ];
      };

      // 0005_admin_dashboard_fofi.sql — FOFi's "تواصل مع الدعم" hand-off.
      support_messages: {
        Row: {
          id: string;
          user_id: string | null;
          contact_phone: string | null;
          message: string;
          context: string | null;
          status: 'open' | 'resolved';
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          contact_phone?: string | null;
          message: string;
          context?: string | null;
          status?: 'open' | 'resolved';
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['support_messages']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'support_messages_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          }
        ];
      };

      // 0005_admin_dashboard_fofi.sql — saved shortcuts ("البيت"/"الشغل")
      // surfaced as quick chips inside LocationPicker.
      favorite_places: {
        Row: {
          id: string;
          user_id: string;
          label: string;
          address: string;
          latitude: number;
          longitude: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          label: string;
          address: string;
          latitude: number;
          longitude: number;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['favorite_places']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'favorite_places_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          }
        ];
      };
    };

    Views: Record<string, never>;

    Functions: {
      is_admin: {
        Args: { uid: string };
        Returns: boolean;
      };
      create_journey_rpc: {
        Args: {
          p_vehicle_id: string;
          p_start_lng: number;
          p_start_lat: number;
          p_end_lng: number;
          p_end_lat: number;
          p_start_address: string;
          p_end_address: string;
          p_departure_time: string;
          p_journey_type: string;
          p_total_seats: number;
          p_price_per_seat: number;
          p_notes?: string | null;
        };
        Returns: Database['public']['Tables']['journeys']['Row'];
      };
      find_matching_journeys: {
        Args: {
          p_start_lng: number;
          p_start_lat: number;
          p_end_lng: number;
          p_end_lat: number;
          p_departure_time: string;
          p_radius_km?: number;
          p_school_mode?: boolean;
          p_child_id?: string | null;
        };
        Returns: {
          journey_id: string;
          captain_id: string;
          captain_name: string;
          captain_avatar: string | null;
          captain_trust_score: number;
          vehicle_make: string;
          vehicle_model: string;
          vehicle_type: VehicleType;
          start_address: string;
          end_address: string;
          departure_time: string;
          available_seats: number;
          price_per_seat: number;
          journey_type: JourneyType;
          distance_start_meters: number;
          distance_end_meters: number;
          compatibility_score: number;
        }[];
      };
      create_booking_rpc: {
        Args: { p_journey_id: string; p_seats_booked: number; p_price_offered: number };
        Returns: Database['public']['Tables']['bookings']['Row'];
      };
      accept_booking_rpc: {
        Args: { p_booking_id: string };
        Returns: Database['public']['Tables']['bookings']['Row'];
      };
      reject_booking_rpc: {
        Args: { p_booking_id: string };
        Returns: Database['public']['Tables']['bookings']['Row'];
      };
      complete_journey_rpc: {
        Args: { p_journey_id: string };
        Returns: void;
      };
      calculate_journey_price_rpc: {
        Args: { p_distance_meters: number; p_journey_type?: string };
        Returns: number;
      };
      continue_subscription_rpc: {
        Args: { p_subscription_id: string };
        Returns: Database['public']['Tables']['subscriptions']['Row'];
      };
      stop_subscription_rpc: {
        Args: { p_subscription_id: string };
        Returns: { subscription: Database['public']['Tables']['subscriptions']['Row']; refund_amount: number }[];
      };
      moderate_review_rpc: {
        Args: { p_review_id: string; p_hidden: boolean };
        Returns: Database['public']['Tables']['reviews']['Row'];
      };
      // 0005_admin_dashboard_fofi.sql
      cancel_own_journey_rpc: {
        Args: { p_journey_id: string };
        Returns: Database['public']['Tables']['journeys']['Row'];
      };
      admin_delete_journey_rpc: {
        Args: { p_journey_id: string };
        Returns: void;
      };
      purge_expired_deleted_journeys_rpc: {
        Args: Record<string, never>;
        Returns: number;
      };
      admin_set_user_role_rpc: {
        Args: { p_user_id: string; p_role: string };
        Returns: Database['public']['Tables']['profiles']['Row'];
      };
    };

    Enums: {
      user_role: UserRole;
      account_status: AccountStatus;
      gender_preference: GenderPreference;
      vehicle_type: VehicleType;
      journey_type: JourneyType;
      journey_status: JourneyStatus;
      booking_status: BookingStatus;
      subscription_status: SubscriptionStatus;
      report_target_type: ReportTargetType;
      report_status: ReportStatus;
    };

    CompositeTypes: Record<string, never>;
  };
}

// Convenience row/insert/update aliases — import these in components/services
// instead of reaching into Database[...] every time.
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T];