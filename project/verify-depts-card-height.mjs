import { chromium } from "playwright";

const BASE = "http://localhost:3333";
const VIEWPORTS = [
  { label: "320px", w: 320, h: 700 },
  { label: "360px", w: 360, h: 780 },
  { label: "390px", w: 390, h: 844 },
  { label: "430px", w: 430, h: 932 },
  { label: "768px", w: 768, h: 1024 },
  { label: "1023px", w: 1023, h: 768 },
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
      const cards = Array.from(document.querySelectorAll(".category-highlights-card"));
      const rects = cards.map((c) => c.getBoundingClientRect());
      const hero = document.querySelector("section:first-of-type");
      const heroRect = hero ? hero.getBoundingClientRect() : null;

      const sameRow = rects.length === 3 && Math.abs(rects[0].top - rects[1].top) < 3 && Math.abs(rects[1].top - rects[2].top) < 3;
      const cardWidth = rects.length > 0 ? Math.round(rects[0].width) : 0;
      const cardHeight = rects.length > 0 ? Math.round(rects[0].height) : 0;
      const aspectRatio = cardWidth > 0 ? (cardHeight / cardWidth).toFixed(2) : 0;

      return {
        cardCount: cards.length,
        sameRow,
        cardWidth,
        cardHeight,
        aspectRatio,
        heroHeight: heroRect ? Math.round(heroRect.height) : 0,
        hasHScroll: document.documentElement.scrollWidth > window.innerWidth,
      };
    });

    results.push({ vp: vp.label, w: vp.w, ...m });
    await context.close();
  }

  await browser.close();

  console.log("\n=== DEPARTMENTS CARD HEIGHT VERIFICATION RESULTS ===\n");
  for (const r of results) {
    console.log(`[${r.vp.padEnd(8)}] cards=${r.cardCount} | sameRow=${r.sameRow} | ${r.cardWidth}x${r.cardHeight}px (ratio: ${r.aspectRatio}) | heroH=${r.heroHeight}px | hScroll=${r.hHScroll || r.hasHScroll}`);
  }

  const mobileRes = results.filter((r) => r.w < 1024);
  const desktopRes = results.filter((r) => r.w >= 1024);

  const mobileRowOk = mobileRes.every((r) => r.sameRow && !r.hasHScroll && parseFloat(r.aspectRatio) <= 1.05);
  const desktopAspectOk = desktopRes.every((r) => parseFloat(r.aspectRatio) >= 1.2);

  console.log("\nMobile 1-row & compact 1:1 aspect ratio check:", mobileRowOk ? "PASS ✅" : "FAIL ❌");
  console.log("Desktop >=1024px untouched 4:5 aspect ratio check:", desktopAspectOk ? "PASS ✅" : "FAIL ❌");
  console.log("\nOVERALL STATUS:", mobileRowOk && desktopAspectOk ? "PASS" : "FAIL");
}

run().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
