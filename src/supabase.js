// Thin Supabase REST (PostgREST) client — no SDK, just fetch.
// Reads config from the gitignored config.local.js at the project root.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.local.js';

const REST = `${SUPABASE_URL}/rest/v1`;

const baseHeaders = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

// Perform a REST call against a table path (e.g. "/applications?id=eq.123").
// Returns parsed JSON, or null for empty responses (e.g. DELETE).
export async function sbFetch(path, { method = 'GET', headers = {}, body } = {}) {
  const res = await fetch(`${REST}${path}`, {
    method,
    headers: { ...baseHeaders, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Supabase ${method} ${path} → ${res.status} ${detail}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
