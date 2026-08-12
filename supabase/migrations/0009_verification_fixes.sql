-- =============================================================================
-- sharride — 0009_verification_fixes.sql
--
-- Fixes found during a full verification pass over 0001-0008 before
-- continuing the project. Read all of 0001-0008 first (done) — nothing here
-- changes an existing table/column/RPC signature, no data is dropped.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- FIX 1 — create_journey_rpc never checked captain_enabled.
--
-- p_vehicles_owner_write only checks captain_id = auth.uid() — it has no
-- captain_enabled requirement, so any authenticated passenger could insert
-- a vehicles row for themselves, then call create_journey_rpc(that vehicle)
-- and publish a journey without ever completing captain activation
-- (rpc_activate_captain, 0006_captain_activation.sql). This is exactly the
-- captain-bypass class of bug the project's security rules call out.
-- Same signature, same body, one added check at the top.
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
  if not exists (select 1 from profiles where id = auth.uid() and captain_enabled) then
    raise exception 'captain_not_activated' using errcode = 'P0001';
  end if;

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
-- FIX 2 — admin_set_user_role_rpc regression introduced by 0006.
--
-- trg_profiles_guard_privileged_columns (0006_captain_activation.sql) blocks
-- any change to profiles.role unless app.role_change_allowed = 'on' for the
-- transaction. admin_set_user_role_rpc (0005_admin_dashboard_fofi.sql) was
-- written before that trigger existed and never sets the flag, so since
-- 0006 shipped every call to it fails with "role and captain_enabled cannot
-- be changed directly" — the admin dashboard's role-management action is
-- currently completely broken. Also removes 'admin'/'super_admin' from the
-- accepted p_role values: the same trigger unconditionally blocks any
-- transition INTO admin/super_admin regardless of the flag (by design —
-- see the trigger's comment, admin accounts are provisioned by an operator
-- directly in SQL, not through the app), so keeping those in this RPC's
-- validation list just produces a confusing low-level trigger error instead
-- of a clean one. Same signature, same audit logging, same self-demotion
-- guard.
-- ---------------------------------------------------------------------------
create or replace function admin_set_user_role_rpc(p_user_id uuid, p_role text) returns profiles as $$
declare
  v profiles;
begin
  if not is_admin(auth.uid()) then raise exception 'غير مصرح لك بهذا الإجراء'; end if;
  if p_role not in ('passenger', 'captain', 'parent', 'student') then
    raise exception 'دور غير صالح';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'لا يمكنك تعديل صلاحياتك الخاصة من هنا';
  end if;

  perform set_config('app.role_change_allowed', 'on', true);
  update profiles set role = p_role where id = p_user_id returning * into v;
  perform set_config('app.role_change_allowed', 'off', true);

  if not found then raise exception 'المستخدم غير موجود'; end if;

  insert into audit_logs (actor_id, action, target_type, target_id, metadata)
    values (auth.uid(), 'admin_set_user_role', 'profile', p_user_id, jsonb_build_object('role', p_role));

  return v;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------------
-- FIX 3 — welcome notification + incomplete-profile reminder.
--
-- Neither existed anywhere in 0001-0008 (Priority 1 of the continuation
-- brief asks for at least these two). Reuses the existing `notifications`
-- table/RLS/realtime subscription (apiService.ts already subscribes per
-- user_id) — no new table, no new RPC surface for the client.
-- ---------------------------------------------------------------------------

-- 3a. Welcome notification — fires once, right when trg_handle_new_user
-- (0001_core_schema.sql) creates the profile row. Extending that existing
-- trigger function rather than adding a second trigger on auth.users.
create or replace function trg_handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''))
  on conflict (id) do nothing;

  insert into public.notifications (user_id, title, body, link)
  values (
    new.id,
    'أهلاً بيك في شيررايد 👋',
    'مبسوطين إنك انضممت لينا. كمّل بياناتك عشان تقدر تحجز أو تنشر رحلة.',
    '/profile'
  );

  return new;
end;
$$ language plpgsql security definer;

-- 3b. Incomplete-profile reminder — same cron-run/no-auth-check shape as
-- notify_expiring_journeys_rpc (0007_retention.sql). "Incomplete" mirrors
-- isIdentityComplete() in src/utils/identity.ts exactly (full_name, gender,
-- valid 14-digit national_id, phone_number) — kept in sync with that
-- function and rpc_activate_captain's own check. Fires once, 24h after
-- signup, for anyone still incomplete at that point; a dedicated timestamp
-- column (not reusing expiry-style columns from other tables) avoids
-- re-notifying on every cron run.
alter table profiles add column if not exists incomplete_profile_notified_at timestamptz null;

create or replace function notify_incomplete_profiles_rpc() returns integer as $$
declare
  v_count integer;
begin
  insert into notifications (user_id, title, body, link)
  select id, 'كمّل بياناتك 📝', 'لسه بياناتك مش كاملة، كمّلها عشان تقدر تحجز أو تنشر رحلة من غير أي تعطيل.', '/profile'
  from profiles
  where incomplete_profile_notified_at is null
    and created_at < now() - interval '1 day'
    and not (
      coalesce(trim(full_name), '') <> ''
      and gender in ('male', 'female')
      and national_id is not null
      and national_id ~ '^\d{14}$'
      and coalesce(trim(phone_number), '') <> ''
    );

  get diagnostics v_count = row_count;

  update profiles
    set incomplete_profile_notified_at = now()
    where incomplete_profile_notified_at is null
      and created_at < now() - interval '1 day'
      and not (
        coalesce(trim(full_name), '') <> ''
        and gender in ('male', 'female')
        and national_id is not null
        and national_id ~ '^\d{14}$'
        and coalesce(trim(phone_number), '') <> ''
      );

  return v_count;
end;
$$ language plpgsql security definer;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'notify-incomplete-profiles',
      '30 9 * * *',
      $cron$select notify_incomplete_profiles_rpc();$cron$
    );
  end if;
exception when others then
  null;
end $$;
