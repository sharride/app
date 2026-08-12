-- =============================================================================
-- sharride — 0002_rpc_and_policies.sql
--
-- Two things live here, per the Constitution (handoff §2, §9):
--   1. Row Level Security on every table — the client never gets to touch
--      another user's row directly, and never bypasses RLS via a service key.
--   2. Every RPC that "منطق العمل الحساس" (sensitive business logic — pricing,
--      matching, bookings, permissions) must run through, per §2's
--      "Backend-Driven Logic" principle: the frontend only ever displays
--      data, it never computes a price or decides who can do what.
--
-- This is also where the money math the frontend explicitly could NOT do
-- lives (see apiService.ts comments on continueSubscription/stopSubscription
-- and CHANGELOG session 3): pricing, the negotiation ladder inputs, and
-- refund/compensation calculations. Nothing about actual payment processing
-- is here since MVP is 100% free (handoff §8) — this is seat/booking state
-- and price *numbers* only, no money movement.
-- =============================================================================

alter table profiles enable row level security;
alter table profiles_child enable row level security;
alter table vehicles enable row level security;
alter table journeys enable row level security;
alter table bookings enable row level security;
alter table subscriptions enable row level security;
alter table notifications enable row level security;
alter table messages enable row level security;
alter table reviews enable row level security;
alter table reports enable row level security;
alter table audit_logs enable row level security;

-- Small helper so every "is this user an admin" check is one place, not
-- copy-pasted into a dozen policies (handoff §9 forbids ad-hoc RLS bypass —
-- keeping the check itself in one function makes it auditable).
create or replace function is_admin(uid uuid) returns boolean as $$
  select exists (
    select 1 from profiles where id = uid and role in ('admin', 'super_admin')
  );
$$ language sql stable security definer;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy p_profiles_select_all on profiles for select using (true); -- public profile info (name/city/trust_score) needed for matching UI
create policy p_profiles_update_own on profiles for update using (auth.uid() = id);
create policy p_profiles_admin_update on profiles for update using (is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- profiles_child
-- ---------------------------------------------------------------------------
create policy p_profiles_child_owner on profiles_child for all
  using (auth.uid() = parent_id) with check (auth.uid() = parent_id);

-- ---------------------------------------------------------------------------
-- vehicles — captain owns their own vehicles; anyone can read (needed to
-- show make/model on a public journey listing).
-- ---------------------------------------------------------------------------
create policy p_vehicles_select_all on vehicles for select using (true);
create policy p_vehicles_owner_write on vehicles for insert with check (auth.uid() = captain_id);
create policy p_vehicles_owner_update on vehicles for update using (auth.uid() = captain_id);
create policy p_vehicles_owner_delete on vehicles for delete using (auth.uid() = captain_id);

-- ---------------------------------------------------------------------------
-- journeys — publicly readable (search/matching), only the owning captain
-- can write, and only through the RPC below in practice (no direct insert
-- policy for arbitrary columns — see create_journey_rpc).
-- ---------------------------------------------------------------------------
create policy p_journeys_select_all on journeys for select using (true);
create policy p_journeys_owner_update on journeys for update using (auth.uid() = captain_id);
create policy p_journeys_owner_delete on journeys for delete using (auth.uid() = captain_id);

-- ---------------------------------------------------------------------------
-- bookings — passenger sees their own; captain sees bookings on their own
-- journeys; both can be updated only by the RPCs below.
-- ---------------------------------------------------------------------------
create policy p_bookings_select_own on bookings for select using (
  auth.uid() = passenger_id
  or exists (select 1 from journeys j where j.id = bookings.journey_id and j.captain_id = auth.uid())
  or is_admin(auth.uid())
);

-- ---------------------------------------------------------------------------
-- subscriptions
-- ---------------------------------------------------------------------------
create policy p_subscriptions_select_own on subscriptions for select using (
  auth.uid() = passenger_id or auth.uid() = captain_id or is_admin(auth.uid())
);

-- ---------------------------------------------------------------------------
-- notifications — strictly own
-- ---------------------------------------------------------------------------
create policy p_notifications_select_own on notifications for select using (auth.uid() = user_id);
create policy p_notifications_update_own on notifications for update using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- messages — only the two parties on the underlying booking (handoff §9
-- "المحادثات — فتح التواصل فقط بعد قبول الحجز": only after an accepted
-- booking, enforced here by joining through bookings.status).
-- ---------------------------------------------------------------------------
create policy p_messages_select_parties on messages for select using (
  exists (
    select 1 from bookings b join journeys j on j.id = b.journey_id
    where b.id = messages.booking_id
      and b.status in ('accepted','completed')
      and (b.passenger_id = auth.uid() or j.captain_id = auth.uid())
  )
);
create policy p_messages_insert_parties on messages for insert with check (
  sender_id = auth.uid()
  and exists (
    select 1 from bookings b join journeys j on j.id = b.journey_id
    where b.id = messages.booking_id
      and b.status in ('accepted','completed')
      and (b.passenger_id = auth.uid() or j.captain_id = auth.uid())
  )
);

-- ---------------------------------------------------------------------------
-- reviews — readable by anyone (public trust signal), only insertable by
-- the reviewer on their own completed booking (enforced again in the RPC),
-- hidden ones excluded from public select but visible to admins/the author.
-- ---------------------------------------------------------------------------
create policy p_reviews_select_visible on reviews for select using (
  not is_hidden or reviewer_id = auth.uid() or is_admin(auth.uid())
);
create policy p_reviews_admin_moderate on reviews for update using (is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- reports — reporter can create/read own; admins read all
-- ---------------------------------------------------------------------------
create policy p_reports_select_own_or_admin on reports for select using (
  auth.uid() = reporter_id or is_admin(auth.uid())
);
create policy p_reports_insert_own on reports for insert with check (auth.uid() = reporter_id);
create policy p_reports_admin_update on reports for update using (is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- audit_logs — admins only
-- ---------------------------------------------------------------------------
create policy p_audit_logs_admin_select on audit_logs for select using (is_admin(auth.uid()));

-- =============================================================================
-- RPCs
-- =============================================================================

-- ---------------------------------------------------------------------------
-- create_journey_rpc — already called by CreateJourneyPage.tsx via
-- createJourneyRPC() in apiService.ts; this is its first real definition.
-- Validates the caller owns the vehicle before creating the journey — the
-- client can pass any vehicleId, so ownership must be re-checked server-side
-- (handoff §2 "Security First": never rely on hiding a UI element).
-- ---------------------------------------------------------------------------
create or replace function create_journey_rpc(
  p_vehicle_id uuid,
  p_start_lng double precision,
  p_start_lat double precision,
  p_end_lng double precision,
  p_end_lat double precision,
  p_start_address text,
  p_end_address text,
  p_departure_time timestamptz,
  p_journey_type text,
  p_total_seats integer,
  p_price_per_seat numeric,
  p_notes text default null
) returns journeys as $$
declare
  v_journey journeys;
begin
  if not exists (select 1 from vehicles where id = p_vehicle_id and captain_id = auth.uid()) then
    raise exception 'لا تملك هذه المركبة';
  end if;

  insert into journeys (
    captain_id, vehicle_id, start_lng, start_lat, end_lng, end_lat,
    start_address, end_address, departure_time, journey_type,
    total_seats, available_seats, price_per_seat, notes, status
  ) values (
    auth.uid(), p_vehicle_id, p_start_lng, p_start_lat, p_end_lng, p_end_lat,
    p_start_address, p_end_address, p_departure_time, p_journey_type,
    p_total_seats, p_total_seats, p_price_per_seat, p_notes, 'published'
  )
  returning * into v_journey;

  insert into audit_logs (actor_id, action, target_type, target_id)
    values (auth.uid(), 'create_journey', 'journey', v_journey.id);

  return v_journey;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------------
-- find_matching_journeys — already called by SearchMatchingPage.tsx via
-- findMatchingJourneysRPC(); this is its first real definition. Uses PostGIS
-- ST_DWithin for the geographic radius (handoff §5/§10 — "مطابقة جغرافية
-- وزمنية") and a fixed +/- 2h departure-time window as the "زمنية" half of
-- the match, plus a simple compatibility_score combining both distances.
-- ---------------------------------------------------------------------------
create or replace function find_matching_journeys(
  p_start_lng double precision,
  p_start_lat double precision,
  p_end_lng double precision,
  p_end_lat double precision,
  p_departure_time timestamptz,
  p_radius_km double precision default 5.0
) returns table (
  journey_id uuid,
  captain_id uuid,
  captain_name text,
  captain_avatar text,
  captain_trust_score numeric,
  vehicle_make text,
  vehicle_model text,
  start_address text,
  end_address text,
  departure_time timestamptz,
  available_seats integer,
  price_per_seat numeric,
  journey_type text,
  distance_start_meters double precision,
  distance_end_meters double precision,
  compatibility_score numeric
) as $$
  select
    j.id,
    j.captain_id,
    p.full_name,
    p.avatar_url,
    p.trust_score,
    v.make,
    v.model,
    j.start_address,
    j.end_address,
    j.departure_time,
    j.available_seats,
    j.price_per_seat,
    j.journey_type,
    ST_Distance(j.start_point, ST_SetSRID(ST_MakePoint(p_start_lng, p_start_lat), 4326)::geography) as distance_start_meters,
    ST_Distance(j.end_point, ST_SetSRID(ST_MakePoint(p_end_lng, p_end_lat), 4326)::geography) as distance_end_meters,
    -- 0-100: closer on both legs and closer in departure time scores higher.
    -- Weighting (60% location / 40% time) and the radius/window themselves
    -- are launch defaults, not a spec-mandated formula — the handoff doc
    -- names "Compatibility Score" as a required concept (§5, §"محرك
    -- المطابقة") but doesn't give a formula, so this is a first cut to tune
    -- post-launch against real usage rather than a documented algorithm.
    round((
      (1 - least(ST_Distance(j.start_point, ST_SetSRID(ST_MakePoint(p_start_lng, p_start_lat), 4326)::geography) / (p_radius_km * 1000), 1)) * 30
      + (1 - least(ST_Distance(j.end_point, ST_SetSRID(ST_MakePoint(p_end_lng, p_end_lat), 4326)::geography) / (p_radius_km * 1000), 1)) * 30
      + (1 - least(abs(extract(epoch from (j.departure_time - p_departure_time))) / 7200, 1)) * 40
    )::numeric, 1) as compatibility_score
  from journeys j
  join profiles p on p.id = j.captain_id
  join vehicles v on v.id = j.vehicle_id
  where j.status in ('published', 'active', 'receiving_bookings')
    and j.available_seats > 0
    and ST_DWithin(j.start_point, ST_SetSRID(ST_MakePoint(p_start_lng, p_start_lat), 4326)::geography, p_radius_km * 1000)
    and ST_DWithin(j.end_point, ST_SetSRID(ST_MakePoint(p_end_lng, p_end_lat), 4326)::geography, p_radius_km * 1000)
    and j.departure_time between p_departure_time - interval '2 hours' and p_departure_time + interval '2 hours'
  order by compatibility_score desc
  limit 20;
$$ language sql stable security definer;

-- ---------------------------------------------------------------------------
-- create_booking_rpc — atomic version of the direct `.insert()` currently in
-- createBookingRequest() (apiService.ts). The direct insert has no seat lock:
-- two passengers requesting the last seat at the same moment could both
-- succeed client-side before either capacity check runs. This RPC locks the
-- journey row first (`for update`) so seat availability is checked and
-- reserved atomically. Frontend should switch createBookingRequest() to call
-- this instead of inserting directly — see the accompanying report.
-- ---------------------------------------------------------------------------
create or replace function create_booking_rpc(
  p_journey_id uuid,
  p_seats_booked integer,
  p_price_offered numeric
) returns bookings as $$
declare
  v_journey journeys;
  v_booking bookings;
begin
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

-- ---------------------------------------------------------------------------
-- accept_booking_rpc / reject_booking_rpc — replace the direct
-- `.update({ status })` in updateBookingStatus() (apiService.ts), which the
-- code's own comment flags as missing "atomically decrementing
-- journeys.available_seats". These do the decrement, verify the caller is
-- actually the journey's captain (RLS lets a captain UPDATE any booking row
-- returned by the select policy — the explicit check here is the real
-- authorization, not RLS alone), and drop a notification for the passenger
-- so NotificationsPage has something to show.
-- ---------------------------------------------------------------------------
create or replace function accept_booking_rpc(p_booking_id uuid) returns bookings as $$
declare
  v_booking bookings;
  v_journey journeys;
begin
  select * into v_booking from bookings where id = p_booking_id for update;
  if not found then raise exception 'طلب الحجز غير موجود'; end if;

  select * into v_journey from journeys where id = v_booking.journey_id for update;
  if v_journey.captain_id <> auth.uid() then raise exception 'غير مصرح لك بهذا الإجراء'; end if;
  if v_booking.status <> 'pending' then raise exception 'تم اتخاذ قرار بشأن هذا الطلب مسبقًا'; end if;
  if v_journey.available_seats < v_booking.seats_booked then raise exception 'لا توجد مقاعد كافية متبقية'; end if;

  update journeys set available_seats = available_seats - v_booking.seats_booked where id = v_journey.id;
  update journeys set status = 'full' where id = v_journey.id and available_seats = 0 and status <> 'full';

  update bookings set status = 'accepted' where id = p_booking_id returning * into v_booking;

  insert into notifications (user_id, title, body, link)
    values (v_booking.passenger_id, 'تم قبول طلب الحجز', 'وافق القائد على طلب حجزك، يمكنك الآن التواصل معه', '/chat');

  insert into audit_logs (actor_id, action, target_type, target_id)
    values (auth.uid(), 'accept_booking', 'booking', p_booking_id);

  return v_booking;
end;
$$ language plpgsql security definer;

create or replace function reject_booking_rpc(p_booking_id uuid) returns bookings as $$
declare
  v_booking bookings;
  v_journey journeys;
begin
  select * into v_booking from bookings where id = p_booking_id for update;
  if not found then raise exception 'طلب الحجز غير موجود'; end if;

  select * into v_journey from journeys where id = v_booking.journey_id;
  if v_journey.captain_id <> auth.uid() then raise exception 'غير مصرح لك بهذا الإجراء'; end if;
  if v_booking.status <> 'pending' then raise exception 'تم اتخاذ قرار بشأن هذا الطلب مسبقًا'; end if;

  update bookings set status = 'rejected' where id = p_booking_id returning * into v_booking;

  insert into notifications (user_id, title, body, link)
    values (v_booking.passenger_id, 'تم رفض طلب الحجز', 'لم يوافق القائد على طلب حجزك هذه المرة', '/search');

  insert into audit_logs (actor_id, action, target_type, target_id)
    values (auth.uid(), 'reject_booking', 'booking', p_booking_id);

  return v_booking;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------------
-- complete_journey_rpc — marks a journey (and its accepted bookings) as
-- completed. This is the trigger point for "رحلات بانتظار تقييمك" (FS-12):
-- it drops a review-reminder notification for both sides of every completed
-- booking, closing the "reminder-to-review from Notifications" gap the
-- session-3 CHANGELOG explicitly listed as not done.
-- ---------------------------------------------------------------------------
create or replace function complete_journey_rpc(p_journey_id uuid) returns void as $$
declare
  v_journey journeys;
  v_booking record;
begin
  select * into v_journey from journeys where id = p_journey_id;
  if not found then raise exception 'الرحلة غير موجودة'; end if;
  if v_journey.captain_id <> auth.uid() then raise exception 'غير مصرح لك بهذا الإجراء'; end if;

  update journeys set status = 'completed' where id = p_journey_id;
  update bookings set status = 'completed' where journey_id = p_journey_id and status = 'accepted';
  update subscriptions set status = 'completed'
    where journey_id = p_journey_id and status in ('trial','active');

  update profiles set total_trips_completed = total_trips_completed + 1 where id = v_journey.captain_id;

  for v_booking in
    select id, passenger_id from bookings where journey_id = p_journey_id and status = 'completed'
  loop
    update profiles set total_trips_completed = total_trips_completed + 1 where id = v_booking.passenger_id;
    insert into notifications (user_id, title, body, link)
      values (v_booking.passenger_id, 'قيّم رحلتك الأخيرة', 'شاركنا تجربتك مع القائد لمساعدة ركاب آخرين', '/my-journeys');
    insert into notifications (user_id, title, body, link)
      values (v_journey.captain_id, 'قيّم راكبك', 'شاركنا تجربتك مع الراكب لمساعدة قادة آخرين', '/my-journeys');
  end loop;

  insert into audit_logs (actor_id, action, target_type, target_id)
    values (auth.uid(), 'complete_journey', 'journey', p_journey_id);
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------------
-- calculate_journey_price_rpc — the pricing engine the spec requires to run
-- "بالكامل داخل Backend" (handoff §7 "Pricing & Subscriptions": price calc,
-- distance lock, negotiation, trial period, compensation). This is a first,
-- explicit implementation, not a guess at your existing formula (there
-- wasn't one anywhere in either codebase to match) — treat the per-km rate
-- and floor as launch defaults to tune, and swap the body if you already
-- have an agreed pricing model.
-- ---------------------------------------------------------------------------
create or replace function calculate_journey_price_rpc(
  p_distance_meters double precision,
  p_journey_type text default 'daily'
) returns numeric as $$
declare
  v_base_fare constant numeric := 5.0;    -- EGP, launch default
  v_per_km    constant numeric := 1.5;    -- EGP/km, launch default
  v_price     numeric;
begin
  v_price := v_base_fare + (p_distance_meters / 1000.0) * v_per_km;
  -- Weekly/monthly subscribers get a discount for committing (handoff §7 —
  -- subscription pricing sits below single-trip pricing).
  if p_journey_type = 'weekly' then
    v_price := v_price * 0.9;
  elsif p_journey_type = 'monthly' then
    v_price := v_price * 0.8;
  end if;
  return round(greatest(v_price, v_base_fare), 2);
end;
$$ language plpgsql immutable;

-- ---------------------------------------------------------------------------
-- continue_subscription_rpc / stop_subscription_rpc — server-side versions
-- of continueSubscription()/stopSubscription() in apiService.ts, which the
-- code's own comments flag as "only flip the status column — no money moved
-- or calculated". These add the ownership check RLS alone doesn't give you
-- (a passenger could otherwise flip *any* subscription row's status) and a
-- refund_amount return value for early stop — computed here as a simple
-- pro-rated refund on the trial-period portion, per handoff §7's
-- "Cancellation Policy" concept. No payment gateway exists yet (MVP is 100%
-- free, §8) so this returns the amount rather than moving real money.
-- ---------------------------------------------------------------------------
create or replace function continue_subscription_rpc(p_subscription_id uuid) returns subscriptions as $$
declare
  v_sub subscriptions;
begin
  select * into v_sub from subscriptions where id = p_subscription_id for update;
  if not found then raise exception 'الاشتراك غير موجود'; end if;
  if v_sub.passenger_id <> auth.uid() then raise exception 'غير مصرح لك بهذا الإجراء'; end if;
  if v_sub.status <> 'trial' then raise exception 'لا يمكن تحديث حالة هذا الاشتراك'; end if;

  update subscriptions set status = 'active' where id = p_subscription_id returning * into v_sub;
  insert into audit_logs (actor_id, action, target_type, target_id)
    values (auth.uid(), 'continue_subscription', 'subscription', p_subscription_id);
  return v_sub;
end;
$$ language plpgsql security definer;

create or replace function stop_subscription_rpc(p_subscription_id uuid) returns table (
  subscription subscriptions,
  refund_amount numeric
) as $$
declare
  v_sub subscriptions;
  v_booking bookings;
  v_days_remaining numeric;
  v_refund numeric := 0;
begin
  select * into v_sub from subscriptions where id = p_subscription_id for update;
  if not found then raise exception 'الاشتراك غير موجود'; end if;
  if v_sub.passenger_id <> auth.uid() then raise exception 'غير مصرح لك بهذا الإجراء'; end if;
  if v_sub.status not in ('trial','active') then raise exception 'لا يمكن تحديث حالة هذا الاشتراك'; end if;

  select * into v_booking from bookings where id = v_sub.booking_id;

  -- Only trial-period stops are refund-eligible per the client copy already
  -- shown on MyJourneysPage ("إيقاف الاشتراك" during trial, no penalty
  -- mentioned). Post-trial cancellation compensation is a separate policy
  -- the spec names but doesn't formula-ize — left at 0 here rather than
  -- guessed.
  if v_sub.status = 'trial' and v_sub.trial_ends_at > now() then
    v_days_remaining := greatest(extract(epoch from (v_sub.trial_ends_at - now())) / 86400.0, 0);
    v_refund := round(v_booking.final_price * (v_days_remaining / 3.0), 2);
  end if;

  update subscriptions set status = 'cancelled' where id = p_subscription_id returning * into v_sub;
  insert into audit_logs (actor_id, action, target_type, target_id, metadata)
    values (auth.uid(), 'stop_subscription', 'subscription', p_subscription_id, jsonb_build_object('refund_amount', v_refund));

  return query select v_sub, v_refund;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------------
-- trust_score trigger — replaces the client-side recomputeTrustScore()
-- read-then-write in apiService.ts, which the code's own comment flags as
-- race-prone under concurrent reviews. This runs the same average-of-
-- ratings math atomically on the server on every insert/update/delete of a
-- review, so the client no longer needs to call it at all.
-- ---------------------------------------------------------------------------
create or replace function trg_recompute_trust_score() returns trigger as $$
declare
  v_target uuid := coalesce(new.reviewee_id, old.reviewee_id);
  v_avg numeric;
begin
  select coalesce(round(avg(rating)::numeric, 1), 0) into v_avg
  from reviews where reviewee_id = v_target and not is_hidden;

  update profiles set trust_score = v_avg where id = v_target;
  return coalesce(new, old);
end;
$$ language plpgsql security definer;

drop trigger if exists trg_reviews_recompute_trust_score on reviews;
create trigger trg_reviews_recompute_trust_score
  after insert or update or delete on reviews
  for each row execute function trg_recompute_trust_score();

-- ---------------------------------------------------------------------------
-- moderate_review_rpc — admin-only hide/unhide, closing the "review
-- moderation/hide-without-delete for admins" gap from CHANGELOG session 3.
-- Hiding recomputes trust_score automatically via the trigger above (hidden
-- reviews are excluded from the average).
-- ---------------------------------------------------------------------------
create or replace function moderate_review_rpc(p_review_id uuid, p_hidden boolean) returns reviews as $$
declare
  v_review reviews;
begin
  if not is_admin(auth.uid()) then raise exception 'غير مصرح لك بهذا الإجراء'; end if;
  update reviews set is_hidden = p_hidden where id = p_review_id returning * into v_review;
  if not found then raise exception 'التقييم غير موجود'; end if;
  insert into audit_logs (actor_id, action, target_type, target_id, metadata)
    values (auth.uid(), 'moderate_review', 'review', p_review_id, jsonb_build_object('is_hidden', p_hidden));
  return v_review;
end;
$$ language plpgsql security definer;
