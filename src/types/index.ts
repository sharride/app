export type UserRole = 'passenger' | 'captain' | 'parent' | 'student' | 'admin' | 'super_admin';
export type AccountStatus = 'pending_setup' | 'active' | 'suspended' | 'deleted';
export type GenderPreference = 'men_only' | 'women_only' | 'everyone';
export type VehicleType = 'private' | 'bus' | 'suzuki';
export type Gender = 'male' | 'female';
export type JourneyType = 'daily' | 'weekly' | 'monthly';
export type JourneyStatus = 'draft' | 'published' | 'active' | 'receiving_bookings' | 'full' | 'in_progress' | 'completed' | 'cancelled';
export type BookingStatus = 'pending' | 'captain_review' | 'accepted' | 'rejected' | 'cancelled_by_passenger' | 'cancelled_by_captain' | 'expired' | 'completed';
export type SubscriptionStatus = 'trial' | 'active' | 'completed' | 'cancelled';

export interface Profile {
  id: string;
  full_name: string;
  phone_number?: string;
  role: UserRole;
  governorate: string;
  city: string;
  gender_pref: GenderPreference;
  avatar_url?: string;
  terms_accepted: boolean;
  terms_version: string;
  status: AccountStatus;
  trust_score: number;
  total_trips_completed: number;
  // Identity-check fields (0004_role_identity_and_fleet.sql) — required
  // before publishing or searching for a journey, filled once via the
  // verification screen. Nullable since existing users haven't filled them
  // yet; isIdentityComplete() in utils/identity.ts is the single source of
  // truth for whether they still need to.
  gender?: Gender | null;
  national_id?: string | null;
  // Captain ELIGIBILITY (0006_captain_activation.sql) — not the active role.
  // A user can be role='passenger' while captain_enabled=true (they're
  // qualified to switch to captain via logout → role select → login).
  // Only ever changes via rpc_select_role / rpc_activate_captain — never
  // write this directly with updateProfile(), the DB rejects it.
  captain_enabled: boolean;
  created_at: string;
  updated_at: string;
}

// A parent's sub-profile for a child (0001_core_schema.sql defined the
// table; 0004_role_identity_and_fleet.sql added age/school so it can be
// used to search school routes on the child's behalf).
export interface ProfileChild {
  id: string;
  parent_id: string;
  full_name: string;
  gender_pref: GenderPreference;
  age?: number | null;
  school?: string | null;
  created_at: string;
}

// Confirmed against the live database directly (supabase/migrations/0001
// in this repo does not reflect it). start_location/end_location on the
// real table are PostGIS `geometry` points, not flat lat/lng columns — no
// page reads them directly (only start_address/end_address), so they're
// left off this interface. Lat/lng only ever exist as create_journey_rpc's
// input parameters, never as stored columns.
export interface Journey {
  id: string;
  captain_id: string;
  vehicle_id: string;
  start_address: string;
  end_address: string;
  departure_time: string;
  journey_type: JourneyType;
  total_seats: number;
  available_seats: number;
  price_per_seat: number;
  gender_pref: GenderPreference;
  notes?: string | null;
  status: JourneyStatus;
  captain?: Profile;
  created_at: string;
  updated_at?: string;
  // Soft-delete (0005_admin_dashboard_fofi.sql): set when the captain
  // "deletes" their own journey. The row stays intact for admins until they
  // permanently delete it, or 15 days pass and it's auto-purged.
  deleted_at?: string | null;
  deleted_by?: string | null;
  // 15-day search discoverability window (0007_retention.sql) — distinct
  // from the soft-delete purge above. See extendJourneyDiscoverability().
  discoverable_until?: string;
  expiry_notified_at?: string | null;
}

// A user-saved location shortcut (e.g. "البيت", "الشغل") — surfaced as
// quick chips inside LocationPicker. 0005_admin_dashboard_fofi.sql.
export interface FavoritePlace {
  id: string;
  user_id: string;
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  created_at: string;
}

// A passenger's persisted search (0007_retention.sql) — kept purely to
// drive the 15-day "your search is expiring" reminder and to restore the
// last search on return. Not the matching engine itself; that's still
// find_matching_journeys, called fresh every time.
export interface SearchRequest {
  id: string;
  passenger_id: string;
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
  start_address: string;
  end_address: string;
  departure_time: string;
  radius_km: number;
  school_mode: boolean;
  child_id: string | null;
  status: 'active' | 'expired' | 'cancelled';
  expires_at: string;
  expiry_notified_at: string | null;
  created_at: string;
  updated_at: string;
}

// A message sent through the FOFi assistant's "تواصل مع الدعم" hand-off
// when its FAQ matching can't answer the question. 0005_admin_dashboard_fofi.sql.
export interface SupportMessage {
  id: string;
  user_id?: string | null;
  contact_phone?: string | null;
  message: string;
  context?: string | null;
  status: 'open' | 'resolved';
  created_at: string;
}

export interface Booking {
  id: string;
  journey_id: string;
  passenger_id: string;
  seats_booked: number;
  price_offered: number;
  final_price: number;
  status: BookingStatus;
  journey?: Journey;
  passenger?: Profile;
  created_at?: string;
}

// The live table's real columns are license_plate/capacity/vehicle_type —
// plate_number/seats/type below are bridge columns added by
// 0004_frontend_reconciliation.sql (kept in sync via trigger) so this
// interface didn't have to change.
export interface Vehicle {
  id: string;
  captain_id: string;
  make: string;
  model: string;
  color?: string;
  plate_number?: string;
  // Determined server-side from `type` (private=4, bus=14, suzuki=10) —
  // sent by the client on create but always overwritten by the
  // trg_vehicles_fleet_rules trigger, so treat it as read-only in the UI.
  seats: number;
  type: VehicleType;
  // Always false for suzuki, enforced by the same trigger.
  is_ac: boolean;
  created_at?: string;
}

// The live table has more columns (category, priority) that the client
// doesn't read — omitted here since nothing in the app uses them.
export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  body?: string;
  link?: string | null;
  is_read: boolean;
  created_at: string;
}

// The live table is actually keyed by conversation_id, with its own
// `conversations` table (created automatically by accept_booking_rpc).
// `booking_id` below is a bridge column added by
// 0004_frontend_reconciliation.sql (resolved to conversation_id via
// trigger) so this interface — and sendMessage/fetchMessages, which filter
// on booking_id directly — didn't have to change.
export interface ChatMessage {
  id: string;
  booking_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender?: Profile;
}

// The live table also requires journey_id (not modeled here since the
// client never sends or reads it) — 0004_frontend_reconciliation.sql
// derives it automatically from booking_id on insert via trigger.
// `is_hidden` was added by that same migration to support admin moderation
// (moderate_review_rpc) without deleting the row.
export interface Review {
  id: string;
  booking_id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  comment?: string | null;
  is_hidden: boolean;
  created_at: string;
  reviewer?: Profile;
}

// plan/status/trial_ends_at were added to the live table by
// 0004_frontend_reconciliation.sql (the enums already existed; the columns
// didn't). One subscription per booking on a weekly/monthly journey,
// starting in `trial` for 3 calendar days (`trial_ends_at`, set by the
// client at insert) before the passenger continues or stops via
// continue_subscription_rpc/stop_subscription_rpc — refund math for an
// early stop runs entirely server-side.
export interface Subscription {
  id: string;
  booking_id: string;
  passenger_id: string;
  captain_id: string;
  journey_id: string;
  plan: Extract<JourneyType, 'weekly' | 'monthly'>;
  status: SubscriptionStatus;
  trial_ends_at: string;
  created_at: string;
  booking?: Booking;
}

export interface MatchingResult {
  journey_id: string;
  captain_id: string;
  captain_name: string;
  captain_avatar?: string;
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
}