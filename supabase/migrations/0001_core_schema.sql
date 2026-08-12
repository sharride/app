-- =============================================================================
-- sharride — 0001_core_schema.sql
--
-- WHY THIS FILE EXISTS
-- ---------------------------------------------------------------------------
-- Neither ShareRide-final-merged nor app-main contained a single .sql file,
-- migration, or supabase/ folder anywhere. The frontend (apiService.ts)
-- already calls tables and RPCs that were never defined server-side —
-- `vehicles`, `notifications`, `messages`, `reviews`, `subscriptions`, plus
-- RPCs `create_journey_rpc` and `find_matching_journeys`. This migration is
-- the first real definition of all of them, written to match exactly the
-- column names/types the client already assumes (see the "SCHEMA ASSUMPTION"
-- comments in src/types/index.ts and src/services/apiService.ts) so nothing
-- in the existing frontend needs to change to start working.
--
-- Naming conventions below follow the handoff doc §16 exactly:
--   tables: plural snake_case (journeys, bookings)
--   columns: snake_case
--   RPCs: verb_object (create_booking, cancel_booking, ...)
--   triggers: trg_*
--   indexes: idx_table_column
--
-- Run this before 0002_rpc_and_policies.sql (RLS + RPC functions) and
-- 0003_storage.sql (avatars bucket).
-- =============================================================================

create extension if not exists postgis;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- profiles — one row per auth.users row (handoff §5: "no dedicated users
-- table; every table links directly to auth.users"). Columns match
-- src/types/index.ts -> Profile exactly.
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id                     uuid primary key references auth.users(id) on delete cascade,
  full_name              text not null default '',
  phone_number           text,
  role                   text not null default 'passenger'
                           check (role in ('passenger','captain','parent','student','admin','super_admin')),
  governorate            text not null default '',
  city                   text not null default '',
  gender_pref            text not null default 'everyone'
                           check (gender_pref in ('men_only','women_only','everyone')),
  avatar_url             text,
  terms_accepted         boolean not null default false,
  terms_version          text not null default 'v1.0',
  status                 text not null default 'pending_setup'
                           check (status in ('pending_setup','active','suspended','deleted')),
  trust_score            numeric(3,2) not null default 0,
  total_trips_completed  integer not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists idx_profiles_role on profiles(role);
create index if not exists idx_profiles_status on profiles(status);

-- Auto-create a profile row the moment someone signs up (Google/Facebook
-- OAuth per handoff §3 — Supabase Auth already creates the auth.users row;
-- this just mirrors it so every other table's FK to profiles.id is always
-- satisfiable). Without this, first-login `updateTermsAcceptance` in
-- apiService.ts would fail — that call updates an existing row, it never
-- inserts one.
create or replace function trg_handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function trg_handle_new_user();

-- ---------------------------------------------------------------------------
-- profiles_child — handoff §5 lists "Profiles Child" among the 14 core
-- tables ("ملفات فرعية لأبنائه" — sub-profiles a parent creates for their
-- children, §1/§3). Not referenced anywhere in either zip's frontend yet —
-- included here so the table exists once that screen is built, per the
-- Constitution's ban on random schema changes later (§9).
-- ---------------------------------------------------------------------------
create table if not exists profiles_child (
  id           uuid primary key default gen_random_uuid(),
  parent_id    uuid not null references profiles(id) on delete cascade,
  full_name    text not null,
  gender_pref  text not null default 'everyone'
                 check (gender_pref in ('men_only','women_only','everyone')),
  created_at   timestamptz not null default now()
);

create index if not exists idx_profiles_child_parent_id on profiles_child(parent_id);

-- ---------------------------------------------------------------------------
-- vehicles — matches src/types/index.ts -> Vehicle exactly.
-- ---------------------------------------------------------------------------
create table if not exists vehicles (
  id            uuid primary key default gen_random_uuid(),
  captain_id    uuid not null references profiles(id) on delete cascade,
  make          text not null,
  model         text not null,
  color         text,
  plate_number  text,
  seats         integer not null check (seats > 0),
  type          text not null check (type in ('sedan','hatchback','suv','van','minibus')),
  created_at    timestamptz not null default now()
);

create index if not exists idx_vehicles_captain_id on vehicles(captain_id);

-- ---------------------------------------------------------------------------
-- journeys — matches src/types/index.ts -> Journey. Locations stored twice:
-- as PostGIS geography(Point) for the matching engine (handoff §5 — PostGIS
-- extension, §"محرك المطابقة الذيك") and as plain lat/lng + address text for
-- the client to read directly without a PostGIS-aware query every time.
-- ---------------------------------------------------------------------------
create table if not exists journeys (
  id                 uuid primary key default gen_random_uuid(),
  captain_id         uuid not null references profiles(id) on delete cascade,
  vehicle_id         uuid not null references vehicles(id) on delete restrict,
  start_lat          double precision not null,
  start_lng          double precision not null,
  end_lat            double precision not null,
  end_lng            double precision not null,
  start_point        geography(Point, 4326) generated always as (
                       ST_SetSRID(ST_MakePoint(start_lng, start_lat), 4326)::geography
                     ) stored,
  end_point          geography(Point, 4326) generated always as (
                       ST_SetSRID(ST_MakePoint(end_lng, end_lat), 4326)::geography
                     ) stored,
  start_address      text not null,
  end_address        text not null,
  departure_time     timestamptz not null,
  journey_type       text not null default 'daily' check (journey_type in ('daily','weekly','monthly')),
  total_seats        integer not null check (total_seats > 0),
  available_seats    integer not null check (available_seats >= 0),
  price_per_seat     numeric(10,2) not null check (price_per_seat >= 0),
  gender_pref        text not null default 'everyone' check (gender_pref in ('men_only','women_only','everyone')),
  notes              text,
  status             text not null default 'draft' check (status in
                       ('draft','published','active','receiving_bookings','full','in_progress','completed','cancelled')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint chk_available_seats_le_total check (available_seats <= total_seats)
);

create index if not exists idx_journeys_captain_id on journeys(captain_id);
create index if not exists idx_journeys_status on journeys(status);
create index if not exists idx_journeys_departure_time on journeys(departure_time);
create index if not exists idx_journeys_start_point on journeys using gist(start_point);
create index if not exists idx_journeys_end_point on journeys using gist(end_point);

-- ---------------------------------------------------------------------------
-- bookings — matches src/types/index.ts -> Booking.
-- ---------------------------------------------------------------------------
create table if not exists bookings (
  id             uuid primary key default gen_random_uuid(),
  journey_id     uuid not null references journeys(id) on delete cascade,
  passenger_id   uuid not null references profiles(id) on delete cascade,
  seats_booked   integer not null check (seats_booked > 0),
  price_offered  numeric(10,2) not null check (price_offered >= 0),
  final_price    numeric(10,2) not null check (final_price >= 0),
  status         text not null default 'pending' check (status in
                   ('pending','captain_review','accepted','rejected','cancelled_by_passenger',
                    'cancelled_by_captain','expired','completed')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- One pending/accepted booking per passenger per journey — matches the
  -- app's "no duplicate booking" rule (handoff §6, "منع الحجز المكرر").
  constraint uq_bookings_journey_passenger_active unique (journey_id, passenger_id)
);

create index if not exists idx_bookings_journey_id on bookings(journey_id);
create index if not exists idx_bookings_passenger_id on bookings(passenger_id);
create index if not exists idx_bookings_status on bookings(status);

-- ---------------------------------------------------------------------------
-- subscriptions — matches src/types/index.ts -> Subscription exactly
-- (session-3 client code already assumes this shape).
-- ---------------------------------------------------------------------------
create table if not exists subscriptions (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid not null unique references bookings(id) on delete cascade,
  journey_id     uuid not null references journeys(id) on delete cascade,
  captain_id     uuid not null references profiles(id) on delete cascade,
  passenger_id   uuid not null references profiles(id) on delete cascade,
  plan           text not null check (plan in ('weekly','monthly')),
  status         text not null default 'trial' check (status in ('trial','active','completed','cancelled')),
  trial_ends_at  timestamptz not null,
  created_at     timestamptz not null default now()
);

create index if not exists idx_subscriptions_passenger_id on subscriptions(passenger_id);
create index if not exists idx_subscriptions_captain_id on subscriptions(captain_id);

-- ---------------------------------------------------------------------------
-- notifications — matches src/types/index.ts -> AppNotification exactly.
-- ---------------------------------------------------------------------------
create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  title       text not null,
  body        text,
  link        text,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists idx_notifications_user_id on notifications(user_id);
create index if not exists idx_notifications_is_read on notifications(is_read);

-- ---------------------------------------------------------------------------
-- messages — matches src/types/index.ts -> ChatMessage exactly. Keyed
-- directly by booking_id per the existing client's modeling choice (every
-- real thread maps 1:1 to an accepted booking) rather than a separate
-- conversations table.
-- ---------------------------------------------------------------------------
create table if not exists messages (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references bookings(id) on delete cascade,
  sender_id   uuid not null references profiles(id) on delete cascade,
  content     text not null check (char_length(trim(content)) > 0),
  created_at  timestamptz not null default now()
);

create index if not exists idx_messages_booking_id on messages(booking_id);

-- ---------------------------------------------------------------------------
-- reviews — matches src/types/index.ts -> Review, plus is_hidden for admin
-- moderation (handoff review notes: "review moderation/hide-without-delete
-- for admins" — listed as not-done in CHANGELOG session 3).
-- ---------------------------------------------------------------------------
create table if not exists reviews (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references bookings(id) on delete cascade,
  reviewer_id  uuid not null references profiles(id) on delete cascade,
  reviewee_id  uuid not null references profiles(id) on delete cascade,
  rating       smallint not null check (rating between 1 and 5),
  comment      text,
  is_hidden    boolean not null default false,
  created_at   timestamptz not null default now(),
  constraint uq_reviews_booking_reviewer unique (booking_id, reviewer_id)
);

create index if not exists idx_reviews_reviewee_id on reviews(reviewee_id);
create index if not exists idx_reviews_booking_id on reviews(booking_id);

-- ---------------------------------------------------------------------------
-- reports — handoff §"إدارة والتشغيل" / FS list includes a reports/بلاغات
-- screen; not wired up in either zip's frontend yet, included for parity
-- with the Constitution's "no ad-hoc schema later" rule.
-- ---------------------------------------------------------------------------
create table if not exists reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references profiles(id) on delete cascade,
  target_type  text not null check (target_type in ('journey','booking','profile','message')),
  target_id    uuid not null,
  reason       text not null,
  status       text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at   timestamptz not null default now()
);

create index if not exists idx_reports_status on reports(status);

-- ---------------------------------------------------------------------------
-- audit_logs — handoff §2 requires an audit trail ("التدقيق / Audit").
-- Written to by the RPCs in 0002 for every state-changing action.
-- ---------------------------------------------------------------------------
create table if not exists audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references profiles(id) on delete set null,
  action      text not null,
  target_type text,
  target_id   uuid,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_audit_logs_actor_id on audit_logs(actor_id);
create index if not exists idx_audit_logs_created_at on audit_logs(created_at);

-- ---------------------------------------------------------------------------
-- generic updated_at trigger, reused by profiles/journeys/bookings
-- ---------------------------------------------------------------------------
create or replace function trg_set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_profiles_updated_at on profiles;
create trigger trg_profiles_updated_at before update on profiles
  for each row execute function trg_set_updated_at();

drop trigger if exists trg_journeys_updated_at on journeys;
create trigger trg_journeys_updated_at before update on journeys
  for each row execute function trg_set_updated_at();

drop trigger if exists trg_bookings_updated_at on bookings;
create trigger trg_bookings_updated_at before update on bookings
  for each row execute function trg_set_updated_at();
