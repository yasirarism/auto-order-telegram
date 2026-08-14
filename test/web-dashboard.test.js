const test = require('node:test');
const assert = require('node:assert/strict');

process.env.WEB_ADMIN_TOKEN = 'test-admin-token';
process.env.WEB_SESSION_SECRET = 'test-session-secret-that-is-long-enough';

const { createDashboardServer } = require('../lib/web-dashboard');

let server;
let baseUrl;

test.before(async () => {
  server = createDashboardServer({ telegram: { sendMessage: async () => ({}) } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test('serves the storefront and public catalog', async () => {
  const page = await fetch(baseUrl);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Dashboard admin/);

  const response = await fetch(`${baseUrl}/api/catalog`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.ok(Array.isArray(payload.products));
});

test('protects admin API and accepts configured admin token', async () => {
  const denied = await fetch(`${baseUrl}/api/admin/overview`);
  assert.equal(denied.status, 401);

  const login = await fetch(`${baseUrl}/api/auth/admin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: 'test-admin-token' })
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];

  const overview = await fetch(`${baseUrl}/api/admin/overview`, { headers: { cookie } });
  assert.equal(overview.status, 200);
  const payload = await overview.json();
  assert.equal(typeof payload.stats.stock, 'number');
  assert.ok(Array.isArray(payload.transactions));
});

test('rejects checkout without Telegram session', async () => {
  const response = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ productId: 1, variant: 'Test', qty: 1 })
  });
  assert.equal(response.status, 401);
});
