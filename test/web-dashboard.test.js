const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

process.env.BOT_TOKEN = '123456:test-bot-token-for-session-signing';
process.env.NODE_ENV = 'production';
process.env.ADMIN_IDS = '2024984460';

const { createDashboardServer, approveTelegramLogin } = require('../lib/web-dashboard');

const dbPath = path.resolve('data/db.json');
let server;
let baseUrl;
let previousDb = null;

test.before(async () => {
  try { previousDb = await fs.readFile(dbPath); } catch (_) {}
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  await fs.writeFile(dbPath, JSON.stringify({
    users: { '2024984460': { id: '2024984460', username: 'TestAdmin', balance: 0 } },
    stats: { totalUsers: 1 }
  }));

  server = createDashboardServer({
    telegram: { getMe: async () => ({ username: 'TestAutoOrderBot' }) }
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
  assert.equal(page.headers.get('cache-control'), 'no-store, max-age=0');
  assert.match(await page.text(), /app\.js\?v=6/);

  const script = await fetch(`${baseUrl}/app.js?v=6`);
  assert.equal(script.status, 200);
  assert.equal(script.headers.get('cache-control'), 'no-store, max-age=0');

  const response = await fetch(`${baseUrl}/api/catalog`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.ok(Array.isArray(payload.products));
});

test('protects admin API and recognizes bot admin through Telegram deep-link', async () => {
  const denied = await fetch(`${baseUrl}/api/admin/overview`);
  assert.equal(denied.status, 401);

  const linkResponse = await fetch(`${baseUrl}/api/auth/telegram/link`, { method: 'POST' });
  assert.equal(linkResponse.status, 201);
  const challenge = await linkResponse.json();
  assert.match(challenge.url, /^https:\/\/t\.me\/TestAutoOrderBot\?start=web_/);

  assert.equal(approveTelegramLogin(challenge.token, {
    id: '2024984460', username: 'TestAdmin'
  }), true);

  const verify = await fetch(`${baseUrl}/api/auth/telegram/status?token=${challenge.token}`);
  assert.equal(verify.status, 200);
  assert.equal((await verify.clone().json()).role, 'admin');
  const setCookie = verify.headers.get('set-cookie');
  assert.doesNotMatch(setCookie, /; Secure/i, 'HTTP deployment must retain its login cookie');
  const cookie = setCookie.split(';')[0];

  const adminOrders = await fetch(`${baseUrl}/api/orders`, { headers: { cookie } });
  assert.equal(adminOrders.status, 200, 'admin session can also checkout as a customer');

  const overview = await fetch(`${baseUrl}/api/admin/overview`, { headers: { cookie } });
  assert.equal(overview.status, 200);
  const payload = await overview.json();
  assert.equal(typeof payload.stats.stock, 'number');
  assert.ok(Array.isArray(payload.transactions));

  const created = await fetch(`${baseUrl}/api/admin/products`, {
    method: 'POST', headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ code: 'webtest', name: 'Web Test', desc: 'Test', variants: [{ name: 'Basic', price: 1000 }] })
  });
  assert.equal(created.status, 201);
  const product = await created.json();

  const addStock = await fetch(`${baseUrl}/api/admin/stock`, {
    method: 'POST', headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ productId: product.id, variant: 'Basic', stock: 'one@example.com|secret' })
  });
  assert.equal(addStock.status, 200);
  const stockItems = await fetch(`${baseUrl}/api/admin/stock/items?productId=${product.id}&variant=Basic`, { headers: { cookie } });
  const items = (await stockItems.json()).items;
  assert.equal(items.length, 1);
  const deleteItem = await fetch(`${baseUrl}/api/admin/stock/item`, {
    method: 'DELETE', headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ productId: product.id, variant: 'Basic', key: items[0].key })
  });
  assert.equal(deleteItem.status, 200);

  const addVariant = await fetch(`${baseUrl}/api/admin/products/${product.id}/variants`, {
    method: 'POST', headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Pro', price: 2000 })
  });
  assert.equal(addVariant.status, 201);

  const removed = await fetch(`${baseUrl}/api/admin/products/${product.id}`, {
    method: 'DELETE', headers: { cookie }
  });
  assert.equal(removed.status, 200);
});

test('supports web registration and login without Telegram', async () => {
  const email = `web-${Date.now()}@example.com`;
  const register = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'correct-horse-battery', firstName: 'Web User' })
  });
  assert.equal(register.status, 201);
  const registerPayload = await register.json();
  assert.equal(registerPayload.user.email, email);
  const cookie = register.headers.get('set-cookie').split(';')[0];
  const orders = await fetch(`${baseUrl}/api/orders`, { headers: { cookie } });
  assert.equal(orders.status, 200);
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'correct-horse-battery' })
  });
  assert.equal(login.status, 200);
  const wrong = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'wrong-password' })
  });
  assert.equal(wrong.status, 401);
});

test('rejects checkout without any web or Telegram session', async () => {
  const response = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ productId: 1, variant: 'Test', qty: 1 })
  });
  assert.equal(response.status, 401);
});
