-- =============================================================================
-- sharride — 0006_captain_activation.sql
--
-- WHY THIS FILE EXISTS
-- ---------------------------------------------------------------------------
-- Implements "Captain Activation" per the Phase 1 role-architecture spec:
--
--   profiles.role      = the user's ACTIVE role right now (passenger/captain/…)
--   profiles.captain_enabled = whether this account is ELIGIBLE to operate as
--                              a captain (i.e. has completed identity + a
--                              registered vehicle) — independent of which
--                              role is currently active.
--
-- No new "user_roles" table — this is the minimal-diff approach the spec
-- requires: one boolean column plus two RPCs.
--
-- SECURITY FIX BUNDLED IN
-- ---------------------------------------------------------------------------
-- p_profiles_update_own (0002_rpc_and_policies.sql) is `for update using
-- (auth.uid() = id)` with no WITH CHECK. In Postgres RLS, when an UPDATE
-- policy omits WITH CHECK, the USING clause doubles as the check — meaning
-- *any* authenticated user could currently PATCH their own `role` column to
-- 'captain', or even 'admin' / 'super_admin', directly via the PostgREST API,
-- bypassing the app entirely. This migration closes that hole: a trigger
-- blocks any change to `role` or `captain_enabled` unless it happens inside
-- one of the two RPCs below (which set a transaction-local flag first).
-- Run this directly in the Supabase SQL editor, same as prior migrations.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. captain_enabled column — captain eligibility, not active role.
-- ---------------------------------------------------------------------------
alter table profiles add column if not exists captain_enabled boolean not null default false;

create index if not exists idx_profiles_captain_enabled on profiles(captain_enabled);

-- ---------------------------------------------------------------------------
-- 2. Guard trigger — role and captain_enabled can only change from inside
--    rpc_select_role / rpc_activate_captain (below), never from a direct
--    client UPDATE on profiles, even though p_profiles_update_own otherwise
--    allows the row to be updated. Also hard-blocks any attempt to set role
--    to 'admin' / 'super_admin' through the guarded path — those stay
--    operator-only via p_profiles_admin_update (existing policy).
-- ---------------------------------------------------------------------------
create or replace function trg_profiles_guard_privileged_columns() returns trigger as $$
begin
  if (new.role is distinct from old.role or new.captain_enabled is distinct from old.captain_enabled) then
    if coalesce(current_setting('app.role_change_allowed', true), 'off') <> 'on' then
      raise exception 'role and captain_enabled cannot be changed directly; use rpc_select_role / rpc_activate_captain';
    end if;
    if new.role in ('admin', 'super_admin') and old.role not in ('admin', 'super_admin') then
      raise exception 'role escalation to admin is not permitted through this path';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_profiles_guard_privileged_columns on profiles;
create trigger trg_profiles_guard_privileged_columns
  before update on profiles
  for each row execute function trg_profiles_guard_privileged_columns();

-- ---------------------------------------------------------------------------
-- 3. rpc_select_role(p_role) — sets the ACTIVE role for the calling user.
--    'passenger' is always allowed. 'captain' is only allowed if
--    captain_enabled is already true (identity + vehicle already verified).
--    This is what the client calls right after the post-OAuth "which role
--    did you pick before logging in" step, and again on every subsequent
--    login/role-switch (logout → pick role → login → this RPC runs again).
-- ---------------------------------------------------------------------------
create or replace function rpc_select_role(p_role text) returns profiles as $$
declare
  v_profile profiles;
begin
  if p_role not in ('passenger', 'captain') then
    raise exception 'invalid role selection: %', p_role;
  end if;

  select * into v_profile from profiles where id = auth.uid();
  if v_profile.id is null then
    raise exception 'profile not found for current user';
  end if;

  if p_role = 'captain' and not v_profile.captain_enabled then
    raise exception 'captain_not_activated' using errcode = 'P0001';
  end if;

  perform set_config('app.role_change_allowed', 'on', true);
  update profiles set role = p_role, updated_at = now() where id = auth.uid()
    returning * into v_profile;
  perform set_config('app.role_change_allowed', 'off', true);

  return v_profile;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------------
-- 4. rpc_activate_captain() — server-side verification that identity +
--    vehicle data is actually complete before flipping captain_enabled on.
--    Mirrors isIdentityComplete() in utils/identity.ts plus a phone number
--    and at least one fully-specified vehicle (type/model/color all set —
--    "color" only, since make/model/type are already not-null in the
--    vehicles table; seats/is_ac are server-derived and not user input).
--    On success this also activates the role immediately (role='captain'),
--    since activation only ever happens as part of the captain onboarding
--    flow where the user has already chosen "captain".
-- ---------------------------------------------------------------------------
create or replace function rpc_activate_captain() returns profiles as $$
declare
  v_profile profiles;
  v_vehicle_ok boolean;
begin
  select * into v_profile from profiles where id = auth.uid();
  if v_profile.id is null then
    raise exception 'profile not found for current user';
  end if;

  if not (
    coalesce(trim(v_profile.full_name), '') <> ''
    and v_profile.gender in ('male', 'female')
    and v_profile.national_id is not null
    and v_profile.national_id ~ '^\d{14}$'
    and coalesce(trim(v_profile.phone_number), '') <> ''
  ) then
    raise exception 'identity_incomplete' using errcode = 'P0001';
  end if;

  select exists (
    select 1 from vehicles
    where captain_id = auth.uid()
      and coalesce(trim(make), '') <> ''
      and coalesce(trim(model), '') <> ''
      and coalesce(trim(color), '') <> ''
      and type in ('private', 'bus', 'suzuki')
  ) into v_vehicle_ok;

  if not v_vehicle_ok then
    raise exception 'vehicle_incomplete' using errcode = 'P0001';
  end if;

  perform set_config('app.role_change_allowed', 'on', true);
  update profiles set captain_enabled = true, role = 'captain', updated_at = now()
    where id = auth.uid()
    returning * into v_profile;
  perform set_config('app.role_change_allowed', 'off', true);

  return v_profile;
end;
$$ language plpgsql security definer;
