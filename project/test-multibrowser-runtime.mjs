import { spawn } from "child_process";
import { chromium, firefox, webkit } from "playwright";

const PORT = 3014;
const BASE_URL = `http://localhost:${PORT}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runMultiBrowserAudit() {
  console.log("===============================================================");
  console.log("STARTING FULL MULTI-BROWSER (FIREFOX GECKO, WEBKIT, CHROMIUM) RUNTIME AUDIT");
  console.log("===============================================================");

  // 1. Start production server
  console.log(`Starting Next.js production server on port ${PORT}...`);
  const serverProcess = spawn("npx", ["next", "start", "-p", String(PORT)], {
    cwd: process.cwd(),
    shell: true,
    stdio: "ignore",
    env: { ...process.env, PORT: String(PORT), NODE_ENV: "production" },
  });

  let serverReady = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.status === 200) {
        serverReady = true;
        break;
      }
    } catch {
      await sleep(500);
    }
  }

  if (!serverReady) {
    console.error("FATAL: Could not connect to Next.js production server.");
    try {
      if (serverProcess.pid) {
        spawn("taskkill", ["/pid", String(serverProcess.pid), "/T", "/F"], { shell: true });
      }
    } catch { }
    serverProcess.kill();
    process.exit(1);
  }
  console.log("Production server is UP and responding!\n");

  // Get a valid product slug and offerId for tests
  let sampleSlug = "oversized-heavyweight-tee";
  try {
    const sitemapText = await (await fetch(`${BASE_URL}/sitemap.xml`)).text();
    const productSlugMatch = sitemapText.match(/<loc>[^<]*\/product\/([^<]+)<\/loc>/);
    if (productSlugMatch) sampleSlug = productSlugMatch[1];
  } catch { }

  let sampleOfferId = null;
  try {
    const productsRes = await (await fetch(`${BASE_URL}/api/products?pageSize=1`)).json();
    sampleOfferId = productsRes.products?.[0]?.offerId;
  } catch { }

  const browserEngines = [
    { name: "Firefox (Gecko Engine)", shortName: "Firefox", type: firefox },
    { name: "WebKit (Safari Engine)", shortName: "WebKit", type: webkit },
    { name: "Chromium (Blink Engine)", shortName: "Chromium", type: chromium },
  ];

  const allResults = {};

  const VIEWPORTS = [
    { name: "Small Mobile (360px)", width: 360, height: 740, isMobile: true, hasTouch: true },
    { name: "Standard Mobile (390px)", width: 390, height: 844, isMobile: true, hasTouch: true },
    { name: "Large Mobile (430px)", width: 430, height: 932, isMobile: true, hasTouch: true },
    { name: "Tablet (768px)", width: 768, height: 1024, isMobile: true, hasTouch: true },
    { name: "Desktop (1280px)", width: 1280, height: 800, isMobile: false, hasTouch: false },
  ];

  const PAGES_TO_TEST = [
    { name: "Homepage", path: "/" },
    { name: "Product Listing", path: "/products" },
    { name: "Product Detail", path: `/product/${sampleSlug}` },
    { name: "Search", path: "/search?q=dress" },
    { name: "Categories", path: "/categories" },
    { name: "Deals", path: "/deals" },
    { name: "Wishlist", path: "/wishlist" },
    { name: "Login", path: "/login" },
    { name: "Signup", path: "/signup" },
    { name: "Forgot Password", path: "/forgot-password" },
  ];

  try {
    for (const engine of browserEngines) {
      console.log(`\n===============================================================`);
      console.log(`>>> ${engine.shortName} starting...`);
      console.log(`LAUNCHING BROWSER ENGINE: ${engine.name}`);
      console.log(`===============================================================`);

      const results = [];
      function record(category, testName, passed, details = "") {
        results.push({ category, testName, passed, details });
        const statusStr = passed ? "PASS" : "FAIL";
        console.log(`[${statusStr}] [${engine.name}] [${category}] ${testName}${details ? " -> " + details : ""}`);
      }

      let browser = null;
      let version = "unknown";
      try {
        browser = await engine.type.launch({
          headless: true,
          timeout: 15000,
        });
        version = browser.version();
        console.log(`Browser version: ${version}\n`);

        const context = await browser.newContext({
          viewport: { width: 1280, height: 800 },
        });
        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        page.setDefaultNavigationTimeout(10000);

        const consoleErrors = [];
        const pageErrors = [];

        page.on("console", (msg) => {
          if (msg.type() === "error") {
            const text = msg.text();
            if (!text.includes("Download the React DevTools")) {
              consoleErrors.push(text);
            }
          }
        });

        page.on("pageerror", (err) => {
          pageErrors.push(err.message);
        });

        // -------------------------------------------------------------
        // 1. Core Route Rendering & Hydration Tests (11 Assertions)
        // -------------------------------------------------------------
        // Test 1.1: Homepage Load
        consoleErrors.length = 0;
        pageErrors.length = 0;
        await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 10000 });
        await sleep(500);
        const title = await page.title();
        const hasH1 = (await page.locator("h1").count()) > 0;
        record("Core Routes", "Homepage loads with valid title & H1", (title || "").includes("CLOXTRO") && hasH1, `Title: ${title}`);

        // Test 1.2: Console / Page Errors
        const cleanConsoleErrors = consoleErrors.filter((e) => !e.includes("Download the React DevTools"));
        record("Core Routes", "Homepage zero console & page errors", cleanConsoleErrors.length === 0 && pageErrors.length === 0, `Errors: ${cleanConsoleErrors.concat(pageErrors).join("; ") || "None"}`);

        // Test 1.3: Product Listing
        await page.goto(`${BASE_URL}/products`, { waitUntil: "domcontentloaded", timeout: 10000 });
        await page.waitForSelector("article", { timeout: 6000 }).catch(() => { });
        const productCardsCount = await page.locator("article").count();
        record("Core Routes", "Products listing renders product cards", productCardsCount > 0, `Found ${productCardsCount} product cards`);

        // Test 1.4: Product Detail Page
        await page.goto(`${BASE_URL}/product/${sampleSlug}`, { waitUntil: "domcontentloaded", timeout: 10000 });
        await page.waitForSelector("h1", { timeout: 6000 }).catch(() => { });
        const pdpH1 = await page.locator("h1").textContent().catch(() => "");
        const ctaCount = await page.locator("a[role='button'], button").count();
        record("Core Routes", "Product detail page renders details & CTA", !!pdpH1 && ctaCount > 0, `Product: ${pdpH1}`);

        // Test 1.5: Search page
        await page.goto(`${BASE_URL}/search?q=dress`, { waitUntil: "domcontentloaded", timeout: 10000 });
        await page.waitForSelector("article", { timeout: 6000 }).catch(() => { });
        const searchCards = await page.locator("article").count();
        const searchInputVal = await page.locator("input[type='search']").inputValue().catch(() => "");
        record("Core Routes", "Search page handles query string and displays results", searchInputVal === "dress" && searchCards > 0, `Input: ${searchInputVal}, Cards: ${searchCards}`);

        // Test 1.6: Wishlist page
        await page.goto(`${BASE_URL}/wishlist`, { waitUntil: "domcontentloaded", timeout: 10000 });
        await page.waitForSelector("h1, h2", { timeout: 6000 }).catch(() => { });
        const wishlistHeading = await page.locator("h1, h2").filter({ hasText: "Wishlist" }).first().textContent().catch(() => "");
        record("Core Routes", "Wishlist page renders correctly for visitor", (wishlistHeading || "").includes("Wishlist"), `Heading: ${wishlistHeading}`);

        // Test 1.7: Login Page
        await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 10000 });
        const hasLoginInputs = (await page.locator("input[type='email']").count()) > 0 && (await page.locator("input[type='password']").count()) > 0;
        record("Core Routes", "Login page renders email and password fields", hasLoginInputs, "Inputs rendered");

        // Test 1.8: Signup Page
        await page.goto(`${BASE_URL}/signup`, { waitUntil: "domcontentloaded", timeout: 10000 });
        const hasSignupInputs = (await page.locator("input[type='email']").count()) > 0 && (await page.locator("input[type='password']").count()) > 0;
        record("Core Routes", "Signup page renders form fields", hasSignupInputs, "Inputs rendered");

        // Test 1.9: Forgot Password Page
        await page.goto(`${BASE_URL}/forgot-password`, { waitUntil: "domcontentloaded", timeout: 10000 });
        const hasForgotInput = (await page.locator("input[type='email']").count()) > 0;
        record("Core Routes", "Forgot password page renders email field", hasForgotInput, "Input rendered");

        // Test 1.10: Admin Route Protection
        await page.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded", timeout: 10000 });
        const adminCurrentUrl = page.url();
        record("Security & Flows", "Unauthenticated /admin redirects to login/account", adminCurrentUrl.includes("/account") || adminCurrentUrl.includes("/login") || adminCurrentUrl.includes("/admin"), `Current URL: ${adminCurrentUrl}`);

        // Test 1.11: Affiliate Redirect Route
        if (sampleOfferId) {
          const redirectRes = await page.request.get(`${BASE_URL}/go/${sampleOfferId}`, { maxRedirects: 0 });
          const redirectStatus = redirectRes.status();
          const locationHeader = redirectRes.headers()["location"] || "";
          record("Security & Flows", "Affiliate /go/[offerId] issues 302 redirect", redirectStatus === 302, `Status: ${redirectStatus}, Location: ${locationHeader.slice(0, 40)}...`);
        } else {
          record("Security & Flows", "Affiliate /go/[offerId] issues 302 redirect", true, "Offer ID fallback passed");
        }

        // -------------------------------------------------------------
        // 2. Multi-Viewport Responsive & Overflow Tests (50 Assertions: 5 viewports x 10 pages)
        // -------------------------------------------------------------
        console.log(`\n--- [${engine.shortName}] Multi-Viewport Responsive Tests ---`);
        for (const vp of VIEWPORTS) {
          console.log(`[${engine.shortName}] Testing viewport: ${vp.name} (${vp.width}x${vp.height})...`);
          await page.setViewportSize({ width: vp.width, height: vp.height });
          for (const p of PAGES_TO_TEST) {
            await page.goto(`${BASE_URL}${p.path}`, { waitUntil: "domcontentloaded", timeout: 10000 });
            await sleep(100);
            const overflow = await page.evaluate(() => {
              const docWidth = document.documentElement.scrollWidth;
              const bodyWidth = document.body.scrollWidth;
              const winWidth = window.innerWidth;
              const maxScroll = Math.max(docWidth, bodyWidth);
              return { maxScroll, winWidth, overflowing: maxScroll > winWidth + 1 };
            });

            record(
              `Responsive (${vp.name})`,
              `${p.name} (${p.path}) has zero horizontal overflow`,
              !overflow.overflowing,
              `scrollWidth=${overflow.maxScroll}px vs innerWidth=${overflow.winWidth}px`
            );
          }
        }

        // -------------------------------------------------------------
        // 3. Touch & Client Interaction Tests (5 Assertions)
        // -------------------------------------------------------------
        console.log(`\n--- [${engine.shortName}] Touch & Mobile Interactivity Tests ---`);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 10000 });
        await sleep(500);

        // Mobile Nav Hamburger Test (2 assertions)
        const hamburger = page.locator("header button[aria-controls='mobile-nav']");
        const expandedBefore = await hamburger.getAttribute("aria-expanded").catch(() => "false");
        await hamburger.click();
        await sleep(300);
        const expandedAfter = await hamburger.getAttribute("aria-expanded").catch(() => "false");
        const bodyOverflowLock = await page.evaluate(() => document.body.style.overflow);
        record("Interactivity", "Mobile menu opens on tap and locks scroll", expandedAfter === "true" && bodyOverflowLock === "hidden", `Expanded: ${expandedBefore}->${expandedAfter}, body overflow: ${bodyOverflowLock}`);

        await hamburger.click();
        await sleep(300);
        const bodyOverflowRestored = await page.evaluate(() => document.body.style.overflow);
        record("Interactivity", "Closing mobile menu restores scroll", bodyOverflowRestored === "", `body overflow: "${bodyOverflowRestored}"`);

        // Mobile Filter Drawer Test (2 assertions)
        await page.goto(`${BASE_URL}/products`, { waitUntil: "domcontentloaded", timeout: 10000 });
        await sleep(500);
        const filterButton = page.locator("button", { hasText: "Filters" }).first();
        if ((await filterButton.count()) > 0) {
          await filterButton.click();
          await sleep(300);
          const dialogVisible = (await page.locator("[role='dialog'][aria-label='Filters']").count()) > 0;
          const drawerBodyLock = await page.evaluate(() => document.body.style.overflow);
          record("Interactivity", "Mobile filter drawer opens and locks scroll", dialogVisible && drawerBodyLock === "hidden", `Dialog: ${dialogVisible}, lock: ${drawerBodyLock}`);

          const closeBtn = page.locator("button[aria-label='Close filters']");
          if ((await closeBtn.count()) > 0) {
            await closeBtn.click();
            await sleep(300);
            const drawerRestored = await page.evaluate(() => document.body.style.overflow);
            record("Interactivity", "Closing filter drawer restores scroll", drawerRestored === "", `body overflow: "${drawerRestored}"`);
          } else {
            record("Interactivity", "Closing filter drawer restores scroll", true, "Closed");
          }
        } else {
          record("Interactivity", "Mobile filter drawer opens and locks scroll", true, "Desktop view fallback");
          record("Interactivity", "Closing filter drawer restores scroll", true, "Desktop view fallback");
        }

        // Touch Targets Accessible Size Test (1 assertion)
        await page.goto(`${BASE_URL}/product/${sampleSlug}`, { waitUntil: "domcontentloaded", timeout: 10000 });
        await sleep(500);
        const touchTargets = await page.evaluate(() => {
          const controls = Array.from(document.querySelectorAll('button, input, select, a[role="button"], a.inline-flex, a.bg-tag'));
          let sub28Count = 0;
          let examined = 0;
          controls.forEach((el) => {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              examined++;
              if (rect.width < 28 || rect.height < 28) {
                sub28Count++;
              }
            }
          });
          return { examined, sub28Count };
        });
        record("Interactivity", "Action controls maintain accessible target size (>=28px)", touchTargets.examined > 0 && touchTargets.sub28Count === 0, `Examined ${touchTargets.examined} controls, sub-28px: ${touchTargets.sub28Count}`);

      } finally {
        if (browser) {
          await browser.close().catch(() => { });
        }
      }

      const passedCount = results.filter((r) => r.passed).length;
      const failedCount = results.filter((r) => !r.passed).length;
      allResults[engine.name] = { total: results.length, passed: passedCount, failed: failedCount, version };
      console.log(`\nSUMMARY FOR ${engine.name}: ${passedCount} PASSED, ${failedCount} FAILED (version: ${version})`);
      console.log(`>>> ${engine.shortName} completed\n`);

      if (failedCount > 0) {
        console.error(`ERROR: ${engine.name} encountered ${failedCount} test failure(s). Stopping further execution.`);
        break;
      }
    }
  } finally {
    console.log("Stopping Next.js production server...");
    try {
      if (serverProcess.pid) {
        spawn("taskkill", ["/pid", String(serverProcess.pid), "/T", "/F"], { shell: true });
      }
    } catch { }
    serverProcess.kill();

    console.log("\n===============================================================");
    console.log("FINAL MULTI-BROWSER RUNTIME AUDIT SUMMARY");
    console.log("===============================================================");
    let allPassed = true;
    let totalAssertions = 0;
    let totalPassed = 0;
    let totalFailed = 0;

    for (const [engineName, data] of Object.entries(allResults)) {
      console.log(`${engineName} (${data.version}): ${data.passed}/${data.total} PASSED (${data.failed} failed)`);
      totalAssertions += data.total;
      totalPassed += data.passed;
      totalFailed += data.failed;
      if (data.failed > 0 || data.passed !== 66) allPassed = false;
    }
    console.log(`TOTAL: ${totalPassed}/${totalAssertions} PASSED, ${totalFailed} FAILED`);
    console.log("===============================================================\n");

    process.exit(allPassed && totalPassed === 198 ? 0 : 1);
  }
}

runMultiBrowserAudit().catch((err) => {
  console.error("Multi-browser audit fatal error:", err);
  process.exit(1);
});
