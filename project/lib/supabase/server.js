import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client — Part 3 §5.
 *
 * Still uses only the public anon key (RLS-enforced), but reads the
 * caller's session from the request's cookies via @supabase/ssr, so
 * Server Components and Route Handlers can make session-aware queries
 * (e.g. "my wishlist") without shipping any secret to the browser.
 *
 * Call this fresh per request (Next.js App Router convention) — do not
 * cache the client across requests, since it's bound to one request's
 * cookie jar.
 */
export function getSupabaseServerClient() {
  const cookieStore = cookies();

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component render (not a Route Handler or
          // Server Action) — cookies() is read-only there. middleware.js
          // handles session refresh in that case instead, so this is safe
          // to ignore.
        }
      },
    },
  });
}
