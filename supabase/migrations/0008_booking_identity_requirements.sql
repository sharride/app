-- =============================================================================
-- sharride — 0008_booking_identity_requirements.sql
--
-- WHY THIS FILE EXISTS
-- ---------------------------------------------------------------------------
-- Remaining Work #1/#2 (handoff prompt, "Profile Completion" / "Phone
-- Requirement"): phone_number is already required server-side before
-- rpc_activate_captain() will turn a user into a captain (0006), but
-- create_booking_rpc() (0002_rpc_and_policies.sql) never checked it for the
-- PASSENGER creating the booking. The frontend gate (isIdentityComplete() /
-- IdentityGate's IdentityForm, requireCompleteIdentity on /search and
-- /create-journey) now also collects + requires phone_number, but per the
-- project's own rule ("لا تجعل requiredness مجرد frontend validation" /
-- "لا تعمل authorization في frontend فقط") that frontend check alone is not
-- enough — this migration re-creates create_booking_rpc with the same
-- signature and the rest of its logic completely unchanged, adding one
-- guard at the top so a passenger can't bypass the frontend gate via a
-- direct RPC/API call and book without a phone number on file.
--
-- Minimal diff: no new table, no new RPC, no signature change — same
-- function, one added check, per "IMPORTANT RPC RULE" in the handoff prompt.
-- =============================================================================

create or replace function create_booking_rpc(
  p_journey_id uuid,
  p_seats_booked integer,
  p_price_offered numeric
) returns bookings as $$
declare
  v_journey journeys;
  v_booking bookings;
  v_phone text;
begin
  select phone_number into v_phone from profiles where id = auth.uid();
  if coalesce(trim(v_phone), '') = '' then
    raise exception 'phone_required' using errcode = 'P0001';
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
