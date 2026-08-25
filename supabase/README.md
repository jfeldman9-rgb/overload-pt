# Supabase backup target

The app is offline-first. IndexedDB on the device is the source of truth for
chart data **and** for video and audio blobs. Supabase is the backup: after
every mutation the client writes locally and then enqueues a remote push.

If the two environment variables below are absent, the app works exactly as
it does now, holds the queue on the device, and says **On this device**. It
does not claim a cloud copy that does not exist.

## Setup

1. Create a Supabase project.
2. Open the SQL editor and run [`schema.sql`](./schema.sql). It creates the
   tables, the `movement-media` Storage bucket, and the row-level security
   policies.
3. Copy the project URL and the **anon** key from Project Settings → API.
4. Put them in `.env.local` at the repository root (see `.env.example`):

   ```
   VITE_SUPABASE_URL=https://<project>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon key>
   ```

5. Restart `npm run dev`. The backup line under the header changes from
   *On this device* to *Queued for cloud* and then *Synced*.

`.env.local` is gitignored. Never commit keys, and never put the service role
key in a client bundle — anything shipped to the browser is public.

## What gets written

| Target | Contents | Written by |
|---|---|---|
| `charts` | One row per client. `chart` is the whole client record as `jsonb`. | `pushChart` |
| `body_metrics` | One row per dated measurement, flattened so trends are queryable in SQL. | `pushBodyMetrics` |
| `movement-media` (Storage) | Video and audio blobs at `<client_id>/clips/<key>` and `<client_id>/voice/<key>`. | `pushMedia` |

The chart document is the restore path; `body_metrics` exists so a trainer can
run a query like:

```sql
select measured_at, waist, body_fat_pct, bodyweight
from body_metrics
where client_id = 'cl_alex'
order by measured_at;
```

`media_objects` is optional. The client does not write it; add it if you want
to list media without opening the chart document.

## Access control

`can_access_chart()` in the schema mirrors `canAccessChart()` in
`src/store/context.ts`: the owning therapist, any therapist named in
`shared_therapist_ids`, or every therapist in the clinic once
`shared_with_clinic` is true. Sharing changes are audited in the chart, so a
handoff is traceable on both sides.

Those policies only bite once therapists have Supabase auth users and
`therapists.auth_user_id` is populated. Until then the anon key is the only
identity the backup has, so **treat a project reached with only an anon key as
a demo project, not a place to put real patient data**. The client has no
sign-in flow yet; adding one is the next step before any clinical use.

## Storage size

Clips are capped in Settings (15–30s, default 25s) and recorded without audio,
which keeps a typical clip well under a megabyte. The bucket's file size limit
is set to 50 MB as a backstop. Voice notes carry audio only.

## Getting data out without Supabase

Backup → *Prepare backup file* builds one `.zip` containing `chart.json` and
every video and audio file, and the import control on the same sheet restores
it. On a phone the save button hands the file to the OS share sheet, so
*Save to Files* works. Data is never trapped in one device or one vendor.
