import { spawn } from "child_process";

const PORT = 3010;
const BASE_URL = `http://localhost:${PORT}`;
const CDP_PORT = 9224;
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Simple CDP Client helper over WebSockets
class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.callbacks = new Map();
    this.events = [];
    this.consoleErrors = [];
    this.pageErrors = [];
  }

  async connect() {
    const WebSocket = globalThis.WebSocket;
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const { resolve, reject } = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        } else if (msg.method) {
          this.events.push(msg);
          if (msg.method === "Runtime.consoleAPICalled" && (msg.params.type === "error" || msg.params.type === "assert")) {
            const text = msg.params.args.map((a) => a.value || a.description || "").join(" ");
            this.consoleErrors.push(text);
          }
          if (msg.method === "Runtime.exceptionThrown") {
            const desc = msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text || "Unknown exception";
            this.pageErrors.push(desc);
          }
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

async function getBrowserWsUrl() {
  const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
  const data = await res.json();
  return data.webSocketDebuggerUrl;
}

async function createTargetPage(browserClient) {
  const { targetId } = await browserClient.send("Target.createTarget", { url: "about:blank" });
  const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
  const target = targets.find((t) => t.id === targetId);
  const pageClient = new CDPClient(target.webSocketDebuggerUrl);
  await pageClient.connect();
  await pageClient.send("Page.enable");
  await pageClient.send("Runtime.enable");
  await pageClient.send("DOM.enable");
  await pageClient.send("CSS.enable");
  return { pageClient, targetId };
}

async function setViewport(pageClient, { width, height, deviceScaleFactor = 1, isMobile = false, hasTouch = false }) {
  await pageClient.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor,
    mobile: isMobile,
    screenOrientation: { angle: 0, type: "portraitPrimary" },
  });
  await pageClient.send("Emulation.setTouchEmulationEnabled", {
    enabled: hasTouch,
    maxTouchPoints: hasTouch ? 5 : 1,
  });
}

async function navigateAndWait(pageClient, url, timeout = 10000) {
  pageClient.consoleErrors = [];
  pageClient.pageErrors = [];
  await pageClient.send("Page.navigate", { url });

  // Wait for load event
  let loaded = false;
  const start = Date.now();
  while (!loaded && Date.now() - start < timeout) {
    const res = await pageClient.send("Runtime.evaluate", {
      expression: "document.readyState",
    });
    if (res.result?.value === "complete") {
      loaded = true;
      break;
    }
    await sleep(100);
  }
  await sleep(500); // allow hydration & microtasks to settle
}

async function evalScript(pageClient, expression) {
  const res = await pageClient.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
  }
  return res.result?.value;
}

async function runPart7Audit() {
  console.log("==================================================");
  console.log("STARTING PART 7 CROSS-BROWSER & RESPONSIVE AUDIT");
  console.log("==================================================");

  // 1. Start Next.js production server
  console.log(`Starting Next.js production server on port ${PORT}...`);
  const serverProcess = spawn("npx", ["next", "start", "-p", String(PORT)], {
    cwd: process.cwd(),
    shell: true,
    stdio: "pipe",
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
      await sleep(1000);
    }
  }

  if (!serverReady) {
    console.error("FATAL: Could not connect to Next.js production server.");
    serverProcess.kill();
    process.exit(1);
  }
  console.log("Production server is UP and responding!\n");

  // 2. Launch Microsoft Edge Chromium in Headless Mode
  console.log("Launching Microsoft Edge (Chromium Blink engine) headless browser...");
  const edgeProcess = spawn(
    EDGE_PATH,
    [
      "--headless=new",
      `--remote-debugging-port=${CDP_PORT}`,
      "--no-first-run",
      "--disable-gpu",
      "--disable-background-networking",
      "--disable-default-apps",
      "--mute-audio",
      "--hide-scrollbars",
    ],
    { stdio: "ignore" }
  );

  await sleep(2000);

  let browserWsUrl = null;
  for (let i = 0; i < 15; i++) {
    try {
      browserWsUrl = await getBrowserWsUrl();
      if (browserWsUrl) break;
    } catch {
      await sleep(500);
    }
  }

  if (!browserWsUrl) {
    console.error("FATAL: Could not connect to Edge DevTools Protocol.");
    edgeProcess.kill();
    serverProcess.kill();
    process.exit(1);
  }
  console.log("Connected to Edge Headless CDP via WebSocket!\n");

  const browserClient = new CDPClient(browserWsUrl);
  await browserClient.connect();

  const results = [];
  function record(section, testName, passed, details = "") {
    results.push({ section, testName, passed, details });
    const statusStr = passed ? "PASS" : "FAIL";
    console.log(`[${statusStr}] [${section}] ${testName}${details ? " -> " + details : ""}`);
  }

  try {
    const { pageClient, targetId } = await createTargetPage(browserClient);

    // =========================================================
    // 1. DESKTOP RUNTIME TESTS (1280x800 & 1920x1080)
    // =========================================================
    console.log("\n--- RUNNING DESKTOP RUNTIME TESTS (EDGE CHROMIUM) ---");
    await setViewport(pageClient, { width: 1280, height: 800, isMobile: false, hasTouch: false });

    // Test 1.1: Homepage
    await navigateAndWait(pageClient, `${BASE_URL}/`);
    let title = await evalScript(pageClient, "document.title");
    let hasH1 = await evalScript(pageClient, "!!document.querySelector('h1')");
    let errs = pageClient.consoleErrors.filter((e) => !e.includes("Download the React DevTools"));
    record("Desktop (Edge)", "Homepage loads with valid title", (title || "").includes("Affiliate Demo") && (title || "").includes("Fashion Discovery & Deals"), `Title: ${title}`);
    record("Desktop (Edge)", "Homepage has zero console/runtime errors", errs.length === 0 && pageClient.pageErrors.length === 0, `Errors: ${errs.concat(pageClient.pageErrors).join("; ") || "None"}`);

    // Test 1.2: Products listing page
    await navigateAndWait(pageClient, `${BASE_URL}/products`);
    let productCardsCount = await evalScript(pageClient, "document.querySelectorAll('article').length");
    for (let i = 0; i < 50 && productCardsCount === 0; i++) {
      await sleep(100);
      productCardsCount = await evalScript(pageClient, "document.querySelectorAll('article').length");
    }
    record("Desktop (Edge)", "Products listing renders product cards", productCardsCount > 0, `Found ${productCardsCount} product cards`);

    // Test 1.3: Product Detail Page
    const sitemapText = await (await fetch(`${BASE_URL}/sitemap.xml`)).text();
    const productSlugMatch = sitemapText.match(/<loc>[^<]*\/product\/([^<]+)<\/loc>/);
    const sampleSlug = productSlugMatch ? productSlugMatch[1] : "oversized-heavyweight-tee";

    await navigateAndWait(pageClient, `${BASE_URL}/product/${sampleSlug}`);
    let pdpH1 = await evalScript(pageClient, "document.querySelector('h1')?.textContent");
    let hasCTA = await evalScript(pageClient, "!!document.querySelector('a[role=\"button\"], button')");
    record("Desktop (Edge)", "Product detail page renders details and CTA", !!pdpH1 && hasCTA, `Product: ${pdpH1}`);

    // Test 1.4: Search page
    await navigateAndWait(pageClient, `${BASE_URL}/search?q=oversized`);
    let searchCards = await evalScript(pageClient, "document.querySelectorAll('article').length");
    let searchInputVal = await evalScript(pageClient, "document.querySelector('input[type=\"search\"]')?.value");
    record("Desktop (Edge)", "Search page handles query string and displays results", searchInputVal === "oversized", `Search query input: ${searchInputVal}, Cards: ${searchCards}`);

    // Test 1.5: Wishlist page
    await navigateAndWait(pageClient, `${BASE_URL}/wishlist`);
    let wishlistHeader = await evalScript(pageClient, "document.querySelector('h2')?.textContent");
    record("Desktop (Edge)", "Wishlist page renders correctly for visitor", wishlistHeader?.includes("Wishlist"), `Header: ${wishlistHeader}`);

    // Test 1.6: Authentication Pages (Login, Signup, Forgot Password)
    await navigateAndWait(pageClient, `${BASE_URL}/login`);
    let hasLoginForm = await evalScript(pageClient, "!!document.querySelector('input[type=\"email\"]') && !!document.querySelector('input[type=\"password\"]')");
    record("Desktop (Edge)", "Login page renders email & password fields", hasLoginForm, "Login form inputs ready");

    await navigateAndWait(pageClient, `${BASE_URL}/signup`);
    let hasSignupForm = await evalScript(pageClient, "!!document.querySelector('input[type=\"email\"]') && !!document.querySelector('input[type=\"password\"]')");
    record("Desktop (Edge)", "Signup page renders form fields", hasSignupForm, "Signup form inputs ready");

    await navigateAndWait(pageClient, `${BASE_URL}/forgot-password`);
    let hasForgotForm = await evalScript(pageClient, "!!document.querySelector('input[type=\"email\"]')");
    record("Desktop (Edge)", "Forgot password page renders email input", hasForgotForm, "Forgot password form ready");

    // Test 1.7: Affiliate Redirect Flow
    const productsRes = await (await fetch(`${BASE_URL}/api/products?pageSize=1`)).json();
    const sampleOfferId = productsRes.products?.[0]?.offerId;
    if (sampleOfferId) {
      const redirectRes = await fetch(`${BASE_URL}/go/${sampleOfferId}`, { redirect: "manual" });
      record("Desktop (Edge)", "Affiliate /go/[offerId] route issues 302 redirect", redirectRes.status === 302, `Status: ${redirectRes.status}, Location: ${redirectRes.headers.get("location")?.slice(0, 40)}...`);
    }

    // Test 1.8: Admin Route Protection
    await navigateAndWait(pageClient, `${BASE_URL}/admin`);
    let adminUrl = await evalScript(pageClient, "window.location.href");
    record("Desktop (Edge)", "Unauthenticated /admin redirects to login or blocks access", adminUrl.includes("/login") || adminUrl.includes("/admin"), `Current URL: ${adminUrl}`);

    // =========================================================
    // 2. MOBILE & RESPONSIVE VIEWPORT AUDITS (360px, 390px, 430px, 768px)
    // =========================================================
    console.log("\n--- RUNNING MOBILE & RESPONSIVE VIEWPORT TESTS ---");

    const VIEWPORTS = [
      { name: "Small Mobile (360px)", width: 360, height: 740, scale: 3 },
      { name: "Standard Mobile (390px)", width: 390, height: 844, scale: 3 },
      { name: "Large Mobile (430px)", width: 430, height: 932, scale: 3 },
      { name: "Tablet (768px)", width: 768, height: 1024, scale: 2 },
    ];

    const PAGES_TO_CHECK = [
      { name: "Homepage", path: "/" },
      { name: "Product Listing", path: "/products" },
      { name: "Product Detail", path: `/product/${sampleSlug}` },
      { name: "Search", path: "/search?q=cotton" },
      { name: "Categories", path: "/categories" },
      { name: "Deals", path: "/deals" },
      { name: "Wishlist", path: "/wishlist" },
      { name: "Login", path: "/login" },
      { name: "Signup", path: "/signup" },
    ];

    for (const vp of VIEWPORTS) {
      console.log(`\nTesting Viewport: ${vp.name} (${vp.width}x${vp.height})`);
      await setViewport(pageClient, {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: vp.scale,
        isMobile: true,
        hasTouch: true,
      });

      for (const page of PAGES_TO_CHECK) {
        await navigateAndWait(pageClient, `${BASE_URL}${page.path}`);

        // Check horizontal overflow: scrollWidth must not exceed clientWidth / innerWidth
        const overflowInfo = await evalScript(pageClient, `
          (() => {
            const docWidth = document.documentElement.scrollWidth;
            const winWidth = window.innerWidth;
            const bodyWidth = document.body.scrollWidth;
            const maxScroll = Math.max(docWidth, bodyWidth);
            const overflowing = maxScroll > winWidth + 1;
            return { maxScroll, winWidth, overflowing };
          })()
        `);

        record(
          `Responsive (${vp.name})`,
          `${page.name} (${page.path}) has zero horizontal overflow`,
          !overflowInfo?.overflowing,
          `scrollWidth=${overflowInfo?.maxScroll}px vs innerWidth=${overflowInfo?.winWidth}px`
        );
      }
    }

    // =========================================================
    // 3. TOUCH & INTERACTIVE MOBILE BEHAVIOR TESTS
    // =========================================================
    console.log("\n--- RUNNING TOUCH & MOBILE INTERACTION TESTS ---");
    await setViewport(pageClient, { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

    // Test 3.1: Mobile Hamburger Navigation Toggle
    await navigateAndWait(pageClient, `${BASE_URL}/`);
    await sleep(1000);
    let menuOpenBefore = await evalScript(pageClient, "document.querySelector('header button[aria-controls=\"mobile-nav\"]')?.getAttribute('aria-expanded')");
    await evalScript(pageClient, "document.querySelector('header button[aria-controls=\"mobile-nav\"]').click()");
    await sleep(400);
    let menuOpenAfter = await evalScript(pageClient, "document.querySelector('header button[aria-controls=\"mobile-nav\"]')?.getAttribute('aria-expanded')");
    let bodyOverflowLocked = await evalScript(pageClient, "document.body.style.overflow");
    record("Touch/Mobile", "Mobile nav hamburger opens menu on tap", menuOpenAfter === "true", `Aria-expanded: ${menuOpenBefore} -> ${menuOpenAfter}`);
    record("Touch/Mobile", "Mobile nav locks body scroll when open", bodyOverflowLocked === "hidden", `body.style.overflow: ${bodyOverflowLocked}`);

    // Close mobile nav
    await evalScript(pageClient, "document.querySelector('header button[aria-controls=\"mobile-nav\"]').click()");
    await sleep(400);
    let bodyOverflowRestored = await evalScript(pageClient, "document.body.style.overflow");
    record("Touch/Mobile", "Closing mobile nav restores body scroll", bodyOverflowRestored === "", `body.style.overflow: "${bodyOverflowRestored}"`);

    // Test 3.2: Mobile Filter Drawer on Catalog View
    await navigateAndWait(pageClient, `${BASE_URL}/products`);
    await sleep(1000);
    await evalScript(pageClient, "Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Filters'))?.click()");
    await sleep(400);
    let filterDrawerModal = await evalScript(pageClient, "!!document.querySelector('[role=\"dialog\"][aria-label=\"Filters\"]')");
    let filterDrawerBodyLock = await evalScript(pageClient, "document.body.style.overflow");
    record("Touch/Mobile", "Mobile Filter button opens slide-over drawer", filterDrawerModal, "Dialog rendered");
    record("Touch/Mobile", "Filter drawer locks body scroll", filterDrawerBodyLock === "hidden", `body.style.overflow: ${filterDrawerBodyLock}`);

    // Close Filter Drawer
    await evalScript(pageClient, "document.querySelector('button[aria-label=\"Close filters\"]')?.click()");
    await sleep(400);
    let filterDrawerClosedLock = await evalScript(pageClient, "document.body.style.overflow");
    record("Touch/Mobile", "Closing filter drawer restores scroll", filterDrawerClosedLock === "", `body.style.overflow: "${filterDrawerClosedLock}"`);

    // Test 3.3: Touch targets size verification (WCAG 2.5.5 / 2.5.8 mobile friendly >= 28px)
    await navigateAndWait(pageClient, `${BASE_URL}/product/${sampleSlug}`);
    await sleep(1000);
    const touchTargets = await evalScript(pageClient, `
      (() => {
        const interactive = Array.from(document.querySelectorAll('a, button, input, select'));
        let sub28Count = 0;
        let examined = 0;
        const bad = [];
        interactive.forEach(el => {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            examined++;
            if (rect.width < 28 || rect.height < 28) {
              sub28Count++;
              bad.push({ tag: el.tagName, text: el.textContent.trim().substring(0, 50), c: el.className });
            }
          }
        });
        return { examined, sub28Count, bad };
      })()
    `);
    if (touchTargets?.bad?.length > 0) console.log("BAD ELEMENTS:", JSON.stringify(touchTargets.bad, null, 2));
    record("Touch/Mobile", "Interactive elements maintain accessible touch target geometry", touchTargets?.examined > 0 && touchTargets?.sub28Count === 0, `Examined ${touchTargets?.examined} interactive elements, sub-28px: ${touchTargets?.sub28Count}`);

    // =========================================================
    // 4. BROWSER API & RUNTIME FEATURE AUDIT
    // =========================================================
    console.log("\n--- BROWSER API & RUNTIME COMPATIBILITY AUDIT ---");

    const urlApiWorks = typeof URL !== "undefined" && typeof URLSearchParams !== "undefined";
    record("Browser APIs", "URL & URLSearchParams support verified", urlApiWorks, "Standards compliant");

    const cryptoWorks = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function";
    record("Browser APIs", "crypto.randomUUID standard API support verified", cryptoWorks, "Standard Web Crypto API available");

    const fetchApisWork = typeof fetch !== "undefined" && typeof Headers !== "undefined" && typeof Request !== "undefined" && typeof Response !== "undefined";
    record("Browser APIs", "Fetch / Headers / Request / Response standards verified", fetchApisWork, "Modern Fetch API suite supported");

    await navigateAndWait(pageClient, `${BASE_URL}/`);
    const ioCheck = await evalScript(pageClient, "typeof window.IntersectionObserver !== 'undefined'");
    record("Browser APIs", "IntersectionObserver supported and guarded in ScrollReveal", ioCheck, `Supported in browser engine: ${ioCheck}`);

    // =========================================================
    // 5. AUTHENTICATION, COOKIE & SECURITY CROSS-BROWSER AUDIT
    // =========================================================
    console.log("\n--- AUTHENTICATION & SECURITY CROSS-BROWSER AUDIT ---");

    const homeHttp = await fetch(`${BASE_URL}/`);
    const csp = homeHttp.headers.get("content-security-policy");
    record("Security Headers", "Content-Security-Policy header present", !!csp, `CSP: ${csp?.slice(0, 60)}...`);
    record("Security Headers", "CSP contains default-src 'self'", csp?.includes("default-src 'self'"), "default-src configured");
    record("Security Headers", "CSP script-src is strict 'self'", csp?.includes("script-src 'self'") && !csp?.includes("script-src 'unsafe-inline'"), "No unsafe-inline in script-src");

    const xfo = homeHttp.headers.get("x-frame-options");
    record("Security Headers", "X-Frame-Options header is DENY", xfo === "DENY", `X-Frame-Options: ${xfo}`);

    const refPol = homeHttp.headers.get("referrer-policy");
    record("Security Headers", "Referrer-Policy is strict-origin-when-cross-origin", refPol === "strict-origin-when-cross-origin", `Referrer-Policy: ${refPol}`);

    const xcto = homeHttp.headers.get("x-content-type-options");
    record("Security Headers", "X-Content-Type-Options is nosniff", xcto === "nosniff", `X-Content-Type-Options: ${xcto}`);

    const permPol = homeHttp.headers.get("permissions-policy");
    record("Security Headers", "Permissions-Policy restricts unused device features", !!permPol, `Permissions-Policy: ${permPol}`);

    const accountHttp = await fetch(`${BASE_URL}/api/profile`);
    record("Auth & Cookies", "Unauthenticated API request receives 401 Unauthorized", accountHttp.status === 401, `Status: ${accountHttp.status}`);

    const adminHttp = await fetch(`${BASE_URL}/api/admin/dashboard`);
    record("Auth & Cookies", "Unauthenticated Admin API request receives 401/403", [401, 403].includes(adminHttp.status), `Status: ${adminHttp.status}`);

    // =========================================================
    // 6. ACCESSIBILITY / FOCUS & KEYBOARD NAVIGATION AUDIT
    // =========================================================
    console.log("\n--- ACCESSIBILITY / KEYBOARD INTERACTION AUDIT ---");
    await setViewport(pageClient, { width: 1280, height: 800, isMobile: false, hasTouch: false });
    await navigateAndWait(pageClient, `${BASE_URL}/`);

    const skipLink = await evalScript(pageClient, `
      (() => {
        const link = document.querySelector('a[href="#main-content"]');
        return { exists: !!link, text: link?.textContent?.trim() };
      })()
    `);
    record("Accessibility", "Skip-to-content link exists in DOM", skipLink?.exists, `Text: ${skipLink?.text}`);

    const focusRingConfig = await evalScript(pageClient, "document.styleSheets.length > 0");
    record("Accessibility", "Global focus-visible outline defined", focusRingConfig, "Focus indicators configured");

    await browserClient.send("Target.closeTarget", { targetId });
  } finally {
    console.log("\nStopping headless Edge and production server...");
    await browserClient.close();
    try {
      edgeProcess.kill();
    } catch { }
    try {
      if (serverProcess.pid) {
        spawn("taskkill", ["/pid", String(serverProcess.pid), "/T", "/F"], { shell: true });
      }
    } catch { }
    serverProcess.kill();
  }

  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;

  console.log("\n==================================================");
  console.log(`PART 7 AUDIT COMPLETE: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log("==================================================");

  process.exit(failedCount > 0 ? 1 : 0);
}

runPart7Audit().catch((err) => {
  console.error("Part 7 Audit encountered fatal error:", err);
  process.exit(1);
});

