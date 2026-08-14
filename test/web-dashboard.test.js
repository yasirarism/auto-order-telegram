const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

process.env.BOT_TOKEN = '123456:test-bot-token-for-session-signing';
process.env.ADMIN_IDS = '2024984460';

const { createDashboardServer } = require('../lib/web-dashboard');

const dbPath = path.resolve('data/db.json');
let server;
let baseUrl;
let previousDb = null;
let otpMessage = '';

test.before(async () => {
  try { previousDb = await fs.readFile(dbPath); } catch (_) {}
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  await fs.writeFile(dbPath, JSON.stringify({
    users: { '2024984460': { id: '2024984460', username: 'TestAdmin', balance: 0 } },
    stats: { totalUsers: 1 }
  }));

  server = createDashboardServer({
    telegram: { sendMessage: async (_userId, message) => { otpMessage = message; return {}; } }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  if (previousDb) await fs.writeFile(dbPath, previousDb);
  else await fs.rm(dbPath, { force: true });
});

test('serves the storefront, health check, and public catalog', async () => {
  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, 'ok');

  const page = await fetch(baseUrl);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Dashboard admin/);

  const response = await fetch(`${baseUrl}/api/catalog`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.ok(Array.isArray(payload.products));
});

test('protects admin API and recognizes bot admin through Telegram OTP', async () => {
  const denied = await fetch(`${baseUrl}/api/admin/overview`);
  assert.equal(denied.status, 401);

  const requestOtp = await fetch(`${baseUrl}/api/auth/telegram/request`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: '2024984460' })
  });
  assert.equal(requestOtp.status, 200);
  const code = otpMessage.match(/\b(\d{6})\b/)[1];

  const verify = await fetch(`${baseUrl}/api/auth/telegram/verify`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: '2024984460', code })
  });
  assert.equal(verify.status, 200);
  assert.equal((await verify.clone().json()).role, 'admin');
  const cookie = verify.headers.get('set-cookie').split(';')[0];

  const overview = await fetch(`${baseUrl}/api/admin/overview`, { headers: { cookie } });
  assert.equal(overview.status, 200);
  const payload = await overview.json();
  assert.equal(typeof payload.stats.stock, 'number');
  assert.ok(Array.isArray(payload.transactions));
});

test('rejects checkout without Telegram session', async () => {
  const response = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ productId: 1, variant: 'Test', qty: 1 })
  });
  assert.equal(response.status, 401);
});
