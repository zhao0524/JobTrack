# Job Application Tracker — Chrome Extension

Spec for Claude Code. Manifest V3, vanilla JS, no build step, no backend.

## Goal

Capture a job posting while I'm on the application page, and keep a local log of
what I applied to and when. Job description text is the payload. Links are not
stored because postings get taken down.

## Non-goals

- No server, no auth, no sync. Everything lives in `chrome.storage.local`.
- No storing posting URLs as the record of truth. Hostname only, for context.
- No resume/cover letter management. That stays in Overleaf.
- No auto-apply, no scraping behind logins beyond what the page already renders.

## Hard constraint to design around

`chrome.action.openPopup()` is not reliable. It requires a user gesture in most
contexts and has shipped inconsistently. The extension cannot force its popup
open when I land on a job page.

Workaround, in order of preference:

1. Content script injects a small floating capture pill on pages that look like
   job postings. Clicking it opens a capture panel injected into the page (not
   the popup), pre-filled with scraped fields.
2. Background service worker sets a badge (`NEW`) on the toolbar icon when a job
   page is detected, so the popup is one click away.

Build both. The pill is the primary path, the badge is the fallback for sites
where injection breaks.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ Job posting page (LinkedIn / Workday / Greenhouse / Lever)   │
│                                                              │
│  ┌────────────────────┐        ┌──────────────────────────┐  │
│  │ content.js         │        │ capture-panel (shadow    │  │
│  │  - detectJobPage() │──────▶ │ DOM, injected iframe-free│  │
│  │  - scrape()        │        │ form, prefilled)         │  │
│  │  - inject pill     │        └───────────┬──────────────┘  │
│  └─────────┬──────────┘                    │                 │
└────────────┼───────────────────────────────┼─────────────────┘
             │ runtime.sendMessage           │ SAVE_APPLICATION
             ▼                               ▼
      ┌───────────────────────────────────────────────┐
      │ background.js  (service worker)               │
      │  - message router                             │
      │  - badge state per tab                        │
      │  - storage writes (single writer)             │
      │  - chrome.alarms for follow-up reminders      │
      └───────────────┬───────────────────────────────┘
                      │
                      ▼
      ┌───────────────────────────────────────────────┐
      │ chrome.storage.local                          │
      │   apps:index  -> [ {id,title,company,...} ]   │
      │   app:<id>    -> { ...full record, desc }     │
      └───────────────┬───────────────────────────────┘
                      │
                      ▼
      ┌───────────────────────────────────────────────┐
      │ popup/  (list, search, status, export)        │
      │ options/ (bulk view, import/export, wipe)     │
      └───────────────────────────────────────────────┘
```

All storage writes go through the service worker. The popup and content script
send messages, they do not write directly. Single writer avoids races when the
panel and popup are both open.

## File layout

```
job-tracker/
├── manifest.json
├── background.js
├── src/
│   ├── storage.js          # CRUD over chrome.storage.local
│   ├── messages.js         # message type constants + typed helpers
│   ├── scrape/
│   │   ├── index.js        # adapter registry + fallback chain
│   │   ├── linkedin.js
│   │   ├── workday.js
│   │   ├── greenhouse.js
│   │   ├── lever.js
│   │   └── generic.js      # selection > readability heuristic > body text
│   └── util/
│       ├── hash.js         # SHA-256 of normalized description, dupe check
│       └── csv.js          # export
├── content/
│   ├── content.js
│   ├── pill.js             # floating button, shadow DOM
│   └── panel.js            # capture form, shadow DOM
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── options/
│   ├── options.html
│   └── options.js
└── icons/  (16, 32, 48, 128)
```

Shadow DOM for anything injected into the page. Host sites have aggressive CSS
and LinkedIn will otherwise eat the styling.

## Data model

```js
// app:<id>
{
  id: string,            // crypto.randomUUID()
  title: string,
  company: string,
  location: string,      // optional, best effort from scrape
  appliedAt: string,     // ISO 8601 date, defaults to capture date, editable
  status: 'applied' | 'oa' | 'interview' | 'offer' | 'rejected' | 'ghosted',
  description: string,   // plain text, newlines preserved
  descriptionHash: string,
  sourceHost: string,    // 'linkedin.com', context only
  notes: string,
  createdAt: string,
  updatedAt: string
}

// apps:index  (lightweight, so the popup list renders without loading every description)
[ { id, title, company, appliedAt, status, sourceHost, descriptionHash } ]
```

Index and record are written in the same message handler. Keep them consistent;
add an `repairIndex()` in options that rebuilds the index by scanning `app:*`
keys if they ever drift.

Storage budget: `chrome.storage.local` gives 10MB without `unlimitedStorage`.
A description averages 4–8KB, so ~1000 applications fits fine. Do not request
`unlimitedStorage`.

## Scraping

Adapter registry keyed by hostname suffix. Each adapter exports
`{ match(url), scrape(document) -> Partial<Application> }`.

| Site | Description selector | Notes |
|---|---|---|
| linkedin.com | `.jobs-description__content`, `#job-details` | SPA, re-scrape on route change |
| *.myworkdayjobs.com | `[data-automation-id="jobPostingDescription"]` | SPA, content mounts late, needs MutationObserver |
| boards.greenhouse.io, job-boards.greenhouse.io | `#content`, `.job__description` | static, easy |
| jobs.lever.co | `.section-wrapper .section` | static |
| *.ashbyhq.com | `[class*="descriptionText"]` | class names hashed, keep the wildcard |

Fallback chain in `generic.js`, first hit wins:

1. Non-empty user text selection on the page.
2. Largest contiguous block by text density: score candidate elements as
   `textLength / (1 + linkTextLength)`, ignore `nav`, `header`, `footer`, `aside`.
3. `document.body.innerText`, truncated to 20k chars.

Always let me edit the scraped text in the panel before saving. The scrape is a
draft, not the source of truth.

Title and company: try JSON-LD `<script type="application/ld+json">` with
`@type: JobPosting` first, since most boards emit it and it beats selectors.
Then `og:title`, then adapter selectors, then `document.title`.

Detection for the pill: JSON-LD JobPosting present, or hostname matches a known
adapter, or the URL path matches `/jobs?/`, `/careers/`, `/apply/`.

## Permissions

```json
"permissions": ["storage", "activeTab", "scripting", "alarms"],
"host_permissions": [
  "*://*.linkedin.com/*",
  "*://*.myworkdayjobs.com/*",
  "*://*.greenhouse.io/*",
  "*://*.lever.co/*",
  "*://*.ashbyhq.com/*"
],
"optional_host_permissions": ["*://*/*"]
```

Declared content scripts only on the known boards. Everywhere else, capture runs
through `activeTab` + `chrome.scripting.executeScript` triggered from the popup
button, so no broad host permission is needed up front. Offer to grant
`optional_host_permissions` from the options page for people who want the pill
everywhere.

## Build phases

Ship each phase working before starting the next.

**P0 — storage and list.** Manifest, storage layer, popup with manual add form
(title, company, date, status, description textarea), list view, edit, delete.
No scraping yet. This alone replaces a spreadsheet.

**P1 — capture from active tab.** Popup gets a "Grab from this page" button that
runs the scraper via `executeScript` and prefills the form. Adapters for
Greenhouse and Lever first since they are static and easy to verify.

**P2 — in-page capture.** Content script, detection, floating pill, shadow DOM
panel. Add LinkedIn and Workday adapters with MutationObserver for late mounts.
Badge state in the service worker.

**P3 — managing the list.** Search across title/company/description, filter by
status and date range, sort. Duplicate warning on save when `descriptionHash`
matches an existing record. Export to JSON and CSV, import from JSON.

**P4 — follow-ups.** `chrome.alarms` nudge at N days after `appliedAt` if status
is still `applied`. Configurable in options, default 10 days, off by default.

## UI notes

Popup is capped at 800x600 by Chrome. Target 380x560. List first, form second.
Each row: title, company, relative date ("12d ago"), status chip. Click to
expand the description inline rather than navigating away.

Empty state should say what to do, not just that the list is empty.

Status chips need to be distinguishable without relying on color alone, so pair
color with the label text.

Keyboard: `/` focuses search, `Esc` closes the panel, `Cmd/Ctrl+Enter` saves.

## Testing

- Load unpacked from `chrome://extensions` with developer mode on.
- Service worker logs live behind the "service worker" link on the extension
  card, not the page console. Easy to lose an hour to this.
- Keep a `fixtures/` folder with saved HTML from each board, and a small script
  that runs each adapter against its fixture. Selectors on these sites rot
  fast, and a fixture test tells me which adapter broke without opening a browser.
- Verify storage quota handling: write 1000 synthetic records, confirm the popup
  list still renders under 100ms.

## Open questions

- Should status changes keep a history (`statusLog: [{status, at}]`)? Useful for
  seeing how long things sat in each stage. Cheap to add in P0, annoying later.
- Company name normalization. "Shopify Inc." and "Shopify" will not group. Maybe
  a canonical company field with a lookup, or leave it manual.
