import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { resolveRequestId, withRequestId, REQUEST_ID_HEADER } from "@/lib/observability/request-id";

export async function middleware(request) {
  const requestId = resolveRequestId(request.headers);
  request.headers.set(REQUEST_ID_HEADER, requestId);

  let response = NextResponse.next({ request });

  // Safe wrapper for standalone demo — never block on Supabase auth failures
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (supabaseUrl && supabaseAnonKey && !supabaseUrl.includes("dummy-demo")) {
      const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            response = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          },
        },
      });

      await supabase.auth.getUser();
    }
  } catch {
    // Gracefully continue in demo mode
  }

  return withRequestId(response, requestId);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|go/|api/webhooks/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
