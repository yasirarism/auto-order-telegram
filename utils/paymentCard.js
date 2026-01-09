// utils/paymentCard.js
require("dotenv").config({ override: true });
const { createCanvas, registerFont } = require("canvas");
const dayjs = require("dayjs");
const path = require("path");

// Setup timezone Day.js
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
dayjs.extend(utc);
dayjs.extend(timezone);

// === ✅ TZ dari .env (prioritaskan APP_TZ, lalu TZ server, lalu default) ===
const APP_TZ = process.env.APP_TZ || process.env.TZ || "Asia/Jakarta";

// Abbrev zona waktu (untuk label singkat)
const ZONE_MAP = {
  "Asia/Jakarta":  { label: "WIB",  offsetMin: 420 }, // +07:00
  "Asia/Makassar": { label: "WITA", offsetMin: 480 }, // +08:00
  "Asia/Jayapura": { label: "WIT",  offsetMin: 540 }, // +09:00
};

// Label fallback (UTC±hh:mm) bila zona bukan 3 di atas
const zoneOffsetLabel = (zone) => `UTC${dayjs().tz(zone).format("Z")}`;
const ZONE_LABEL = (ZONE_MAP[APP_TZ]?.label) || zoneOffsetLabel(APP_TZ);

// ✅ Helper fix timezone agar TIDAK ikut UTC server
function toLocal(d) {
  // step 1: normalisasi ke UTC supaya gak keikut offset OS/container
  const baseUTC = dayjs(d).utc();
  // step 2: konversi ke zona dari .env (APP_TZ)
  let localized = baseUTC.tz(APP_TZ);

  // step 3: kalau APP_TZ salah/unsupported di image, fallback pake offset manual untuk 3 zona ID
  const conf = ZONE_MAP[APP_TZ];
  if (conf && Math.abs(localized.utcOffset()) !== conf.offsetMin) {
    localized = dayjs(d).utcOffset(conf.offsetMin, true);
  }
  return localized;
}

// (opsional) font custom; fallback ke system font kalau file nggak ada
try {
  registerFont(path.join(__dirname, "../assets/fonts/Inter-Regular.ttf"), { family: "Inter" });
  registerFont(path.join(__dirname, "../assets/fonts/Inter-Bold.ttf"), { family: "Inter", weight: "bold" });
} catch {}

const SANS = "Inter, Arial, Helvetica, sans-serif";

function formatRupiah(n) {
  return "Rp " + Number(n || 0).toLocaleString("id-ID");
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text).split(" ");
  let line = "";
  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i] + " ";
    const w = ctx.measureText(testLine).width;
    if (w > maxWidth && i > 0) {
      ctx.fillText(line, x, y);
      line = words[i] + " ";
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
}

require("dotenv").config({ quiet: true });

const getStoreName = () => process.env.STORE_NAME || "SPHYNIXSTORE";
const getGatewayLabel = () => process.env.PAYMENT_GATEWAY_LABEL || "YSPAY";

// ============ BIKIN GAMBAR PAYMENT CARD ============
async function buildPaymentCardPNG({
  store,
  tanggalOrder = new Date(),
  totalBayar = 0,
  product = "-",
  variasi = "-",
  statusPembayaran = "Berhasil ✅",
  note,
  jumlah,
  qty,
} = {}) {
  const storeName = store || getStoreName();
  const noteText =
    note ||
    `Note:\nTestimoni ini adalah testimoni nyata yang terintegrasi dengan pembayaran real time.\n[ ${getGatewayLabel()} ]`;
  const W = 1200, H = 650;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  const dj = toLocal(tanggalOrder);
  const tahun = dj.format("YYYY");
  const qtyVal = Math.max(1, Number(jumlah ?? qty ?? 1));

  ctx.fillStyle = "#1f2230";
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "#b30000";
  ctx.lineWidth = 15;
  const len = 180;

  ctx.beginPath();
  ctx.moveTo(10, 10 + len);
  ctx.lineTo(10, 10);
  ctx.lineTo(10 + len, 10);

  ctx.moveTo(W - len - 10, 10);
  ctx.lineTo(W - 10, 10);
  ctx.lineTo(W - 10, 10 + len);

  ctx.moveTo(10, H - len - 10);
  ctx.lineTo(10, H - 10);
  ctx.lineTo(10 + len, H - 10);

  ctx.moveTo(W - len - 10, H - 10);
  ctx.lineTo(W - 10, H - 10);
  ctx.lineTo(W - 10, H - len - 10);

  ctx.shadowColor = "rgba(0,0,0,0.3)";
  ctx.shadowBlur = 10;
  ctx.stroke();

  ctx.fillStyle = "#e8ecf1";
  ctx.font = "bold 46px " + SANS;
  ctx.fillText(`© ${storeName} ${tahun}`, 60, 110);

  ctx.fillStyle = "#6ef3a5";
  ctx.font = "bold 40px " + SANS;
  ctx.fillText("[ PAYMENT MONITORING ]", 60, 170);

  const rows = [
    ["Tanggal", `${dj.format("DD MMMM YYYY")} | ${dj.format("HH:mm.ss")} ${ZONE_LABEL}`],
    ["Total Bayar", formatRupiah(totalBayar)],
    ["Product", product],
    ["Variasi", variasi],
    ["Jumlah", `${qtyVal} Acc`],
    ["Status Pembayaran", statusPembayaran],
  ];

  ctx.fillStyle = "#e8ecf1";
  ctx.font = "32px " + SANS;
  const startX = 80, startY = 230, lineH = 60;
  rows.forEach((r, i) => {
    const y = startY + i * lineH;
    ctx.fillText(`- ${r[0]}`, startX, y);
    ctx.fillText(":", startX + 420, y);
    ctx.fillText(String(r[1]), startX + 460, y);
  });

  ctx.font = "22px " + SANS;
  ctx.globalAlpha = 0.7;
  wrapText(ctx, noteText, startX, H - 90, W - 160, 28);
  ctx.globalAlpha = 1;

  return canvas.toBuffer("image/png");
}

// ============ TEKS CAPTION ============
function buildPaymentText({
  store,
  tanggalOrder = new Date(),
  totalBayar = 0,
  product = "-",
  variasi = "-",
  statusPembayaran = "Berhasil ✅",
  jumlah,
  qty,
}) {
  const storeName = store || getStoreName();
  const dj = toLocal(tanggalOrder);
  const tgl = dj.format("DD MMMM YYYY");
  const jam = dj.format("HH:mm.ss") + ` ${ZONE_LABEL}`;
  const tahun = dj.format("YYYY");
  const qtyVal = Math.max(1, Number(jumlah ?? qty ?? 1));

  const header = `© ${storeName} ${tahun}\n[ PAYMENT MONITORING ]`;
  const body = [
    `- Tanggal      : ${tgl}`,
    `- Waktu        : ${jam}`,
    `- Total Bayar  : ${formatRupiah(totalBayar)}`,
    `- Product      : ${product}`,
    `- Variasi      : ${variasi}`,
    `- Jumlah       : ${qtyVal} Acc`,
    `- Status       : ${statusPembayaran}`,
  ].join("\n");

  return `<b>${header}</b>\n<pre>${body}</pre>\n<i>Note:\nTestimoni ini adalah testimoni nyata yang terintegrasi dengan pembayaran real time.\n[ ${getGatewayLabel()} ]</i>`;
}

function maskUserId(id) {
  const s = String(id || "");
  if (s.length < 4) return s;
  return s.slice(0, 4) + "XXXX" + s.slice(-2);
}

// ============ KIRIM FOTO + CAPTION ============
async function sendPaymentAnnouncement(bot, chatTarget, payload) {
  const png = await buildPaymentCardPNG(payload);
  const htmlDetail = buildPaymentText(payload);
  let botName = "auto";
  try {
    const me = await bot.telegram.getMe();
    if (me?.username) {
      botName = `@${me.username}`;
    }
  } catch (_) {}

  const testiBox = [
    "━━━━━━━━━━━━━━━",
    ` ✨ TESTI KE ${payload.testiIndex}  ✨`,
    "━━━━━━━━━━━━━━━",
    "",
    "Terima kasih sudah membeli layanan kami",
    "",
    payload.maskedUserId ? `👤 Customer ID : ${payload.maskedUserId}` : "",
    "",
    `🤖 Bot Order : ${botName}`,
  ].join("\n");

  const caption = `${htmlDetail}\n\n${testiBox}`;
  return bot.telegram.sendPhoto(
    chatTarget,
    { source: Buffer.from(png) },
    { caption, parse_mode: "HTML" }
  );
}

module.exports = {
  buildPaymentCardPNG,
  buildPaymentText,
  sendPaymentAnnouncement,
  maskUserId,
  formatRupiah,
  toLocal,
  ZONE_LABEL,
};
