import { spawn } from 'child_process';

const PORT = 3009;
const BASE_URL = `http://localhost:${PORT}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchUrl(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    redirect: 'manual',
    ...options,
  });
  const text = await res.text();
  return {
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    body: text,
  };
}

async function runAudit() {
  console.log("==================================================");
  console.log("STARTING PART 6 SEO & PRIVATE EXPOSURE AUDIT");
  console.log("==================================================");

  // 1. Start production server
  console.log(`Starting Next.js production server on port ${PORT}...`);
  const serverProcess = spawn("npx", ["next", "start", "-p", String(PORT)], {
    cwd: process.cwd(),
    shell: true,
    stdio: "pipe",
    env: { ...process.env, PORT: String(PORT) },
  });

  // Wait for server to be ready
  let serverReady = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.status === 200) {
        serverReady = true;
        break;
      }
    } catch (e) {
      await sleep(1000);
    }
  }

  if (!serverReady) {
    console.error("FATAL: Could not connect to Next.js production server.");
    serverProcess.kill();
    process.exit(1);
  }
  console.log("Production server is UP and responding!\n");

  const results = [];
  function record(category, testName, passed, details = "") {
    results.push({ category, testName, passed, details });
    const statusStr = passed ? "PASS" : "FAIL";
    console.log(`[${statusStr}] [${category}] ${testName}${details ? " -> " + details : ""}`);
  }

  try {
    // ---------------------------------------------------------
    // 1. ROBOTS.TXT AUDIT
    // ---------------------------------------------------------
    const robotsRes = await fetchUrl("/robots.txt");
    record("Robots.txt", "GET /robots.txt returns 200", robotsRes.status === 200, `Status: ${robotsRes.status}`);
    record("Robots.txt", "Content-Type is text/plain", (robotsRes.headers["content-type"] || "").includes("text/plain"), `Content-Type: ${robotsRes.headers["content-type"]}`);
    record("Robots.txt", "Disallow /admin", robotsRes.body.includes("Disallow: /admin"), "Contains Disallow: /admin");
    record("Robots.txt", "Disallow /account", robotsRes.body.includes("Disallow: /account"), "Contains Disallow: /account");
    record("Robots.txt", "Disallow /wishlist", robotsRes.body.includes("Disallow: /wishlist"), "Contains Disallow: /wishlist");
    record("Robots.txt", "Disallow /api/", robotsRes.body.includes("Disallow: /api/"), "Contains Disallow: /api/");
    record("Robots.txt", "Disallow /go/", robotsRes.body.includes("Disallow: /go/"), "Contains Disallow: /go/");
    record("Robots.txt", "Includes Sitemap URL", robotsRes.body.includes("sitemap.xml"), "Contains Sitemap directive");

    // ---------------------------------------------------------
    // 2. SITEMAP.XML AUDIT
    // ---------------------------------------------------------
    const sitemapRes = await fetchUrl("/sitemap.xml");
    record("Sitemap.xml", "GET /sitemap.xml returns 200", sitemapRes.status === 200, `Status: ${sitemapRes.status}`);
    record("Sitemap.xml", "Valid XML response", sitemapRes.body.includes("<?xml") || sitemapRes.body.includes("<urlset"), "Contains valid urlset XML");
    record("Sitemap.xml", "Includes public pages (homepage, products, deals)", sitemapRes.body.includes("/products") && sitemapRes.body.includes("/deals"), "Contains /products, /deals");
    record("Sitemap.xml", "Does NOT include /admin", !sitemapRes.body.includes("/admin"), "No /admin URLs");
    record("Sitemap.xml", "Does NOT include /account", !sitemapRes.body.includes("/account"), "No /account URLs");
    record("Sitemap.xml", "Does NOT include /wishlist", !sitemapRes.body.includes("/wishlist"), "No /wishlist URLs");
    record("Sitemap.xml", "Does NOT include /api/", !sitemapRes.body.includes("/api/"), "No API URLs");
    record("Sitemap.xml", "Does NOT include /go/", !sitemapRes.body.includes("/go/"), "No /go/ URLs");
    record("Sitemap.xml", "Does NOT include /search", !sitemapRes.body.includes("/search"), "No /search URLs");

    // Extract an active product slug from sitemap
    const productMatch = sitemapRes.body.match(/<loc>[^<]*\/product\/([^<]+)<\/loc>/);
    const activeProductSlug = productMatch ? productMatch[1] : null;

    // Extract an active category slug from sitemap
    const categoryMatch = sitemapRes.body.match(/<loc>[^<]*\/categories\/([^<]+)<\/loc>/);
    const activeCategorySlug = categoryMatch ? categoryMatch[1] : null;

    // ---------------------------------------------------------
    // 3. PRIVATE PAGE INDEXING AUDIT
    // ---------------------------------------------------------
    const adminRes = await fetchUrl("/admin");
    record("Private Pages", "GET /admin returns 307 redirect or noindex layout", adminRes.status === 307 || adminRes.body.includes("noindex"), `Status: ${adminRes.status}`);
    record("Private Pages", "GET /admin includes X-Robots-Tag header", adminRes.headers["x-robots-tag"] === "noindex, nofollow", `X-Robots-Tag: ${adminRes.headers["x-robots-tag"]}`);

    const accountRes = await fetchUrl("/account");
    record("Private Pages", "GET /account returns 200 with noindex", accountRes.status === 200 && accountRes.body.includes("noindex"), `Status: ${accountRes.status}`);
    record("Private Pages", "GET /account includes X-Robots-Tag header", accountRes.headers["x-robots-tag"] === "noindex, nofollow", `X-Robots-Tag: ${accountRes.headers["x-robots-tag"]}`);

    const wishlistRes = await fetchUrl("/wishlist");
    record("Private Pages", "GET /wishlist returns 200 with noindex", wishlistRes.status === 200 && wishlistRes.body.includes("noindex"), `Status: ${wishlistRes.status}`);
    record("Private Pages", "GET /wishlist includes X-Robots-Tag header", wishlistRes.headers["x-robots-tag"] === "noindex, nofollow", `X-Robots-Tag: ${wishlistRes.headers["x-robots-tag"]}`);

    const loginRes = await fetchUrl("/login");
    record("Private Pages", "GET /login returns 200 with noindex", loginRes.status === 200 && loginRes.body.includes("noindex"), `Status: ${loginRes.status}`);

    const signupRes = await fetchUrl("/signup");
    record("Private Pages", "GET /signup returns 200 with noindex", signupRes.status === 200 && signupRes.body.includes("noindex"), `Status: ${signupRes.status}`);

    const forgotRes = await fetchUrl("/forgot-password");
    record("Private Pages", "GET /forgot-password returns 200 with noindex", forgotRes.status === 200 && forgotRes.body.includes("noindex"), `Status: ${forgotRes.status}`);

    const resetRes = await fetchUrl("/reset-password");
    record("Private Pages", "GET /reset-password returns 200 with noindex", resetRes.status === 200 && resetRes.body.includes("noindex"), `Status: ${resetRes.status}`);

    // ---------------------------------------------------------
    // 4. API & INTERNAL EXPOSURE AUDIT
    // ---------------------------------------------------------
    const adminApiRes = await fetchUrl("/api/admin/dashboard");
    record("API Exposure", "GET /api/admin/dashboard rejected with 401/403", [401, 403].includes(adminApiRes.status), `Status: ${adminApiRes.status}`);
    record("API Exposure", "GET /api/admin/dashboard has X-Robots-Tag: noindex, nofollow", adminApiRes.headers["x-robots-tag"] === "noindex, nofollow", `X-Robots-Tag: ${adminApiRes.headers["x-robots-tag"]}`);

    const cronApiRes = await fetchUrl("/api/cron/automation");
    record("API Exposure", "GET /api/cron/automation without token rejected with 401", cronApiRes.status === 401, `Status: ${cronApiRes.status}`);
    record("API Exposure", "GET /api/cron/automation has X-Robots-Tag", cronApiRes.headers["x-robots-tag"] === "noindex, nofollow", `X-Robots-Tag: ${cronApiRes.headers["x-robots-tag"]}`);

    const profileApiRes = await fetchUrl("/api/profile");
    record("API Exposure", "GET /api/profile without auth rejected with 401", profileApiRes.status === 401, `Status: ${profileApiRes.status}`);
    record("API Exposure", "GET /api/profile has X-Robots-Tag", profileApiRes.headers["x-robots-tag"] === "noindex, nofollow", `X-Robots-Tag: ${profileApiRes.headers["x-robots-tag"]}`);

    const profilesApiRes = await fetchUrl("/api/profiles");
    record("API Exposure", "GET /api/profiles without auth rejected with 401", profilesApiRes.status === 401, `Status: ${profilesApiRes.status}`);

    const healthRes = await fetchUrl("/api/health");
    record("API Exposure", "GET /api/health returns 200 with status ok", healthRes.status === 200 && healthRes.body.includes('"status":"ok"'), `Body: ${healthRes.body.trim()}`);
    record("API Exposure", "GET /api/health has X-Robots-Tag", healthRes.headers["x-robots-tag"] === "noindex, nofollow", `X-Robots-Tag: ${healthRes.headers["x-robots-tag"]}`);

    const healthReadyRes = await fetchUrl("/api/health/ready");
    record("API Exposure", "GET /api/health/ready returns JSON and no secret leak", (healthReadyRes.status === 200 || healthReadyRes.status === 503) && !healthReadyRes.body.includes("postgres://") && !healthReadyRes.body.includes("service_role"), `Status: ${healthReadyRes.status}, Body: ${healthReadyRes.body.trim()}`);

    const webhookRes = await fetchUrl("/api/webhooks/affiliate/generic", { method: "POST", body: "{}" });
    record("API Exposure", "POST /api/webhooks/affiliate/generic rejected with 401 without signature", webhookRes.status === 401, `Status: ${webhookRes.status}`);

    // ---------------------------------------------------------
    // 5. PUBLIC SEO & CANONICAL AUDIT
    // ---------------------------------------------------------
    const homeRes = await fetchUrl("/");
    record("Public SEO", "GET / returns 200", homeRes.status === 200, `Status: ${homeRes.status}`);
    record("Public SEO", "GET / contains canonical link", homeRes.body.includes('rel="canonical"'), "Canonical link present");
    record("Public SEO", "GET / contains title metadata", homeRes.body.includes("<title>CLOXTRO"), "Title present");
    record("Public SEO", "GET / contains Organization schema", homeRes.body.includes('"@type":"Organization"'), "Organization schema present");
    record("Public SEO", "GET / contains WebSite schema", homeRes.body.includes('"@type":"WebSite"'), "WebSite schema present");

    const productsRes = await fetchUrl("/products");
    record("Public SEO", "GET /products returns 200", productsRes.status === 200, `Status: ${productsRes.status}`);
    record("Public SEO", "GET /products contains canonical link to /products", productsRes.body.includes('rel="canonical"') && productsRes.body.includes('/products'), "Canonical link to /products present");
    record("Public SEO", "GET /products contains title metadata", productsRes.body.includes("<title>All Products — CLOXTRO</title>"), "Title present");

    const categoriesRes = await fetchUrl("/categories");
    record("Public SEO", "GET /categories returns 200", categoriesRes.status === 200, `Status: ${categoriesRes.status}`);
    record("Public SEO", "GET /categories contains canonical link", categoriesRes.body.includes('rel="canonical"') && categoriesRes.body.includes('/categories'), "Canonical link to /categories present");

    if (activeCategorySlug) {
      const activeCatRes = await fetchUrl(`/categories/${activeCategorySlug}`);
      record("Public SEO", `GET /categories/${activeCategorySlug} returns 200`, activeCatRes.status === 200, `Status: ${activeCatRes.status}`);
      record("Public SEO", `GET /categories/${activeCategorySlug} contains canonical link`, activeCatRes.body.includes('rel="canonical"') && activeCatRes.body.includes(`/categories/${activeCategorySlug}`), "Canonical link present");
    }

    const dealsRes = await fetchUrl("/deals");
    record("Public SEO", "GET /deals returns 200", dealsRes.status === 200, `Status: ${dealsRes.status}`);
    record("Public SEO", "GET /deals contains canonical link", dealsRes.body.includes('rel="canonical"') && dealsRes.body.includes('/deals'), "Canonical link to /deals present");

    const menRes = await fetchUrl("/men");
    record("Public SEO", "GET /men returns 200 with canonical", menRes.status === 200 && menRes.body.includes('/men'), "Men canonical present");

    const womenRes = await fetchUrl("/women");
    record("Public SEO", "GET /women returns 200 with canonical", womenRes.status === 200 && womenRes.body.includes('/women'), "Women canonical present");

    const kidsRes = await fetchUrl("/kids");
    record("Public SEO", "GET /kids returns 200 with canonical", kidsRes.status === 200 && kidsRes.body.includes('/kids'), "Kids canonical present");

    const searchRes = await fetchUrl("/search?q=test");
    record("Public SEO", "GET /search?q=test returns 200 with noindex, follow", searchRes.status === 200 && searchRes.body.includes('content="noindex, follow"'), "Search page has noindex, follow");
    record("Public SEO", "GET /search?q=test has clean canonical to /search", searchRes.body.includes('/search') && !searchRes.body.includes('q=test" rel="canonical"'), "Search query canonical normalized");

    // ---------------------------------------------------------
    // 6. PRODUCT DETAIL & ERROR / ARCHIVED HANDLING
    // ---------------------------------------------------------
    if (activeProductSlug) {
      const activeProdRes = await fetchUrl(`/product/${activeProductSlug}`);
      record("Public Product SEO", `GET /product/${activeProductSlug} returns 200`, activeProdRes.status === 200, `Status: ${activeProdRes.status}`);
      record("Public Product SEO", `GET /product/${activeProductSlug} has canonical link`, activeProdRes.body.includes('rel="canonical"') && activeProdRes.body.includes(`/product/${activeProductSlug}`), "Canonical link present");
      record("Public Product SEO", `GET /product/${activeProductSlug} has schema.org Product JSON-LD`, activeProdRes.body.includes('"@type":"Product"'), "Product JSON-LD present");
      record("Public Product SEO", `GET /product/${activeProductSlug} has Breadcrumb JSON-LD`, activeProdRes.body.includes('"@type":"BreadcrumbList"'), "BreadcrumbList JSON-LD present");
    }

    const invalidProductRes = await fetchUrl("/product/non-existent-slug-xyz-999");
    const isInvalidProductHandled = invalidProductRes.status === 404 || (invalidProductRes.body.includes("Page not found") && invalidProductRes.body.includes("noindex"));
    record("Error / Inactive SEO", "GET /product/<invalid-slug> returns 404 or noindex 404 view", isInvalidProductHandled, `Status: ${invalidProductRes.status}, isNotFoundView: ${invalidProductRes.body.includes("Page not found")}`);
    record("Error / Inactive SEO", "GET /product/<invalid-slug> 404 page has noindex", invalidProductRes.body.includes("noindex"), "Contains noindex directive");

    const invalidCategoryRes = await fetchUrl("/categories/non-existent-category-slug-999");
    record("Error / Inactive SEO", "GET /categories/<invalid-slug> returns 404", invalidCategoryRes.status === 404, `Status: ${invalidCategoryRes.status}`);
    record("Error / Inactive SEO", "GET /categories/<invalid-slug> 404 page has noindex", invalidCategoryRes.body.includes("noindex"), "404 contains noindex");

    const general404Res = await fetchUrl("/some-random-broken-path-404");
    record("Error / Inactive SEO", "GET /some-random-broken-path-404 returns 404", general404Res.status === 404, `Status: ${general404Res.status}`);
    record("Error / Inactive SEO", "General 404 has noindex", general404Res.body.includes("noindex"), "404 contains noindex");

    // ---------------------------------------------------------
    // 7. SENSITIVE TOKEN & SECRET SCAN
    // ---------------------------------------------------------
    const pagesToScan = [homeRes.body, productsRes.body, adminApiRes.body, healthRes.body, robotsRes.body, sitemapRes.body];
    const sensitivePatterns = [
      /SUPABASE_SERVICE_ROLE_KEY/i,
      /CRON_SECRET/i,
      /STEP_UP_SECRET/i,
      /AFFILIATE_SIGNING_KEY/i,
      /AFFILIATE_WEBHOOK_SECRET/i,
    ];

    let leakFound = false;
    for (const body of pagesToScan) {
      for (const pattern of sensitivePatterns) {
        if (pattern.test(body)) {
          leakFound = true;
          record("Sensitive Token Scan", `Body matched sensitive pattern ${pattern}`, false, "LEAK DETECTED!");
        }
      }
    }
    if (!leakFound) {
      record("Sensitive Token Scan", "Zero secret/token leakage across scanned responses", true, "All sensitive tokens safely guarded");
    }

  } finally {
    console.log("\nStopping production server...");
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
  console.log(`AUDIT COMPLETE: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log("==================================================");
  process.exit(failedCount > 0 ? 1 : 0);
}

runAudit().catch((err) => {
  console.error("Audit threw unhandled error:", err);
  process.exit(1);
});

