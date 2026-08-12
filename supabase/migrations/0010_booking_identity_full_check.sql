-- =============================================================================
-- sharride — 0010_booking_identity_full_check.sql
--
-- WHY THIS FILE EXISTS
-- ---------------------------------------------------------------------------
-- Fresh audit pass (see accompanying report) found that create_booking_rpc
-- (0008_booking_identity_requirements.sql) only checks phone_number before
-- letting a booking through. The frontend's single source of truth for
-- "is this profile allowed to book", isIdentityComplete() in
-- src/utils/identity.ts, requires four fields: full_name, gender,
-- a valid 14-digit national_id, and phone_number — and its own comment says
-- to "keep in sync" with the server-side checks, which had drifted out of
-- sync. rpc_activate_captain() (0006_captain_activation.sql) already checks
-- all four for captains; create_booking_rpc never did for passengers.
--
-- Net effect before this fix: a passenger could call
-- supabase.rpc('create_booking_rpc', {...}) directly (bypassing
-- IdentityGate/IdentityForm entirely) after only ever setting a phone
-- number, and successfully create a real booking with no verified name,
-- gender, or national ID on file — exactly the "identity requirement
-- bypass via direct RPC call" class of bug called out in the project's own
-- security rules (§2 "Security First": never rely on hiding a UI element;
-- §9 "لا تعمل authorization في frontend فقط").
--
-- Same signature, same body, same audit logging as 0008 — only the guard
-- at the top is widened from one field to the full identity check, mirrored
-- character-for-character from rpc_activate_captain()'s check so the two
-- can't drift again without both being touched in the same review.
-- =============================================================================

create or replace function create_booking_rpc(
  p_journey_id uuid,
  p_seats_booked integer,
  p_price_offered numeric
) returns bookings as $$
declare
  v_journey journeys;
  v_booking bookings;
  v_profile profiles;
begin
  select * into v_profile from profiles where id = auth.uid();

  if not (
    coalesce(trim(v_profile.full_name), '') <> ''
    and v_profile.gender in ('male', 'female')
    and v_profile.national_id is not null
    and v_profile.national_id ~ '^\d{14}$'
    and coalesce(trim(v_profile.phone_number), '') <> ''
  ) then
    raise exception 'identity_incomplete' using errcode = 'P0001';
  end if;

  select * into v_journey from journeys where id = p_journey_id for update;
  if not found then
    raise exception 'الرحلة غير موجودة';
  end if;
  if v_journey.status not in ('published','active','receiving_bookings') then
    raise exception 'هذه الرحلة غير متاحة للحجز حاليًا';
  end if;
  if v_journey.available_seats < p_seats_booked then
    raise exception 'عدد المقاعد المطلوب غير متاح';
  end if;
  if v_journey.captain_id = auth.uid() then
    raise exception 'لا يمكنك الحجز في رحلتك الخاصة';
  end if;

  insert into bookings (journey_id, passenger_id, seats_booked, price_offered, final_price, status)
  values (p_journey_id, auth.uid(), p_seats_booked, p_price_offered, p_price_offered, 'pending')
  returning * into v_booking;

  insert into audit_logs (actor_id, action, target_type, target_id)
    values (auth.uid(), 'create_booking', 'booking', v_booking.id);

  return v_booking;
end;
$$ language plpgsql security definer;

-- =============================================================================
-- FIX 2 — p_journeys_owner_update (0002_rpc_and_policies.sql) is a direct,
-- column-unrestricted RLS UPDATE policy: `for update using (auth.uid() =
-- captain_id)`, no WITH CHECK, no trigger guard. Every legitimate write a
-- captain makes to their own journey already goes through a SECURITY
-- DEFINER RPC — create_journey_rpc (insert), cancel_own_journey_rpc
-- (soft delete, 0005), complete_journey_rpc (completion) — and none of
-- those need this policy, since SECURITY DEFINER functions run as the
-- function owner and are not subject to the caller's RLS policies.
-- Confirmed against src/services/apiService.ts: no code path does a direct
-- supabase.from('journeys').update(...) as the owning captain (the only
-- direct .update() on journeys is adminUpdateJourney, gated separately by
-- p_journeys_admin_update / is_admin()).
--
-- Left in place, this policy lets any captain bypass every guard the RPCs
-- enforce with a single direct REST/JS-client call on their own journey:
-- set available_seats back up after bookings were accepted (undoing
-- accept_booking_rpc's seat lock), flip status straight to 'completed'
-- without complete_journey_rpc's trip-count/review-notification side
-- effects, change price_per_seat after a passenger already booked at the
-- original price, or swap vehicle_id to a vehicle that no longer satisfies
-- whatever the RPC checked at creation time. This is exactly the
-- "captain bypass" / "ownership bypass" class of issue this audit's RLS
-- section calls out. Dropping it doesn't remove any capability the app
-- actually uses — it closes a capability the app was never supposed to
-- expose in the first place. p_journeys_owner_delete was already dropped
-- the same way in 0005 when hard delete was replaced by an RPC; this is
-- the same move for update.
-- =============================================================================
drop policy if exists p_journeys_owner_update on journeys;
