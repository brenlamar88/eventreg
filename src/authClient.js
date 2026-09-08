// src/authClient.js — real user login via Supabase Auth (magic link).
// ---------------------------------------------------------------------------
// Passwordless: the user enters their email, gets a magic link, and lands back
// signed in. The access token is attached as Authorization: Bearer on admin
// API calls (authHeaders). This runs ALONGSIDE the passcode model — screens
// can accept either. Session persists in localStorage (supabase-js default).
// ---------------------------------------------------------------------------
import { createClient } from "@supabase/supabase-js";

// Same project the app already talks to. The publishable/anon key is safe in
// the browser (auth + RLS-guarded reads only).
const SUPABASE_URL = "https://mwwvcjpyrriqhugoazag.supabase.co";
const SUPABASE_ANON = "sb_publishable_FYlNxo_PzEW-qUQUZCSjGQ_CFgIBEr9";

let _client;
export function supabase() {
  if (!_client) {
    _client = createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return _client;
}

export async function getSession() {
  try { return (await supabase().auth.getSession()).data.session || null; } catch { return null; }
}

export async function getUser() {
  const s = await getSession();
  return s?.user ? { id: s.user.id, email: s.user.email } : null;
}

// Bearer header for admin API calls when signed in (empty object otherwise).
export async function authHeaders() {
  const s = await getSession();
  return s?.access_token ? { Authorization: `Bearer ${s.access_token}` } : {};
}

// Send a magic link. redirectTo brings them back to the current page (or an
// invite-accept URL) already signed in.
export async function signInWithEmail(email, redirectTo) {
  return supabase().auth.signInWithOtp({
    email: String(email || "").trim(),
    options: { emailRedirectTo: redirectTo || window.location.href },
  });
}

export async function signOut() {
  try { await supabase().auth.signOut(); } catch {}
}

export function onAuthChange(cb) {
  return supabase().auth.onAuthStateChange((_e, session) => cb(session));
}
