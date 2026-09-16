module.exports = function registerAdminStock(scope) {
  with (scope) {
// === 📄 HANDLER ADDSTOK (MULTI EMAIL + DUPLIKAT TAMPIL + COPYABLE + AUTO NUMBER) ===
bot.command("addstok", async (ctx) => {
  try {
    if (!isAdmin(ctx.from.id)) return ctx.reply("🚫 Kamu bukan admin.");
    if (!isAdminNow(ctx)) return ctx.reply("🚫 Kamu bukan admin.");

    const args = ctx.message.text.split(" ").slice(1).join(" ");
    if (!args.includes("|"))
      return ctx.reply(
        "⚙️ Format salah!\nGunakan format:\n/addstok code|varian|email|pass|pesan(optional)|email|pass|pesan(optional)|..."
      );

    const rawLines = args
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const isMultiline = rawLines.length > 1;

    const parseLineParts = (line) => {
      const parts = line.split("|").map((x) => x.trim());
      while (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
      return parts;
    };

    let code = null;
    let inputVarian = null;
    let entries = [];

    if (isMultiline) {
      for (let idx = 0; idx < rawLines.length; idx++) {
        const parts = parseLineParts(rawLines[idx]);
        if (parts.length >= 4) {
          if (!code) code = parts[0];
          if (!inputVarian) inputVarian = parts[1];
          entries.push({
            email: parts[2],
            password: parts[3],
            extra: parts[4] || "",
          });
        } else if (parts.length >= 2 && code && inputVarian) {
          entries.push({
            email: parts[0],
            password: parts[1],
            extra: parts[2] || "",
          });
        } else {
          return ctx.reply(
            "⚠️ Format salah!\nGunakan tiap baris:\ncode|varian|email|pass|pesan(optional)\natau\nemail|pass|pesan(optional) (pakai kode & varian dari baris pertama)."
          );
        }
      }
    } else {
      const parts = parseLineParts(args);
      code = parts[0];
      inputVarian = parts[1];
      const credentials = parts.slice(2);

      if (!code || !inputVarian || credentials.length < 2)
        return ctx.reply(
          "⚠️ Format kurang lengkap!\nGunakan: /addstok code|varian|email|pass|pesan(optional)|email|pass|pesan(optional)|..."
        );

      let chunkSize = null;
      if (credentials.length % 3 === 0) chunkSize = 3;
      else if (credentials.length % 2 === 0) chunkSize = 2;
      if (!chunkSize)
        return ctx.reply(
          "⚠️ Format stok tidak valid!\nGunakan pasangan email|password atau email|password|pesan (opsional)."
        );

      for (let i = 0; i < credentials.length; i += chunkSize) {
        entries.push({
          email: credentials[i],
          password: credentials[i + 1],
          extra: chunkSize === 3 ? credentials[i + 2] : "",
        });
      }
    }

    // === Path file ===
    const stokFile = path.resolve("stok", `${code.toLowerCase()}.json`);

    // === Load produk ===
    const products = await loadProducts();
    if (!products.length) return ctx.reply("⚠️ Produk belum tersedia.");
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
    const stokList = await readStockFile(stokFile);

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

    const formatEntry = (idx, email, password, extra) => {
      const extraText = extra ? ` | ${extra}` : "";
      return `${idx}. ${email} | ${password}${extraText}`;
    };

    for (const entry of entries) {
      const email = entry.email;
      const password = entry.password;
      const extraRaw = entry.extra || "";
      const extra = extraRaw && extraRaw !== "-" ? extraRaw : "";
      if (!email || !password) continue;

      const duplicate = stokList.find(
        (s) => s.email.toLowerCase() === email.toLowerCase()
      );
      if (duplicate) {
        skippedCount++;
        duplicateEntries.push(`❌ ${formatEntry(skippedCount, email, password, extra)}`);
        continue;
      }

      lastCount++;
      const newEntry = {
        emailCount: String(lastCount),
        varian: realVarianName,
        email,
        password,
        twofa: extra,
        addedAt: new Date().toISOString(),
      };

      stokList.push(newEntry);
      addedCount++;
      addedEntries.push(`🆕 ${formatEntry(addedCount, email, password, extra)}`);
    }

    // Simpan stok baru
    await writeStockFile(stokFile, stokList);

    // === Update stok di products.json ===
    const totalForThisVarian = stokList.filter(
      (s) => s.varian && s.varian.toLowerCase() === realVarianName.toLowerCase()
    ).length;
    targetVarian.stock = totalForThisVarian;
    await saveProducts(products);

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

      // 4. Parsing isi notepad (asumsi isi: email|pass|pesan per baris atau email:pass:pesan)
      const entries = fileContent
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map((line) => {
          const parts = line.split(/[|:]/).map(part => part.trim()).filter(Boolean);
          if (parts.length < 2) return null;
          const [email, password, ...rest] = parts;
          const extra = rest.join("|").trim();
          return { email, password, twofa: extra };
        })
        .filter(Boolean);

      if (entries.length === 0) {
        return ctx.reply("❌ Isi file notepad kosong atau format salah. Pastikan isi perbaris: `email|password` atau `email|password|pesan`.");
      }

      // 5. Gunakan Logic yang sama dengan /addstok teks
      const stokFile = path.resolve("stok", `${code.toLowerCase()}.json`);

      let products = await loadProducts();
      const product = products.find(p => p.code?.toLowerCase() === code.toLowerCase());

      if (!product) return ctx.reply(`⚠️ Produk "${code}" tidak ditemukan.`);
      
      const targetVarian = product.variants.find(v => v.name.toLowerCase() === inputVarian.toLowerCase());
      if (!targetVarian) return ctx.reply(`⚠️ Varian "${inputVarian}" tidak ditemukan.`);

      let stokList = await readStockFile(stokFile);

      let lastCount = stokList.length > 0 ? parseInt(stokList[stokList.length - 1].emailCount || "0") : 0;
      let addedCount = 0;
      let skippedCount = 0;

      for (const entry of entries) {
        const email = entry.email;
        const password = entry.password;
        const extra = entry.twofa || "";
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
          twofa: extra,
          addedAt: new Date().toISOString()
        });
        addedCount++;
      }

      // 6. Simpan Hasil
      await writeStockFile(stokFile, stokList);
      targetVarian.stock = stokList.filter(s => s.varian === targetVarian.name).length;
      await saveProducts(products);

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
    const stokFile     = path.join(process.cwd(), "stok", `${code.toLowerCase()}.json`);

    if (!(await existsJson(stokFile)))
      return ctx.reply(`⚠️ File stok untuk kode "${code}" tidak ditemukan!`);

    // === Baca produk dari database ===
    const products = await loadProducts();
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
    const stokList = await readStockFile(stokFile);
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

    await writeStockFile(stokFile, newStokList);

    // === Update stok di products.json ===
    const newVarianCount = newStokList.filter(
      (s) => s.varian && s.varian.toLowerCase() === varianName.toLowerCase()
    ).length;

    targetVarian.stock = newVarianCount;
    await saveProducts(products);

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


  }
};
