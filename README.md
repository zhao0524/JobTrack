# Job Application Tracker

A Chrome extension (Manifest V3, vanilla JS, no build step) that captures job
postings while you're on the application page and keeps a searchable log of what
you applied to, when, and where it stands. Job **description text** is the payload
— links aren't stored because postings get taken down. Data is stored in
**Supabase** (Postgres) so it survives reinstalls and is reachable from any device
using the same config.

## Features

- **Capture from the posting** — a floating "Track Job" pill appears on known job
  boards (LinkedIn, Workday, Greenhouse, Lever, Ashby). Click it to open an
  in-page panel pre-filled with the scraped title, company, location, and
  description. On other sites, use the popup's **Grab Page** button.
- **Formatting-preserving scrape** — descriptions keep their paragraphs and bullet
  lists (nested items indented). The scraper reads the live DOM and only falls
  back to a page's JSON-LD when that has more structure.
- **Popup** — list, search, status filter, sort, and a manual add/edit form with
  a **Term** field (recruiting season).
- **Dashboard (options page)** — an Outlook-style two-pane reader:
  - a left **rail** to filter by term (All / Summer 2027 / Winter 2027 / Unassigned) with live counts,
  - a **list** of applications (company + position, grouped by term),
  - a **reading pane** that shows the full description when you open a job,
  - **hover-to-delete** on each row, and a settings **drawer** (export/import, follow-up reminders, refresh, wipe).
- **Duplicate detection** — a SHA-256 hash of the normalized description warns you
  when you're about to save a posting you've already tracked.
- **Follow-up reminders** — optional `chrome.alarms` nudge N days after you applied
  if a job is still in "Applied".
- **Export / import** — JSON and CSV.

## Setup

1. **Clone** this repo.
2. **Create your config** — copy `config.example.js` to `config.local.js` and fill
   in your Supabase project URL and anon key:
   ```js
   export const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
   export const SUPABASE_ANON_KEY = 'YOUR-ANON-KEY';
   ```
   `config.local.js` is gitignored — never commit real keys.
3. **Create the table** in your Supabase project (SQL editor):
   ```sql
   create table if not exists public.applications (
     id uuid primary key default gen_random_uuid(),
     title text, company text, location text,
     applied_at date, status text,
     description text, description_hash text,
     notes text, source_host text, season text,
     created_at timestamptz default now(),
     updated_at timestamptz default now()
   );
   create index if not exists applications_applied_at_idx on public.applications (applied_at desc);
   create index if not exists applications_description_hash_idx on public.applications (description_hash);

   alter table public.applications enable row level security;
   -- Personal / single-user only: the anon key ships in the extension.
   create policy "anon full access (temporary, no auth)"
     on public.applications for all
     to anon, authenticated using (true) with check (true);
   ```
4. **Load the extension** — `chrome://extensions` → enable Developer mode → **Load
   unpacked** → select this folder.

> ⚠️ **No auth.** The table is protected only by a permissive RLS policy, so
> anyone with the shipped anon key can read/write it. Fine for personal,
> unpublished use — add real auth before sharing.

## Usage

- On a supported job board, click the green **Track Job** pill → review the
  pre-filled panel → **Save Application**.
- On any other page, open the popup and click **Grab Page**, or **+** to add
  manually. Pick a **Term** while you're there.
- Open the **dashboard** (gear icon in the popup) to browse everything: filter by
  term in the left rail, click a job to read its full description, change its
  status/term, or hover a row and click the trash bin to delete it.

After reloading the extension, **refresh any open job tabs** — an old content
script from before the reload can't reach the new background worker.

## Project structure

```
manifest.json          # MV3 manifest
background.js          # service worker: message router, single storage writer, alarms
config.example.js      # template (committed); copy to config.local.js (gitignored)
src/
  supabase.js          # thin PostgREST fetch wrapper
  storage.js           # CRUD; camelCase <-> snake_case mapping
  messages.js          # message-type constants + send() helper
  util/{hash,csv}.js   # SHA-256 dupe hash, CSV export
content/content.js     # pill + in-page capture panel + scraper (known boards)
popup/                 # list, search, add/edit form, Grab Page
options/               # dashboard (Outlook-style reader) + settings
icons/
```

See [CONTEXT.md](CONTEXT.md) for architecture and developer notes, and
[IMPLEMENTATION.md](IMPLEMENTATION.md) for the original design spec.
