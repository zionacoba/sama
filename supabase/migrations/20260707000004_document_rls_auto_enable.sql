-- Documentation / reconciliation migration. Applying this to the current live DB
-- is a BEHAVIORAL NO-OP: it reproduces objects that already exist live, verbatim.
--
-- RLS AUTO-ENABLE: rls_auto_enable() + ensure_rls event trigger
--
-- These two objects already exist in the live database. They were hand-applied
-- directly (never captured in a migration), so a fresh `supabase db reset` would
-- NOT reproduce them. This migration documents them so the schema is fully
-- reproducible from the repo. We are KEEPING both. They are a safety feature.
--
-- WHAT THEY DO: `ensure_rls` fires on ddl_command_end and calls rls_auto_enable(),
-- which inspects the DDL commands just executed and runs
--   ALTER TABLE ... ENABLE ROW LEVEL SECURITY
-- on any newly created table in the `public` schema. This guarantees no public
-- table is ever accidentally left with RLS disabled. System schemas
-- (pg_catalog, information_schema, pg_toast*, pg_temp*) and any schema other than
-- public are skipped. Failures to enable RLS are swallowed and logged (raise log)
-- rather than aborting the DDL, so the trigger can never break a legitimate CREATE.
--
-- LIVE STATE (confirmed via reconciliation):
--   - function rls_auto_enable(): SECURITY DEFINER, RETURNS event_trigger, plpgsql,
--     SET search_path = pg_catalog
--   - event trigger ensure_rls: ON ddl_command_end, ENABLED, executes the above
--
-- search_path. VERBATIM MATCH TO LIVE:
--   The function is created with `SET search_path = pg_catalog`, which reproduces the
--   live pg_proc.proconfig EXACTLY (confirmed via pg_proc.proconfig). This is NOT a
--   hardening change: the goal here is verbatim fidelity to live, so applying this
--   migration is a true behavioral no-op. Do not "harden" this to public.

create or replace function public.rls_auto_enable()
  returns event_trigger
  language plpgsql
  security definer
  set search_path = pg_catalog
as $$
  declare
    cmd record;
  begin
    for cmd in
      select * from pg_event_trigger_ddl_commands()
      where command_tag in ('CREATE TABLE','CREATE TABLE AS','SELECT INTO')
        and object_type in ('table','partitioned table')
    loop
      if cmd.schema_name is not null and cmd.schema_name in ('public')
         and cmd.schema_name not in ('pg_catalog','information_schema')
         and cmd.schema_name not like 'pg_toast%' and cmd.schema_name not like 'pg_temp%' then
        begin
          execute format('alter table if exists %s enable row level security', cmd.object_identity);
          raise log 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
        exception when others then
          raise log 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
        end;
      else
        raise log 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
      end if;
    end loop;
  end;
$$;

-- Event triggers have no CREATE OR REPLACE, so drop-if-exists guards idempotency.
drop event trigger if exists ensure_rls;
create event trigger ensure_rls
  on ddl_command_end
  execute function public.rls_auto_enable();
