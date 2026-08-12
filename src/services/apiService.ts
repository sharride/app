import { supabase } from '../config/supabase';
import type { Journey, Booking, Profile, JourneyType, Vehicle, VehicleType, AppNotification, ChatMessage, Review, Subscription, ProfileChild, GenderPreference, UserRole, FavoritePlace, SupportMessage, SearchRequest } from '../types';

// Auth Services
export const signInWithProvider = async (provider: 'google' | 'facebook') => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin }
  });
  if (error) throw error;
  return data;
};

export const updateTermsAcceptance = async (userId: string) => {
  const { data, error } = await supabase
    .from('profiles')
    .update({ terms_accepted: true, terms_version: 'v1.0', status: 'active' })
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return data;
};

// NOTE: 'role' and 'captain_enabled' are intentionally NOT updatable here.
// A trigger in 0006_captain_activation.sql rejects direct writes to either
// column from a plain UPDATE — they can only change via rpc_select_role /
// rpc_activate_captain below, which verify eligibility server-side.
export const updateProfile = async (
  userId: string,
  updates: Partial<Pick<Profile, 'full_name' | 'city' | 'governorate' | 'phone_number' | 'avatar_url' | 'gender' | 'national_id'>>
) => {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return data as Profile;
};

// Sets the ACTIVE role (profiles.role) for the signed-in user. 'passenger'
// always succeeds. 'captain' only succeeds if captain_enabled is already
// true server-side — otherwise throws with message 'captain_not_activated'
// so the caller can route into the captain setup flow instead.
export const selectActiveRole = async (role: Extract<UserRole, 'passenger' | 'captain'>): Promise<Profile> => {
  const { data, error } = await supabase.rpc('rpc_select_role', { p_role: role });
  if (error) throw error;
  return data as Profile;
};

// Server-side verifies identity (name/gender/national ID/phone) + at least
// one fully-specified vehicle, then sets captain_enabled=true and
// role='captain' in one atomic step. Throws 'identity_incomplete' or
// 'vehicle_incomplete' if not ready yet — never partially activates.
export const activateCaptain = async (): Promise<Profile> => {
  const { data, error } = await supabase.rpc('rpc_activate_captain');
  if (error) throw error;
  return data as Profile;
};

// ---------------------------------------------------------------------------
// Avatar upload. Bucket `avatars` is created (public, per-user-folder RLS)
// in supabase/migrations/0003_storage.sql -- path shape here
// (`${userId}/avatar-*.ext`) matches that migration's policies exactly.
// ---------------------------------------------------------------------------
export const uploadAvatar = async (userId: string, file: File): Promise<string> => {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, {
    upsert: true,
    contentType: file.type
  });
  if (uploadError) throw uploadError;
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
};

// Journey Services
export interface CreateJourneyParams {
  vehicleId: string;
  startLng: number;
  startLat: number;
  endLng: number;
  endLat: number;
  startAddress: string;
  endAddress: string;
  departureTime: string;
  journeyType: JourneyType;
  totalSeats: number;
  pricePerSeat: number;
  notes?: string | null;
}

export const createJourneyRPC = async (params: CreateJourneyParams) => {
  const { data, error } = await supabase.rpc('create_journey_rpc', {
    p_vehicle_id: params.vehicleId,
    p_start_lng: params.startLng,
    p_start_lat: params.startLat,
    p_end_lng: params.endLng,
    p_end_lat: params.endLat,
    p_start_address: params.startAddress,
    p_end_address: params.endAddress,
    p_departure_time: params.departureTime,
    p_journey_type: params.journeyType,
    p_total_seats: params.totalSeats,
    p_price_per_seat: params.pricePerSeat,
    p_notes: params.notes || null
  });
  if (error) throw error;
  return data;
};

export const fetchActiveJourneys = async () => {
  const { data, error } = await supabase
    .from('journeys')
    .select('*, captain:profiles!journeys_captain_id_fkey(*)')
    .in('status', ['published', 'active', 'receiving_bookings'])
    .limit(20);
  if (error) return [];
  return (data || []) as Journey[];
};

export const fetchJourneyById = async (id: string): Promise<Journey> => {
  const { data, error } = await supabase
    .from('journeys')
    .select('*, captain:profiles!journeys_captain_id_fkey(*)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as Journey;
};

export const fetchMyCaptainJourneys = async (): Promise<Journey[]> => {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return [];
  const { data, error } = await supabase
    .from('journeys')
    .select('*')
    .eq('captain_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as Journey[];
};

// Soft-delete a journey the current user captains. It disappears from
// search/my-journeys but stays intact for admins (see 0005 migration) —
// either they permanently delete it, or it auto-purges after 15 days.
export const cancelOwnJourney = async (journeyId: string): Promise<void> => {
  const { error } = await supabase.rpc('cancel_own_journey_rpc', { p_journey_id: journeyId });
  if (error) throw error;
};

// "خليها مستمرة" action from the journey-nearing-expiration notification —
// resets the 15-day discoverability window (0007_retention.sql). Owner-only
// server-side (rpc raises if you don't captain this journey).
export const extendJourneyDiscoverability = async (journeyId: string): Promise<Journey> => {
  const { data, error } = await supabase.rpc('extend_journey_discoverability_rpc', { p_journey_id: journeyId });
  if (error) throw error;
  return data as Journey;
};

// ---------------------------------------------------------------------------
// Search requests — persisted passenger search (0007_retention.sql). Plain
// owner-RLS CRUD, same shape as favorite_places, no RPCs needed: the table
// only exists to drive the 15-day "your search is expiring" reminder and to
// let SearchMatchingPage restore your last search on return. It does not
// replace live matching — findMatchingJourneysRPC above is still what
// actually returns results, every time, same as before.
// ---------------------------------------------------------------------------
export interface SaveSearchRequestParams {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  startAddress: string;
  endAddress: string;
  departureTime: string;
  radiusKm: number;
  schoolMode?: boolean;
  childId?: string | null;
}

// One active saved search per passenger: updates the existing active row if
// there is one, otherwise inserts. Re-searching just refreshes it (and
// implicitly un-expires it) rather than piling up rows.
export const saveMySearchRequest = async (params: SaveSearchRequestParams): Promise<void> => {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return; // guests can search but have nothing to persist
  const { data: existing } = await supabase
    .from('search_requests')
    .select('id')
    .eq('passenger_id', user.id)
    .eq('status', 'active')
    .maybeSingle();

  const row = {
    passenger_id: user.id,
    start_lat: params.startLat,
    start_lng: params.startLng,
    end_lat: params.endLat,
    end_lng: params.endLng,
    start_address: params.startAddress,
    end_address: params.endAddress,
    departure_time: params.departureTime,
    radius_km: params.radiusKm,
    school_mode: params.schoolMode || false,
    child_id: params.childId || null,
    status: 'active',
    expires_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
    expiry_notified_at: null
  };

  if (existing) {
    const { error } = await supabase.from('search_requests').update(row).eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('search_requests').insert(row);
    if (error) throw error;
  }
};

export const fetchMyActiveSearchRequest = async (): Promise<SearchRequest | null> => {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return null;
  const { data, error } = await supabase
    .from('search_requests')
    .select('*')
    .eq('passenger_id', user.id)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as SearchRequest) || null;
};

// "خليه شغال" — extends the 15-day window without re-running the search.
export const extendMySearchRequest = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('search_requests')
    .update({ expires_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(), expiry_notified_at: null, status: 'active' })
    .eq('id', id);
  if (error) throw error;
};

// "خلاص كده" — soft-cancel, row stays for history, same as journeys.
export const cancelMySearchRequest = async (id: string): Promise<void> => {
  const { error } = await supabase.from('search_requests').update({ status: 'cancelled' }).eq('id', id);
  if (error) throw error;
};

// ---------------------------------------------------------------------------
// Favorite places — saved shortcuts (e.g. "البيت", "الشغل") shown as quick
// chips inside LocationPicker. See location-picker-engineering-report.md
// suggestion #1.
// ---------------------------------------------------------------------------
export const fetchFavoritePlaces = async (): Promise<FavoritePlace[]> => {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return [];
  const { data, error } = await supabase
    .from('favorite_places')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as FavoritePlace[];
};

export const addFavoritePlace = async (place: { label: string; address: string; latitude: number; longitude: number }): Promise<FavoritePlace> => {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error('يجب تسجيل الدخول لحفظ مكان مفضّل');
  const { data, error } = await supabase
    .from('favorite_places')
    .insert({ user_id: user.id, ...place })
    .select()
    .single();
  if (error) throw error;
  return data as FavoritePlace;
};

export const deleteFavoritePlace = async (id: string): Promise<void> => {
  const { error } = await supabase.from('favorite_places').delete().eq('id', id);
  if (error) throw error;
};

// Matching Services
export interface FindMatchingParams {
  startLng: number;
  startLat: number;
  endLng: number;
  endLat: number;
  departureTime: string;
  radiusKm?: number;
  // School-route search on behalf of a child — only when true can a suzuki
  // (school microbus) show up in results; childId is optional context and
  // is re-validated server-side against the caller.
  schoolMode?: boolean;
  childId?: string;
}

export const findMatchingJourneysRPC = async (params: FindMatchingParams) => {
  const { data, error } = await supabase.rpc('find_matching_journeys', {
    p_start_lng: params.startLng,
    p_start_lat: params.startLat,
    p_end_lng: params.endLng,
    p_end_lat: params.endLat,
    p_departure_time: params.departureTime,
    p_radius_km: params.radiusKm || 5.0,
    p_school_mode: params.schoolMode || false,
    p_child_id: params.childId || null
  });
  if (error) throw error;
  return data || [];
};

// Booking Services
export interface CreateBookingParams {
  journeyId: string;
  seatsBooked: number;
  priceOffered: number;
  // Passed from the already-loaded Journey so a subscription record can be
  // created for weekly/monthly bookings without an extra fetch. Optional so
  // existing callers that don't care about subscriptions keep working.
  journeyType?: JourneyType;
  captainId?: string;
}

// Uses create_booking_rpc (supabase/migrations/0002_rpc_and_policies.sql),
// which locks the journey row before checking/reserving seats -- the
// previous direct `.insert()` here had no seat lock, so two passengers
// requesting the last seat at the same moment could both have succeeded
// client-side. RLS still applies; this RPC is the authoritative check.
export const createBookingRequest = async (params: CreateBookingParams) => {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error('يرجى تسجيل الدخول أولاً');
  const { data, error } = await supabase.rpc('create_booking_rpc', {
    p_journey_id: params.journeyId,
    p_seats_booked: params.seatsBooked,
    p_price_offered: params.priceOffered
  });
  if (error) throw error;
  const booking = data as Booking;

  if ((params.journeyType === 'weekly' || params.journeyType === 'monthly') && params.captainId) {
    // Best-effort: a failure here shouldn't fail the booking itself, since
    // the booking already succeeded and is the source of truth.
    try {
      await createSubscriptionForBooking({
        bookingId: booking.id,
        journeyId: params.journeyId,
        captainId: params.captainId,
        passengerId: user.id,
        plan: params.journeyType
      });
    } catch {
      // swallow — see comment above
    }
  }

  return booking;
};

export const fetchMyBookings = async (): Promise<Booking[]> => {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return [];
  const { data, error } = await supabase
    .from('bookings')
    .select('*, journey:journeys(*, captain:profiles!journeys_captain_id_fkey(*))')
    .eq('passenger_id', user.id)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data || []) as Booking[];
};

/**
 * Booking requests received by a captain, across all of their journeys.
 * Uses an inner join on journeys so the `.eq('journeys.captain_id', ...)`
 * filter is applied server-side (PostgREST requires `!inner` to filter on an
 * embedded/joined resource).
 */
export const fetchBookingRequestsForCaptain = async (): Promise<Booking[]> => {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return [];
  const { data, error } = await supabase
    .from('bookings')
    .select('*, journey:journeys!inner(*), passenger:profiles(*)')
    .eq('journey.captain_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as Booking[];
};

/**
 * Accept or reject a booking request.
 *
 * Calls accept_booking_rpc / reject_booking_rpc (see
 * supabase/migrations/0002_rpc_and_policies.sql) instead of a direct
 * `.update()` on `bookings`. Those RPCs atomically lock the journey row,
 * decrement `available_seats` on acceptance, flip the journey to `full`
 * when seats hit zero, verify the caller is really the journey's captain,
 * and drop a notification for the passenger -- none of which a plain
 * column update could do safely.
 */
export const updateBookingStatus = async (
  bookingId: string,
  status: 'accepted' | 'rejected'
): Promise<Booking> => {
  const rpcName = status === 'accepted' ? 'accept_booking_rpc' : 'reject_booking_rpc';
  const { data, error } = await supabase.rpc(rpcName, { p_booking_id: bookingId });
  if (error) throw error;
  return data as Booking;
};

/**
 * Marks a journey (and its accepted bookings) as completed via
 * complete_journey_rpc. This is the trigger point for FS-12's
 * "رحلات بانتظار تقييمك" reminder -- the RPC drops a review-reminder
 * notification for every passenger and the captain.
 */
export const completeJourney = async (journeyId: string): Promise<void> => {
  const { error } = await supabase.rpc('complete_journey_rpc', { p_journey_id: journeyId });
  if (error) throw error;
};

// ---------------------------------------------------------------------------
// Vehicle Services — `vehicles` table defined in
// supabase/migrations/0001_core_schema.sql, owned by `captain_id`.
// ---------------------------------------------------------------------------

export interface CreateVehicleParams {
  make: string;
  model: string;
  color?: string;
  plateNumber?: string;
  type: VehicleType;
  // Ignored for type 'suzuki' — trg_vehicles_fleet_rules always forces it
  // to false server-side. Seats are also server-computed from `type`
  // (private=4, bus=14, suzuki=10) and aren't sent from here at all.
  isAc: boolean;
}

export const fetchMyVehicles = async (): Promise<Vehicle[]> => {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return [];
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .eq('captain_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as Vehicle[];
};

export const createVehicle = async (params: CreateVehicleParams): Promise<Vehicle> => {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error('يرجى تسجيل الدخول أولاً');
  const { data, error } = await supabase
    .from('vehicles')
    .insert({
      captain_id: user.id,
      make: params.make,
      model: params.model,
      color: params.color || null,
      plate_number: params.plateNumber || null,
      // Placeholder — always overwritten by trg_vehicles_fleet_rules based
      // on `type`, required only because the column is not-null.
      seats: 1,
      type: params.type,
      is_ac: params.isAc
    })
    .select()
    .single();
  if (error) throw error;
  return data as Vehicle;
};

export const calculatePriceRPC = async (distanceMeters: number, journeyType: JourneyType = 'daily'): Promise<number> => {
  const { data, error } = await supabase.rpc('calculate_journey_price_rpc', {
    p_distance_meters: distanceMeters,
    p_journey_type: journeyType
  });
  if (error) throw error;
  return data as number;
};

export const deleteVehicle = async (vehicleId: string): Promise<void> => {
  const { error } = await supabase.from('vehicles').delete().eq('id', vehicleId);
  if (error) throw error;
};

// ---------------------------------------------------------------------------
// Child sub-profiles — `profiles_child` table, RLS-scoped to the owning
// parent (p_profiles_child_owner in 0002_rpc_and_policies.sql), so plain
// table access is safe here without an RPC.
// ---------------------------------------------------------------------------
export interface CreateChildParams {
  fullName: string;
  age?: number;
  school?: string;
  genderPref?: GenderPreference;
}

export const fetchMyChildren = async (): Promise<ProfileChild[]> => {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return [];
  const { data, error } = await supabase
    .from('profiles_child')
    .select('*')
    .eq('parent_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as ProfileChild[];
};

export const createChild = async (params: CreateChildParams): Promise<ProfileChild> => {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error('يرجى تسجيل الدخول أولاً');
  const { data, error } = await supabase
    .from('profiles_child')
    .insert({
      parent_id: user.id,
      full_name: params.fullName,
      age: params.age ?? null,
      school: params.school || null,
      gender_pref: params.genderPref || 'everyone'
    })
    .select()
    .single();
  if (error) throw error;
  return data as ProfileChild;
};

export const deleteChild = async (childId: string): Promise<void> => {
  const { error } = await supabase.from('profiles_child').delete().eq('id', childId);
  if (error) throw error;
};

// ---------------------------------------------------------------------------
// Notification Services — `notifications` table defined in
// supabase/migrations/0001_core_schema.sql, scoped by `user_id`. Rows are
// written server-side by accept_booking_rpc / reject_booking_rpc /
// complete_journey_rpc (0002_rpc_and_policies.sql).
// ---------------------------------------------------------------------------

export const fetchMyNotifications = async (): Promise<AppNotification[]> => {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return [];
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data || []) as AppNotification[];
};

export const markNotificationRead = async (notificationId: string): Promise<void> => {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId);
  if (error) throw error;
};

// ---------------------------------------------------------------------------
// Chat Services — `messages` table defined in
// supabase/migrations/0001_core_schema.sql, keyed directly by `booking_id`
// (no separate `conversations` table). RLS (p_messages_select_parties /
// p_messages_insert_parties) enforces the spec's "chat opens only after an
// accepted booking" rule server-side. A chat "thread" is simply an
// accepted/completed booking the current user is party to, so thread
// listing reuses the existing booking fetchers rather than a new table.
// ---------------------------------------------------------------------------

export const fetchMyChatThreads = async (isCaptain: boolean): Promise<Booking[]> => {
  const bookings = isCaptain ? await fetchBookingRequestsForCaptain() : await fetchMyBookings();
  return bookings.filter((b) => b.status === 'accepted' || b.status === 'completed');
};

export const fetchMessages = async (bookingId: string): Promise<ChatMessage[]> => {
  const { data, error } = await supabase
    .from('messages')
    .select('*, sender:profiles(*)')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []) as ChatMessage[];
};

export const sendMessage = async (bookingId: string, content: string): Promise<ChatMessage> => {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error('يرجى تسجيل الدخول أولاً');
  const trimmed = content.trim();
  if (!trimmed) throw new Error('لا يمكن إرسال رسالة فارغة');
  const { data, error } = await supabase
    .from('messages')
    .insert({ booking_id: bookingId, sender_id: user.id, content: trimmed })
    .select('*, sender:profiles(*)')
    .single();
  if (error) throw error;
  return data as ChatMessage;
};

/**
 * Subscribe to new messages on a single booking's thread in realtime.
 * Returns an unsubscribe function — always call it on unmount/thread change
 * to avoid leaking channels.
 */
export const subscribeToMessages = (
  bookingId: string,
  onInsert: (message: ChatMessage) => void
): (() => void) => {
  const channel = supabase
    .channel(`messages:booking:${bookingId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `booking_id=eq.${bookingId}` },
      (payload) => onInsert(payload.new as ChatMessage)
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
};

/**
 * Subscribe to new notifications for the given user in realtime.
 * Returns an unsubscribe function.
 */
export const subscribeToNotifications = (
  userId: string,
  onInsert: (notification: AppNotification) => void
): (() => void) => {
  const channel = supabase
    .channel(`notifications:user:${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      (payload) => onInsert(payload.new as AppNotification)
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
};

// ---------------------------------------------------------------------------
// Review Services — `reviews` table defined in
// supabase/migrations/0001_core_schema.sql, with a unique
// (booking_id, reviewer_id) constraint enforcing "one rating per user per
// trip" server-side (client also checks this before opening the form, per
// FS-12). `profiles.trust_score` is recomputed by a DB trigger, not by this
// file -- see createReview() below.
// ---------------------------------------------------------------------------

/**
 * A completed booking the current user was part of (as passenger or as the
 * journey's captain), paired with the *other* party's profile — i.e. who
 * would be reviewed — and whether the current user has already reviewed it.
 */
export interface ReviewableTrip {
  booking: Booking;
  otherParty: Profile;
  alreadyReviewed: boolean;
}

export const fetchReviewableTrips = async (isCaptain: boolean): Promise<ReviewableTrip[]> => {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return [];

  const bookings = isCaptain ? await fetchBookingRequestsForCaptain() : await fetchMyBookings();
  const completed = bookings.filter((b) => b.status === 'completed');
  if (completed.length === 0) return [];

  const { data: myReviews, error } = await supabase
    .from('reviews')
    .select('booking_id')
    .eq('reviewer_id', user.id)
    .in('booking_id', completed.map((b) => b.id));
  if (error) throw error;
  const reviewedIds = new Set((myReviews || []).map((r: { booking_id: string }) => r.booking_id));

  return completed
    .map((booking) => {
      const otherParty = isCaptain ? booking.passenger : booking.journey?.captain;
      if (!otherParty) return null;
      return { booking, otherParty, alreadyReviewed: reviewedIds.has(booking.id) } as ReviewableTrip;
    })
    .filter((t): t is ReviewableTrip => t !== null);
};

export interface CreateReviewParams {
  bookingId: string;
  revieweeId: string;
  rating: number;
  comment?: string;
}

export const createReview = async (params: CreateReviewParams): Promise<Review> => {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error('يرجى تسجيل الدخول أولاً');
  if (params.rating < 1 || params.rating > 5) throw new Error('التقييم يجب أن يكون بين 1 و5 نجوم');

  const { data, error } = await supabase
    .from('reviews')
    .insert({
      booking_id: params.bookingId,
      reviewer_id: user.id,
      reviewee_id: params.revieweeId,
      rating: params.rating,
      comment: params.comment?.trim() || null
    })
    .select()
    .single();
  // A unique-constraint violation here means this trip was already rated —
  // surface it as the same "already reviewed" message the spec calls for
  // (Scenario 2) rather than a raw Postgres error.
  if (error) {
    if (error.code === '23505') throw new Error('لقد قمت بتقييم هذه الرحلة بالفعل');
    throw error;
  }

  // profiles.trust_score is recomputed server-side by the
  // trg_reviews_recompute_trust_score trigger (0002_rpc_and_policies.sql)
  // on every review insert/update/delete -- no client call needed, and no
  // read-then-write race is possible anymore.
  return data as Review;
};

export const fetchReviewsForUser = async (userId: string): Promise<Review[]> => {
  const { data, error } = await supabase
    .from('reviews')
    .select('*, reviewer:profiles!reviews_reviewer_id_fkey(*)')
    .eq('reviewee_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data || []) as Review[];
};

// ---------------------------------------------------------------------------
// Subscription Services
//
// continueSubscription/stopSubscription now call continue_subscription_rpc /
// stop_subscription_rpc (0002_rpc_and_policies.sql), which own the pricing
// math the spec requires to run "بالكامل داخل Backend" (locked-distance/
// per-km pricing lives in calculate_journey_price_rpc; refund math for an
// early stop lives in stop_subscription_rpc). No payment gateway exists yet
// (MVP is 100% free per handoff §8), so stopSubscription returns the
// computed refund *amount* for display -- it does not move real money.
// ---------------------------------------------------------------------------

export interface CreateSubscriptionParams {
  bookingId: string;
  journeyId: string;
  captainId: string;
  passengerId: string;
  plan: 'weekly' | 'monthly';
}

const TRIAL_PERIOD_DAYS = 3;

const createSubscriptionForBooking = async (params: CreateSubscriptionParams): Promise<Subscription> => {
  const trialEndsAt = new Date(Date.now() + TRIAL_PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('subscriptions')
    .insert({
      booking_id: params.bookingId,
      journey_id: params.journeyId,
      captain_id: params.captainId,
      passenger_id: params.passengerId,
      plan: params.plan,
      status: 'trial',
      trial_ends_at: trialEndsAt
    })
    .select()
    .single();
  if (error) throw error;
  return data as Subscription;
};

export const fetchMySubscriptions = async (): Promise<Subscription[]> => {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return [];
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*, booking:bookings(*, journey:journeys(*))')
    .eq('passenger_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as Subscription[];
};

/**
 * Passenger chooses "Continue Subscription" after the 3-day trial (spec:
 * "Continue Subscription"). NOTE: the spec also calls for deducting the
 * trial days' cost and calculating the remaining amount here — that math is
 * explicitly backend-only per the spec and isn't implemented; this only
 * flips the state to `active`.
 */
export const continueSubscription = async (subscriptionId: string): Promise<void> => {
  const { error } = await supabase.rpc('continue_subscription_rpc', { p_subscription_id: subscriptionId });
  if (error) throw error;
};

/**
 * Passenger chooses "Stop Subscription". Returns the refund amount computed
 * server-side (0 if the trial already ended -- see stop_subscription_rpc's
 * comment on why post-trial cancellation compensation isn't calculated).
 */
export const stopSubscription = async (subscriptionId: string): Promise<number> => {
  const { data, error } = await supabase.rpc('stop_subscription_rpc', { p_subscription_id: subscriptionId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row?.refund_amount as number) ?? 0;
};

// ---------------------------------------------------------------------------
// Admin Services
//
// Unlike vehicles/notifications/messages, these read from `profiles`,
// `journeys`, and `bookings` — all three are tables the app already queries
// elsewhere and are confirmed to exist. No schema assumption here beyond
// what the rest of the app already relies on.
// ---------------------------------------------------------------------------

export interface AdminStats {
  totalUsers: number;
  totalCaptains: number;
  totalPassengers: number;
  totalJourneys: number;
  activeJourneys: number;
  totalBookings: number;
  pendingBookings: number;
  recentUsers: Profile[];
}

export const fetchAdminStats = async (): Promise<AdminStats> => {
  const [
    { count: totalUsers },
    { count: totalCaptains },
    { count: totalPassengers },
    { count: totalJourneys },
    { count: activeJourneys },
    { count: totalBookings },
    { count: pendingBookings },
    { data: recentUsers }
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'captain'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'passenger'),
    supabase.from('journeys').select('*', { count: 'exact', head: true }),
    supabase.from('journeys').select('*', { count: 'exact', head: true }).in('status', ['published', 'active', 'receiving_bookings']),
    supabase.from('bookings').select('*', { count: 'exact', head: true }),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(5)
  ]);

  return {
    totalUsers: totalUsers || 0,
    totalCaptains: totalCaptains || 0,
    totalPassengers: totalPassengers || 0,
    totalJourneys: totalJourneys || 0,
    activeJourneys: activeJourneys || 0,
    totalBookings: totalBookings || 0,
    pendingBookings: pendingBookings || 0,
    recentUsers: (recentUsers || []) as Profile[]
  };
};

/**
 * Realtime for the admin dashboard itself (closes the "realtime for the
 * admin dashboard" item every session's CHANGELOG listed as not done).
 * Rather than trying to patch individual counters from three different
 * tables' payloads, this just calls `onChange` (a full `fetchAdminStats()`
 * refetch, see AdminPage.tsx) whenever any row changes on any of the three
 * tables the stats are built from -- simpler and always consistent, at the
 * cost of one extra query per event instead of an in-place counter bump.
 */
export const subscribeToAdminActivity = (onChange: () => void): (() => void) => {
  const channel = supabase
    .channel('admin:activity')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'journeys' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, onChange)
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
};

// ---------------------------------------------------------------------------
// Review moderation (admin) — closes "review moderation/hide-without-delete
// for admins" from CHANGELOG session 3. Hiding a review excludes it from
// public select (RLS: p_reviews_select_visible) and from the trust_score
// average (trg_recompute_trust_score filters `not is_hidden`), without
// deleting the row.
// ---------------------------------------------------------------------------

export const fetchRecentReviewsForAdmin = async (): Promise<Review[]> => {
  const { data, error } = await supabase
    .from('reviews')
    .select('*, reviewer:profiles!reviews_reviewer_id_fkey(*)')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data || []) as Review[];
};

export const moderateReview = async (reviewId: string, hidden: boolean): Promise<void> => {
  const { error } = await supabase.rpc('moderate_review_rpc', { p_review_id: reviewId, p_hidden: hidden });
  if (error) throw error;
};

// ---------------------------------------------------------------------------
// Admin: user (profiles) management
// ---------------------------------------------------------------------------
export const fetchAllProfilesForAdmin = async (): Promise<Profile[]> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data || []) as Profile[];
};

// Uses admin_set_user_role_rpc instead of a raw .update() so role changes
// are audit-logged and an admin can't accidentally demote themselves.
export const adminSetUserRole = async (userId: string, role: UserRole): Promise<Profile> => {
  const { data, error } = await supabase.rpc('admin_set_user_role_rpc', { p_user_id: userId, p_role: role });
  if (error) throw error;
  return data as Profile;
};

// ---------------------------------------------------------------------------
// Admin: journeys / fleet management
// ---------------------------------------------------------------------------
export const fetchAllJourneysForAdmin = async (): Promise<Journey[]> => {
  // p_journeys_admin_select_all (RLS) lets an admin see every journey,
  // including soft-deleted ones — deleted_at is not null for those.
  const { data, error } = await supabase
    .from('journeys')
    .select('*, captain:profiles!journeys_captain_id_fkey(*)')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data || []) as Journey[];
};

export const adminUpdateJourney = async (
  journeyId: string,
  updates: Partial<Pick<Journey, 'status' | 'price_per_seat' | 'total_seats' | 'available_seats' | 'departure_time'>>
): Promise<Journey> => {
  const { data, error } = await supabase
    .from('journeys')
    .update(updates)
    .eq('id', journeyId)
    .select()
    .single();
  if (error) throw error;
  return data as Journey;
};

// Permanent delete — only ever reachable for an already soft-deleted
// journey from the admin UI (see AdminPage.tsx), though the RPC itself
// allows an admin to delete any journey.
export const adminDeleteJourneyPermanently = async (journeyId: string): Promise<void> => {
  const { error } = await supabase.rpc('admin_delete_journey_rpc', { p_journey_id: journeyId });
  if (error) throw error;
};

// Best-effort fallback for the 15-day auto-purge rule on projects without
// pg_cron enabled (common on the free tier) — called once when the admin
// dashboard loads. Failures are swallowed; this is a housekeeping nicety,
// not something that should block the dashboard from rendering.
export const purgeExpiredDeletedJourneys = async (): Promise<void> => {
  try {
    await supabase.rpc('purge_expired_deleted_journeys_rpc');
  } catch {
    /* non-critical */
  }
};

// ---------------------------------------------------------------------------
// Support messages — FOFi's "تواصل مع الدعم" hand-off, and the admin inbox
// for it.
// ---------------------------------------------------------------------------
export const submitSupportMessage = async (message: string, context?: string): Promise<void> => {
  const user = (await supabase.auth.getUser()).data.user;
  const { error } = await supabase.from('support_messages').insert({
    user_id: user?.id || null,
    message,
    context: context || null
  });
  if (error) throw error;
};

export const fetchSupportMessagesForAdmin = async (): Promise<SupportMessage[]> => {
  const { data, error } = await supabase
    .from('support_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data || []) as SupportMessage[];
};

export const resolveSupportMessage = async (id: string, resolved: boolean): Promise<void> => {
  const { error } = await supabase
    .from('support_messages')
    .update({ status: resolved ? 'resolved' : 'open' })
    .eq('id', id);
  if (error) throw error;
};
