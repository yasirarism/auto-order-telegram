// sphynix.js — Bot Telegram Version (1.5) by Sphynixstore
// AUTHOR : @rahmadyxz
// Instagram : @rahmadyxz
// Github : @rahmadyxz
// YouTube : @rahmadyxz

// THIS CODE IS FULL GENERATE.
// AUTHOR / System Logic Thinker ( @rahmadyxz )
// DONT REUPLOAD THIS CODE WITHOUT PERMISSION

// PAYMENT GATEWAY : GOPAY (GOBIZ)
// INTEGRATION BY : ( AKANE CHIWA >.< )
// Github : @aiprojectchiwa
// Instagram : @akane_chiwa

//RECODE BY : @neilssen

// NOTE : MAU RECODE? BOLEH! TAPI JANGAN HAPUS CREDIT DIATAS!!!
// NOTE : JANGAN RECODE JIKA MASIH DALAM MASA GARANSI BUG / ERROR!!!
// NOTE : JANGAN RECODE JIKA TIDAK PAHAM!!!
const { buildFramedQris } = require("./utils/qrisFrame");
const { isQrisFrameOn } = require("./lib/config");
const { sendPaymentAnnouncement, maskUserId } = require("./utils/paymentCard");
const { CUSTOM_EMOJI, ce, ceRich, ceCaption, applyCustomEmoji, cleanButtonLabel, callbackButton, urlButton, keyboardButton, inlineButton, withCustomEmoji } = require("./utils/customEmoji");
const { buildRichMessage, richTable, richDetails, toRichHtml, richToFallbackHtml, sendRichMessageSafe, editRichMessageSafe } = require("./utils/richMessage");
const CE = (name, fallback) => ce(name, fallback);
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
const Transactions = require("./lib/transactions");
const txHandler = new Transactions();
const Database = require("./lib/database");
const store = require("./lib/mongo-store");
const { getDb, isMongoEnabled } = require("./lib/mongo");
const { createSessionStore } = require("./lib/mongo-session-store");
const tx = new Database("data/transactions.json");
const logger = require("./utils/logger");
const settingsPath = path.resolve('settings.js');
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const tz = require("dayjs/plugin/timezone");
const { ValidateTransactions, sendOrderLogToChannel } = require("./lib/handler/transactions");
dayjs.extend(utc);
dayjs.extend(tz);
dayjs.tz.setDefault(process.env.TZ || "Asia/Jakarta");

const STORE_NICKNAME = process.env.STORE_NICKNAME || "SEN PRO";
const PAYMENT_GATEWAY_LABEL = process.env.PAYMENT_GATEWAY_LABEL || "YSPAY";
const normalizeChannelId = (value) => {
  if (value === undefined || value === null) return null;
  let raw = String(value).trim();
  if (!raw) return null;
  raw = raw.replace(/^['"]|['"]$/g, "").trim();
  return raw || null;
};
const CHANNEL_TARGET = normalizeChannelId(process.env.CHANNEL_TARGET);

// ==== Helpers waktu berbasis ENV TZ ====
const APP_TZ = process.env.TZ || "Asia/Jakarta";

const resolveAssetPath = (envKey, fallbackRel) => {
  const raw = String(process.env[envKey] || "").trim();
  if (raw) return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  return path.resolve(__dirname, fallbackRel);
};

const INFO_BANNER_PATH = resolveAssetPath("INFO_BANNER_PATH", "assets/info.jpg");
const CANCELED_BANNER_PATH = resolveAssetPath("CANCELED_BANNER_PATH", "assets/canceled.jpg");

// Label zona untuk tampilan (WIB/WITA/WIT) + fallback ke UTC±offset untuk zona lain
const tzLabel = (zone = APP_TZ) => {
  if (zone === "Asia/Jakarta")  return "WIB";   // UTC+7
  if (zone === "Asia/Makassar") return "WITA";  // UTC+8
  if (zone === "Asia/Jayapura") return "WIT";   // UTC+9
  return `UTC${dayjs().tz(zone).format("Z")}`;  // contoh: UTC+07:00
};

const nowTZ    = () => dayjs().tz(APP_TZ);
const fmtFull  = (d = nowTZ()) => d.format("dddd, DD MMMM YYYY HH:mm:ss"); // untuk /start, PM, dsb
const fmtShort = (d = nowTZ()) => `${d.format("HH.mm.ss")} ${tzLabel()}`;  // untuk "Refresh at"
const fmtDate  = (d = nowTZ()) => d.format("DD MMMM YYYY");
const fmtTime  = (d = nowTZ()) => `${d.format("HH:mm:ss")} ${tzLabel()}`;
const greetingByHour = (d = nowTZ()) => {
  const hour = d.hour();
  if (hour >= 4 && hour < 11) return "pagi";
  if (hour >= 11 && hour < 15) return "siang";
  if (hour >= 15 && hour < 19) return "sore";
  return "malam";
};

const CronRegistry = require("./lib/cron");
const CornService = new CronRegistry()

const trx = txHandler;

// === ⚙️ PATCH DYNAMIC SETTINGS (ANTI CACHE) ===
function getSettings() {
  try {
    delete require.cache[require.resolve("./settings")];
    return require("./settings");
  } catch (err) {
    console.error("❌ Gagal load settings.js:", err);
    return { info: { BOT_NAME: "Bot Tanpa Nama", AUTHOR: "Anonim" }, admins: [], izin: { allowUserCekSnk: false } };
  }
}

function getAdminContactLabel() {
  const settings = getSettings();
  const admins = settings.admins || [];
  const admin = admins.find((a) => a?.username) || admins[0];
  if (admin?.username) return `@${String(admin.username).replace("@", "")}`;
  if (admin?.id) return String(admin.id);
  return "admin";
}

const sessions = new Map();
const broadcastSessions = new Map();

function getBroadcastKey(ctx) {
  const uid = ctx.from?.id || ctx.callbackQuery?.from?.id;
  const cid = ctx.chat?.id || ctx.callbackQuery?.message?.chat?.id;
  if (!uid || !cid) return null;
  return `${uid}:${cid}`;
}

function setBroadcastSession(ctx, data) {
  const key = getBroadcastKey(ctx);
  if (key) broadcastSessions.set(key, data);
  ctx.session ??= {};
  ctx.session.broadcast = data;
}

function getBroadcastSession(ctx) {
  const key = getBroadcastKey(ctx);
  return ctx.session?.broadcast || (key ? broadcastSessions.get(key) : null);
}

function clearBroadcastSession(ctx) {
  const key = getBroadcastKey(ctx);
  if (key) broadcastSessions.delete(key);
  if (ctx.session?.broadcast) delete ctx.session.broadcast;
}

// === 👑 isAdmin Dinamis (pakai settings terbaru tiap kali dipanggil)
function isAdmin(chatIdOrUsername) {
  const settings = getSettings();
  const admins = settings.admins || [];
  const normalized = String(chatIdOrUsername).replace("@", "").toLowerCase();

  return admins.some(
    (a) =>
      (a.id && String(a.id) === normalized) ||
      (a.username && a.username.toLowerCase() === normalized)
  );
}

// === 👑 UNIVERSAL ADMIN CHECKER (Auto-sync ke settings.js) ===
function isAdminNow(ctx) {
  try {
    const settings = getSettings();
    const admins = settings.admins || [];
    const chatId = String(ctx.from?.id || ctx.chat?.id || "").trim();
    const username = String(ctx.from?.username || "").toLowerCase();

    return admins.some(
      (a) =>
        (a.id && String(a.id) === chatId) ||
        (a.username && a.username.toLowerCase() === username)
    );
  } catch (err) {
    console.error("❌ Error cek admin:", err);
    return false;
  }
}

// 🧩 TIANG HANDLER ADDPRODUK
const productPath = path.join(__dirname, "data", "products.json");

async function loadProducts() {
  return readJson(productPath, []);
}

async function saveProducts(products) {
  await writeJson(productPath, products);
}

// 🧩 grammY framework & compatibility shims
const { Bot, Api, session, InputFile, Markup, setupBotCompatibility } = require("./lib/grammy-compat");
const Telegraf = Bot;

// === ⚙️ INISIALISASI INFO BOT (AUTO-LOAD DARI settings.js)
const info = getSettings().info || {};
const BOT_NAME = info.BOT_NAME || "Bot Tanpa Nama";
const AUTHOR = info.AUTHOR || "Anonim";

console.log(`🚀 ${BOT_NAME} by ${AUTHOR} siap dijalankan...`);

// === ⚙️ UTIL / HELPER (SINGLE SOURCE) ===
function esc(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function rupiah(n = 0) {
  return new Intl.NumberFormat("id-ID").format(n);
}

const FLASH_SALE_PATH = path.resolve(__dirname, "data/flashsales.json");

async function loadFlashSales() {
  try {
    const data = await readJson(FLASH_SALE_PATH, []);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("⚠️ Gagal baca flashsales.json:", e.message);
    return [];
  }
}

async function saveFlashSales(flashSales) {
  try {
    await writeJson(FLASH_SALE_PATH, flashSales);
  } catch (e) {
    console.error("⚠️ Gagal simpan flashsales.json:", e.message);
  }
}

function normalizeVariantName(value = "") {
  return String(value || "").trim().toLowerCase();
}

function parseFlashSaleTime(value) {
  const parsed = dayjs.tz(String(value || "").trim(), "YYYY-MM-DD HH:mm", APP_TZ);
  if (!parsed.isValid()) return null;
  return parsed.valueOf();
}

function calcDiscountPercent(basePrice, salePrice) {
  const base = Number(basePrice);
  const sale = Number(salePrice);
  if (!Number.isFinite(base) || base <= 0) return 0;
  if (!Number.isFinite(sale) || sale < 0 || sale >= base) return 0;
  return Math.round((1 - sale / base) * 100);
}

function getActiveFlashSale(flashSales, productId, variantName, now = nowTZ()) {
  const pid = String(productId ?? "");
  const vname = normalizeVariantName(variantName);
  const nowMs = now.valueOf();
  const matches = (flashSales || []).filter(
    (sale) =>
      String(sale.productId ?? "") === pid &&
      normalizeVariantName(sale.variantName) === vname &&
      Number(sale.startAt) <= nowMs &&
      nowMs <= Number(sale.endAt)
  );
  if (!matches.length) return null;
  return matches.reduce((best, item) => {
    const bestPrice = Number(best.price);
    const nextPrice = Number(item.price);
    if (!Number.isFinite(bestPrice)) return item;
    if (Number.isFinite(nextPrice) && nextPrice < bestPrice) return item;
    return best;
  }, matches[0]);
}

function getFlashSaleInfo(flashSales, product, variant, now = nowTZ()) {
  const basePrice = Number(variant?.price || 0);
  const activeSale = getActiveFlashSale(
    flashSales,
    product?.id,
    variant?.name,
    now
  );
  if (!activeSale) {
    return { active: false, price: basePrice, discountPercent: 0 };
  }
  const salePrice = Number(activeSale.price);
  const discountPercent = calcDiscountPercent(basePrice, salePrice);
  return {
    active: Number.isFinite(salePrice),
    price: Number.isFinite(salePrice) ? salePrice : basePrice,
    discountPercent,
    startAt: activeSale.startAt,
    endAt: activeSale.endAt,
  };
}

function formatPriceHtml(basePrice, flashSaleInfo) {
  const base = Number(basePrice || 0);
  if (!flashSaleInfo?.active) return `Rp ${rupiah(base)}`;
  const discounted = Number(flashSaleInfo.price);
  const percent = flashSaleInfo.discountPercent || 0;
  const percentLabel = percent > 0 ? ` (-${percent}%)` : "";
  return `Rp ${rupiah(discounted)} <s>Rp ${rupiah(base)}</s>${percentLabel}`;
}

function formatPriceButton(basePrice, flashSaleInfo) {
  const base = Number(basePrice || 0);
  if (!flashSaleInfo?.active) return `Rp ${rupiah(base)}`;
  const discounted = Number(flashSaleInfo.price);
  return `Rp ${rupiah(discounted)}🔥`;
}

function getProductFlashSaleBadge(flashSales, product, now = nowTZ()) {
  const infos = (product?.variants || [])
    .map((variant) => getFlashSaleInfo(flashSales, product, variant, now))
    .filter((info) => info.active && info.discountPercent > 0);
  if (!infos.length) return null;
  const maxDiscount = Math.max(...infos.map((info) => info.discountPercent));
  return `Flash Sale ${maxDiscount}%`;
}

function saldoLabel(balance = 0) {
  return `Saldo: Rp ${rupiah(balance)}`;
}

function buildOrderConfirmationCard(product, variant, flashInfo, quantity, nowMoment = nowTZ()) {
  const total = Number(flashInfo.price) * quantity;
  const title = flashInfo.active ? "KONFIRMASI FLASH SALE" : "KONFIRMASI PESANAN";
  const orderTable = richTable(
    ["Detail Pesanan", "Nilai"],
    [
      ["Produk", esc(product.name || "-")],
      ["Varian", esc(variant.name || "-")],
      ["Harga Satuan", formatPriceHtml(variant.price, flashInfo)],
      ["Stok Tersedia", String(variant.stock ?? 0)],
      ["Jumlah Pesanan", `x${quantity}`],
      ["Total Pembayaran", `Rp ${rupiah(total)}`],
    ],
    { bordered: true, striped: true, compact: true }
  );
  return [
    `<b>${title}</b>`,
    orderTable,
    `${ce("refresh", "🔄")} <i>Refresh at ${nowMoment.format(`HH.mm.ss [${tzLabel()}]`)}</i>`,
  ].join("\n");
}

function buildPaymentConfirmationCard(product, variant, quantity, total, balance = null, prompt = "") {
  const rows = [
    ["Produk", esc(product.name || "-")],
    ["Varian", esc(variant.name || "-")],
    ["Jumlah Pesanan", `x${quantity}`],
    ["Total Bayar", `Rp ${rupiah(total)}`],
  ];
  if (balance !== null) rows.push(["Saldo Kamu", `Rp ${rupiah(balance)}`]);
  return [
    `<h2>Konfirmasi Pembayaran</h2>`,
    richTable(["Detail Pembayaran", "Nilai"], rows, { bordered: true, striped: true, compact: true }),
    prompt,
  ].filter(Boolean).join("\n");
}

function buildProductCard(product, flashSales, nowMoment = nowTZ(), tag = "Refresh") {
  const now = nowMoment.format(`HH.mm.ss [${tzLabel()}]`);
  const flashSaleBadge = getProductFlashSaleBadge(flashSales, product, nowMoment);

  const variantTableRows = (product.variants || []).map((v) => {
    const flashInfo = getFlashSaleInfo(flashSales, product, v, nowMoment);
    const priceText = formatPriceHtml(v.price, flashInfo);
    const stockText = v.stock > 0 ? `${v.stock}` : "Habis";
    return [esc(v.name), priceText, stockText];
  });
  const variantTableHtml = richTable(["Varian", "Harga", "Stok"], variantTableRows, { bordered: true, striped: true, compact: true });

  const productInfoTable = richTable(
    ["Informasi Produk", "Detail"],
    [
      [esc("Nama Produk"), esc(product.name || "-")],
      [esc("Stok Terjual"), String(Number(product.sold || 0))],
      [esc("Deskripsi"), esc(product.desc || "-")],
    ],
    { bordered: true, striped: true, compact: true }
  );

  const text = [
    flashSaleBadge ? `${ce("fire", "🔥")} <b>${flashSaleBadge}</b>` : null,
    `<b>${STORE_NICKNAME} PREMIUM APPS</b>`,
    productInfoTable,
    `<b>Variasi, Harga & Stok</b>`,
    variantTableHtml,
    `${ce("refresh", "🔄")} <i>${tag} at ${now}</i>`
  ].filter(Boolean).join("\n").trim();

  const variantButtons = [];
  for (let i = 0; i < (product.variants || []).length; i += 2) {
    const row = [];
    const v1 = product.variants[i];
    const v2 = product.variants[i + 1];

    if (v1) {
      const v1FlashInfo = getFlashSaleInfo(flashSales, product, v1, nowMoment);
      const v1PriceText = formatPriceButton(v1.price, v1FlashInfo);
      const v1Text = `${v1.name} - ${v1PriceText}‎`;
      row.push(
        v1.stock > 0
          ? callbackButton(Markup, v1Text, `buy_${product.id}_${v1.name}`, "product")
          : callbackButton(Markup, v1Text, "noop", "ban")
      );
    }

    if (v2) {
      const v2FlashInfo = getFlashSaleInfo(flashSales, product, v2, nowMoment);
      const v2PriceText = formatPriceButton(v2.price, v2FlashInfo);
      const v2Text = `${v2.name} - ${v2PriceText}‎`;
      row.push(
        v2.stock > 0
          ? callbackButton(Markup, v2Text, `buy_${product.id}_${v2.name}`, "product")
          : callbackButton(Markup, v2Text, "noop", "ban")
      );
    }

    variantButtons.push(row);
  }

  const keyboard = [
    ...variantButtons,
    [callbackButton(Markup, "Refresh", `refresh_${product.id}`, "refresh")]
  ];

  return { text: applyCustomEmoji(text), keyboard };
}

// === 📁 FILE PATHS (SINGLE SOURCE) ===
const DB_PATH = path.resolve(__dirname, "data/db.json");
const PRODUCTS_PATH = path.resolve(__dirname, "data/products.json"); // ← kita pakai ini
const TX_PATH = path.resolve(__dirname, "data/transactions.json");

async function readJson(pathKey, fallback) {
  return store.readJson(pathKey, fallback);
}

async function writeJson(pathKey, value) {
  await store.writeJson(pathKey, value);
}

async function existsJson(pathKey) {
  return store.exists(pathKey);
}

async function deleteJson(pathKey) {
  await store.deleteJson(pathKey);
}

async function listJsonDir(dirPath) {
  return store.listDir(dirPath);
}

async function readStockFile(stockPath) {
  const data = await readJson(stockPath, []);
  return Array.isArray(data) ? data : [];
}

async function writeStockFile(stockPath, data) {
  await writeJson(stockPath, data);
}

// === 🧩 PRODUK (load & save) — PAKAI products.json ===
async function loadProducts() {
  try {
    const data = await readJson(PRODUCTS_PATH, []);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("⚠️ Gagal baca products.json:", e.message);
    return [];
  }
}
async function saveProducts(products) {
  try {
    await writeJson(PRODUCTS_PATH, products);
  } catch (e) {
    console.error("⚠️ Gagal simpan products.json:", e.message);
  }
}

// === 🗄️ DATABASE (db.json) ===
async function loadDB() {
  try {
    const init = { users: {}, stats: { totalUsers: 0, totalSold: 0, totalTransaksi: 0 } };
    const data = await readJson(DB_PATH, init);
    return data || init;
  } catch {
    const init = { users: {}, stats: { totalUsers: 0, totalSold: 0, totalTransaksi: 0 } };
    await saveDB(init);
    return init;
  }
}
async function saveDB(db) {
  await writeJson(DB_PATH, db);
}

// === 💳 TRANSAKSI (transactions.json) ===
async function loadTransactions() {
  try {
    const data = await readJson(TX_PATH, []);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function saveTransactions(data) {
  try {
    await writeJson(TX_PATH, data);
  } catch (err) {
    console.error("❌ Gagal simpan transactions.json:", err.message);
  }
}

// === 🤖 INIT BOT (SINGLE SOURCE) ===
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error(`[${AUTHOR}] ❌ BOT_TOKEN belum diisi di .env`);
  process.exit(1);
}
const bot = setupBotCompatibility(new Bot(process.env.BOT_TOKEN));

bot.catch((err) => {
  const e = err.error || err;
  console.error("❌ Error in grammY bot handler:", e?.message || e);
});

bot.use(async (ctx, next) => {
  ctx.telegram = ctx.api;
  if (!ctx.startPayload && ctx.message?.text?.startsWith("/start")) {
    ctx.startPayload = ctx.match || ctx.message.text.split(" ").slice(1).join(" ").trim();
  }
  ctx.answerCbQuery = function (text, options) {
    if (typeof options === "object") {
      return ctx.answerCallbackQuery({ text, show_alert: options.show_alert, url: options.url, cache_time: options.cache_time });
    }
    return ctx.answerCallbackQuery(text);
  };
  if (typeof ctx.message?.text === "string") {
    ctx.message.text = ctx.message.text
      .replace(/^[\s\u200d\ufe0f\p{Extended_Pictographic}]+/u, "")
      .trim();
  }
  return next();
});

// Web storefront + dashboard memakai data store yang sama dengan bot, sehingga
// perubahan stok dan status transaksi langsung terlihat di kedua UI.
const { startDashboard, approveTelegramLogin } = require("./lib/web-dashboard");
const webServer = startDashboard(bot);

CornService.register('validate_tx', '*/3 * * * * *', async () => {
  await ValidateTransactions(bot)

});

// --- Helper aman buat kirim pesan ---
async function sendMessageSafe(bot, chatId, text, extra = {}) {
  try {
    if (!bot || !chatId) return null;
    const formattedText = (extra.parse_mode === 'HTML' || (!extra.parse_mode && typeof text === 'string' && text.includes('<')))
      ? applyCustomEmoji(text)
      : text;
    if (extra.rich_message || (typeof formattedText === 'string' && (formattedText.includes('<table') || formattedText.includes('<details>')))) {
      const richContent = extra.rich_message || { html: formattedText };
      const res = await sendRichMessageSafe(bot, chatId, richContent, extra);
      if (res) return res;
    }
    const api = bot?.telegram || bot?.api || bot;
    return await api.sendMessage(chatId, formattedText, { parse_mode: 'HTML', ...extra });
  } catch (e) {
    if (typeof logger?.debug === 'function') {
      logger.debug('[sendMessageSafe]', e.message || e);
    } else {
      console.debug('[sendMessageSafe]', e.message || e);
    }
    return null;
  }
}

CornService.register('warn_expiry', '*/10 * * * * *', async () => {
  try {
    const now = Date.now();
    const pendings = typeof tx.find === 'function'
      ? await tx.find(t => String(t.status).toLowerCase() === 'pending')
      : (await tx.getAll()).filter(t => String(t.status).toLowerCase() === 'pending');

    for (const t of (pendings || [])) {
      if (!t?.expires_at || t.warn_sent) continue;
      const remainMs = t.expires_at - now;
      if (remainMs <= 0) continue; // sudah expired, biarin validator yg handle
      if (remainMs <= 60_000) {
        const remainingSec = Math.ceil(remainMs / 1000);
        const cap = [
          `<b>⚠️ PERINGATAN WAKTU PEMBAYARAN</b>`,
          `╭──────────────────────╮`,
          `├ <b>ID Transaksi:</b>`,
          `├ ${t.reference_id}`,
          `├ <b>Status:</b> Hampir Kadaluarsa`,
          `├ <b>Sisa Waktu:</b> ${remainingSec} detik`,
          `╰──────────────────────╯`,
          ``,
          `⚡ Segera selesaikan pembayaran Anda!`,
          `<i>Pesanan akan otomatis dibatalkan jika waktu habis.</i>`
        ].join('\n');

        await sendMessageSafe(bot, t.user_id, cap, { parse_mode: 'HTML' });

        // update flag biar ga spam
        if (typeof tx.updateById === 'function') {
          await tx.updateById(t.id, { warn_sent: true });
        } else if (typeof tx.update === 'function') {
          await tx.update(t.id, { ...t, warn_sent: true });
        } else if (typeof tx.getAll === 'function' && typeof tx.setAll === 'function') {
          const all = await tx.getAll();
          const next = (all || []).map(x => x.id === t.id ? { ...x, warn_sent: true } : x);
          await tx.setAll(next);
        }
      }
    }
  } catch (e) {
    logger?.debug?.('[warn_expiry]', e?.message || e);
  }
});

(async () => {
  // === 💾 Session store (MongoDB jika ada, fallback file lokal) ===
  let activeMessages = [];
  const mongoSession = createSessionStore();

  // 🧠 Session fix: kunci berdasarkan from.id (biar inline button share context)
  bot.use(session({
    initial: () => ({}),
    storage: mongoSession,
    getSessionKey: (ctx) => {
      const uid = ctx.from?.id || ctx.callbackQuery?.from?.id;
      const cid = ctx.chat?.id || ctx.callbackQuery?.message?.chat?.id;
      if (!uid || !cid) return undefined;
      return `${uid}:${cid}`; // 🔥 biar key selalu sama di command & callback
    },
  }));

  // 🧩 Debug session (sementara)
  bot.use((ctx, next) => {
    console.log("💾 Session sekarang:", ctx.session);
    return next();
  });



// ✅ Handler KONFIRMASI broadcast (universal media support)
bot.action("broadcast_confirm", async (ctx) => {
  try {
    if (ctx.callbackQuery?.data !== "broadcast_confirm") return;
    if (!isAdminNow(ctx)) return ctx.answerCbQuery("🚫 Kamu bukan admin.");

    const data = getBroadcastSession(ctx);
    if (!data || !data.pending) {
      return ctx.answerCbQuery("⚠️ Tidak ada broadcast aktif.");
    }

    const { message, photo, fileId, fileType, users } = data;
    data.pending = false;
    const broadcastKey = getBroadcastKey(ctx);
    if (broadcastKey) broadcastSessions.set(broadcastKey, data);

    const callbackMessage = ctx.callbackQuery?.message;
    const chatId = callbackMessage?.chat?.id;
    const messageId = callbackMessage?.message_id;
    const isPhotoMsg = Boolean(callbackMessage?.caption);
    const telegram = ctx.telegram;
    const updateMessage = async (text) => {
      if (!chatId || !messageId) return;
      if (isPhotoMsg) {
        return telegram
          .editMessageCaption(chatId, messageId, null, text, { parse_mode: "HTML" })
          .then(() => true)
          .catch(() => false);
      } else {
        return telegram
          .editMessageText(chatId, messageId, null, text, { parse_mode: "HTML" })
          .then(() => true)
          .catch(() => false);
      }
    };

    await updateMessage("📢 <b>Broadcast dimulai...</b>");
    await ctx.answerCbQuery("✅ Broadcast dimulai.");

    setImmediate(async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      let success = 0, failed = 0, removed = 0;
      const total = users.length;
      const db = await loadDB();

      // --- Deteksi media ---
      // Prioritaskan universal data dari session (fileId/fileType)
      let mediaType = fileType || (photo ? "photo" : null);
      let mediaId = fileId || photo || null;

      // --- Loop kirim ---
      for (let i = 0; i < total; i++) {
        const user = users[i];
        try {
          if (mediaId) {
            switch (mediaType) {
              case "photo":
                await telegram.sendPhoto(user.id, mediaId, {
                  caption: message || "",
                  parse_mode: "HTML",
                });
                break;
              case "video":
                await telegram.sendVideo(user.id, mediaId, {
                  caption: message || "",
                  parse_mode: "HTML",
                });
                break;
              case "document":
                await telegram.sendDocument(user.id, mediaId, {
                  caption: message || "",
                  parse_mode: "HTML",
                });
                break;
              case "animation":
                await telegram.sendAnimation(user.id, mediaId, {
                  caption: message || "",
                  parse_mode: "HTML",
                });
                break;
              case "audio":
                await telegram.sendAudio(user.id, mediaId, {
                  caption: message || "",
                  parse_mode: "HTML",
                });
                break;
              case "sticker":
                await telegram.sendSticker(user.id, mediaId);
                break;
              default:
                await telegram.sendMessage(user.id, message || "", {
                  parse_mode: "HTML",
                });
                break;
            }
          } else {
            await telegram.sendMessage(user.id, message || "", {
              parse_mode: "HTML",
            });
          }

          success++;
        } catch (err) {
          const retryAfter =
            Number(err?.parameters?.retry_after) ||
            Number(err?.response?.parameters?.retry_after) ||
            Number(err?.response?.data?.parameters?.retry_after) ||
            Number(err?.retry_after);
          if (retryAfter) {
            await sleep((retryAfter + 1) * 1000);
            i -= 1;
            continue;
          }
          failed++;
          const desc = String(err.description || "");
          if (desc.includes("bot was blocked by the user")) {
            delete db.users[user.id];
            removed++;
            await saveDB(db);
          } else {
            console.error(`❌ Gagal kirim ke ${user.id}:`, desc);
          }
        }

        // update progress
        if (i % 3 === 0 || i === total - 1) {
          const filled = Math.floor(((i + 1) / total) * 10);
          const bar = "▓".repeat(filled) + "░".repeat(10 - filled);
          const statusText = [
            `📤 <b>Broadcast sedang berjalan...</b>`,
            `👤 <a href="tg://user?id=${user.id}">${user.first_name || "User"}</a>`,
            ``,
            `📦 Progress: [${bar}] <b>${i + 1}/${total}</b>`,
            `🟢 Sukses: <b>${success}</b> | 🔴 Gagal: <b>${failed}</b> | 🧹 Dihapus: <b>${removed}</b>`,
          ].join("\n");
          await updateMessage(statusText);
        }

        await new Promise((r) => setTimeout(r, 1000)); // throttle
      }

      const summary = [
        `✅ <b>Broadcast selesai!</b>`,
        `📨 Total penerima: <b>${total}</b>`,
        `🟢 Berhasil: <b>${success}</b>`,
        `🔴 Gagal: <b>${failed}</b>`,
        `🧹 Dihapus (blokir bot): <b>${removed}</b>`,
        ``,
        `⚡ <i>Database otomatis dibersihkan dari user yang blokir bot</i>`,
      ].join("\n");

      await updateMessage(summary);

      clearBroadcastSession(ctx);

      setTimeout(async () => {
        try {
          if (chatId && messageId) {
            await telegram.deleteMessage(chatId, messageId);
          }
        } catch {}
      }, 3000);
    });
  } catch (err) {
    console.error("❌ Error di broadcast_confirm:", err);
    ctx.reply("❌ Terjadi kesalahan saat broadcast!");
  }
});

    // === ❌ Handler tombol "BATAL" ===
    bot.action("broadcast_cancel", async (ctx) => {
      const chatId = String(ctx.chat.id);
      if (!isAdmin(chatId)) return ctx.answerCbQuery("🚫 Kamu bukan admin.");

      clearBroadcastSession(ctx);

      await ctx.answerCbQuery("❌ Broadcast dibatalkan.");
      try {
        await ctx.editMessageReplyMarkup();
        const msg = ctx.update.callback_query.message;
        if (msg.caption) {
          await ctx.editMessageCaption("❌ Broadcast dibatalkan oleh admin.", {
            parse_mode: "HTML",
          });
        } else {
          await ctx.editMessageText("❌ Broadcast dibatalkan oleh admin.", {
            parse_mode: "HTML",
          });
        }
      } catch (e) {
        console.log("⚠️ Gagal update pesan pembatalan:", e.message);
      }
    });

bot.use(async (ctx, next) => {
  if (ctx.reply) {
    const origReply = ctx.reply.bind(ctx);
    ctx.reply = (text, extra = {}) => {
      const parseMode = extra?.parse_mode || 'HTML';
      const newText = (parseMode === 'HTML' && typeof text === 'string') ? applyCustomEmoji(text) : text;
      return origReply(newText, { parse_mode: parseMode, ...extra });
    };
  }
  if (ctx.editMessageText) {
    const origEdit = ctx.editMessageText.bind(ctx);
    ctx.editMessageText = (text, extra = {}) => {
      const parseMode = extra?.parse_mode || 'HTML';
      const newText = (parseMode === 'HTML' && typeof text === 'string') ? applyCustomEmoji(text) : text;
      return origEdit(newText, { parse_mode: parseMode, ...extra });
    };
  }
  if (ctx.editMessageCaption) {
    const origEditCaption = ctx.editMessageCaption.bind(ctx);
    ctx.editMessageCaption = (captionOrOther, extra = {}) => {
      if (typeof captionOrOther === "string") {
        const parseMode = extra?.parse_mode || 'HTML';
        const newCap = (parseMode === 'HTML') ? applyCustomEmoji(captionOrOther) : captionOrOther;
        return origEditCaption({ caption: newCap, parse_mode: parseMode, ...extra });
      }
      return origEditCaption(captionOrOther, extra);
    };
  }
  if (ctx.editMessageReplyMarkup) {
    const origEditMarkup = ctx.editMessageReplyMarkup.bind(ctx);
    ctx.editMessageReplyMarkup = (markupOrOther, signal) => {
      if (!markupOrOther) {
        return origEditMarkup({ reply_markup: { inline_keyboard: [] } }, signal);
      }
      if (markupOrOther.inline_keyboard) {
        return origEditMarkup({ reply_markup: markupOrOther }, signal);
      }
      return origEditMarkup(markupOrOther, signal);
    };
  }
  if (ctx.deleteMessage) {
    const origDelete = ctx.deleteMessage.bind(ctx);
    ctx.deleteMessage = (messageIdOrSignal) => {
      if (typeof messageIdOrSignal === "number" || (typeof messageIdOrSignal === "string" && /^\d+$/.test(messageIdOrSignal))) {
        const chatId = ctx.chat?.id;
        if (chatId) return ctx.api.deleteMessage(chatId, Number(messageIdOrSignal));
      }
      return origDelete(messageIdOrSignal);
    };
  }
  return next();
});


const legacyPluginScope = {
  CE: CE,
  fs: fs,
  path: path,
  axios: axios,
  FormData: FormData,
  Transactions: Transactions,
  txHandler: txHandler,
  Database: Database,
  store: store,
  tx: tx,
  logger: logger,
  settingsPath: settingsPath,
  dayjs: dayjs,
  utc: utc,
  tz: tz,
  STORE_NICKNAME: STORE_NICKNAME,
  PAYMENT_GATEWAY_LABEL: PAYMENT_GATEWAY_LABEL,
  normalizeChannelId: normalizeChannelId,
  CHANNEL_TARGET: CHANNEL_TARGET,
  APP_TZ: APP_TZ,
  resolveAssetPath: resolveAssetPath,
  INFO_BANNER_PATH: INFO_BANNER_PATH,
  CANCELED_BANNER_PATH: CANCELED_BANNER_PATH,
  tzLabel: tzLabel,
  nowTZ: nowTZ,
  fmtFull: fmtFull,
  fmtShort: fmtShort,
  fmtDate: fmtDate,
  fmtTime: fmtTime,
  greetingByHour: greetingByHour,
  CronRegistry: CronRegistry,
  CornService: CornService,
  trx: trx,
  getSettings: getSettings,
  getAdminContactLabel: getAdminContactLabel,
  sessions: sessions,
  broadcastSessions: broadcastSessions,
  getBroadcastKey: getBroadcastKey,
  setBroadcastSession: setBroadcastSession,
  getBroadcastSession: getBroadcastSession,
  clearBroadcastSession: clearBroadcastSession,
  isAdmin: isAdmin,
  isAdminNow: isAdminNow,
  productPath: productPath,
  info: info,
  BOT_NAME: BOT_NAME,
  AUTHOR: AUTHOR,
  esc: esc,
  rupiah: rupiah,
  FLASH_SALE_PATH: FLASH_SALE_PATH,
  normalizeVariantName: normalizeVariantName,
  parseFlashSaleTime: parseFlashSaleTime,
  calcDiscountPercent: calcDiscountPercent,
  getActiveFlashSale: getActiveFlashSale,
  getFlashSaleInfo: getFlashSaleInfo,
  formatPriceHtml: formatPriceHtml,
  formatPriceButton: formatPriceButton,
  getProductFlashSaleBadge: getProductFlashSaleBadge,
  saldoLabel: saldoLabel,
  buildOrderConfirmationCard: buildOrderConfirmationCard,
  buildPaymentConfirmationCard: buildPaymentConfirmationCard,
  buildProductCard: buildProductCard,
  DB_PATH: DB_PATH,
  PRODUCTS_PATH: PRODUCTS_PATH,
  TX_PATH: TX_PATH,
  BOT_TOKEN: BOT_TOKEN,
  bot: bot,
  webServer: webServer,
  buildFramedQris: buildFramedQris,
  isQrisFrameOn: isQrisFrameOn,
  sendPaymentAnnouncement: sendPaymentAnnouncement,
  maskUserId: maskUserId,
  CUSTOM_EMOJI: CUSTOM_EMOJI,
  ce: ce,
  ceRich: ceRich,
  ceCaption: ceCaption,
  applyCustomEmoji: applyCustomEmoji,
  cleanButtonLabel: cleanButtonLabel,
  callbackButton: callbackButton,
  urlButton: urlButton,
  keyboardButton: keyboardButton,
  inlineButton: inlineButton,
  withCustomEmoji: withCustomEmoji,
  buildRichMessage: buildRichMessage,
  richTable: richTable,
  richDetails: richDetails,
  toRichHtml: toRichHtml,
  richToFallbackHtml: richToFallbackHtml,
  sendRichMessageSafe: sendRichMessageSafe,
  editRichMessageSafe: editRichMessageSafe,
  getDb: getDb,
  isMongoEnabled: isMongoEnabled,
  createSessionStore: createSessionStore,
  ValidateTransactions: ValidateTransactions,
  readJson: readJson,
  writeJson: writeJson,
  existsJson: existsJson,
  deleteJson: deleteJson,
  listJsonDir: listJsonDir,
  readStockFile: readStockFile,
  writeStockFile: writeStockFile,
  loadProducts: loadProducts,
  saveProducts: saveProducts,
  loadDB: loadDB,
  saveDB: saveDB,
  loadFlashSales: loadFlashSales,
  saveFlashSales: saveFlashSales,
  loadTransactions: loadTransactions,
  saveTransactions: saveTransactions,
  sendMessageSafe: sendMessageSafe,
  sendOrderLogToChannel: sendOrderLogToChannel,
  Telegraf: Telegraf,
  Markup: Markup,
  session: session,
  startDashboard: startDashboard,
  approveTelegramLogin: approveTelegramLogin
};
require("./plugins")(legacyPluginScope);
})(); // ✅ Nutup async utama
