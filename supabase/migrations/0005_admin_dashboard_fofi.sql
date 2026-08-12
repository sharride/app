-- ---------------------------------------------------------------------------
-- 0005_admin_dashboard_fofi.sql
--
-- Adds everything the extended Admin Dashboard + FOFi assistant need:
--   1) Soft-delete for journeys (owner "delete" hides it, only an admin can
--      permanently delete it, and it auto-purges after 15 days either way).
--   2) Admin RPCs: role management (with audit log + anti self-demotion),
--      permanent journey delete, and the 15-day purge job.
--   3) Admin write access to journeys (edit/force-cancel) via RLS, on top of
--      the existing owner access.
--   4) `support_messages` table for FOFi's "talk to a human" hand-off.
--   5) `favorite_places` table for the location-picker report's "الأماكن
--      المفضلة" suggestion.
--
-- Depends on is_admin(uid) and audit_logs from 0002_rpc_and_policies.sql.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1) Journeys: soft delete
-- ===========================================================================
alter table journeys add column if not exists deleted_at timestamptz null;
alter table journeys add column if not exists deleted_by uuid references profiles(id);

-- Public/owner select only ever sees non-deleted rows now.
drop policy if exists p_journeys_select_all on journeys;
create policy p_journeys_select_all on journeys for select using (deleted_at is null);

-- Admins can always see everything, deleted or not (separate policy — RLS
-- OR's policies for the same command together).
create policy p_journeys_admin_select_all on journeys for select using (is_admin(auth.uid()));

-- Owners no longer hard-delete their own journeys directly; that's now only
-- possible for an admin, or automatically after 15 days (see purge below).
drop policy if exists p_journeys_owner_delete on journeys;

-- Admins can edit any journey (price/seats/status/etc. — used by the
-- "تعديل الرحلة" admin UI) and permanently delete any journey.
create policy p_journeys_admin_update on journeys for update using (is_admin(auth.uid()));
create policy p_journeys_admin_delete on journeys for delete using (is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- cancel_own_journey_rpc — a captain "deleting" their own journey from
-- المستخدمين UI. This is a soft delete: the journey disappears from public
-- search/my-journeys, but the row (and its bookings/history) stays intact
-- and visible to admins until they permanently delete it, or 15 days pass.
-- ---------------------------------------------------------------------------
create or replace function cancel_own_journey_rpc(p_journey_id uuid) returns journeys as $$
declare
  v journeys;
begin
  select * into v from journeys where id = p_journey_id;
  if not found then raise exception 'الرحلة غير موجودة'; end if;
  if v.captain_id <> auth.uid() then raise exception 'غير مصرح لك بهذا الإجراء'; end if;

  update journeys
    set deleted_at = now(), deleted_by = auth.uid(), status = 'cancelled'
    where id = p_journey_id
    returning * into v;

  insert into audit_logs (actor_id, action, target_type, target_id, metadata)
    values (auth.uid(), 'cancel_own_journey', 'journey', p_journey_id, '{}'::jsonb);

  return v;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------------
-- admin_delete_journey_rpc — permanent delete, admin-only, audited.
-- ---------------------------------------------------------------------------
create or replace function admin_delete_journey_rpc(p_journey_id uuid) returns void as $$
begin
  if not is_admin(auth.uid()) then raise exception 'غير مصرح لك بهذا الإجراء'; end if;

  delete from journeys where id = p_journey_id;
  if not found then raise exception 'الرحلة غير موجودة'; end if;

  insert into audit_logs (actor_id, action, target_type, target_id, metadata)
    values (auth.uid(), 'admin_delete_journey', 'journey', p_journey_id, '{}'::jsonb);
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------------
-- purge_expired_deleted_journeys_rpc — permanently removes journeys that
-- were soft-deleted 15+ days ago and that no admin acted on in the
-- meantime. Scheduled via pg_cron below when available; the admin
-- dashboard also calls this once on load as a fallback for free-tier
-- projects where pg_cron isn't enabled, so the 15-day rule holds either way.
-- ---------------------------------------------------------------------------
create or replace function purge_expired_deleted_journeys_rpc() returns integer as $$
declare
  v_count integer;
begin
  delete from journeys
    where deleted_at is not null and deleted_at < now() - interval '15 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$ language plpgsql security definer;

-- Best-effort daily schedule. Wrapped so this migration doesn't fail on
-- projects where the pg_cron extension isn't installed/permitted (e.g. some
-- free-tier setups) — the on-load fallback call from the admin dashboard
-- covers the purge in that case instead.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'purge-deleted-journeys',
      '0 3 * * *',
      $cron$select purge_expired_deleted_journeys_rpc();$cron$
    );
  end if;
exception when others then
  null;
end $$;

-- ===========================================================================
-- 2) Admin: user role management
-- ===========================================================================
-- profiles already has p_profiles_admin_update (is_admin can update any
-- column). This RPC is used instead of a raw .update() from the client so
-- that: (a) an admin can't accidentally demote themselves and lock
-- themselves out, (b) only the role column can change here, and (c) every
-- change is audit-logged.
create or replace function admin_set_user_role_rpc(p_user_id uuid, p_role text) returns profiles as $$
declare
  v profiles;
begin
  if not is_admin(auth.uid()) then raise exception 'غير مصرح لك بهذا الإجراء'; end if;
  if p_role not in ('passenger', 'captain', 'parent', 'student', 'admin', 'super_admin') then
    raise exception 'دور غير صالح';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'لا يمكنك تعديل صلاحياتك الخاصة من هنا';
  end if;

  update profiles set role = p_role where id = p_user_id returning * into v;
  if not found then raise exception 'المستخدم غير موجود'; end if;

  insert into audit_logs (actor_id, action, target_type, target_id, metadata)
    values (auth.uid(), 'admin_set_user_role', 'profile', p_user_id, jsonb_build_object('role', p_role));

  return v;
end;
$$ language plpgsql security definer;

-- ===========================================================================
-- 3) FOFi support hand-off — support_messages
-- ===========================================================================
create table if not exists support_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  -- Kept even for logged-in users so the admin has a way to reply outside
  -- the app (WhatsApp/phone) without having to look up the profile.
  contact_phone text,
  message text not null,
  -- Free-text context FOFi couldn't answer (which quick-question/topic the
  -- user was on), purely informational for whoever triages it.
  context text,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now()
);

alter table support_messages enable row level security;

-- Anyone (logged in or not) can send a support message.
create policy p_support_messages_insert_any on support_messages for insert with check (true);

-- A logged-in user can see their own messages; admins see all.
create policy p_support_messages_select_own_or_admin on support_messages for select using (
  auth.uid() = user_id or is_admin(auth.uid())
);

-- Only admins can mark a message resolved.
create policy p_support_messages_admin_update on support_messages for update using (is_admin(auth.uid()));

-- ===========================================================================
-- 4) Favorite places (location-picker report suggestion #1)
-- ===========================================================================
create table if not exists favorite_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  label text not null,           -- e.g. "البيت", "الشغل"
  address text not null,
  latitude double precision not null,
  longitude double precision not null,
  created_at timestamptz not null default now()
);

alter table favorite_places enable row level security;

create policy p_favorite_places_owner_all on favorite_places for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
