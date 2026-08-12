-- =============================================================================
-- sharride — 0007_retention.sql (Phase 2: search map UX has no DB component;
-- this file covers B–J: journey/search 15-day retention + notifications)
--
-- AUDIT FINDINGS THIS MIGRATION IS BASED ON (read all of 0001-0006 first):
-- ---------------------------------------------------------------------------
-- 1. journeys already has a DIFFERENT 15-day rule: cancel_own_journey_rpc
--    soft-deletes (deleted_at) and purge_expired_deleted_journeys_rpc hard-
--    deletes 15 days *after that soft-delete* (0005). That is unrelated to
--    what's being added here — it is "how long a cancelled journey's row
--    survives for admin recovery/history", not "how long an active journey
--    stays visible in search". Both 15-day rules now coexist; neither
--    replaces the other.
-- 2. There is no "search_requests" or equivalent entity anywhere in
--    0001-0006. Passenger search is entirely client-side/live: the client
--    calls find_matching_journeys() with fresh params every time
--    (SearchMatchingPage.tsx), and "recent searches" is a localStorage-only
--    convenience with nothing server-side. So item F/G's instruction to
--    reuse an "existing search/request entity" doesn't apply — there isn't
--    one. A new table is unavoidable here; kept as minimal as
--    favorite_places (same owner-all RLS shape, no new RPCs needed for
--    plain CRUD).
-- 3. journeys has no "last activity"/"republished at" timestamp, only
--    created_at, updated_at and departure_time. Per the instruction not to
--    assume created_at is the right anchor: departure_time doesn't work
--    either (recurring 'weekly'/'monthly' journeys would expire same-day
--    for a daily journey type but the field doesn't encode recurrence
--    end). The correct anchor is "time since the captain last confirmed
--    this listing is still wanted" — i.e. publish time, extended
--    explicitly by the captain via the RPC below. So: a dedicated
--    `discoverable_until` column, seeded at insert time and only ever
--    moved forward by extend_journey_discoverability_rpc().
-- 4. complete_journey_rpc (0002) already exists and already does exactly
--    what item E asks (sets status='completed', keeps the row, blocks
--    re-booking via status). Not touched here.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A. journeys: discoverability window + expiry notification tracking
-- ---------------------------------------------------------------------------
alter table journeys add column if not exists discoverable_until timestamptz not null default (now() + interval '15 days');
alter table journeys add column if not exists expiry_notified_at timestamptz null;

create index if not exists idx_journeys_discoverable_until on journeys(discoverable_until);

-- Backfill: existing rows got the column default (now()+15d) applied at
-- alter-table time already since the default is evaluated per-row for
-- existing data in Postgres >= 11 for a non-volatile-looking default —
-- actually `now()` is volatile, so ADD COLUMN with this default rewrites
-- the table and evaluates now() once per row at migration time, which is
-- the correct behavior here (every pre-existing journey gets a fresh
-- 15-day window starting from when this migration runs, not from its
-- original created_at — the right call since none of them had this concept
-- before and none should silently vanish from search the moment this ships).

-- ---------------------------------------------------------------------------
-- find_matching_journeys — same signature as 0004's version (CREATE OR
-- REPLACE keeps every existing call site working unchanged), with two
-- filters added to the WHERE clause: discoverable_until still in the
-- future, and deleted_at is null (defensive — status already excludes
-- soft-deleted rows since cancel_own_journey_rpc sets status='cancelled',
-- but being explicit costs nothing and matches p_journeys_select_all's own
-- deleted_at check for direct reads).
-- ---------------------------------------------------------------------------
create or replace function find_matching_journeys(
  p_start_lng double precision,
  p_start_lat double precision,
  p_end_lng double precision,
  p_end_lat double precision,
  p_departure_time timestamptz,
  p_radius_km double precision default 5.0,
  p_school_mode boolean default false,
  p_child_id uuid default null
) returns table (
  journey_id uuid,
  captain_id uuid,
  captain_name text,
  captain_avatar text,
  captain_trust_score numeric,
  vehicle_make text,
  vehicle_model text,
  vehicle_type text,
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
begin
  if p_child_id is not null and not exists (
    select 1 from profiles_child c where c.id = p_child_id and c.parent_id = auth.uid()
  ) then
    raise exception 'الطفل غير مرتبط بحسابك';
  end if;

  return query
  select
    j.id,
    j.captain_id,
    p.full_name,
    p.avatar_url,
    p.trust_score,
    v.make,
    v.model,
    v.type,
    j.start_address,
    j.end_address,
    j.departure_time,
    j.available_seats,
    j.price_per_seat,
    j.journey_type,
    ST_Distance(j.start_point, ST_SetSRID(ST_MakePoint(p_start_lng, p_start_lat), 4326)::geography) as distance_start_meters,
    ST_Distance(j.end_point, ST_SetSRID(ST_MakePoint(p_end_lng, p_end_lat), 4326)::geography) as distance_end_meters,
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
    and (p_school_mode or v.type <> 'suzuki')
    -- The two lines below are the only change from 0004's version: exclude
    -- journeys whose 15-day discoverability window has lapsed, and
    -- (defensively — status already implies this) soft-deleted rows.
    and j.discoverable_until > now()
    and j.deleted_at is null
    and ST_DWithin(j.start_point, ST_SetSRID(ST_MakePoint(p_start_lng, p_start_lat), 4326)::geography, p_radius_km * 1000)
    and ST_DWithin(j.end_point, ST_SetSRID(ST_MakePoint(p_end_lng, p_end_lat), 4326)::geography, p_radius_km * 1000)
    and j.departure_time between p_departure_time - interval '2 hours' and p_departure_time + interval '2 hours'
  order by compatibility_score desc
  limit 20;
end;
$$ language plpgsql stable security definer;

-- ---------------------------------------------------------------------------
-- extend_journey_discoverability_rpc — owner-only (item J: a captain can
-- never touch another captain's journey — same ownership check pattern as
-- cancel_own_journey_rpc/complete_journey_rpc). "استمرار" button action.
-- ---------------------------------------------------------------------------
create or replace function extend_journey_discoverability_rpc(p_journey_id uuid) returns journeys as $$
declare
  v journeys;
begin
  select * into v from journeys where id = p_journey_id;
  if not found then raise exception 'الرحلة غير موجودة'; end if;
  if v.captain_id <> auth.uid() then raise exception 'غير مصرح لك بهذا الإجراء'; end if;

  update journeys
    set discoverable_until = now() + interval '15 days', expiry_notified_at = null
    where id = p_journey_id
    returning * into v;

  insert into audit_logs (actor_id, action, target_type, target_id, metadata)
    values (auth.uid(), 'extend_journey_discoverability', 'journey', p_journey_id, '{}'::jsonb);

  return v;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------------
-- notify_expiring_journeys_rpc — same "run via cron, no auth.uid() check,
-- postgres owns it" shape as purge_expired_deleted_journeys_rpc (0005).
-- 2-day warning window; expiry_notified_at guards against re-notifying
-- every day until either the captain acts or it actually falls out of
-- search. "خليها مستمرة" -> extend_journey_discoverability_rpc (resets
-- expiry_notified_at, so a future cycle can notify again).
-- "احذفها" -> cancel_own_journey_rpc (existing).
-- ---------------------------------------------------------------------------
create or replace function notify_expiring_journeys_rpc() returns integer as $$
declare
  v_count integer;
begin
  insert into notifications (user_id, title, body, link)
  select captain_id, 'رحلتك قربت تخرج من البحث 👀', 'تحب تسيبها مستمرة ولا نخليها تخلص؟', '/my-journeys'
  from journeys
  where deleted_at is null
    and status in ('published', 'active', 'receiving_bookings')
    and discoverable_until between now() and now() + interval '2 days'
    and expiry_notified_at is null;

  get diagnostics v_count = row_count;

  update journeys
    set expiry_notified_at = now()
    where deleted_at is null
      and status in ('published', 'active', 'receiving_bookings')
      and discoverable_until between now() and now() + interval '2 days'
      and expiry_notified_at is null;

  return v_count;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------------
-- B. search_requests — new table (see audit note #2 above: nothing existing
--    to reuse). Same shape/spirit as favorite_places: owner-all RLS, no
--    RPCs needed for plain CRUD since extending/cancelling your own search
--    carries no cross-user risk (unlike journeys, which route through RPCs
--    for audit-logging consistency with their existing mutation pattern).
-- ---------------------------------------------------------------------------
create table if not exists search_requests (
  id               uuid primary key default gen_random_uuid(),
  passenger_id     uuid not null references profiles(id) on delete cascade,
  start_lat        double precision not null,
  start_lng        double precision not null,
  end_lat          double precision not null,
  end_lng          double precision not null,
  start_address    text not null,
  end_address      text not null,
  departure_time   timestamptz not null,
  radius_km        double precision not null default 5,
  school_mode      boolean not null default false,
  child_id         uuid references profiles_child(id) on delete set null,
  status           text not null default 'active' check (status in ('active', 'expired', 'cancelled')),
  expires_at       timestamptz not null default (now() + interval '15 days'),
  expiry_notified_at timestamptz null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_search_requests_passenger_id on search_requests(passenger_id);
create index if not exists idx_search_requests_status on search_requests(status);
create index if not exists idx_search_requests_expires_at on search_requests(expires_at);

alter table search_requests enable row level security;

create policy p_search_requests_owner_all on search_requests for all
  using (auth.uid() = passenger_id)
  with check (auth.uid() = passenger_id);

drop trigger if exists trg_search_requests_updated_at on search_requests;
create trigger trg_search_requests_updated_at before update on search_requests
  for each row execute function trg_set_updated_at();

-- ---------------------------------------------------------------------------
-- notify_expiring_search_requests_rpc / expire_search_requests_rpc — same
-- cron-run, no-auth-check shape as their journeys counterparts above.
-- ---------------------------------------------------------------------------
create or replace function notify_expiring_search_requests_rpc() returns integer as $$
declare
  v_count integer;
begin
  insert into notifications (user_id, title, body, link)
  select passenger_id, 'بحثك قرب يخلص 👀', 'تحب نسيبه شغال ولا خلاص كده؟', '/search'
  from search_requests
  where status = 'active'
    and expires_at between now() and now() + interval '2 days'
    and expiry_notified_at is null;

  get diagnostics v_count = row_count;

  update search_requests
    set expiry_notified_at = now()
    where status = 'active'
      and expires_at between now() and now() + interval '2 days'
      and expiry_notified_at is null;

  return v_count;
end;
$$ language plpgsql security definer;

-- Soft-expire: flips status only, row (and history) stays — same
-- no-hard-delete rule as journeys. Passive; the client stops treating an
-- 'expired' row as an active saved search once it sees the status.
create or replace function expire_search_requests_rpc() returns integer as $$
declare
  v_count integer;
begin
  update search_requests set status = 'expired' where status = 'active' and expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------------
-- Cron schedule — same wrapped/best-effort pattern as 0005's
-- purge-deleted-journeys job, so this migration doesn't fail on projects
-- without the pg_cron extension. Distinct job names, does not touch or
-- replace the existing 'purge-deleted-journeys' schedule.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'notify-expiring-journeys',
      '0 9 * * *',
      $cron$select notify_expiring_journeys_rpc();$cron$
    );
    perform cron.schedule(
      'notify-expiring-searches',
      '0 9 * * *',
      $cron$select notify_expiring_search_requests_rpc();$cron$
    );
    perform cron.schedule(
      'expire-search-requests',
      '15 9 * * *',
      $cron$select expire_search_requests_rpc();$cron$
    );
  end if;
exception when others then
  null;
end $$;

-- ---------------------------------------------------------------------------
-- Phase 7 security review finding: these three functions have no auth.uid()
-- check by design (they're bulk, cron-run operations — see the comments
-- above), which means without this, any signed-in client could call
-- supabase.rpc('notify_expiring_journeys_rpc') directly and force
-- premature bulk notifications, or force everyone's searches to expire
-- early. Neither leaks another user's data or lets one user mutate a
-- specific victim's row on demand, but it's still an unnecessary DoS/
-- nuisance surface worth closing — a plain client has no legitimate reason
-- to call these at all; only the cron schedule (or a service-role-key
-- admin task) should. Revoking from anon/authenticated leaves postgres/
-- service_role (which pg_cron runs as, and which bypasses grants anyway)
-- able to run them.
--
-- Note: purge_expired_deleted_journeys_rpc() in 0005_admin_dashboard_fofi.sql
-- has this exact same gap and is NOT touched here — that migration
-- predates this session and per the "don't edit already-shipped
-- migrations" instruction it needs a separate corrective migration if
-- you decide to close it, not a silent edit here. See the final report.
-- ---------------------------------------------------------------------------
revoke execute on function notify_expiring_journeys_rpc() from public, anon, authenticated;
revoke execute on function notify_expiring_search_requests_rpc() from public, anon, authenticated;
revoke execute on function expire_search_requests_rpc() from public, anon, authenticated;
