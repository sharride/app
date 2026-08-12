-- =============================================================================
-- sharride — 0012_harden_purge_expired_deleted_journeys_rpc.sql
--
-- WHY THIS FILE EXISTS
-- ---------------------------------------------------------------------------
-- Closes the gap flagged in 0007_retention.sql's Phase 7 note and left open
-- in 0011_harden_cron_only_rpcs.sql: purge_expired_deleted_journeys_rpc()
-- (0005_admin_dashboard_fofi.sql) has no auth check and no revoke, so any
-- signed-in client can currently call
-- supabase.rpc('purge_expired_deleted_journeys_rpc') directly.
--
-- This one is NOT the same shape as the three 0007 functions / the 0009
-- function hardened in 0011. Those are pure cron-only — no legitimate
-- client ever calls them, so a blanket "revoke from anon, authenticated"
-- was correct. This function is different: apiService.ts
-- (purgeExpiredDeletedJourneys) calls it once whenever AdminPage mounts, as
-- a documented, intentional fallback for free-tier projects without
-- pg_cron enabled. A blind copy of the 0011 pattern would revoke
-- "authenticated" entirely and silently break that fallback (the frontend
-- swallows the error — see apiService.ts) on exactly the projects that
-- need it most.
--
-- Fix has two parts, both required together:
--   1. Revoke the default PUBLIC grant and anon specifically — an
--      anonymous/unauthenticated caller never has a legitimate reason to
--      run this.
--   2. Re-grant to authenticated, but add an in-function admin check (same
--      shape as admin_delete_journey_rpc in 0005) so a signed-in non-admin
--      can no longer trigger it — while a signed-in admin (the dashboard
--      fallback) still can.
--
-- The admin check is written to tolerate a null auth.uid() rather than
-- reject it: pg_cron calls this function directly at the SQL level (no
-- PostgREST/JWT context), so auth.uid() reads as null there — not as "no
-- caller identity". Only reject when there IS a caller identity and it
-- isn't an admin's. postgres/service_role (which pg_cron runs as) also
-- bypasses the GRANT/REVOKE check entirely, same as the 0007/0011 note
-- describes, so the cron schedule in 0005 keeps working either way.
-- =============================================================================

create or replace function purge_expired_deleted_journeys_rpc() returns integer as $$
declare
  v_count integer;
begin
  if auth.uid() is not null and not is_admin(auth.uid()) then
    raise exception 'غير مصرح لك بهذا الإجراء';
  end if;

  delete from journeys
    where deleted_at is not null and deleted_at < now() - interval '15 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$ language plpgsql security definer;

revoke execute on function purge_expired_deleted_journeys_rpc() from public, anon;
grant execute on function purge_expired_deleted_journeys_rpc() to authenticated;
