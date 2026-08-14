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
const otpStore = new Map();
const requestLog = new Map();
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

function setSession(res, auth, payload) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
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

function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const recent = (requestLog.get(key) || []).filter((time) => time > now - windowMs);
  recent.push(now);
  requestLog.set(key, recent);
  return recent.length <= limit;
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
  res.writeHead(200, { 'Content-Type': types[path.extname(name)], 'Cache-Control': name === 'index.html' ? 'no-cache' : 'public, max-age=3600' });
  res.end(data);
  return true;
}

function isTelegramAdmin(userId) {
  try {
    const settingsPath = path.resolve(process.cwd(), 'settings.js');
    delete require.cache[require.resolve(settingsPath)];
    const settings = require(settingsPath);
    return (settings.admins || []).some((admin) => admin?.id && String(admin.id) === String(userId));
  } catch (_) {
    return false;
  }
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
      if (req.method === 'POST' && url.pathname === '/api/auth/telegram/request') {
        const input = await body(req);
        const userId = String(input.userId || '').trim();
        const ip = req.socket.remoteAddress || 'unknown';
        if (!/^\d{5,20}$/.test(userId)) return fail(res, 400, 'ID Telegram tidak valid.');
        if (!rateLimit(`otp:${ip}`, 5, 15 * 60 * 1000)) return fail(res, 429, 'Terlalu banyak percobaan. Coba lagi nanti.');
        const db = await catalog.loadUsers();
        const user = db.users?.[userId];
        if (!user) return fail(res, 404, 'Akun belum terdaftar. Buka bot Telegram lalu kirim /start.');
        const code = String(crypto.randomInt(100000, 1000000));
        otpStore.set(userId, { hash: crypto.createHash('sha256').update(code).digest('hex'), expires: Date.now() + 5 * 60 * 1000, attempts: 0 });
        try {
          await bot.telegram.sendMessage(userId, `🔐 Kode login web kamu: ${code}\n\nBerlaku 5 menit. Jangan berikan kode ini kepada siapa pun.`);
        } catch (_) { return fail(res, 502, 'Kode gagal dikirim. Pastikan bot tidak diblokir.'); }
        return json(res, 200, { message: 'Kode dikirim ke Telegram.' });
      }
      if (req.method === 'POST' && url.pathname === '/api/auth/telegram/verify') {
        const input = await body(req);
        const userId = String(input.userId || '').trim();
        const record = otpStore.get(userId);
        if (!record || record.expires < Date.now() || record.attempts >= 5) return fail(res, 401, 'Kode sudah kedaluwarsa. Minta kode baru.');
        record.attempts += 1;
        const hash = crypto.createHash('sha256').update(String(input.code || '')).digest('hex');
        if (hash !== record.hash) return fail(res, 401, 'Kode OTP salah.');
        otpStore.delete(userId);
        const db = await catalog.loadUsers();
        const user = db.users?.[userId];
        const role = isTelegramAdmin(userId) ? 'admin' : 'user';
        setSession(res, auth, { role, userId, username: user?.username || user?.first_name || userId });
        return json(res, 200, { ok: true, role });
      }
      if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
        clearSession(res); return json(res, 200, { ok: true });
      }

      if (req.method === 'GET' && url.pathname === '/api/orders') {
        if (!session || session.role !== 'user') return fail(res, 401, 'Silakan login dengan Telegram.');
        const transactions = await catalog.loadTransactions();
        return json(res, 200, { orders: transactions.filter((tx) => String(tx.user_id) === session.userId && tx.source === 'web').slice(-20).reverse().map((tx) => safeTx(tx)) });
      }
      if (req.method === 'POST' && url.pathname === '/api/orders') {
        if (!session || session.role !== 'user') return fail(res, 401, 'Silakan login dengan Telegram.');
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
        if (!session || session.role !== 'user') return fail(res, 401, 'Silakan login.');
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

module.exports = { createDashboardServer, startDashboard };
