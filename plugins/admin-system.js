module.exports = function registerAdminSystem(scope) {
  with (scope) {
// === 🧠 ADMIN SYSTEM (LOAD FROM settings.js) ===
delete require.cache[require.resolve("../settings")];
let settings = require("../settings");

// === 🔍 Fungsi bantu — Cek Admin ===
function isAdmin(chatId) {
  const idStr = String(chatId);
  return settings.admins.some(
    (a) => String(a.id) === idStr || (a.username && a.username.toLowerCase() === idStr.toLowerCase())
  );
}

// === 🆔 /akusiapa — Cek ID, Username, dan Status Admin ===
bot.command(["akusiapa", "whoami"], async (ctx) => {
  try {
    const user = ctx.from;

    // 🔁 Ambil data admin terbaru dari settings.js (auto-reload)
    delete require.cache[require.resolve("../settings")];
    const settings = require("../settings");

    const id = String(user.id);
    const username = String(user.username || "").toLowerCase();

    // 🧠 Deteksi apakah user adalah admin aktif
    const isAdmin =
      settings.admins &&
      settings.admins.some(
        (a) =>
          a.id === id ||
          (a.username && a.username.toLowerCase() === username)
      );

    const role = isAdmin ? "KAMU ADALAH ADMIN <b>👑 KING 👑</b>" : "Kamu adalah <b>👤Buyer Tercinta👤</b>";

    const info = [
      `🧾 <b>Informasi Akun Kamu</b>`,
      ``,
      `👤 <b>Nama:</b> ${user.first_name || "-"} ${user.last_name || ""}`,
      `🏷️ <b>Username:</b> ${user.username ? "@" + user.username : "(tidak ada)"}`,
      `🆔 <b>ID:</b> ${user.id}`,
      ``,
      `🔰 <b>Status:</b>`,
      `${role}`,
      ``,
      `📎 Gunakan ID ini jika ingin menambahkan akun sebagai admin.`,
    ].join("\n");

    await ctx.reply(info, { parse_mode: "HTML" });
  } catch (err) {
    console.error("❌ Error di /akusiapa:", err);
    ctx.reply("⚠️ Gagal memuat informasi akun kamu.");
  }
});

// === 📋 /adminlist — Lihat daftar admin ===
bot.command("adminlist", async (ctx) => {
  const chatId = String(ctx.chat.id);
  if (!isAdminNow(ctx)) return ctx.reply("🚫 Kamu bukan admin.");

  if (!settings.admins.length) {
    return ctx.reply("📭 Belum ada admin yang terdaftar.");
  }

  const list = settings.admins
    .map(
      (a, i) =>
        `${i + 1}. 👑 <b>${a.username ? "@" + a.username : "(tanpa username)"} (${a.id})</b>`
    )
    .join("\n");

  ctx.reply(
    [
      `👑 <b>DAFTAR ADMIN TERDAFTAR (${settings.admins.length})</b>`,
      ``,
      list,
      ``,
      `🧾 File: <code>settings.js</code>`,
    ].join("\n"),
    { parse_mode: "HTML" }
  );
});

// === ➕ /addadmin — Tambah admin baru (fix & lengkap) ===
bot.command("addadmin", async (ctx) => {
  try {
    const path = require("path");
    const fs = require("fs");

    if (!isAdminNow(ctx)) return ctx.reply("🚫 Kamu bukan admin.");

    const args = (ctx.message?.text || "").split(" ").slice(1);
    if (!args.length) {
      return ctx.reply("⚙️ Format: /addadmin <id atau @username>");
    }

    const raw = String(args[0]).trim();
    const identifier = raw.replace(/^@/, ""); // buang '@' kalau ada

    // 🔁 loader & saver settings.js (realtime)
    const settingsPath = path.resolve("./settings.js");
    const loadSettings = () => {
      delete require.cache[require.resolve(settingsPath)];
      return require(settingsPath);
    };
    const saveSettings = (data) => {
      // pastikan minimal struktur dasar ada
      if (!Array.isArray(data.admins)) data.admins = [];
      if (!data.izin || typeof data.izin !== "object") data.izin = { allowUserCekSnk: false };
      const text = "module.exports = " + JSON.stringify(data, null, 2) + ";\n";
      fs.writeFileSync(settingsPath, text, "utf8");
    };

    const settings = loadSettings();

    // helper cek duplikat
    const findAdminIndex = (pred) => settings.admins.findIndex(pred);
    const isNumericId = /^\d+$/.test(identifier);

    // 🔎 resolve id/username sejauh yang bisa
    let resolved = { id: null, username: null };
    if (isNumericId) {
      // kalau ID angka → coba getChat untuk ambil username (bisa null kalau user gak punya @username)
      resolved.id = identifier;
      try {
        const info = await ctx.telegram.getChat(identifier);
        resolved.username = info?.username ?? null;
      } catch {
        // kalau gagal (user belum pernah chat ke bot), tetap simpan ID-nya
        resolved.username = null;
      }
    } else {
      // input berupa username
      resolved.username = identifier;
      // Bot API tidak bisa resolve username → id akan terisi kalau suatu saat mau di-sync
      // Kalau yang ditambah adalah diri kita sendiri dan username cocok, isi id dari ctx
      if (String(ctx.from?.username || "").toLowerCase() === identifier.toLowerCase()) {
        resolved.id = String(ctx.from.id);
      }
    }

    // 🚫 Cek duplikat berdasarkan id atau username (case-insensitive)
    const dupById = resolved.id
      ? findAdminIndex((a) => String(a.id) === String(resolved.id))
      : -1;
    const dupByUname = resolved.username
      ? findAdminIndex(
          (a) =>
            a.username &&
            String(a.username).toLowerCase() === String(resolved.username).toLowerCase()
        )
      : -1;

    if (dupById >= 0 || dupByUname >= 0) {
      // update entri lama biar lengkap (misal sebelumnya username null)
      const idx = dupById >= 0 ? dupById : dupByUname;
      const prev = settings.admins[idx] || {};
      settings.admins[idx] = {
        id: String(resolved.id ?? prev.id ?? ""),
        username: resolved.username ?? prev.username ?? null,
      };
      saveSettings(settings);

      return ctx.reply(
        [
          "ℹ️ Admin sudah terdaftar. Data diperbarui:",
          "",
          `👤 ${settings.admins[idx].username ? "@" + settings.admins[idx].username : "(tanpa username)"}`,
          `🆔 ${settings.admins[idx].id || "(belum diketahui)"}`,
          "",
          "🧾 Disimpan ke settings.js ✅",
        ].join("\n"),
        { parse_mode: "HTML" }
      );
    }

    // ➕ Tambah admin baru
    settings.admins.push({
      id: resolved.id ? String(resolved.id) : null,
      username: resolved.username ?? null,
    });
    saveSettings(settings);

    return ctx.reply(
      [
        "✅ <b>Admin baru berhasil ditambahkan!</b>",
        "",
        `👤 <b>${resolved.username ? "@" + resolved.username : "(tanpa username)"}</b>`,
        `🆔 <b>${resolved.id || "(belum diketahui)"}</b>`,
        "",
        "🧾 Disimpan ke <code>settings.js</code> ✅",
        resolved.id
          ? ""
          : "ℹ️ Catatan: ID belum diketahui. Minta user tsb kirim /start ke bot agar ID dapat tersimpan.",
      ]
        .filter(Boolean)
        .join("\n"),
      { parse_mode: "HTML" }
    );
  } catch (err) {
    console.error("❌ Error di /addadmin:", err);
    try {
      await ctx.reply("❌ Gagal menambahkan admin.");
    } catch {}
  }
});


// === ❌ /deladmin — Hapus admin ===
bot.command("deladmin", async (ctx) => {
  const chatId = String(ctx.chat.id);
  if (!isAdminNow(ctx)) return ctx.reply("🚫 Kamu bukan admin.");

  const args = ctx.message.text.split(" ").slice(1);
  if (args.length === 0)
    return ctx.reply("⚙️ Format: /deladmin <id atau @username>");

  const identifier = args[0].replace("@", "").trim();

  delete require.cache[require.resolve("../settings")];
  const settings = require("../settings");

  const index = settings.admins.findIndex(
    (a) =>
      a.id === identifier ||
      (a.username && a.username.toLowerCase() === identifier.toLowerCase())
  );
  if (index === -1) return ctx.reply("❌ Admin tidak ditemukan.");

  const removed = settings.admins.splice(index, 1)[0];

  fs.writeFileSync(
    settingsPath,
    `module.exports = ${JSON.stringify(settings, null, 2)};\n`,
    "utf8"
  );

  ctx.reply(
    [
      `🗑️ <b>Admin berhasil dihapus!</b>`,
      ``,
      `👤 <b>${removed.username ? "@" + removed.username : "(tanpa username)"}</b>`,
      `🆔 <b>${removed.id || "(tidak diketahui)"}</b>`,
      ``,
      `🧾 Disimpan ke <code>settings.js</code> ✅`,
    ].join("\n"),
    { parse_mode: "HTML" }
  );

  console.log(`🗑️ Admin dihapus: ${identifier}`);
});

// === 🧩 AUTO-UPDATE ADMIN ID (ketika admin baru kirim pesan) ===
bot.on("message", async (ctx, next) => {
  try {
    delete require.cache[require.resolve("../settings")];
    const settings = require("../settings");

    const user = ctx.from;
    const admins = settings.admins || [];

    // cari admin yang punya username tapi belum punya ID
    const target = admins.find(
      (a) =>
        a.username &&
        user.username &&
        a.username.toLowerCase() === user.username.toLowerCase() &&
        (!a.id || a.id === "null" || a.id === "")
    );

    if (target) {
      target.id = String(user.id);

      fs.writeFileSync(
        path.resolve("settings.js"),
        `module.exports = ${JSON.stringify(settings, null, 2)};\n`,
        "utf8"
      );

      console.log(
        `🔄 Auto-update ID admin: @${user.username} → ${user.id}`
      );

      await ctx.reply(
        `✅ Halo <b>@${user.username}</b>!\nID kamu <code>${user.id}</code> berhasil disinkronkan sebagai admin.`,
        { parse_mode: "HTML" }
      );
    }
  } catch (err) {
    console.error("❌ Gagal auto-update ID admin:", err);
  }

  next();
});

// === 📦 /cekcode — Lihat seluruh code & nama produk (ADMIN ONLY + pagination) ===
bot.command("cekcode", async (ctx) => {
  try {
    const fs = require("fs");
    const path = require("path");

    const esc = (s) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const loadSettings = () => {
      const settingsPath = path.resolve("./settings.js");
      delete require.cache[require.resolve(settingsPath)];
      return require(settingsPath);
    };
    const isAdminId = (id, settings) =>
      Boolean(settings?.admins?.some(a => String(a?.id) === String(id)));

    const settings = loadSettings();
    if (!isAdminId(ctx.from?.id, settings)) return ctx.reply("🚫 Kamu bukan admin.");

    let products;
    try { products = await loadProducts(); }
    catch { return ctx.reply("⚠️ Gagal membaca products.json."); }

    if (!Array.isArray(products) || products.length === 0) {
      return ctx.reply("📭 Belum ada produk yang terdaftar.");
    }

    const perPage = 10;
    const totalPages = Math.ceil(products.length / perPage);

    const renderPage = async (page = 1) => {
      const start = (page - 1) * perPage;
      const end = start + perPage;
      const slice = products.slice(start, end);
      const displayed = Math.min(page * perPage, products.length);

      const content = [
        `📦 <b>DAFTAR KODE PRODUK (${page}/${totalPages})</b>`,
        ``,
        ...slice.map(
          (p, i) => `${start + i + 1}. <b>Kode:</b> <code>${esc(p.code)}</code> — ${esc(p.name || "(tanpa nama)")}`
        ),
        ``,
        `📜 Menampilkan <b>${displayed}/${products.length}</b> kode produk.`,
        `💡 Digunakan Untuk Seluruh Command Admin`,
      ].join("\n");

      const navButtons = [];
      if (page > 1) navButtons.push(callbackButton(Markup, "Sebelumnya", `cekcode:${page - 1}`, "back"));
      if (page < totalPages) navButtons.push(callbackButton(Markup, "Selanjutnya", `cekcode:${page + 1}`, "arrow_right"));

      const markup = { inline_keyboard: [navButtons] };
      return { content, markup };
    };

    const { content, markup } = await renderPage(1);
    await ctx.reply(content, { parse_mode: "HTML", reply_markup: markup });
  } catch (err) {
    console.error("❌ Error di /cekcode:", err);
    try { await ctx.reply("⚠️ Gagal menampilkan daftar code produk."); } catch {}
  }
});

// === 🔁 Handler Pagination /cekcode ===
bot.action(/cekcode:(\d+)/, async (ctx) => {
  try {
    const path = require("path");

    const esc = (s) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const loadSettings = () => {
      const settingsPath = path.resolve("./settings.js");
      delete require.cache[require.resolve(settingsPath)];
      return require(settingsPath);
    };
    const isAdminId = (id, settings) =>
      Boolean(settings?.admins?.some(a => String(a?.id) === String(id)));

    const settings = loadSettings();
    if (!isAdminId(ctx.from?.id, settings)) return ctx.answerCbQuery("🚫 Hanya admin!");

    const page = parseInt(ctx.match[1], 10) || 1;

    let products;
    try { products = await loadProducts(); }
    catch { return ctx.answerCbQuery("⚠️ Gagal membaca file data."); }

    const perPage = 10;
    const totalPages = Math.ceil(products.length / perPage);

    const start = (page - 1) * perPage;
    const end = start + perPage;
    const slice = products.slice(start, end);
    const displayed = Math.min(page * perPage, products.length);

    const content = [
      `📦 <b>DAFTAR KODE PRODUK (${page}/${totalPages})</b>`,
      ``,
      ...slice.map(
        (p, i) => `${start + i + 1}. <b>Kode:</b> <code>${esc(p.code)}</code> — ${esc(p.name || "(tanpa nama)")}`
      ),
      ``,
      `📜 Menampilkan <b>${displayed}/${products.length}</b> kode produk.`,
      `💡 Digunakan Untuk Seluruh Command Admin`,
    ].join("\n");

    const navButtons = [];
    if (page > 1) navButtons.push(callbackButton(Markup, "Sebelumnya", `cekcode:${page - 1}`, "back"));
    if (page < totalPages) navButtons.push(callbackButton(Markup, "Selanjutnya", `cekcode:${page + 1}`, "arrow_right"));

    const markup = { inline_keyboard: [navButtons] };

    await ctx.editMessageText(content, { parse_mode: "HTML", reply_markup: markup });
    await ctx.answerCbQuery();
  } catch (err) {
    console.error("❌ Error di pagination /cekcode:", err);
    try { await ctx.answerCbQuery("⚠️ Gagal memuat halaman!"); } catch {}
  }
});

// === 📦 /cekstok — Lihat seluruh stok produk (PUBLIC + emoji status + tombol 🔄 Refresh + timestamp) ===
bot.command("cekstok", async (ctx) => {
  try {
    const products = await loadProducts();
    if (!products.length) {
      return ctx.reply("📭 Belum ada produk yang terdaftar.");
    }

    // 🕒 waktu sekarang (Asia/Jakarta)
    const now = dayjs().tz("Asia/Jakarta").format("DD MMM YYYY HH:mm [WIB]");

    const list = products
      .map((p, i) => {
        const totalStock = (p.variants || []).reduce(
          (sum, v) => sum + (v.stock || 0),
          0
        );
        const totalVarian = (p.variants || []).length;
        const status = totalStock > 0 ? ce('success', '✅') : ce('cancel', '❌');
        return `${i + 1}. ${esc(p.name || "(tanpa nama)")}\n   ${status} Total Stok: <b>${totalStock}</b> (${totalVarian} varian)`;
      })
      .join("\n\n");

    const tableRows = products.map((p, i) => {
      const totalStock = (p.variants || []).reduce((sum, v) => sum + (v.stock || 0), 0);
      const totalVarian = (p.variants || []).length;
      return [String(i + 1), esc(p.name || '-'), String(totalStock), `${totalVarian} varian`];
    });
    const tableHtml = richTable(['No', 'Produk', 'Stok', 'Varian'], tableRows);

    const content = [
      `<h2>Daftar Stok Produk</h2>`,
      tableHtml,
      `${ce('order', '📜')} Total Produk: <b>${products.length}</b>`,
      `${ce('soon', '⏱️')} Diperbarui: <b>${now}</b>`,
    ].join("\n");

    const markup = {
      inline_keyboard: [[callbackButton(Markup, "Refresh", "cekstok_refresh", "refresh")]],
    };

    await sendMessageSafe(bot, ctx.chat.id, content, { reply_markup: markup });
  } catch (err) {
    console.error("❌ Error di /cekstok:", err);
    ctx.reply("⚠️ Gagal menampilkan daftar stok produk.");
  }
});

// === 🔁 Handler tombol 🔄 Refresh /cekstok ===
bot.action("cekstok_refresh", async (ctx) => {
  try {
    const products = await loadProducts();
    if (!products.length) {
      await ctx.editMessageText("📭 Belum ada produk yang terdaftar.");
      return ctx.answerCbQuery("Daftar kosong, tidak ada yang di-refresh.");
    }

    // 🕒 timestamp baru
    const now = dayjs().tz("Asia/Jakarta").format("DD MMM YYYY HH:mm [WIB]");

    const list = products
      .map((p, i) => {
        const totalStock = (p.variants || []).reduce(
          (sum, v) => sum + (v.stock || 0),
          0
        );
        const totalVarian = (p.variants || []).length;
        const status = totalStock > 0 ? ce('success', '✅') : ce('cancel', '❌');
        return `${i + 1}. ${esc(p.name || "(tanpa nama)")}\n   ${status} Total Stok: <b>${totalStock}</b> (${totalVarian} varian)`;
      })
      .join("\n\n");

    const tableRows = products.map((p, i) => {
      const totalStock = (p.variants || []).reduce((sum, v) => sum + (v.stock || 0), 0);
      const totalVarian = (p.variants || []).length;
      return [String(i + 1), esc(p.name || '-'), String(totalStock), `${totalVarian} varian`];
    });
    const tableHtml = richTable(['No', 'Produk', 'Stok', 'Varian'], tableRows);

    const content = [
      `<h2>Daftar Stok Produk</h2>`,
      tableHtml,
      `${ce('order', '📜')} Total Produk: <b>${products.length}</b>`,
      `${ce('soon', '⏱️')} Diperbarui: <b>${now}</b>`,
    ].join("\n");

    const markup = {
      inline_keyboard: [[callbackButton(Markup, "Refresh", "cekstok_refresh", "refresh")]],
    };

    const richPayload = {
      chat_id: ctx.chat.id,
      message_id: ctx.callbackQuery.message.message_id,
      rich_message: { html: toRichHtml(content) },
      reply_markup: markup,
    };
    try {
      await ctx.telegram.callApi("editMessageText", richPayload);
    } catch (editErr) {
      console.error("❌ Rich refresh cekstok gagal:", editErr.description || editErr.message);
      const replacement = await ctx.telegram.callApi("sendRichMessage", {
        chat_id: ctx.chat.id,
        rich_message: { html: toRichHtml(content) },
        reply_markup: markup,
      });
      if (replacement?.message_id) {
        try { await ctx.telegram.deleteMessage(ctx.chat.id, ctx.callbackQuery.message.message_id); } catch {}
      } else {
        throw editErr;
      }
    }
    await ctx.answerCbQuery("♻️ Diperbarui!");
  } catch (err) {
    console.error("❌ Error di cekstok_refresh:", err);
    await ctx.answerCbQuery("⚠️ Gagal refresh data stok!");
  }
});

  }
};
