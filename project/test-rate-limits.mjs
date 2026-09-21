import http from 'http';

const BASE_URL = 'http://127.0.0.1:3010';

async function req(path, options = {}) {
  const url = new URL(path, BASE_URL);
  const method = options.method || 'GET';
  const headers = options.headers || {};
  const body = options.body;

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });

  let data;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  } else {
    data = await res.text();
  }

  return {
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    body: data,
  };
}

async function burst(path, count, options = {}) {
  const results = [];
  for (let i = 0; i < count; i++) {
    const res = await req(path, options);
    results.push(res);
  }
  const statusCounts = {};
  for (const r of results) {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
  }
  const first429 = results.findIndex(r => r.status === 429);
  return {
    total: count,
    statusCounts,
    first429Index: first429 >= 0 ? first429 + 1 : null,
    first429Response: first429 >= 0 ? results[first429] : null,
    results,
  };
}

async function runTests() {
  console.log('====================================================');
  console.log('  PART 2 — RATE LIMITING & ABUSE PROTECTION AUDIT   ');
  console.log('====================================================\n');

  const report = {};

  // TEST 1: Public Products API (/api/products) - Limit: 60/min
  console.log('[1/12] Testing /api/products burst (65 requests, limit: 60/min)...');
  const t1 = await burst('/api/products', 65, { headers: { 'x-test-suite': 'rate-limit' } });
  console.log('  Status counts:', t1.statusCounts);
  console.log('  First 429 at request #:', t1.first429Index);
  if (t1.first429Response) {
    console.log('  429 Body:', t1.first429Response.body);
    console.log('  Retry-After header:', t1.first429Response.headers['retry-after']);
  }
  report.products = t1;

  // TEST 2: /api/facets - Limit: 30/min
  console.log('\n[2/12] Testing /api/facets burst (35 requests, limit: 30/min)...');
  const t2 = await burst('/api/facets', 35);
  console.log('  Status counts:', t2.statusCounts);
  console.log('  First 429 at request #:', t2.first429Index);
  report.facets = t2;

  // TEST 3: /api/products/by-ids - Limit: 30/min
  console.log('\n[3/12] Testing /api/products/by-ids burst (35 requests, limit: 30/min)...');
  const t3 = await burst('/api/products/by-ids?ids=00000000-0000-0000-0000-000000000001', 35);
  console.log('  Status counts:', t3.statusCounts);
  console.log('  First 429 at request #:', t3.first429Index);
  report.productsByIds = t3;

  // TEST 4: /api/ai/search - Limit: 20/min
  console.log('\n[4/12] Testing /api/ai/search burst (25 requests, limit: 20/min)...');
  const t4 = await burst('/api/ai/search', 25, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { query: 'linen shirt' },
  });
  console.log('  Status counts:', t4.statusCounts);
  console.log('  First 429 at request #:', t4.first429Index);
  if (t4.first429Response) {
    console.log('  429 Body:', t4.first429Response.body);
  }
  report.aiSearch = t4;

  // TEST 5: /api/ai/recommendations - Limit: 30/min
  console.log('\n[5/12] Testing /api/ai/recommendations burst (35 requests, limit: 30/min)...');
  const t5 = await burst('/api/ai/recommendations?occasion=casual', 35);
  console.log('  Status counts:', t5.statusCounts);
  console.log('  First 429 at request #:', t5.first429Index);
  report.aiRecommendations = t5;

  // TEST 6: /api/track/view - Limit: 120/min
  console.log('\n[6/12] Testing /api/track/view burst (125 requests, limit: 120/min)...');
  const t6 = await burst('/api/track/view', 125, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { productId: '00000000-0000-0000-0000-000000000000' },
  });
  console.log('  Status counts:', t6.statusCounts);
  console.log('  First 429 at request #:', t6.first429Index);
  report.trackView = t6;

  // TEST 7: /api/cron/automation - Limit: 10/min
  console.log('\n[7/12] Testing /api/cron/automation without secret burst (15 requests, limit: 10/min)...');
  const t7 = await burst('/api/cron/automation', 15);
  console.log('  Status counts:', t7.statusCounts);
  console.log('  First 429 at request #:', t7.first429Index);
  report.cronAutomation = t7;

  // TEST 8: /api/webhooks/affiliate/generic - Limit: 100/min
  console.log('\n[8/12] Testing /api/webhooks/affiliate/generic unsigned (105 requests, limit: 100/min)...');
  const t8 = await burst('/api/webhooks/affiliate/generic', 105, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { test: true },
  });
  console.log('  Status counts:', t8.statusCounts);
  console.log('  First 429 at request #:', t8.first429Index);
  report.webhook = t8;

  // TEST 9: /go/[offerId] - Limit: 60/min
  console.log('\n[9/12] Testing /go/[offerId] (65 requests, limit: 60/min)...');
  const t9 = await burst('/go/00000000-0000-0000-0000-000000000000', 65);
  console.log('  Status counts:', t9.statusCounts);
  console.log('  First 429 at request #:', t9.first429Index);
  report.goRedirect = t9;

  // TEST 10: Admin unauthenticated routes rate limiting
  console.log('\n[10/12] Testing /api/admin/dashboard burst without admin auth (20 requests, limit: 15/min)...');
  const t10 = await burst('/api/admin/dashboard', 20);
  console.log('  Status counts:', t10.statusCounts);
  console.log('  First 429 at request #:', t10.first429Index);
  report.adminDashboard = t10;

  console.log('\n[10b/12] Testing /api/admin/export/products burst (10 requests, limit: 5/min)...');
  const t10b = await burst('/api/admin/export/products', 10);
  console.log('  Status counts:', t10b.statusCounts);
  console.log('  First 429 at request #:', t10b.first429Index);
  report.adminExport = t10b;

  console.log('\n[10c/12] Testing /api/admin/step-up burst (10 requests, limit: 5/min)...');
  const t10c = await burst('/api/admin/step-up', 10, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { password: 'wrong' },
  });
  console.log('  Status counts:', t10c.statusCounts);
  console.log('  First 429 at request #:', t10c.first429Index);
  report.adminStepUp = t10c;

  // TEST 11: Rate Limit Bypass & Header Spoofing Audit
  console.log('\n[11/12] Testing IP spoofing / bypass resistance...');
  const cfTest1 = await req('/api/facets', { headers: { 'cf-connecting-ip': '198.51.100.1' } });
  const cfTest2 = await req('/api/facets', { headers: { 'cf-connecting-ip': '198.51.100.2' } });
  console.log('  CF IP 1 Status:', cfTest1.status, '| CF IP 2 Status:', cfTest2.status);

  // TEST 12: Resource Exhaustion & Payload Limits
  console.log('\n[12/12] Testing Resource Exhaustion & Payload Limits...');

  // A. Oversized query on AI search (>300 chars)
  const longQuery = 'a'.repeat(350);
  const aiOversized = await req('/api/ai/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '198.51.100.10' },
    body: { query: longQuery },
  });
  console.log('  AI search query > 300 chars response:', aiOversized.status, aiOversized.body);

  // B. Malformed JSON on track view
  const malformedTrack = await req('/api/track/view', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '198.51.100.11' },
    body: '{ bad json',
  });
  console.log('  Malformed JSON on /api/track/view response:', malformedTrack.status);

  // C. Unauthenticated cron request
  const badCron = await req('/api/cron/automation', {
    headers: { 'authorization': 'Bearer fake-secret', 'cf-connecting-ip': '198.51.100.12' },
  });
  console.log('  Invalid CRON_SECRET response:', badCron.status, badCron.body);

  // D. Unsigned webhook request
  const unsignedWebhook = await req('/api/webhooks/affiliate/generic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '198.51.100.13' },
    body: { event: 'test' },
  });
  console.log('  Unsigned webhook response:', unsignedWebhook.status, unsignedWebhook.body);

  // E. products/by-ids with >20 IDs
  const manyIds = Array.from({ length: 30 }, (_, i) => `00000000-0000-0000-0000-0000000000${String(i).padStart(2, '0')}`).join(',');
  const byIdsLarge = await req(`/api/products/by-ids?ids=${manyIds}`, {
    headers: { 'cf-connecting-ip': '198.51.100.14' },
  });
  console.log('  products/by-ids with 30 IDs response status:', byIdsLarge.status, 'returned array length:', byIdsLarge.body?.products?.length);

  console.log('\n====================================================');
  console.log('            ALL RUNTIME TESTS COMPLETED             ');
  console.log('====================================================');
}

runTests().catch(console.error);

