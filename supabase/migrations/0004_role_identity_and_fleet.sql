-- =============================================================================
-- sharride — 0004_role_identity_and_fleet.sql
--
-- WHY THIS FILE EXISTS
-- ---------------------------------------------------------------------------
-- Adds identity-verification fields (required before publishing/searching a
-- journey), reshapes the vehicle fleet into the three real categories the
-- business uses (private / bus / suzuki) with seat counts and AC fixed per
-- category, and extends profiles_child (already defined in
-- 0001_core_schema.sql, unused until now) with age/school so a parent can
-- search school routes on behalf of a child.
--
-- Run this directly in the Supabase SQL editor (Dashboard → SQL Editor →
-- New query → paste → Run). This project's migration files have drifted
-- from the live database before (see the note at the top of
-- src/types/index.ts) — running this by hand and then committing the file
-- to the repo for the record is the safest path, same as last time.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- profiles — identity fields required by the pre-publish/pre-search check.
-- Nullable: existing users aren't retroactively locked out, they just hit
-- the verification screen next time they try to publish or search.
-- ---------------------------------------------------------------------------
alter table profiles add column if not exists gender text check (gender in ('male', 'female'));
alter table profiles add column if not exists national_id text;

-- ---------------------------------------------------------------------------
-- profiles_child — a parent's sub-profiles for their kids (already existed,
-- unused). Adding age/school so it's usable for school-route search.
-- ---------------------------------------------------------------------------
alter table profiles_child add column if not exists age integer check (age is null or (age between 0 and 25));
alter table profiles_child add column if not exists school text;

-- ---------------------------------------------------------------------------
-- vehicles — collapse the old placeholder categories (sedan/hatchback/suv/
-- van/minibus) into the three real fleet categories. Existing rows are
-- remapped before the new check constraint goes on, so this doesn't fail on
-- live data. Seats and AC are then fully determined by type (private=4,
-- bus=14, suzuki=10, suzuki is always non-AC) — enforced server-side via
-- trigger so the client can't send an inconsistent combination.
-- ---------------------------------------------------------------------------
update vehicles set type = case
  when type in ('sedan', 'hatchback', 'suv') then 'private'
  when type in ('van', 'minibus') then 'bus'
  else type
end
where type in ('sedan', 'hatchback', 'suv', 'van', 'minibus');

alter table vehicles drop constraint if exists vehicles_type_check;
alter table vehicles add constraint vehicles_type_check check (type in ('private', 'bus', 'suzuki'));

alter table vehicles add column if not exists is_ac boolean not null default true;

create or replace function trg_vehicles_enforce_fleet_rules() returns trigger as $$
begin
  if new.type = 'private' then
    new.seats := 4;
  elsif new.type = 'bus' then
    new.seats := 14;
  elsif new.type = 'suzuki' then
    new.seats := 10;
    new.is_ac := false;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_vehicles_fleet_rules on vehicles;
create trigger trg_vehicles_fleet_rules
  before insert or update on vehicles
  for each row execute function trg_vehicles_enforce_fleet_rules();

-- backfill seats/AC on any pre-existing rows to match the rule above
update vehicles set type = type;

-- ---------------------------------------------------------------------------
-- find_matching_journeys — add school-mode search. Suzuki vehicles must
-- never appear in a normal search; they only appear when p_school_mode is
-- true (i.e. the passenger is searching on behalf of a child). p_child_id is
-- optional and, when present, must belong to the caller.
-- ---------------------------------------------------------------------------
drop function if exists find_matching_journeys(
  double precision, double precision, double precision, double precision, timestamptz, double precision
);

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
    and ST_DWithin(j.start_point, ST_SetSRID(ST_MakePoint(p_start_lng, p_start_lat), 4326)::geography, p_radius_km * 1000)
    and ST_DWithin(j.end_point, ST_SetSRID(ST_MakePoint(p_end_lng, p_end_lat), 4326)::geography, p_radius_km * 1000)
    and j.departure_time between p_departure_time - interval '2 hours' and p_departure_time + interval '2 hours'
  order by compatibility_score desc
  limit 20;
end;
$$ language plpgsql stable security definer;
