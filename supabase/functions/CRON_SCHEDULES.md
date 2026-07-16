# Scheduled jobs (pg_cron)

These eight jobs are **pg_cron schedules configured in the Supabase dashboard**, not in a
committed migration. Seven of them are triggered by pg_net, which makes an HTTP call to the
matching edge function endpoint with a `CRON_SECRET` bearer token. The eighth,
`prune-http-response-log`, is a pure-SQL pg_cron job with no edge function; it runs its cleanup
directly in the database. Because they live in the dashboard, **the Supabase Cron dashboard is
the source of truth**; this file is the human-readable reference and can drift if someone edits
a schedule without updating it here.

pg_cron evaluates all cron expressions in **UTC**. So `0 1 * * *` fires at 01:00 UTC. The
operator is in Manila (UTC+8), so each row below also lists the Manila local time in parentheses
for convenience.

Edge function CODE is deployed manually via `supabase functions deploy <function-name>`; pushing to main deploys the Next.js app only, never edge functions.

## Schedules

| Job | Cron expression | Cadence | UTC time | Manila time (UTC+8) | Active | Monitoring |
| --- | --- | --- | --- | --- | --- | --- |
| `cleanup-abandoned-payments` | `*/10 * * * *` | every 10 minutes | continuous | continuous | yes | Healthchecks dead-mans-switch |
| `retry-failed-refunds` | `*/30 * * * *` | every 30 minutes | continuous | continuous | yes | Healthchecks dead-mans-switch |
| `reconciliation-digest-daily` | `0 1 * * *` | daily | 01:00 | 09:00 | yes | Healthchecks dead-mans-switch |
| `pre-trip-reminder` | `0 0 * * *` | daily | 00:00 | 08:00 | yes | none yet |
| `pending-approval-reminder` | `0 9 * * *` | daily | 09:00 | 17:00 | yes | none yet |
| `stale-application-reminder` | `0 1 * * 1` | weekly, Mondays | 01:00 | 09:00 | yes | none yet |
| `purge-expired-medical-data-daily` | `0 18 * * *` | daily | 18:00 | 02:00 (next day) | yes | Healthchecks dead-mans-switch |
| `prune-http-response-log` | `0 2 * * *` | daily | 02:00 | 10:00 | yes | none yet |

Note: `purge-expired-medical-data-daily` runs at 18:00 UTC, which is 02:00 the following day in
Manila.

## Monitoring

A Healthchecks dead-mans-switch ping tells us when a job silently stops running. Today four jobs
carry one:

- `reconciliation-digest-daily`
- `retry-failed-refunds`
- `cleanup-abandoned-payments`
- `purge-expired-medical-data-daily`

The remaining jobs (`pre-trip-reminder`, `pending-approval-reminder`,
`stale-application-reminder`, `prune-http-response-log`) have no dead-mans-switch and would fail
silently.

## Changing a schedule

To change a schedule, edit it in the **Supabase Cron dashboard**, then update this file to match.
