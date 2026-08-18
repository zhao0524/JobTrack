// config.example.js — TEMPLATE (safe to commit).
//
// This is the extension's "env file". Because the extension has no build
// step, config is a plain ES module that other files import — a raw .env
// file would never be loaded at runtime.
//
// SETUP:
//   1. Copy this file to `config.local.js` (already gitignored).
//   2. Paste your Supabase project values below.
//   3. Reload the extension at chrome://extensions.
//
// WHERE TO FIND THESE:
//   Supabase Dashboard -> Project Settings -> API
//     - Project URL      -> SUPABASE_URL
//     - Project API keys  -> `anon` `public` key -> SUPABASE_ANON_KEY
//
// SECURITY NOTE:
//   The anon key is PUBLIC by design — it ships inside the extension and any
//   user can read it. That is expected. Your data is protected by Row Level
//   Security + auth in Supabase, NOT by hiding this key.
//   NEVER put the `service_role` key here — it must never leave a server.

export const SUPABASE_URL = 'https://YOUR-PROJECT-ref.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR-ANON-PUBLIC-KEY';
