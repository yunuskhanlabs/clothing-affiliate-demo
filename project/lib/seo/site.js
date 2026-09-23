/**
 * PART 6 §7, §69-§70 — single source of truth for the site's canonical
 * production origin. Every canonical URL, sitemap entry, robots.txt
 * `Sitemap:` line, and Open Graph `url` in this codebase reads from
 * here, so pointing the whole site at a real domain at deploy time is
 * one environment variable, not a grep-and-replace.
 *
 * Falls back to a placeholder rather than throwing, so `next build`
 * still succeeds without `NEXT_PUBLIC_SITE_URL` set (e.g. in this
 * sandboxed build-verification run — see PHASE-6-CONTEXT.md §75) — but
 * the fallback is obviously not a real domain, so it can't be mistaken
 * for a working canonical URL if someone forgets to set the real one in
 * production.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://demo.cloxtro.com").replace(/\/+$/, "");

export function absoluteUrl(path = "/") {
  return new URL(path, SITE_URL).toString();
}
