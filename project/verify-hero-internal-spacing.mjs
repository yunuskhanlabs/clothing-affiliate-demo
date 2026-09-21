import { chromium } from "playwright";

const BASE = "http://localhost:3333";
const VIEWPORTS = [
  { label: "320px", w: 320, h: 700 },
  { label: "360px", w: 360, h: 780 },
  { label: "375px", w: 375, h: 812 },
  { label: "390px", w: 390, h: 844 },
  { label: "430px", w: 430, h: 932 },
  { label: "768px", w: 768, h: 1024 },
  { label: "1024px", w: 1024, h: 768 },
  { label: "desktop", w: 1280, h: 800 },
];

async function run() {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const page = await context.newPage();
    try {
      await page.goto(BASE, { waitUntil: "load", timeout: 35000 });
    } catch (_) {
      await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 20000 });
    }
    await page.waitForTimeout(1500);

    const m = await page.evaluate(() => {
      const hero = document.querySelector("section:first-of-type");
      const header = document.querySelector("header");
      const badge = hero ? hero.querySelector("p") : null;
      const heading = hero ? hero.querySelector("h1") : null;
      const desc = hero ? hero.querySelectorAll("p")[1] : null;
      const buttons = hero ? hero.querySelector("div > div > div:last-child") : null;

      const heroR = hero ? hero.getBoundingClientRect() : null;
      const headerR = header ? header.getBoundingClientRect() : null;
      const badgeR = badge ? badge.getBoundingClientRect() : null;
      const headingR = heading ? heading.getBoundingClientRect() : null;
      const descR = desc ? desc.getBoundingClientRect() : null;
      const buttonsR = buttons ? buttons.getBoundingClientRect() : null;

      const gapNavBadge = headerR && badgeR ? Math.round(badgeR.top - headerR.bottom) : null;
      const gapBadgeHeading = badgeR && headingR ? Math.round(headingR.top - badgeR.bottom) : null;
      const gapHeadingDesc = headingR && descR ? Math.round(descR.top - headingR.bottom) : null;
      const gapDescButtons = descR && buttonsR ? Math.round(buttonsR.top - descR.bottom) : null;
      const gapButtonsHeroBottom = buttonsR && heroR ? Math.round(heroR.bottom - buttonsR.bottom) : null;

      return {
        heroHeight: heroR ? Math.round(heroR.height) : 0,
        gapNavBadge,
        gapBadgeHeading,
        gapHeadingDesc,
        gapDescButtons,
        gapButtonsHeroBottom,
        hasHScroll: document.documentElement.scrollWidth > window.innerWidth,
      };
    });

    results.push({ vp: vp.label, w: vp.w, ...m });
    await context.close();
  }

  await browser.close();

  console.log("\n=== HERO INTERNAL SPACING VERIFICATION RESULTS ===\n");
  for (const r of results) {
    console.log(`[${r.vp.padEnd(8)}] heroH=${r.heroHeight}px | nav->badge=${r.gapNavBadge}px | badge->h1=${r.gapBadgeHeading}px | h1->desc=${r.gapHeadingDesc}px | desc->btns=${r.gapDescButtons}px | btns->heroB=${r.gapButtonsHeroBottom}px | hScroll=${r.hasHScroll}`);
  }

  const mobileRes = results.filter((r) => r.w < 1024);
  const desktopRes = results.filter((r) => r.w >= 1024);

  const mobileSpacingsOk = mobileRes.every(
    (r) => r.gapNavBadge >= 12 && r.gapBadgeHeading >= 12 && r.gapHeadingDesc >= 12 && r.gapDescButtons >= 20 && r.gapButtonsHeroBottom >= 40 && !r.hasHScroll
  );
  const desktopHeroOk = desktopRes.every((r) => r.heroHeight >= 700);

  console.log("\nMobile internal spacing balanced & un-cramped:", mobileSpacingsOk ? "PASS ✅" : "FAIL ❌");
  console.log("Desktop >=1024px hero untouched (min-h-[92svh]):", desktopHeroOk ? "PASS ✅" : "FAIL ❌");
  console.log("\nOVERALL STATUS:", mobileSpacingsOk && desktopHeroOk ? "PASS" : "FAIL");
}

run().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
