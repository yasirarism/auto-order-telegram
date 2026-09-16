module.exports = function registerTerms(scope) {
  with (scope) {
// === 📦 SETTINGS PATH (gabung total config + izin) ===
const settingsPath = path.resolve("settings.js");

// helper: normalisasi izin jadi boolean isPublic
function isCekSnkPublic(val) {
  // boolean langsung dipakai
  if (typeof val === "boolean") return val;

  const s = String(val || "").toLowerCase().trim();
  // mode admin only
  if (s === "false" || s.includes("admin") || s.includes("🔐")) return false;
  // mode publik
  if (s === "true" || s.includes("publik") || s.includes("semua") || s.includes("🌐")) return true;

  // default safety: anggap admin-only kalau nilainya aneh/kosong
  return false;
}

// === 📜 CEK S&K VARIAN PRODUK (ADMIN / USER SESUAI SETTINGS.JS) ===
bot.command("ceksnk", async (ctx) => {
  try {
    const path = require("path");

    // helper kecil
    const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const loadSettings = () => {
      const settingsPath = path.resolve("./settings.js");
      delete require.cache[require.resolve(settingsPath)];
      return require(settingsPath);
    };
    const isPublic = (settings) => Boolean(settings?.izin?.allowUserCekSnk === true);
    const isAdminId = (id, settings) => {
      const uid = String(id);
      return Boolean(settings?.admins?.some(a => String(a?.id) === uid));
    };

    const settings = loadSettings();
    const publicMode = isPublic(settings);

    // 🔐 kalau bukan public dan user bukan admin => tolak
    if (!publicMode && !isAdminId(ctx.from?.id, settings)) {
      return ctx.reply("🚫 Perintah ini hanya dapat digunakan oleh admin.");
    }

    // ambil argumen "/ceksnk <code>|<varian>"
    const input = (ctx.message?.text || "").split(" ").slice(1).join(" ").trim();
    if (!input || !input.includes("|")) {
      return ctx.reply("⚠️ Format salah!\nGunakan: /ceksnk <code>|<varian>");
    }

    const [rawCode, rawVarian] = input.split("|").map(s => s.trim());
    if (!rawCode || !rawVarian) {
      return ctx.reply("⚠️ Format tidak lengkap!\nContoh: /ceksnk am|Android");
    }

    let products;
    try {
      products = await loadProducts();
    } catch {
      return ctx.reply("❌ Gagal membaca products.json.");
    }

    // cari produk by code (case-insensitive)
    const code = rawCode.toLowerCase();
    const product = (products || []).find(p => String(p?.code || "").toLowerCase() === code);
    if (!product) {
      return ctx.reply(`❌ Produk dengan kode <b>${esc(rawCode)}</b> tidak ditemukan.`, { parse_mode: "HTML" });
    }

    // cari varian by name (case-insensitive)
    const vname = rawVarian.toLowerCase();
    const variant = (product.variants || []).find(v => String(v?.name || "").toLowerCase() === vname);
    if (!variant) {
      return ctx.reply(
        `❌ Varian <b>${esc(rawVarian)}</b> tidak ditemukan pada produk <b>${esc(product.name || "-")}</b>.`,
        { parse_mode: "HTML" }
      );
    }

    // kalau belum ada S&K
    if (!variant.snk || String(variant.snk).trim() === "") {
      return ctx.reply(
        [
          `ℹ️ <b>Tidak ada S&K yang tercatat.</b>`,
          ``,
          `🏷️ Kode Produk: <b>${esc(product.code)}</b>`,
          `📦 Produk: <b>${esc(product.name)}</b>`,
          `🧩 Varian: <b>${esc(variant.name)}</b>`,
          ``,
          `🕳️ Tambahkan S&K lewat perintah:`,
          `<code>/addsnk ${esc(product.code)}|${esc(variant.name)}|(isi_snk)</code>`,
        ].join("\n"),
        { parse_mode: "HTML" }
      );
    }

    // kirim S&K
    await ctx.reply(
      [
        `📜 <b>Syarat & Ketentuan Varian</b>`,
        ``,
        `🏷️ Kode Produk: <b>${esc(product.code)}</b>`,
        `📦 Produk: <b>${esc(product.name)}</b>`,
        `🧩 Varian: <b>${esc(variant.name)}</b>`,
        ``,
        `📄 <b>Isi S&K:</b>`,
        `<code>${esc(String(variant.snk))}</code>`,
        ``,
        `🧾 Sumber: <b>products.json</b> ✅`,
      ].join("\n"),
      { parse_mode: "HTML" }
    );

    // log kecil
    console.log(
      `📜 /ceksnk oleh ${ctx.from?.username || ctx.from?.id} (allowUserCekSnk=${Boolean(settings?.izin?.allowUserCekSnk)}, publicMode=${publicMode})`
    );
  } catch (err) {
    console.error("❌ Error di /ceksnk:", err);
    try { await ctx.reply("⚠️ Gagal menampilkan data S&K."); } catch {}
  }
});

// === ⚙️ TOGGLE IZIN CEK S&K (ADMIN ONLY, DENGAN BUTTON) ===
bot.command("izinsnk", async (ctx) => {
  try {
    const chatId = String(ctx.chat.id);
    if (!isAdminNow(ctx)) return ctx.reply("🚫 Kamu bukan admin.");

    delete require.cache[require.resolve("../settings")];
    const settings = require("../settings");

    const publicMode = isCekSnkPublic(settings?.izin?.allowUserCekSnk);
    const modeText = publicMode
      ? "🌐 <b>Publik (Semua User)</b>"
      : "🔐 <b>Hanya Admin</b>";

    await ctx.reply(
      [
        `⚙️ <b>Pengaturan Izin /ceksnk</b>`,
        ``,
        `🧩 Mode Sekarang: ${modeText}`,
        ``,
        `Pilih mode baru di bawah ini 👇`,
      ].join("\n"),
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              callbackButton(Markup, "ADMIN", "izinsnk_admin", "lock"),
              callbackButton(Markup, "SEMUA", "izinsnk_semua", "internet"),
            ],
          ],
        },
      }
    );
  } catch (err) {
    console.error("❌ Error di /izinsnk:", err);
    ctx.reply("⚠️ Terjadi kesalahan saat membuka pengaturan izin S&K.");
  }
});

// === 🟢 Handler tombol IZINSNK ===
bot.action(["izinsnk_admin", "izinsnk_semua"], async (ctx) => {
  try {
    const chatId = String(ctx.chat.id);
    if (!isAdmin(chatId)) return ctx.answerCbQuery("🚫 Hanya admin!");

    delete require.cache[require.resolve("../settings")];
    const settings = require("../settings");

    // true = publik, false = admin-only
    const isPublic = ctx.match[0] === "izinsnk_semua";
    settings.izin = settings.izin || {};
    settings.izin.allowUserCekSnk = isPublic; // SIMPAN SEBAGAI BOOLEAN!

    fs.writeFileSync(
      settingsPath,
      `module.exports = ${JSON.stringify(settings, null, 2)};\n`,
      "utf8"
    );

    const modeText = isPublic
      ? "🌐 <b>Publik (Semua User)</b>"
      : "🔐 <b>Hanya Admin</b>";

    await ctx.editMessageText(
      [
        `⚙️ <b>Izin /ceksnk Diperbarui!</b>`,
        ``,
        `🧩 Mode Sekarang: ${modeText}`,
        ``,
        isPublic
          ? "✅ Sekarang <b>user biasa</b> bisa menggunakan /ceksnk."
          : "🔒 Sekarang hanya <b>admin</b> yang bisa menggunakan /ceksnk.",
      ].join("\n"),
      { parse_mode: "HTML" }
    );

    console.log(
      `🔧 Izin /ceksnk diubah oleh ${ctx.from.first_name} (${ctx.from.id}): ${isPublic ? "PUBLIC" : "ADMIN ONLY"}`
    );

    await ctx.answerCbQuery("✅ Pengaturan diperbarui!");
  } catch (err) {
    console.error("❌ Error di handler tombol izinsnk:", err);
    ctx.answerCbQuery("⚠️ Gagal memperbarui izin!");
  }
});

  }
};
