-- app_config authenticated select policy: this policy was hand-applied in the
-- pre-migration era and is captured here so a from-scratch replay matches prod.
-- Guarded with an existence check because CREATE POLICY has no IF NOT EXISTS,
-- so it no-ops on prod with a NOTICE.

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'app_config'
      and policyname = 'app_config readable by authenticated'
  ) then
    create policy "app_config readable by authenticated"
      on public.app_config
      as permissive
      for select
      to authenticated
      using (true);
  else
    raise notice 'policy "app_config readable by authenticated" on public.app_config already exists, skipping';
  end if;
end
$$;
