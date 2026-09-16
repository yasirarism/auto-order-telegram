function findVariant(product, rawName) {
  const wanted = String(rawName || "").trim();
  return (product?.variants || []).find(
    (variant) => String(variant?.name || "").trim() === wanted
  ) || null;
}

function findVariantLoose(product, rawName) {
  const wanted = String(rawName || "").trim().toLowerCase();
  return (product?.variants || []).find(
    (variant) => String(variant?.name || "").trim().toLowerCase() === wanted
  ) || null;
}

function parseQuantityFromText(text, fallback = 1) {
  const str = String(text || "");
  const match = str.match(/(?:Jumlah Pesanan(?:<\/td><td>|\s*[:|])\s*x?)(\d+)/i);
  return match ? (parseInt(match[1], 10) || fallback) : fallback;
}

function resolveVariantAndQuantity(product, parts) {
  const fullVariantName = parts.slice(3).join("_");
  let variant = findVariantLoose(product, fullVariantName);
  if (variant) {
    return { variant, variantName: fullVariantName, jumlahFromCb: null };
  }

  if (parts.length >= 5) {
    const lastPart = parts[parts.length - 1];
    if (/^\d+$/.test(lastPart)) {
      const trimmedVariantName = parts.slice(3, -1).join("_");
      variant = findVariantLoose(product, trimmedVariantName);
      if (variant) {
        return {
          variant,
          variantName: trimmedVariantName,
          jumlahFromCb: parseInt(lastPart, 10) || null,
        };
      }
    }
  }

  return { variant: null, variantName: fullVariantName, jumlahFromCb: null };
}

module.exports = function registerOrderFlow(scope) {
  with (scope) {
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
    const flashSales = await loadFlashSales();
    const nowMoment = nowTZ();

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

  const products = await loadProducts();
  const product = products.find((p) => String(p.id) === pid);
  if (!product) return ctx.answerCbQuery("❌ Produk tidak ditemukan");

  const resolved = resolveVariantAndQuantity(product, parts);
  const variant = resolved.variant;
  const variantName = resolved.variantName;
  if (!variant) return ctx.answerCbQuery("❌ Varian tidak ditemukan");

  const msgText = ctx.callbackQuery.message.caption || ctx.callbackQuery.message.text || "";
  const jumlah = resolved.jumlahFromCb ?? parseQuantityFromText(msgText, 1);

  const flashSales = await loadFlashSales();
  const flashInfo = getFlashSaleInfo(flashSales, product, variant);
  const unitPrice = flashInfo.price;
  const total = unitPrice * jumlah;
  const now = nowTZ().format(`HH.mm.ss [${tzLabel()}]`);

  const text = buildPaymentConfirmationCard(
    product,
    variant,
    jumlah,
    total,
    null,
    "Yakin ingin membayar menggunakan QRIS?"
  );

  const keyboard = [
    [
      callbackButton(Markup, "Ya, Lanjut Bayar", `paid_qris_${pid}`, "success"),
      callbackButton(Markup, "Batal", `cancel_confirm_${pid}`, "cancel"),
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

  const markup = { inline_keyboard: keyboard };
  const richResult = await editRichMessageSafe(
    ctx,
    ctx.chat.id,
    ctx.callbackQuery.message.message_id,
    toRichHtml(text),
    { reply_markup: markup }
  );
  if (!richResult) {
    try {
      if (ctx.callbackQuery.message.caption) {
        await ctx.editMessageCaption(richToFallbackHtml(text), { parse_mode: "HTML", reply_markup: markup });
      } else {
        await ctx.editMessageText(richToFallbackHtml(text), { parse_mode: "HTML", reply_markup: markup });
      }
    } catch (err) {
      console.error("❌ Gagal edit konfirmasi QRIS:", err.description || err.message);
    }
  }

  return ctx.answerCbQuery("💳 Konfirmasi pembayaran QRIS terbuka 💳");
}

// === 🔁 HANDLER REFRESH (auto-sync stok dari /stok/<code>.json ke /data/products.json + log debug) ===
if (data.startsWith("refresh_order_")) {
  const parts = data.split("_");
  const pid = parts[2];
  const quantity = Number(parts[parts.length - 1]) || 1;
  const variantName = parts.slice(3, -1).join("_");
  const product = products.find((p) => String(p.id) === pid);
  const variant = findVariantLoose(product, variantName);
  if (!product || !variant) return ctx.answerCbQuery("⚠️ Pesanan tidak ditemukan", { show_alert: true });
  const flashInfo = getFlashSaleInfo(flashSales, product, variant, nowMoment);
  const text = buildOrderConfirmationCard(product, variant, flashInfo, quantity, nowMoment);
  const keyboard = [
    [
      { text: "−1", callback_data: `dec_${pid}_${variantName}` },
      { text: "+1", callback_data: `inc_${pid}_${variantName}` },
    ],
    [
      callbackButton(Markup, "QRIS", `pay_qris_${pid}_${variantName}`, "qr"),
      callbackButton(Markup, "Saldo", `pay_saldo_${pid}_${variantName}`, "money"),
    ],
    [callbackButton(Markup, "Refresh", `refresh_order_${pid}_${variantName}_${quantity}`, "refresh")],
    [callbackButton(Markup, "Back", `back_${pid}`, "back")],
  ];
  await safeEditProductMessage(bot, {
    chatId: ctx.chat.id,
    messageId: msg.message_id,
    isPhoto: !!msg.caption,
    type: msg.caption ? "photo" : "text",
  }, text, keyboard);
  return ctx.answerCbQuery("♻️ Konfirmasi diperbarui");
}

if (data.startsWith("refresh_")) {
  try {
    const pid = parseInt(data.split("_")[1]);
    // load semua produk
    const products = await loadProducts();
    const product = products.find((p) => p.id === pid);
    if (!product) return ctx.answerCbQuery("⚠️ Produk tidak ditemukan!");
    const flashSales = await loadFlashSales();

    // 💡 ambil berdasarkan CODE (bukan ID)
    const code = product.code?.toLowerCase();
    const stokPath = path.resolve("stok", `${code}.json`);

    console.log(`\n🧩 [REFRESH] Sinkron stok produk "${product.name}" (${code})`);
    console.log(`📂 Path file stok: ${stokPath}`);

    // 🔄 auto sinkron stok + KEEP transaksi pending
    if (await existsJson(stokPath)) {
      const stokList = await readStockFile(stokPath);
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
      await saveProducts(products);
      console.log(`✅ Stok tersinkron ke database\n`);
    } else {
      console.warn(`⚠️ File stok tidak ditemukan: ${stokPath}\n`);
    }

    const nowMoment = nowTZ();
    const now = nowMoment.format(`HH.mm.ss [${tzLabel()}]`);
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

      const jumlah = parseQuantityFromText(caption, 1);

      const variant = findVariantLoose(product, variantName);
      const flashInfo = getFlashSaleInfo(flashSales, product, variant, nowMoment);
      const unitPrice = flashInfo.price;
      const total = unitPrice * jumlah;

      const text = buildOrderConfirmationCard(product, variant, flashInfo, jumlah, nowMoment);

      const keyboard = [
        [
          { text: "−1", callback_data: `dec_${pid}_${variantName}` },
          { text: "+1", callback_data: `inc_${pid}_${variantName}` },
        ],
        [
          callbackButton(Markup, "QRIS", `pay_qris_${pid}_${variantName}`, "qr"),
          callbackButton(Markup, "Saldo", `pay_saldo_${pid}_${variantName}`, "money"),
        ],
        [callbackButton(Markup, "Refresh", `refresh_order_${pid}_${variantName}_${jumlah}`, "refresh")],
        [callbackButton(Markup, "Back", `back_${pid}`, "back")],
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
    const { text, keyboard } = buildProductCard(product, flashSales, nowMoment, "Refresh");

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
  const [_, pid, ...variantParts] = data.split("_");
  const variantName = variantParts.join("_");
  const product = products.find((p) => String(p.id) === pid);
  if (!product) return ctx.answerCbQuery("❌ Produk tidak ditemukan");
  const variant = findVariantLoose(product, variantName);
  if (!variant) return ctx.answerCbQuery("❌ Varian tidak ditemukan");
  const jumlah = 1;
  const flashInfo = getFlashSaleInfo(flashSales, product, variant, nowMoment);
  const unitPrice = flashInfo.price;
  const total = unitPrice * jumlah;
  const now = nowMoment.format(`HH.mm.ss [${tzLabel()}]`);

  const text = buildOrderConfirmationCard(product, variant, flashInfo, jumlah, nowMoment);

  const keyboard = [
    [
      { text: "−1", callback_data: `dec_${pid}_${variantName}` },
      { text: "+1", callback_data: `inc_${pid}_${variantName}` },
    ],
    [
      callbackButton(Markup, "QRIS", `pay_qris_${pid}_${variantName}`, "qr"),
      callbackButton(Markup, "Saldo", `pay_saldo_${pid}_${variantName}`, "money"),
    ],
    [callbackButton(Markup, "Refresh", `refresh_order_${pid}_${variantName}_${jumlah}`, "refresh")],
    [callbackButton(Markup, "Back", `back_${pid}`, "back")],
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
  const [action, pid, ...variantParts] = data.split("_");
  const variantName = variantParts.join("_");
  const product = products.find((p) => String(p.id) === pid);
  if (!product) return ctx.answerCbQuery("❌ Produk tidak ditemukan");
  const variant = findVariantLoose(product, variantName);
  if (!variant) return ctx.answerCbQuery("❌ Varian tidak ditemukan");

  const caption = msg.caption || msg.text || "";
  let jumlah = parseQuantityFromText(caption, 1);

  if (action === "inc" && jumlah < variant.stock) jumlah++;
  if (action === "dec" && jumlah > 1) jumlah--;

  const flashInfo = getFlashSaleInfo(flashSales, product, variant, nowMoment);
  const unitPrice = flashInfo.price;
  const total = unitPrice * jumlah;
  const now = nowMoment.format(`HH.mm.ss [${tzLabel()}]`);

  const text = buildOrderConfirmationCard(product, variant, flashInfo, jumlah, nowMoment);

  const keyboard = [
    [
      { text: "−1", callback_data: `dec_${pid}_${variantName}` },
      { text: "+1", callback_data: `inc_${pid}_${variantName}` },
    ],
    [
      callbackButton(Markup, "QRIS", `pay_qris_${pid}_${variantName}`, "qr"),
      callbackButton(Markup, "Saldo", `pay_saldo_${pid}_${variantName}`, "money"),
    ],
    [callbackButton(Markup, "Refresh", `refresh_order_${pid}_${variantName}_${jumlah}`, "refresh")],
    [callbackButton(Markup, "Back", `back_${pid}`, "back")],
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

  const products = await loadProducts();
  const product = products.find((p) => String(p.id) === pid);
  if (!product) return ctx.answerCbQuery("❌ Produk tidak ditemukan");

  const resolved = resolveVariantAndQuantity(product, parts);
  const variant = resolved.variant;
  const variantName = resolved.variantName;
  if (!variant) return ctx.answerCbQuery("❌ Varian tidak ditemukan");

  const msgText =
    ctx.callbackQuery.message.caption || ctx.callbackQuery.message.text || "";
  const jumlah = resolved.jumlahFromCb ?? parseQuantityFromText(msgText, 1);

  const db = await loadDB();
  const users = db.users;
  const user = users[String(ctx.chat.id)];
  if (!user)
    return ctx.answerCbQuery("⚠️ Kamu belum terdaftar, ketik /start dulu!");

  // 💰 Hitung total sesuai jumlah pesanan
  const flashInfo = getFlashSaleInfo(flashSales, product, variant, nowMoment);
  const unitPrice = flashInfo.price;
  const total = unitPrice * jumlah;
  const now = nowMoment.format(`HH.mm.ss [${tzLabel()}]`);

  const text = buildPaymentConfirmationCard(
    product,
    variant,
    jumlah,
    total,
    user.balance,
    user.balance >= total
      ? "Yakin ingin membayar menggunakan saldo kamu?"
      : "❌ Saldo tidak cukup! Silakan isi saldo dulu."
  );

  const keyboard =
    user.balance >= total
      ? [
          [
            callbackButton(Markup, "Ya, Lanjut Bayar", `confirm_pay_${pid}_${variantName}_${jumlah}`, "success"),
            callbackButton(Markup, "Batal", `cancel_confirm_${pid}`, "cancel"),
          ],
        ]
      : [[callbackButton(Markup, "Kembali", `back_${pid}`, "back")]];

  const markup = { inline_keyboard: keyboard };
  const richResult = await editRichMessageSafe(
    ctx,
    ctx.chat.id,
    ctx.callbackQuery.message.message_id,
    toRichHtml(text),
    { reply_markup: markup }
  );
  if (!richResult) {
    try {
      if (ctx.callbackQuery.message.caption) {
        await ctx.editMessageCaption(richToFallbackHtml(text), { parse_mode: "HTML", reply_markup: markup });
      } else {
        await ctx.editMessageText(richToFallbackHtml(text), { parse_mode: "HTML", reply_markup: markup });
      }
    } catch (err) {
      console.error("❌ Gagal edit konfirmasi saldo:", err.description || err.message);
    }
  }

  return ctx.answerCbQuery("💳 Konfirmasi pembayaran terbuka 💳");
}

// === ✅ KONFIRMASI PEMBAYARAN ===
if (data.startsWith("confirm_pay_")) {
  try {
    const parts = data.split("_");
    const pid = parts[2];

    const products = await loadProducts();
    const product = products.find((p) => String(p.id) === pid);
    if (!product) return ctx.answerCbQuery("❌ Produk tidak ditemukan");

    const resolved = resolveVariantAndQuantity(product, parts);
    const variant = resolved.variant;
    const variantName = resolved.variantName;
    if (!variant) return ctx.answerCbQuery("❌ Stok Varian Habis!");

    const msgText =
      ctx.callbackQuery.message.caption || ctx.callbackQuery.message.text || "";
    const jumlah = resolved.jumlahFromCb ?? parseQuantityFromText(msgText, 1);

    const db = await loadDB();
    const users = db.users;
    const user = users[String(ctx.chat.id)];
    if (!user)
      return ctx.answerCbQuery("⚠️ Kamu belum terdaftar, ketik /start dulu!");

    // 💰 Hitung total sesuai jumlah
    const flashInfo = getFlashSaleInfo(flashSales, product, variant, nowMoment);
    const unitPrice = flashInfo.price;
    const total = unitPrice * jumlah;
    if (user.balance < total)
      return ctx.answerCbQuery("❌ Saldo tidak cukup!");

    // 💰 Kurangi saldo & stok sesuai jumlah
    user.balance -= total;
    variant.stock -= jumlah;
    product.sold += jumlah;

    // === 🎁 Ambil akun dari stok/<code>.json ===
    const code = product.code?.toLowerCase();
    const stokPath = path.resolve("stok", `${code}.json`);
    let akunText = "❌ Tidak ada akun tersedia";
    let akunDataList = []; // simpan beberapa akun

    if (await existsJson(stokPath)) {
      const stokList = await readStockFile(stokPath);

      // Ambil semua akun yang cocok dengan varian
      const stokFiltered = stokList.filter(
        (s) => s.varian && s.varian.toLowerCase() === variant.name.toLowerCase()
      );

      if (stokFiltered.length >= jumlah) {
        // Ambil sebanyak jumlah pesanan
        akunDataList = stokFiltered.slice(0, jumlah).map((a) => ({
          email: a.email || "-",
          password: a.password || "-",
          twofa: a.twofa || a.otp || a.note || a.extra || a.message || "",
        }));

        // Format tampilan akun banyak
        akunText = akunDataList
          .map((a, i) => {
            const extraLine = a.twofa ? `\nPesan: <code>${a.twofa}</code>` : "";
            return (
              `🔹 <b>Akun ${i + 1}</b>\n` +
              `Email: <code>${a.email}</code>\n` +
              `Password: <code>${a.password}</code>` +
              extraLine
            );
          })
          .join("\n\n");

        // Hapus akun yang sudah dikirim dari stok file
        const sisaStok = stokList.filter(
          (s) => !akunDataList.some((a) => a.email === s.email)
        );
        await writeStockFile(stokPath, sisaStok);

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
    const nextTestiIndex = (() => {
      const numericIds = transactions
        .map((t) => Number(t?.id))
        .filter((n) => Number.isFinite(n));
      const maxId = numericIds.length ? Math.max(...numericIds) : 0;
      return maxId + 1;
    })();
    const txId = "TXN" + Date.now();
    const nowDate = new Date();
    const nowFull = dayjs(nowDate).tz().format("YYYY-MM-DD HH:mm:ss [WIB]");

    // Simpan semua akun dalam 1 transaksi
    transactions.push({
      id: txId,
      user_id: String(ctx.chat.id),
      username: user.username || ctx.from?.username || "-",
      product: product.name,
      variant: variant.name,
      price: unitPrice,
      qty: jumlah,
      total: total,
      method: "saldo",
      status: "Sukses",
      timestamp: nowFull,
      akun: akunDataList, // ✅ simpan semua akun
    });
    const testiIndex = nextTestiIndex;

    await saveTransactions(transactions);
    console.log(`💾 Transaksi ${txId} disimpan ke data/transactions.json`);

    if (CHANNEL_TARGET && !isAdminNow(ctx)) {
      try {
        await sendPaymentAnnouncement(bot, CHANNEL_TARGET, {
          store: STORE_NICKNAME,
          tanggalOrder: nowDate,
          totalBayar: total,
          product: product.name,
          variasi: variant.name,
          statusPembayaran: "Berhasil",
          testiIndex,
          qty: jumlah,
          maskedUserId: maskUserId(ctx.chat.id),
        });
      } catch (err) {
        console.error("❌ Gagal kirim testi saldo:", err?.message || err);
      }
    }

    try {
      await sendOrderLogToChannel(bot, {
        channelId: process.env.ORDER_LOG_CHANNEL,
        txRef: txId,
        orderRef: txId,
        userId: String(ctx.chat.id),
        username: user.username || ctx.from?.username || "-",
        buyerName: user.first_name || user.username || "-",
        product: { code: product.code || "-", name: product.name },
        variantName: variant.name,
        qty: jumlah,
        delivered: akunDataList.length,
        totalAmount: total,
        paymentMethod: "saldo",
        createdAt: nowFull,
        accounts: akunDataList,
      });
    } catch (err) {
      console.error("❌ Gagal kirim order log saldo:", err?.message || err);
    }

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
      `Terima kasih telah berbelanja di <b>${STORE_NICKNAME}</b> 💙`,
      `🧾 <i>ID Transaksi:</i> <code>${txId}</code>`,
      `🕒 ${now}`,
    ].join("\n");

    const isPhoto = !!ctx.callbackQuery.message.caption;

    let keyboard;
    if (akunText.includes("Akun 1")) {
      keyboard = undefined; // akun valid → jangan tampilkan tombol
    } else {
      keyboard = {
        inline_keyboard: [[callbackButton(Markup, "Kembali ke Produk", `back_${pid}`, "back")]],
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
      if (!rec && typeof tx?.find === 'function') {
        const matches = await tx.find(t => String(t.id) === String(txId));
        rec = Array.isArray(matches) ? matches[0] : matches;
      }
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
        const updated = await tx.updateById(rec.id, patch);
        if (updated === false && typeof tx?.update === 'function') await tx.update(rec.id, patch);
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
      '<h2>Pesanan Dibatalkan</h2>',
      richTable(
        ['Detail Pembatalan', 'Nilai'],
        [
          ['Status', 'Dibatalkan oleh pengguna'],
          ['Waktu', esc(canceledAt)],
          [`${esc(PAYMENT_GATEWAY_LABEL)} ID`, esc(rec.reference_id || rec.refId || rec.id)],
        ],
        { bordered: true, striped: true, compact: true }
      ),
      'Pesanan kamu berhasil dibatalkan.',
    ].join('\n');

    const canceledPhotoPath = CANCELED_BANNER_PATH;

    const richResult = await sendRichMessageSafe(ctx, chatId, cap, { reply_markup: undefined });
    if (!richResult) {
      try { await ctx.telegram.sendMessage(chatId, richToFallbackHtml(cap), { parse_mode: 'HTML' }); } catch {}
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

  const { text, keyboard } = buildProductCard(product, flashSales, nowMoment, "Refresh");

  await safeEditProductMessage(bot, {
    chatId: ctx.chat.id,
    messageId: ctx.callbackQuery.message.message_id,
    isPhoto: !!ctx.callbackQuery.message.caption,
    type: ctx.callbackQuery.message.caption ? "photo" : "text",
  }, text, keyboard);

  return ctx.answerCbQuery("⬅️ Kembali ke detail produk");
}

      // ⬇️ INI WAJIB ADA! Nutup try dan bot.on
    } catch (err) {
      console.error("callback error:", err);
    }
  }); // ← ini yang lu ilangin kemarin


// === ❌ BATALKAN PESANAN & KEMBALI KE DETAIL PRODUK ===
bot.action(/^cancel_confirm_(\d+)$/, async (ctx) => {
  try {
    const pid = Number(ctx.match[1]);
    const products = await loadProducts();
    const product = products.find(p => String(p.id) === String(pid));
    if (!product) { await ctx.answerCbQuery('Produk tidak ditemukan'); return; }

    const flashSales = await loadFlashSales();
    const nowMoment = nowTZ();
    const now = nowMoment.format(`HH.mm.ss [${tzLabel()}]`);
    const variantList = (product.variants || [])
      .map((v) => {
        const flashInfo = getFlashSaleInfo(flashSales, product, v, nowMoment);
        const priceText = formatPriceHtml(v.price, flashInfo);
        return `• ${v.name}: <b>${priceText}</b> - Stok: ${v.stock}`;
      })
      .join("\n");

    const flashSaleBadge = getProductFlashSaleBadge(flashSales, product, nowMoment);
    const text = [
      flashSaleBadge ? `🔥 <b>${flashSaleBadge}</b>` : null,
      `${STORE_NICKNAME} PREMIUM APPS`,
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
    ].filter(Boolean).join("\n");

    // susun tombol varian 2 kolom seperti biasa
    const variantButtons = [];
    for (let i = 0; i < (product.variants || []).length; i += 2) {
      const row = [];
      const v1 = product.variants[i];
      const v2 = product.variants[i + 1];
      if (v1) {
        const v1FlashInfo = getFlashSaleInfo(flashSales, product, v1, nowMoment);
        const t = `${v1.name} - ${formatPriceButton(v1.price, v1FlashInfo)}‎`;
        row.push(v1.stock > 0 ? callbackButton(Markup, t, `buy_${product.id}_${v1.name}`, "product")
                              : callbackButton(Markup, t, "noop", "ban"));
      }
      if (v2) {
        const v2FlashInfo = getFlashSaleInfo(flashSales, product, v2, nowMoment);
        const t = `${v2.name} - ${formatPriceButton(v2.price, v2FlashInfo)}‎`;
        row.push(v2.stock > 0 ? callbackButton(Markup, t, `buy_${product.id}_${v2.name}`, "product")
                              : callbackButton(Markup, t, "noop", "ban"));
      }
      variantButtons.push(row);
    }
    const kb = { inline_keyboard: [...variantButtons, [callbackButton(Markup, "Refresh", `refresh_${product.id}`, "refresh")]] };

    const msg = ctx.callbackQuery?.message;
    const hasMedia = !!(msg?.photo || msg?.video || msg?.animation || msg?.document);
    const card = buildProductCard(product, flashSales, nowMoment, "Refresh");
    const richResult = await editRichMessageSafe(ctx, ctx.chat.id, msg.message_id, toRichHtml(card.text), { reply_markup: { inline_keyboard: card.keyboard } });
    if (!richResult) {
      await safeEditProductMessage(bot, {
        chatId: ctx.chat.id,
        messageId: msg.message_id,
        isPhoto: !!msg.caption,
        type: msg.caption ? "photo" : "text",
      }, card.text, card.keyboard);
    }

    return ctx.answerCbQuery('❌ Dibatalkan');
  } catch (e) {
    try { await ctx.answerCbQuery('Gagal membatalkan'); } catch {}
  }
});


  }
};

module.exports.findVariant = findVariant;
module.exports.findVariantLoose = findVariantLoose;
module.exports.parseQuantityFromText = parseQuantityFromText;
module.exports.resolveVariantAndQuantity = resolveVariantAndQuantity;
