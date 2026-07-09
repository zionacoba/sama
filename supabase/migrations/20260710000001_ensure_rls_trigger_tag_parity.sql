-- Ensure the ensure_rls event trigger definition matches production, including
-- its trigger-level tag filter.
--
-- Background: live prod's ensure_rls event trigger is defined with tag
-- filtering at the trigger level, i.e. WHEN TAG IN ('CREATE TABLE',
-- 'CREATE TABLE AS', 'SELECT INTO'). This was read directly from
-- pg_event_trigger on 2026-07-09.
--
-- However, migration 20260707000004_document_rls_auto_enable.sql, whose header
-- describes it as a documentation-only no-op, in fact drops the trigger and
-- recreates it WITHOUT any tag clause. As a result, a from-scratch rebuild
-- ends up with an untagged trigger (verified on a local db reset on
-- 2026-07-10: pg_event_trigger showed evttags as null). That migration is
-- baselined history and must not be edited, so the fix lands here instead.
--
-- The two definitions are behaviorally equivalent because rls_auto_enable()
-- filters on command_tag internally, but they are not identical definitions,
-- and db diff does not inspect event triggers, so the drift would otherwise go
-- unnoticed.
--
-- This migration converges both environments on prod's tagged definition. On
-- prod, the drop and recreate reproduces the existing trigger exactly (a
-- behavioral no-op within the migration transaction). On fresh rebuilds, it
-- replaces the untagged version created by the July 7 migration.
--
-- Event triggers have no CREATE OR REPLACE, so drop-if-exists followed by
-- create is the idempotent form. The rls_auto_enable() function itself is
-- untouched.

drop event trigger if exists ensure_rls;

create event trigger ensure_rls
  on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function public.rls_auto_enable();
