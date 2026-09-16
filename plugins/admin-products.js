module.exports = function registerAdminProducts(scope) {
  with (scope) {
// === ♻️ AUTO SETTINGS RELOAD MIDDLEWARE ===
bot.use((ctx, next) => {
  try {
    delete require.cache[require.resolve("../settings")];
    global.settings = require("../settings");
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
    const stokFile = path.resolve("stok", `${code.toLowerCase()}.json`);

    // === Load produk yang sudah ada ===
    let products = await loadProducts();

    // === Cek duplikat berdasarkan code ===
    if (
      products.some(
        (p) => p.code && p.code.toLowerCase() === code.toLowerCase()
      )
    ) {
      return ctx.reply("⚠️ Produk dengan code tersebut sudah terdaftar!");
    }

    // === Buat file stok kosong jika belum ada ===
    if (!(await existsJson(stokFile))) await writeStockFile(stokFile, []);

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
    await saveProducts(products);

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

    const list = await loadProducts();
    if (!Array.isArray(list) || !list.length)
      return ctx.reply("⚠️ Daftar produk kosong.");

    list.sort((p, q) => String(p.name||"").localeCompare(String(q.name||""),
                      "id", { sensitivity: "base" }));

    await saveProducts(list);

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

  const products = await loadProducts();

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
            callbackButton(Markup, "YA, HAPUS", "confirm_delproduk_yes", "trash"),
            callbackButton(Markup, "BATAL", "confirm_delproduk_no", "cancel"),
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

    let products = await loadProducts();

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
    await saveProducts(products);

    // === 🧹 Sinkron hapus file stok ===
    const stokByCode = path.resolve("stok", `${deleted.code}.json`);
    const stokByName = path.resolve("stok", `${deleted.name}.json`);

    let stokDeleted = false;
    if (await existsJson(stokByCode)) {
      await deleteJson(stokByCode);
      stokDeleted = true;
      console.log(`🧹 File stok dihapus: ${stokByCode}`);
    } else if (await existsJson(stokByName)) {
      await deleteJson(stokByName);
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

  // Baca data produk
  let products = [];
  try {
    products = await loadProducts();
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
    await saveProducts(products);
  } catch (err) {
    console.error("❌ Gagal menyimpan data:", err);
    return ctx.reply("⚠️ Gagal menyimpan perubahan ke data.");
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

  // Baca data produk
  let products = [];
  try {
    products = await loadProducts();
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
    await saveProducts(products);
  } catch (err) {
    console.error("❌ Gagal menyimpan data:", err);
    return ctx.reply("⚠️ Gagal menyimpan perubahan ke data.");
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

  let products = [];
  try {
    products = await loadProducts();
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
    await saveProducts(products);
  } catch (err) {
    console.error("❌ Gagal menyimpan data:", err);
    return ctx.reply("⚠️ Gagal menyimpan perubahan ke data.");
  }

  // === Sinkron ke file stok/<code>.json
  const stokPath = path.resolve("stok", `${code.toLowerCase()}.json`);
  let stokUpdated = 0;
  let stokExists = await existsJson(stokPath);

  if (stokExists) {
    try {
      const stokData = await readStockFile(stokPath);
      stokData.forEach((item) => {
        if (item.varian && item.varian.toLowerCase() === oldVar.toLowerCase()) {
          item.varian = newVar;
          stokUpdated++;
        }
      });
      await writeStockFile(stokPath, stokData);
    } catch (err) {
      console.error("⚠️ Gagal memperbarui data stok:", err);
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

  // Baca data produk
  let products = [];
  try {
    products = await loadProducts();
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
    await saveProducts(products);
  } catch (err) {
    console.error("❌ Gagal menyimpan data:", err);
    return ctx.reply("⚠️ Gagal menyimpan perubahan ke data.");
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
  // Baca semua produk
  let products = [];
  try {
    products = await loadProducts();
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
    await saveProducts(products);
  } catch (err) {
    console.error("❌ Gagal menulis data:", err);
    return ctx.reply("⚠️ Gagal menyimpan perubahan ke data.");
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

  // === Load data produk ===
  let products = [];
  try {
    products = await loadProducts();
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
    await saveProducts(products);
  } catch (err) {
    console.error("❌ Gagal menyimpan data:", err);
    return ctx.reply("⚠️ Gagal menyimpan perubahan ke data.");
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

  // === Load produk ===
  let products = [];
  try {
    products = await loadProducts();
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
    await saveProducts(products);
  } catch (err) {
    console.error("❌ Gagal menyimpan data:", err);
    return ctx.reply("⚠️ Gagal menyimpan perubahan ke data.");
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

  // === Load file produk
  let products = [];
  try {
    products = await loadProducts();
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
    await saveProducts(products);
  } catch (err) {
    console.error("❌ Gagal menyimpan data:", err);
    return ctx.reply("⚠️ Gagal menyimpan perubahan ke data.");
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

    // 🔁 Load file produk (auto reload)
    const products = await loadProducts();

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

    // 💾 Simpan ulang ke data
    await saveProducts(products);

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
    setBroadcastSession(ctx, {
      pending: true,
      message,
      fileId,
      fileType,
      users,
    });

    // Tombol konfirmasi
    const keyboard = Markup.inlineKeyboard([
      [
        callbackButton(Markup, "Kirim Broadcast", "broadcast_confirm", "success"),
        callbackButton(Markup, "Batal", "broadcast_cancel", "cancel"),
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
    const stokFile = path.resolve("stok", `${code.toLowerCase()}.json`);

    // === Load produk lama ===
    let products = await loadProducts();

    // === Cek duplikat ===
    if (products.some(p => p.code.toLowerCase() === code.toLowerCase()))
      return ctx.reply("⚠️ Produk dengan kode tersebut sudah ada!");

    // === Buat file stok kosong ===
    if (!(await existsJson(stokFile))) await writeStockFile(stokFile, []);

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
    await saveProducts(products);

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

  }
};
