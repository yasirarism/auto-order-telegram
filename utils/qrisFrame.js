// utils/qrisFrame.js
const path = require("path");
const { createCanvas, loadImage } = require("canvas");

const FRAME_PATH = (() => {
  const raw = String(process.env.QRIS_FRAME_PATH || "").trim();
  if (raw) return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  return path.join(__dirname, "..", "assets", "qrisFrame.png");
})();

// Ukuran frame & slot QR (yang kemarin udah pas)
const FRAME_WIDTH = 1080;
const FRAME_HEIGHT = 1080;
const QR_X = 172;
const QR_Y = 387;
const QR_SIZE = 482;

// CACHE frame biar gak loadImage tiap kali
let framePromise = null;
function getFrame() {
  if (!framePromise) {
    framePromise = loadImage(FRAME_PATH);
  }
  return framePromise;
}

async function buildFramedQris(qrUrl) {
  // frame di-load dari cache
  const frame = await getFrame();

  // QR tetap harus load dari URL tiap transaksi
  const qr = await loadImage(qrUrl);

  const canvas = createCanvas(FRAME_WIDTH, FRAME_HEIGHT);
  const ctx = canvas.getContext("2d");

  ctx.drawImage(frame, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
  ctx.drawImage(qr, QR_X, QR_Y, QR_SIZE, QR_SIZE);

  return canvas.toBuffer("image/png");
}

module.exports = { buildFramedQris };
