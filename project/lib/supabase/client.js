"use client";

import { createBrowserClient } from "@supabase/ssr";

let browserClient;

export function getSupabaseBrowserClient() {
  if (!browserClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dummy-demo.supabase.co";
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_anon_key_demo";
    browserClient = createBrowserClient(url, key);
  }
  return browserClient;
}
