# Production pg_cron Jobs

These are the live pg_cron jobs on the production Supabase project (ref `ctfcfrzgcrjgqljmjgil`), captured from a live redacted read of `cron.job` on 2026-07-10. Bearer tokens are redacted. The real `CRON_SECRET` lives in the Supabase edge function secrets (and the password manager), and must never be written into this file or the repo.

If the database ever has to be rebuilt, this file is the recipe to recreate the jobs.

## jobid 8: cleanup-abandoned-payments

- jobid: 8
- jobname: `cleanup-abandoned-payments`
- schedule: `*/10 * * * *` (every 10 minutes)

```sql
select net.http_post(
    url := 'https://ctfcfrzgcrjgqljmjgil.supabase.co/functions/v1/cleanup-abandoned-payments',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <REDACTED>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
```

## jobid 9: pending-approval-reminder

- jobid: 9
- jobname: `pending-approval-reminder`
- schedule: `0 9 * * *` (daily at 09:00 UTC)

```sql
select net.http_post(
    url := 'https://ctfcfrzgcrjgqljmjgil.supabase.co/functions/v1/pending-approval-reminder',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <REDACTED>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
```

## jobid 10: pre-trip-reminder

- jobid: 10
- jobname: `pre-trip-reminder`
- schedule: `0 0 * * *` (daily at 00:00 UTC)

```sql
select net.http_post(
    url := 'https://ctfcfrzgcrjgqljmjgil.supabase.co/functions/v1/pre-trip-reminder',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <REDACTED>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
```

## jobid 11: stale-application-reminder

- jobid: 11
- jobname: `stale-application-reminder`
- schedule: `0 1 * * 1` (Mondays at 01:00 UTC)

```sql
select net.http_post(
    url := 'https://ctfcfrzgcrjgqljmjgil.supabase.co/functions/v1/stale-application-reminder',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <REDACTED>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
```

## jobid 12: retry-failed-refunds

- jobid: 12
- jobname: `retry-failed-refunds`
- schedule: `*/30 * * * *` (every 30 minutes)

```sql
select net.http_post(
    url := 'https://ctfcfrzgcrjgqljmjgil.supabase.co/functions/v1/retry-failed-refunds',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <REDACTED>'
    )
  );
```

## jobid 13: reconciliation-digest-daily

- jobid: 13
- jobname: `reconciliation-digest-daily`
- schedule: `0 1 * * *` (daily at 01:00 UTC)

```sql
select net.http_post(
    url := 'https://ctfcfrzgcrjgqljmjgil.supabase.co/functions/v1/reconciliation-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <REDACTED>'
    ),
    body := '{}'::jsonb
  );
```

## jobid 14: prune-http-response-log

- jobid: 14
- jobname: `prune-http-response-log`
- schedule: `0 2 * * *` (daily at 02:00 UTC)

```sql
delete from net._http_response where created < now() - interval '7 days'
```

## jobid 15: purge-expired-medical-data-daily

- jobid: 15
- jobname: `purge-expired-medical-data-daily`
- schedule: `0 18 * * *` (daily at 18:00 UTC)

```sql
select net.http_post(
    url := 'https://ctfcfrzgcrjgqljmjgil.supabase.co/functions/v1/purge-expired-medical-data',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <REDACTED>'
    ),
    body := '{}'::jsonb
  );
```

## Notes

1. 7 of the 8 jobs call edge functions with an `Authorization: Bearer` header carrying `CRON_SECRET`. jobid 14 is pure SQL and carries no secret.
2. Healthchecks dead-man's-switch pings live inside the edge functions themselves, so they only fire on successful runs.
3. The `cleanup-abandoned-payments` edge function additionally calls two Vercel-hosted internal API routes (`/api/internal/notify-waitlist` and `/api/internal/reconcile-booking`) authenticated with the same `CRON_SECRET` from the Vercel Production env. Rotations must therefore cover the Supabase edge secrets, all 7 cron job commands, AND the Vercel env (see the repo's rotation lessons).
4. To re-verify the live definitions, run the redacted read against `cron.job` using `regexp_replace(command, '(Bearer )[^''"]+', '\1<REDACTED>', 'g')`. Never select the raw `command` column to a screen.

The commands above are reproduced verbatim from the live read, including header ordering differences between jobs and the fact that jobid 12 sends no `body` parameter while the other http jobs send `body := '{}'::jsonb`. These asymmetries are real; do not normalize them when recreating the jobs.
