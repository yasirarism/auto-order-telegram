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
require("dotenv").config();
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
const Transactions = require("./lib/transactions");
const txHandler = new Transactions();
const Database = require("./lib/database");
const tx = new Database("data/transactions.json");
const logger = require("./utils/logger");
const settingsPath = path.resolve('settings.js');
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const tz = require("dayjs/plugin/timezone");
const ValidateTransactions = require("./lib/handler/transactions");
dayjs.extend(utc);
dayjs.extend(tz);
dayjs.tz.setDefault(process.env.TZ || "Asia/Jakarta");

// ==== Helpers waktu berbasis ENV TZ ====
const APP_TZ = process.env.TZ || "Asia/Jakarta";

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

const sessions = new Map();

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
  try {
    const data = await fs.readFile(productPath, "utf8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveProducts(products) {
  await fs.writeFile(productPath, JSON.stringify(products, null, 2));
}

// 🧩 tambahkan 'session' biar ctx.session berfungsi
const { Telegraf, Markup, session } = require("telegraf");

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

function saldoLabel(balance = 0) {
  return `💰 Saldo Rp ${rupiah(balance)}`;
}

// === 📁 FILE PATHS (SINGLE SOURCE) ===
const DB_PATH = path.resolve(__dirname, "data/db.json");
const PRODUCTS_PATH = path.resolve(__dirname, "data/products.json"); // ← kita pakai ini

// === 🧩 PRODUK (load & save) — PAKAI products.json ===
async function loadProducts() {
  try {
    if (!fs.existsSync(PRODUCTS_PATH)) {
      await fsp.writeFile(PRODUCTS_PATH, "[]", "utf8");
      return [];
    }
    const txt = await fsp.readFile(PRODUCTS_PATH, "utf8");
    const data = JSON.parse(txt);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("⚠️ Gagal baca products.json:", e.message);
    return [];
  }
}
async function saveProducts(products) {
  try {
    await fsp.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf8");
  } catch (e) {
    console.error("⚠️ Gagal simpan products.json:", e.message);
  }
}

// === 🗄️ DATABASE (db.json) ===
async function loadDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      const init = { users: {}, stats: { totalUsers: 0, totalSold: 0, totalTransaksi: 0 } };
      await saveDB(init);
      return init;
    }
    const txt = await fsp.readFile(DB_PATH, "utf8");
    return JSON.parse(txt);
  } catch {
    const init = { users: {}, stats: { totalUsers: 0, totalSold: 0, totalTransaksi: 0 } };
    await saveDB(init);
    return init;
  }
}
async function saveDB(db) {
  await fsp.writeFile(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}

// === 💳 TRANSAKSI (transactions.json) ===
async function loadTransactions() {
  try {
    if (!fs.existsSync(TX_PATH)) {
      await fsp.writeFile(TX_PATH, "[]", "utf8");
      return [];
    }
    const txt = await fsp.readFile(TX_PATH, "utf8");
    const data = JSON.parse(txt);
    return Array.isArray(data) ? data : [];
  } catch {
    await fsp.writeFile(TX_PATH, "[]", "utf8");
    return [];
  }
}

// === 🤖 INIT BOT (SINGLE SOURCE) ===
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error(`[${AUTHOR}] ❌ BOT_TOKEN belum diisi di .env`);
  process.exit(1);
}
const bot = new Telegraf(process.env.BOT_TOKEN);

CornService.register('validate_tx', '*/3 * * * * *', async () => {
  await ValidateTransactions(bot)

});

// --- Helper aman buat kirim pesan ---
async function sendMessageSafe(bot, chatId, text, extra = {}) {
  try {
    if (!bot || !chatId) return null;
    return await bot.telegram.sendMessage(chatId, text, extra);
  } catch (e) {
    // Kalau user blok bot / chat udah gak ada, cukup log dan lanjut
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
  // === 💾 Session store ke file biar persist & aman (LowDB v7+) ===
  const { Low } = require("lowdb");
  const { JSONFile } = require("lowdb/node");
  let activeMessages = [];

  const SESSION_PATH = path.resolve(__dirname, "data/session.json");

  if (!fs.existsSync(path.resolve(__dirname, "data"))) {
    fs.mkdirSync(path.resolve(__dirname, "data"));
  }

  let sessionDB;
  try {
    sessionDB = new Low(new JSONFile(SESSION_PATH), {});
    await sessionDB.read();
    if (!sessionDB.data || typeof sessionDB.data !== "object") {
      console.warn("⚠️ Session file rusak, reset ulang...");
      sessionDB.data = {};
      await sessionDB.write();
    }
  } catch (err) {
    console.error("⚠️ Gagal baca session.json, membuat baru:", err.message);
    fs.writeFileSync(SESSION_PATH, "{}", "utf8");
    sessionDB = new Low(new JSONFile(SESSION_PATH), {});
    await sessionDB.read();
    sessionDB.data ||= {};
  }

  const fileSession = () => ({
    get: (key) => {
      return sessionDB.data[key];
    },
    set: (key, value) => {
      sessionDB.data[key] = value;
      sessionDB.write(); // 🧠 penting: biar langsung tersimpan ke file
      console.log("💾 Session disimpan:", key, value); // debug tambahan
    },
    delete: (key) => {
      delete sessionDB.data[key];
      sessionDB.write();
      console.log("🧹 Session dihapus:", key);
    },
  });

  // 🧠 Session fix: kunci berdasarkan from.id (biar inline button share context)
  bot.use(session({
   store: fileSession(),
    getSessionKey: (ctx) => {
  const uid = ctx.from?.id || ctx.callbackQuery?.from?.id;
  const cid = ctx.chat?.id || ctx.callbackQuery?.message?.chat?.id;
  if (!uid || !cid) return null;
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

    ctx.session ??= {};
    const data = ctx.session.broadcast;
    if (!data || !data.pending) {
      return ctx.answerCbQuery("⚠️ Tidak ada broadcast aktif.");
    }

    const { message, photo, fileId, fileType, users } = data;
    ctx.session.broadcast.pending = false;

    const isPhotoMsg = Boolean(ctx.callbackQuery.message.caption);
    const updateMessage = async (text) => {
      if (isPhotoMsg) {
        await ctx.editMessageCaption(text, { parse_mode: "HTML" }).catch(() => {});
      } else {
        await ctx.editMessageText(text, { parse_mode: "HTML" }).catch(() => {});
      }
    };

    await updateMessage("📢 <b>Broadcast dimulai...</b>");

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
              await ctx.telegram.sendPhoto(user.id, mediaId, {
                caption: message || "",
                parse_mode: "HTML",
              });
              break;
            case "video":
              await ctx.telegram.sendVideo(user.id, mediaId, {
                caption: message || "",
                parse_mode: "HTML",
              });
              break;
            case "document":
              await ctx.telegram.sendDocument(user.id, mediaId, {
                caption: message || "",
                parse_mode: "HTML",
              });
              break;
            case "animation":
              await ctx.telegram.sendAnimation(user.id, mediaId, {
                caption: message || "",
                parse_mode: "HTML",
              });
              break;
            case "audio":
              await ctx.telegram.sendAudio(user.id, mediaId, {
                caption: message || "",
                parse_mode: "HTML",
              });
              break;
            default:
              await ctx.telegram.sendMessage(user.id, message || "", {
                parse_mode: "HTML",
              });
              case "sticker":
              await ctx.telegram.sendSticker(user.id, mediaId);
              break;
          }
        } else {
          await ctx.telegram.sendMessage(user.id, message || "", {
            parse_mode: "HTML",
          });
        }

        success++;
      } catch (err) {
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

    await ctx.editMessageText(summary, { parse_mode: "HTML" })
      .catch(() => ctx.reply(summary, { parse_mode: "HTML" }));

    delete ctx.session.broadcast;

    setTimeout(async () => {
      try {
        const msg = ctx.callbackQuery?.message;
        if (msg) await ctx.telegram.deleteMessage(msg.chat.id, msg.message_id);
      } catch {}
    }, 3000);
  } catch (err) {
    console.error("❌ Error di broadcast_confirm:", err);
    ctx.reply("❌ Terjadi kesalahan saat broadcast!");
  }
});

    // === ❌ Handler tombol "BATAL" ===
    bot.action("broadcast_cancel", async (ctx) => {
      const chatId = String(ctx.chat.id);
      if (!isAdmin(chatId)) return ctx.answerCbQuery("🚫 Kamu bukan admin.");

      ctx.session ??= {};
      ctx.session.broadcast = null;

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

// === /start Command (fixed + optimized ringan) ===
bot.start(async (ctx) => {
  const chatId = String(ctx.chat.id);
  const user = ctx.from;

  // 🚀 Reload data dari file agar saldo tidak ke-reset oleh cache lama
  global.dbCache = await loadDB();

  // 🧩 Perbaikan utama: selalu reload transactions.json biar realtime
  const txPath = path.join(__dirname, "data", "transactions.json");
  try {
    global.txCache = fs.existsSync(txPath)
      ? JSON.parse(fs.readFileSync(txPath, "utf8"))
      : [];
  } catch (err) {
    console.error("⚠️ Gagal baca transactions.json:", err.message);
    global.txCache = [];
  }

  let db = global.dbCache || {};

  if (!db.users) db.users = {};
  if (!db.stats) db.stats = { totalUsers: 0 };

  global.dbCache = db; 

  const transactions = global.txCache || {};

  // 🧍‍♂️ Buat user baru jika belum ada
  if (!db.users[chatId]) {
    db.users[chatId] = {
      id: chatId,
      username: user.username || null,
      first_name: user.first_name || null,
      transaksi: 0,
      balance: 0,
      createdAt: Date.now()
    };

    db.stats.totalUsers += 1;
    await saveDB(db);
  }

  const me = db.users[chatId];
  if (user?.username && me.username !== user.username) me.username = user.username;
  if (user?.first_name && me.first_name !== user.first_name) me.first_name = user.first_name;
  const now = fmtFull();
  const totalUsers = db.stats.totalUsers || 1;

  // 💰 Hitung total transaksi user dari transactions.json (fix: realtime)
  const userTotalTransaksi = Array.isArray(transactions)
    ? transactions
        .filter(t => String(t.user_id) === chatId && t.status === 'paid')
        .reduce((sum, t) => sum + (t.total_amount || 0), 0)
    : 0;

  // 🔄 Update data user (sinkron)
  me.transaksi = userTotalTransaksi;

  // 📊 Hitung statistik global (real-time)
  const totalSold = Array.isArray(transactions)
    ? transactions.reduce((sum, t) => sum + (t.jumlah || t.qty || 0), 0)
    : 0;

  const totalTransaksi = Array.isArray(transactions)
    ? transactions
    .filter(t =>  t.status === 'paid')
    .reduce((sum, t) => sum + (t.total_amount || 0), 0)
    : 0;

  db.stats.totalSold = totalSold;
  db.stats.totalTransaksi = totalTransaksi;

  // 🧠 Simpan database cuma kalau data berubah
  await saveDB(db);

  const text = [
    `Halo ${esc(me.first_name || me.username || 'Pengguna')} 👋`,
    `<i>${esc(now)}</i>`,
    ``,
    `<b>User Info :</b>`,
    `└ <b>ID :</b> <code>${esc(me.id)}</code>`,
    `└ <b>Username :</b> ${me.username ? '@' + esc(me.username) : '-'}`,
    `└ <b>Transaksi :</b> Rp ${rupiah(userTotalTransaksi)}`,
    ``,
    `<b>BOT Stats :</b>`,
    `└ <b>Terjual :</b> ${totalSold} Acc`,
    `└ <b>Total Transaksi :</b> Rp ${rupiah(totalTransaksi)}`,
    `└ <b>Total User :</b> ${rupiah(totalUsers)}`,
    ``,
    `<b>Shortcuts :</b>`,
    `/start - Mulai bot`,
    `/akusiapa - Status Kamu`,
    `/cekstok - Lihat Seluruh Stok`,
    `/helpadmin — Panduan ( Untuk Admin )`,
    ``,
    `<i>Dikelola oleh ${AUTHOR} © 2025</i>`
  ].join('\n');

  // 🎛️ Keyboard utama
  const keyboard = Markup.keyboard([
    ['🧾 List Produk', '🛒 Stock'],
    [saldoLabel(me.balance), '📜 Riwayat Transaksi'],
    ['❓ Cara Order']
  ]).resize();

  const bannerPath = path.resolve(__dirname, 'assets/info.jpg');
  const caption = `🤖 ${BOT_NAME} — by ${AUTHOR}\n\n${text}`;

  // 🖼️ Kirim banner cuma kalau ada, biar cepat
  if (fs.existsSync(bannerPath)) {
    await ctx.replyWithPhoto(
      { source: bannerPath },
      { caption, parse_mode: 'HTML', ...keyboard }
    );
  } else {
    await ctx.reply(caption, { parse_mode: 'HTML', ...keyboard });
  }
});


// === 🧾 MENU LIST PRODUK (Page 1 / 1 + efek loading bar animasi fix) ===
bot.hears('🧾 List Produk', async (ctx) => {
  const chatId = String(ctx.chat.id);
  const db = await loadDB();
  const me = db.users[chatId] || { balance: 0 };

  // 🌀 Kirim pesan awal (loading 0%)
  const loadingMsg = await ctx.reply('🔄 Loading [░░░░░░░░░░] 0%');

  const totalSteps = 10;
  let progress = 0;

  const interval = setInterval(async () => {
    if (progress >= totalSteps) return;

    progress++;
    const filled = '▒'.repeat(progress);
    const empty = '░'.repeat(Math.max(totalSteps - progress, 0));
    const percent = Math.min(Math.floor((progress / totalSteps) * 100), 100);

    const emojis = ['🔄', '⚙️', '🌀', '💫', '♻️'];
    const emoji = emojis[progress % emojis.length];

    try {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        loadingMsg.message_id,
        null,
        `${emoji} Loading [${filled}${empty}] ${percent}%`
      );
    } catch { }
    if (progress >= totalSteps) clearInterval(interval);
  }, 250);

  await new Promise((resolve) => setTimeout(resolve, 250 * (totalSteps + 1)));

  try { await ctx.deleteMessage(loadingMsg.message_id); } catch { }

  const bannerPath = path.resolve(__dirname, 'assets/info.jpg');

  // 🔄 AUTO LOAD PRODUK DARI FILE /data/products.json
  const productsFile = path.join(__dirname, 'data', 'products.json');
  let PRODUCTS = [];
  if (fs.existsSync(productsFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(productsFile, 'utf8'));
      PRODUCTS = data.map((p) => p.name.toUpperCase());
    } catch (err) {
      console.error("❌ Gagal membaca products.json:", err);
    }
  }

  const listText = [
    `<b>📦 LIST PRODUK</b>`,
    `<i>page 1 / 1</i>`,
    `━━━━━━━━━━━━━━━━━━━`,
    ...PRODUCTS.map((p, i) => `[${i + 1}] ${p}`),
    `━━━━━━━━━━━━━━━━━━━`,
    `This bot is proudly created by\n© SEN PRO 2025`
  ].join('\n');

// 🧮 Generate keyboard dinamis sesuai jumlah produk
const productButtons = PRODUCTS.map((_, i) => String(i + 1));
const rows = [];
for (let i = 0; i < productButtons.length; i += 6) {
  rows.push(productButtons.slice(i, i + 6));
}

// 🎛️ Keyboard utama
const keyboard = Markup.keyboard([
  ['🧾 List Produk', '🛒 Stock'],
  ...rows,
  [saldoLabel(me.balance), '📜 Riwayat Transaksi']
]).resize();

if (fs.existsSync(bannerPath)) {
  await ctx.replyWithPhoto(
    { source: bannerPath },
    { caption: listText, parse_mode: 'HTML', ...keyboard }
  );
} else {
  await ctx.reply(listText, { parse_mode: 'HTML', ...keyboard });
}
});

// === 💰 SALDO & TOPUP ===
bot.hears(/^💰 Saldo/, async (ctx) => {
  try {
    const chatId = String(ctx.chat.id);
    const db = await loadDB();
    const me = db.users[chatId] || { balance: 0 };
    const now = dayjs().tz().format("HH.mm.ss [WIB]");

    const text = [
      `<b>💰 INFO SALDO</b>`,
      `╭──────────────────────╮`,
      `├ <b>User:</b> ${esc(me.first_name || me.username || "Pengguna")}`,
      `├ <b>Sisa Saldo:</b> Rp ${rupiah(me.balance || 0)}`,
      `╰──────────────────────╯`,
      ``,
      `Pilih menu di bawah untuk isi saldo/topup.`,
      ``,
      `🔄 <i>Refresh at ${now}</i>`,
    ].join("\n");

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback("📥 Isi Saldo / Topup", "saldo_topup")],
    ]);

    await ctx.reply(text, { parse_mode: "HTML", ...keyboard });
  } catch (err) {
    console.error("❌ Error saldo menu:", err);
    await ctx.reply("❌ Gagal menampilkan saldo.");
  }
});

bot.action("saldo_topup", async (ctx) => {
  try {
    const settings = getSettings();
    const admins = settings.admins || [];
    const adminLines = admins.length
      ? admins.map((a) => {
          const name = a.username ? `@${a.username}` : (a.id ? a.id : "-");
          return `• ${name}`;
        })
      : ["• (admin belum diset di settings.js)"];

    const text = [
      `<b>📥 ISI SALDO / TOPUP</b>`,
      ``,
      `Silakan hubungi admin untuk isi saldo manual.`,
      ``,
      `<b>Kontak Admin:</b>`,
      ...adminLines,
    ].join("\n");

    const adminWithUsername = admins.find((a) => a.username);
    const keyboard = adminWithUsername
      ? Markup.inlineKeyboard([
          [Markup.button.url("💬 Hubungi Admin", `https://t.me/${adminWithUsername.username}`)],
        ])
      : undefined;

    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      ...(keyboard ? keyboard : {}),
    });
    await ctx.answerCbQuery();
  } catch (err) {
    console.error("❌ Error saldo_topup:", err);
    try {
      await ctx.answerCbQuery("Gagal membuka menu topup.");
    } catch {}
  }
});

// === 🛒 Stock ===
bot.hears(/^🛒 Stock/, async (ctx) => {
  try {
    await ctx.reply('📦 Menampilkan seluruh stok produk...');

    const productsFile = path.join(__dirname, "data", "products.json");

    if (!fs.existsSync(productsFile)) {
      return ctx.reply("📭 File products.json belum ada atau kosong.");
    }

    const products = JSON.parse(fs.readFileSync(productsFile, "utf8"));
    if (!products.length) {
      return ctx.reply("📭 Belum ada produk yang terdaftar.");
    }

    // 🕒 waktu sekarang (Asia/Jakarta)
    const now = dayjs().tz("Asia/Jakarta").format("DD MMM YYYY HH:mm [WIB]");

    const list = products
      .map((p, i) => {
        const totalStock = (p.variants || []).reduce(
          (sum, v) => sum + (v.stock || 0),
          0
        );
        const totalVarian = (p.variants || []).length;
        const status = totalStock > 0 ? "✅" : "❌";
        return `${i + 1}. ${esc(p.name || "(tanpa nama)")}\n   ${status} Total Stok: <b>${totalStock}</b> (${totalVarian} varian)`;
      })
      .join("\n\n");

    const content = [
      `📦 <b>DAFTAR STOK PRODUK</b>`,
      ``,
      list,
      ``,
      `📜 Total Produk: <b>${products.length}</b>`,
      ``,
      `⏱️ Diperbarui: <b>${now}</b>`,
    ].join("\n");

    const markup = {
      inline_keyboard: [[{ text: "🔄 Refresh", callback_data: "cekstok_refresh" }]],
    };

    await ctx.reply(content, { parse_mode: "HTML", reply_markup: markup });

  } catch (err) {
    console.error("❌ Gagal menampilkan stok:", err);
    await ctx.reply("⚠️ Terjadi kesalahan saat menampilkan stok.");
  }
});

  // === 💳 HANDLER TRANSAKSI ===
const TX_PATH = path.resolve("data/transactions.json");

// Load transaksi
async function loadTransactions() {
  try {
    if (!fs.existsSync(TX_PATH)) {
      await fsp.writeFile(TX_PATH, "[]", "utf8");
      return [];
    }
    const txt = await fsp.readFile(TX_PATH, "utf8");
    const data = JSON.parse(txt);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("⚠️ Gagal load transactions.json:", err.message);
    await fsp.writeFile(TX_PATH, "[]", "utf8");
    return [];
  }
}

// Simpan transaksi
async function saveTransactions(data) {
  try {
    if (!fs.existsSync(path.dirname(TX_PATH))) {
      fs.mkdirSync(path.dirname(TX_PATH), { recursive: true });
    }
    await fsp.writeFile(TX_PATH, JSON.stringify(data, null, 2), "utf8");
    console.log("✅ Transactions berhasil disimpan");
  } catch (err) {
    console.error("❌ Gagal simpan transactions.json:", err.message);
  }
}

// === 📜 RIWAYAT TRANSAKSI (pagination 5 per halaman) ===
const PRODUCTS_PATH = path.resolve('data/products.json');
const PER_PAGE      = 5;

// escape HTML aman
const esc = (v) => String(v ?? '')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

// rupiah sederhana (pakai punyamu juga boleh)
const fmtRp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');

// ke WIB
const tsWIB = (ms) => {
  try {
    const d = new Date(Number(ms || 0));
    return d.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  } catch { return '-'; }
};

const formatTxTime = (tx) => {
  const raw = tx?.timestamp ?? tx?.created_at ?? tx?.paid_at ?? tx?.createdAt ?? null;
  if (!raw) return '-';
  if (typeof raw === 'number') return tsWIB(raw);
  const rawStr = String(raw);
  if (/^\d+$/.test(rawStr)) return tsWIB(Number(rawStr));
  return rawStr;
};

const txSortValue = (tx) => {
  const raw = tx?.created_at ?? tx?.timestamp ?? tx?.paid_at ?? tx?.createdAt ?? 0;
  if (typeof raw === 'number') return raw;
  const rawStr = String(raw);
  if (/^\d+$/.test(rawStr)) return Number(rawStr);
  const parsed = Date.parse(rawStr);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const statusBadge = (s) => {
  s = String(s || '').toLowerCase();
  if (['completed','paid','success','sukses'].includes(s)) return '✅ Selesai';
  if (s === 'pending')   return '⏳ Pending';
  if (s === 'canceled')  return '❌ Dibatalkan';
  if (s === 'expired')   return '⏰ Kadaluarsa';
  return `❔ ${s || '-'}`;
};

bot.hears('📜 Riwayat Transaksi', async (ctx) => {
  const chatId = String(ctx.chat.id);

  if (!fs.existsSync(TX_PATH)) {
    return ctx.reply('📭 Belum ada transaksi yang tercatat.');
  }

  const txAll = JSON.parse(fs.readFileSync(TX_PATH, 'utf8') || '[]');
  const userTx = (txAll || []).filter(t => String(t.user_id) === chatId);

  if (!userTx.length) {
    return ctx.reply('📜 Belum ada transaksi.');
  }

  // load products buat resolve nama
  const products = fs.existsSync(PRODUCTS_PATH)
    ? (JSON.parse(fs.readFileSync(PRODUCTS_PATH, 'utf8') || '[]') || [])
    : [];
  const prodIndex = Object.fromEntries(products.map(p => [String(p.id), p]));

  const totalPages = Math.max(1, Math.ceil(userTx.length / PER_PAGE));

  // 🧩 render 1 halaman
  const renderPage = async (page = 1, msgId = null) => {
    const p = Math.min(Math.max(1, page), totalPages);
    const start = (p - 1) * PER_PAGE;
    const end   = start + PER_PAGE;

    // terbaru duluan
    const txPage = userTx
      .slice()
      .sort((a, b) => txSortValue(b) - txSortValue(a))
      .slice(start, end);

    const items = txPage.map(t => {
      const prod = prodIndex[String(t.product_id)];
      const prodName = prod?.name || t.product || 'Tanpa Nama';
      const variant  = t.variant_name || t.variant || '-';
      const qty      = Number(t.qty ?? t.jumlah ?? 1);
      const amount   = Number(t.total_amount ?? t.total ?? t.amount ?? t.price ?? 0);
      const method   = String(t.method || t.payment_method || '-').toUpperCase();
      const akun     = t.username ? `@${t.username}` : (t.user || 'Tidak ada akun tercatat');
      const ref      = t.reference_id || t.reference || '-';
      const idStr    = t.id != null ? `#${t.id}` : '-';
      const when     = formatTxTime(t);

      return [
        '╭──────────────────────────',
        `├ <b>${esc(prodName)}</b> <i>(${esc(variant)})</i>`,
        `├ <b>${fmtRp(amount)}</b> (${qty}x)`,
        `├ Metode : ${esc(method)}`,
        `├ Akun   : ${esc(akun)}`,
        `├ Status : ${statusBadge(t.status)}`,
        `├ Ref    : ${esc(ref)}`,
        `├ ID     : ${esc(idStr)}`,
        `├ Tanggal: ${esc(when)}`,
        '╰──────────────────────────'
      ].join('\n');
    });

    const content = [
      `<b>📜 RIWAYAT TRANSAKSI KAMU</b>`,
      ``,
      items.join('\n\n'),
      ``,
      `Menampilkan ${txPage.length} transaksi (halaman ${p}/${totalPages}).`
    ].join('\n');

    const nav = [];
    if (p > 1) nav.push({ text: '⬅️ Sebelumnya', callback_data: `tx_page_${p-1}` });
    if (p < totalPages) nav.push({ text: 'Selanjutnya ➡️', callback_data: `tx_page_${p+1}` });
    const markup = nav.length ? { inline_keyboard: [nav] } : undefined;

    if (msgId) {
      try {
        await ctx.telegram.editMessageText(ctx.chat.id, msgId, null, content, {
          parse_mode: 'HTML',
          reply_markup: markup,
          disable_web_page_preview: true
        });
      } catch (err) {
        console.error('editMessageText error:', err.message);
      }
    } else {
      const sent = await ctx.reply(content, {
        parse_mode: 'HTML',
        reply_markup: markup,
        disable_web_page_preview: true
      });
      return sent.message_id;
    }
  };

  const msgId = await renderPage(1);
  // simpan state sederhana untuk pagination
  ctx.session = ctx.session || {};
  ctx.session.tx = { page: 1, msgId };
});

// === pagination handler (callback) ===
bot.action(/^tx_page_(\d+)$/, async (ctx) => {
  const nextPage = Number(ctx.match[1] || '1') || 1;
  const msgId = ctx.session?.tx?.msgId || ctx.callbackQuery?.message?.message_id || null;

  // panggil ulang fungsi yang sama seperti di atas:
  // (copas kecil renderPage supaya tidak duplikasi banyak; atau taruh renderPage ke scope luar)
  const chatId = String(ctx.chat.id);

  if (!fs.existsSync(TX_PATH)) {
    try { await ctx.answerCbQuery('Tidak ada transaksi.'); } catch {}
    return;
  }

  const txAll = JSON.parse(fs.readFileSync(TX_PATH, 'utf8') || '[]');
  const userTx = (txAll || []).filter(t => String(t.user_id) === chatId);
  if (!userTx.length) {
    try { await ctx.answerCbQuery('Tidak ada transaksi.'); } catch {}
    return;
  }

  const products = fs.existsSync(PRODUCTS_PATH)
    ? (JSON.parse(fs.readFileSync(PRODUCTS_PATH, 'utf8') || '[]') || [])
    : [];
  const prodIndex = Object.fromEntries(products.map(p => [String(p.id), p]));
  const totalPages = Math.max(1, Math.ceil(userTx.length / PER_PAGE));
  const p = Math.min(Math.max(1, nextPage), totalPages);
  const start = (p - 1) * PER_PAGE;
  const end   = start + PER_PAGE;

  const txPage = userTx
    .slice()
    .sort((a, b) => txSortValue(b) - txSortValue(a))
    .slice(start, end);

  const items = txPage.map(t => {
    const prod = prodIndex[String(t.product_id)];
    const prodName = prod?.name || t.product || 'Tanpa Nama';
    const variant  = t.variant_name || t.variant || '-';
    const qty      = Number(t.qty ?? t.jumlah ?? 1);
    const amount   = Number(t.total_amount ?? t.total ?? t.amount ?? t.price ?? 0);
    const method   = String(t.method || t.payment_method || '-').toUpperCase();
    const akun     = t.username ? `@${t.username}` : (t.user || 'Tidak ada akun tercatat');
    const ref      = t.reference_id || t.reference || '-';
    const idStr    = t.id != null ? `#${t.id}` : '-';
    const when     = formatTxTime(t);

    return [
      '╭──────────────────────────',
      `├ <b>${esc(prodName)}</b> <i>(${esc(variant)})</i>`,
      `├ <b>${fmtRp(amount)}</b> (${qty}x)`,
      `├ Metode : ${esc(method)}`,
      `├ Akun   : ${esc(akun)}`,
      `├ Status : ${statusBadge(t.status)}`,
      `├ Ref    : ${esc(ref)}`,
      `├ ID     : ${esc(idStr)}`,
      `├ Tanggal: ${esc(when)}`,
      '╰──────────────────────────'
    ].join('\n');
  });

  const content = [
    `<b>📜 RIWAYAT TRANSAKSI KAMU</b>`,
    ``,
    items.join('\n\n'),
    ``,
    `Menampilkan ${txPage.length} transaksi (halaman ${p}/${totalPages}).`
  ].join('\n');

  const nav = [];
  if (p > 1) nav.push({ text: '⬅️ Sebelumnya', callback_data: `tx_page_${p-1}` });
  if (p < totalPages) nav.push({ text: 'Selanjutnya ➡️', callback_data: `tx_page_${p+1}` });
  const markup = nav.length ? { inline_keyboard: [nav] } : undefined;

  try {
    await ctx.editMessageText(content, {
      parse_mode: 'HTML',
      reply_markup: markup,
      disable_web_page_preview: true
    });
  } catch {
    await ctx.reply(content, {
      parse_mode: 'HTML',
      reply_markup: markup,
      disable_web_page_preview: true
    });
  }

  ctx.session = ctx.session || {};
  ctx.session.tx = { page: p, msgId: msgId || ctx.callbackQuery?.message?.message_id || null };

  try { await ctx.answerCbQuery(); } catch {}
});

// 🧹 Auto-clear session setiap command baru diketik (kecuali multi-step)
bot.use((ctx, next) => {
  if (ctx.message && ctx.message.text && ctx.message.text.startsWith("/")) {
    const cmd = ctx.message.text.split(" ")[0].toLowerCase();

    // Daftar command yang PAKAI multi-step (jangan dihapus session-nya)
    const multiStepCommands = ["/tambahproduk", "/tambahstok", "/editstok", "/editproduk"];

    if (!multiStepCommands.includes(cmd)) {
      ctx.session = {}; // clear session biasa
      console.log(`🧽 Session direset karena command baru: ${cmd}`);
    } else {
      console.log(`🧩 Session dipertahankan untuk multi-step: ${cmd}`);
    }
  }
  return next();
});

// === ♻️ AUTO SETTINGS RELOAD MIDDLEWARE ===
bot.use((ctx, next) => {
  try {
    delete require.cache[require.resolve("./settings")];
    global.settings = require("./settings");
    console.log("♻️ Settings reloaded otomatis ✅");
  } catch (err) {
    console.error("❌ Gagal reload settings:", err);
  }
  return next();
});

   // === 📄 COMMAND SELURUH FITUR STORE ===

// === 🧑‍💻 ADMIN: TAMBAH PRODUK (pakai code unik + auto file stok + tanpa tampilkan SNK) ===
bot.command("addproduk", async (ctx) => {
  try {
    // 🔐 Cek admin realtime dari settings.js
    if (!isAdminNow(ctx)) return ctx.reply("🚫 Kamu bukan admin.");

    // Ambil argumen dari pesan
    const args = ctx.message.text.split(" ").slice(1).join(" ");
    if (!args.includes("|"))
      return ctx.reply(
        "⚙️ Format salah!\nGunakan format:\n" +
          "/addproduk code|Nama|Deskripsi|Varian1|Harga|Varian2|Harga|"
      );

    // Pisahkan argumen dengan '|', buang elemen kosong biar gak error kalau ada '|' di akhir
    const parts = args
      .split("|")
      .map((x) => x.trim())
      .filter((x) => x !== "");

    const [code, name, desc, ...rest] = parts;

    // Validasi dasar
    if (!code || !name || !desc)
      return ctx.reply(
        "⚠️ Format kurang lengkap. Pastikan ada code, nama, dan deskripsi."
      );

    if (rest.length < 2 || rest.length % 2 !== 0)
      return ctx.reply(
        "⚙️ Format varian & harga tidak valid!\nGunakan format berpasangan: Varian|Harga"
      );

    // === Buat daftar varian ===
    const variants = [];
    for (let i = 0; i < rest.length; i += 2) {
      const vName = rest[i];
      const vPrice = parseInt(rest[i + 1]) || 0;
      variants.push({ name: vName, price: vPrice, stock: 0, snk: "" });
    }

    // === Path file ===
    const stokFolder = path.join(__dirname, "stok");
    const stokFile = path.join(stokFolder, `${code.toLowerCase()}.json`);
    const productsFile = path.join(__dirname, "data", "products.json");

    if (!fs.existsSync(stokFolder))
      fs.mkdirSync(stokFolder, { recursive: true });

    // === Load produk yang sudah ada ===
    let products = [];
    if (fs.existsSync(productsFile)) {
      products = JSON.parse(fs.readFileSync(productsFile, "utf8"));
    }

    // === Cek duplikat berdasarkan code ===
    if (
      products.some(
        (p) => p.code && p.code.toLowerCase() === code.toLowerCase()
      )
    ) {
      return ctx.reply("⚠️ Produk dengan code tersebut sudah terdaftar!");
    }

    // === Buat file stok kosong jika belum ada ===
    if (!fs.existsSync(stokFile)) fs.writeFileSync(stokFile, "[]", "utf8");

    // === Buat produk baru ===
    const newProduct = {
      id: products.length + 1,
      code,
      name,
      desc,
      isImage: false,          // 🧠 default false karena teks-only
      image_url: "-",           // 🧠 tetap ditulis biar format konsisten
      sold: 0,
      variants,
    };

    products.push(newProduct);
// rapihin urutan A→Z berdasarkan nama sebelum disimpan
products.sort((a, b) =>
  String(a.name || "").localeCompare(String(b.name || ""), "id", { sensitivity: "base" })
);
    products.forEach((p, i) => p.id = i + 1);
    fs.writeFileSync(productsFile, JSON.stringify(products, null, 2));

    // === Output “Premium Store” Look ===
    let replyText = [
      `✅ <b>Produk baru berhasil ditambahkan!</b>\n`,
      `╭────────────────────╮`,
      `├ 🏷️ <b>Kode:</b> ${code}`,
      `├ 🛍️ <b>${name}</b>`,
      `├ 💬 ${desc}`,
      `╰────────────────────╯\n`,
      `📦 <b>VARIAN:</b>`,
    ];

    for (const v of variants) {
      replyText.push(`• ${v.name} — 💵 Rp ${v.price.toLocaleString("id-ID")}`);
    }

    replyText.push(`\n🧾 Produk otomatis tersimpan ✅`);

    await ctx.reply(replyText.join("\n"), { parse_mode: "HTML" });
  } catch (err) {
    console.error("❌ Error di /addproduk:", err);
    ctx.reply("❌ Gagal menambahkan produk, cek log server!");
  }
});

// === 🔤 SORT PRODUK A→Z (ADMIN ONLY)
// /sortproduk
bot.command("sortproduk", async (ctx) => {
  try {
    if (!isAdmin(ctx.from.id)) return ctx.reply("🚫 Kamu bukan admin.");
    if (!isAdminNow(ctx)) return ctx.reply("🚫 Kamu bukan admin.");

    const fs = require("fs");
    const path = require("path");
    const file = path.join(__dirname, "data", "products.json");
    if (!fs.existsSync(file)) return ctx.reply("❌ File products.json tidak ditemukan.");

    const list = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(list) || !list.length)
      return ctx.reply("⚠️ Daftar produk kosong.");

    list.sort((p, q) => String(p.name||"").localeCompare(String(q.name||""),
                      "id", { sensitivity: "base" }));

    fs.writeFileSync(file, JSON.stringify(list, null, 2));

    await ctx.reply("✅ <b>Produk berhasil diurutkan (A→Z)</b>", { parse_mode: "HTML" });

    // (opsional) render ulang list
    // await refreshProductList(bot);

  } catch (err) {
    console.error("❌ Error /sortproduk:", err);
    try { await ctx.reply("❌ Gagal memproses /sortproduk, cek log server!"); } catch {}
  }
});

// === 🗑️ HAPUS PRODUK (ADMIN ONLY - DENGAN KONFIRMASI & SINKRON STOK) ===
bot.command("delproduk", async (ctx) => {
  const chatId = String(ctx.chat.id);
  if (!isAdminNow(ctx)) return ctx.reply("🚫 Kamu bukan admin.");

  const code = ctx.message.text.split(" ").slice(1).join(" ").trim();
  if (!code) {
    return ctx.reply("⚠️ Format salah!\nGunakan: /delproduk <code>");
  }

  const filePath = path.join(__dirname, "data", "products.json");
  if (!fs.existsSync(filePath)) {
    return ctx.reply("❌ File products.json tidak ditemukan.");
  }

  let products = [];
  try {
    products = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error("❌ Gagal membaca file:", err);
    return ctx.reply("⚠️ Gagal membaca file data produk.");
  }

  const product = products.find(
    (p) => p.code && p.code.toLowerCase() === code.toLowerCase()
  );
  if (!product) {
    return ctx.reply(`❌ Produk dengan kode <b>${code}</b> tidak ditemukan.`, {
      parse_mode: "HTML",
    });
  }

  // Simpan ke session buat konfirmasi
  ctx.session ??= {};
  ctx.session.deleteProduct = { code, name: product.name };

  // Kirim konfirmasi
  await ctx.reply(
    [
      `⚠️ <b>Konfirmasi Penghapusan Produk</b>`,
      ``,
      `Apakah kamu yakin ingin menghapus produk ini?`,
      ``,
      `🏷️ Kode: <b>${product.code}</b>`,
      `📦 Nama: <b>${product.name}</b>`,
      ``,
      `Tindakan ini <b>tidak bisa dibatalkan!</b>`,
    ].join("\n"),
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ YA, HAPUS", callback_data: "confirm_delproduk_yes" },
            { text: "❌ BATAL", callback_data: "confirm_delproduk_no" },
          ],
        ],
      },
    }
  );
});

// === ✅ Handler tombol "YA" (hapus produk + stok) ===
bot.action("confirm_delproduk_yes", async (ctx) => {
  try {
    const data = ctx.session?.deleteProduct;
    if (!data) return ctx.answerCbQuery("⚠️ Tidak ada produk yang tertunda untuk dihapus.");

    const filePath = path.join(__dirname, "data", "products.json");
    let products = JSON.parse(fs.readFileSync(filePath, "utf8"));

    const index = products.findIndex(
      (p) => p.code && p.code.toLowerCase() === data.code.toLowerCase()
    );
    if (index === -1) {
      return ctx.editMessageText(`❌ Produk <b>${data.code}</b> tidak ditemukan.`, { parse_mode: "HTML" });
    }

    const deleted = products[index];
    products.splice(index, 1);
    // 🧹 reindex ID supaya berurutan sesuai posisi baru
    products.forEach((p, i) => { p.id = i + 1; });
    fs.writeFileSync(filePath, JSON.stringify(products, null, 2));

    // === 🧹 Sinkron hapus file stok ===
    const stokByCode = path.join(__dirname, "stok", `${deleted.code}.json`);
    const stokByName = path.join(__dirname, "stok", `${deleted.name}.json`);

    let stokDeleted = false;
    if (fs.existsSync(stokByCode)) {
      fs.unlinkSync(stokByCode);
      stokDeleted = true;
      console.log(`🧹 File stok dihapus: ${stokByCode}`);
    } else if (fs.existsSync(stokByName)) {
      fs.unlinkSync(stokByName);
      stokDeleted = true;
      console.log(`🧹 File stok dihapus: ${stokByName}`);
    } else {
      console.log(`⚠️ File stok tidak ditemukan untuk ${deleted.name}`);
    }

    await ctx.editMessageText(
      [
        `🗑️ <b>Produk berhasil dihapus!</b>`,
        ``,
        `🏷️ Kode: <b>${deleted.code}</b>`,
        `📦 Nama: <b>${deleted.name}</b>`,
        ``,
        `✅ Data produk telah dihapus dari database.`,
        stokDeleted
          ? `🧹 File stok (${deleted.code}.json) juga dihapus.`
          : ``,
      ].join("\n"),
      { parse_mode: "HTML" }
    );

    delete ctx.session.deleteProduct;
  } catch (err) {
    console.error("❌ Error di confirm_delproduk_yes:", err);
    ctx.reply("⚠️ Terjadi kesalahan saat menghapus produk.");
  }
});

// === ❌ Handler tombol "BATAL" ===
bot.action("confirm_delproduk_no", async (ctx) => {
  await ctx.editMessageText("❎ Penghapusan produk dibatalkan.", {
    parse_mode: "HTML",
  });
  delete ctx.session.deleteProduct;
});

// === 📄 HANDLER ADDSTOK (MULTI EMAIL + DUPLIKAT TAMPIL + COPYABLE + AUTO NUMBER) ===
bot.command("addstok", async (ctx) => {
  try {
    if (!isAdmin(ctx.from.id)) return ctx.reply("🚫 Kamu bukan admin.");
    if (!isAdminNow(ctx)) return ctx.reply("🚫 Kamu bukan admin.");

    const args = ctx.message.text.split(" ").slice(1).join(" ");
    if (!args.includes("|"))
      return ctx.reply(
        "⚙️ Format salah!\nGunakan format:\n/addstok code|varian|email1|pass1|email2|pass2|..."
      );

    // 🧩 FIX: hapus elemen kosong (| di ujung) biar gak error
    const parts = args.split("|").map((x) => x.trim()).filter(Boolean);
    const code = parts[0];
    const inputVarian = parts[1];
    const credentials = parts.slice(2);

    if (!code || !inputVarian || credentials.length < 2)
      return ctx.reply(
        "⚠️ Format kurang lengkap!\nGunakan: /addstok code|varian|email1|pass1|email2|pass2|..."
      );

    if (credentials.length % 2 !== 0)
      return ctx.reply("⚠️ Jumlah email & password tidak seimbang!");

    // === Path file ===
    const stokFolder = path.join(__dirname, "stok");
    const stokFile = path.join(stokFolder, `${code.toLowerCase()}.json`);
    const productsFile = path.join(__dirname, "data", "products.json");

    if (!fs.existsSync(stokFolder)) fs.mkdirSync(stokFolder, { recursive: true });
    if (!fs.existsSync(productsFile))
      return ctx.reply("⚠️ File products.json tidak ditemukan!");

    // === Load produk ===
    const products = JSON.parse(fs.readFileSync(productsFile, "utf8"));
    const product = products.find(
      (p) => p.code && p.code.toLowerCase() === code.toLowerCase()
    );

    if (!product)
      return ctx.reply(`⚠️ Produk dengan kode "${code}" tidak ditemukan di products.json`);

    // === Validasi varian ===
    const targetVarian = product.variants.find(
      (v) => v.name.toLowerCase() === inputVarian.toLowerCase()
    );
    if (!targetVarian)
      return ctx.reply(
        `⚠️ Varian "${inputVarian}" tidak ditemukan dalam produk "${product.name}".`
      );

    const realVarianName = targetVarian.name;

    // === Load stok ===
    if (!fs.existsSync(stokFile)) fs.writeFileSync(stokFile, "[]", "utf8");
    const stokList = JSON.parse(fs.readFileSync(stokFile, "utf8"));

    // Ambil emailCount terakhir
    let lastCount = 0;
    if (stokList.length > 0) {
      const lastItem = stokList[stokList.length - 1];
      lastCount = parseInt(lastItem.emailCount || "0");
    }

    // === Tambahkan banyak email ===
    let addedCount = 0;
    let skippedCount = 0;
    let addedEntries = [];
    let duplicateEntries = [];

    for (let i = 0; i < credentials.length; i += 2) {
      const email = credentials[i];
      const password = credentials[i + 1];
      if (!email || !password) continue;

      const duplicate = stokList.find(
        (s) => s.email.toLowerCase() === email.toLowerCase()
      );
      if (duplicate) {
        skippedCount++;
        duplicateEntries.push(`❌ ${skippedCount}. ${email} | ${password}`);
        continue;
      }

      lastCount++;
      const newEntry = {
        emailCount: String(lastCount),
        varian: realVarianName,
        email,
        password,
        addedAt: new Date().toISOString(),
      };

      stokList.push(newEntry);
      addedCount++;
      addedEntries.push(`🆕 ${addedCount}. ${email} | ${password}`);
    }

    // Simpan stok baru
    fs.writeFileSync(stokFile, JSON.stringify(stokList, null, 2));

    // === Update stok di products.json ===
    const totalForThisVarian = stokList.filter(
      (s) => s.varian && s.varian.toLowerCase() === realVarianName.toLowerCase()
    ).length;
    targetVarian.stock = totalForThisVarian;
    fs.writeFileSync(productsFile, JSON.stringify(products, null, 2));

    // === Output hasil ===
    let replyText = "";

    if (addedCount === 0 && skippedCount > 0) {
      // ❌ Semua duplikat
      replyText = [
        `❌ <b>Gagal menambahkan akun baru!</b> ❌`,
        `⚠️ <b>${skippedCount} duplikat dilewati.⚠️</b>`,
        ``,
        `╭────────────────────╮`,
        `├ 🏷️ <b>Kode:</b> ${code}`,
        `├ 🧩 <b>Varian:</b> ${realVarianName}`,
        `├ 📦 <b>Total stok varian kini:</b> ${totalForThisVarian}`,
        `╰────────────────────╯`,
        ``,
        `⚠️ <b>Akun ini sudah ada di database:</b> ⚠️`,
        `<pre>${duplicateEntries.join("\n")}</pre>`,
      ].join("\n");
    } else {
      // ✅ Ada yang berhasil ditambah
      replyText = [
        `✅ <b>Berhasil menambahkan ${addedCount} akun baru!✅</b>`,
        skippedCount > 0 ? `⚠️ <b>${skippedCount} duplikat dilewati.</b>` : "",
        ``,
        `╭────────────────────╮`,
        `├ 🏷️ <b>Kode:</b> ${code}`,
        `├ 🧩 <b>Varian:</b> ${realVarianName}`,
        `├ 📦 <b>Total stok varian kini:</b> ${totalForThisVarian}`,
        `╰────────────────────╯`,
        ``,
        addedEntries.length > 0
          ? `<b>🆕 Akun yang baru ditambahkan:</b>\n<pre>${addedEntries.join("\n")}</pre>`
          : `⚠️ Tidak ada akun baru yang ditambahkan.⚠️`,
        ``,
        skippedCount > 0
          ? [
              `────────────────────`,
              ``,
              `⚠️ <b>Akun ini sudah ada di database:</b> ⚠️`,
              `<pre>${duplicateEntries.join("\n")}</pre>`,
            ].join("\n")
          : "",
      ].join("\n");
    }

    await ctx.reply(replyText, { parse_mode: "HTML" });
  } catch (err) {
    console.error("❌ Error di /addstok:", err);
    ctx.reply("❌ Gagal menambahkan stok, cek log server!");
  }
});

// === 📄 HANDLER ADDSTOK VIA FILE NOTEPAD (.txt) ===
bot.on("document", async (ctx) => {
  try {
    // 1. Cek Admin
    if (!isAdminNow(ctx)) return;

    const doc = ctx.message.document;
    const caption = ctx.message.caption || "";

    // 2. Cek apakah ini file .txt dan captionnya mengandung keyword /addstok
    if (doc.mime_type === "text/plain" && /^\/?addstok\s+/i.test(caption)) {
      
      const argsText = caption.replace(/^\/?addstok\s+/i, "").trim();
      const parts = argsText.split("|").map(x => x.trim()).filter(Boolean);
      
      // Ambil code dan varian dari caption: /addstok code|varian
      const [code, inputVarian] = parts;

      if (!code || !inputVarian) {
        return ctx.reply("⚠️ Format caption salah!\nGunakan caption: `/addstok code|varian` pada file .txt yang diunggah.");
      }

      await ctx.reply("⏳ Sedang membaca file stok...");

      // 3. Download File dari Telegram
      const fileLink = await ctx.telegram.getFileLink(doc.file_id);
      const response = await axios.get(fileLink.href);
      const fileContent = response.data; // Isi notepad

      // 4. Parsing isi notepad (asumsi isi: email|pass per baris atau email:pass)
      // Kita bersihkan baris kosong dan pecah menjadi array credentials
      const credentials = fileContent
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.includes("|") || line.includes(":"))
        .map(line => line.replace(":", "|")) // seragamkan pemisah ke "|"
        .join("|")
        .split("|")
        .map(x => x.trim());

      if (credentials.length < 2) {
        return ctx.reply("❌ Isi file notepad kosong atau format salah. Pastikan isi perbaris: `email|password` atau `email:password`.");
      }

      // 5. Gunakan Logic yang sama dengan /addstok teks
      const productsFile = path.join(__dirname, "data", "products.json");
      const stokFolder = path.join(__dirname, "stok");
      const stokFile = path.join(stokFolder, `${code.toLowerCase()}.json`);

      let products = JSON.parse(fs.readFileSync(productsFile, "utf8"));
      const product = products.find(p => p.code?.toLowerCase() === code.toLowerCase());

      if (!product) return ctx.reply(`⚠️ Produk "${code}" tidak ditemukan.`);
      
      const targetVarian = product.variants.find(v => v.name.toLowerCase() === inputVarian.toLowerCase());
      if (!targetVarian) return ctx.reply(`⚠️ Varian "${inputVarian}" tidak ditemukan.`);

      if (!fs.existsSync(stokFile)) fs.writeFileSync(stokFile, "[]", "utf8");
      let stokList = JSON.parse(fs.readFileSync(stokFile, "utf8"));

      let lastCount = stokList.length > 0 ? parseInt(stokList[stokList.length - 1].emailCount || "0") : 0;
      let addedCount = 0;
      let skippedCount = 0;

      for (let i = 0; i < credentials.length; i += 2) {
        const email = credentials[i];
        const password = credentials[i + 1];
        if (!email || !password) continue;

        if (stokList.find(s => s.email.toLowerCase() === email.toLowerCase())) {
          skippedCount++;
          continue;
        }

        lastCount++;
        stokList.push({
          emailCount: String(lastCount),
          varian: targetVarian.name,
          email,
          password,
          addedAt: new Date().toISOString()
        });
        addedCount++;
      }

      // 6. Simpan Hasil
      fs.writeFileSync(stokFile, JSON.stringify(stokList, null, 2));
      targetVarian.stock = stokList.filter(s => s.varian === targetVarian.name).length;
      fs.writeFileSync(productsFile, JSON.stringify(products, null, 2));

      await ctx.reply(
        `✅ <b>Berhasil Import dari Notepad!</b>\n\n` +
        `📦 Produk: <b>${product.name}</b>\n` +
        `🧩 Varian: <b>${targetVarian.name}</b>\n` +
        `🟢 Berhasil: <b>${addedCount} Akun</b>\n` +
        `🟡 Duplikat (Skip): <b>${skippedCount} Akun</b>\n` +
        `📊 Total Stok: <b>${targetVarian.stock}</b>`,
        { parse_mode: "HTML" }
      );
    }
  } catch (err) {
    console.error("❌ Error import stok notepad:", err);
    ctx.reply("❌ Terjadi kesalahan saat memproses file.");
  }
});

// === 🗑️ HANDLER DELSTOK (hapus stok lama - FIFO + per varian + sinkron ke /data/products.json) ===
bot.command("delstok", async (ctx) => {
  try {
    if (!isAdmin(ctx.from.id)) return ctx.reply("🚫 Kamu bukan admin.");
    if (!isAdminNow(ctx)) return ctx.reply("🚫 Kamu bukan admin.");

    const args = ctx.message.text.split(" ").slice(1).join(" ");
    if (!args.includes("|"))
      return ctx.reply("⚙️ Format salah!\nGunakan format:\n/delstok code|varian|jumlah");

    const parts = args.split("|").map((x) => x.trim());
    const [code, varianInput, jumlahStr] = parts;
    const jumlah = parseInt(jumlahStr);

    if (!code || !varianInput || isNaN(jumlah))
      return ctx.reply("⚠️ Format salah!\nGunakan: /delstok code|varian|jumlah");

    // === Path file (pakai root project) ===
    const stokFolder   = path.join(process.cwd(), "stok");
    const stokFile     = path.join(stokFolder, `${code.toLowerCase()}.json`);
    const productsFile = path.join(process.cwd(), "data", "products.json");

    if (!fs.existsSync(stokFile))
      return ctx.reply(`⚠️ File stok untuk kode "${code}" tidak ditemukan!`);

    if (!fs.existsSync(productsFile))
      return ctx.reply("⚠️ File products.json tidak ditemukan!");

    // === Baca produk dari products.json ===
    const products = JSON.parse(fs.readFileSync(productsFile, "utf8"));
    const product = products.find(
      (p) => p.code && p.code.toLowerCase() === code.toLowerCase()
    );

    if (!product)
      return ctx.reply(`⚠️ Produk dengan kode "${code}" tidak ditemukan di products.json`);

    // === Cari varian di products.json ===
    const targetVarian = product.variants.find(
      (v) => v.name.toLowerCase() === varianInput.toLowerCase()
    );

    if (!targetVarian)
      return ctx.reply(
        `⚠️ Varian "${varianInput}" tidak ditemukan dalam produk "${product.name}".`
      );

    // Pastikan nama varian konsisten (misal: "IPHONE" jadi "iPhone")
    const varianName = targetVarian.name;

    // === Baca stok file ===
    const stokList = JSON.parse(fs.readFileSync(stokFile, "utf8"));
    const stokVarian = stokList.filter(
      (s) => s.varian && s.varian.toLowerCase() === varianName.toLowerCase()
    );

    if (stokVarian.length === 0)
      return ctx.reply(`⚠️ Tidak ada stok untuk varian "${varianName}".`);

    if (jumlah > stokVarian.length)
      return ctx.reply(`⚠️ Jumlah yang diminta (${jumlah}) melebihi stok varian (${stokVarian.length}).`);

    // === FIFO: hapus stok paling lama dari varian ini ===
    let removedCount = 0;
    const newStokList = [];
    for (const item of stokList) {
      if (
        item.varian &&
        item.varian.toLowerCase() === varianName.toLowerCase() &&
        removedCount < jumlah
      ) {
        removedCount++;
        continue; // skip item yang dihapus
      }
      newStokList.push(item);
    }

    fs.writeFileSync(stokFile, JSON.stringify(newStokList, null, 2));

    // === Update stok di products.json ===
    const newVarianCount = newStokList.filter(
      (s) => s.varian && s.varian.toLowerCase() === varianName.toLowerCase()
    ).length;

    targetVarian.stock = newVarianCount;
    fs.writeFileSync(productsFile, JSON.stringify(products, null, 2));

    // === Output premium-style ===
    const replyText = [
      `🗑️ <b>Stok berhasil dihapus!</b>\n`,
      `╭────────────────────╮`,
      `├ 🏷️ <b>Kode:</b> ${code}`,
      `├ 🧩 <b>Varian:</b> ${varianName}`,
      `├ ❌ <b>Dihapus:</b> ${jumlah} akun`,
      `├ 🔄 <b>Mode:</b> FIFO (stok lama dulu)`,
      `╰────────────────────╯\n`,
      `📉 <b>Sisa stok varian:</b> ${newVarianCount}`,
      `✅ Sinkronisasi data berhasil.`,
    ].join("\n");

    await ctx.reply(replyText, { parse_mode: "HTML" });

  } catch (err) {
    console.error("❌ Error di /delstok:", err);
    ctx.reply("❌ Gagal menghapus stok, cek log server!");
  }
});


// === 📝 EDIT DESKRIPSI PRODUK (ADMIN ONLY - FORMAT: /editdesk code|deskripsibaru) ===
bot.command("editdesk", async (ctx) => {
  const chatId = String(ctx.chat.id);
  if (!isAdminNow(ctx)) return ctx.reply("🚫 Kamu bukan admin.");

  const input = ctx.message.text.split(" ").slice(1).join(" ");
  if (!input.includes("|")) {
    return ctx.reply("⚠️ Format salah!\nGunakan: /editdesk <code>|<deskripsibaru>");
  }

  const [code, newDesc] = input.split("|").map((s) => s.trim());
  if (!code || !newDesc) {
    return ctx.reply("⚠️ Format tidak lengkap!\nContoh: /editdesk am|Garansi resmi 1 tahun dan support update");
  }

  const filePath = path.join(__dirname, "data", "products.json");
  if (!fs.existsSync(filePath)) {
    return ctx.reply("❌ File products.json tidak ditemukan.");
  }

  // Baca data produk
  let products = [];
  try {
    products = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error("❌ Gagal membaca products.json:", err);
    return ctx.reply("⚠️ Gagal membaca file data produk.");
  }

  // Cari produk berdasarkan kode
  const product = products.find(
    (p) => p.code && p.code.toLowerCase() === code.toLowerCase()
  );

  if (!product) {
    return ctx.reply(`❌ Produk dengan kode <b>${code}</b> tidak ditemukan.`, {
      parse_mode: "HTML",
    });
  }

  const oldDesc = product.desc || "(kosong)";
  product.desc = newDesc;

  // Simpan perubahan ke file
  try {
    fs.writeFileSync(filePath, JSON.stringify(products, null, 2));
  } catch (err) {
    console.error("❌ Gagal menyimpan file:", err);
    return ctx.reply("⚠️ Gagal menyimpan perubahan ke file data.");
  }

  // Kirim konfirmasi ke admin
  ctx.reply(
    [
      `✅ <b>Deskripsi produk berhasil diubah!</b>`,
      ``,
      `🏷️ Kode: <b>${product.code}</b>`,
      `📄 Sebelumnya:\n<s>${oldDesc}</s>`,
      ``,
      `🆕 Sekarang:\n<b>${newDesc}</b>`,
    ].join("\n"),
    { parse_mode: "HTML" }
  );
});

// === ➕ TAMBAH VARIAN BARU (ADMIN ONLY - FORMAT: /addvar code|VarianBaru|Harga) ===
bot.command("addvar", async (ctx) => {
  const chatId = String(ctx.chat.id);
  if (!isAdminNow(ctx)) return ctx.reply("🚫 Kamu bukan admin.");

  const input = ctx.message.text.split(" ").slice(1).join(" ");
  if (!input.includes("|")) {
    return ctx.reply("⚠️ Format salah!\nGunakan: /addvar <code>|<VarianBaru>|<Harga>");
  }

  const [code, varName, priceInput] = input.split("|").map((s) => s.trim());
  if (!code || !varName) {
    return ctx.reply("⚠️ Format tidak lengkap!\nContoh: /addvar am|Android Pro|5000");
  }

  const price = Number(priceInput) || 0;

  const filePath = path.join(__dirname, "data", "products.json");
  if (!fs.existsSync(filePath)) {
    return ctx.reply("❌ File products.json tidak ditemukan.");
  }

  // Baca data produk
  let products = [];
  try {
    products = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error("❌ Gagal membaca products.json:", err);
    return ctx.reply("⚠️ Gagal membaca file data produk.");
  }

  // Cari produk berdasarkan kode
  const product = products.find(
    (p) => p.code && p.code.toLowerCase() === code.toLowerCase()
  );

  if (!product) {
    return ctx.reply(`❌ Produk dengan kode <b>${code}</b> tidak ditemukan.`, {
      parse_mode: "HTML",
    });
  }

  // Cek apakah varian sudah ada
  const exists = product.variants.some(
    (v) => v.name.toLowerCase() === varName.toLowerCase()
  );
  if (exists) {
    return ctx.reply(
      `⚠️ Varian <b>${varName}</b> sudah ada di produk <b>${product.name}</b>.`,
      { parse_mode: "HTML" }
    );
  }

  // Tambah varian baru
  const newVariant = {
    name: varName,
    price: price,
    stock: 0,
    snk: "",
  };
  product.variants.push(newVariant);

  // Simpan ke file
  try {
    fs.writeFileSync(filePath, JSON.stringify(products, null, 2));
  } catch (err) {
    console.error("❌ Gagal menulis file:", err);
    return ctx.reply("⚠️ Gagal menyimpan perubahan ke file data.");
  }

  // Kirim konfirmasi
  ctx.reply(
    [
      `✅ <b>Varian baru berhasil ditambahkan!</b>`,
      ``,
      `🏷️ Kode Produk: <b>${product.code}</b>`,
      `📦 Produk: <b>${product.name}</b>`,
      `🆕 Varian: <b>${varName}</b>`,
      `💵 Harga awal: Rp ${price.toLocaleString("id-ID")}`,
      `📦 Stok awal: 0`,
    ].join("\n"),
    { parse_mode: "HTML" }
  );
});

// === 🧩 EDIT NAMA VARIAN PRODUK (ADMIN ONLY - FORMAT: /editvar code|varianlama|varianbaru) ===
bot.command("editvar", async (ctx) => {
  const chatId = String(ctx.chat.id);
  if (!isAdminNow(ctx)) return ctx.reply("🚫 Kamu bukan admin.");

  const input = ctx.message.text.split(" ").slice(1).join(" ");
  if (!input.includes("|")) {
    return ctx.reply("⚠️ Format salah!\nGunakan: /editvar <code>|<varianlama>|<varianbaru>");
  }

  const [code, oldVar, newVar] = input.split("|").map((s) => s.trim());
  if (!code || !oldVar || !newVar) {
    return ctx.reply("⚠️ Format tidak lengkap!\nContoh: /editvar am|Android|Android Premium");
  }

  const productPath = path.join(__dirname, "data", "products.json");
  if (!fs.existsSync(productPath)) {
    return ctx.reply("❌ File products.json tidak ditemukan.");
  }

  let products = [];
  try {
    products = JSON.parse(fs.readFileSync(productPath, "utf8"));
  } catch (err) {
    console.error("❌ Gagal membaca products.json:", err);
    return ctx.reply("⚠️ Gagal membaca file data produk.");
  }

  // === Cari produk berdasarkan kode
  const product = products.find(
    (p) => p.code && p.code.toLowerCase() === code.toLowerCase()
  );

  if (!product) {
    return ctx.reply(`❌ Produk dengan kode <b>${code}</b> tidak ditemukan.`, {
      parse_mode: "HTML",
    });
  }

  // === Cari varian lama
  const variant = product.variants.find(
    (v) => v.name.toLowerCase() === oldVar.toLowerCase()
  );

  if (!variant) {
    return ctx.reply(
      `❌ Varian <b>${oldVar}</b> tidak ditemukan pada produk <b>${product.name}</b>.`,
      { parse_mode: "HTML" }
    );
  }

  const oldName = variant.name;
  variant.name = newVar;

  // === Simpan perubahan di products.json
  try {
    fs.writeFileSync(productPath, JSON.stringify(products, null, 2));
  } catch (err) {
    console.error("❌ Gagal menyimpan file:", err);
    return ctx.reply("⚠️ Gagal menyimpan perubahan ke file data.");
  }

  // === Sinkron ke file stok/<code>.json
  const stokPath = path.join(__dirname, "stok", `${code.toLowerCase()}.json`);
  let stokUpdated = 0;
  let stokExists = fs.existsSync(stokPath);

  if (stokExists) {
    try {
      const stokData = JSON.parse(fs.readFileSync(stokPath, "utf8"));
      stokData.forEach((item) => {
        if (item.varian && item.varian.toLowerCase() === oldVar.toLowerCase()) {
          item.varian = newVar;
          stokUpdated++;
        }
      });
      fs.writeFileSync(stokPath, JSON.stringify(stokData, null, 2));
    } catch (err) {
      console.error("⚠️ Gagal memperbarui file stok:", err);
      stokExists = false;
    }
  }

  // === OUTPUT
  if (stokExists && stokUpdated > 0) {
    // ✅ BERHASIL
    await ctx.reply(
      [
        `✅ <b>Nama varian berhasil diubah!</b>`,
        ``,
        `🏷️ Kode Produk: <b>${product.code}</b>`,
        `📦 Produk: <b>${product.name}</b>`,
        `🔸 Dari: <s>${oldName}</s>`,
        `➡️ Ke: <b>${newVar}</b>`,
        `🧾 Sinkronisasi: <b>${stokUpdated}</b> stok di database diperbarui ✅`,
      ].join("\n"),
      { parse_mode: "HTML" }
    );
  } else {
    // ❌ GAGAL (ga ada stok file)
    await ctx.reply(
      [
        `❌ <b>Nama varian berhasil diubah di products.json,</b>`,
        `namun gagal sinkronisasi ke stok! ⚠️`,
        ``,
        `🏷️ Kode Produk: <b>${product.code}</b>`,
        `📦 Produk: <b>${product.name}</b>`,
        `🔸 Dari: <s>${oldName}</s>`,
        `➡️ Ke: <b>${newVar}</b>`,
        ``,
        `🚫 Tidak ditemukan file stok untuk kode <b>${code}</b> atau varian <b>${oldVar}</b>.`,
        `ℹ️ Tambahkan stok terlebih dahulu agar bisa disinkronkan.`,
      ].join("\n"),
      { parse_mode: "HTML" }
    );
  }
});

// === 🗑️ HAPUS VARIAN PRODUK (ADMIN ONLY - FORMAT: /delvar code|varian) ===
bot.command("delvar", async (ctx) => {
  const chatId = String(ctx.chat.id);
  if (!isAdminNow(ctx)) return ctx.reply("🚫 Kamu bukan admin.");

  const input = ctx.message.text.split(" ").slice(1).join(" ");
  if (!input.includes("|")) {
    return ctx.reply("⚠️ Format salah!\nGunakan: /delvar <code>|<varian>");
  }

  const [code, varName] = input.split("|").map((s) => s.trim());
  if (!code || !varName) {
    return ctx.reply("⚠️ Format tidak lengkap!\nContoh: /delvar am|Android");
  }

  const filePath = path.join(__dirname, "data", "products.json");
  if (!fs.existsSync(filePath)) {
    return ctx.reply("❌ File products.json tidak ditemukan.");
  }

  // Baca data produk
  let products = [];
  try {
    products = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error("❌ Gagal membaca products.json:", err);
    return ctx.reply("⚠️ Gagal membaca file data produk.");
  }

  // Cari produk berdasarkan kode
  const product = products.find(
    (p) => p.code && p.code.toLowerCase() === code.toLowerCase()
  );

  if (!product) {
    return ctx.reply(`❌ Produk dengan kode <b>${code}</b> tidak ditemukan.`, {
      parse_mode: "HTML",
    });
  }

  if (!product.variants || product.variants.length === 0) {
    return ctx.reply(
      `⚠️ Produk <b>${product.name}</b> belum memiliki varian.`,
      { parse_mode: "HTML" }
    );
  }

  // Cari index varian yang mau dihapus
  const index = product.variants.findIndex(
    (v) => v.name.toLowerCase() === varName.toLowerCase()
  );

  if (index === -1) {
    return ctx.reply(
      `❌ Varian <b>${varName}</b> tidak ditemukan pada produk <b>${product.name}</b>.`,
      { parse_mode: "HTML" }
    );
  }

  const deletedVariant = product.variants[index];
  product.variants.splice(index, 1);

  // Simpan perubahan
  try {
    fs.writeFileSync(filePath, JSON.stringify(products, null, 2));
  } catch (err) {
    console.error("❌ Gagal menyimpan file:", err);
    return ctx.reply("⚠️ Gagal menyimpan perubahan ke file data.");
  }

  ctx.reply(
    [
      `🗑️ <b>Varian berhasil dihapus!</b>`,
      ``,
      `🏷️ Kode Produk: <b>${product.code}</b>`,
      `📦 Produk: <b>${product.name}</b>`,
      `❌ Varian Dihapus: <b>${deletedVariant.name}</b>`,
    ].join("\n"),
    { parse_mode: "HTML" }
  );
});

// === ✏️ EDIT NAMA PRODUK (ADMIN ONLY - FORMAT: /editnama code|namabaru) ===
bot.command("editnama", async (ctx) => {
  const chatId = String(ctx.chat.id);
  if (!isAdminNow(ctx)) return ctx.reply("🚫 Kamu bukan admin.");

  const input = ctx.message.text.split(" ").slice(1).join(" ");
  if (!input.includes("|")) {
    return ctx.reply("⚠️ Format salah!\nGunakan: /editnama <code>|<namabaru>");
  }

  const [code, newName] = input.split("|").map((s) => s.trim());
  if (!code || !newName) {
    return ctx.reply("⚠️ Format tidak lengkap!\nContoh: /editnama am|Alight Motion Premium");
  }

  // pakai root project
  const filePath = path.join(process.cwd(), "data", "products.json");
  if (!fs.existsSync(filePath)) {
    return ctx.reply("❌ File products.json tidak ditemukan.");
  }

  // Baca semua produk
  let products = [];
  try {
    products = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error("❌ Gagal membaca products.json:", err);
    return ctx.reply("⚠️ Gagal membaca file data produk.");
  }

  // Cari produk berdasarkan kode
  const product = products.find(
    (p) => p.code && p.code.toLowerCase() === code.toLowerCase()
  );

  if (!product) {
    return ctx.reply(`❌ Produk dengan kode <b>${code}</b> tidak ditemukan.`, {
      parse_mode: "HTML",
    });
  }

  const oldName = product.name;
  product.name = newName;

  try {
    fs.writeFileSync(filePath, JSON.stringify(products, null, 2));
  } catch (err) {
    console.error("❌ Gagal menulis file:", err);
    return ctx.reply("⚠️ Gagal menyimpan perubahan ke file data.");
  }

  // ✅ Beri notifikasi sukses
  ctx.reply(
    [
      `✅ <b>Nama produk berhasil diubah!</b>`,
      ``,
      `🏷️ Kode: <b>${product.code}</b>`,
      `📦 Dari: <s>${oldName}</s>`,
      `➡️ Ke: <b>${newName}</b>`,
    ].join("\n"),
    { parse_mode: "HTML" }
  );
});

// === 💰 EDIT HARGA VARIAN PRODUK (ADMIN ONLY - FORMAT: /editharga code|varian|hargabaru) ===
bot.command("editharga", async (ctx) => {
  const chatId = String(ctx.chat.id);
  if (!isAdminNow(ctx)) return ctx.reply("🚫 Kamu bukan admin.");

  const input = ctx.message.text.split(" ").slice(1).join(" ");
  if (!input.includes("|")) {
    return ctx.reply(
      "⚠️ Format salah!\nGunakan: /editharga <code>|<varian>|<hargabaru>"
    );
  }

  const [code, inputVarian, hargaBaruStr] = input.split("|").map((s) => s.trim());
  if (!code || !inputVarian || !hargaBaruStr) {
    return ctx.reply(
      "⚠️ Format tidak lengkap!\nContoh: /editharga am|Android Premium|15000"
    );
  }

  const hargaBaru = parseInt(hargaBaruStr);
  if (isNaN(hargaBaru) || hargaBaru <= 0) {
    return ctx.reply("⚠️ Harga baru harus berupa angka positif!");
  }

  const filePath = path.join(__dirname, "data", "products.json");
  if (!fs.existsSync(filePath)) {
    return ctx.reply("❌ File products.json tidak ditemukan.");
  }

  // === Load data produk ===
  let products = [];
  try {
    products = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error("❌ Gagal membaca products.json:", err);
    return ctx.reply("⚠️ Gagal membaca file data produk.");
  }

  // === Cari produk berdasarkan kode
  const product = products.find(
    (p) => p.code && p.code.toLowerCase() === code.toLowerCase()
  );
  if (!product) {
    return ctx.reply(`❌ Produk dengan kode <b>${code}</b> tidak ditemukan.`, {
      parse_mode: "HTML",
    });
  }

  // === Cari varian
  const variant = product.variants.find(
    (v) => v.name.toLowerCase() === inputVarian.toLowerCase()
  );
  if (!variant) {
    return ctx.reply(
      `❌ Varian <b>${inputVarian}</b> tidak ditemukan pada produk <b>${product.name}</b>.`,
      { parse_mode: "HTML" }
    );
  }

  const oldPrice = variant.price ?? 0;
  variant.price = hargaBaru;

  // === Simpan perubahan
  try {
    fs.writeFileSync(filePath, JSON.stringify(products, null, 2));
  } catch (err) {
    console.error("❌ Gagal menyimpan file:", err);
    return ctx.reply("⚠️ Gagal menyimpan perubahan ke file data.");
  }

  // === Output sukses
  ctx.reply(
    [
      `✅ <b>Harga varian berhasil diubah!</b>`,
      ``,
      `🏷️ Kode Produk: <b>${product.code}</b>`,
      `📦 Produk: <b>${product.name}</b>`,
      `🧩 Varian: <b>${variant.name}</b>`,
      `💰 Dari: <b>${oldPrice}</b> ➡️ <b>${hargaBaru}</b>`,
      ``,
      `🧾 Data tersimpan ke <b>products.json</b> ✅`,
    ].join("\n"),
    { parse_mode: "HTML" }
  );
});

// === 📜 TAMBAH S&K VARIAN PRODUK (ADMIN ONLY - FORMAT: /addsnk code|varian|snk) ===
bot.command("addsnk", async (ctx) => {
  const chatId = String(ctx.chat.id);
  if (!isAdminNow(ctx)) return ctx.reply("🚫 Kamu bukan admin.");

  const input = ctx.message.text.split(" ").slice(1).join(" ");
  if (!input.includes("|")) {
    return ctx.reply(
      "⚠️ Format salah!\nGunakan: /addsnk <code>|<varian>|<snk>"
    );
  }

  const [code, inputVarian, ...snkParts] = input.split("|").map((s) => s.trim());
  const newSnk = snkParts.join("|"); // supaya aman kalau teks ada tanda "|"

  if (!code || !inputVarian || !newSnk) {
    return ctx.reply(
      "⚠️ Format tidak lengkap!\nContoh: /addsnk am|Android Premium|Akun hanya garansi login 6 bulan, tidak ada refund."
    );
  }

  const filePath = path.join(__dirname, "data", "products.json");
  if (!fs.existsSync(filePath)) {
    return ctx.reply("❌ File products.json tidak ditemukan.");
  }

  // === Load produk ===
  let products = [];
  try {
    products = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error("❌ Gagal membaca products.json:", err);
    return ctx.reply("⚠️ Gagal membaca file data produk.");
  }

  // === Cari produk berdasarkan kode
  const product = products.find(
    (p) => p.code && p.code.toLowerCase() === code.toLowerCase()
  );
  if (!product) {
    return ctx.reply(`❌ Produk dengan kode <b>${code}</b> tidak ditemukan.`, {
      parse_mode: "HTML",
    });
  }

  // === Cari varian
  const variant = product.variants.find(
    (v) => v.name.toLowerCase() === inputVarian.toLowerCase()
  );
  if (!variant) {
    return ctx.reply(
      `❌ Varian <b>${inputVarian}</b> tidak ditemukan pada produk <b>${product.name}</b>.`,
      { parse_mode: "HTML" }
    );
  }

  // === Cek apakah S&K sudah ada
  if (variant.snk && variant.snk.trim() !== "") {
    return ctx.reply(
      `⚠️ Varian <b>${variant.name}</b> sudah memiliki S&K!\nGunakan <b>/editsnk</b> untuk mengubahnya.`,
      { parse_mode: "HTML" }
    );
  }

  // === Tambahkan S&K baru
  variant.snk = newSnk;

  // === Simpan perubahan
  try {
    fs.writeFileSync(filePath, JSON.stringify(products, null, 2));
  } catch (err) {
    console.error("❌ Gagal menyimpan file:", err);
    return ctx.reply("⚠️ Gagal menyimpan perubahan ke file data.");
  }

  // === Output sukses
  ctx.reply(
    [
      `✅ <b>S&K baru berhasil ditambahkan!</b>`,
      ``,
      `🏷️ Kode Produk: <b>${product.code}</b>`,
      `📦 Produk: <b>${product.name}</b>`,
      `🧩 Varian: <b>${variant.name}</b>`,
      ``,
      `📄 <b>S&K Baru:</b>\n<code>${newSnk}</code>`,
      ``,
      `🧾 Data tersimpan ke <b>products.json</b> ✅`,
    ].join("\n"),
    { parse_mode: "HTML" }
  );
});

// === 📝 EDIT S&K VARIAN PRODUK (ADMIN ONLY - FORMAT: /editsnk code|varian|snkbaru) ===
bot.command("editsnk", async (ctx) => {
  const chatId = String(ctx.chat.id);
  if (!isAdminNow(ctx)) return ctx.reply("🚫 Kamu bukan admin.");

  const input = ctx.message.text.split(" ").slice(1).join(" ");
  if (!input.includes("|")) {
    return ctx.reply(
      "⚠️ Format salah!\nGunakan: /editsnk <code>|<varian>|<snkbaru>"
    );
  }

  const [code, inputVarian, ...snkParts] = input.split("|").map((s) => s.trim());
  const newSnk = snkParts.join("|"); // biar aman kalau teks S&K-nya pakai '|'

  if (!code || !inputVarian || !newSnk) {
    return ctx.reply(
      "⚠️ Format tidak lengkap!\nContoh: /editsnk am|Android Premium|Akun hanya garansi login 6 bulan, tidak ada refund."
    );
  }

  const filePath = path.join(__dirname, "data", "products.json");
  if (!fs.existsSync(filePath)) {
    return ctx.reply("❌ File products.json tidak ditemukan.");
  }

  // === Load file produk
  let products = [];
  try {
    products = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error("❌ Gagal membaca products.json:", err);
    return ctx.reply("⚠️ Gagal membaca file data produk.");
  }

  // === Cari produk berdasarkan kode
  const product = products.find(
    (p) => p.code && p.code.toLowerCase() === code.toLowerCase()
  );
  if (!product) {
    return ctx.reply(`❌ Produk dengan kode <b>${code}</b> tidak ditemukan.`, {
      parse_mode: "HTML",
    });
  }

  // === Cari varian
  const variant = product.variants.find(
    (v) => v.name.toLowerCase() === inputVarian.toLowerCase()
  );
  if (!variant) {
    return ctx.reply(
      `❌ Varian <b>${inputVarian}</b> tidak ditemukan pada produk <b>${product.name}</b>.`,
      { parse_mode: "HTML" }
    );
  }

  // === Cek apakah sudah ada S&K
  const oldSnk = variant.snk || "(belum ada)";
  variant.snk = newSnk;

  // === Simpan perubahan
  try {
    fs.writeFileSync(filePath, JSON.stringify(products, null, 2));
  } catch (err) {
    console.error("❌ Gagal menyimpan file:", err);
    return ctx.reply("⚠️ Gagal menyimpan perubahan ke file data.");
  }

  // === Output sukses
  ctx.reply(
    [
      `✅ <b>S&K berhasil diperbarui!</b>`,
      ``,
      `🏷️ Kode Produk: <b>${product.code}</b>`,
      `📦 Produk: <b>${product.name}</b>`,
      `🧩 Varian: <b>${variant.name}</b>`,
      ``,
      `📄 <b>S&K Lama:</b>\n<code>${oldSnk}</code>`,
      ``,
      `🆕 <b>S&K Baru:</b>\n<code>${newSnk}</code>`,
      ``,
      `🧾 Perubahan telah disimpan ke <b>products.json</b> ✅`,
    ].join("\n"),
    { parse_mode: "HTML" }
  );
});

// === ❌ /delsnk — Hapus S&K varian produk (ADMIN ONLY) ===
bot.command("delsnk", async (ctx) => {
  try {
    // 🔐 Cek admin realtime dari settings.js
    if (!isAdminNow(ctx)) return ctx.reply("🚫 Kamu bukan admin.");

    // 🧾 Ambil argumen
    const args = ctx.message.text.split(" ").slice(1).join(" ");
    if (!args.includes("|"))
      return ctx.reply("⚙️ Format salah!\nGunakan format:\n/delsnk code|varian");

    const [code, varianName] = args.split("|").map((x) => x.trim());
    if (!code || !varianName)
      return ctx.reply("⚠️ Format kurang lengkap!\nGunakan: /delsnk code|varian");

    const filePath = path.join(__dirname, "data", "products.json");
    if (!fs.existsSync(filePath)) {
      return ctx.reply("❌ File products.json tidak ditemukan.");
    }

    // 🔁 Load file produk (auto reload)
    delete require.cache[require.resolve("./data/products.json")];
    const products = JSON.parse(fs.readFileSync(filePath, "utf8"));

    // 🔍 Cari produk berdasarkan code
    const product = products.find(
      (p) => p.code && p.code.toLowerCase() === code.toLowerCase()
    );
    if (!product)
      return ctx.reply(`❌ Produk dengan kode <b>${code}</b> tidak ditemukan.`, {
        parse_mode: "HTML",
      });

    // 🔍 Cari varian berdasarkan nama
    const variant = product.variants.find(
      (v) => v.name.toLowerCase() === varianName.toLowerCase()
    );
    if (!variant)
      return ctx.reply(
        `❌ Varian <b>${varianName}</b> tidak ditemukan pada produk <b>${product.name}</b>.`,
        { parse_mode: "HTML" }
      );

    // 🚫 Kalau S&K belum ada
    if (!variant.snk || variant.snk.trim() === "")
      return ctx.reply(
        `ℹ️ Varian <b>${variant.name}</b> belum memiliki S&K untuk dihapus.`,
        { parse_mode: "HTML" }
      );

    // 🔥 Hapus isi S&K
    variant.snk = "";

    // 💾 Simpan ulang ke file
    fs.writeFileSync(filePath, JSON.stringify(products, null, 2), "utf8");

    // 💬 Respon sukses
    await ctx.reply(
      [
        `✅ <b>S&K berhasil dihapus!</b>`,
        ``,
        `🏷️ Kode Produk: <b>${product.code}</b>`,
        `📦 Produk: <b>${product.name}</b>`,
        `🧩 Varian: <b>${variant.name}</b>`,
        ``,
        `🧾 File diperbarui: <code>products.json</code> ✅`,
      ].join("\n"),
      { parse_mode: "HTML" }
    );

    console.log(
      `🧹 S&K dihapus oleh ${ctx.from.username || ctx.from.id}: ${code} | ${variant.name}`
    );
  } catch (err) {
    console.error("❌ Error di /delsnk:", err);
    ctx.reply("⚠️ Terjadi kesalahan saat menghapus S&K.");
  }
});

// === 📦 SETTINGS PATH (gabung total config + izin) ===
const settingsPath = path.join(__dirname, "settings.js");

// helper: normalisasi izin jadi boolean isPublic
function isCekSnkPublic(val) {
  // boolean langsung dipakai
  if (typeof val === "boolean") return val;

  const s = String(val || "").toLowerCase().trim();
  // mode admin only
  if (s === "false" || s.includes("admin") || s.includes("🔐")) return false;
  // mode publik
  if (s === "true" || s.includes("publik") || s.includes("semua") || s.includes("🌐")) return true;

  // default safety: anggap admin-only kalau nilainya aneh/kosong
  return false;
}

// === 📜 CEK S&K VARIAN PRODUK (ADMIN / USER SESUAI SETTINGS.JS) ===
bot.command("ceksnk", async (ctx) => {
  try {
    const fs = require("fs");
    const path = require("path");

    // helper kecil
    const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const loadSettings = () => {
      const settingsPath = path.resolve("./settings.js");
      delete require.cache[require.resolve(settingsPath)];
      return require(settingsPath);
    };
    const isPublic = (settings) => Boolean(settings?.izin?.allowUserCekSnk === true);
    const isAdminId = (id, settings) => {
      const uid = String(id);
      return Boolean(settings?.admins?.some(a => String(a?.id) === uid));
    };

    const settings = loadSettings();
    const publicMode = isPublic(settings);

    // 🔐 kalau bukan public dan user bukan admin => tolak
    if (!publicMode && !isAdminId(ctx.from?.id, settings)) {
      return ctx.reply("🚫 Perintah ini hanya dapat digunakan oleh admin.");
    }

    // ambil argumen "/ceksnk <code>|<varian>"
    const input = (ctx.message?.text || "").split(" ").slice(1).join(" ").trim();
    if (!input || !input.includes("|")) {
      return ctx.reply("⚠️ Format salah!\nGunakan: /ceksnk <code>|<varian>");
    }

    const [rawCode, rawVarian] = input.split("|").map(s => s.trim());
    if (!rawCode || !rawVarian) {
      return ctx.reply("⚠️ Format tidak lengkap!\nContoh: /ceksnk am|Android");
    }

    const filePath = path.resolve("data/products.json");
    if (!fs.existsSync(filePath)) {
      return ctx.reply("❌ File products.json tidak ditemukan.");
    }

    let products;
    try {
      products = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
      return ctx.reply("❌ Gagal membaca products.json.");
    }

    // cari produk by code (case-insensitive)
    const code = rawCode.toLowerCase();
    const product = (products || []).find(p => String(p?.code || "").toLowerCase() === code);
    if (!product) {
      return ctx.reply(`❌ Produk dengan kode <b>${esc(rawCode)}</b> tidak ditemukan.`, { parse_mode: "HTML" });
    }

    // cari varian by name (case-insensitive)
    const vname = rawVarian.toLowerCase();
    const variant = (product.variants || []).find(v => String(v?.name || "").toLowerCase() === vname);
    if (!variant) {
      return ctx.reply(
        `❌ Varian <b>${esc(rawVarian)}</b> tidak ditemukan pada produk <b>${esc(product.name || "-")}</b>.`,
        { parse_mode: "HTML" }
      );
    }

    // kalau belum ada S&K
    if (!variant.snk || String(variant.snk).trim() === "") {
      return ctx.reply(
        [
          `ℹ️ <b>Tidak ada S&K yang tercatat.</b>`,
          ``,
          `🏷️ Kode Produk: <b>${esc(product.code)}</b>`,
          `📦 Produk: <b>${esc(product.name)}</b>`,
          `🧩 Varian: <b>${esc(variant.name)}</b>`,
          ``,
          `🕳️ Tambahkan S&K lewat perintah:`,
          `<code>/addsnk ${esc(product.code)}|${esc(variant.name)}|(isi_snk)</code>`,
        ].join("\n"),
        { parse_mode: "HTML" }
      );
    }

    // kirim S&K
    await ctx.reply(
      [
        `📜 <b>Syarat & Ketentuan Varian</b>`,
        ``,
        `🏷️ Kode Produk: <b>${esc(product.code)}</b>`,
        `📦 Produk: <b>${esc(product.name)}</b>`,
        `🧩 Varian: <b>${esc(variant.name)}</b>`,
        ``,
        `📄 <b>Isi S&K:</b>`,
        `<code>${esc(String(variant.snk))}</code>`,
        ``,
        `🧾 Sumber: <b>products.json</b> ✅`,
      ].join("\n"),
      { parse_mode: "HTML" }
    );

    // log kecil
    console.log(
      `📜 /ceksnk oleh ${ctx.from?.username || ctx.from?.id} (allowUserCekSnk=${Boolean(settings?.izin?.allowUserCekSnk)}, publicMode=${publicMode})`
    );
  } catch (err) {
    console.error("❌ Error di /ceksnk:", err);
    try { await ctx.reply("⚠️ Gagal menampilkan data S&K."); } catch {}
  }
});

// === ⚙️ TOGGLE IZIN CEK S&K (ADMIN ONLY, DENGAN BUTTON) ===
bot.command("izinsnk", async (ctx) => {
  try {
    const chatId = String(ctx.chat.id);
    if (!isAdminNow(ctx)) return ctx.reply("🚫 Kamu bukan admin.");

    delete require.cache[require.resolve("./settings")];
    const settings = require("./settings");

    const publicMode = isCekSnkPublic(settings?.izin?.allowUserCekSnk);
    const modeText = publicMode
      ? "🌐 <b>Publik (Semua User)</b>"
      : "🔐 <b>Hanya Admin</b>";

    await ctx.reply(
      [
        `⚙️ <b>Pengaturan Izin /ceksnk</b>`,
        ``,
        `🧩 Mode Sekarang: ${modeText}`,
        ``,
        `Pilih mode baru di bawah ini 👇`,
      ].join("\n"),
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "🔐 ADMIN", callback_data: "izinsnk_admin" },
              { text: "🌐 SEMUA", callback_data: "izinsnk_semua" },
            ],
          ],
        },
      }
    );
  } catch (err) {
    console.error("❌ Error di /izinsnk:", err);
    ctx.reply("⚠️ Terjadi kesalahan saat membuka pengaturan izin S&K.");
  }
});

// === 🟢 Handler tombol IZINSNK ===
bot.action(["izinsnk_admin", "izinsnk_semua"], async (ctx) => {
  try {
    const chatId = String(ctx.chat.id);
    if (!isAdmin(chatId)) return ctx.answerCbQuery("🚫 Hanya admin!");

    delete require.cache[require.resolve("./settings")];
    const settings = require("./settings");

    // true = publik, false = admin-only
    const isPublic = ctx.match[0] === "izinsnk_semua";
    settings.izin = settings.izin || {};
    settings.izin.allowUserCekSnk = isPublic; // SIMPAN SEBAGAI BOOLEAN!

    fs.writeFileSync(
      settingsPath,
      `module.exports = ${JSON.stringify(settings, null, 2)};\n`,
      "utf8"
    );

    const modeText = isPublic
      ? "🌐 <b>Publik (Semua User)</b>"
      : "🔐 <b>Hanya Admin</b>";

    await ctx.editMessageText(
      [
        `⚙️ <b>Izin /ceksnk Diperbarui!</b>`,
        ``,
        `🧩 Mode Sekarang: ${modeText}`,
        ``,
        isPublic
          ? "✅ Sekarang <b>user biasa</b> bisa menggunakan /ceksnk."
          : "🔒 Sekarang hanya <b>admin</b> yang bisa menggunakan /ceksnk.",
      ].join("\n"),
      { parse_mode: "HTML" }
    );

    console.log(
      `🔧 Izin /ceksnk diubah oleh ${ctx.from.first_name} (${ctx.from.id}): ${isPublic ? "PUBLIC" : "ADMIN ONLY"}`
    );

    await ctx.answerCbQuery("✅ Pengaturan diperbarui!");
  } catch (err) {
    console.error("❌ Error di handler tombol izinsnk:", err);
    ctx.answerCbQuery("⚠️ Gagal memperbarui izin!");
  }
});

// === 🧠 ADMIN SYSTEM (LOAD FROM settings.js) ===
delete require.cache[require.resolve("./settings")];
let settings = require("./settings");

// === 🔍 Fungsi bantu — Cek Admin ===
function isAdmin(chatId) {
  const idStr = String(chatId);
  return settings.admins.some(
    (a) => String(a.id) === idStr || (a.username && a.username.toLowerCase() === idStr.toLowerCase())
  );
}

// === 🆔 /akusiapa — Cek ID, Username, dan Status Admin ===
bot.command(["akusiapa", "whoami"], async (ctx) => {
  try {
    const user = ctx.from;

    // 🔁 Ambil data admin terbaru dari settings.js (auto-reload)
    delete require.cache[require.resolve("./settings")];
    const settings = require("./settings");

    const id = String(user.id);
    const username = String(user.username || "").toLowerCase();

    // 🧠 Deteksi apakah user adalah admin aktif
    const isAdmin =
      settings.admins &&
      settings.admins.some(
        (a) =>
          a.id === id ||
          (a.username && a.username.toLowerCase() === username)
      );

    const role = isAdmin ? "KAMU ADALAH ADMIN <b>👑 KING 👑</b>" : "Kamu adalah <b>👤Buyer Tercinta👤</b>";

    const info = [
      `🧾 <b>Informasi Akun Kamu</b>`,
      ``,
      `👤 <b>Nama:</b> ${user.first_name || "-"} ${user.last_name || ""}`,
      `🏷️ <b>Username:</b> ${user.username ? "@" + user.username : "(tidak ada)"}`,
      `🆔 <b>ID:</b> ${user.id}`,
      ``,
      `🔰 <b>Status:</b>`,
      `${role}`,
      ``,
      `📎 Gunakan ID ini jika ingin menambahkan akun sebagai admin.`,
    ].join("\n");

    await ctx.reply(info, { parse_mode: "HTML" });
  } catch (err) {
    console.error("❌ Error di /akusiapa:", err);
    ctx.reply("⚠️ Gagal memuat informasi akun kamu.");
  }
});

// === 📋 /adminlist — Lihat daftar admin ===
bot.command("adminlist", async (ctx) => {
  const chatId = String(ctx.chat.id);
  if (!isAdminNow(ctx)) return ctx.reply("🚫 Kamu bukan admin.");

  if (!settings.admins.length) {
    return ctx.reply("📭 Belum ada admin yang terdaftar.");
  }

  const list = settings.admins
    .map(
      (a, i) =>
        `${i + 1}. 👑 <b>${a.username ? "@" + a.username : "(tanpa username)"} (${a.id})</b>`
    )
    .join("\n");

  ctx.reply(
    [
      `👑 <b>DAFTAR ADMIN TERDAFTAR (${settings.admins.length})</b>`,
      ``,
      list,
      ``,
      `🧾 File: <code>settings.js</code>`,
    ].join("\n"),
    { parse_mode: "HTML" }
  );
});

// === ➕ /addadmin — Tambah admin baru (fix & lengkap) ===
bot.command("addadmin", async (ctx) => {
  try {
    const path = require("path");
    const fs = require("fs");

    if (!isAdminNow(ctx)) return ctx.reply("🚫 Kamu bukan admin.");

    const args = (ctx.message?.text || "").split(" ").slice(1);
    if (!args.length) {
      return ctx.reply("⚙️ Format: /addadmin <id atau @username>");
    }

    const raw = String(args[0]).trim();
    const identifier = raw.replace(/^@/, ""); // buang '@' kalau ada

    // 🔁 loader & saver settings.js (realtime)
    const settingsPath = path.resolve("./settings.js");
    const loadSettings = () => {
      delete require.cache[require.resolve(settingsPath)];
      return require(settingsPath);
    };
    const saveSettings = (data) => {
      // pastikan minimal struktur dasar ada
      if (!Array.isArray(data.admins)) data.admins = [];
      if (!data.izin || typeof data.izin !== "object") data.izin = { allowUserCekSnk: false };
      const text = "module.exports = " + JSON.stringify(data, null, 2) + ";\n";
      fs.writeFileSync(settingsPath, text, "utf8");
    };

    const settings = loadSettings();

    // helper cek duplikat
    const findAdminIndex = (pred) => settings.admins.findIndex(pred);
    const isNumericId = /^\d+$/.test(identifier);

    // 🔎 resolve id/username sejauh yang bisa
    let resolved = { id: null, username: null };
    if (isNumericId) {
      // kalau ID angka → coba getChat untuk ambil username (bisa null kalau user gak punya @username)
      resolved.id = identifier;
      try {
        const info = await ctx.telegram.getChat(identifier);
        resolved.username = info?.username ?? null;
      } catch {
        // kalau gagal (user belum pernah chat ke bot), tetap simpan ID-nya
        resolved.username = null;
      }
    } else {
      // input berupa username
      resolved.username = identifier;
      // Bot API tidak bisa resolve username → id akan terisi kalau suatu saat mau di-sync
      // Kalau yang ditambah adalah diri kita sendiri dan username cocok, isi id dari ctx
      if (String(ctx.from?.username || "").toLowerCase() === identifier.toLowerCase()) {
        resolved.id = String(ctx.from.id);
      }
    }

    // 🚫 Cek duplikat berdasarkan id atau username (case-insensitive)
    const dupById = resolved.id
      ? findAdminIndex((a) => String(a.id) === String(resolved.id))
      : -1;
    const dupByUname = resolved.username
      ? findAdminIndex(
          (a) =>
            a.username &&
            String(a.username).toLowerCase() === String(resolved.username).toLowerCase()
        )
      : -1;

    if (dupById >= 0 || dupByUname >= 0) {
      // update entri lama biar lengkap (misal sebelumnya username null)
      const idx = dupById >= 0 ? dupById : dupByUname;
      const prev = settings.admins[idx] || {};
      settings.admins[idx] = {
        id: String(resolved.id ?? prev.id ?? ""),
        username: resolved.username ?? prev.username ?? null,
      };
      saveSettings(settings);

      return ctx.reply(
        [
          "ℹ️ Admin sudah terdaftar. Data diperbarui:",
          "",
          `👤 ${settings.admins[idx].username ? "@" + settings.admins[idx].username : "(tanpa username)"}`,
          `🆔 ${settings.admins[idx].id || "(belum diketahui)"}`,
          "",
          "🧾 Disimpan ke settings.js ✅",
        ].join("\n"),
        { parse_mode: "HTML" }
      );
    }

    // ➕ Tambah admin baru
    settings.admins.push({
      id: resolved.id ? String(resolved.id) : null,
      username: resolved.username ?? null,
    });
    saveSettings(settings);

    return ctx.reply(
      [
        "✅ <b>Admin baru berhasil ditambahkan!</b>",
        "",
        `👤 <b>${resolved.username ? "@" + resolved.username : "(tanpa username)"}</b>`,
        `🆔 <b>${resolved.id || "(belum diketahui)"}</b>`,
        "",
        "🧾 Disimpan ke <code>settings.js</code> ✅",
        resolved.id
          ? ""
          : "ℹ️ Catatan: ID belum diketahui. Minta user tsb kirim /start ke bot agar ID dapat tersimpan.",
      ]
        .filter(Boolean)
        .join("\n"),
      { parse_mode: "HTML" }
    );
  } catch (err) {
    console.error("❌ Error di /addadmin:", err);
    try {
      await ctx.reply("❌ Gagal menambahkan admin.");
    } catch {}
  }
});


// === ❌ /deladmin — Hapus admin ===
bot.command("deladmin", async (ctx) => {
  const chatId = String(ctx.chat.id);
  if (!isAdminNow(ctx)) return ctx.reply("🚫 Kamu bukan admin.");

  const args = ctx.message.text.split(" ").slice(1);
  if (args.length === 0)
    return ctx.reply("⚙️ Format: /deladmin <id atau @username>");

  const identifier = args[0].replace("@", "").trim();

  delete require.cache[require.resolve("./settings")];
  const settings = require("./settings");

  const index = settings.admins.findIndex(
    (a) =>
      a.id === identifier ||
      (a.username && a.username.toLowerCase() === identifier.toLowerCase())
  );
  if (index === -1) return ctx.reply("❌ Admin tidak ditemukan.");

  const removed = settings.admins.splice(index, 1)[0];

  fs.writeFileSync(
    settingsPath,
    `module.exports = ${JSON.stringify(settings, null, 2)};\n`,
    "utf8"
  );

  ctx.reply(
    [
      `🗑️ <b>Admin berhasil dihapus!</b>`,
      ``,
      `👤 <b>${removed.username ? "@" + removed.username : "(tanpa username)"}</b>`,
      `🆔 <b>${removed.id || "(tidak diketahui)"}</b>`,
      ``,
      `🧾 Disimpan ke <code>settings.js</code> ✅`,
    ].join("\n"),
    { parse_mode: "HTML" }
  );

  console.log(`🗑️ Admin dihapus: ${identifier}`);
});

// === 🧩 AUTO-UPDATE ADMIN ID (ketika admin baru kirim pesan) ===
bot.on("message", async (ctx, next) => {
  try {
    delete require.cache[require.resolve("./settings")];
    const settings = require("./settings");

    const user = ctx.from;
    const admins = settings.admins || [];

    // cari admin yang punya username tapi belum punya ID
    const target = admins.find(
      (a) =>
        a.username &&
        user.username &&
        a.username.toLowerCase() === user.username.toLowerCase() &&
        (!a.id || a.id === "null" || a.id === "")
    );

    if (target) {
      target.id = String(user.id);

      fs.writeFileSync(
        path.join(__dirname, "settings.js"),
        `module.exports = ${JSON.stringify(settings, null, 2)};\n`,
        "utf8"
      );

      console.log(
        `🔄 Auto-update ID admin: @${user.username} → ${user.id}`
      );

      await ctx.reply(
        `✅ Halo <b>@${user.username}</b>!\nID kamu <code>${user.id}</code> berhasil disinkronkan sebagai admin.`,
        { parse_mode: "HTML" }
      );
    }
  } catch (err) {
    console.error("❌ Gagal auto-update ID admin:", err);
  }

  next();
});

// === 📦 /cekcode — Lihat seluruh code & nama produk (ADMIN ONLY + pagination) ===
bot.command("cekcode", async (ctx) => {
  try {
    const fs = require("fs");
    const path = require("path");

    const esc = (s) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const loadSettings = () => {
      const settingsPath = path.resolve("./settings.js");
      delete require.cache[require.resolve(settingsPath)];
      return require(settingsPath);
    };
    const isAdminId = (id, settings) =>
      Boolean(settings?.admins?.some(a => String(a?.id) === String(id)));

    const settings = loadSettings();
    if (!isAdminId(ctx.from?.id, settings)) return ctx.reply("🚫 Kamu bukan admin.");

    const productsFile = path.resolve("data/products.json");
    if (!fs.existsSync(productsFile)) {
      return ctx.reply("📭 File products.json belum ada atau kosong.");
    }

    let products;
    try { products = JSON.parse(fs.readFileSync(productsFile, "utf8")); }
    catch { return ctx.reply("⚠️ Gagal membaca products.json."); }

    if (!Array.isArray(products) || products.length === 0) {
      return ctx.reply("📭 Belum ada produk yang terdaftar.");
    }

    const perPage = 10;
    const totalPages = Math.ceil(products.length / perPage);

    const renderPage = async (page = 1) => {
      const start = (page - 1) * perPage;
      const end = start + perPage;
      const slice = products.slice(start, end);
      const displayed = Math.min(page * perPage, products.length);

      const content = [
        `📦 <b>DAFTAR KODE PRODUK (${page}/${totalPages})</b>`,
        ``,
        ...slice.map(
          (p, i) => `${start + i + 1}. <b>Kode:</b> <code>${esc(p.code)}</code> — ${esc(p.name || "(tanpa nama)")}`
        ),
        ``,
        `📜 Menampilkan <b>${displayed}/${products.length}</b> kode produk.`,
        `💡 Digunakan Untuk Seluruh Command Admin`,
      ].join("\n");

      const navButtons = [];
      if (page > 1) navButtons.push({ text: "⬅️ Sebelumnya", callback_data: `cekcode:${page - 1}` });
      if (page < totalPages) navButtons.push({ text: "Selanjutnya ➡️", callback_data: `cekcode:${page + 1}` });

      const markup = { inline_keyboard: [navButtons] };
      return { content, markup };
    };

    const { content, markup } = await renderPage(1);
    await ctx.reply(content, { parse_mode: "HTML", reply_markup: markup });
  } catch (err) {
    console.error("❌ Error di /cekcode:", err);
    try { await ctx.reply("⚠️ Gagal menampilkan daftar code produk."); } catch {}
  }
});

// === 🔁 Handler Pagination /cekcode ===
bot.action(/cekcode:(\d+)/, async (ctx) => {
  try {
    const fs = require("fs");
    const path = require("path");

    const esc = (s) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const loadSettings = () => {
      const settingsPath = path.resolve("./settings.js");
      delete require.cache[require.resolve(settingsPath)];
      return require(settingsPath);
    };
    const isAdminId = (id, settings) =>
      Boolean(settings?.admins?.some(a => String(a?.id) === String(id)));

    const settings = loadSettings();
    if (!isAdminId(ctx.from?.id, settings)) return ctx.answerCbQuery("🚫 Hanya admin!");

    const page = parseInt(ctx.match[1], 10) || 1;
    const productsFile = path.resolve("data/products.json");

    if (!fs.existsSync(productsFile)) {
      return ctx.answerCbQuery("⚠️ File data produk tidak ditemukan.");
    }

    let products;
    try { products = JSON.parse(fs.readFileSync(productsFile, "utf8")); }
    catch { return ctx.answerCbQuery("⚠️ Gagal membaca file data."); }

    const perPage = 10;
    const totalPages = Math.ceil(products.length / perPage);

    const start = (page - 1) * perPage;
    const end = start + perPage;
    const slice = products.slice(start, end);
    const displayed = Math.min(page * perPage, products.length);

    const content = [
      `📦 <b>DAFTAR KODE PRODUK (${page}/${totalPages})</b>`,
      ``,
      ...slice.map(
        (p, i) => `${start + i + 1}. <b>Kode:</b> <code>${esc(p.code)}</code> — ${esc(p.name || "(tanpa nama)")}`
      ),
      ``,
      `📜 Menampilkan <b>${displayed}/${products.length}</b> kode produk.`,
      `💡 Digunakan Untuk Seluruh Command Admin`,
    ].join("\n");

    const navButtons = [];
    if (page > 1) navButtons.push({ text: "⬅️ Sebelumnya", callback_data: `cekcode:${page - 1}` });
    if (page < totalPages) navButtons.push({ text: "Selanjutnya ➡️", callback_data: `cekcode:${page + 1}` });

    const markup = { inline_keyboard: [navButtons] };

    await ctx.editMessageText(content, { parse_mode: "HTML", reply_markup: markup });
    await ctx.answerCbQuery();
  } catch (err) {
    console.error("❌ Error di pagination /cekcode:", err);
    try { await ctx.answerCbQuery("⚠️ Gagal memuat halaman!"); } catch {}
  }
});

// === 📦 /cekstok — Lihat seluruh stok produk (PUBLIC + emoji status + tombol 🔄 Refresh + timestamp) ===
bot.command("cekstok", async (ctx) => {
  try {
    const productsFile = path.join(__dirname, "data", "products.json");

    if (!fs.existsSync(productsFile)) {
      return ctx.reply("📭 File products.json belum ada atau kosong.");
    }

    const products = JSON.parse(fs.readFileSync(productsFile, "utf8"));
    if (!products.length) {
      return ctx.reply("📭 Belum ada produk yang terdaftar.");
    }

    // 🕒 waktu sekarang (Asia/Jakarta)
    const now = dayjs().tz("Asia/Jakarta").format("DD MMM YYYY HH:mm [WIB]");

    const list = products
      .map((p, i) => {
        const totalStock = (p.variants || []).reduce(
          (sum, v) => sum + (v.stock || 0),
          0
        );
        const totalVarian = (p.variants || []).length;
        const status = totalStock > 0 ? "✅" : "❌";
        return `${i + 1}. ${esc(p.name || "(tanpa nama)")}\n   ${status} Total Stok: <b>${totalStock}</b> (${totalVarian} varian)`;
      })
      .join("\n\n");

    const content = [
      `📦 <b>DAFTAR STOK PRODUK</b>`,
      ``,
      list,
      ``,
      `📜 Total Produk: <b>${products.length}</b>`,
      ``,
      `⏱️ Diperbarui: <b>${now}</b>`,
    ].join("\n");

    const markup = {
      inline_keyboard: [[{ text: "🔄 Refresh", callback_data: "cekstok_refresh" }]],
    };

    await ctx.reply(content, { parse_mode: "HTML", reply_markup: markup });
  } catch (err) {
    console.error("❌ Error di /cekstok:", err);
    ctx.reply("⚠️ Gagal menampilkan daftar stok produk.");
  }
});

// === 🔁 Handler tombol 🔄 Refresh /cekstok ===
bot.action("cekstok_refresh", async (ctx) => {
  try {
    const productsFile = path.join(__dirname, "data", "products.json");

    if (!fs.existsSync(productsFile))
      return ctx.answerCbQuery("⚠️ File data produk tidak ditemukan.");

    const products = JSON.parse(fs.readFileSync(productsFile, "utf8"));
    if (!products.length) {
      await ctx.editMessageText("📭 Belum ada produk yang terdaftar.");
      return ctx.answerCbQuery("Daftar kosong, tidak ada yang di-refresh.");
    }

    // 🕒 timestamp baru
    const now = dayjs().tz("Asia/Jakarta").format("DD MMM YYYY HH:mm [WIB]");

    const list = products
      .map((p, i) => {
        const totalStock = (p.variants || []).reduce(
          (sum, v) => sum + (v.stock || 0),
          0
        );
        const totalVarian = (p.variants || []).length;
        const status = totalStock > 0 ? "✅" : "❌";
        return `${i + 1}. ${esc(p.name || "(tanpa nama)")}\n   ${status} Total Stok: <b>${totalStock}</b> (${totalVarian} varian)`;
      })
      .join("\n\n");

    const content = [
      `📦 <b>DAFTAR STOK PRODUK (Terbaru)</b>`,
      ``,
      list,
      ``,
      `📜 Total Produk: <b>${products.length}</b>`,
      ``,
      `⏱️ Diperbarui: <b>${now}</b>`,
    ].join("\n");

    const markup = {
      inline_keyboard: [[{ text: "🔄 Refresh", callback_data: "cekstok_refresh" }]],
    };

    await ctx
      .editMessageText(content, { parse_mode: "HTML", reply_markup: markup })
      .then(() => ctx.answerCbQuery("♻️ Diperbarui!"))
      .catch((err) => {
        if (
          err.description &&
          err.description.includes("message is not modified")
        ) {
          return ctx.answerCbQuery("✅ Data stok masih sama (tidak berubah).");
        } else {
          console.error("❌ Error di cekstok_refresh:", err);
          ctx.answerCbQuery("⚠️ Gagal refresh data stok!");
        }
      });
  } catch (err) {
    console.error("❌ Error di cekstok_refresh:", err);
    await ctx.answerCbQuery("⚠️ Gagal refresh data stok!");
  }
});

// === 🔎 CEK DETAIL TRANSAKSI (ADMIN ONLY) ===
// Format: /cekid <id>  (contoh: /cekid 87)
bot.command("cekid", async (ctx) => {
  try {
    if (!isAdmin(ctx.from.id)) return ctx.reply("🚫 Kamu bukan admin.");
    if (!isAdminNow(ctx)) return ctx.reply("🚫 Kamu bukan admin.");

    const arg = (ctx.message?.text || "").split(" ").slice(1).join(" ").trim();
    if (!arg) return ctx.reply("⚙️ Format salah!\nGunakan: /cekid <nomor>\ncontoh: /cekid 87");

    const txId = Number(arg);
    if (!Number.isFinite(txId)) return ctx.reply("⚠️ ID harus berupa angka.\ncontoh: /cekid 87");

    // path file data
    const fse = require("fs");
    const p = require("path");
    const txFile = p.join(process.cwd(), "data", "transactions.json");

    if (!fse.existsSync(txFile)) {
      return ctx.reply("❌ File data transaksi tidak ditemukan (data/transactions.json).");
    }

    // baca & cari transaksi
    let list = [];
    try {
      list = JSON.parse(fse.readFileSync(txFile, "utf8"));
      if (!Array.isArray(list)) list = [];
    } catch (e) {
      console.error("❌ Gagal baca transactions.json:", e);
      return ctx.reply("❌ Gagal membaca file transaksi.");
    }

    const t = list.find((x) => String(x?.id) === String(txId));
    if (!t) {
      return ctx.reply(`❌ Transaksi dengan ID <b>#${txId}</b> tidak ditemukan.`, { parse_mode: "HTML" });
    }

    // === ambil info produk untuk field "Produk" ===
    let productName = "-", productCode = "-";
    try {
      const productsPath = p.join(process.cwd(), "data", "products.json");
      if (fse.existsSync(productsPath)) {
        const plist = JSON.parse(fse.readFileSync(productsPath, "utf8")) || [];
        const prod = plist.find((x) => String(x.id) === String(t.product_id));
        if (prod) {
          productName = prod.name || "-";
          productCode = prod.code || "-";
        }
      }
    } catch {}

    // tentukan status "Akun Terkirim?"
    const terkirimStr =
      t?.sent_account === true
        ? "Sukses"
        : (t?.status === "paid" ? "Gagal (Stok Habis)" : "-");

    // susun blok ASCII + detail key-value fixed
    const boxHeader = [
      "🧾 <b>DETAIL TRANSAKSI</b>",
      "",
      "SEN PRO PREMIUM APPS",
      "┌───────────────────────┐",
      `│ <b>ID</b>      : #${t.id}`,
      `│ <b>Status</b>  : ${t.status ?? "-"}`,
      "└───────────────────────┘",
      "",
      "<b>Data:</b>",
    ].join("\n");

    // deretan field yang diminta
    const lines = [
      `ID Customer   : ${t.user_id ?? ""}`,
      `SENPRO ID    : ${t.reference_id ?? ""}`,
      `Username      : ${t.username ?? ""}`,
      `Produk        : ${productName} [${productCode}]`,
      `Varian        : ${t.variant_name ?? ""}`,
      `Jumlah        : ${t.qty ?? ""}`,
      `Pembayaran    : ${t.method ?? ""}`,
      `Harga         : ${t.amount ?? ""}`,
      `Total Harga   : ${t.total_amount ?? ""}`,
      `Status        : ${t.status ?? ""}`,
      `Akun Dikirim? : ${terkirimStr}`,
    ];

    const body = `<pre>${lines.join("\n")}</pre>`;

    await ctx.reply([boxHeader, body].join("\n"), {
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
  } catch (err) {
    console.error("❌ Error di /cekid:", err);
    try { await ctx.reply("❌ Gagal memproses /cekid, cek log server."); } catch {}
  }
});

// === 📦 KIRIM AKUN MANUAL (ADMIN ONLY)
// Format: /kirim <username/id> code|varian|jumlah
// Contoh: /kirim @sphynixstore am|iphone|1
bot.command("kirim", async (ctx) => {
  try {
    if (!isAdmin(ctx.from.id)) return ctx.reply("🚫 Kamu bukan admin.");
    if (!isAdminNow(ctx)) return ctx.reply("🚫 Kamu bukan admin.");

    const raw = (ctx.message?.text || "").trim();
    const parts = raw.split(" ").slice(1);
    if (parts.length < 2)
      return ctx.reply("⚙️ Format salah!\nGunakan:\n/kirim <username/id> code|varian|jumlah\nContoh: /kirim @sphynixstore am|iphone|1");

    const target = parts[0];
    const spec   = parts.slice(1).join(" ").trim();
    if (!spec.includes("|"))
      return ctx.reply("⚙️ Format salah!\nGunakan:\n/kirim <username/id> code|varian|jumlah\nContoh: /kirim @sphynixstore am|iphone|1");

    const [codeRaw, varRaw, qtyRaw] = spec.split("|").map(s => s.trim());
    const code        = String(codeRaw || "").toLowerCase();
    const varianInput = String(varRaw || "");
    const jumlah      = parseInt(qtyRaw, 10);

    if (!code || !varianInput || !Number.isFinite(jumlah) || jumlah <= 0)
      return ctx.reply("⚠️ Format salah!\nPastikan jumlah angka > 0.\nContoh: /kirim @user am|iphone|1");

    const fs   = require("fs");
    const path = require("path");
    const stokFile     = path.join(__dirname, "stok", `${code}.json`);
    const productsFile = path.join(__dirname, "data", "products.json");

    if (!fs.existsSync(stokFile))     return ctx.reply(`⚠️ File stok tidak ditemukan untuk kode "${code}".`);
    if (!fs.existsSync(productsFile)) return ctx.reply("⚠️ File products.json tidak ditemukan.");

    // Muat produk & varian
    const products = JSON.parse(fs.readFileSync(productsFile, "utf8"));
    const product  = products.find(p => p.code && String(p.code).toLowerCase() === code);
    if (!product) return ctx.reply(`⚠️ Produk dengan kode "${code}" tidak ditemukan di products.json`);

    const targetVar = (product.variants || []).find(v => String(v.name).toLowerCase() === String(varianInput).toLowerCase());
    if (!targetVar) return ctx.reply(`⚠️ Varian "${varianInput}" tidak ada di produk "${product.name}".`);

    const varianName = targetVar.name;

    // Baca stok (TIDAK MENGURANGI DULU)
    let stokList = JSON.parse(fs.readFileSync(stokFile, "utf8"));
    if (!Array.isArray(stokList)) stokList = [];

    const stokVarian = stokList
      .filter(s => s?.varian && String(s.varian).toLowerCase() === String(varianName).toLowerCase())
      .sort((a, b) => {
        const ta = Date.parse(a.addedAt || 0) || 0;
        const tb = Date.parse(b.addedAt || 0) || 0;
        return ta - tb; // FIFO
      });

    if (stokVarian.length === 0)
      return ctx.reply(`⚠️ Stok varian "${varianName}" kosong.`);
    if (jumlah > stokVarian.length)
      return ctx.reply(`⚠️ Jumlah diminta (${jumlah}) melebihi stok tersedia (${stokVarian.length}).`);

    // Ambil dulu “secara konseptual” (belum commit)
    const picked = stokVarian.slice(0, jumlah);

    // Susun kredensial
    const credsLines = picked.map((it, idx) => {
      const email = it.email ?? it.user ?? it.uid ?? "-";
      const pass  = it.password ?? it.pass ?? it.pw  ?? "-";
      return `${idx + 1}. ${email}:${pass}`;
    });

    // Box ringkas DETAIL ORDER
    const detailOrderBox = [
      "╭───────────────────────╮",
      "├ DETAIL ORDER",
      `├ Product: ${product.name} [${product.code}]`,
      `├ Variant: ${varianName}`,
      `├ Jumlah: ${jumlah}`,
      "╰───────────────────────╯",
    ].join("\n");

    // Pesan 1 (akun)
    const msg1 = [
      "⬇️ <b>SILAHKAN GUNAKAN AKUN BERIKUT</b> ⬇️",
      detailOrderBox,
      "",
      `<pre>${credsLines.join("\n")}</pre>`,
      "",
      "⚠️ Jika ada kendala pada akun, hubungi admin.",
    ].join("\n");

    // SNK dari VARIAN saja (kalau kosong, gak kirim SNK)
    const snkText = (targetVar.snk && String(targetVar.snk).trim()) || "";

    // ======== KIRIM DULU (TRANSAKSIONAL) ========
    try {
      await bot.telegram.sendMessage(target, msg1, { parse_mode: "HTML", disable_web_page_preview: true });
      if (snkText) {
        await new Promise(r => setTimeout(r, 2000));
        await bot.telegram.sendMessage(
          target,
          ["📑 <b>Syarat & Ketentuan</b>", "", `<pre>${snkText}</pre>`].join("\n"),
          { parse_mode: "HTML", disable_web_page_preview: true }
        );
      }
    } catch (e) {
      const desc = String(e?.response?.description || e?.message || e);
      // Kasus umum: chat not found / bot blocked / user belum start bot
      await ctx.reply(
        [
          "❌ Gagal mengirim ke target.",
          `• Target: ${target}`,
          `• Alasan: ${desc}`,
          "",
          "👉 Pastikan user sudah /start bot atau kirim pakai ID numerik.",
          "📌 Akun TIDAK diambil dari stok (stok tetap utuh).",
          "",
          "Preview akun yg akan dikirim:",
          `<pre>${credsLines.join("\n")}</pre>`
        ].join("\n"),
        { parse_mode: "HTML", disable_web_page_preview: true }
      );
      return; // ⛔ STOP — jangan kurangi stok
    }

    // ======== KIRIM SUKSES → BARU COMMIT PENGURANGAN STOK ========
    let removed = 0;
    const newStokList = [];
    for (const item of stokList) {
      const same = item?.varian && String(item.varian).toLowerCase() === String(varianName).toLowerCase();
      if (same && removed < jumlah) { removed++; continue; }
      newStokList.push(item);
    }
    fs.writeFileSync(stokFile, JSON.stringify(newStokList, null, 2));

    // Sinkron ke products.json (variants[].stock)
    const freshCount = newStokList.filter(
      s => s?.varian && String(s.varian).toLowerCase() === String(varianName).toLowerCase()
    ).length;
    {
      const pi = products.findIndex(p => p.code && String(p.code).toLowerCase() === code);
      if (pi >= 0) {
        const vi = (products[pi].variants || []).findIndex(v => v.name === varianName);
        if (vi >= 0) {
          products[pi].variants[vi].stock = freshCount;
          fs.writeFileSync(productsFile, JSON.stringify(products, null, 2));
        }
      }
    }

    // Konfirmasi admin
    const adminAck = [
      "✅ <b>Pengiriman Berhasil</b>",
      "",
      `🎯 Target : ${target}`,
      `🏷️ Produk : ${product.name} [${product.code}]`,
      `🧩 Varian : ${varianName}`,
      `📦 Jumlah : ${jumlah}`,
      "",
      "Stok & data sudah disinkronkan."
    ].join("\n");
    await ctx.reply(adminAck, { parse_mode: "HTML" });

  } catch (err) {
    console.error("❌ Error di /kirim:", err);
    try { await ctx.reply("❌ Gagal memproses /kirim, cek log server!"); } catch {}
  }
});

// === 💰 SALDO MANUAL (ADMIN ONLY)
// Format: /saldo <id/@username> <jumlah> [catatan]
// Contoh: /saldo @user 10000 Top up manual
// Bisa juga reply user: /saldo 10000 Top up manual
bot.command("saldo", async (ctx) => {
  try {
    if (!isAdminNow(ctx)) return ctx.reply("🚫 Kamu bukan admin.");

    const raw = (ctx.message?.text || "").trim();
    const args = raw.split(" ").slice(1);
    const replyUser = ctx.message?.reply_to_message?.from;

    let targetRef = args[0];
    let amountRaw = args[1];
    let note = args.slice(2).join(" ").trim();

    if (replyUser && args.length >= 1) {
      targetRef = String(replyUser.id);
      amountRaw = args[0];
      note = args.slice(1).join(" ").trim();
    }

    if (!targetRef || !amountRaw) {
      return ctx.reply(
        [
          "⚙️ Format: /saldo <id/@username> <jumlah> [catatan]",
          "Contoh: /saldo @user 10000 Top up manual",
          "Atau reply user: /saldo 10000 Top up manual",
        ].join("\n")
      );
    }

    const cleanAmount = String(amountRaw).replace(/[^\d-]/g, "");
    const amount = Number(cleanAmount);
    if (!Number.isFinite(amount) || amount === 0) {
      return ctx.reply("⚠️ Jumlah saldo tidak valid. Gunakan angka, contoh: 10000");
    }

    const db = await loadDB();
    const users = db.users || {};

    let targetId = null;
    let targetUser = null;

    if (/^\d+$/.test(String(targetRef))) {
      targetId = String(targetRef);
      targetUser = users[targetId] || null;
    } else {
      const uname = String(targetRef).replace(/^@/, "").toLowerCase();
      const found = Object.values(users).find(
        (u) => u?.username && String(u.username).toLowerCase() === uname
      );
      if (found) {
        targetId = String(found.id);
        targetUser = found;
      }
    }

    if (!targetId) {
      return ctx.reply("❌ User tidak ditemukan. Pastikan user sudah /start bot.");
    }

    if (!targetUser) {
      targetUser = {
        id: targetId,
        username: null,
        first_name: null,
        transaksi: 0,
        balance: 0,
        createdAt: Date.now(),
      };
      users[targetId] = targetUser;
    }

    const currentBalance = Number(targetUser.balance || 0);
    const nextBalance = currentBalance + amount;

    if (nextBalance < 0) {
      return ctx.reply("⚠️ Saldo user tidak cukup untuk pengurangan ini.");
    }

    targetUser.balance = nextBalance;
    await saveDB(db);

    const changeLabel = amount > 0 ? "Top up" : "Pengurangan";
    const changeText = `${amount > 0 ? "+" : "-"}Rp ${rupiah(Math.abs(amount))}`;
    const userText = [
      `💰 <b>Saldo kamu telah diperbarui</b>`,
      `├ <b>Jenis:</b> ${changeLabel} manual`,
      `├ <b>Perubahan:</b> ${changeText}`,
      `├ <b>Saldo sekarang:</b> Rp ${rupiah(nextBalance)}`,
      note ? `├ <b>Catatan:</b> ${esc(note)}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const sent = await sendMessageSafe(bot, targetId, userText, {
      parse_mode: "HTML",
    });

    const adminAck = [
      `✅ <b>Saldo diperbarui</b>`,
      `├ <b>Target:</b> ${targetUser.username ? "@" + targetUser.username : targetId}`,
      `├ <b>Perubahan:</b> ${changeText}`,
      `├ <b>Saldo akhir:</b> Rp ${rupiah(nextBalance)}`,
      note ? `├ <b>Catatan:</b> ${esc(note)}` : null,
      sent ? `├ <b>Notifikasi:</b> Terkirim` : `├ <b>Notifikasi:</b> Gagal (user belum /start?)`,
    ]
      .filter(Boolean)
      .join("\n");

    await ctx.reply(adminAck, { parse_mode: "HTML" });
  } catch (err) {
    console.error("❌ Error di /saldo:", err);
    try {
      await ctx.reply("❌ Gagal memproses /saldo, cek log server.");
    } catch {}
  }
});

// =======================
// 🟢 DETEKSI BROADCAST DI SEMUA MEDIA (foto, video, dokumen, GIF, dll)
// =======================
bot.use(async (ctx, next) => {
  try {
    const msg = ctx.message;
    if (!msg) return next();

    const caption = msg.caption || "";
    const isBroadcast = /^\/broadcast\b/i.test(caption);
    if (!isBroadcast) return next(); // lanjut ke handler lain

    if (!isAdminNow(ctx)) return ctx.reply("🚫 Kamu bukan admin.");

    const db = await loadDB();
    const users = Object.values(db.users || {}).filter((u) => u.id);
    if (users.length === 0) {
      return ctx.reply("⚠️ Belum ada user terdaftar untuk broadcast.");
    }

    // --- Ambil isi pesan / file ---
    let fileId = null;
    let fileType = null;

    if (msg.photo) {
      fileId = msg.photo[msg.photo.length - 1].file_id;
      fileType = "photo";
    } else if (msg.video) {
      fileId = msg.video.file_id;
      fileType = "video";
    } else if (msg.document) {
      fileId = msg.document.file_id;
      fileType = "document";
    } else if (msg.animation) {
      fileId = msg.animation.file_id;
      fileType = "animation";
    } else if (msg.audio) {
      fileId = msg.audio.file_id;
      fileType = "audio";
    }

    // --- Pesan text setelah /broadcast ---
    const message = caption.replace(/^\/broadcast\s*/i, "").trim() || "";

    // Simpan session
    ctx.session ??= {};
    ctx.session.broadcast = {
      pending: true,
      message,
      fileId,
      fileType,
      users,
    };

    // Tombol konfirmasi
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback("✅ Kirim Broadcast", "broadcast_confirm"),
        Markup.button.callback("❌ Batal", "broadcast_cancel"),
      ],
    ]);

    // --- Preview konfirmasi ---
    if (fileId) {
      switch (fileType) {
        case "photo":
          await ctx.replyWithPhoto(fileId, {
            caption: `📣 <b>Konfirmasi Broadcast</b>\n\n${message}`,
            parse_mode: "HTML",
            ...keyboard,
          });
          break;
        case "video":
          await ctx.replyWithVideo(fileId, {
            caption: `📣 <b>Konfirmasi Broadcast</b>\n\n${message}`,
            parse_mode: "HTML",
            ...keyboard,
          });
          break;
        case "document":
          await ctx.replyWithDocument(fileId, {
            caption: `📣 <b>Konfirmasi Broadcast</b>\n\n${message}`,
            parse_mode: "HTML",
            ...keyboard,
          });
          break;
        case "animation":
          await ctx.replyWithAnimation(fileId, {
            caption: `📣 <b>Konfirmasi Broadcast</b>\n\n${message}`,
            parse_mode: "HTML",
            ...keyboard,
          });
          break;
        case "audio":
          await ctx.replyWithAudio(fileId, {
            caption: `📣 <b>Konfirmasi Broadcast</b>\n\n${message}`,
            parse_mode: "HTML",
            ...keyboard,
          });
          break;
      }
    } else {
      await ctx.reply(`📣 <b>Konfirmasi Broadcast</b>\n\n${message}`, {
        parse_mode: "HTML",
        ...keyboard,
      });
    }

    // stop di sini (biar gak masuk ke handler Catbox)
    return;
  } catch (err) {
    console.error("❌ Error di middleware universal broadcast:", err);
    ctx.reply("⚠️ Terjadi kesalahan saat mempersiapkan broadcast media.");
  }

  return next();
});

// =======================
// 🧩 AUTO UPLOAD PRODUK KE CATBOX (Full Sync + Premium Style)
// =======================
bot.on("photo", async (ctx) => {
  try {
    const caption = ctx.message.caption?.trim();
    if (!caption) return;

    // ✅ Bisa "/addproduk" atau "addproduk"
    if (!/^\/?addproduk\s+/i.test(caption)) return;
    if (!isAdminNow(ctx)) return ctx.reply("🚫 Kamu bukan admin.");

    console.log("📸 [DEBUG] Foto produk terdeteksi ✅");
    console.log("📝 [DEBUG] Caption:", caption);

    // Ambil data produk dari caption
    const argsText = caption.replace(/^\/?addproduk\s+/i, "").trim();
    const parts = argsText.split("|").map(x => x.trim()).filter(Boolean);
    const [code, name, desc, ...rest] = parts;

    if (!code || !name || !desc)
      return ctx.reply("⚠️ Format salah!\nGunakan format:\n/addproduk code|Nama|Deskripsi|Varian|Harga|");

    if (rest.length < 2 || rest.length % 2 !== 0)
      return ctx.reply("⚙️ Format varian & harga tidak valid!\nGunakan format berpasangan: Varian|Harga");

    // === Buat daftar varian ===
    const variants = [];
    for (let i = 0; i < rest.length; i += 2) {
      variants.push({ name: rest[i], price: parseInt(rest[i + 1]) || 0, stock: 0, snk: "" });
    }

    await ctx.reply("⏳ Uploading foto ke Catbox...");

    // === Ambil & upload foto ke Catbox ===
    const file = ctx.message.photo.pop();
    const fileLink = await ctx.telegram.getFileLink(file.file_id);
    const imgData = await axios.get(fileLink.href, { responseType: "arraybuffer" });

    const form = new FormData();
    form.append("reqtype", "fileupload");
    form.append("fileToUpload", imgData.data, "produk.jpg");

    const res = await axios.post("https://catbox.moe/user/api.php", form, { headers: form.getHeaders() });
    const catboxUrl = res.data.trim();
    console.log("🌐 [DEBUG] Catbox URL:", catboxUrl);

    // === Path ===
    const productsFile = path.join(__dirname, "data", "products.json");
    const stokFolder = path.join(__dirname, "stok");
    const stokFile = path.join(stokFolder, `${code.toLowerCase()}.json`);

    if (!fs.existsSync(stokFolder)) fs.mkdirSync(stokFolder, { recursive: true });

    // === Load produk lama ===
    let products = [];
    if (fs.existsSync(productsFile)) {
      products = JSON.parse(fs.readFileSync(productsFile, "utf8"));
    }

    // === Cek duplikat ===
    if (products.some(p => p.code.toLowerCase() === code.toLowerCase()))
      return ctx.reply("⚠️ Produk dengan kode tersebut sudah ada!");

    // === Buat file stok kosong ===
    if (!fs.existsSync(stokFile)) fs.writeFileSync(stokFile, "[]", "utf8");

    // === Tambah produk baru ===
    const newProduct = {
      id: products.length + 1,
      code,
      name,
      desc,
      isImage: true,
      image_url: catboxUrl,
      sold: 0,
      variants
    };

    products.push(newProduct);
// rapihin urutan A→Z berdasarkan nama sebelum disimpan
products.sort((a, b) =>
  String(a.name || "").localeCompare(String(b.name || ""), "id", { sensitivity: "base" })
);
    products.forEach((p, i) => p.id = i + 1);
    fs.writeFileSync(productsFile, JSON.stringify(products, null, 2));

    // === Tampilkan hasil gaya “Premium Store” ===
    await ctx.replyWithPhoto(catboxUrl, {
      caption:
`✅ <b>Produk baru berhasil ditambahkan!</b>

╭────────────────────╮
├ 🏷️ <b>Kode:</b> ${code}
├ 🛍️ <b>Nama:</b> ${name}
├ 💬 <b>Deskripsi:</b> ${desc}
├ 💵 <b>Varian:</b> ${variants.map(v => `${v.name} - Rp${v.price.toLocaleString("id-ID")}`).join(", ")}
├ 🔗 <a href="${catboxUrl}">${catboxUrl}</a>
╰────────────────────╯

🧾 <b>Produk berhasil ditambahkan & stok dibuat otomatis!</b> 🧾`,
      parse_mode: "HTML"
    });

  } catch (err) {
    console.error("❌ [ERROR] Gagal upload produk:", err);
    await ctx.reply("❌ Gagal upload ke Catbox atau simpan produk.");
  }
});

// === 📄 PAGINATION HANDLER RIWAYAT ===
bot.on("callback_query", async (ctx, next) => {
  try {
    const data = ctx.callbackQuery.data;
    if (!data.startsWith("tx_page_")) return next();

    const page = parseInt(data.split("_")[2]);
    const chatId = String(ctx.chat.id);
    const transactionsPath = path.resolve("data/transactions.json");
    const transactions = JSON.parse(fs.readFileSync(transactionsPath, "utf8"));
    const userTx = transactions.filter(t => t.user_id === chatId);

    if (userTx.length === 0) {
      await ctx.answerCbQuery("📭 Tidak ada transaksi.");
      return next();
    }

    const perPage = 5;
    const totalPages = Math.ceil(userTx.length / perPage);
    const start = (page - 1) * perPage;
    const end = start + perPage;
    const txPage = userTx.slice().reverse().slice(start, end);

    const content = [
      `<b>📜 RIWAYAT TRANSAKSI KAMU</b>`,
      ``,
      ...txPage.map(t => {
        const date = t.timestamp || "-";
        const qtyText = t.qty ? ` (${t.qty}x)` : "";
        let akunListText = "";

        if (Array.isArray(t.akun) && t.akun.length > 0) {
          akunListText = t.akun
            .map(
              (a, i) =>
                `🔹 <b>Akun ${i + 1}</b>\n` +
                `Email: <code>${a.email || "-"}</code>\n` +
                `Password: <code>${a.password || "-"}</code>`
            )
            .join("\n\n");
        } else if (t.email && t.password) {
          akunListText = `Email: <code>${t.email}</code>\nPassword: <code>${t.password}</code>`;
        } else {
          akunListText = "❌ Tidak ada akun tercatat";
        }

        return [
          `🧾 <b>${t.product}</b> (${t.variant})`,
          `💰 Rp ${rupiah(t.total)}${qtyText}`,
          `💳 Metode: ${t.method}`,
          `📦 <b>Akun:</b>\n${akunListText}`,
          `🆔 <code>${t.id}</code>`,
          `📅 ${date}`,
          `━━━━━━━━━━━━━━━━━━`
        ].join("\n");
      }),
      ``,
      `Menampilkan ${txPage.length} transaksi (halaman ${page}/${totalPages}).`
    ].join("\n");

    const navButtons = [];
    if (page > 1)
      navButtons.push({ text: "⬅️ Sebelumnya", callback_data: `tx_page_${page - 1}` });
    if (page < totalPages)
      navButtons.push({ text: "Selanjutnya ➡️", callback_data: `tx_page_${page + 1}` });

    await ctx.editMessageText(content, {
  parse_mode: "HTML",
  reply_markup: { inline_keyboard: [navButtons] },
});

    await ctx.answerCbQuery();
    next();
  } catch (err) {
    console.error("❌ Error di pagination transaksi:", err);
    await ctx.answerCbQuery("⚠️ Gagal memuat halaman!");
    next();
  }
});

// ❓ CARA ORDER (simple + elegan)
bot.hears('❓ Cara Order', async (ctx) => {
  const text = [
    `<b>🧭 PANDUAN ORDER PRODUK</b>`,
    ``,
    `1️⃣ Pilih menu <b>🧾 List Produk</b>.`,
    `2️⃣ Klik angka sesuai produk yang ingin kamu beli.`,
    `3️⃣ Bot akan menampilkan detail dan harga produk.`,
    `4️⃣ Lakukan pembayaran sesuai instruksi.`,
    `5️⃣ Setelah pembayaran diverifikasi, produk otomatis dikirim.`,
    ``,
    `💬 Jika ada kendala, hubungi admin:`,
    `<b>@neilssen</b>`,
    ``,
    `━━━━━━━━━━━━━━━━━━━`,
    `<i>Bot by © ${AUTHOR} 2025</i>`
  ].join('\n');

  await ctx.reply(text, { parse_mode: 'HTML' });
});


// === 🛒 HANDLER PRODUK DETAIL (fix banner nempel & inline pas + popup stok habis) ===
bot.hears(/^(?:[1-9]|1[0-5])$/, async (ctx) => {
  const chatId = String(ctx.chat.id);
  const products = await loadProducts();

  const index = parseInt(ctx.message.text);
  const product = products.find(p => p.id === index);
  if (!product) return ctx.reply("⚠️ Produk tidak ditemukan!");

  const now = dayjs().tz().format("HH.mm.ss [WIB]");
  const variantList = product.variants.map(v =>
    `• ${v.name}: <b>Rp ${rupiah(v.price)}</b> - Stok: ${v.stock}`
  ).join('\n');

  const text = [
    `SEN PRO PREMIUM APPS`,
    `╭──────────────────────╮`,
    `├ <b>Produk:</b> ${product.name}`,
    `├ <b>Stok Terjual:</b> ${Number(product.sold || 0)}`,
    `├ <b>Desk:</b> ${esc(product.desc)}`,
    `╰──────────────────────╯`,
    ``,
  `<b>Variasi, Harga & Stok:</b>
──────────────`,
    variantList,
    ``,
    `🔄 <i>Refresh at ${now}</i>`
  ].join('\n').trim();

  const variantButtons = [];
  for (let i = 0; i < product.variants.length; i += 2) {
    const row = [];
    const v1 = product.variants[i];
    const v2 = product.variants[i + 1];

    if (v1) {
      const v1Text = `${v1.name} - Rp ${rupiah(v1.price)}‎`;
      row.push(
        v1.stock > 0
          ? { text: v1Text, callback_data: `buy_${product.id}_${v1.name}` }
          : { text: `🚫 ${v1Text}`, callback_data: 'noop' }
      );
    }

    if (v2) {
      const v2Text = `${v2.name} - Rp ${rupiah(v2.price)}‎`;
      row.push(
        v2.stock > 0
          ? { text: v2Text, callback_data: `buy_${product.id}_${v2.name}` }
          : { text: `🚫 ${v2Text}`, callback_data: 'noop' }
      );
    }

    variantButtons.push(row);
  }

  const inlineKeyboard = [
    ...variantButtons,
    [{ text: '🔁 Refresh', callback_data: `refresh_${product.id}` }]
  ];

try {
  let sentMsg;

  if (product.isImage && product.image_url && product.image_url !== "-") {
    // 🔥 Kirim foto langsung dari link Catbox
    sentMsg = await ctx.telegram.sendPhoto(chatId, product.image_url, {
      caption: text + '\n',
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: inlineKeyboard }
    });
  } else {
    // 💬 Kalau gak ada gambar, kirim teks biasa
    sentMsg = await ctx.reply(text + '\n', {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: inlineKeyboard }
    });
  }

// 🧩 Simpan message aktif biar bisa dihapus/track nanti
await trackSentProduct(ctx, product, sentMsg, false); // false = ini pesan produk, bukan transaksi
} catch (err) {
  console.error("❌ Gagal kirim produk:", err);
  await ctx.reply(text, {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: inlineKeyboard },
  });
}
});


// === 🧩 NOOP HANDLER (buat tombol stok habis) ===
bot.on("callback_query", async (ctx, next) => {
  try {
    const data = ctx.callbackQuery.data;
    if (data === "noop") {
      await ctx.answerCbQuery("🚫 Stok habis, silakan cek lagi nanti!");
      return; // ❌ stop di sini (memang mau berhenti)
    }
    await next(); // ✅ biar handler lain tetap jalan
  } catch (err) {
    console.error("❌ Error di noop handler:", err);
    await next();
  }
});


// === 🔁 HANDLER REFRESH & BELI (callback inline + tombol jumlah) ===
bot.on("callback_query", async (ctx, next) => {
  try {
    const data = ctx.callbackQuery.data;
    console.log("Callback diterima:", data);
    if (
      !data.startsWith("refresh_") &&
      !data.startsWith("buy_") &&
      !data.startsWith("inc_") &&
      !data.startsWith("dec_") &&
      !data.startsWith("back_") &&
      !data.startsWith("pay_") &&
      !data.startsWith("cancel_pay_") &&
      !data.startsWith("confirm_pay_")
    ) {
      return await next(); // ✅ skip kalau bukan callback beli
    }

    const msg = ctx.callbackQuery.message;
    const products = await loadProducts();

    const editCaptionSafe = async (ctx, text, keyboard) => {
      try {
        await ctx.editMessageCaption(text, {
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: keyboard },
        });
      } catch (err) {
        console.error("❌ editCaptionSafe error:", err.message);
        try {
          await ctx.editMessageText(text, {
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: keyboard },
          });
        } catch (err2) {
          console.error("❌ fallback editMessageText error:", err2.message);
        }
      }
    };

// === 💳 BAYAR DENGAN QRIS (step konfirmasi + batal) ===
if (data.startsWith("pay_qris_")) {
  console.log("Callback QRIS diterima:", data); // 🔍 Debug

  const parts = data.split("_");
  const pid = parts[2];
  const lastPart = parts[parts.length - 1];
  const jumlahFromCb = !isNaN(parseInt(lastPart)) ? parseInt(lastPart) : null;
  const variantName =
    jumlahFromCb !== null ? parts.slice(3, -1).join("_") : parts.slice(3).join("_");

  let jumlah = jumlahFromCb ?? 1;
  if (jumlahFromCb === null) {
    const msgText = ctx.callbackQuery.message.caption || ctx.callbackQuery.message.text || "";
    const match = msgText.match(/Jumlah Pesanan:\s*x(\d+)/i);
    if (match) jumlah = parseInt(match[1]);
  }

  const products = await loadProducts();
  const product = products.find((p) => String(p.id) === pid);
  if (!product) return ctx.answerCbQuery("❌ Produk tidak ditemukan");
  const variant = product.variants.find((v) => v.name === variantName);
  if (!variant) return ctx.answerCbQuery("❌ Varian tidak ditemukan");

  const total = variant.price * jumlah;
  const now = dayjs().tz().format("HH.mm.ss [WIB]");

  const text = [
    `<b>💳 KONFIRMASI PEMBAYARAN 💳</b>`,
    `╭──────────────────────╮`,
    `├ <b>Produk:</b> ${product.name}`,
    `├ <b>Varian:</b> ${variant.name}`,
    `├ <b>Jumlah Pesanan:</b> x${jumlah}`,
    `├ <b>Total Bayar:</b> Rp ${rupiah(total)}`,
    `╰──────────────────────╯`,
    ``,
    `Yakin ingin membayar menggunakan QRIS?`,
    ``,
    `🔄 <i>Refresh at ${now}</i>`,
  ].join("\n");

  const keyboard = [
  [
    { text: "✅ Ya, Lanjut Bayar", callback_data: `paid_qris_${pid}` },
    { text: "❌ Batal",            callback_data: `cancel_confirm_${pid}` }, // ⬅️ ganti ini
  ],
];

  // 💾 Simpan data jumlah & total ke session
  const sessKey = `${ctx.chat.id}:${ctx.chat.id}`;
  sessions.set(sessKey, {
    productId: pid,
    variant: variant.name,
    jumlah,
    total,
  });
  console.log(`💾 Session disimpan: { jumlah: ${jumlah}, total: ${total}, variant: ${variant.name} }`);

  // 🩹 Fix: aman untuk produk tanpa foto
  try {
    if (ctx.callbackQuery.message.caption) {
      await ctx.editMessageCaption(text, {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: keyboard },
      });
    } else {
      await ctx.editMessageText(text, {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: keyboard },
      });
    }
  } catch (err) {
    console.warn("⚠️ Gagal edit caption, fallback ke text:", err.description);
    try {
      await ctx.editMessageText(text, {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: keyboard },
      });
    } catch (e) {
      console.error("❌ Gagal edit pesan:", e.description);
    }
  }

  return ctx.answerCbQuery("💳 Konfirmasi pembayaran QRIS terbuka 💳");
}

// === 🔁 HANDLER REFRESH (auto-sync stok dari /stok/<code>.json ke /data/products.json + log debug) ===
if (data.startsWith("refresh_")) {
  try {
    const pid = parseInt(data.split("_")[1]);
    const productsPath = path.join(__dirname, "data", "products.json");

    // load semua produk
    const products = JSON.parse(fs.readFileSync(productsPath, "utf8"));
    const product = products.find((p) => p.id === pid);
    if (!product) return ctx.answerCbQuery("⚠️ Produk tidak ditemukan!");

    // 💡 ambil berdasarkan CODE (bukan ID)
    const code = product.code?.toLowerCase();
    const stokPath = path.join(__dirname, "stok", `${code}.json`);

    console.log(`\n🧩 [REFRESH] Sinkron stok produk "${product.name}" (${code})`);
    console.log(`📂 Path file stok: ${stokPath}`);

    // 🔄 auto sinkron stok + KEEP transaksi pending
    if (fs.existsSync(stokPath)) {
      const stokList = JSON.parse(fs.readFileSync(stokPath, "utf8"));
      console.log(`📦 Jumlah data stok di file: ${stokList.length}`);

      for (const v of product.variants) {
        // stok REAL dari file stok/<code>.json
        const realCount = stokList.filter(
          (s) =>
            s.varian &&
            s.varian.toLowerCase() === v.name.toLowerCase()
        ).length;

        // 🔐 hitung transaksi PENDING yang lagi nge-KEEP varian ini
        let pendingQty = 0;
        try {
          const pendingList = await tx.find(
            (t) =>
              t.status === "pending" &&
              Number(t.product_id) === Number(product.id) &&
              String(t.variant_name || "").toLowerCase() ===
                v.name.toLowerCase()
          );

          pendingQty = pendingList.reduce(
            (sum, t) => sum + (Number(t.qty || 0) || 0),
            0
          );
        } catch (e) {
          console.warn(
            "⚠️ Gagal baca transaksi pending untuk keep stok:",
            e.message
          );
        }

        // stok yang DITAMPILIN ke user = stok real - total qty pending (minimal 0)
        const effective = Math.max(0, realCount - pendingQty);

        v.stock = effective;
        console.log(
          `➡️ Varian "${v.name}" stok real: ${realCount}, pending: ${pendingQty}, tampil: ${effective}`
        );
      }

      // simpan hasil update stok ke /data/products.json
      fs.writeFileSync(productsPath, JSON.stringify(products, null, 2));
      console.log(`✅ Stok tersinkron ke ${productsPath}\n`);
    } else {
      console.warn(`⚠️ File stok tidak ditemukan: ${stokPath}\n`);
    }

    const now = dayjs().tz().format("HH.mm.ss [WIB]");
    const msg = ctx.callbackQuery.message;
    const caption = msg.caption || msg.text || "";
    const isOrder = caption.includes("KONFIRMASI PESANAN");

    const editCaptionSafe = async (ctx, text, keyboard) => {
      try {
        await ctx.editMessageCaption(text, {
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: keyboard },
        });
      } catch {
        try {
          await ctx.editMessageText(text, {
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: keyboard },
          });
        } catch (err2) {
          console.error("editCaptionSafe fail:", err2.message);
        }
      }
    };

    // === 🛒 Tampilan Konfirmasi Pesanan ===
    if (isOrder) {
      const variantName =
        caption.match(/Varian:\s(.+)/)?.[1]?.trim() ||
        product.variants[0].name;

      const jumlah =
        parseInt(caption.match(/Jumlah Pesanan:\s*x(\d+)/i)?.[1] || "1") || 1;

      const variant = product.variants.find((v) => v.name === variantName);
      const total = variant.price * jumlah;

      const text = [
        `<b>KONFIRMASI PESANAN 🛒</b>`,
        `╭──────────────────────╮`,
        `├ <b>Produk:</b> ${product.name}`,
        `├ <b>Varian:</b> ${variant.name}`,
        `├ <b>Harga satuan:</b> Rp ${rupiah(variant.price)}`,
        `├ <b>Stok tersedia:</b> ${variant.stock}`,
        `╰──────────────────────╯`,
        ``,
        `💰 <b>Jumlah Pesanan:</b> x${jumlah}`,
        `💵 <b>Total Pembayaran:</b> Rp ${rupiah(total)}`,
        ``,
        `🔄 <i>Refresh at ${now}</i>`,
      ].join("\n");

      const keyboard = [
        [
          { text: "−1", callback_data: `dec_${pid}_${variantName}` },
          { text: "+1", callback_data: `inc_${pid}_${variantName}` },
        ],
        [
          {
            text: "💳 QRIS",
            callback_data: `pay_qris_${pid}_${variantName}`,
          },
          {
            text: "💰 Saldo",
            callback_data: `pay_saldo_${pid}_${variantName}`,
          },
        ],
        [{ text: "🔁 Refresh", callback_data: `refresh_${pid}` }],
        [{ text: "⬅️ Back", callback_data: `back_${pid}` }],
      ];

      await safeEditProductMessage(
        bot,
        {
          chatId: ctx.chat.id,
          messageId: ctx.callbackQuery.message.message_id,
          isPhoto: !!ctx.callbackQuery.message.caption,
          type: ctx.callbackQuery.message.caption ? "photo" : "text",
        },
        text,
        keyboard
      );

            if (ctx.callbackQuery?.message?.message_id) {
        activeMessages = activeMessages.filter(
          (m) =>
            !(
              m.chatId === ctx.chat.id &&
              m.messageId === ctx.callbackQuery.message.message_id
            )
        );

        activeMessages.push({
          chatId: ctx.chat.id,
          messageId: ctx.callbackQuery.message.message_id,
          productId: product.id,
          isPhoto: !!ctx.callbackQuery.message.caption,
          type: ctx.callbackQuery.message.caption ? "photo" : "text",
          isTransaction: false, // ⬅️ KUNCI: ini katalog/konfirmasi, bukan QRIS
        });
      }
      return ctx.answerCbQuery("♻️ Diperbarui!");
    }

    // === tampilan produk biasa ===
    const variantList = product.variants
      .map(
        (v) =>
          `• ${v.name}: <b>Rp ${rupiah(v.price)}</b> - Stok: ${v.stock}`
      )
      .join("\n");

    const text = [
      `SEN PRO PREMIUM APPS`,
      `╭──────────────────────╮`,
      `├ <b>Produk:</b> ${product.name}`,
      `├ <b>Stok Terjual:</b> ${Number(product.sold || 0)}`,
      `├ <b>Desk:</b> ${esc(product.desc)}`,
      `╰──────────────────────╯`,
      ``,
      `<b>Variasi, Harga & Stok:</b>
──────────────`,
      variantList,
      ``,
      `🔄 <i>Refresh at ${now}</i>`,
      `<b><i></i></b>`,
    ].join("\n");

    const variantButtons = [];
    for (let i = 0; i < product.variants.length; i += 2) {
      const row = [];
      const v1 = product.variants[i];
      const v2 = product.variants[i + 1];

      if (v1) {
        const v1Text = `${v1.name} - Rp ${rupiah(v1.price)}‎`;
        row.push(
          v1.stock > 0
            ? { text: v1Text, callback_data: `buy_${product.id}_${v1.name}` }
            : { text: `🚫 ${v1Text}`, callback_data: "noop" }
        );
      }

      if (v2) {
        const v2Text = `${v2.name} - Rp ${rupiah(v2.price)}‎`;
        row.push(
          v2.stock > 0
            ? { text: v2Text, callback_data: `buy_${product.id}_${v2.name}` }
            : { text: `🚫 ${v2Text}`, callback_data: "noop" }
        );
      }

      variantButtons.push(row);
    }

    await safeEditProductMessage(
      bot,
      {
        chatId: ctx.chat.id,
        messageId: ctx.callbackQuery.message.message_id,
        isPhoto: !!ctx.callbackQuery.message.caption,
        type: ctx.callbackQuery.message.caption ? "photo" : "text",
      },
      text,
      [
        ...variantButtons,
        [{ text: "🔁 Refresh", callback_data: `refresh_${product.id}` }],
      ]
    );
    // ⬇️ Tambahin ini
    if (ctx.callbackQuery?.message?.message_id) {
      activeMessages = activeMessages.filter(
        (m) =>
          !(
            m.chatId === ctx.chat.id &&
            m.messageId === ctx.callbackQuery.message.message_id
          )
      );

      activeMessages.push({
        chatId: ctx.chat.id,
        messageId: ctx.callbackQuery.message.message_id,
        productId: product.id,
        isPhoto: !!ctx.callbackQuery.message.caption,
        type: ctx.callbackQuery.message.caption ? "photo" : "text",
        isTransaction: false, // ⬅️ tandain katalog
      });
    }
    return ctx.answerCbQuery("♻️ Diperbarui!");
  } catch (err) {
    console.error("refresh error:", err);
    await ctx.answerCbQuery("❌ Gagal sinkron stok", { show_alert: true });
  }
}
// === 🛒 BELI ===
if (data.startsWith("buy_")) {
  const [_, pid, variantName] = data.split("_");
  const product = products.find((p) => String(p.id) === pid);
  const variant = product.variants.find((v) => v.name === variantName);
  const jumlah = 1;
  const total = variant.price * jumlah;
  const now = dayjs().tz().format("HH.mm.ss [WIB]");

  const text = [
    `<b>KONFIRMASI PESANAN 🛒</b>`,
    `╭──────────────────────╮`,
    `├ <b>Produk:</b> ${product.name}`,
    `├ <b>Varian:</b> ${variant.name}`,
    `├ <b>Harga satuan:</b> Rp ${rupiah(variant.price)}`,
    `├ <b>Stok tersedia:</b> ${variant.stock}`,
    `╰──────────────────────╯`,
    ``,
    `💰 <b>Jumlah Pesanan:</b> x${jumlah}`,
    `💵 <b>Total Pembayaran:</b> Rp ${rupiah(total)}`,
    ``,
    `🔄 <i>Refresh at ${now}</i>`,
  ].join("\n");

  const keyboard = [
    [
      { text: "−1", callback_data: `dec_${pid}_${variantName}` },
      { text: "+1", callback_data: `inc_${pid}_${variantName}` },
    ],
    [
      {
        text: "💳 QRIS",
        callback_data: `pay_qris_${pid}_${variantName}`,
      },
      {
        text: "💰 Saldo",
        callback_data: `pay_saldo_${pid}_${variantName}`,
      },
    ],
    [{ text: "🔁 Refresh", callback_data: `refresh_${pid}` }],
    [{ text: "⬅️ Back", callback_data: `back_${pid}` }],
  ];

  await safeEditProductMessage(
    bot,
    {
      chatId: ctx.chat.id,
      messageId: ctx.callbackQuery.message.message_id,
      isPhoto: !!ctx.callbackQuery.message.caption,
      type: ctx.callbackQuery.message.caption ? "photo" : "text",
    },
    text,
    keyboard
  );

  return;
}
// === 🔢 +1 / −1 ===
if (data.startsWith("inc_") || data.startsWith("dec_")) {
  const [action, pid, variantName] = data.split("_");
  const product = products.find((p) => String(p.id) === pid);
  const variant = product.variants.find((v) => v.name === variantName);

  const caption = msg.caption || msg.text || "";
  const jumlahMatch = caption.match(/Jumlah Pesanan:\s*x(\d+)/i);
  let jumlah = jumlahMatch ? parseInt(jumlahMatch[1]) : 1;

  if (action === "inc" && jumlah < variant.stock) jumlah++;
  if (action === "dec" && jumlah > 1) jumlah--;

  const total = variant.price * jumlah;
  const now = dayjs().tz().format("HH.mm.ss [WIB]");

  const text = [
    `<b>KONFIRMASI PESANAN 🛒</b>`,
    `╭──────────────────────╮`,
    `├ <b>Produk:</b> ${product.name}`,
    `├ <b>Varian:</b> ${variant.name}`,
    `├ <b>Harga satuan:</b> Rp ${rupiah(variant.price)}`,
    `├ <b>Stok tersedia:</b> ${variant.stock}`,
    `╰──────────────────────╯`,
    ``,
    `💰 <b>Jumlah Pesanan:</b> x${jumlah}`,
    `💵 <b>Total Pembayaran:</b> Rp ${rupiah(total)}`,
    ``,
    `🔄 <i>Refresh at ${now}</i>`,
  ].join("\n");

  const keyboard = [
    [
      { text: "−1", callback_data: `dec_${pid}_${variantName}` },
      { text: "+1", callback_data: `inc_${pid}_${variantName}` },
    ],
    [
      {
        text: "💳 QRIS",
        callback_data: `pay_qris_${pid}_${variantName}`,
      },
      {
        text: "💰 Saldo",
        callback_data: `pay_saldo_${pid}_${variantName}`,
      },
    ],
    [{ text: "🔁 Refresh", callback_data: `refresh_${pid}` }],
    [{ text: "⬅️ Back", callback_data: `back_${pid}` }],
  ];

  await safeEditProductMessage(
    bot,
    {
      chatId: ctx.chat.id,
      messageId: ctx.callbackQuery.message.message_id,
      isPhoto: !!ctx.callbackQuery.message.caption,
      type: ctx.callbackQuery.message.caption ? "photo" : "text",
    },
    text,
    keyboard
  );

  return ctx.answerCbQuery(`Jumlah: ${jumlah}`);
}

// === 💳 BAYAR DENGAN SALDO (step konfirmasi + batal) ===
if (data.startsWith("pay_saldo_")) {
  const parts = data.split("_");
  const pid = parts[2];

  // 🧩 Deteksi jumlah dari callback atau caption
  const lastPart = parts[parts.length - 1];
  const jumlahFromCb = !isNaN(parseInt(lastPart)) ? parseInt(lastPart) : null;

  // Gabung varian dengan aman
  const variantName =
    jumlahFromCb !== null
      ? parts.slice(3, -1).join("_") // kalau ada qty di akhir
      : parts.slice(3).join("_"); // kalau gak ada qty

  // Ambil jumlah pesanan
  let jumlah = jumlahFromCb ?? 1;
  if (jumlahFromCb === null) {
    const msgText =
      ctx.callbackQuery.message.caption || ctx.callbackQuery.message.text || "";
    const match = msgText.match(/Jumlah Pesanan:\s*x(\d+)/i);
    if (match) jumlah = parseInt(match[1]);
  }

  const products = await loadProducts();
  const product = products.find((p) => String(p.id) === pid);
  if (!product) return ctx.answerCbQuery("❌ Produk tidak ditemukan");

  const variant = product.variants.find((v) => v.name === variantName);
  if (!variant) return ctx.answerCbQuery("❌ Varian tidak ditemukan");

  const db = await loadDB();
  const users = db.users;
  const user = users[String(ctx.chat.id)];
  if (!user)
    return ctx.answerCbQuery("⚠️ Kamu belum terdaftar, ketik /start dulu!");

  // 💰 Hitung total sesuai jumlah pesanan
  const total = variant.price * jumlah;
  const now = dayjs().tz().format("HH.mm.ss [WIB]");

  // Step konfirmasi
  const text = [
    `<b>💳 KONFIRMASI PEMBAYARAN 💳</b>`,
    `╭──────────────────────╮`,
    `├ <b>Produk:</b> ${product.name}`,
    `├ <b>Varian:</b> ${variant.name}`,
    `├ <b>Jumlah Pesanan:</b> x${jumlah}`,
    `├ <b>Total Bayar:</b> Rp ${rupiah(total)}`,
    `├ <b>Saldo Kamu:</b> Rp ${rupiah(user.balance)}`,
    `╰──────────────────────╯`,
    ``,
    user.balance >= total
      ? `Yakin ingin membayar menggunakan saldo kamu?`
      : `❌ Saldo tidak cukup! Silakan isi saldo dulu.`,
    ``,
    `🔄 <i>Refresh at ${now}</i>`,
  ].join("\n");

  const keyboard =
    user.balance >= total
      ? [
          [
            {
              text: "✅ Ya, Lanjut Bayar",
              callback_data: `confirm_pay_${pid}_${variantName}_${jumlah}`, // ✅ kirim qty juga
            },
            { text: "❌ Batal", callback_data: `cancel_pay_${pid}` },
          ],
        ]
      : [[{ text: "⬅️ Kembali", callback_data: `back_${pid}` }]];

  // 🔧 Fix utama: cek apakah pesan punya caption (foto) atau teks biasa
  if (ctx.callbackQuery.message.caption) {
    await ctx.editMessageCaption(text, {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: keyboard },
    });
  } else {
    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: keyboard },
    });
  }

  return ctx.answerCbQuery("💳 Konfirmasi pembayaran terbuka 💳");
}

// === ✅ KONFIRMASI PEMBAYARAN ===
if (data.startsWith("confirm_pay_")) {
  try {
    const parts = data.split("_");
    const pid = parts[2];

    // 🧩 Deteksi jumlah dari callback atau caption
    const lastPart = parts[parts.length - 1];
    const jumlahFromCb = !isNaN(parseInt(lastPart)) ? parseInt(lastPart) : null;

    // Gabung varian sesuai isi callback
    const variantName =
      jumlahFromCb !== null
        ? parts.slice(3, -1).join("_") // kalau ada jumlah di akhir
        : parts.slice(3).join("_"); // kalau tidak ada jumlah

    // Ambil jumlah (dari callback atau caption fallback)
    let jumlah = jumlahFromCb ?? 1;
    if (jumlahFromCb === null) {
      const msgText =
        ctx.callbackQuery.message.caption || ctx.callbackQuery.message.text || "";
      const match = msgText.match(/Jumlah Pesanan:\s*x(\d+)/i);
      if (match) jumlah = parseInt(match[1]);
    }

    const products = await loadProducts();
    const product = products.find((p) => String(p.id) === pid);
    if (!product) return ctx.answerCbQuery("❌ Produk tidak ditemukan");

    const variant = product.variants.find((v) => v.name === variantName);
    if (!variant) return ctx.answerCbQuery("❌ Stok Varian Habis!");

    const db = await loadDB();
    const users = db.users;
    const user = users[String(ctx.chat.id)];
    if (!user)
      return ctx.answerCbQuery("⚠️ Kamu belum terdaftar, ketik /start dulu!");

    // 💰 Hitung total sesuai jumlah
    const total = variant.price * jumlah;
    if (user.balance < total)
      return ctx.answerCbQuery("❌ Saldo tidak cukup!");

    // 💰 Kurangi saldo & stok sesuai jumlah
    user.balance -= total;
    variant.stock -= jumlah;
    product.sold += jumlah;

    // === 🎁 Ambil akun dari stok/<code>.json ===
    const code = product.code?.toLowerCase();
    const stokPath = path.join(__dirname, "stok", `${code}.json`);
    let akunText = "❌ Tidak ada akun tersedia";
    let akunDataList = []; // simpan beberapa akun

    if (fs.existsSync(stokPath)) {
      const stokList = JSON.parse(fs.readFileSync(stokPath, "utf8"));

      // Ambil semua akun yang cocok dengan varian
      const stokFiltered = stokList.filter(
        (s) => s.varian && s.varian.toLowerCase() === variant.name.toLowerCase()
      );

      if (stokFiltered.length >= jumlah) {
        // Ambil sebanyak jumlah pesanan
        akunDataList = stokFiltered.slice(0, jumlah).map((a) => ({
          email: a.email || "-",
          password: a.password || "-",
        }));

        // Format tampilan akun banyak
        akunText = akunDataList
          .map(
            (a, i) =>
              `🔹 <b>Akun ${i + 1}</b>\n` +
              `Email: <code>${a.email}</code>\n` +
              `Password: <code>${a.password}</code>`
          )
          .join("\n\n");

        // Hapus akun yang sudah dikirim dari stok file
        const sisaStok = stokList.filter(
          (s) => !akunDataList.some((a) => a.email === s.email)
        );
        fs.writeFileSync(stokPath, JSON.stringify(sisaStok, null, 2));

        console.log(`🗑️ ${jumlah} akun dihapus dari ${stokPath}`);
      } else {
        akunText = `⚠️ Stok akun varian ${variant.name} tidak mencukupi!`;
        console.warn("⚠️ Jumlah stok akun tidak cukup");
      }
    } else {
      console.warn(`⚠️ File stok tidak ditemukan: ${stokPath}`);
    }

    // 💾 Simpan perubahan ke file utama
    await saveDB(db);
    await saveProducts(products);

    // === 💾 Simpan transaksi ke /data/transactions.json ===
    const transactions = await loadTransactions();
    const txId = "TXN" + Date.now();
    const nowFull = dayjs().tz().format("YYYY-MM-DD HH:mm:ss [WIB]");

    // Simpan semua akun dalam 1 transaksi
    transactions.push({
      id: txId,
      user_id: String(ctx.chat.id),
      username: user.username || ctx.from?.username || "-",
      product: product.name,
      variant: variant.name,
      price: variant.price,
      qty: jumlah,
      total: total,
      method: "saldo",
      status: "Sukses",
      timestamp: nowFull,
      akun: akunDataList, // ✅ simpan semua akun
    });

    await saveTransactions(transactions);
    console.log(`💾 Transaksi ${txId} disimpan ke data/transactions.json`);

    // === 📨 Kirim pesan hasil pembayaran ===
    const now = dayjs().tz().format("HH.mm.ss [WIB]");
    const text = [
      `<b>✅ PEMBAYARAN BERHASIL!</b>`,
      `╭──────────────────────╮`,
      `├ <b>Produk:</b> ${product.name}`,
      `├ <b>Varian:</b> ${variant.name}`,
      `├ <b>Jumlah:</b> x${jumlah}`,
      `├ <b>Total:</b> Rp ${rupiah(total)}`,
      `├ <b>Sisa Saldo:</b> Rp ${rupiah(user.balance)}`,
      `╰──────────────────────╯`,
      ``,
      `🎁 <b>Akun Kamu:</b>\n${akunText}`,
      ``,
      `Terima kasih telah berbelanja di <b>SEN PRO</b> 💙`,
      `🧾 <i>ID Transaksi:</i> <code>${txId}</code>`,
      `🕒 ${now}`,
    ].join("\n");

    const isPhoto = !!ctx.callbackQuery.message.caption;

    let keyboard;
    if (akunText.includes("Akun 1")) {
      keyboard = undefined; // akun valid → jangan tampilkan tombol
    } else {
      keyboard = {
        inline_keyboard: [[{ text: "⬅️ Kembali ke Produk", callback_data: `back_${pid}` }]],
      };
    }

    try {
      if (isPhoto) {
        await ctx.editMessageCaption(text, {
          parse_mode: "HTML",
          reply_markup: keyboard,
        });
      } else {
        await ctx.editMessageText(text, {
          parse_mode: "HTML",
          reply_markup: keyboard,
        });
      }
    } catch (err) {
      console.error("❌ Gagal edit pesan:", err.message);
    }

// === 📜 Kirim Pesan Syarat & Ketentuan (selalu kirim, meski tanpa foto) ===
if (variant.snk && variant.snk.trim() !== "" && variant.snk.trim() !== "-") {
  const snkText = [
    `<b>📋 Syarat & Ketentuan</b>`,
    ``,
    variant.snk.trim(),
  ].join("\n");

  // 🚀 Jalankan di background (tanpa await) supaya gak ganggu handler utama
  (async () => {
    try {
      // kasih delay dikit biar tampil rapi setelah pesan akun
      await new Promise(r => setTimeout(r, 800));

      // kirim teks aja (gak peduli produknya ada foto atau gak)
      await ctx.telegram.sendMessage(ctx.chat.id, snkText, {
        parse_mode: "HTML"
      });

      console.log(`📜 SNK dikirim (selalu kirim) untuk ${product.name} - ${variant.name}`);
    } catch (err) {
      console.error("❌ Gagal kirim SNK:", err.message);
    }
  })();
}

    // 🚫 Matikan auto-sync
    activeMessages = activeMessages.filter(
      (m) =>
        !(
          m.chatId === ctx.chat.id &&
          m.messageId === ctx.callbackQuery.message.message_id
        )
    );
    console.log(`🧩 Auto-sync dimatikan untuk pesan user ${ctx.chat.id}`);

    return ctx.answerCbQuery("✅ Pembayaran sukses!");
  } catch (err) {
    console.error("❌ confirm_pay_ error:", err);
    return ctx.answerCbQuery("⚠️ Gagal memproses pembayaran", { show_alert: true });
  }
}

// === ❌ BATAL PEMBAYARAN ===
if (data.startsWith("cancel_pay_")) {
  try {
    // hentikan spinner di tombol
    try { await ctx.answerCbQuery('Memproses pembatalan…'); } catch {}

    const txId = Number(data.split("_")[2]);

    // --- ambil transaksi dari DB yang sama dengan validator
    let rec = null;
    if (typeof tx?.findById === 'function') {
      rec = await tx.findById(txId);
    } else if (typeof tx?.find === 'function') {
      const arr = await tx.find(t => String(t.id) === String(txId));
      rec = Array.isArray(arr) ? arr[0] : arr;
    } else if (typeof tx?.getAll === 'function') {
      const all = await tx.getAll();
      rec = (all || []).find(t => String(t.id) === String(txId));
    }

    // identitas pesan yg lagi tampil
    const msg       = ctx.callbackQuery?.message;
    const chatId    = msg?.chat?.id || rec?.user_id || ctx.from?.id;
    const messageId = msg?.message_id || rec?.message_id;

    // kalau record ga ketemu, tetap hapus pesan QR biar bersih
    if (!rec) {
      if (chatId && messageId) { try { await ctx.telegram.deleteMessage(chatId, messageId); } catch {} }
      try { await ctx.answerCbQuery('Transaksi tidak ditemukan / sudah kadaluarsa'); } catch {}
      return;
    }

    // opsional: pastikan hanya pemilik yang boleh
    if (rec.user_id && String(rec.user_id) !== String(ctx.from?.id)) {
      try { await ctx.answerCbQuery('Kamu tidak berhak membatalkan transaksi ini.', { show_alert: true }); } catch {}
      return;
    }

    // matikan keyboard biar gak dobel klik
    try { await ctx.editMessageReplyMarkup({ inline_keyboard: [] }); } catch {}

    // kalau masih pending → tandai canceled (ini yang bikin cron stop ngecek)
    if (String(rec.status || '').toLowerCase() === 'pending') {
      const patch = { status: 'canceled', canceled_at: new Date().toISOString() };

      if (typeof tx?.updateById === 'function') {
        await tx.updateById(rec.id, patch);
      } else if (typeof tx?.update === 'function') {
        await tx.update(rec.id, patch);
      } else if (typeof tx?.getAll === 'function' && typeof tx?.setAll === 'function') {
        const all = await tx.getAll();
        const next = (all || []).map(x => String(x.id) === String(rec.id) ? { ...x, ...patch } : x);
        await tx.setAll(next);
      }
      // kalau punya API cancel gateway (opsional), panggil di sini
      // if (typeof trx?.cancel === 'function') { try { await trx.cancel(rec.reference_id); } catch {} }
    }

    // hapus pesan QR
    if (chatId && messageId) { try { await ctx.telegram.deleteMessage(chatId, messageId); } catch {} }

    // === kirim notifikasi pembatalan pakai foto canceled ===
    const canceledAt = dayjs().tz('Asia/Jakarta').format('DD/MM/YYYY HH:mm:ss [WIB]');

    const cap = [
  '❌ <b>PESANAN DIBATALKAN</b> ❌',
  '╔════════════════════════╗',
  '║ Status       : Dibatalkan oleh pengguna',
  `║ Waktu        : ${canceledAt}`,
  `║ ID Transaksi :`,
  `║ ${rec.reference_id || rec.refId || rec.id}`,
  '╚════════════════════════╝',
  '',
  '🛑 Pesanan kamu berhasil dibatalkan. 🛑',
].join('\n');

    const canceledPhotoPath = path.resolve(__dirname, 'assets', 'canceled.jpg');

    try {
      await ctx.replyWithPhoto({ source: canceledPhotoPath }, { caption: cap, parse_mode: 'HTML' });
    } catch {
      try {
        await ctx.telegram.sendPhoto(chatId, { source: canceledPhotoPath }, { caption: cap, parse_mode: 'HTML' });
      } catch {
        // fallback ke teks kalau kirim foto gagal
        try { await ctx.telegram.sendMessage(chatId, cap, { parse_mode: 'HTML' }); } catch {}
      }
    }

    try { await ctx.answerCbQuery('❌ Pesanan dibatalkan'); } catch {}
    return;
  } catch (e) {
    try { await ctx.answerCbQuery('Gagal membatalkan pesanan.', { show_alert: true }); } catch {}
    return;
  }
}

// === BACK ===
if (data.startsWith("back_")) {
  const pid = parseInt(data.split("_")[1]);
  const product = products.find((p) => p.id === pid);
  if (!product) return ctx.answerCbQuery("❌ Produk tidak ditemukan");

  const now = dayjs().tz().format("HH.mm.ss [WIB]");
  const variantList = product.variants
    .map(
      (v) =>
        `• ${v.name}: <b>Rp ${rupiah(v.price)}</b> - Stok: ${v.stock}`
    )
    .join("\n");

  // tambahin sedikit penanda waktu agar Telegram anggap teks berubah
  const text = [
    `SEN PRO PREMIUM APPS`,
    `╭──────────────────────╮`,
    `├ <b>Produk:</b> ${product.name}`,
    `├ <b>Stok Terjual:</b> ${Number(product.sold || 0)}`,
    `├ <b>Desk:</b> ${esc(product.desc)}`,
    `╰──────────────────────╯`,
    ``,
    `<b>Variasi, Harga & Stok:</b>
──────────────`,
    variantList,
    ``,
    `🔄 <i>Refresh at ${now}</i>`,
    `<b><i></i></b>` // ✅ tag dummy supaya konten beda
  ].join("\n");

  const variantButtons = [];
  for (let i = 0; i < product.variants.length; i += 2) {
    const row = [];
    const v1 = product.variants[i];
    const v2 = product.variants[i + 1];

    if (v1) {
      const v1Text = `${v1.name} - Rp ${rupiah(v1.price)}‎`;
      row.push(
        v1.stock > 0
          ? { text: v1Text, callback_data: `buy_${product.id}_${v1.name}` }
          : { text: `🚫 ${v1Text}`, callback_data: "noop" }
      );
    }

    if (v2) {
      const v2Text = `${v2.name} - Rp ${rupiah(v2.price)}‎`;
      row.push(
        v2.stock > 0
          ? { text: v2Text, callback_data: `buy_${product.id}_${v2.name}` }
          : { text: `🚫 ${v2Text}`, callback_data: "noop" }
      );
    }

    variantButtons.push(row);
  }

  // ✅ GANTI BAGIAN INI — gunakan safeEditProductMessage
  await safeEditProductMessage(bot, {
    chatId: ctx.chat.id,
    messageId: ctx.callbackQuery.message.message_id,
    isPhoto: !!ctx.callbackQuery.message.caption,
    type: ctx.callbackQuery.message.caption ? "photo" : "text",
  }, text, [
    ...variantButtons,
    [{ text: "🔁 Refresh", callback_data: `refresh_${product.id}` }],
  ]);

  return ctx.answerCbQuery("⬅️ Kembali ke detail produk");
}

      // ⬇️ INI WAJIB ADA! Nutup try dan bot.on
    } catch (err) {
      console.error("callback error:", err);
    }
  }); // ← ini yang lu ilangin kemarin

// === 📱 HANDLER PEMBAYARAN VIA QRIS (AUTO-VALIDASI + SIMPAN TRANSAKSI KE FILE) ===
bot.action(/^paid_qris_(\d+)$/, async (ctx) => {
  // jangan munculin popup lagi, cukup ganti caption
  await ctx.answerCbQuery();

  // ⏸ MATIKAN AUTO-SYNC SEMENTARA
  autoSyncPaused = true;

  try {
    // 1️⃣ UBAH PESAN JADI "Sedang membuat QRIS pembayaran..."
    const loadingCaption = '⌛ <b>Sedang membuat QRIS pembayaran...</b>';

    try {
      await ctx.editMessageCaption(loadingCaption, { parse_mode: 'HTML' });
    } catch {
      // kalau awalnya text biasa (bukan caption), fallback ke editMessageText
      try {
        await ctx.editMessageText(loadingCaption, { parse_mode: 'HTML' });
      } catch (err2) {
        console.error('gagal edit ke loadingCaption:', err2.message);
      }
    }

    // 2️⃣ LANJUT PROSES QRIS
    const pid = parseInt(ctx.match[1]);
    const chatId = String(ctx.chat.id);

    // 🧠 Ambil session dari step konfirmasi
    const sessKey = `${chatId}:${chatId}`;
    const session = sessions?.get(sessKey) || {};
    console.log("📦 Session dibaca:", session);

    const jumlah = Number(session.jumlah) > 0 ? Number(session.jumlah) : 1;
    const total  = Number(session.total)  > 0 ? Number(session.total)  : 0;
    const variantName = session.variant || "";

    // === LOAD DATA USER & PRODUK ===
    const db = await loadDB();
    const products = await loadProducts();
    const users = db.users || {};
    const user = users[chatId];
    if (!user) {
      return ctx.answerCbQuery("⚠️ Kamu belum terdaftar, ketik /start dulu!", { show_alert: true });
    }

    const product = products.find((p) => String(p.id) === String(pid));
    if (!product) {
      return ctx.answerCbQuery("⚠️ Produk tidak ditemukan!", { show_alert: true });
    }

    const variant =
      product.variants.find((v) => v.name === variantName) || product.variants[0];
    if (!variant) {
      return ctx.answerCbQuery("⚠️ Varian tidak ditemukan!", { show_alert: true });
    }

    if (variant.stock < jumlah) {
      return ctx.answerCbQuery("🚫 Stok tidak mencukupi!", { show_alert: true });
    }

    // === KIRIM QR + TOMBOL BATAL ===
    const createTx = await trx.create(
      chatId,
      user.username,
      product.id,
      variant.name,
      total,
      jumlah
    );

    const waitingText = [
      `⌛ <b>Silahkan Scan QRIS Diatas ⌛</b>`,
      ``,
      `╭──────────────────────╮`,
      `├ <b>Produk:</b> ${product.name}`,
      `├ <b>Varian:</b> ${variant.name}`,
      `├ - - - - - - - - - - - - - - - - - - - - - -`,
      `├ <b>Jumlah Pesanan:</b> x${jumlah}`,
      `├ <b>Harga:</b> Rp ${rupiah(total)}`,
      `├ <b>Total Pembayaran:</b> Rp ${rupiah(createTx.total_amount)}`,
      `├ - - - - - - - - - - - - - - - - - - - - - -`,
      `├ <b>ID Transaksi:</b>`,
      `├ ${createTx.refId}`,
      `╰──────────────────────╯`,
      ``,
      `Batas waktu pembayaran: <b>15 menit</b>`,
      `Produk akan kami kirim otomatis setelah pembayaran diterima.`,
    ].join('\n');

    const cancelKb = {
      inline_keyboard: [
        [{ text: '❌ Batalkan Pesanan', callback_data: `cancel_pay_${createTx.id}` }],
      ],
    };

    const useFrame = isQrisFrameOn(); // ON/OFF frame

    let sentMsgId = null;

    try {
      // tentukan media (frame / default)
      let media;
      if (useFrame) {
        console.time("buildFramedQris");
        const framed = await buildFramedQris(createTx.qr_url);
        console.timeEnd("buildFramedQris");
        media = { source: framed };
      } else {
        media = createTx.qr_url;
      }

      // 3️⃣ GANTI PESAN YANG SAMA MENJADI FOTO QRIS
      const m = await ctx.editMessageMedia(
        {
          type: 'photo',
          media,
          caption: waitingText,
          parse_mode: 'HTML',
        },
        { reply_markup: cancelKb }
      );

      sentMsgId =
        (m && (m.message_id || m.messageId)) ||
        (ctx.callbackQuery?.message?.message_id) ||
        null;
    } catch (e1) {
      console.error('editMessageMedia gagal, fallback replyWithPhoto:', e1.message);

      // fallback kirim pesan baru
      let media;
      if (useFrame) {
        console.time("buildFramedQris");
        const framed = await buildFramedQris(createTx.qr_url);
        console.timeEnd("buildFramedQris");
        media = { source: framed };
      } else {
        media = createTx.qr_url;
      }

      const m = await ctx.replyWithPhoto(media, {
        caption: waitingText,
        parse_mode: 'HTML',
        reply_markup: cancelKb,
      });
      sentMsgId = m?.message_id || null;
    }

    // simpan message_id aktif → buat dihapus saat batal/expired
    try {
      await trx.setMessageId(createTx.id, sentMsgId || 0);
    } catch {}

    // 🔒 tandai pesan ini sebagai TRANSAKSI biar auto-sync stok TIDAK mengedit
    try {
      activeMessages = (activeMessages || []).filter(
        (m) => !(m.chatId === ctx.chat.id && m.productId === product.id)
      );
      activeMessages.push({
        chatId: ctx.chat.id,
        messageId: sentMsgId,
        productId: product.id,
        isPhoto: true,
        type: 'photo',
        isTransaction: true, // auto-sync JANGAN sentuh pesan QRIS
      });
    } catch {}
  } finally {
    // 🔓 HIDUPKAN LAGI AUTO-SYNC SETELAH QRIS UDAH TAMPIL / ERROR
    autoSyncPaused = false;
  }
});


// === 🎨 /setframeqris (ADMIN ONLY — SET QRIS FRAME ON/OFF) ===
const { setQrisFrame } = require("./lib/config");

bot.command("setframeqris", async (ctx) => {
  const userId = ctx.from.id;

  // 🔄 Ambil settings + admin list terbaru
  const settings = getSettings();
  const admins = settings.admins || [];

   if (!isAdminNow(ctx)) {
    return ctx.reply("🚫 Kamu bukan admin.");
  }

  const args = ctx.message.text.split(/\s+/);
  const arg = (args[1] || "").toLowerCase();

  if (!["on", "off"].includes(arg)) {
    return ctx.reply(
      "Usage:\n" +
      "/setframeqris on  - pakai frame QRIS\n" +
      "/setframeqris off - pakai QR default"
    );
  }

  const on = arg === "on";
  const updated = setQrisFrame(on);

  return ctx.reply(
    `✅ Frame QRIS sekarang: ${updated ? "ON (pakai frame)" : "OFF (QR default)"}`
  );
});

// === ❌ BATALKAN PESANAN & KEMBALI KE DETAIL PRODUK ===
bot.action(/^cancel_confirm_(\d+)$/, async (ctx) => {
  try {
    const pid = Number(ctx.match[1]);
    const products = await loadProducts();
    const product = products.find(p => String(p.id) === String(pid));
    if (!product) { await ctx.answerCbQuery('Produk tidak ditemukan'); return; }

    const now = dayjs().tz().format("HH.mm.ss [WIB]");
    const variantList = (product.variants || [])
      .map(v => `• ${v.name}: <b>Rp ${rupiah(v.price)}</b> - Stok: ${v.stock}`)
      .join("\n");

    const text = [
      `SEN PRO PREMIUM APPS`,
      `╭──────────────────────╮`,
      `├ <b>Produk:</b> ${product.name}`,
      `├ <b>Stok Terjual:</b> ${Number(product.sold || 0)}`,
      `├ <b>Desk:</b> ${esc(product.desc)}`,
      `╰──────────────────────╯`,
      ``,
      `<b>Variasi, Harga & Stok:</b>
──────────────`,
      variantList,
      ``,
      `🔄 <i>Refresh at ${now}</i>`,
    ].join("\n");

    // susun tombol varian 2 kolom seperti biasa
    const variantButtons = [];
    for (let i = 0; i < (product.variants || []).length; i += 2) {
      const row = [];
      const v1 = product.variants[i];
      const v2 = product.variants[i + 1];
      if (v1) {
        const t = `${v1.name} - Rp ${rupiah(v1.price)}‎`;
        row.push(v1.stock > 0 ? { text: t, callback_data: `buy_${product.id}_${v1.name}` }
                              : { text: `🚫 ${t}`, callback_data: "noop" });
      }
      if (v2) {
        const t = `${v2.name} - Rp ${rupiah(v2.price)}‎`;
        row.push(v2.stock > 0 ? { text: t, callback_data: `buy_${product.id}_${v2.name}` }
                              : { text: `🚫 ${t}`, callback_data: "noop" });
      }
      variantButtons.push(row);
    }
    const kb = { inline_keyboard: [...variantButtons, [{ text: "🔁 Refresh", callback_data: `refresh_${product.id}` }]] };

    // edit pesan sesuai tipe (foto/teks)
    const msg = ctx.callbackQuery?.message;
    const hasMedia = !!(msg?.photo || msg?.video || msg?.animation || msg?.document);
    if (hasMedia) {
      await ctx.editMessageCaption(text, { parse_mode: "HTML", reply_markup: kb });
    } else {
      await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb, disable_web_page_preview: true });
    }

    await ctx.answerCbQuery('❌ Dibatalkan');
  } catch (e) {
    try { await ctx.answerCbQuery('Gagal membatalkan'); } catch {}
  }
});


// === 👑 /helpadmin (ADMIN ONLY — MEWAH & TERORGANISIR) ===
bot.command("helpadmin", async (ctx) => {
  try {
    // Sinkronisasi hak akses admin
    if (!isAdminNow(ctx)) return ctx.reply("🚫 Akses ditolak. Anda bukan admin.");

    const text = [
      `<b>👑 ADMIN CONTROL PANEL 👑</b>`,
      `<i>Pilih kategori di bawah untuk melihat daftar perintah.</i>`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `📦 <b>Produk</b>: Kelola item & urutan`,
      `📥 <b>Stok</b>: Tambah/hapus akun & SNK`,
      `🧾 <b>Transaksi</b>: Riwayat & kirim manual`,
      `⚙️ <b>Sistem</b>: Admin & Broadcast`,
      `━━━━━━━━━━━━━━━━━━━━`
    ].join("\n");

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback("📦 Produk", "help_produk"),
        Markup.button.callback("📥 Stok", "help_stok")
      ],
      [
        Markup.button.callback("🧾 Transaksi", "help_trx"),
        Markup.button.callback("⚙️ Sistem", "help_sys")
      ]
    ]);

    await ctx.reply(text, { parse_mode: "HTML", ...keyboard });
  } catch (err) {
    console.error("❌ Error helpadmin: ", err);
  }
});

// === HANDLER TOMBOL KATEGORI HELPADMIN ===
bot.action(/help_(produk|stok|trx|sys)/, async (ctx) => {
  try {
    if (!isAdminNow(ctx)) return ctx.answerCbQuery("🚫 Akses Ditolak!");
    
    const category = ctx.match[1];
    let categoryText = "";

    if (category === "produk") {
      categoryText = [
        `📦 <b>MENU PRODUK</b>`,
        `🔹 <b>/addproduk</b> — <code>Tambah Baru</code>`,
        `🔹 <b>/delproduk</b> — <code>Hapus Produk</code>`,
        `🔹 <b>/editnama</b> — <code>Ubah Nama</code>`,
        `🔹 <b>/editdesk</b> — <code>Ubah Deskripsi</code>`,
        `🔹 <b>/sortproduk</b> — <code>Urutkan A-Z</code>`,
        `🔹 <b>/cekcode</b> — <code>Lihat Kode</code>`
      ].join("\n");
    } else if (category === "stok") {
      categoryText = [
        `📥 <b>MENU STOK & SNK</b>`,
        `🔹 <b>/addstok</b> — <code>Tambah Akun</code>`,
        `🔹 <b>/delstok</b> — <code>Hapus Akun</code>`,
        `🔹 <b>/addvar</b> — <code>Tambah Varian</code>`,
        `🔹 <b>/editharga</b> — <code>Ubah Harga</code>`,
        `🔹 <b>/addsnk</b> — <code>Tambah S&K</code>`,
        `🔹 <b>/ceksnk</b> — <code>Lihat S&K</code>`
      ].join("\n");
    } else if (category === "trx") {
  categoryText = [
    `🧾 <b>MENU TRANSAKSI</b>`,
    `🔹 <b>/laporan</b> — <code>Omzet Hari Ini</code>`, // Perintah baru
    `🔹 <b>/cekid</b> — <code>Detail Transaksi</code>`,
    `🔹 <b>/riwayat</b> — <code>Cek User (@/ID)</code>`,
    `🔹 <b>/kirim</b> — <code>Kirim Manual</code>`,
    `🔹 <b>/saldo</b> — <code>Top up Saldo Manual</code>`
  ].join("\n");
} else {
      categoryText = [
        `⚙️ <b>MENU SISTEM</b>`,
        `🔹 <b>/adminlist</b> — <code>Lihat Admin</code>`,
        `🔹 <b>/addadmin</b> — <code>Tambah Admin</code>`,
        `🔹 <b>/deladmin</b> — <code>Hapus Admin</code>`,
        `🔹 <b>/broadcast</b> — <code>Kirim Pesan</code>`,
        `🔹 <b>/setframeqris</b> — <code>Toggle Frame</code>`
      ].join("\n");
    }

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback("⬅️ Kembali", "help_back")]
    ]);

    await ctx.editMessageText(categoryText + "\n\n━━━━━━━━━━━━━━━━━━━━", {
      parse_mode: "HTML",
      ...keyboard
    });
    await ctx.answerCbQuery();
  } catch (err) {
    console.error("❌ Error handler kategori: ", err);
  }
});

// Tombol Kembali ke Menu Utama Admin
bot.action("help_back", async (ctx) => {
  try {
    if (!isAdminNow(ctx)) return ctx.answerCbQuery("🚫 Akses Ditolak!");

    const text = [
      `<b>👑 ADMIN CONTROL PANEL 👑</b>`,
      `<i>Pilih kategori di bawah untuk melihat daftar perintah.</i>`,
      `━━━━━━━━━━━━━━━━━━━━`
    ].join("\n");
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback("📦 Produk", "help_produk"), Markup.button.callback("📥 Stok", "help_stok")],
      [Markup.button.callback("🧾 Transaksi", "help_trx"), Markup.button.callback("⚙️ Sistem", "help_sys")]
    ]);

    await ctx.editMessageText(text, { parse_mode: "HTML", ...keyboard });
    await ctx.answerCbQuery();
  } catch (err) {
    console.error("❌ Error back helpadmin: ", err);
  }
});

// COMMAND LAPORAN PENJUALAN
bot.command("laporan", async (ctx) => {
  try {
    if (!isAdminNow(ctx)) return ctx.reply("🚫 Akses khusus admin.");

    const transactions = await loadTransactions(); // Ambil data riil
    
    // Ambil tanggal hari ini dalam format standar bot Anda
    const todayStr = dayjs().tz("Asia/Jakarta").format("DD MMMM YYYY"); 
    
    // Filter transaksi: Pastikan status 'paid' atau 'Sukses'
    const trxToday = transactions.filter(t => {
      const tDate = String(t.timestamp || t.created_at || "");
      const tStatus = String(t.status || "").toLowerCase();
      // Mencocokkan tanggal hari ini & status sukses
      return tDate.includes(todayStr) && (tStatus === 'paid' || tStatus === 'sukses');
    });

    const totalTrx = trxToday.length;
    const totalQty = trxToday.reduce((sum, t) => sum + (Number(t.qty || t.jumlah || 0)), 0);
    const totalOmzet = trxToday.reduce((sum, t) => sum + (Number(t.total_amount || t.total || t.amount || 0)), 0);

    const reportText = [
      `<b>📊 LAPORAN PENJUALAN HARIAN</b>`,
      `<i>Tanggal: ${todayStr}</i>`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `✅ <b>Transaksi Sukses:</b> <code>${totalTrx} Trx</code>`,
      `📦 <b>Produk Terjual:</b> <code>${totalQty} Pcs</code>`,
      `💰 <b>Total Omzet:</b> <code>Rp ${rupiah(totalOmzet)}</code>`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `⚡ <i>Data tersinkronisasi otomatis.</i>`
    ].join("\n");

    const keyboard = {
      inline_keyboard: [[{ text: "🔄 Perbarui Data", callback_data: "refresh_report" }]]
    };

    await ctx.reply(reportText, { parse_mode: "HTML", reply_markup: keyboard });
  } catch (err) {
    console.error("❌ Error laporan:", err);
    // Jika tidak ada data, tampilkan laporan kosong alih-alih pesan error folder
    ctx.reply("📊 <b>Laporan Hari Ini</b>\n\nBelum ada transaksi sukses yang tercatat hari ini.", { parse_mode: "HTML" });
  }
});

// === HANDLER PERBARUI DATA LAPORAN (Refresh) ===
bot.action("refresh_report", async (ctx) => {
  try {
    if (!isAdminNow(ctx)) return ctx.answerCbQuery("🚫 Akses Ditolak!");
    
    const transactions = await loadTransactions();
    const todayStr = dayjs().tz("Asia/Jakarta").format("DD MMMM YYYY");
    
    const trxToday = transactions.filter(t => {
      const tDate = String(t.timestamp || t.created_at || "");
      const tStatus = String(t.status || "").toLowerCase();
      return tDate.includes(todayStr) && (tStatus === 'paid' || tStatus === 'sukses');
    });

    const totalTrx = trxToday.length;
    const totalQty = trxToday.reduce((sum, t) => sum + (Number(t.qty || 0)), 0);
    const totalOmzet = trxToday.reduce((sum, t) => sum + (Number(t.total_amount || 0)), 0);

    const updateText = [
      `<b>📊 LAPORAN PENJUALAN HARIAN</b>`,
      `<i>Tanggal: ${todayStr}</i>`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `✅ <b>Transaksi Sukses:</b> <code>${totalTrx} Trx</code>`,
      `📦 <b>Produk Terjual:</b> <code>${totalQty} Pcs</code>`,
      `💰 <b>Total Omzet:</b> <code>Rp ${rupiah(totalOmzet)}</code>`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `🔄 <i>Update: ${dayjs().tz("Asia/Jakarta").format("HH:mm:ss")} WIB</i>`
    ].join("\n");

    await ctx.editMessageText(updateText, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "🔄 Perbarui Data", callback_data: "refresh_report" }]]
      }
    });
    await ctx.answerCbQuery("✅ Data diperbarui!");
  } catch (err) {
    await ctx.answerCbQuery("⚠️ Gagal memperbarui data.");
  }
});

// ===== /riwayat (ADMIN) + pagination (isolated scope) =====
(() => {
  const path = require('path');
  const fs = require('fs');

  // ukuran halaman khusus admin
  const PER_PAGE_ADMIN = 5;

  // helper lokal (nama beda biar gak bentrok)
  const escAdm   = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const fmtRpAdm = (n) => new Intl.NumberFormat('id-ID').format(Number(n||0));
  const tsWIBAdm = (ms) => {
    if (!ms && ms !== 0) return '-';
    const d = (typeof ms === 'number') ? new Date(ms) : new Date(String(ms));
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  };
  const statusBadgeAdm = (s) => {
    const k = String(s||'').toLowerCase();
    if (k === 'completed' || k === 'success') return '✅ selesai';
    if (k === 'pending')                        return '⏳ pending';
    if (k === 'expired')                        return '⏰ expired';
    if (k === 'canceled' || k === 'cancelled')  return '🛑 dibatalkan';
    return s || '-';
  };

  // util baca file aman
  const readJsonSafe = (p, fallback=[]) => {
    try {
      if (!fs.existsSync(p)) return fallback;
      const raw = fs.readFileSync(p,'utf8');
      return JSON.parse(raw);
    } catch { return fallback; }
  };

// === 👑 /riwayat (ADMIN ONLY — by username atau ID) ===
bot.command('riwayat', async (ctx) => {
  try {
    if (!isAdminNow(ctx)) return ctx.reply('🚫 Kamu bukan admin, perintah ini tidak diizinkan.');

    // helper lokal (biar gak bentrok sama yang lain)
    const PER_PAGE_ADMIN = 5;
    const readJsonSafe = (p, def) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return def; } };
    const escAdm  = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const fmtRpAdm = (n) => new Intl.NumberFormat('id-ID').format(Number(n || 0));
    const tsWIBAdm = (ms) => {
      if (!ms && ms !== 0) return '-';
      const d = (typeof ms === 'number') ? new Date(ms) : new Date(String(ms));
      if (isNaN(d.getTime())) return '-';
      const dd = d.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' });
      const hh = d.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false });
      return `${dd}, ${hh.replaceAll(':', '.')}`;
    };
    const statusBadgeAdm = (s) => {
  const k = String(s || '').toLowerCase();
  if (k === 'completed' || k === 'success' || k === 'paid') return '✅ Selesai';
  if (k === 'pending')                                      return '⏳ Menunggu';
  if (k === 'expired')                                      return '⏰ Kadaluarsa';
  if (k === 'canceled' || k === 'cancelled')                return '❌ Dibatalkan';
  return escAdm(s || '-');
};

    const args = (ctx.message?.text || '').split(' ').slice(1);
    if (args.length === 0) {
      return ctx.reply('⚠️ Gunakan format:\n/riwayat @username\natau\n/riwayat 6206822439');
    }

    const identifier = args[0].replace('@','').trim();

    // ambil sumber data
    const dbPath   = path.resolve('data/db.json');
    const txPath   = path.resolve('data/transactions.json');
    const prodPath = path.resolve('data/products.json');

    const db       = readJsonSafe(dbPath, { users: {} });
    const allTx    = readJsonSafe(txPath, []);
    const prodArr  = readJsonSafe(prodPath, []);
    const prodMap  = Object.fromEntries((prodArr || []).map(p => [String(p.id), p.name]));

    // cari user by ID atau username
    let targetUser = /^\d+$/.test(identifier)
      ? db.users[identifier]
      : Object.values(db.users || {}).find(
          (u) => String(u.username||'').toLowerCase() === identifier.toLowerCase()
        );

    if (!targetUser) return ctx.reply(`❌ User '${identifier}' tidak ditemukan di database.`);

    const userTx = allTx.filter(t => String(t.user_id) === String(targetUser.id));
    if (userTx.length === 0) {
      const label = targetUser.username ? '@'+targetUser.username : targetUser.id;
      return ctx.reply(`📭 User ${label} belum memiliki transaksi.`);
    }

    const totalPages = Math.ceil(userTx.length / PER_PAGE_ADMIN);

    const renderPage = async (page = 1, msgId = null) => {
      const start  = (page - 1) * PER_PAGE_ADMIN;
      const end    = start + PER_PAGE_ADMIN;
      const txPage = userTx.slice().reverse().slice(start, end);
      const shown  = Math.min(page * PER_PAGE_ADMIN, userTx.length);

      const header = `<b>📜 RIWAYAT TRANSAKSI — ${targetUser.username ? '@'+targetUser.username : targetUser.id}</b>`;

      const body = txPage.map((t) => {
        const prod   = t.product_name || t.product || prodMap[String(t.product_id)] || '-';
        const varian = t.variant_name || t.variant || '-';
        const qty    = Number(t.qty || 1);
        const total  = t.total_amount ?? t.total ?? t.amount ?? 0;
        const metode = (t.method || t.pg_provider || '-').toUpperCase();
        const refId  = t.reference_id || '-';
        const status = statusBadgeAdm(t.status);
        const waktu  = tsWIBAdm(t.created_at || t.timestamp);
        const oid    = t.id;

        // Akun: tampil hanya kalau ADA
        const akunLines = [];
        if (Array.isArray(t.akun) && t.akun.length > 0) {
          akunLines.push('├ 📦 <b>Akun</b>:');
          akunLines.push(
            ...t.akun.map((a,i) =>
              `├ 🔹 <b>Akun ${i+1}</b>\n├     Email: <code>${escAdm(a.email||'-')}</code>\n├     Password: <code>${escAdm(a.password||'-')}</code>`
            )
          );
        } else if (t.email || t.password) {
          akunLines.push('├ 📦 <b>Akun</b>:');
          akunLines.push(`├     Email: <code>${escAdm(t.email||'-')}</code>`);
          akunLines.push(`├     Password: <code>${escAdm(t.password||'-')}</code>`);
        }

        // BOX ASCII
        return [
          '╭─────────────────────────╮',
          `├ <b>${escAdm(prod)}</b> <i>(${escAdm(varian)})</i>`,
          `├ Rp ${fmtRpAdm(total)} (${qty}x)`,
          `├ Metode : ${escAdm(metode)}`,
          `├ Status : ${status}`,
          `├ Ref    : <code>${escAdm(refId)}</code>`,
          `├ ID     : ${oid}`,
          `├ Tanggal: ${waktu}`,
          ...akunLines,
          '╰─────────────────────────╯'
        ].join('\n');
      }).join('\n\n');

      const footer  = `📜 Menampilkan <b>${shown}/${userTx.length}</b> transaksi (hal ${page}/${totalPages}).`;
      const content = [header, '', body, '', footer].join('\n');

      const nav = [];
      if (page > 1) nav.push({ text: '⬅️ Sebelumnya',  callback_data: `adm_page_${targetUser.id}_${page-1}` });
      if (page < totalPages) nav.push({ text: 'Selanjutnya ➡️', callback_data: `adm_page_${targetUser.id}_${page+1}` });
      const markup = { inline_keyboard: [nav] };

      if (msgId) {
        await ctx.telegram.editMessageText(ctx.chat.id, msgId, undefined, content, { parse_mode: 'HTML', reply_markup: markup });
        return msgId;
      } else {
        const sent = await ctx.reply(content, { parse_mode: 'HTML', reply_markup: markup });
        return sent.message_id;
      }
    };

    ctx.session = ctx.session || {};
    const firstMsgId = await renderPage(1);
    ctx.session.adm = { targetUserId: String(targetUser.id), page: 1, msgId: firstMsgId };

  } catch (err) {
    console.error('❌ Error di /riwayat:', err);
    try { await ctx.reply('⚠️ Terjadi kesalahan saat memuat riwayat transaksi.'); } catch {}
  }
});

// === pagination tombol admin ===
bot.action(/adm_page_(\d+)_(\d+)/, async (ctx) => {
  try {
    if (!isAdminNow(ctx)) return ctx.answerCbQuery('🚫 Hanya admin!');

    // helper lokal (lagi supaya gak bentrok)
    const PER_PAGE_ADMIN = 5;
    const readJsonSafe = (p, def) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return def; } };
    const escAdm  = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const fmtRpAdm = (n) => new Intl.NumberFormat('id-ID').format(Number(n || 0));
    const tsWIBAdm = (ms) => {
      if (!ms && ms !== 0) return '-';
      const d = (typeof ms === 'number') ? new Date(ms) : new Date(String(ms));
      if (isNaN(d.getTime())) return '-';
      const dd = d.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' });
      const hh = d.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false });
      return `${dd}, ${hh.replaceAll(':', '.')}`;
    };
    const statusBadgeAdm = (s) => {
  const k = String(s || '').toLowerCase();
  if (k === 'completed' || k === 'success' || k === 'paid') return '✅ Selesai';
  if (k === 'pending')                                      return '⏳ Menunggu';
  if (k === 'expired')                                      return '⏰ Kadaluarsa';
  if (k === 'canceled' || k === 'cancelled')                return '❌ Dibatalkan';
  return escAdm(s || '-');
};

    const userId = ctx.match[1];
    const page   = parseInt(ctx.match[2], 10) || 1;

    const txPath   = path.resolve('data/transactions.json');
    const dbPath   = path.resolve('data/db.json');
    const prodPath = path.resolve('data/products.json');

    const allTx   = readJsonSafe(txPath, []);
    const db      = readJsonSafe(dbPath, { users: {} });
    const prodArr = readJsonSafe(prodPath, []);
    const prodMap = Object.fromEntries((prodArr || []).map(p => [String(p.id), p.name]));

    const target = db.users[userId];
    if (!target) return ctx.answerCbQuery('❌ User tidak ditemukan.');

    const userTx = allTx.filter(t => String(t.user_id) === String(userId));

    const totalPages = Math.ceil(userTx.length / PER_PAGE_ADMIN);
    const start  = (page - 1) * PER_PAGE_ADMIN;
    const end    = start + PER_PAGE_ADMIN;
    const txPage = userTx.slice().reverse().slice(start, end);
    const shown  = Math.min(page * PER_PAGE_ADMIN, userTx.length);

    const header = `<b>📜 RIWAYAT TRANSAKSI — ${target.username ? '@'+target.username : target.id}</b>`;

    const body = txPage.map((t) => {
      const prod   = t.product_name || t.product || prodMap[String(t.product_id)] || '-';
      const varian = t.variant_name || t.variant || '-';
      const qty    = Number(t.qty || 1);
      const total  = t.total_amount ?? t.total ?? t.amount ?? 0;
      const metode = (t.method || t.pg_provider || '-').toUpperCase();
      const refId  = t.reference_id || '-';
      const status = statusBadgeAdm(t.status);
      const waktu  = tsWIBAdm(t.created_at || t.timestamp);
      const oid    = t.id;

      const lines = [
        '╭─────────────────────────╮',
        `├ <b>${escAdm(prod)}</b> <i>(${escAdm(varian)})</i>`,
        `├ Rp ${fmtRpAdm(total)} (${qty}x)`,
        `├ Metode : ${escAdm(metode)}`,
        `├ Status : ${status}`,
        `├ Ref    : <code>${escAdm(refId)}</code>`,
        `├ ID     : ${oid}`,
        `├ Tanggal: ${waktu}`,
        '╰─────────────────────────╯'
      ];
      return lines.join('\n');
    }).join('\n\n');

    const footer  = `📜 Menampilkan <b>${shown}/${userTx.length}</b> transaksi (hal ${page}/${totalPages}).`;
    const content = [header, '', body, '', footer].join('\n');

    const nav = [];
    if (page > 1) nav.push({ text: '⬅️ Sebelumnya',  callback_data: `adm_page_${userId}_${page-1}` });
    if (page < totalPages) nav.push({ text: 'Selanjutnya ➡️', callback_data: `adm_page_${userId}_${page+1}` });
    const markup = { inline_keyboard: [nav] };

    await ctx.editMessageText(content, { parse_mode: 'HTML', reply_markup: markup });
    await ctx.answerCbQuery();
  } catch (err) {
    console.error('❌ Error di pagination /riwayat (admin):', err);
    try { await ctx.answerCbQuery('⚠️ Gagal memuat halaman!'); } catch {}
  }
});
})();

// === 📢 BROADCAST TEKS & FOTO (ADMIN ONLY) ===
async function handleBroadcast(ctx, message, photo) {
  const chatId = String(ctx.chat.id);
  if (!isAdminNow(ctx)) return ctx.reply("🚫 Kamu bukan admin.");

  if (!message && !photo)
    return ctx.reply("⚠️ Format: /broadcast <pesan> (bisa disertai foto)");

  const db = await loadDB();
  const users = Object.values(db.users || {});
  if (users.length === 0) return ctx.reply("📭 Belum ada user terdaftar.");

  ctx.session ??= {};
  ctx.session.broadcast = {
    pending: true,
    message,
    photo,
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      first_name: u.first_name,
    })),
  };

  const caption = `📝 <b>Konfirmasi Broadcast</b>\n\n${esc(
    message || ""
  )}\n\nJumlah penerima: <b>${users.length}</b>`;
  const keyboard = {
    inline_keyboard: [
      [
        { text: "✅ YA", callback_data: "broadcast_confirm" },
        { text: "❌ BATAL", callback_data: "broadcast_cancel" },
      ],
    ],
  };

  if (photo) {
    await ctx.replyWithPhoto(photo, {
      caption,
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  } else {
    await ctx.reply(caption, { parse_mode: "HTML", reply_markup: keyboard });
  }
}

// =======================
// 🟣 /broadcast — auto deteksi teks, foto, video, stiker
// =======================
bot.command("broadcast", async (ctx) => {
  try {
    // --- CEK ADMIN ---
    if (!isAdminNow(ctx)) return ctx.reply("🚫 Kamu bukan admin.");

    const db = await loadDB();
    const users = Object.values(db.users || {}).filter((u) => u.id);
    if (users.length === 0)
      return ctx.reply("⚠️ Belum ada user terdaftar untuk broadcast.");

    const reply = ctx.message.reply_to_message;
    let fileId = null;
    let fileType = null;
    let message = "";

    // === 🖼 CASE 1: Reply ke foto
    if (reply?.photo) {
      const file = reply.photo[reply.photo.length - 1];
      fileId = file.file_id;
      fileType = "photo";

      const args = ctx.message.text.split(" ").slice(1).join(" ").trim();
      message = args || reply.caption || "";
    }

    // === 🎥 CASE 2: Reply ke video
    else if (reply?.video) {
      fileId = reply.video.file_id;
      fileType = "video";

      const args = ctx.message.text.split(" ").slice(1).join(" ").trim();
      message = args || reply.caption || "";
    }

    // === 💠 CASE 3: Reply ke sticker
    else if (reply?.sticker) {
      fileId = reply.sticker.file_id;
      fileType = "sticker";
      message = "(stiker)";
    }

    // === 📸 CASE 4: Kirim foto langsung dengan caption /broadcast ...
    else if (ctx.message.photo) {
      const file = ctx.message.photo[ctx.message.photo.length - 1];
      fileId = file.file_id;
      fileType = "photo";
      const caption = ctx.message.caption || "";
      message = caption.replace(/^\/broadcast\s*/i, "") || "";
    }

    // === 🎬 CASE 5: Kirim video langsung
    else if (ctx.message.video) {
      fileId = ctx.message.video.file_id;
      fileType = "video";
      const caption = ctx.message.caption || "";
      message = caption.replace(/^\/broadcast\s*/i, "") || ")";
    }

    // === 💬 CASE 6: Teks-only
    else {
      const args = ctx.message.text.split(" ").slice(1).join(" ");
      if (!args) {
        return ctx.reply("📩 Kirim /broadcast <pesan> atau reply ke foto/video/stiker.");
      }
      message = args;
    }

    // --- Simpan session broadcast ---
    ctx.session ??= {};
    ctx.session.broadcast = {
      pending: true,
      message,
      fileId,
      fileType,
      users,
    };

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback("✅ Kirim Broadcast", "broadcast_confirm"),
        Markup.button.callback("❌ Batal", "broadcast_cancel"),
      ],
    ]);

    // === Preview konfirmasi ===
    if (fileType === "photo") {
      await ctx.replyWithPhoto(fileId, {
        caption: `📣 <b>Konfirmasi Broadcast</b>\n\n${message}`,
        parse_mode: "HTML",
        ...keyboard,
      });
    } else if (fileType === "video") {
      await ctx.replyWithVideo(fileId, {
        caption: `📣 <b>Konfirmasi Broadcast</b>\n\n${message}`,
        parse_mode: "HTML",
        ...keyboard,
      });
    } else if (fileType === "sticker") {
      await ctx.replyWithSticker(fileId);
      await ctx.reply(
        "📣 <b>Konfirmasi Broadcast Stiker</b>\n\nApakah kamu yakin ingin mengirim stiker ini ke semua user?",
        { parse_mode: "HTML", ...keyboard }
      );
    } else {
      await ctx.reply(
        `📣 <b>Konfirmasi Broadcast</b>\n\n${message}`,
        { parse_mode: "HTML", ...keyboard }
      );
    }
  } catch (err) {
    console.error("❌ Error di /broadcast:", err);
    ctx.reply("⚠️ Terjadi kesalahan saat mempersiapkan broadcast.");
  }
});


// === 📄 PAGINATION ADMIN RIWAYAT ===
bot.action(/^adm_page_(\d+)_(\d+)$/, async (ctx) => {
  const chatId = String(ctx.chat.id);
  if (!isAdmin(chatId)) return ctx.answerCbQuery("🚫 Kamu bukan admin.");

  const userId = ctx.match[1];
  const page = parseInt(ctx.match[2]);

  const db = await loadDB();
  const transactions = await loadTransactions();

  const targetUser = db.users[userId];
  if (!targetUser) return ctx.answerCbQuery("❌ User tidak ditemukan.");

  const userTx = transactions.filter((t) => t.user_id === targetUser.id);
  const perPage = 5;
  const totalPages = Math.ceil(userTx.length / perPage);
  const start = (page - 1) * perPage;
  const end = start + perPage;
  const txPage = userTx.slice().reverse().slice(start, end);

  const content = [
    `<b>📜 RIWAYAT TRANSAKSI — ${targetUser.username ? '@' + targetUser.username : targetUser.id}</b>`,
    ``,
    ...txPage.map((t) => {
      return [
        `🧾 <b>${esc(t.product)}</b> (${t.variant})`,
        `💰 Rp ${rupiah(t.total)}`,
        `💳 Metode: ${t.method}`,
        `🆔 ${t.id}`,
        `📅 ${t.timestamp}`,
        `━━━━━━━━━━━━━━━━━━`,
      ].join("\n");
    }),
    ``,
    `Menampilkan ${txPage.length} dari ${userTx.length} transaksi (hal ${page}/${totalPages}).`,
  ].join("\n");

  const navButtons = [];
  if (page > 1)
    navButtons.push({
      text: "⬅️ Sebelumnya",
      callback_data: `adm_page_${userId}_${page - 1}`,
    });
  if (page < totalPages)
    navButtons.push({
      text: "Selanjutnya ➡️",
      callback_data: `adm_page_${userId}_${page + 1}`,
    });

  await ctx.editMessageText(content, {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [navButtons] },
  });

  await ctx.answerCbQuery();
});

// === 💾 AUTO BACKUP TRANSACTIONS (auto-clean 30 hari) ===
setInterval(() => {
  try {
    const src = path.join(__dirname, "data", "transactions.json");
    if (!fs.existsSync(src)) return;

    const backupDir = path.join(__dirname, "backups", "transactions");
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    // 🕒 Buat nama file backup dengan timestamp
    const timestamp = dayjs().tz().format("YYYY-MM-DD_HH-mm-ss");
    const dest = path.join(backupDir, `transactions_${timestamp}.json`);

    // 💾 Salin file transaksi ke backup
    fs.copyFileSync(src, dest);
    console.log(`💾 Backup transaksi tersimpan: ${dest}`);

    // 🧹 Hapus backup yang lebih tua dari 30 hari
    const files = fs.readdirSync(backupDir);
    const now = Date.now();
    const thirtyDays = 1000 * 60 * 60 * 24 * 30; // 30 hari

    for (const file of files) {
      const filePath = path.join(backupDir, file);
      const stats = fs.statSync(filePath);
      const age = now - stats.mtimeMs;

      if (age > thirtyDays) {
        fs.unlinkSync(filePath);
        console.log(`🧹 Hapus backup lama (lebih dari 30 hari): ${file}`);
      }
    }
  } catch (err) {
    console.error("❌ Gagal backup transaksi:", err.message);
  }
}, 1000 * 60 * 60 * 12); // backup tiap 12 jam

// =======================
// ⚙️ FINAL FINAL PATCH — AUTO-DETECT FOTO/TEXT TANPA ERROR
// =======================
async function safeEditProductMessage(bot, msg, caption, keyboard) {
  try {
    if (!msg.chatId || !msg.messageId) return;

    // ⛔ jangan sentuh pesan transaksi/QR
    if (msg.isTransaction === true) return;

    // ✅ Deteksi langsung dari data aktif
    const isPhoto = msg.isPhoto || msg.type === "photo";

    if (isPhoto) {
      // 🖼️ Pesan dengan foto → edit caption
      await bot.telegram.editMessageCaption(
        msg.chatId,
        msg.messageId,
        undefined,
        caption,
        {
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: keyboard },
        }
      );
    } else {
      // 💬 Pesan teks → edit teks
      await bot.telegram.editMessageText(
        msg.chatId,
        msg.messageId,
        undefined,
        caption,
        {
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: keyboard },
        }
      );
    }
  } catch (err) {
    const errMsg = String(err);

    // 🔁 Fallback otomatis
    if (
      errMsg.includes("no caption") ||
      errMsg.includes("PHOTO_CAPTION_EMPTY") ||
      errMsg.includes("message has no caption")
    ) {
      try {
        await bot.telegram.editMessageText(
          msg.chatId,
          msg.messageId,
          undefined,
          caption,
          {
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: keyboard },
          }
        );
      } catch (err2) {
        if (!String(err2).includes("message is not modified"))
          console.error("❌ Gagal update teks produk:", err2.description);
      }
      return;
    }

    // ⏭️ Kalau gak ada perubahan → skip
    if (errMsg.includes("message is not modified")) return;

    // ❌ Log error real
    if (!errMsg.includes("can't be edited")) {
      console.error("❌ editCaptionSafe error:", errMsg);
    }
  }
}

// 🔁 Edit pesan produk aktif (auto-sync)
const oldEditProductMessages = async (product, caption, keyboard) => {
  const targets = activeMessages.filter(
    (m) =>
      m.productId === product.id &&
      m.messageId &&
      m.chatId &&
      // ⛔ WAJIB eksplisit katalog saja:
      m.isTransaction === false
      // (tidak ada cek lain yang bisa nyenggol handler lain)
  );

  if (!targets.length) {
    console.log(`⚪ Lewati ${product.name} — tidak ada pesan katalog aktif yang aman di-edit.`);
    return;
  }

  for (const msg of targets) {
    try {
      console.log("🧩 Update target:", msg);
      if (msg.isPhoto) {
        await bot.telegram.editMessageCaption(
          msg.chatId,
          msg.messageId,
          undefined,
          caption,
          {
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: keyboard },
          }
        );
      } else {
        await bot.telegram.editMessageText(
          msg.chatId,
          msg.messageId,
          undefined,
          caption,
          {
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: keyboard },
          }
        );
      }
    } catch (err) {
      const d = String(err.description || "");
      if (d.includes("message to edit not found")) {
        activeMessages = activeMessages.filter(
          (m) => m.messageId !== msg.messageId
        );
      } else if (d.includes("no caption")) {
        try {
          await bot.telegram.editMessageText(
            msg.chatId,
            msg.messageId,
            undefined,
            caption,
            {
              parse_mode: "HTML",
              reply_markup: { inline_keyboard: keyboard },
            }
          );
        } catch (e2) {
          console.error("❌ Retry editMessageText gagal:", e2.description);
        }
      } else {
        console.error(`⚠️ Gagal update ${product.name}:`, d);
      }
    }
  }
};

// === 🧩 Saat pertama kali kirim pesan (produk / transaksi)
async function trackSentProduct(ctx, product, sentMsg, isTransaction = false) {
  try {
    activeMessages = activeMessages.filter(
      (m) => !(m.chatId === ctx.chat.id && m.productId === product.id)
    );

    const isPhoto =
      !!(ctx.message?.photo || sentMsg.photo) ||
      !!sentMsg.caption ||
      !!ctx.message?.caption;

    activeMessages.push({
      chatId: ctx.chat.id,
      messageId: sentMsg.message_id,
      productId: product.id,
      isPhoto,
      type: isPhoto ? "photo" : "text",
      isTransaction, // katalog = false, transaksi/QR = true
    });

    console.log(
      `💳 Pesan ${isTransaction ? "transaksi" : "produk"} ${
        product.name
      } ditandai isTransaction=${isTransaction}, isPhoto=${isPhoto}`
    );

    console.table(
      activeMessages.map((m) => ({
        chat: m.chatId,
        prod: m.productId,
        trans: m.isTransaction,
        photo: m.isPhoto,
        type: m.type,
      }))
    );
  } catch (err) {
    console.error("⚠️ trackSentProduct error:", err);
  }
}

// === ⚡ AUTO-SYNC REALTIME STOK (Dari /stok/ ke /data/products.json) ===
let lastProducts = [];
let autoSyncPaused = false; // ⬅️ FLAG PAUSE AUTO-SYNC

setInterval(async () => {
  // kalau lagi pause (misal pas bikin QRIS), langsung skip
  if (autoSyncPaused) return;
  try {
    const stokFolder = path.join(__dirname, "stok");
    const productsFile = path.join(__dirname, "data", "products.json");
    if (!fs.existsSync(productsFile)) return;

    let products = JSON.parse(fs.readFileSync(productsFile, "utf8"));
    const stokFiles = fs
      .readdirSync(stokFolder)
      .filter((f) => f.endsWith(".json"));

    // 🔁 Loop file stok
    for (const file of stokFiles) {
      const code = file.replace(".json", "").toLowerCase();
      const stokPath = path.join(stokFolder, file);
      const stokList = JSON.parse(fs.readFileSync(stokPath, "utf8"));
      const product = products.find(
        (p) => p.code && p.code.toLowerCase() === code
      );
      if (!product) continue;

      // 🔄 auto sinkron stok + KEEP transaksi pending
      for (const variant of product.variants) {
        // stok REAL dari file stok/<code>.json
        const realCount = stokList.filter(
          (s) =>
            s.varian &&
            s.varian.toLowerCase() === variant.name.toLowerCase()
        ).length;

        // 🔐 hitung transaksi PENDING yang lagi nge-KEEP varian ini
        const pendingList = await tx.find(
          (t) =>
            t.status === "pending" &&
            Number(t.product_id) === Number(product.id) &&
            String(t.variant_name || "").toLowerCase() ===
              variant.name.toLowerCase()
        );

        const pendingQty = pendingList.reduce(
          (sum, t) => sum + (Number(t.qty || 0) || 0),
          0
        );

        // stok yang DITAMPILIN ke user = stok real - total qty pending (minimal 0)
        const effective = Math.max(0, realCount - pendingQty);

        if (variant.stock !== effective) {
          console.log(
            `📦 Varian "${variant.name}" → stok real: ${realCount}, pending: ${pendingQty}, tampil: ${effective}`
          );
        }

        variant.stock = effective;
      }
    }

    fs.writeFileSync(productsFile, JSON.stringify(products, null, 2));

    const changedProducts = products.filter((p) => {
      const prev = lastProducts.find((x) => x.id === p.id);
      return (
        !prev ||
        JSON.stringify(prev.variants) !== JSON.stringify(p.variants)
      );
    });

    if (changedProducts.length > 0) {
      const now = dayjs().tz().format("HH.mm.ss [WIB]");

      for (const product of changedProducts) {
        const freshData = JSON.parse(fs.readFileSync(productsFile, "utf8"));
        const freshProduct = freshData.find((p) => p.id === product.id);
        if (!freshProduct) continue;

        const variantList = freshProduct.variants
          .map(
            (v) =>
              `• ${v.name}: <b>Rp ${rupiah(v.price)}</b> - Stok: ${v.stock}`
          )
          .join("\n");

        const caption = [
          `SEN PRO PREMIUM APPS`,
          `╭──────────────────────╮`,
          `├ <b>Produk:</b> ${freshProduct.name}`,
          `├ <b>Stok Terjual:</b> ${Number(freshProduct.sold || 0)}`,
          `├ <b>Desk:</b> ${esc(freshProduct.desc)}`,
          `╰──────────────────────╯`,
          ``,
          `<b>Variasi, Harga & Stok:</b>\n──────────────`,
          variantList,
          ``,
          `⚡ <i>Auto-sync at ${now}</i>`,
        ].join("\n");

        const variantButtons = [];
        for (let i = 0; i < freshProduct.variants.length; i += 2) {
          const row = [];
          const v1 = freshProduct.variants[i];
          const v2 = freshProduct.variants[i + 1];
          if (v1) {
            const text = `${v1.name} - Rp ${rupiah(v1.price)}`;
            row.push({
              text: v1.stock > 0 ? text : `🚫 ${text}`,
              callback_data:
                v1.stock > 0 ? `buy_${freshProduct.id}_${v1.name}` : "noop",
            });
          }
          if (v2) {
            const text = `${v2.name} - Rp ${rupiah(v2.price)}`;
            row.push({
              text: v2.stock > 0 ? text : `🚫 ${text}`,
              callback_data:
                v2.stock > 0 ? `buy_${freshProduct.id}_${v2.name}` : "noop",
            });
          }
          variantButtons.push(row);
        }

        const keyboard = [
          ...variantButtons,
          [{ text: "🔁 Refresh", callback_data: `refresh_${product.id}` }],
        ];

        await oldEditProductMessages(freshProduct, caption, keyboard);
        console.log(`✅ Auto-update tombol stok ${freshProduct.name} (${now})`);
        console.table(
          activeMessages.map((m) => ({
            chat: m.chatId,
            prod: m.productId,
            trans: m.isTransaction,
            photo: m.isPhoto,
            type: m.type,
          }))
        );
      }
    }

    lastProducts = JSON.parse(JSON.stringify(products));
  } catch (err) {
    console.error("❌ Auto-sync error:", err);
  }
}, 5000); // interval 5 detik realtime

})(); // ✅ Nutup async utama


// === REGISTER DAFTAR PERINTAH UTAMA ===
async function registerCommands(bot) {
  try {
    await bot.telegram.setMyCommands([
      { command: 'start', description: 'Mulai bot' },
      { command: 'akusiapa', description: 'Status Kamu' },
      { command: 'cekstok', description: 'Lihat Seluruh Stok' },
      { command: 'helpadmin', description: 'Panduan ( Untuk Admin )' },
    ]);
    console.log('✅ Daftar perintah berhasil diregistrasi ke Telegram');
  } catch (err) {
    console.error('❌ Gagal register command:', err);
  }
}

// === 🚀 Jalankan bot ===
setTimeout(() => {
  bot.launch()
  registerCommands(bot)
    .then(() => console.log(`[${AUTHOR}] ✅ Bot ${BOT_NAME} berhasil dijalankan!`))
    .catch((err) =>
      console.error(`[${AUTHOR}] ❌ Gagal menjalankan bot:`, err)
    );

  console.log(`[${AUTHOR}] ⚡️ Debug: bot.launch() udah dijalankan`);
}, 1000);
CornService.start()
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
