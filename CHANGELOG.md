# Changelog

## Unreleased (session 6 — final closure pass)

- **Security fix** (`supabase/migrations/0012_harden_purge_expired_deleted_journeys_rpc.sql`):
  `purge_expired_deleted_journeys_rpc()` (0005) had no auth check and no
  `revoke`, so any signed-in client could call it directly via
  `supabase.rpc(...)` — the same gap already closed for its sibling
  cron-only functions in 0007/0011, but left open here because this one
  also has a legitimate client caller (the admin dashboard's on-load
  fallback purge for projects without `pg_cron`). Fix: `revoke` from
  `public, anon`, re-`grant` to `authenticated`, and add an in-function
  check that rejects a signed-in non-admin while tolerating the null
  `auth.uid()` that `pg_cron`'s direct SQL call produces — so cron and the
  admin fallback both keep working, and a passenger/captain calling the
  RPC directly no longer can.
- Full migration/RLS/RPC consistency pass (0001–0012): no duplicates, no
  signature drift, every frontend `supabase.rpc(...)` call name-checked
  against its definition, no other change needed.
- Build/typecheck/lint could not be verified in this pass — see delivery
  notes; `npm install` has no network access in this environment
  (`node_modules` isn't present in the source zip and the registry is
  unreachable).

## Unreleased (session 5)

- **FOFi assistant** (`src/components/FOFiAssistant.tsx`, mounted from
  `MainLayout.tsx`): rule-based FAQ chat (keyword-matched against a small
  knowledge base about the platform — booking, publishing, pricing,
  subscriptions, safety, payments, school rides, reviews), with quick-
  suggestion chips and a hand-off to a human when nothing matches: a
  WhatsApp link (01101002429) or an in-app message saved to the new
  `support_messages` table, which admins triage from the new "الدعم" tab.
- **Admin Dashboard extended** (`src/pages/AdminPage.tsx`, still at
  `/admin`, still behind the existing admin route guard) — was stats +
  review moderation only; added:
  - **Users tab**: every profile with a role dropdown +
    `admin_set_user_role_rpc` (audit-logged, blocks self-demotion).
  - **Journeys/fleet tab**: edit price/seats/status, force-cancel, or
    permanently delete any journey; a filter to show only journeys their
    owner soft-deleted, awaiting admin action or the 15-day auto-purge.
  - **Support tab**: FOFi hand-off inbox, mark resolved/open.
- **Journey soft-delete** (`supabase/migrations/0005_admin_dashboard_fofi.sql`):
  a captain "deleting" their own journey (`cancel_own_journey_rpc`, wired
  into `MyJourneysPage.tsx`) now sets `deleted_at` instead of hard-deleting
  — it disappears from search/my-journeys but stays intact for admins
  (`p_journeys_admin_select_all`) until `admin_delete_journey_rpc` removes
  it for good, or `purge_expired_deleted_journeys_rpc` auto-removes it
  after 15 days (scheduled via `pg_cron` when available; the admin
  dashboard also calls the purge RPC once on load as a fallback for
  projects without `pg_cron` enabled).
- **Location-picker report suggestions implemented**
  (`reports/location-picker-engineering-report.md`):
  1. Favorite places — `favorite_places` table + RLS, surfaced as chips
     with a "save current point" mini-form directly in `LocationPicker.tsx`
     (so both search and create-journey get it for free).
  2. Pickup radius tuning — `SearchMatchingPage.tsx` now has a 1–20km
     slider instead of the server's fixed 5km default.
  3. Route preview confirmation — `CreateJourneyPage.tsx` no longer
     publishes straight off the form; it shows a route/time/price summary
     card with an explicit "تأكيد النشر" step first.
  4. Reverse-geocoding caching — `locationService.ts` now caches both
     `geocodeAddress` and `reverseGeocode` results in-memory (capped,
     LRU-ish eviction) to cut down on repeat Nominatim calls.

## Unreleased (session 4)

- **First real backend** (`supabase/migrations/0001_core_schema.sql`,
  `0002_rpc_and_policies.sql`, `0003_storage.sql`): neither zip contained a
  single `.sql` file or `supabase/` folder anywhere, despite the frontend
  already calling `vehicles`, `notifications`, `messages`, `reviews`,
  `subscriptions`, `create_journey_rpc`, and `find_matching_journeys`. These
  three migrations are the first definition of all of them, written to
  match the client's existing assumed column names exactly (see the
  now-updated comments in `types/index.ts` / `apiService.ts`), plus:
  - RLS on every table (previously none existed to enable).
  - `find_matching_journeys` as a real PostGIS `ST_DWithin` query (handoff
    §5/§10) — was called by `SearchMatchingPage.tsx` but never defined.
  - `create_booking_rpc` — atomic seat-locking booking creation
    (`for update` on the journey row), replacing a direct `.insert()` that
    had no lock at all.
  - `accept_booking_rpc` / `reject_booking_rpc` — atomically decrement
    `available_seats` on acceptance, flip a journey to `full`, verify the
    caller is really the journey's captain, and notify the passenger.
    Replaces a direct `.update({ status })` the code's own comment flagged
    as missing the seat decrement.
  - `complete_journey_rpc` — new: marks a journey + its bookings completed
    and drops the "قيّم رحلتك" reminder notification for every party,
    closing the "reminder-to-review from Notifications" gap from session 3.
  - `calculate_journey_price_rpc` — first pricing-engine implementation
    (base fare + per-km, weekly/monthly discount). Launch-default rates, not
    a documented formula — nothing in either zip specified real numbers.
  - `continue_subscription_rpc` / `stop_subscription_rpc` — server-side
    ownership check plus pro-rated trial refund math, replacing the
    client-only status flips the session-3 code explicitly flagged as doing
    no money calculation at all.
  - `trg_recompute_trust_score` trigger — replaces the client-side
    read-then-write `recomputeTrustScore()` the session-3 code flagged as
    race-prone; now atomic on the server on every review insert/update/delete.
  - `moderate_review_rpc` + `reviews.is_hidden` — admin hide/unhide without
    delete, closing that session-3 "not done" item.
  - `avatars` storage bucket + per-user-folder policies, closing the one
    remaining unconfirmed schema assumption (`uploadAvatar()`).
- **Frontend wired to the new RPCs**: `createBookingRequest`,
  `updateBookingStatus`, `continueSubscription`/`stopSubscription`, and
  `createReview` in `apiService.ts` now call the RPCs above instead of
  direct table writes. New `completeJourney()`, `subscribeToAdminActivity()`,
  `fetchRecentReviewsForAdmin()`, `moderateReview()`.
- **Admin dashboard realtime** (closes "realtime for the admin dashboard
  itself", the one item every prior session's CHANGELOG left open): any
  change on `profiles`/`journeys`/`bookings` now silently re-fetches stats
  via `subscribeToAdminActivity()`.
- **Review moderation UI**: `AdminPage.tsx` now lists the 20 most recent
  reviews with a hide/show toggle per review.
- **"إنهاء الرحلة" (complete journey) button**: added to captain journey
  cards on `MyJourneysPage.tsx` for `in_progress`/`full`/`active` journeys —
  this was the missing UI entry point for `complete_journey_rpc` above;
  without it nothing could ever trigger the review-reminder flow.
- Facebook OAuth: still unconfirmed whether the provider is enabled in your
  Supabase project's dashboard — that's a config toggle, not something a
  migration file can turn on. The code path (`signInWithProvider`) is
  already identical to Google's and needs no change either way.

**Still not done**: re-verifying every schema assumption above against a
real, running Supabase project (these migrations are written to be
deployable and internally consistent, but were never run against live
infrastructure — review before applying to production); real payment
processing (still out of scope per handoff §8, MVP is 100% free);
`profiles_child` and `reports` tables now exist in the schema but have no
frontend screens yet (handoff §1/§9 — sub-profiles for children, and the
بلاغات/reports flow).

## Unreleased (session 3)

- **Reviews / ratings** (closes Reviews — FS-12, Phase 10): a completed booking (`bookings.status = 'completed'`) is now a reviewable trip for both sides.
  - New `Review` type (`src/types/index.ts`), assumed table `reviews` (columns: `id`, `booking_id`, `reviewer_id`, `reviewee_id`, `rating`, `comment`, `created_at`) with a unique `(booking_id, reviewer_id)` constraint expected server-side for "one rating per user per trip".
  - New service functions `fetchReviewableTrips`, `createReview`, `fetchReviewsForUser` (`src/services/apiService.ts`). `fetchMyBookings` now also embeds `journey.captain` (needed to show/rate the captain from the passenger side) — additive, no existing caller broken.
  - New `src/components/ReviewModal.tsx` (star picker 1–5 + optional comment, per FS-12's screen spec) — reused from both roles rather than a dedicated route.
  - `MyJourneysPage.tsx` now shows a "رحلات بانتظار تقييمك" section listing completed, not-yet-reviewed trips with a rate button (entry point: "صفحة رحلاتي" per FS-12).
  - **No new profile column**: average rating reuses the existing `profiles.trust_score` (was defined in `types/index.ts` but never read or written anywhere before this) — recomputed client-side from all of a user's reviews after each submission and now surfaced on `ProfilePage.tsx` (own score) and `JourneyDetailsPage.tsx` (captain's score, shown to prospective passengers).
  - **Not done**: reminder-to-review from Notifications/after-trip-end entry points (FS-12 lists these as additional entry points — only "My Trips" was wired up), review moderation/hide-without-delete for admins, and the average-rating recompute is a client-side read-then-write (a real race is possible under concurrent reviews) rather than a Postgres trigger — see the comment above `recomputeTrustScore`.
- **Subscriptions — state tracking only** (partially closes Subscriptions — "07. Pricing & Subscription Engine", Phase 8): captains can now actually create weekly/monthly journeys (`CreateJourneyPage.tsx` was hard-coding `journeyType: 'daily'` on every submit — no journey created through the UI could ever be anything else; this is the same class of bug as the P0 vehicle-UUID fix in session 1). Booking a weekly/monthly journey now creates a `subscriptions` row in `trial` state (3-day trial per spec), shown on `MyJourneysPage.tsx` under "اشتراكاتي" with Continue/Stop actions once the trial ends.
  - New `Subscription`/`SubscriptionStatus` types, assumed table `subscriptions` (columns: `id`, `booking_id`, `journey_id`, `captain_id`, `passenger_id`, `plan`, `status`, `trial_ends_at`, `created_at`).
  - New service functions `fetchMySubscriptions`, `continueSubscription`, `stopSubscription`, and internal `createSubscriptionForBooking` (`src/services/apiService.ts`), called from `createBookingRequest` when the journey is weekly/monthly.
  - **Explicitly NOT implemented** (the spec states these must run "بالكامل داخل Backend" — entirely server-side — and no RPC for any of them exists anywhere in this codebase to call): locked-distance/per-km pricing, the negotiation price ladder (Daily/Weekly/Monthly offer steps), and all refund/compensation math for early cancellation. `continueSubscription`/`stopSubscription` only flip the status column — they move no money and calculate no amounts. Building the real versions needs backend RPCs first; see the final report.

**Still not done**: realtime for the admin dashboard itself, and re-verifying every schema assumption listed in prior sessions (including the new `reviews` and `subscriptions` tables above) against the real Supabase project.

## Unreleased (session 2)

- **Admin panel now shows real data** (closes P2 #11): user/captain/passenger counts, journey counts (total + active), booking counts (total + pending), and the 5 most recently registered users. Reads only `profiles`, `journeys`, `bookings` — all three already confirmed in use elsewhere, no new schema assumption.
- **Role selection on first login** (closes P1 #7 / Missing Features "Role Selection / Onboarding"): the existing terms-acceptance screen (shown when `profile.terms_accepted` is false) now also asks the user to pick راكب/قائد رحلة before continuing, and saves it via `updateProfile`. Uses only the existing `role` and `terms_accepted` columns — no new table.
- **Avatar upload** (closes Missing Features "Storage"): Profile page now has a camera button on the avatar that uploads to Supabase Storage and saves the public URL to the existing `avatar_url` column.
  - **New schema assumption**: assumes a public Storage bucket named `avatars` exists — this is the one genuinely new assumption in this batch (the `avatar_url` column itself was already in use). See the comment above `uploadAvatar` in `apiService.ts`.
- **Realtime for notifications and chat** (closes P4 #19, partially): both now use `supabase.channel(...).on('postgres_changes', ...)` to receive new rows live instead of only on reload/send. No new tables — subscribes to the same `notifications`/`messages` tables added in session 1.
- Facebook OAuth button (P2 #12) — left as-is. It already goes through the same try/catch as Google and surfaces whatever error Supabase returns if the provider isn't enabled, so there's no code defect to fix; whether the provider is actually enabled can only be confirmed from the Supabase Dashboard.

**Still not done**: Reviews, Subscriptions, realtime for the admin dashboard itself, and re-verifying every schema assumption listed in session 1 and above against the real Supabase project.

## Unreleased (this session)

**⚠️ Every item below reads from a Supabase table that was not found anywhere in the
original codebase (no migrations, no prior query against it). Each service function
is commented with its schema assumption — verify column names against your real
Supabase schema before deploying. If a table doesn't exist or has different columns,
the relevant page will show its error state instead of failing silently.**

- **Vehicles** (closes P0 #1 — was a hardcoded placeholder UUID):
  - New `Vehicle` type (`src/types/index.ts`), assumed table `vehicles` (columns: `id`, `captain_id`, `make`, `model`, `color`, `plate_number`, `seats`, `type`, `created_at`).
  - New service functions `fetchMyVehicles`, `createVehicle`, `deleteVehicle` (`src/services/apiService.ts`).
  - New `src/pages/VehiclesPage.tsx` (list + add/delete), route `/vehicles`, linked from Profile for captains.
  - `CreateJourneyPage.tsx` now fetches the captain's real vehicles and lets them pick one; publishing is blocked (honestly, with a link to add a vehicle) only when they have none — no more fake UUID.
- **Notifications** (closes P1 #6 — was a permanently static screen):
  - New `AppNotification` type, assumed table `notifications` (columns: `id`, `user_id`, `title`, `body`, `link`, `is_read`, `created_at`).
  - New service functions `fetchMyNotifications`, `markNotificationRead`.
  - `NotificationsPage.tsx` now fetches real data, shows unread state, marks-as-read on open, and navigates to `link` if present.
- **Chat** (closes P2 #10 — was a permanently static screen):
  - New `ChatMessage` type, assumed table `messages` (columns: `id`, `booking_id`, `sender_id`, `content`, `created_at`) — keyed directly by `booking_id` rather than a separate `conversations` table, since every real thread maps 1:1 to an accepted booking.
  - New service functions `fetchMyChatThreads`, `fetchMessages`, `sendMessage`.
  - `ChatPage.tsx` now shows a real thread list (from accepted/completed bookings) and a working message thread with send. **Not realtime** — messages only appear on send/reload; no `supabase.channel()` subscription was added (see report P4 #19).
- Added a "طلبات الحجز الواردة" (booking requests) shortcut on the Profile page for captains — this route already existed (`/booking-requests`) but had no nav entry anywhere.

**Still not done** (see the audit's Priority Matrix for the rest): Admin panel is still static text (route is now role-gated, content isn't real); Facebook OAuth button unconfirmed; avatar upload; first-login role selection/onboarding; realtime for notifications/chat; Reviews; Subscriptions.

## Unreleased

- Add global toast system (`src/contexts/ToastContext.tsx`, `src/components/ui/Toast.tsx`) and wired into journey creation.
- Accessibility improvements:
  - Improved keyboard focus and focus-visible rings on `Button` (`src/components/ui/Button.tsx`).
  - Inputs now have `id`, `label` association and `aria-invalid`/`aria-describedby` (`src/components/ui/Input.tsx`).
  - Added skip link and main landmark in `src/layouts/MainLayout.tsx`.
  - Added `aria-label` attributes to bottom navigation links.
- Added `ErrorState` usage in `src/pages/CreateJourneyPage.tsx` and applied `EmptyState` across core pages.
- Responsive checks run for common mobile widths; no horizontal overflow detected.
