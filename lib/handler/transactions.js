const path = require('path')
const fs = require('fs')
require('dotenv').config({ quiet: true })
const store = require('../mongo-store')
const Database = require('../database')
const Transactions = require('../transactions')
const logger = require('../../utils/logger')
const tx = new Database('data/transactions.json')
const txHandler = new Transactions()
const products = new Database('data/products.json')
const orders = new Database('data/orders.json')
const traceKey = `[chiwa:sphy:lib:handler:transactions] `
const normalizeChannelId = (value) => {
  if (value === undefined || value === null) return null
  let raw = String(value).trim()
  if (!raw) return null
  raw = raw.replace(/^['"]|['"]$/g, '').trim()
  return raw || null
}
const resolveAssetPath = (envKey, fallbackRel) => {
  const raw = String(process.env[envKey] || '').trim()
  if (raw) return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw)
  return path.resolve(__dirname, fallbackRel)
}

const bannerPath = resolveAssetPath('EXPIRED_BANNER_PATH', '../../assets/expired.jpg')
const { sendPaymentAnnouncement } = require('../../utils/paymentCard');
const { ce } = require('../../utils/customEmoji');
const CHANNEL_TARGET = process.env.CHANNEL_TARGET;
const ORDER_LOG_CHANNEL = process.env.ORDER_LOG_CHANNEL;
const STORE_NAME = process.env.STORE_NAME || 'Sphynixstore';
const PAYMENT_GATEWAY_LABEL = (process.env.PAYMENT_GATEWAY_LABEL || 'SENPRO').toUpperCase();
const ORDER_TEXT_THRESHOLD = Number(process.env.ORDER_TEXT_THRESHOLD || 5);
const { maskUserId } = require('../../utils/paymentCard');
const { buildFramedQris } = require("../../utils/qrisFrame");

function getAdminTag() {
  try {
    const settingsPath = path.resolve(process.cwd(), "settings.js");
    delete require.cache[require.resolve(settingsPath)];
    const settings = require(settingsPath);
    const admin =
      settings?.admins?.find((a) => a?.username) ||
      settings?.admins?.[0];
    if (admin?.username) return `@${String(admin.username).replace("@", "")}`;
    if (admin?.id) return String(admin.id);
  } catch (_) {}
  return "admin";
}

function isAdminUser(userId, username) {
  try {
    const settingsPath = path.resolve(process.cwd(), "settings.js");
    delete require.cache[require.resolve(settingsPath)];
    const settings = require(settingsPath);
    const admins = settings?.admins || [];
    const normalizedId = userId ? String(userId).trim() : "";
    const normalizedUsername = username ? String(username).replace("@", "").toLowerCase() : "";
    return admins.some(
      (admin) =>
        (admin?.id && String(admin.id) === normalizedId) ||
        (admin?.username && admin.username.toLowerCase() === normalizedUsername)
    );
  } catch (_) {
    return false;
  }
}

async function ValidateTransactions(bot) {
  const pendingTrxs = await tx.find(t => t.status === 'pending');
  const ids = pendingTrxs.map(t => t.id);
  if (!ids.length) return;
  logger.debug(traceKey, `validating ${ids.length} pending transactions`);
  const results = await txHandler.validate(ids);
  logger.debug(traceKey, `validated ${ids.length} txs`);

  for (const r of results) {
    try {
      // ✅ CEK STATUS TERBARU DI FILE TRANSAKSI
      // antisipasi user sudah klik "Batalkan Pesanan" setelah validate() dipanggil
      const latestList = await tx.find(t => t.id === r.id);
      const latest = Array.isArray(latestList) ? latestList[0] : latestList;

      if (latest) {
        // kalau sudah dibatalkan → JANGAN proses apa-apa lagi (jangan kirim akun)
        if (latest.status === 'canceled') {
          logger.debug(
            traceKey,
            `skip tx ${r.id} karena sudah canceled (result status validate: ${r.status})`
          );
          continue;
        }

        // kalau akun sudah pernah dikirim → jangan proses lagi
        if (latest.sent_account) {
          logger.debug(
            traceKey,
            `skip tx ${r.id} karena sent_account sudah true`
          );
          continue;
        }
      }

      if (r.status === 'expired') {
        // hapus pesan QR kalau masih ada
        if (r?.user_id && r?.message_id) {
          await deleteMessageSafe(bot, r.user_id, r.message_id);
        }

        // caption khusus kadaluarsa
        const cap = buildFailedCaption({
          reason: 'Expired',
          orderIdDisplay: `#${r.id}`,
          isExpired: true,
          tsWIB: formatUsDatetimeWIB(nowDate()),
        });

  // kirim pakai banner (HTML) atau, kalau mau teks saja: sendMessageSafe(...)
  const photo = resolvePhotoInput(r.image_url, bannerPath);
  await sendPhotoSafe(bot, r.user_id, photo, cap, { parse_mode: 'HTML' });

  continue;
}

      if (r.status === 'pending') continue;

      const prod = await products.findById(r.product_id);
      if (!prod) {
        if (r?.user_id && r?.message_id) {
          await deleteMessageSafe(bot, r.user_id, r.message_id);
        }
        const cap = buildFailedCaption({
          reason: 'Produk mungkin dihapus oleh admin ketika kamu baru saja menyelesaikan pembayaran',
          orderIdDisplay: `#${r.id}`
        });
        const photo = resolvePhotoInput(r.image_url, bannerPath);
        await sendPhotoSafe(bot, r.user_id, photo, cap);
        continue;
      }

      // === Kirim otomatis ke channel Telegram (Payment Monitoring) ===
if (r.status === 'paid' && CHANNEL_TARGET && !r.posted_to_channel && !isAdminUser(r.user_id, r.username)) {
  try {
    await sendPaymentAnnouncement(bot, CHANNEL_TARGET, {
      store: STORE_NAME,
      tanggalOrder: r.created_at,
      totalBayar: r.total_amount,
      product: prod?.name || '-',
      variasi: r.variant_name || '-',
      statusPembayaran: 'Berhasil',
      testiIndex: r.id,
	  qty: r.qty,
      maskedUserId: maskUserId(r.user_id),
    });
    await tx.update(r.id, { ...r, posted_to_channel: true });
  } catch (err) {
    logger.error(traceKey, 'error kirim ke channel:', err.message);
  }
}

      const stockPath = path.join('stok', `${prod.code}.json`);
      const stockDb = new Database(stockPath);
      const allStock = await stockDb.getAll();
      const { send, remaining, requested } = pickStock(
        Array.isArray(allStock) ? allStock : [],
        r.variant_name,
        r.qty
      );

      const delivered = send.length;               // berapa akun yang beneran kebawa
      const shortage = Math.max(0, requested - delivered); // kekurangannya berapa

      // === CASE 1: stok bener-bener habis (0 akun) ===
      if (delivered === 0) {
        // hapus pesan QR kalau masih ada
        if (r?.user_id && r?.message_id) {
          await deleteMessageSafe(bot, r.user_id, r.message_id);
        }

        try {
          // === SOLD OUT setelah bayar (kalah cepat) ===
          const soldBannerPath = resolveAssetPath('SOLD_BANNER_PATH', '../../assets/sold.jpg');
          const tsWIB = formatUsDatetimeWIB(nowDate());

          const adminTag = getAdminTag();
          const cap = [
            '🚫 <b>TRANSAKSI GAGAL (STOK HABIS)</b> 🚫',
            '',
            '┌───────────────────────┐',
            '│ <b>Status</b>  : Gagal (Stok habis)',
            `│ <b>Nomor</b>   : #${r.id}`,
            '│ <b>Alasan</b>  : Kamu kalah cepat',
            `│ <b>Waktu</b>   : ${tsWIB}`,
            '└───────────────────────┘',
            '',
            '⚠️ Stok produk habis tepat ketika pembayaran kamu masuk.',
            `Copy pesan ini dan kirim ke admin ${adminTag} untuk refund / kirim manual.`,
          ].join('\n');

          // kirim banner lokal biar gak error file_id/url
          const photo = { source: soldBannerPath };
          await sendPhotoSafe(bot, r.user_id, photo, cap, { parse_mode: 'HTML' });
          await tx.update(r.id, { ...r, sent_account: false });
        } catch (err) {
          console.error('❌ Gagal kirim pesan SOLD OUT:', err);
        }

        continue;
      }

      await writeAll(stockDb, remaining);
      const unitPrice = getProductPrice(prod, r.variant_name);
      const totalPaidNumber =
        Number(r.total_amount || r.paid_amount || 0) || unitPrice * requested;
      const txId = r.id;
      const txRef = r.reference_id;
      const orderId = await getNextOrderId();
      const orderRef = genRef('ORD', { productCode: prod.code });
      const orderDateStr = formatUsDatetimeWIB(nowDate());
      const totalStr = formatRp(totalPaidNumber);
      const unitPriceStr = formatRp(unitPrice);

      // ===== Pilih foto: HANYA kalau valid URL atau file lokal ada =====
      let imageInput = null;
      if (prod?.image_url && String(prod.image_url).trim() !== '') {
        const raw = String(prod.image_url).trim();
        if (isValidHttpUrl(raw)) {
          imageInput = raw; // URL http/https valid
        } else {
          // cek file lokal (support path relatif)
          const localPath = path.isAbsolute(raw)
            ? raw
            : path.resolve(process.cwd(), raw);
          if (fileExists(localPath)) {
            imageInput = { source: fs.createReadStream(localPath) };
          } else {
            imageInput = null; // jangan kirim foto
          }
        }
      }

const paymentCaption = successCapt({
  txRef: r.reference_id || r.ref_id, // SPHYNIX ID
  orderRef: r.order_reference || r.order_ref || '-', // ORD-AM-20251104-O9SX
  buyer: r.buyer || r.username || '-', // nama pembeli
  paymentMethod: r.payment_method || r.method || '-',
  orderIdDisplay: `#${r.id}`,
  orderDate: orderDateStr,
  orderTotal: totalStr,
  orderStatus: 'completed'
});

      // ===== Kirim: coba foto kalau ada; kalau gagal/tidak ada -> teks =====
      let sent = null;
      if (imageInput) {
        const photoA =
          typeof imageInput === 'string' || imageInput?.source
            ? imageInput
            : resolvePhotoInput(imageInput, null); // TANPA fallback banner
        sent = await sendPhotoSafe(bot, r.user_id, photoA, paymentCaption);
      }
      if (!sent) {
        await sendMessageSafe(bot, r.user_id, paymentCaption, { parse_mode: 'HTML' });
      }

// jumlah untuk ditampilkan (normal atau stok kurang)
const qtyToShow = delivered === requested ? requested : delivered;

// === CAPTION DETAIL ORDER (normal / stok kurang) ===
const baseDetail = [
  '╭───────────────────────╮',
  `├ <b>DETAIL ORDER</b>`,
  `├ <b>Product:</b> ${prod.name || '-'} [${prod.code || '-'}]`,
  `├ <b>Variant:</b> ${r.variant_name || '-'}`,
  `├ <b>Jumlah:</b> ${qtyToShow}`,   // ← otomatis sesuai kondisi
  `├ <b>Harga:</b> ${unitPriceStr}`,
  `├ <b>Total Bayar:</b> ${totalStr}`,
  `├ <b>Order ID:</b>`,
  `├ ${orderRef}`,
  '╰───────────────────────╯'
].join('\n');

      let orderCaption;

      if (shortage > 0) {
        // versi kalau stok TIDAK mencukupi
        orderCaption = [
          '⬆️SILAHKAN BUKA FILE DIATAS⬆️',
          '⚠️ <b>STOK TIDAK MENCUKUPI</b> ⚠️',
          '',
          `Kamu memesan <b>${requested}</b> akun,`,
          `tapi stok yang tersedia hanya <b>${delivered}</b> akun.`,
          '╭───────────────────────╮',
          `├ <b>Nomor:</b> #${r.id}`,
          `├ <b>Order Date:</b> ${orderDateStr}`,
          `├ <b>Total Bayar:</b> ${totalStr}`,
          '╰───────────────────────╯',
          '',
          baseDetail,
          '',
          `Sisa kekurangan ( ${requested} Akun ) bisa kamu minta ke admin / refund.`,
          `Silakan copy pesan ini dan kirim ke admin ${getAdminTag()}.`
        ].join('\n');
      } else {
        // versi NORMAL (stok pas / cukup) pakai template lama
        orderCaption = orderCapt({
          orderIdDisplay: `#${orderId}`,
          orderRef,
          buyer: r.username || String(r.user_id),
          productName: prod.name || '-',
          productCode: prod.code || '-',
          variantName: r.variant_name || '-',
          qty: requested,
          unitPriceStr,
          totalStr,
          paymentMethod: r.payment_method || r.method || '-',
          ts: orderDateStr
        });
      }

      const txtContent = formatStockTxt(send);
      const shouldSendText = delivered <= ORDER_TEXT_THRESHOLD;
      if (shouldSendText) {
        const orderDetail = shortage > 0
          ? [
            '⚠️ <b>STOK TIDAK MENCUKUPI</b> ⚠️',
            '',
            `Kamu memesan <b>${requested}</b> akun,`,
            `tapi stok yang tersedia hanya <b>${delivered}</b> akun.`,
            '╭───────────────────────╮',
            `├ <b>Nomor:</b> #${r.id}`,
            `├ <b>Order Date:</b> ${orderDateStr}`,
            `├ <b>Total Bayar:</b> ${totalStr}`,
            '╰───────────────────────╯',
            '',
            baseDetail,
            '',
            `Sisa kekurangan ( ${requested} Akun ) bisa kamu minta ke admin / refund.`,
            `Silakan copy pesan ini dan kirim ke admin ${getAdminTag()}.`
          ].join('\n')
          : baseDetail;

        const orderMessage = [
          '⬇️ <b>SILAHKAN GUNAKAN AKUN BERIKUT</b> ⬇️',
          orderDetail,
          '',
          `<pre>${esc(txtContent)}</pre>`,
          '',
          `⚠️ Jika ada kendala pada akun, hubungi admin ${getAdminTag()}.`
        ].join('\n');
        await sendMessageSafe(bot, r.user_id, orderMessage, {
          parse_mode: 'HTML',
          disable_web_page_preview: true
        });
      } else {
        const filename = `${sanitizeFilename(prod.code)}-${sanitizeFilename(
          r.variant_name || 'DEFAULT'
        )}-x${requested}.txt`;
        await sendTxtFile(bot, r.user_id, filename, txtContent, orderCaption, {
          parse_mode: 'HTML'
        });
      }

      // Simpan salinan akun yang benar-benar dikirim agar pembeli bisa
      // membuka kembali isi pesan order dari web. Data ini hanya dikirim
      // ke pemilik order/admin melalui dashboard yang terautentikasi.
      const deliveredAccounts = send.map((item) => ({
        email: item.email ?? '',
        password: item.password ?? '',
        twofa: item.twofa ?? item.otp ?? '',
        note: item.note ?? item.extra ?? item.message ?? '',
        variant: item.varian ?? item.variant ?? r.variant_name ?? '-'
      }));
      await tx.update(r.id, { ...r, sent_account: true, delivered_accounts: deliveredAccounts });
      if (r?.user_id && r?.message_id) {
        await deleteMessageSafe(bot, r.user_id, r.message_id);
      }

      await insertOrder({
        orderId,
        orderRef,
        txId,
        txRef,
        userId: r.user_id,
        username: r.username || null,
        product: { code: prod.code, name: prod.name },
        variantName: r.variant_name || '-',
        unitPrice,
        qty: requested,
        totalAmount: totalPaidNumber,
        paymentMethod: r.payment_method || r.method || '-'
      });
      await sendOrderLogToChannel(bot, {
        channelId: ORDER_LOG_CHANNEL,
        txRef,
        orderRef,
        userId: r.user_id,
        username: r.username || '-',
        buyerName: r.buyer || r.username || '-',
        product: { code: prod.code, name: prod.name },
        variantName: r.variant_name || '-',
        qty: requested,
        delivered,
        totalAmount: totalPaidNumber,
        paymentMethod: r.payment_method || r.method || '-',
        createdAt: orderDateStr,
        accounts: send
      });
      await incrementProductSold(prod.id, requested);

      const v = prod?.variants?.find(v => v?.name === r?.variant_name);

      if (v && v.snk) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const snkText = `${ce('info', '📋')} <b>Syarat & Ketentuan</b>\n\n${esc(String(v.snk || ''))}`;
        await sendMessageSafe(bot, r.user_id, snkText, { parse_mode: 'HTML' });
      }

    } catch (err) {
      logger.error(traceKey, 'txn.error', { id: r.id, error: err?.message });
      if (r?.user_id && r?.message_id) {
        await deleteMessageSafe(bot, r.user_id, r.message_id);
      }
      try {
        const cap = buildFailedCaption({
          reason: 'Terjadi keslahan yang tidak terduga',
          orderIdDisplay: '#-'
        });
        const photo = resolvePhotoInput(null, bannerPath);
        await sendPhotoSafe(bot, r.user_id, photo, cap);
      } catch (e) {
        logger.error(traceKey, 'notify.error', e.message);
      }
    }
  }
}


function nowWIB() {
  return new Date().toLocaleString('id-ID', { timeZone: process.env.TZ })
}

function nowDate() {
  return new Date()
}

function sanitizeFilename(s) {
  return String(s ?? 'DEFAULT').replace(/[^a-zA-Z0-9-_]+/g, '_')
}

function formatUsDatetimeWIB(d = new Date()) {
  return d.toLocaleString('en-US', {
    timeZone: 'Asia/Jakarta',
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).replace(',', ' -')
}

function genRef(prefix, meta = {}) {
  const now = new Date()
  const yyyy = String(now.getFullYear()).padStart(4, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const base = `${String(meta.productCode || 'PRD').toUpperCase()}-${yyyy}${mm}${dd}`
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `${prefix}-${base}-${rnd}`
}

function formatRp(n) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n || 0))
}

function escapeInlineCode(v) {
  return String(v ?? '').replace(/`/g, '´')
}

function isValidHttpUrl(u) {
  try {
    const x = new URL(String(u || ''))
    return x.protocol === 'http:' || x.protocol === 'https:'
  } catch (_) {
    return false
  }
}

function fileExists(p) {
  try {
    return fs.existsSync(p)
  } catch (_) {
    return false
  }
}

async function readStockFile(stockPath) {
  const data = await store.readJson(stockPath, [])
  return Array.isArray(data) ? data : []
}

const tinyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwnwAIAwN4N0iIuQAAAABJRU5ErkJggg=='

function resolvePhotoInput(primaryUrl, fallbackPath) {
  if (isValidHttpUrl(primaryUrl)) return String(primaryUrl)
  if (fallbackPath && fileExists(fallbackPath)) return { source: fs.createReadStream(fallbackPath) }
  return Buffer.from(tinyPngBase64, 'base64')
}

async function sendMessageSafe(bot, chatId, text, extra = {}) {
  try {
    const payload = { parse_mode: 'Markdown', disable_web_page_preview: true, ...extra }
    if (typeof bot.reply === 'function') return await bot.reply(text, payload)
    if (bot.telegram && typeof bot.telegram.sendMessage === 'function') return await bot.telegram.sendMessage(chatId, text, payload)
    if (typeof bot.sendMessage === 'function') return await bot.sendMessage(chatId, text, payload)
  } catch (e) {
    logger.debug(traceKey, 'sendMessageSafe error: ', e.message)
  }
}

async function sendPhotoSafe(bot, chatId, photoInput, caption = '', extra = {}) {
  try {
    // default HTML (bisa dioverride lewat extra)
    const payload = { caption: caption || '', parse_mode: 'HTML', ...extra };
    if (typeof bot.replyWithPhoto === 'function') return await bot.replyWithPhoto(photoInput, payload);
    if (bot.telegram && typeof bot.telegram.sendPhoto === 'function') return await bot.telegram.sendPhoto(chatId, photoInput, payload);
    if (typeof bot.sendPhoto === 'function') return await bot.sendPhoto(chatId, photoInput, payload);
  } catch (e) {
    logger.debug(traceKey, 'sendPhotoSafe error: ', e.message);
  }
  // balik undefined kalau gagal → biar fallback teks jalan
  return null;
}

async function sendTxtFile(bot, chatId, filename, content, caption, extra = {}) {
  const buffer = Buffer.from(String(content ?? ''), 'utf-8');
  const htmlExtra = { caption: caption || '', parse_mode: 'HTML', ...extra };

  try {
    // ctx.replyWithDocument
    if (typeof bot.replyWithDocument === 'function') {
      return await bot.replyWithDocument({ source: buffer, filename }, htmlExtra);
    }
    // bot.telegram.sendDocument
    if (bot.telegram && typeof bot.telegram.sendDocument === 'function') {
      return await bot.telegram.sendDocument(chatId, { source: buffer, filename }, htmlExtra);
    }
    // bot.sendDocument (beberapa wrapper Telegraf masih pakai signature ini)
    if (typeof bot.sendDocument === 'function') {
      return await bot.sendDocument(chatId, buffer, htmlExtra, { filename });
    }
  } catch (e) {
    logger.debug(traceKey, 'sendTxtFile error: ', e.message);
  }

  // Fallback: kirim isi file sebagai teks monospaced (HTML)
  const safe = String(content ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return sendMessageSafe(bot, chatId, `<pre>${safe}</pre>`, { parse_mode: 'HTML' });
}


async function deleteMessageSafe(bot, chatId, messageId) {
  // langsung keluar kalau gak ada id
  if (!chatId || !messageId) return;

  try {
    // prefer versi lengkap: (chat_id, message_id)
    if (bot.telegram && typeof bot.telegram.deleteMessage === 'function') {
      return await bot.telegram.deleteMessage(chatId, messageId);
    }

    // fallback: sebagian wrapper masih punya bot.deleteMessage(chat_id, message_id)
    if (typeof bot.deleteMessage === 'function') {
      return await bot.deleteMessage(chatId, messageId);
    }
  } catch (e) {
    logger.error(traceKey, 'failed to delete message: ', e.message);
  }
}

async function writeAll(stockDb, items) {
  try {
    if (typeof stockDb.setAll === 'function') return await stockDb.setAll(items)
  } catch (_) {}
  try {
    await stockDb.clear()
    for (const it of items) await stockDb.add(it)
  } catch (e) {
    logger.error(traceKey, 'failed to rewriting stock data: ', e.message)
    throw e
  }
}

async function appendOne(db, value) {
  try {
    if (typeof db.add === 'function') return await db.add(value)
    const all = await db.getAll()
    const next = Array.isArray(all) ? [...all, value] : [value]
    if (typeof db.setAll === 'function') return await db.setAll(next)
  } catch (e) {
    try {
      const all = await db.getAll()
      await db.clear()
      const next = Array.isArray(all) ? [...all, value] : [value]
      for (const it of next) await db.add(it)
    } catch (err) {
      logger.error(traceKey, 'orders.append.error', err?.message)
    }
  }
}

async function getNextOrderId() {
  try {
    const all = await orders.getAll()
    const nums = Array.isArray(all) ? all.map(o => Number(o.order_id)).filter(n => Number.isFinite(n)) : []
    const max = nums.length ? Math.max(...nums) : 0
    return max + 1
  } catch (_) {
    return Math.floor(Date.now() / 1000)
  }
}

function padCol(lines) {
  const w = Math.max(...lines.map(([k]) => String(k).length))
  return lines.map(([k, v]) => `${String(k).padEnd(w, ' ')} : \`${escapeInlineCode(v)}\``)
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function resolveUserDisplay(bot, userId, fallbackName, username) {
  let name = fallbackName || username || userId || '-';
  if (bot?.telegram && userId) {
    try {
      const chat = await bot.telegram.getChat(userId);
      const first = chat?.first_name || '';
      const last = chat?.last_name || '';
      const full = `${first} ${last}`.trim();
      if (full) name = full;
    } catch (_) {}
  }
  return name;
}

async function sendOrderLogToChannel(bot, payload) {
  const channelId =
    normalizeChannelId(payload?.channelId) ||
    normalizeChannelId(process.env.ORDER_LOG_CHANNEL);
  if (!channelId) {
    logger.debug(traceKey, 'orderlog.channel.skip: missing ORDER_LOG_CHANNEL');
    return;
  }

  try {
    const accountText = formatOrderLogAccounts(payload.accounts || []);
    const displayName = await resolveUserDisplay(
      bot,
      payload.userId,
      payload.buyerName,
      payload.username
    );
    const mentionId = String(payload.userId || '').replace(/[^0-9]/g, '');
    const nameField = mentionId
      ? `<a href="tg://user?id=${mentionId}">${esc(displayName)}</a>`
      : esc(displayName || '-');
    const lines = [
      '🧾 <b>ORDER LOG</b>',
      '',
      `Faktur   : <code>${esc(payload.txRef || '-')}</code>`,
      `Order ID : <code>${esc(payload.orderRef || '-')}</code>`,
      `User ID  : <code>${esc(payload.userId || '-')}</code>`,
      `Nama     : ${nameField}`,
      `Username : ${payload.username ? '@' + esc(String(payload.username).replace(/^@/, '')) : '-'}`,
      `Produk   : ${esc(payload.product?.name || '-')} [${esc(payload.product?.code || '-')}]`,
      `Varian   : ${esc(payload.variantName || '-')}`,
      `Jumlah  : ${payload.delivered ?? '-'} / ${payload.qty ?? '-'}`,
      `Total   : ${esc(Number.isFinite(Number(payload.totalAmount)) ? formatRp(payload.totalAmount) : payload.totalAmount ?? '-')}`,
      `Metode  : ${esc(payload.paymentMethod || '-')}`,
      `Tanggal : ${esc(payload.createdAt || '-')}`,
      '',
      '📦 <b>Akun Terkirim</b>',
      accountText
        ? `<pre>${esc(accountText)}</pre>`
        : '<pre>-</pre>'
    ];

    await sendMessageSafe(bot, channelId, lines.join('\n'), {
      parse_mode: 'HTML',
      disable_web_page_preview: true
    });
  } catch (err) {
    logger.error(traceKey, 'orderlog.channel.error', err?.message);
  }
}

// === HITUNG STOK DENGAN SISTEM KEEP (pending) ===
async function getEffectiveStock(product, variantName) {
  const stockPath = path.join('stok', `${product.code}.json`);
  const stokList = await readStockFile(stockPath);

  // stok asli di file stok/<code>.json
  const realStock = stokList.filter(
    s => String(s.varian || '').toLowerCase() === String(variantName || '').toLowerCase()
  ).length;

  // total transaksi pending (KEEP)
  const pendingList = await tx.find(t =>
    t.status === 'pending' &&
    Number(t.product_id) === Number(product.id) &&
    String(t.variant_name || '').toLowerCase() === String(variantName || '').toLowerCase()
  );

  const pendingQty = pendingList.reduce(
    (sum, t) => sum + (Number(t.qty || 0) || 0),
    0
  );

  // stok tampil = stok asli - pending (minimal 0)
  return Math.max(0, realStock - pendingQty);
}

function successCapt({ txRef, orderRef, buyer, paymentMethod, orderIdDisplay, orderDate, orderTotal, orderStatus }) {
  return [
    '╭───────────────────────╮',
    `├ <b>✅PEMBAYARAN BERHASIL✅</b>`,
    `├ <b>Buyer:</b> ${buyer}`,
    `├ <b>${PAYMENT_GATEWAY_LABEL} ID:</b>`,
    `├ ${txRef}`,
    `├ - - - - - - - - - - - - - - - - - - - - - -`,
    `├ <b>Nomor:</b> ${orderIdDisplay}`,
    `├ <b>Order Date:</b> ${orderDate}`,
    `├ <b>Total Bayar:</b> ${orderTotal}`,
    `├ - - - - - - - - - - - - - - - - - - - - - -`,
    `├ <b>Payment Method:</b> ${paymentMethod.toUpperCase()}`,
    `├ <b>Order Status:</b> ${orderStatus}`,
    '╰───────────────────────╯'
  ].join('\n');
}

function orderCapt({ orderRef, productName, productCode, variantName, qty, unitPriceStr, totalStr }) {
  return [
    `${ce('download', '📥')} SILAHKAN BUKA FILE DIATAS`,
    '╭───────────────────────╮',
    `├ <b>${ce('order', '📝')} DETAIL ORDER</b>`,
    `├ <b>Product:</b> ${productName} [${productCode}]`,
    `├ <b>Variant:</b> ${variantName}`,
    `├ <b>Jumlah:</b> ${qty}`,
    `├ <b>Harga:</b> ${unitPriceStr}`,
    `├ <b>Total Bayar:</b> ${totalStr}`,
    `├ <b>Order ID:</b>`,
    `├ ${orderRef}`,
    '╰───────────────────────╯'
  ].join('\n');
}

function warnCaption({ refId, remainingSec }) {
  const sisa = Math.max(0, remainingSec|0);
  const lines = [
    `<b>${ce('warning', '⚠')} PERINGATAN WAKTU PEMBAYARAN</b>`,
    `╭──────────────────────╮`,
    `├ <b>${PAYMENT_GATEWAY_LABEL} ID:</b>`,
    `├ ${refId}`,
    `├ <b>Status:</b> Hampir Kadaluarsa`,
    `├ <b>Sisa Waktu:</b> ${sisa} detik`,
    `╰──────────────────────╯`,
    ``,
    `⚡ Segera selesaikan pembayaran Anda!`,
    `<i>Pesanan akan otomatis dibatalkan jika waktu habis.</i>`
  ];
  return lines.join('\n');
}

function buildFailedCaption({ reason, orderIdDisplay }) {
  // sanitize biar aman di parse_mode HTML
  const esc = (v) =>
    String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const _reason = esc(reason || '-');
  const _orderId = esc(orderIdDisplay || '-');

  const isCanceled = String(reason || '').toLowerCase().includes('batal');
  const isExpired  = String(reason || '').toLowerCase().includes('expired');

  // timestamp WIB
  const tsWIB = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

  // === dibatalkan oleh user ===
  if (isCanceled) {
    return [
      `${ce('success', '✅')} PESANAN BERHASIL DIBATALKAN`,
      '╔═════════════════════════╗',
      '║ Status       : Dibatalkan oleh pengguna',
      `║ Order Id     : ${_orderId}`,
      `║ Waktu        : ${esc(tsWIB)}`,
      '╚═════════════════════════╝',
      '',
      '🛑 Pesanan kamu telah dibatalkan.'
    ].join('\n');
  }

  // === kadaluarsa ===
  if (isExpired) {
    return [
      `${ce('pending', '🕓')} <b>TRANSAKSI KADALUARSA</b>`,
      '╔════════════════════════╗',
      '║ Status       : Gagal (Waktu habis)',
      `║ Nomor        : ${_orderId}`,
      `║ Alasan       : ${_reason}`,
      `║ Waktu        : ${esc(tsWIB)}`,
      '╚════════════════════════╝',
      '',
      '⚠️ Pembayaran tidak diterima dalam batas waktu.',
      'Silahkan melakukan pemesanan ulang jika masih ingin melanjutkan.'
    ].join('\n');
  }

  // === default lama (pakai padCol dari util kamu) ===
  const top = `${ce('cancel', '❌')} ORDER FAILED`;
  const a = padCol([
    ['Reason', `${_reason}`],
    ['Order Id', `${_orderId}`],
  ]);

  return [top, '', ...a].join('\n') +
         `\n\nSilahkan menghubungi admin untuk informasi lebih lanjut.`;
}

function formatStockTxt(items) {
  const lab = s => String(s).padEnd(9, ' ')
  const to2 = n => String(n).padStart(2, '0')
  const lines = []
  for (let i = 0; i < items.length; i++) {
    const idx = to2(i + 1)
    const email = String(items[i].email ?? '')
    const password = String(items[i].password ?? '')
    const extra = String(items[i].twofa ?? items[i].otp ?? items[i].note ?? items[i].extra ?? items[i].message ?? '')
    const varian = String(items[i].varian ?? items[i].variant ?? '-')
    lines.push(`[${idx}]`)
    lines.push(`${lab('email')} : ${email}`)
    lines.push(`${lab('password')} : ${password}`)
    if (extra) lines.push(`${lab('pesan')} : ${extra}`)
    lines.push(`${lab('variant')} : ${varian}`)
    if (i !== items.length - 1) lines.push('')
  }
  return lines.join('\n')
}

function formatOrderLogAccounts(items) {
  const lab = s => String(s).padEnd(9, ' ')
  const to2 = n => String(n).padStart(2, '0')
  const lines = []
  for (let i = 0; i < items.length; i++) {
    const idx = to2(i + 1)
    const email = String(items[i].email ?? '')
    const password = String(items[i].password ?? '')
    const extra = String(items[i].twofa ?? items[i].otp ?? items[i].note ?? items[i].extra ?? items[i].message ?? '')
    const varian = String(items[i].varian ?? items[i].variant ?? '-')
    lines.push(`[${idx}]`)
    lines.push(`${lab('email')} : ${email}`)
    lines.push(`${lab('password')} : ${password}`)
    if (extra) lines.push(`${lab('pesan')} : ${extra}`)
    lines.push(`${lab('variant')} : ${varian}`)
    if (i !== items.length - 1) lines.push('')
  }
  return lines.join('\n')
}

function getProductPrice(prod, variantName) {
  const vname = String(variantName || '').trim().toLowerCase()
  const v = Array.isArray(prod.variants) ? prod.variants.find(x => String(x.name || '').trim().toLowerCase() === vname) : null
  if (v && Number.isFinite(Number(v.price))) return Number(v.price)
  if (Number.isFinite(Number(prod.price))) return Number(prod.price)
  return 0
}

async function insertOrder({
  orderId,
  orderRef,
  txId,
  txRef,
  userId,
  username,
  product,
  variantName,
  unitPrice,
  qty,
  totalAmount,
  paymentMethod
}) {
  const record = {
    order_id: orderId,
    order_ref: orderRef,
    tx_id: txId,
    tx_ref: txRef,
    user_id: userId,
    username: username || null,
    product_code: product.code,
    product_name: product.name,
    variant_name: variantName || '-',
    unit_price: unitPrice || 0,
    qty: qty || 0,
    total_amount: totalAmount,
    payment_method: paymentMethod || '-',
    status: 'completed',
    created_at: nowWIB()
  }
  await appendOne(orders, record)
  return record
}

async function incrementProductSold(productId, deltaQty) {
  try {
    const all = await products.getAll();
    const list = Array.isArray(all) ? all : [];

    const next = list.map(p => {
      if (String(p.id) === String(productId)) {
        const cur = Number(p.sold || 0);
        const inc = Number(deltaQty) || 0;
        return { ...p, sold: cur + inc };
      }
      return p;
    });

    if (typeof products.setAll === 'function') {
      await products.setAll(next);
    } else {
      await products.clear();
      for (const it of next) await products.add(it);
    }
  } catch (e) {
    logger.error(traceKey, 'products.sold.increment.error', e?.message);
  }
}

function pickStock(allStock, variantName, qty) {
  const qtyNum = Math.max(0, parseInt(qty, 10) || 0)
  let need = qtyNum
  const normVariant = variantName ? String(variantName).trim().toLowerCase() : ''
  const sorted = [...allStock].sort((a, b) => {
    const ta = a.addedAt ? Date.parse(a.addedAt) : 0
    const tb = b.addedAt ? Date.parse(b.addedAt) : 0
    return ta - tb
  })
  const send = []
  const picked = new Set()
  for (let i = 0; i < sorted.length; i++) {
    if (need <= 0) break
    const it = sorted[i]
    const itVar = String(it.varian ?? it.variant ?? '').trim().toLowerCase()
    const match = !normVariant || itVar === normVariant
    if (match) {
      send.push(it)
      picked.add(it)
      need -= 1
    }
  }
  const remaining = []
  for (const it of allStock) {
    if (!picked.has(it)) remaining.push(it)
  }
  return { send, remaining, requested: qtyNum }
}

module.exports = {
  ValidateTransactions,
  sendOrderLogToChannel,
}
