import { SITE_URL } from "@/lib/seo/site";

/**
 * PART 6 §10 — dynamic `robots.txt` via Next.js's built-in metadata
 * route convention (`app/robots.js`) rather than a hand-maintained
 * static file, so it stays in sync with `SITE_URL` automatically.
 *
 * Disallowed paths mirror §4's "admin pages and authenticated/private
 * pages must NOT be indexed." `/admin`, `/account`, `/wishlist` ALSO
 * carry their own per-page `robots: { index: false }` metadata (see
 * app/admin/layout.js, app/account/page.js, etc.) as defense in depth.
 * `/api/` is blocked because it serves JSON, not crawlable content, and
 * `/go/` because every hit there records a real affiliate click (§41) —
 * a crawler walking every `/go/{offerId}` link would pollute click
 * analytics with bot traffic.
 *
 * Thin auth-flow pages (login/signup/password reset) are deliberately
 * NOT robots.txt-disallowed — a `noindex` meta tag only works if the
 * crawler is allowed to fetch the page and see it; blocking those here
 * would hide the noindex tag itself and risk an "indexed, no snippet"
 * result instead. Those pages rely on their own `robots: { index: false
 * }` metadata alone (see each page's `export const metadata`).
 */
export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/account", "/wishlist", "/api/", "/go/", "/auth/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
