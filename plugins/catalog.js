module.exports = function registerCatalogPlugin(bot, deps) {
  const {
    loadProducts,
    loadFlashSales,
    nowTZ,
    buildProductCard,
    sendRichMessageSafe,
    toRichHtml,
    trackSentProduct,
    getAdminContactLabel,
    AUTHOR,
  } = deps;

  bot.hears(/^(?:❓\s*)?Cara Order$/i, async (ctx) => {
    ctx.session = ctx.session || {};
    ctx.session.flashSale = false;
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
      `<b>${getAdminContactLabel()}</b>`,
      ``,
      `━━━━━━━━━━━━━━━━━━━`,
      `<i>Bot by © ${AUTHOR} 2025</i>`,
    ].join("\n");
    await ctx.reply(text, { parse_mode: "HTML" });
  });

  bot.hears(/^(?:[1-9]|1[0-5])$/, async (ctx) => {
    const chatId = String(ctx.chat.id);
    const products = await loadProducts();
    const index = parseInt(ctx.message.text, 10);
    const product = products.find((item) => item.id === index);
    if (!product) return ctx.reply("⚠️ Produk tidak ditemukan!");

    const flashSales = await loadFlashSales();
    const nowMoment = nowTZ();
    const card = buildProductCard(product, flashSales, nowMoment, "Refresh");
    const richHtml = toRichHtml(
      product.isImage && product.image_url && product.image_url !== "-"
        ? `<img src="${product.image_url}"/>${card.text}`
        : card.text
    );

    try {
      let sentMsg = await sendRichMessageSafe(ctx, chatId, richHtml, {
        reply_markup: { inline_keyboard: card.keyboard },
      });
      if (!sentMsg) {
        sentMsg = await ctx.reply(`${card.text}\n`, {
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: card.keyboard },
        });
      }
      await trackSentProduct(ctx, product, sentMsg, false);
    } catch (err) {
      console.error("❌ Gagal kirim produk:", err);
      await ctx.reply(card.text, {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: card.keyboard },
      });
    }
  });
};
