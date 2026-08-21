const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const Transactions = require('./transactions');
const Database = require('./database');
const QRIS = require('../utils/qr');
const catalog = require('./catalog-service');

const PUBLIC_DIR = path.resolve(__dirname, '../web');
const txDb = new Database('data/transactions.json');
const txHandler = new Transactions();
const loginChallenges = new Map();
let botUsernamePromise = null;
let writeQueue = Promise.resolve();

const json = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
};
const fail = (res, status, message) => json(res, status, { error: message });
const lower = (v) => String(v || '').toLowerCase();
const paid = (v) => ['paid', 'completed', 'success', 'sukses'].includes(lower(v));

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map((part) => {
    const i = part.indexOf('=');
    return i < 0 ? ['', ''] : [part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1))];
  }).filter(([key]) => key));
}

function signer(secret) {
  const sign = (value) => crypto.createHmac('sha256', secret).update(value).digest('base64url');
  return {
    create(payload) {
      const value = Buffer.from(JSON.stringify(payload)).toString('base64url');
      return `${value}.${sign(value)}`;
    },
    read(token) {
      try {
        const [value, signature] = String(token || '').split('.');
        const expected = sign(value);
        if (!signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
        const data = JSON.parse(Buffer.from(value, 'base64url').toString());
        return data.exp > Date.now() ? data : null;
      } catch (_) { return null; }
    }
  };
}

function setSession(req, res, auth, payload) {
  // NODE_ENV=production juga dipakai saat akses langsung via http://IP:3000.
  // Cookie Secure pada koneksi HTTP akan dibuang browser dan membuat user
  // terlihat logout lagi saat checkout. Aktifkan Secure hanya jika request
  // memang datang melalui HTTPS (langsung atau reverse proxy).
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const secure = req.socket.encrypted || forwardedProto === 'https' ? '; Secure' : '';
  const token = auth.create({ ...payload, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 });
  res.setHeader('Set-Cookie', `web_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${secure}`);
}

function clearSession(res) {
  res.setHeader('Set-Cookie', 'web_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
}

async function body(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1024 * 1024) throw Object.assign(new Error('Payload terlalu besar.'), { statusCode: 413 });
  }
  try { return raw ? JSON.parse(raw) : {}; }
  catch (_) { throw Object.assign(new Error('JSON tidak valid.'), { statusCode: 400 }); }
}

function enqueue(task) {
  const next = writeQueue.then(task, task);
  writeQueue = next.catch(() => {});
  return next;
}

function safeTx(tx, admin = false) {
  const item = {
    id: tx.id, referenceId: tx.reference_id || String(tx.id), productId: tx.product_id,
    product: tx.product || null, variant: tx.variant_name || tx.variant,
    qty: Number(tx.qty || 0), amount: Number(tx.total_amount ?? tx.total ?? tx.amount ?? 0),
    method: tx.method, status: tx.status, createdAt: tx.created_at || tx.timestamp,
    expiresAt: tx.expires_at || null, source: tx.source || 'telegram', username: tx.username || '-'
  };
  if (admin) item.userId = tx.user_id;
  if (!admin && lower(tx.status) === 'pending' && process.env.QR_STRING) {
    item.qrUrl = new QRIS(item.amount, process.env.QR_STRING).toURL();
  }
  return item;
}

async function serveStatic(req, res, pathname) {
  const names = { '/': 'index.html', '/app.js': 'app.js', '/styles.css': 'styles.css' };
  const name = names[pathname];
  if (!name) return false;
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
  const data = await fs.readFile(path.join(PUBLIC_DIR, name));
  // HTML, JS, dan CSS harus selalu satu versi. Cache lama pernah membuat HTML
  // terbaru memuat app.js lama sehingga seluruh tombol dan katalog berhenti.
  res.writeHead(200, { 'Content-Type': types[path.extname(name)], 'Cache-Control': 'no-store, max-age=0' });
  res.end(data);
  return true;
}

function isTelegramAdmin(userId, username) {
  try {
    const settingsPath = path.resolve(process.cwd(), 'settings.js');
    delete require.cache[require.resolve(settingsPath)];
    const settings = require(settingsPath);
    const normalizedUsername = String(username || '').replace('@', '').toLowerCase();
    return (settings.admins || []).some((admin) =>
      (admin?.id && String(admin.id) === String(userId)) ||
      (admin?.username && admin.username.replace('@', '').toLowerCase() === normalizedUsername)
    );
  } catch (_) {
    return false;
  }
}

function approveTelegramLogin(token, telegramUser) {
  const challenge = loginChallenges.get(String(token || ''));
  if (!challenge || challenge.expires < Date.now() || challenge.user) return false;
  challenge.user = {
    userId: String(telegramUser.id),
    username: telegramUser.username || telegramUser.first_name || String(telegramUser.id)
  };
  return true;
}

async function getBotUsername(bot) {
  if (!botUsernamePromise) {
    botUsernamePromise = bot.telegram.getMe().then((me) => me.username).catch((error) => {
      botUsernamePromise = null;
      throw error;
    });
  }
  return botUsernamePromise;
}

function createDashboardServer(bot) {
  // BOT_TOKEN sudah wajib untuk menjalankan bot, jadi tidak perlu ENV secret web terpisah.
  const secret = process.env.BOT_TOKEN || crypto.randomBytes(32).toString('hex');
  const auth = signer(secret);

  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https: data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'");
    const url = new URL(req.url, 'http://localhost');
    const session = auth.read(parseCookies(req).web_session);

    try {
      if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/api/health')) {
        return json(res, 200, { status: 'ok', service: 'auto-order-web' });
      }
      if (!url.pathname.startsWith('/api/')) {
        if (await serveStatic(req, res, url.pathname)) return;
        return fail(res, 404, 'Halaman tidak ditemukan.');
      }

      if (req.method === 'GET' && url.pathname === '/api/config') {
        return json(res, 200, {
          storeName: process.env.STORE_NICKNAME || process.env.STORE_NAME || 'Auto Order',
          auth: session ? { role: session.role, userId: session.userId, username: session.username } : null
        });
      }
      if (req.method === 'GET' && url.pathname === '/api/catalog') {
        return json(res, 200, { products: await catalog.getCatalog(), updatedAt: Date.now() });
      }
      if (req.method === 'POST' && url.pathname === '/api/auth/register') {
        const input = await body(req);
        const user = await catalog.createWebUser(input);
        setSession(req, res, auth, { role: 'user', userId: user.id, username: user.username, email: user.email });
        return json(res, 201, { user });
      }
      if (req.method === 'POST' && url.pathname === '/api/auth/login') {
        const input = await body(req);
        const user = await catalog.authenticateWebUser(input);
        if (!user) return fail(res, 401, 'Email atau password salah.');
        setSession(req, res, auth, { role: 'user', userId: user.id, username: user.username, email: user.email });
        return json(res, 200, { user });
      }
      if (req.method === 'POST' && url.pathname === '/api/auth/telegram/link') {
        const username = await getBotUsername(bot);
        const token = crypto.randomBytes(24).toString('base64url');
        const now = Date.now();
        for (const [key, item] of loginChallenges) {
          if (item.expires < now) loginChallenges.delete(key);
        }
        loginChallenges.set(token, { expires: now + 5 * 60 * 1000, user: null });
        return json(res, 201, {
          token,
          url: `https://t.me/${username}?start=web_${token}`,
          expiresAt: now + 5 * 60 * 1000
        });
      }
      if (req.method === 'GET' && url.pathname === '/api/auth/telegram/status') {
        const token = String(url.searchParams.get('token') || '');
        const challenge = loginChallenges.get(token);
        if (!challenge || challenge.expires < Date.now()) {
          loginChallenges.delete(token);
          return fail(res, 410, 'Link login sudah kedaluwarsa.');
        }
        if (!challenge.user) return json(res, 202, { status: 'pending' });
        const { userId, username } = challenge.user;
        const role = isTelegramAdmin(userId, username) ? 'admin' : 'user';
        setSession(req, res, auth, { role, userId, username });
        loginChallenges.delete(token);
        return json(res, 200, { status: 'approved', role });
      }
      if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
        clearSession(res); return json(res, 200, { ok: true });
      }

      if (req.method === 'GET' && url.pathname === '/api/orders') {
        if (!session || !['user', 'admin'].includes(session.role)) return fail(res, 401, 'Silakan login terlebih dahulu.');
        const transactions = await catalog.loadTransactions();
        return json(res, 200, { orders: transactions.filter((tx) => String(tx.user_id) === session.userId && tx.source === 'web').slice(-20).reverse().map((tx) => safeTx(tx)) });
      }
      if (req.method === 'POST' && url.pathname === '/api/orders') {
        if (!session || !['user', 'admin'].includes(session.role)) return fail(res, 401, 'Silakan login terlebih dahulu.');
        if (!process.env.QR_STRING) return fail(res, 503, 'QRIS belum dikonfigurasi oleh admin.');
        const input = await body(req);
        const qty = Number(input.qty);
        if (!Number.isInteger(qty) || qty < 1 || qty > 20) return fail(res, 400, 'Jumlah order harus 1–20.');
        const result = await enqueue(async () => {
          const allTx = await catalog.loadTransactions();
          if (allTx.some((tx) => String(tx.user_id) === session.userId && lower(tx.status) === 'pending')) {
            throw Object.assign(new Error('Selesaikan atau tunggu order pending sebelumnya.'), { statusCode: 409 });
          }
          const products = await catalog.getCatalog();
          const product = products.find((item) => String(item.id) === String(input.productId));
          const variant = product?.variants.find((item) => lower(item.name) === lower(input.variant));
          if (!product || !variant) throw Object.assign(new Error('Produk atau varian tidak ditemukan.'), { statusCode: 404 });
          if (variant.stock < qty) throw Object.assign(new Error('Stok tidak mencukupi.'), { statusCode: 409 });
          const total = variant.finalPrice * qty;
          const webOrderToken = crypto.randomBytes(16).toString('hex');
          const created = await txHandler.create(session.userId, session.username, product.id, variant.name, total, qty, { source: 'web', webOrderToken });
          return { ...created, product: product.name, variant: variant.name, qty, expiresAt: Date.now() + Number(process.env.PAYMENT_EXPIRES_MINUTES || 15) * 60000 };
        });
        return json(res, 201, result);
      }
      if (req.method === 'POST' && /^\/api\/orders\/[^/]+\/cancel$/.test(url.pathname)) {
        if (!session || !['user', 'admin'].includes(session.role)) return fail(res, 401, 'Silakan login.');
        const id = decodeURIComponent(url.pathname.split('/')[3]);
        const transaction = await txDb.findById(Number(id));
        if (!transaction || String(transaction.user_id) !== session.userId || transaction.source !== 'web') return fail(res, 404, 'Order tidak ditemukan.');
        if (lower(transaction.status) !== 'pending') return fail(res, 409, 'Order ini sudah tidak dapat dibatalkan.');
        await txDb.update(transaction.id, { ...transaction, status: 'canceled', canceled_at: new Date().toISOString() });
        return json(res, 200, { ok: true });
      }

      if (req.method === 'GET' && url.pathname === '/api/admin/overview') {
        if (!session || session.role !== 'admin') return fail(res, 401, 'Login admin diperlukan.');
        const [products, transactions, db] = await Promise.all([catalog.getCatalog(), catalog.loadTransactions(), catalog.loadUsers()]);
        const revenue = transactions.filter((tx) => paid(tx.status)).reduce((sum, tx) => sum + Number(tx.total_amount ?? tx.total ?? tx.amount ?? 0), 0);
        return json(res, 200, {
          stats: { products: products.length, stock: products.flatMap((p) => p.variants).reduce((s, v) => s + v.realStock, 0), users: Object.keys(db.users || {}).length, revenue },
          products, transactions: transactions.slice(-50).reverse().map((tx) => safeTx(tx, true))
        });
      }
      if (req.method === 'GET' && url.pathname === '/api/admin/stock/items') {
        if (!session || session.role !== 'admin') return fail(res, 401, 'Login admin diperlukan.');
        return json(res, 200, { items: await catalog.getStockItems({
          productId: url.searchParams.get('productId'), variantName: url.searchParams.get('variant')
        }) });
      }
      if (req.method === 'DELETE' && url.pathname === '/api/admin/stock/item') {
        if (!session || session.role !== 'admin') return fail(res, 401, 'Login admin diperlukan.');
        const input = await body(req);
        return json(res, 200, await enqueue(() => catalog.deleteStockItem({
          productId: input.productId, variantName: input.variant, key: input.key
        })));
      }
      if (req.method === 'POST' && url.pathname === '/api/admin/stock') {
        if (!session || session.role !== 'admin') return fail(res, 401, 'Login admin diperlukan.');
        const input = await body(req);
        const lines = String(input.stock || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        if (!lines.length || lines.length > 500) return fail(res, 400, 'Isi 1–500 baris stok.');
        const entries = lines.map((line) => {
          const [email, password, ...note] = line.split('|').map((part) => part.trim());
          return { email, password, note: note.join('|') };
        });
        if (entries.some((item) => !item.email || !item.password)) return fail(res, 400, 'Format setiap baris: email|password|catatan (opsional).');
        return json(res, 200, await enqueue(() => catalog.addStock({ productId: input.productId, variantName: input.variant, entries })));
      }
      if (req.method === 'DELETE' && url.pathname === '/api/admin/stock') {
        if (!session || session.role !== 'admin') return fail(res, 401, 'Login admin diperlukan.');
        const input = await body(req);
        return json(res, 200, await enqueue(() => catalog.removeStock({ productId: input.productId, variantName: input.variant, qty: input.qty })));
      }
      if (req.method === 'POST' && url.pathname === '/api/admin/products') {
        if (!session || session.role !== 'admin') return fail(res, 401, 'Login admin diperlukan.');
        const input = await body(req);
        return json(res, 201, await enqueue(() => catalog.createProduct(input)));
      }
      const productMatch = url.pathname.match(/^\/api\/admin\/products\/([^/]+)$/);
      if (productMatch && ['PUT', 'DELETE'].includes(req.method)) {
        if (!session || session.role !== 'admin') return fail(res, 401, 'Login admin diperlukan.');
        const productId = decodeURIComponent(productMatch[1]);
        if (req.method === 'PUT') {
          const input = await body(req);
          return json(res, 200, await enqueue(() => catalog.updateProduct(productId, input)));
        }
        return json(res, 200, await enqueue(() => catalog.deleteProduct(productId)));
      }
      const variantMatch = url.pathname.match(/^\/api\/admin\/products\/([^/]+)\/variants$/);
      if (variantMatch && req.method === 'POST') {
        if (!session || session.role !== 'admin') return fail(res, 401, 'Login admin diperlukan.');
        const input = await body(req);
        return json(res, 201, await enqueue(() => catalog.addVariant(decodeURIComponent(variantMatch[1]), input)));
      }
      const variantItemMatch = url.pathname.match(/^\/api\/admin\/products\/([^/]+)\/variants\/([^/]+)$/);
      if (variantItemMatch && ['PUT', 'DELETE'].includes(req.method)) {
        if (!session || session.role !== 'admin') return fail(res, 401, 'Login admin diperlukan.');
        const productId = decodeURIComponent(variantItemMatch[1]);
        const variantName = decodeURIComponent(variantItemMatch[2]);
        if (req.method === 'PUT') {
          const input = await body(req);
          return json(res, 200, await enqueue(() => catalog.updateVariant(productId, variantName, input)));
        }
        return json(res, 200, await enqueue(() => catalog.deleteVariant(productId, variantName)));
      }
      return fail(res, 404, 'API tidak ditemukan.');
    } catch (error) {
      console.error('[web-dashboard]', error);
      return fail(res, error.statusCode || 500, error.statusCode ? error.message : 'Terjadi kesalahan di server.');
    }
  });
}

function startDashboard(bot) {
  const port = Number(process.env.PORT || 3000);
  const server = createDashboardServer(bot);
  server.listen(port, '0.0.0.0', () => console.log(`🌐 Web dashboard aktif di port ${port}`));
  return server;
}

module.exports = { createDashboardServer, startDashboard, approveTelegramLogin };
