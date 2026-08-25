-- Overload PT — Supabase schema for the remote backup target.
--
-- Run this once in the SQL editor of a new project. The client only ever
-- performs two kinds of write:
--   1. upsert one row per chart into `charts` (jsonb snapshot)
--   2. upsert flattened rows into `body_metrics` (so trends are queryable)
-- plus object uploads into the `movement-media` Storage bucket.
--
-- IndexedDB on the device stays the source of truth. This is the backup.

create extension if not exists "pgcrypto";

-- ── Roster ──────────────────────────────────────────────────────────────

create table if not exists clinics (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  created_at   timestamptz not null default now()
);

create table if not exists therapists (
  -- Matches the client-side therapist id (e.g. 'th_dana'), so a restore is
  -- a straight copy rather than an id remapping exercise.
  id           text primary key,
  clinic_id    uuid references clinics (id) on delete cascade,
  name         text not null,
  credential   text not null default '',
  -- Set this once the therapist has a Supabase auth user, and the policies
  -- below start scoping rows to real people instead of the anon key.
  auth_user_id uuid unique references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

-- ── Charts ──────────────────────────────────────────────────────────────

-- One row per client. `chart` is the whole ClientRecord as jsonb: program,
-- sessions, notes, audit, body metrics, clip records, voice note records.
-- Keeping it as a document means the app can evolve its shape without a
-- migration, while the promoted columns stay useful for filtering and RLS.
create table if not exists charts (
  client_id            text primary key,
  clinic_id            uuid references clinics (id) on delete cascade,
  clinic_name          text not null default '',
  client_name          text not null default '',
  condition            text not null default '',
  therapist_id         text not null,
  shared_therapist_ids text[] not null default '{}',
  shared_with_clinic   boolean not null default false,
  chart                jsonb not null,
  updated_at           timestamptz not null default now()
);

create index if not exists charts_therapist_idx on charts (therapist_id);
create index if not exists charts_shared_idx on charts using gin (shared_therapist_ids);

-- ── Body metrics ────────────────────────────────────────────────────────

-- Flattened so a trainer can answer "waist over the last twelve weeks?" in
-- SQL without unpacking jsonb. Every column is nullable: one number is a
-- valid entry.
create table if not exists body_metrics (
  id             text primary key,
  client_id      text not null references charts (client_id) on delete cascade,
  measured_at    timestamptz not null,
  bodyweight     numeric,
  body_fat_pct   numeric,
  waist          numeric,
  hip            numeric,
  thigh          numeric,
  arm            numeric,
  resting_hr     integer,
  vo2max         numeric,
  calipers       jsonb not null default '{}'::jsonb,
  dexa           jsonb,
  note           text not null default '',
  units          text not null default 'lb',
  length_units   text not null default 'in',
  logged_by      text not null default 'trainer',
  logged_by_id   text not null default '',
  logged_by_name text not null default '',
  created_at     timestamptz not null default now()
);

create index if not exists body_metrics_client_idx on body_metrics (client_id, measured_at desc);

-- ── Media index (optional) ──────────────────────────────────────────────

-- The blobs live in Storage; this table is only needed if you want to query
-- media without opening the chart document. The client does not write it.
create table if not exists media_objects (
  id          text primary key,
  client_id   text not null references charts (client_id) on delete cascade,
  kind        text not null check (kind in ('clip', 'voice')),
  exercise_id text,
  session_id  text,
  object_path text not null,
  mime_type   text not null default '',
  byte_size   bigint not null default 0,
  recorded_at timestamptz not null,
  created_at  timestamptz not null default now()
);

-- ── Row level security ──────────────────────────────────────────────────

alter table clinics      enable row level security;
alter table therapists   enable row level security;
alter table charts       enable row level security;
alter table body_metrics enable row level security;
alter table media_objects enable row level security;

-- Which charts the signed-in therapist may touch: their own caseload, charts
-- shared with them by name, and charts shared clinic-wide. This mirrors
-- canAccessChart() in src/store/context.ts exactly.
create or replace function can_access_chart(target_client_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from charts c
    join therapists t on t.auth_user_id = auth.uid()
    where c.client_id = target_client_id
      and (
        c.therapist_id = t.id
        or c.shared_with_clinic
        or t.id = any (c.shared_therapist_ids)
      )
  );
$$;

create policy "therapists read their clinic" on clinics
  for select using (
    exists (select 1 from therapists t where t.auth_user_id = auth.uid() and t.clinic_id = clinics.id)
  );

create policy "therapists read the roster" on therapists
  for select using (
    exists (select 1 from therapists me where me.auth_user_id = auth.uid() and me.clinic_id = therapists.clinic_id)
  );

create policy "read accessible charts" on charts
  for select using (can_access_chart(client_id));

create policy "write accessible charts" on charts
  for insert with check (can_access_chart(client_id) or not exists (select 1 from charts c where c.client_id = charts.client_id));

create policy "update accessible charts" on charts
  for update using (can_access_chart(client_id));

create policy "read accessible metrics" on body_metrics
  for select using (can_access_chart(client_id));

create policy "write accessible metrics" on body_metrics
  for insert with check (can_access_chart(client_id));

create policy "update accessible metrics" on body_metrics
  for update using (can_access_chart(client_id));

create policy "read accessible media rows" on media_objects
  for select using (can_access_chart(client_id));

-- ── Storage ─────────────────────────────────────────────────────────────

-- Private bucket. Object paths are `<client_id>/clips/<blob_key>` and
-- `<client_id>/voice/<blob_key>`, which is what src/lib/backup.ts writes.
insert into storage.buckets (id, name, public, file_size_limit)
values ('movement-media', 'movement-media', false, 52428800)
on conflict (id) do nothing;

create policy "read accessible media" on storage.objects
  for select using (
    bucket_id = 'movement-media'
    and can_access_chart((storage.foldername(name))[1])
  );

create policy "upload accessible media" on storage.objects
  for insert with check (
    bucket_id = 'movement-media'
    and can_access_chart((storage.foldername(name))[1])
  );

create policy "replace accessible media" on storage.objects
  for update using (
    bucket_id = 'movement-media'
    and can_access_chart((storage.foldername(name))[1])
  );
