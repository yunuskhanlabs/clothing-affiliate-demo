/**
 * Bot/crawler User-Agent classification — §12.
 *
 * This is an ANALYTICS signal, never a security control. It exists so
 * human vs. bot traffic can be reported separately (§12 "bot analytics
 * rule") — it must never be the sole basis for blocking a request or
 * denying a redirect. A request classified as a bot still gets redirected
 * normally by `/go/[offerId]`; it's just excluded from human-facing
 * CTR/EPC/click metrics by default (see the SQL functions in
 * `0004_affiliate_engine.sql`, which filter `is_bot = false`).
 *
 * Pattern list covers common search/social/monitoring crawlers plus
 * generic scripting-client signatures (curl, python-requests, headless
 * browsers) — enough to keep obvious automated traffic out of human
 * metrics without pretending this is a fraud-detection system (§50 scope).
 */
const BOT_PATTERNS = [
  /googlebot/i,
  /bingbot/i,
  /duckduckbot/i,
  /slurp/i, // Yahoo
  /baiduspider/i,
  /yandexbot/i,
  /sogou/i,
  /exabot/i,
  /facebookexternalhit/i,
  /facebot/i,
  /twitterbot/i,
  /linkedinbot/i,
  /whatsapp/i,
  /telegrambot/i,
  /discordbot/i,
  /slackbot/i,
  /applebot/i,
  /pinterest/i,
  /semrushbot/i,
  /ahrefsbot/i,
  /mj12bot/i,
  /petalbot/i,
  /bytespider/i,
  /crawler/i,
  /spider/i,
  /\bbot\b/i,
  /headlesschrome/i,
  /phantomjs/i,
  /puppeteer/i,
  /playwright/i,
  /curl\//i,
  /wget\//i,
  /python-requests/i,
  /go-http-client/i,
  /axios\//i,
  /node-fetch/i,
  /pingdom/i,
  /uptimerobot/i,
  /monitoring/i,
];

/**
 * @param {string | null | undefined} userAgent
 * @returns {boolean}
 */
export function isBotUserAgent(userAgent) {
  if (!userAgent || !userAgent.trim()) {
    // No User-Agent at all is unusual for a real browser and common for
    // scripted clients — conservatively counted as non-human for
    // analytics purposes. Documented here since it's a judgment call:
    // this NEVER blocks the redirect itself (§12), only excludes the
    // event from human metrics.
    return true;
  }
  return BOT_PATTERNS.some((pattern) => pattern.test(userAgent));
}
