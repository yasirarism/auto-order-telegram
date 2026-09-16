module.exports = function registerAdminReports(scope) {
  with (scope) {
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

    // baca & cari transaksi
    let list = [];
    try {
      list = await loadTransactions();
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
      const plist = await loadProducts();
      const prod = plist.find((x) => String(x.id) === String(t.product_id));
      if (prod) {
        productName = prod.name || "-";
        productCode = prod.code || "-";
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
      `${STORE_NICKNAME} PREMIUM APPS`,
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
      `Faktur        : ${t.reference_id ?? ""}`,
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

// === 🔥 FLASH SALE CONTROL (ADMIN ONLY)
// Format: /flashsale <product_id>|<varian>|<mulai>|<selesai>|<harga>
bot.command("flashsale", async (ctx) => {
  try {
    if (!isAdmin(ctx.from.id)) return ctx.reply("🚫 Kamu bukan admin.");
    if (!isAdminNow(ctx)) return ctx.reply("🚫 Kamu bukan admin.");

    const arg = (ctx.message?.text || "").split(" ").slice(1).join(" ").trim();
    if (!arg) {
      return ctx.reply(
        `⚙️ Format Flash Sale:\n` +
        `<code>/flashsale &lt;product_id&gt;|&lt;varian&gt;|&lt;mulai&gt;|&lt;selesai&gt;|&lt;harga&gt;</code>\n` +
        `Format waktu: <b>YYYY-MM-DD HH:mm</b> (${tzLabel()})\n` +
        `Contoh: <code>/flashsale 3|Basic|2025-03-10 09:00|2025-03-10 23:00|15000</code>\n\n` +
        `Hapus: <code>/flashsale del &lt;product_id&gt;|&lt;varian&gt;</code>\n` +
        `Matikan semua: <code>/flashsale off</code>\n` +
        `Lihat list: <code>/flashsale list</code>`,
        { parse_mode: "HTML" }
      );
    }

    const input = arg.toLowerCase();

    if (input === "off") {
      await saveFlashSales([]);
      return ctx.reply("✅ Semua Flash Sale telah dimatikan.", { parse_mode: "HTML" });
    }

    if (input === "list") {
      const flashSales = await loadFlashSales();
      if (!flashSales.length) {
        return ctx.reply("📭 Belum ada Flash Sale yang terdaftar.");
      }
      const products = await loadProducts();
      const prodIndex = Object.fromEntries(products.map((p) => [String(p.id), p]));

      const rows = flashSales.map((sale, i) => {
        const product = prodIndex[String(sale.productId)];
        const productName = product?.name || `ID ${sale.productId}`;
        const startAt = dayjs(Number(sale.startAt)).tz(APP_TZ).format("DD MMM YYYY HH:mm");
        const endAt = dayjs(Number(sale.endAt)).tz(APP_TZ).format("DD MMM YYYY HH:mm");
        return [
          `${i + 1}. ${productName}`,
          `   ├ Varian: ${sale.variantName}`,
          `   ├ Harga: Rp ${rupiah(sale.price)}`,
          `   └ Waktu: ${startAt} - ${endAt} ${tzLabel()}`,
        ].join("\n");
      });

      return ctx.reply(
        [`<b>🔥 DAFTAR FLASH SALE</b>`, ``, ...rows].join("\n"),
        { parse_mode: "HTML" }
      );
    }

    if (input.startsWith("del ")) {
      const spec = arg.slice(4).trim();
      if (!spec.includes("|")) {
        return ctx.reply(
          "⚠️ Format salah!\nGunakan: /flashsale del <product_id>|<varian>"
        );
      }
      const [productIdRaw, variantRaw] = spec.split("|").map((v) => v.trim());
      const productId = Number(productIdRaw);
      if (!Number.isFinite(productId)) {
        return ctx.reply("⚠️ ID produk tidak valid.");
      }
      const flashSales = await loadFlashSales();
      const before = flashSales.length;
      const next = flashSales.filter(
        (sale) =>
          String(sale.productId) !== String(productId) ||
          normalizeVariantName(sale.variantName) !== normalizeVariantName(variantRaw)
      );
      await saveFlashSales(next);
      if (before === next.length) {
        return ctx.reply("⚠️ Flash Sale tidak ditemukan untuk produk/varian tersebut.");
      }
      return ctx.reply("✅ Flash Sale berhasil dihapus.");
    }

    if (!arg.includes("|")) {
      return ctx.reply(
        "⚠️ Format salah!\nGunakan: /flashsale <product_id>|<varian>|<mulai>|<selesai>|<harga>"
      );
    }

    const [productIdRaw, variantRaw, startRaw, endRaw, priceRaw] = arg
      .split("|")
      .map((v) => v.trim());

    const productId = Number(productIdRaw);
    if (!Number.isFinite(productId)) {
      return ctx.reply("⚠️ ID produk tidak valid.");
    }

    const products = await loadProducts();
    const product = products.find((p) => Number(p.id) === productId);
    if (!product) {
      return ctx.reply(`⚠️ Produk dengan ID ${productId} tidak ditemukan.`);
    }

    const variant = (product.variants || []).find(
      (v) => normalizeVariantName(v.name) === normalizeVariantName(variantRaw)
    );
    if (!variant) {
      return ctx.reply(`⚠️ Varian "${variantRaw}" tidak ditemukan di produk ${product.name}.`);
    }

    const startAt = parseFlashSaleTime(startRaw);
    const endAt = parseFlashSaleTime(endRaw);
    if (!startAt || !endAt) {
      return ctx.reply(
        `⚠️ Format waktu tidak valid. Gunakan YYYY-MM-DD HH:mm (${tzLabel()}).`
      );
    }

    if (startAt >= endAt) {
      return ctx.reply("⚠️ Waktu mulai harus lebih awal dari waktu selesai.");
    }

    const salePrice = Number(priceRaw);
    if (!Number.isFinite(salePrice) || salePrice <= 0) {
      return ctx.reply("⚠️ Harga flash sale tidak valid.");
    }

    if (salePrice >= Number(variant.price)) {
      return ctx.reply("⚠️ Harga flash sale harus lebih murah dari harga normal.");
    }

    const flashSales = await loadFlashSales();
    const nextFlashSales = [
      ...flashSales.filter(
        (sale) =>
          String(sale.productId) !== String(productId) ||
          normalizeVariantName(sale.variantName) !== normalizeVariantName(variant.name)
      ),
      {
        productId,
        variantName: variant.name,
        startAt,
        endAt,
        price: salePrice,
      },
    ];

    await saveFlashSales(nextFlashSales);

    const discountPercent = calcDiscountPercent(variant.price, salePrice);
    const startLabel = dayjs(startAt).tz(APP_TZ).format("DD MMM YYYY HH:mm");
    const endLabel = dayjs(endAt).tz(APP_TZ).format("DD MMM YYYY HH:mm");

    await ctx.reply(
      [
        `✅ Flash Sale tersimpan!`,
        `Produk : <b>${product.name}</b> (ID ${productId})`,
        `Varian : <b>${variant.name}</b>`,
        `Harga : <b>Rp ${rupiah(salePrice)}</b> (-${discountPercent}%)`,
        `Waktu : <b>${startLabel} - ${endLabel} ${tzLabel()}</b>`,
      ].join("\n"),
      { parse_mode: "HTML" }
    );
  } catch (err) {
    console.error("❌ Error di /flashsale:", err);
    try { await ctx.reply("❌ Gagal memproses /flashsale, cek log server."); } catch {}
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

    const path = require("path");
    const stokFile     = path.resolve("stok", `${code}.json`);

    if (!(await existsJson(stokFile))) return ctx.reply(`⚠️ File stok tidak ditemukan untuk kode "${code}".`);

    // Muat produk & varian
    const products = await loadProducts();
    const product  = products.find(p => p.code && String(p.code).toLowerCase() === code);
    if (!product) return ctx.reply(`⚠️ Produk dengan kode "${code}" tidak ditemukan di products.json`);

    const targetVar = (product.variants || []).find(v => String(v.name).toLowerCase() === String(varianInput).toLowerCase());
    if (!targetVar) return ctx.reply(`⚠️ Varian "${varianInput}" tidak ada di produk "${product.name}".`);

    const varianName = targetVar.name;

    // Baca stok (TIDAK MENGURANGI DULU)
    let stokList = await readStockFile(stokFile);

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
      const extra =
        it.twofa ?? it.otp ?? it.note ?? it.extra ?? it.message ?? "";
      const extraText = extra ? ` | Pesan: ${extra}` : "";
      return `${idx + 1}. ${email}:${pass}${extraText}`;
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
    await writeStockFile(stokFile, newStokList);

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
          await saveProducts(products);
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
        callbackButton(Markup, "Produk", "help_produk", "product"),
        callbackButton(Markup, "Stok", "help_stok", "product")
      ],
      [
        callbackButton(Markup, "Transaksi", "help_trx", "order"),
        callbackButton(Markup, "Sistem", "help_sys", "settings")
      ],
      [callbackButton(Markup, "Add Stock", "help_addstok", "upload")]
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
        `🔹 <b>/editvar</b> — <code>Edit Varian</code>`,
        `🔹 <b>/delvar</b> — <code>Hapus Varian</code>`,
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
        `🔹 <b>/flashsale</b> — <code>Atur Flash Sale (produk/varian/waktu/harga)</code>`,
        `🔹 <b>/broadcast</b> — <code>Kirim Pesan</code>`,
        `🔹 <b>/setframeqris</b> — <code>Toggle Frame</code>`
      ].join("\n");
    }

    const keyboardRows = [[callbackButton(Markup, "Kembali", "help_back", "back")]];
    if (category === "stok") {
      keyboardRows.unshift([callbackButton(Markup, "Menu Add Stock", "help_addstok", "upload")]);
    }
    const keyboard = Markup.inlineKeyboard(keyboardRows);

    await ctx.editMessageText(categoryText + "\n\n━━━━━━━━━━━━━━━━━━━━", {
      parse_mode: "HTML",
      ...keyboard
    });
    await ctx.answerCbQuery();
  } catch (err) {
    console.error("❌ Error handler kategori: ", err);
  }
});

// === MENU ADD STOCK (ADMIN) ===
bot.action("help_addstok", async (ctx) => {
  try {
    if (!isAdminNow(ctx)) return ctx.answerCbQuery("🚫 Akses Ditolak!");

    const text = [
      `📥 <b>MENU ADD STOCK</b>`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `🔹 <b>Format Cepat</b>:`,
      `<code>/addstok code|varian|email|pass|pesan(optional)|email|pass|pesan(optional)</code>`,
      ``,
      `🔹 <b>Multi-line (lebih rapi)</b>:`,
      `<code>/addstok code|varian|email|pass|catatan</code>`,
      `<code>code|varian|email2|pass2|catatan2</code>`,
      ``,
      `🔹 <b>Tanpa Pesan</b>:`,
      `<code>/addstok code|varian|email|pass|email|pass</code>`,
      ``,
      `🔹 <b>Gunakan "-" jika kosong</b>:`,
      `<code>/addstok code|varian|email|pass|-|email|pass|pesan</code>`,
      ``,
      `🔹 <b>Import TXT</b>:`,
      `Upload .txt dengan caption: <code>/addstok code|varian</code>`,
      `Isi file per baris: <code>email|password</code> atau <code>email|password|pesan</code>`,
      ``,
      `📝 <i>Kolom pesan bisa diisi OTP/backup/notes lain.</i>`
    ].join("\n");

    const keyboard = Markup.inlineKeyboard([
      [callbackButton(Markup, "Kembali ke Stok", "help_stok", "back")]
    ]);

    await ctx.editMessageText(text, { parse_mode: "HTML", ...keyboard });
    await ctx.answerCbQuery();
  } catch (err) {
    console.error("❌ Error help_addstok:", err);
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
      [callbackButton(Markup, "Produk", "help_produk", "product"), callbackButton(Markup, "Stok", "help_stok", "product")],
      [callbackButton(Markup, "Transaksi", "help_trx", "order"), callbackButton(Markup, "Sistem", "help_sys", "settings")],
      [callbackButton(Markup, "Add Stock", "help_addstok", "upload")]
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
      inline_keyboard: [[callbackButton(Markup, "Perbarui Data", "refresh_report", "refresh")]]
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
        inline_keyboard: [[callbackButton(Markup, "Perbarui Data", "refresh_report", "refresh")]]
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


// === 👑 /riwayat (ADMIN ONLY — by username atau ID) ===
bot.command('riwayat', async (ctx) => {
  try {
    if (!isAdminNow(ctx)) return ctx.reply('🚫 Kamu bukan admin, perintah ini tidak diizinkan.');

    // helper lokal (biar gak bentrok sama yang lain)
    const PER_PAGE_ADMIN = 5;
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
    const db       = await loadDB();
    const allTx    = await loadTransactions();
    const prodArr  = await loadProducts();
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
            ...t.akun.map((a,i) => {
              const extra = a.twofa || a.otp || a.note || a.extra || a.message || "";
              const extraLine = extra ? `\n├     Pesan: <code>${escAdm(extra)}</code>` : "";
              return (
                `├ 🔹 <b>Akun ${i+1}</b>\n├     Email: <code>${escAdm(a.email||'-')}</code>\n├     Password: <code>${escAdm(a.password||'-')}</code>${extraLine}`
              );
            })
          );
        } else if (t.email || t.password) {
          const extra = t.twofa || t.otp || t.note || t.extra || t.message || "";
          akunLines.push('├ 📦 <b>Akun</b>:');
          akunLines.push(`├     Email: <code>${escAdm(t.email||'-')}</code>`);
          akunLines.push(`├     Password: <code>${escAdm(t.password||'-')}</code>`);
          if (extra) akunLines.push(`├     Pesan: <code>${escAdm(extra)}</code>`);
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
      if (page > 1) nav.push(callbackButton(Markup, 'Sebelumnya', `adm_page_${targetUser.id}_${page-1}`, 'back'));
      if (page < totalPages) nav.push(callbackButton(Markup, 'Selanjutnya', `adm_page_${targetUser.id}_${page+1}`, 'arrow_right'));
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

    const allTx   = await loadTransactions();
    const db      = await loadDB();
    const prodArr = await loadProducts();
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
    if (page > 1) nav.push(callbackButton(Markup, 'Sebelumnya', `adm_page_${userId}_${page-1}`, 'back'));
    if (page < totalPages) nav.push(callbackButton(Markup, 'Selanjutnya', `adm_page_${userId}_${page+1}`, 'arrow_right'));
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

  setBroadcastSession(ctx, {
    pending: true,
    message,
    photo,
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      first_name: u.first_name,
    })),
  });

  const caption = `📝 <b>Konfirmasi Broadcast</b>\n\n${esc(
    message || ""
  )}\n\nJumlah penerima: <b>${users.length}</b>`;
  const keyboard = {
    inline_keyboard: [
      [
        callbackButton(Markup, "YA", "broadcast_confirm", "success"),
        callbackButton(Markup, "BATAL", "broadcast_cancel", "cancel"),
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

    // === 💬 CASE 4: Reply ke teks
    else if (reply?.text) {
      const args = ctx.message.text.split(" ").slice(1).join(" ").trim();
      message = args || reply.text || "";
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
        return ctx.reply("📩 Kirim /broadcast <pesan> atau reply ke teks/foto/video/stiker.");
      }
      message = args;
    }

    // --- Simpan session broadcast ---
    setBroadcastSession(ctx, {
      pending: true,
      message,
      fileId,
      fileType,
      users,
    });

    const keyboard = Markup.inlineKeyboard([
      [
        callbackButton(Markup, "Kirim Broadcast", "broadcast_confirm", "success"),
        callbackButton(Markup, "Batal", "broadcast_cancel", "cancel"),
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
    navButtons.push(callbackButton(Markup, "Sebelumnya", `adm_page_${userId}_${page - 1}`, "back"));
  if (page < totalPages)
    navButtons.push(callbackButton(Markup, "Selanjutnya", `adm_page_${userId}_${page + 1}`, "arrow_right"));

  await ctx.editMessageText(content, {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [navButtons] },
  });

  await ctx.answerCbQuery();
});

// === 💾 AUTO BACKUP TRANSACTIONS (auto-clean 30 hari) ===
if (!scope.skipLaunch) {
setInterval(async () => {
  try {
    const transactions = await loadTransactions();
    if (!transactions.length) return;

    const createdAt = new Date();

    if (isMongoEnabled()) {
      const db = await getDb();
      const backups = db.collection("transaction_backups");

      await backups.insertOne({
        createdAt,
        data: transactions,
      });

      console.log(`💾 Backup transaksi tersimpan di MongoDB: ${createdAt.toISOString()}`);

      // 🧹 Hapus backup yang lebih tua dari 30 hari
      const thirtyDaysAgo = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30);
      await backups.deleteMany({ createdAt: { $lt: thirtyDaysAgo } });
      return;
    }

    const backupPath = path.resolve("data/transaction_backups.json");
    const backups = await store.readJson(backupPath, []);
    const nextBackups = Array.isArray(backups) ? backups : [];
    nextBackups.push({ createdAt: createdAt.toISOString(), data: transactions });

    const thirtyDaysAgo = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30);
    const pruned = nextBackups.filter((entry) => {
      const ts = new Date(entry.createdAt);
      return ts >= thirtyDaysAgo;
    });

    await store.writeJson(backupPath, pruned);
    console.log(`💾 Backup transaksi tersimpan di file lokal: ${backupPath}`);
  } catch (err) {
    console.error("❌ Gagal backup transaksi:", err.message);
  }
}, 1000 * 60 * 60 * 12); // backup tiap 12 jam
}

  }
};
