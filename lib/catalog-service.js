const path = require('node:path');
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

module.exports = {
  getCatalog, addStock, loadTransactions, loadUsers, loadProducts,
  paths: { PRODUCTS_PATH, TX_PATH, DB_PATH, STOCK_DIR }
};
