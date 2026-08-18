// Data access for job applications — backed by Supabase (PostgREST).
// Public function signatures are unchanged from the old chrome.storage.local
// version, so background.js and the UI don't need to know the backend moved.
import { sbFetch } from './supabase.js';

const TABLE = '/applications';

// Columns the popup/options lists need (keeps list payloads small).
const SUMMARY_COLS = 'id,title,company,applied_at,status,source_host,description_hash';

// ── camelCase (app) ↔ snake_case (DB) mapping ───────────────────────────────
function toRow(app) {
  const row = {
    id: app.id,
    title: app.title ?? null,
    company: app.company ?? null,
    location: app.location ?? null,
    applied_at: app.appliedAt || null,
    status: app.status ?? null,
    description: app.description ?? null,
    description_hash: app.descriptionHash ?? null,
    notes: app.notes ?? null,
    source_host: app.sourceHost ?? null,
    season: app.season ?? null,
    updated_at: new Date().toISOString(),
  };
  // Preserve an existing/imported createdAt; let the DB default it otherwise.
  if (app.createdAt) row.created_at = app.createdAt;
  return row;
}

function fromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    company: row.company,
    location: row.location,
    appliedAt: row.applied_at,
    status: row.status,
    description: row.description,
    descriptionHash: row.description_hash,
    notes: row.notes,
    sourceHost: row.source_host,
    season: row.season,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── CRUD ────────────────────────────────────────────────────────────────────
export async function getIndex() {
  const rows = await sbFetch(
    `${TABLE}?select=${SUMMARY_COLS}&order=applied_at.desc`
  );
  return (rows ?? []).map(fromRow);
}

export async function getApplication(id) {
  const rows = await sbFetch(`${TABLE}?id=eq.${id}&select=*`);
  return fromRow(rows?.[0]);
}

export async function saveApplication(app) {
  const rows = await sbFetch(`${TABLE}?on_conflict=id`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: toRow(app),
  });
  return fromRow(rows?.[0]);
}

export async function deleteApplication(id) {
  await sbFetch(`${TABLE}?id=eq.${id}`, { method: 'DELETE' });
}

export async function getAllApplications() {
  const rows = await sbFetch(`${TABLE}?select=*&order=applied_at.desc`);
  return (rows ?? []).map(fromRow);
}

// Delete every row (used by the options "Wipe All Data" button).
// id is the primary key and never null, so this matches all rows.
export async function wipeAll() {
  await sbFetch(`${TABLE}?id=not.is.null`, { method: 'DELETE' });
}

// Supabase is the single source of truth, so there is no separate index to
// rebuild. Kept for message-API compatibility; returns the current list.
export async function repairIndex() {
  return getIndex();
}
