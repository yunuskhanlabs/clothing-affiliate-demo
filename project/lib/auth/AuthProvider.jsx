"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Client-side session/user context — Part 3 §22.
 *
 * Wraps the whole app (see app/layout.js) so any component can read
 * `useAuth()` for `{ user, loading }` without re-fetching the session
 * itself. Listens to `onAuthStateChange` so login/logout/token-refresh in
 * one tab is reflected everywhere it's read, including `WishlistButton`,
 * `Header`'s account icon, and the account/wishlist pages.
 */
const AuthContext = createContext({ user: null, loading: true });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    supabase.auth.getUser().then(async ({ data }) => {
      let activeUser = data.user ?? null;
      if (!activeUser) {
        try {
          const res = await fetch("/api/auth/me");
          if (res.ok) {
            const { user } = await res.json();
            activeUser = user;
          }
        } catch (err) {
          // Ignore fetch errors
        }
      }
      setUser(activeUser);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
