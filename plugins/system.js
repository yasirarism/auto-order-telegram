module.exports = function registerSystem(scope) {
  with (scope) {
// === ⚡ AUTO-SYNC REALTIME STOK (Dari /stok/ ke /data/products.json) ===
if (!scope.skipLaunch) {
setInterval(async () => {
  // kalau lagi pause (misal pas bikin QRIS), langsung skip
  if (autoSyncPaused) return;
  try {
    const stokFolder = path.resolve("stok");
    let products = await loadProducts();
    if (!products.length) return;

    const stokFiles = (await listJsonDir(stokFolder)).filter((f) => f.endsWith(".json"));

    // 🔁 Loop file stok
    for (const file of stokFiles) {
      const code = file.replace(".json", "").toLowerCase();
      const stokPath = path.join(stokFolder, file);
      const stokList = await readStockFile(stokPath);
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

    await saveProducts(products);

    const changedProducts = products.filter((p) => {
      const prev = lastProducts.find((x) => x.id === p.id);
      return (
        !prev ||
        JSON.stringify(prev.variants) !== JSON.stringify(p.variants)
      );
    });

    if (changedProducts.length > 0) {
      const flashSales = await loadFlashSales();
      const nowMoment = nowTZ();
      const now = nowMoment.format(`HH.mm.ss [${tzLabel()}]`);

      for (const product of changedProducts) {
        const freshData = await loadProducts();
        const freshProduct = freshData.find((p) => p.id === product.id);
        if (!freshProduct) continue;

        const card = buildProductCard(freshProduct, flashSales, nowMoment, "Auto-sync");
        const caption = card.text;
        const keyboard = card.keyboard;

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


// === REGISTER DAFTAR PERINTAH UTAMA ===
async function registerCommands(bot) {
  try {
    const api = bot.telegram || bot.api || bot;
    await api.setMyCommands([
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
  if (scope.skipLaunch) return;
  if (typeof bot.start === 'function') {
    bot.start();
  } else if (typeof bot.launch === 'function') {
    bot.launch();
  }
  registerCommands(bot)
    .then(() => console.log(`[${AUTHOR}] ✅ Bot ${BOT_NAME} berhasil dijalankan!`))
    .catch((err) =>
      console.error(`[${AUTHOR}] ❌ Gagal menjalankan bot:`, err)
    );

  console.log(`[${AUTHOR}] ⚡️ Debug: bot.start() udah dijalankan`);
}, 1000);
CornService.start()
process.once("SIGINT", () => {
  webServer?.close();
  bot.stop("SIGINT");
});
process.once("SIGTERM", () => {
  webServer?.close();
  bot.stop("SIGTERM");
});
}
  }
};
