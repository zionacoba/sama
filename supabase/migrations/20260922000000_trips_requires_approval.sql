-- Per-trip organizer approval, independent of difficulty. Default false: every existing trip keeps auto-confirm.
alter table public.trips add column requires_approval boolean not null default false;
