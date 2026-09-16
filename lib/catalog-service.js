const path = require('node:path');
const crypto = require('node:crypto');
const store = require('./mongo-store');

const PRODUCTS_PATH = path.resolve('data/products.json');
const TX_PATH = path.resolve('data/transactions.json');
const DB_PATH = path.resolve('data/db.json');
const FLASH_PATH = path.resolve('data/flashsales.json');
const STOCK_DIR = path.resolve('stok');

const array = (value) => Array.isArray(value) ? value : [];
const lower = (value) => String(value || '').trim().toLowerCase();

async function loadProducts() { return array(await store.readJson(PRODUCTS_PATH, [])); }
async function saveProducts(value) { return store.writeJson(PRODUCTS_PATH, value); }
async function loadTransactions() { return array(await store.readJson(TX_PATH, [])); }
async function loadUsers() {
  const db = await store.readJson(DB_PATH, { users: {}, stats: {} });
  return db && typeof db === 'object' ? db : { users: {}, stats: {} };
}

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

function publicWebUser(user) {
  return { id: String(user.id), username: user.username, email: user.email, firstName: user.first_name || '' };
}

async function createWebUser({ email, password, firstName }) {
  const normalizedEmail = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw Object.assign(new Error('Email tidak valid.'), { statusCode: 400 });
  if (String(password || '').length < 8) throw Object.assign(new Error('Password minimal 8 karakter.'), { statusCode: 400 });
  const db = await loadUsers();
  const existing = Object.values(db.users || {}).find((user) => normalizeEmail(user.email) === normalizedEmail);
  if (existing) throw Object.assign(new Error('Email sudah terdaftar.'), { statusCode: 409 });
  const id = `web_${crypto.randomBytes(12).toString('hex')}`;
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  const user = { id, email: normalizedEmail, username: normalizedEmail, first_name: String(firstName || '').trim() || normalizedEmail.split('@')[0], password_hash: passwordHash, password_salt: salt, balance: 0, source: 'web', created_at: new Date().toISOString() };
  db.users = db.users && typeof db.users === 'object' ? db.users : {};
  db.stats = db.stats && typeof db.stats === 'object' ? db.stats : {};
  db.users[id] = user;
  db.stats.totalUsers = Object.keys(db.users).length;
  await store.writeJson(DB_PATH, db);
  return publicWebUser(user);
}

async function authenticateWebUser({ email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const db = await loadUsers();
  const user = Object.values(db.users || {}).find((item) => normalizeEmail(item.email) === normalizedEmail && item.password_hash && item.password_salt);
  if (!user) return null;
  const actual = crypto.scryptSync(String(password || ''), user.password_salt, 64);
  const expected = Buffer.from(user.password_hash, 'hex');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  return publicWebUser(user);
}

function activeSale(sales, productId, variantName, now = Date.now()) {
  return array(sales)
    .filter((sale) => String(sale.productId) === String(productId)
      && lower(sale.variantName) === lower(variantName)
      && Number(sale.startAt) <= now && now <= Number(sale.endAt))
    .sort((a, b) => Number(a.price) - Number(b.price))[0] || null;
}

async function getCatalog() {
  const [products, transactions, sales] = await Promise.all([
    loadProducts(), loadTransactions(), store.readJson(FLASH_PATH, [])
  ]);
  const pending = transactions.filter((tx) => lower(tx.status) === 'pending');

  const result = [];
  for (const product of products) {
    const stockPath = path.join(STOCK_DIR, `${lower(product.code)}.json`);
    const stock = array(await store.readJson(stockPath, []));
    const variants = array(product.variants).map((variant) => {
      const realStock = stock.filter((item) => lower(item.varian) === lower(variant.name)).length;
      const reserved = pending
        .filter((tx) => String(tx.product_id) === String(product.id)
          && lower(tx.variant_name) === lower(variant.name))
        .reduce((sum, tx) => sum + Number(tx.qty || 0), 0);
      const sale = activeSale(sales, product.id, variant.name);
      return {
        name: variant.name,
        price: Number(variant.price || 0),
        finalPrice: sale ? Number(sale.price) : Number(variant.price || 0),
        onSale: Boolean(sale),
        stock: Math.max(0, realStock - reserved),
        realStock,
        reserved
      };
    });
    result.push({
      id: product.id,
      code: product.code,
      name: product.name,
      desc: product.desc || '',
      imageUrl: product.isImage && product.image_url !== '-' ? product.image_url : null,
      sold: Number(product.sold || 0),
      variants
    });
  }
  return result;
}

async function addStock({ productId, variantName, entries }) {
  const products = await loadProducts();
  const product = products.find((item) => String(item.id) === String(productId));
  if (!product) throw Object.assign(new Error('Produk tidak ditemukan.'), { statusCode: 404 });
  const variant = array(product.variants).find((item) => lower(item.name) === lower(variantName));
  if (!variant) throw Object.assign(new Error('Varian tidak ditemukan.'), { statusCode: 404 });

  const stockPath = path.join(STOCK_DIR, `${lower(product.code)}.json`);
  const stock = array(await store.readJson(stockPath, []));
  const existing = new Set(stock.map((item) => lower(item.email)));
  let count = stock.reduce((max, item) => Math.max(max, Number(item.emailCount || 0)), 0);
  const added = [];
  const duplicates = [];

  for (const raw of entries) {
    const email = String(raw.email || '').trim();
    const password = String(raw.password || '').trim();
    const note = String(raw.note || '').trim();
    if (!email || !password) continue;
    if (existing.has(lower(email))) {
      duplicates.push(email);
      continue;
    }
    count += 1;
    existing.add(lower(email));
    const item = {
      emailCount: String(count), varian: variant.name, email, password,
      twofa: note === '-' ? '' : note, addedAt: new Date().toISOString()
    };
    stock.push(item);
    added.push(email);
  }

  await store.writeJson(stockPath, stock);
  variant.stock = stock.filter((item) => lower(item.varian) === lower(variant.name)).length;
  await saveProducts(products);
  return { added: added.length, duplicates, stock: variant.stock, product: product.name, variant: variant.name };
}

async function createProduct({ code, name, desc, imageUrl, variants }) {
  const products = await loadProducts();
  const normalizedCode = lower(code);
  if (!normalizedCode || !String(name || '').trim()) throw Object.assign(new Error('Kode dan nama produk wajib diisi.'), { statusCode: 400 });
  if (products.some((item) => lower(item.code) === normalizedCode)) throw Object.assign(new Error('Kode produk sudah digunakan.'), { statusCode: 409 });
  const cleanVariants = array(variants).map((item) => ({ name: String(item.name || '').trim(), price: Number(item.price), stock: 0 }))
    .filter((item) => item.name && Number.isFinite(item.price) && item.price >= 0);
  if (!cleanVariants.length) throw Object.assign(new Error('Minimal satu varian valid diperlukan.'), { statusCode: 400 });
  const id = products.reduce((max, item) => Math.max(max, Number(item.id || 0)), 0) + 1;
  const product = {
    id, code: normalizedCode, name: String(name).trim(), desc: String(desc || '').trim(), sold: 0,
    isImage: Boolean(String(imageUrl || '').trim()), image_url: String(imageUrl || '').trim() || '-',
    variants: cleanVariants
  };
  products.push(product);
  await saveProducts(products);
  await store.writeJson(path.join(STOCK_DIR, `${normalizedCode}.json`), []);
  return product;
}

async function updateProduct(productId, changes) {
  const products = await loadProducts();
  const product = products.find((item) => String(item.id) === String(productId));
  if (!product) throw Object.assign(new Error('Produk tidak ditemukan.'), { statusCode: 404 });
  if (changes.name !== undefined) product.name = String(changes.name).trim() || product.name;
  if (changes.desc !== undefined) product.desc = String(changes.desc).trim();
  if (changes.imageUrl !== undefined) {
    product.image_url = String(changes.imageUrl || '').trim() || '-';
    product.isImage = product.image_url !== '-';
  }
  await saveProducts(products);
  return product;
}

async function deleteProduct(productId) {
  const products = await loadProducts();
  const index = products.findIndex((item) => String(item.id) === String(productId));
  if (index < 0) throw Object.assign(new Error('Produk tidak ditemukan.'), { statusCode: 404 });
  const [product] = products.splice(index, 1);
  await saveProducts(products);
  await store.deleteJson(path.join(STOCK_DIR, `${lower(product.code)}.json`));
  return product;
}

async function addVariant(productId, data) {
  const products = await loadProducts();
  const product = products.find((item) => String(item.id) === String(productId));
  if (!product) throw Object.assign(new Error('Produk tidak ditemukan.'), { statusCode: 404 });
  const name = String(data.name || '').trim();
  const price = Number(data.price);
  if (!name || !Number.isFinite(price) || price < 0) throw Object.assign(new Error('Nama dan harga varian tidak valid.'), { statusCode: 400 });
  if (array(product.variants).some((item) => lower(item.name) === lower(name))) throw Object.assign(new Error('Varian sudah tersedia.'), { statusCode: 409 });
  product.variants = array(product.variants);
  product.variants.push({ name, price, stock: 0 });
  await saveProducts(products);
  return product;
}

async function updateVariant(productId, oldName, data) {
  const products = await loadProducts();
  const product = products.find((item) => String(item.id) === String(productId));
  const variant = array(product?.variants).find((item) => lower(item.name) === lower(oldName));
  if (!product || !variant) throw Object.assign(new Error('Varian tidak ditemukan.'), { statusCode: 404 });
  const newName = String(data.name || variant.name).trim();
  const price = data.price === undefined ? Number(variant.price) : Number(data.price);
  if (!newName || !Number.isFinite(price) || price < 0) throw Object.assign(new Error('Data varian tidak valid.'), { statusCode: 400 });
  if (lower(newName) !== lower(variant.name) && product.variants.some((item) => lower(item.name) === lower(newName))) throw Object.assign(new Error('Nama varian sudah digunakan.'), { statusCode: 409 });
  const stockPath = path.join(STOCK_DIR, `${lower(product.code)}.json`);
  const stock = array(await store.readJson(stockPath, []));
  stock.forEach((item) => { if (lower(item.varian) === lower(variant.name)) item.varian = newName; });
  variant.name = newName;
  variant.price = price;
  await store.writeJson(stockPath, stock);
  await saveProducts(products);
  return product;
}

async function deleteVariant(productId, variantName) {
  const products = await loadProducts();
  const product = products.find((item) => String(item.id) === String(productId));
  if (!product) throw Object.assign(new Error('Produk tidak ditemukan.'), { statusCode: 404 });
  if (array(product.variants).length <= 1) throw Object.assign(new Error('Produk harus memiliki minimal satu varian.'), { statusCode: 409 });
  const before = product.variants.length;
  product.variants = product.variants.filter((item) => lower(item.name) !== lower(variantName));
  if (product.variants.length === before) throw Object.assign(new Error('Varian tidak ditemukan.'), { statusCode: 404 });
  const stockPath = path.join(STOCK_DIR, `${lower(product.code)}.json`);
  const stock = array(await store.readJson(stockPath, []));
  await store.writeJson(stockPath, stock.filter((item) => lower(item.varian) !== lower(variantName)));
  await saveProducts(products);
  return product;
}

async function getStockItems({ productId, variantName }) {
  const products = await loadProducts();
  const product = products.find((item) => String(item.id) === String(productId));
  const variant = array(product?.variants).find((item) => lower(item.name) === lower(variantName));
  if (!product || !variant) throw Object.assign(new Error('Produk atau varian tidak ditemukan.'), { statusCode: 404 });
  const stockPath = path.join(STOCK_DIR, `${lower(product.code)}.json`);
  const stock = array(await store.readJson(stockPath, []));
  return stock.filter((item) => lower(item.varian) === lower(variant.name)).map((item, index) => ({
    key: String(item.emailCount || `${index}-${item.email}`),
    email: item.email || '-', password: item.password || '-',
    note: item.twofa || item.note || item.extra || '', addedAt: item.addedAt || null
  }));
}

async function deleteStockItem({ productId, variantName, key }) {
  const products = await loadProducts();
  const product = products.find((item) => String(item.id) === String(productId));
  const variant = array(product?.variants).find((item) => lower(item.name) === lower(variantName));
  if (!product || !variant) throw Object.assign(new Error('Produk atau varian tidak ditemukan.'), { statusCode: 404 });
  const stockPath = path.join(STOCK_DIR, `${lower(product.code)}.json`);
  const stock = array(await store.readJson(stockPath, []));
  const index = stock.findIndex((item, itemIndex) =>
    lower(item.varian) === lower(variant.name) &&
    String(item.emailCount || `${itemIndex}-${item.email}`) === String(key)
  );
  if (index < 0) throw Object.assign(new Error('Stok tersebut tidak ditemukan.'), { statusCode: 404 });
  const [deleted] = stock.splice(index, 1);
  await store.writeJson(stockPath, stock);
  variant.stock = stock.filter((item) => lower(item.varian) === lower(variant.name)).length;
  await saveProducts(products);
  return { deleted: { key: String(key), email: deleted.email }, stock: variant.stock };
}

async function removeStock({ productId, variantName, qty }) {
  const products = await loadProducts();
  const product = products.find((item) => String(item.id) === String(productId));
  const variant = array(product?.variants).find((item) => lower(item.name) === lower(variantName));
  if (!product || !variant) throw Object.assign(new Error('Produk atau varian tidak ditemukan.'), { statusCode: 404 });
  const amount = Number(qty);
  if (!Number.isInteger(amount) || amount < 1) throw Object.assign(new Error('Jumlah stok tidak valid.'), { statusCode: 400 });
  const stockPath = path.join(STOCK_DIR, `${lower(product.code)}.json`);
  const stock = array(await store.readJson(stockPath, []));
  const available = stock.filter((item) => lower(item.varian) === lower(variant.name));
  if (amount > available.length) throw Object.assign(new Error(`Stok hanya tersedia ${available.length}.`), { statusCode: 409 });
  const removeSet = new Set(available.slice(0, amount));
  const remaining = stock.filter((item) => !removeSet.has(item));
  await store.writeJson(stockPath, remaining);
  variant.stock = remaining.filter((item) => lower(item.varian) === lower(variant.name)).length;
  await saveProducts(products);
  return { removed: amount, stock: variant.stock, product: product.name, variant: variant.name };
}

module.exports = {
  getCatalog, addStock, removeStock, getStockItems, deleteStockItem, loadTransactions, loadUsers, loadProducts,
  createWebUser, authenticateWebUser,
  createProduct, updateProduct, deleteProduct, addVariant, updateVariant, deleteVariant,
  paths: { PRODUCTS_PATH, TX_PATH, DB_PATH, STOCK_DIR }
};
