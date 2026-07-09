-- RLS AUTO-ENABLE: create the hand-applied function and event trigger.
--
-- The rls_auto_enable() function and the ensure_rls event trigger were
-- hand-applied in the pre-migration era. Migration 20260707000004 documented
-- them but did not create them, so a from-scratch replay was missing both.
-- This migration captures them so a from-scratch replay matches prod.
--
-- The function uses CREATE OR REPLACE, so it is idempotent on prod. The
-- trigger creation is guarded because CREATE EVENT TRIGGER has no
-- IF NOT EXISTS; on prod, where ensure_rls already exists, the guard
-- no-ops with a NOTICE.
--
-- The trigger definition (ddl_command_end, the three tags) was read from
-- the live pg_event_trigger catalog on 2026-07-09.

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

do $$
begin
  if not exists (
    select 1 from pg_event_trigger where evtname = 'ensure_rls'
  ) then
    create event trigger ensure_rls
      on ddl_command_end
      when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      execute function public.rls_auto_enable();
  else
    raise notice 'event trigger "ensure_rls" already exists, skipping';
  end if;
end
$$;
