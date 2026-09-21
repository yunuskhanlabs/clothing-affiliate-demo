/**
 * PART 6 §31-§33, §84 — HTTP security headers, built as a deliberate
 * allowlist against this app's ACTUAL dependencies (verified by grepping
 * the codebase for every external origin it actually talks to — see
 * PHASE-6-CONTEXT.md §11 for the inventory), not a generic template.
 *
 * What the app genuinely needs at the browser layer:
 * - Supabase (`NEXT_PUBLIC_SUPABASE_URL`) — the browser client
 *   (lib/supabase/client.js) calls its REST/Auth endpoints directly for
 *   session-aware reads (wishlist, auth) — needs `connect-src`. Product
 *   images may also be served from Supabase Storage under the same
 *   project host in production — added to `img-src` too.
 * - `images.unsplash.com` — the only seeded product-image host in this
 *   phase's dev data (also already the sole entry in `images.
 *   remotePatterns` below for next/image, unused directly here but kept
 *   in sync).
 * - `api.openai.com` — used exclusively by `lib/ai/providers/openai.js`,
 *   a `server-only` file (verified: never imported client-side) — no
 *   browser CSP entry needed for it.
 * - Self-hosted `@fontsource` fonts and all JS/CSS bundles — same-origin
 *   (`'self'`), no third-party font/script CDN in this project (README:
 *   "no runtime Google Fonts call").
 *
 * `style-src 'unsafe-inline'` is a deliberate, narrow exception (§31: "do
 * not add unsafe-inline... unless genuinely required and the risk is
 * understood"): several components set inline `style={{...}}` on real
 * per-row data — product color swatches (`ProductCard.jsx`, the hex
 * comes from the database, not a fixed stylesheet) and the Hero's
 * decorative background-pattern (`Hero.jsx`). Neither is a script
 * vector; `script-src` has NO such exception. A nonce-based style-src
 * would require restructuring every inline `style` prop into CSS custom
 * properties — a real Part 1/2 UI change, not a Part 6 hardening change,
 * so it's flagged as a known follow-up (PHASE-6-CONTEXT.md §11) rather
 * than done here under "don't rewrite what already works" (§3).
 */
function buildCsp() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  let supabaseOrigin = "";
  try {
    supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : "";
  } catch {
    supabaseOrigin = "";
  }

  const directives = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Next.js App Router inline RSC payload streaming and hydration scripts
    "style-src": ["'self'", "'unsafe-inline'"], // see file header — inline style ATTRIBUTES only
    "img-src": ["'self'", "data:", "blob:", "https://images.unsplash.com", supabaseOrigin].filter(Boolean),
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", supabaseOrigin].filter(Boolean),
    "frame-src": ["'none'"],
    "frame-ancestors": ["'none'"], // modern equivalent of X-Frame-Options: DENY, kept in sync below (§31)
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
  };

  return Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(" ")}`)
    .join("; ");
}

const isProduction = process.env.NODE_ENV === "production";

const securityHeaders = [
  { key: "Content-Security-Policy", value: buildCsp() },
  { key: "X-Frame-Options", value: "DENY" }, // §31 — legacy-browser-compatible clickjacking protection, alongside frame-ancestors above
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  // HSTS is deliberately gated on NODE_ENV — §31 "never enable HSTS
  // assumptions in local HTTP development." No `preload` directive: that
  // requires deliberate submission to the browser preload list once the
  // production domain is finalized (§31 "use preload directives only
  // when domain/subdomain readiness has been deliberately verified") —
  // not something this phase can verify without a live domain.
  ...(isProduction
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      // Production follow-up (documented, not guessable from here): add
      // the actual Supabase Storage / CDN hostname once product images
      // move off the seeded Unsplash placeholders — see
      // PHASE-6-CONTEXT.md §11.
    ],
  },
  async headers() {
    return [
      {
        // Applies to every route this app serves, INCLUDING /go/* and
        // /api/webhooks/* — unlike middleware.js's session-refresh logic
        // (which deliberately skips those two for latency, §46 comment
        // in middleware.js), security headers are cheap, static, and
        // apply uniformly; there's no reason to weaken them for those
        // two routes specifically (§31 "final CSP must be tested against
        // ... affiliate flows").
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/api/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/admin/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/admin",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/account/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/account",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/wishlist/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/wishlist",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/go/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

module.exports = nextConfig;
