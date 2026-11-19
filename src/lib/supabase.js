import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Demo mode (local development only): open the app with ?demo to run it on
// made-up data, without a login. The demo files live in src/lib/demo, which
// is never committed, so a deployed build can't enter demo mode.
const demoMods = import.meta.env.DEV ? import.meta.glob("./demo/client.js", { eager: true }) : {};
const demoMod = Object.values(demoMods)[0];
const wantsDemo = (() => {
  if (!demoMod || typeof window === "undefined") return false;
  try {
    if (/[?&]demo\b/.test(window.location.search)) sessionStorage.setItem("wb:demo", "1");
    return sessionStorage.getItem("wb:demo") === "1";
  } catch { return /[?&]demo\b/.test(window.location.search); }
})();
export const isDemo = wantsDemo;

// Surfaced clearly in the UI (see App.jsx) so a missing .env is obvious
// rather than a silent white screen.
export const isConfigured = isDemo || Boolean(url && anonKey);

export const supabase = isDemo
  ? demoMod.demoClient
  : isConfigured
    ? createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
      })
    : null;
