import http from 'http';

const BASE_URL = 'http://localhost:3005';

async function request(path, options = {}) {
  const url = new URL(path, BASE_URL);
  const opts = {
    method: options.method || 'GET',
    headers: options.headers || {},
    redirect: 'manual',
  };

  return new Promise((resolve, reject) => {
    const req = http.request(url, opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', (err) => reject(err));

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('=== PART 10 RUNTIME END-TO-END VERIFICATION ===\n');
  const results = [];

  function record(name, status, passed, details = '') {
    const icon = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${icon} [${status}] ${name} ${details ? '(' + details + ')' : ''}`);
    results.push({ name, status, passed, details });
  }

  try {
    // 1. GET / (Homepage)
    const homepage = await request('/');
    record(
      'Homepage (GET /)',
      homepage.status,
      homepage.status === 200,
      `Length: ${homepage.body.length}`
    );

    // 2. Security Headers on Homepage
    const headers = homepage.headers;
    const hasCsp = !!headers['content-security-policy'];
    const hasXfo = headers['x-frame-options'] === 'DENY';
    const hasXcto = headers['x-content-type-options'] === 'nosniff';
    const hasRp = !!headers['referrer-policy'];
    record(
      'Security Headers Present (CSP, XFO, XCTO, Referrer)',
      homepage.status,
      hasCsp && hasXfo && hasXcto && hasRp,
      `CSP: ${hasCsp}, XFO: ${headers['x-frame-options']}, XCTO: ${headers['x-content-type-options']}`
    );

    // 3. Product Catalog API (GET /api/products)
    const catalog = await request('/api/products');
    let productsData = null;
    let catalogOk = false;
    try {
      productsData = JSON.parse(catalog.body);
      catalogOk = catalog.status === 200 && Array.isArray(productsData.products || productsData);
    } catch (e) { }
    const productsArray = productsData?.products || (Array.isArray(productsData) ? productsData : []);
    record(
      'Product Catalog API (GET /api/products)',
      catalog.status,
      catalogOk,
      `Found ${productsArray.length} products`
    );

    // 4. Product Detail Flow
    let productSlug = productsArray.length > 0 ? productsArray[0].slug : null;
    if (productSlug) {
      const productDetail = await request(`/product/${productSlug}`);
      record(
        `Product Detail Page (GET /product/${productSlug})`,
        productDetail.status,
        productDetail.status === 200,
        `Length: ${productDetail.body.length}`
      );
    } else {
      const productPage = await request('/products');
      record(
        'Products Listing Page (GET /products)',
        productPage.status,
        productPage.status === 200,
        `Length: ${productPage.body.length}`
      );
    }

    // 5. Admin Page Access without Auth (GET /admin)
    const adminPage = await request('/admin');
    const adminPageProtected = [302, 307, 308, 401, 403].includes(adminPage.status) ||
      (adminPage.status === 200 && (adminPage.headers['location'] || adminPage.body.includes('Login') || adminPage.body.includes('Sign in')));
    record(
      'GET /admin without auth blocked/redirected',
      adminPage.status,
      adminPageProtected,
      `Location: ${adminPage.headers['location'] || 'none'}`
    );

    // 6. Admin API Access without Auth (GET /api/admin/dashboard)
    const adminApi = await request('/api/admin/dashboard');
    record(
      'GET /api/admin/dashboard without auth rejected',
      adminApi.status,
      [401, 403, 307, 308].includes(adminApi.status),
      `Body: ${adminApi.body.trim().slice(0, 80)}`
    );

    // 7. Protected Customer API without Auth (GET /api/profile)
    const profileApi = await request('/api/profile');
    record(
      'GET /api/profile without auth rejected',
      profileApi.status,
      [401, 403].includes(profileApi.status),
      `Body: ${profileApi.body.trim().slice(0, 80)}`
    );

    // 8. Fake Auth Token Attempt (GET /api/profile with fake Bearer token)
    const fakeTokenApi = await request('/api/profile', {
      headers: { Authorization: 'Bearer fake-jwt-token-xyz' }
    });
    record(
      'Protected API with Fake Bearer Token rejected',
      fakeTokenApi.status,
      [401, 403].includes(fakeTokenApi.status),
      `Body: ${fakeTokenApi.body.trim().slice(0, 80)}`
    );

    // 9. Forged Role Header Attempt (GET /api/admin/dashboard with x-user-role: admin)
    const forgedRoleApi = await request('/api/admin/dashboard', {
      headers: { 'x-user-role': 'admin' }
    });
    record(
      'Admin API with Forged x-user-role header rejected',
      forgedRoleApi.status,
      [401, 403, 307, 308].includes(forgedRoleApi.status),
      `Body: ${forgedRoleApi.body.trim().slice(0, 80)}`
    );

    // 10. Cron Automation Endpoint without Secret
    const cronApi = await request('/api/cron/automation');
    record(
      'GET /api/cron/automation without CRON_SECRET rejected',
      cronApi.status,
      [401, 403].includes(cronApi.status),
      `Body: ${cronApi.body.trim().slice(0, 80)}`
    );

    // 11. Invalid /go/[offerId] Redirect (Malformed UUID & Non-existent UUID)
    const invalidGoMalformed = await request('/go/invalid-offer-id-99999');
    const invalidGoNotFound = await request('/go/00000000-0000-4000-a000-000000000000');
    const malformedSafe = invalidGoMalformed.status === 400 && invalidGoMalformed.body.includes("This deal isn't available");
    const notFoundSafe = invalidGoNotFound.status === 404 && invalidGoNotFound.body.includes("This deal isn't available");
    record(
      'Invalid /go/[offerId] safely handled (400 for malformed UUID, 404 for missing offer)',
      invalidGoMalformed.status,
      malformedSafe && notFoundSafe,
      `Malformed: ${invalidGoMalformed.status}, Missing UUID: ${invalidGoNotFound.status}`
    );

    // 12. Auth Callback Malicious Next Parameter
    const maliciousAuthCallback = await request('/auth/callback?next=https://attacker.com');
    const redirectLoc = maliciousAuthCallback.headers['location'] || '';
    const openRedirectBlocked = !redirectLoc.includes('attacker.com');
    record(
      'Auth Callback Open Redirect to attacker.com blocked',
      maliciousAuthCallback.status,
      openRedirectBlocked,
      `Location: ${redirectLoc || 'safe local route'}`
    );

    // 13. Health Endpoint (GET /api/health)
    const health = await request('/api/health');
    record(
      'Health Check (GET /api/health)',
      health.status,
      health.status === 200,
      `Body: ${health.body.trim()}`
    );

    // 14. Health Ready Endpoint (GET /api/health/ready)
    const healthReady = await request('/api/health/ready');
    record(
      'Health Ready Check (GET /api/health/ready)',
      healthReady.status,
      [200, 503].includes(healthReady.status),
      `Body: ${healthReady.body.trim().slice(0, 80)}`
    );

    // 15. CORS Attacker Origin Request
    const corsTest = await request('/api/products', {
      headers: { Origin: 'https://attacker.com' }
    });
    const acao = corsTest.headers['access-control-allow-origin'];
    const corsSafe = acao !== 'https://attacker.com' && acao !== '*';
    record(
      'CORS Attacker Origin request does not leak credentials/allow attacker',
      corsTest.status,
      corsSafe,
      `ACAO header: ${acao || 'Not set (Same-origin default)'}`
    );

    // 16. Webhook Unauthorized / Invalid Signature Attempt
    const webhookTest = await request('/api/webhooks/affiliate/impact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Impact-Signature': 'invalid_sig' },
      body: JSON.stringify({ event: 'conversion', amount: 100 })
    });
    record(
      'Webhook with Invalid Signature rejected',
      webhookTest.status,
      [400, 401, 403, 404, 405].includes(webhookTest.status),
      `Status: ${webhookTest.status}`
    );

    console.log('\n=== SUMMARY OF RUNTIME TESTS ===');
    const passedCount = results.filter(r => r.passed).length;
    console.log(`Passed: ${passedCount} / ${results.length}`);

  } catch (err) {
    console.error('Test execution error:', err);
  }
}

runTests();

