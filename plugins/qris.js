module.exports = function registerQris(scope) {
  with (scope) {
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
      (product.variants || []).find((v) => String(v?.name || "").trim().toLowerCase() === String(variantName || "").trim().toLowerCase()) || product.variants[0];
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
        [callbackButton(Markup, 'Batalkan Pesanan', `cancel_pay_${createTx.id}`, 'cancel')],
      ],
    };

    const useFrame = await isQrisFrameOn(); // ON/OFF frame

    const waitingRich = [
      `<img src="${createTx.qr_url}"/>`,
      '<h2>Silakan Scan QRIS</h2>',
      richTable(
        ['Detail Pembayaran', 'Nilai'],
        [
          ['Produk', esc(product.name)],
          ['Varian', esc(variant.name)],
          ['Jumlah Pesanan', `x${jumlah}`],
          ['Harga', `Rp ${rupiah(total)}`],
          ['Total Pembayaran', `Rp ${rupiah(createTx.total_amount)}`],
          ['ID Transaksi', esc(createTx.refId)],
          ['Batas Waktu', '15 menit'],
        ],
        { bordered: true, striped: true, compact: true }
      ),
      'Produk akan dikirim otomatis setelah pembayaran diterima.',
    ].join('\n');

    let sentMsgId = null;
    const richSent = await sendRichMessageSafe(ctx, chatId, waitingRich, { reply_markup: cancelKb });
    if (richSent?.message_id) {
      sentMsgId = richSent.message_id;
      try { await ctx.telegram.deleteMessage(chatId, ctx.callbackQuery.message.message_id); } catch {}
    } else {
      let media;
      if (useFrame) {
        const framed = await buildFramedQris(createTx.qr_url);
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
const { setQrisFrame } = require("../lib/config");

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
  const updated = await setQrisFrame(on);

  return ctx.reply(
    `✅ Frame QRIS sekarang: ${updated ? "ON (pakai frame)" : "OFF (QR default)"}`
  );
});

  }
};
