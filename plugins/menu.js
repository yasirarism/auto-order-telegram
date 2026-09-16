module.exports = function registerMenu(scope) {
  with (scope) {
// === 🧾 MENU LIST PRODUK (Page 1 / 1 + efek loading bar animasi fix) ===
bot.hears(/^(?:🧾\s*)?List Produk$/i, async (ctx) => {
  ctx.session = ctx.session || {};
  ctx.session.flashSale = false;
  const chatId = String(ctx.chat.id);
  const db = await loadDB();
  const me = db.users[chatId] || { balance: 0 };

  // 🌀 Kirim pesan awal (loading 0%)
  const loadingMsg = await ctx.reply('🔄 Loading [░░░░░░░░░░] 0%');

  const totalSteps = 10;
  let progress = 0;

  const interval = setInterval(async () => {
    if (progress >= totalSteps) return;

    progress++;
    const filled = '▒'.repeat(progress);
    const empty = '░'.repeat(Math.max(totalSteps - progress, 0));
    const percent = Math.min(Math.floor((progress / totalSteps) * 100), 100);

    const emojis = ['🔄', '⚙️', '🌀', '💫', '♻️'];
    const emoji = emojis[progress % emojis.length];

    try {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        loadingMsg.message_id,
        null,
        `${emoji} Loading [${filled}${empty}] ${percent}%`
      );
    } catch { }
    if (progress >= totalSteps) clearInterval(interval);
  }, 250);

  await new Promise((resolve) => setTimeout(resolve, 250 * (totalSteps + 1)));

  try { await ctx.deleteMessage(loadingMsg.message_id); } catch { }

  const bannerPath = INFO_BANNER_PATH;

  // 🔄 AUTO LOAD PRODUK DARI DATABASE
  let products = [];
  try {
    products = await loadProducts();
  } catch (err) {
    console.error("❌ Gagal membaca products:", err);
  }

  const flashSales = await loadFlashSales();
  const now = nowTZ();

  const listText = [
    `<b>${ce('product', '📦')} LIST PRODUK</b>`,
    `<i>page 1 / 1</i>`,
    `━━━━━━━━━━━━━━━━━━━`,
    ...products.map((p) => {
      const badge = getProductFlashSaleBadge(flashSales, p, now);
      const badgeText = badge ? ` — 🔥 ${badge}` : "";
      return `${ce('product', '📦')} [${p.id}] ${String(p.name || "-").toUpperCase()}${badgeText}`;
    }),
    `━━━━━━━━━━━━━━━━━━━`,
    `This bot is proudly created by\n© ${STORE_NICKNAME} 2025`
  ].join('\n');

// 🧮 Generate keyboard dinamis sesuai jumlah produk
const productButtons = products.map((p) => String(p.id));
const rows = [];
for (let i = 0; i < productButtons.length; i += 6) {
  rows.push(productButtons.slice(i, i + 6));
}

// 🎛️ Keyboard utama
const keyboard = Markup.keyboard([
  [keyboardButton('List Produk', 'product'), keyboardButton('Flash Sale', 'fire')],
  [keyboardButton('Stock', 'product'), keyboardButton(saldoLabel(me.balance), 'money')],
  ...rows,
  [keyboardButton('Riwayat Transaksi', 'order')]
]).resize();

if (fs.existsSync(bannerPath)) {
  await ctx.replyWithPhoto(
    { source: bannerPath },
    { caption: listText, parse_mode: 'HTML', ...keyboard }
  );
  } else {
    await ctx.reply(listText, { parse_mode: 'HTML', ...keyboard });
  }
});

// === 🔥 FLASH SALE MENU ===
bot.hears(/^(?:🔥\s*)?Flash Sale$/i, async (ctx) => {
  ctx.session = ctx.session || {};
  const chatId = String(ctx.chat.id);
  const db = await loadDB();
  const me = db.users[chatId] || { balance: 0 };

  const bannerPath = INFO_BANNER_PATH;
  let products = [];
  try {
    products = await loadProducts();
  } catch (err) {
    console.error("❌ Gagal membaca products:", err);
  }

  const flashSales = await loadFlashSales();
  const now = nowTZ();
  const flashSaleProducts = products.filter((product) =>
    Boolean(getProductFlashSaleBadge(flashSales, product, now))
  );

  if (!flashSaleProducts.length) {
    ctx.session.flashSale = false;
    return ctx.reply("⚠️ Flash Sale belum aktif saat ini.");
  }

  const listText = [
    `<b>${ce('fire', '🔥')} FLASH SALE</b>`,
    `━━━━━━━━━━━━━━━━━━━`,
    ...flashSaleProducts.map((p) => {
      const badge = getProductFlashSaleBadge(flashSales, p, now);
      const badgeText = badge ? ` — 🔥 ${badge}` : "";
      return `[${p.id}] ${p.name?.toUpperCase?.() || '-'}${badgeText}`;
    }),
    `━━━━━━━━━━━━━━━━━━━`,
    `Pilih nomor produk untuk melihat detail promo.`
  ].join('\n');

  const productButtons = flashSaleProducts.map((p) => String(p.id));
  const rows = [];
  for (let i = 0; i < productButtons.length; i += 6) {
    rows.push(productButtons.slice(i, i + 6));
  }

  const keyboard = Markup.keyboard([
    [keyboardButton('List Produk', 'product'), keyboardButton('Flash Sale', 'fire')],
    [keyboardButton('Stock', 'product'), keyboardButton(saldoLabel(me.balance), 'money')],
    ...rows,
    [keyboardButton('Riwayat Transaksi', 'order')]
  ]).resize();

  if (fs.existsSync(bannerPath)) {
    await ctx.replyWithPhoto(
      { source: bannerPath },
      { caption: listText, parse_mode: 'HTML', ...keyboard }
    );
  } else {
    await ctx.reply(listText, { parse_mode: 'HTML', ...keyboard });
  }
});

// === 💰 SALDO & TOPUP ===
bot.hears(/^(?:💰\s*)?Saldo(?::\s*Rp\s*[\d.]+)?$/i, async (ctx) => {
  try {
    const chatId = String(ctx.chat.id);
    const db = await loadDB();
    const me = db.users[chatId] || { balance: 0 };
    const now = dayjs().tz().format("HH.mm.ss [WIB]");

    const text = [
      `<b>💰 INFO SALDO</b>`,
      `╭──────────────────────╮`,
      `├ <b>User:</b> ${esc(me.first_name || me.username || "Pengguna")}`,
      `├ <b>Sisa Saldo:</b> Rp ${rupiah(me.balance || 0)}`,
      `╰──────────────────────╯`,
      ``,
      `Pilih menu di bawah untuk isi saldo/topup.`,
      ``,
      `🔄 <i>Refresh at ${now}</i>`,
    ].join("\n");

    const keyboard = Markup.inlineKeyboard([
      [callbackButton(Markup, "Isi Saldo / Topup", "saldo_topup", "money")],
    ]);

    await ctx.reply(text, { parse_mode: "HTML", ...keyboard });
  } catch (err) {
    console.error("❌ Error saldo menu:", err);
    await ctx.reply("❌ Gagal menampilkan saldo.");
  }
});

bot.action("saldo_topup", async (ctx) => {
  try {
    const settings = getSettings();
    const admins = settings.admins || [];
    const adminLines = admins.length
      ? admins.map((a) => {
          const name = a.username ? `@${a.username}` : (a.id ? a.id : "-");
          return `• ${name}`;
        })
      : ["• (admin belum diset di settings.js)"];

    const text = [
      `<b>📥 ISI SALDO / TOPUP</b>`,
      ``,
      `Silakan hubungi admin untuk isi saldo manual.`,
      ``,
      `<b>Kontak Admin:</b>`,
      ...adminLines,
    ].join("\n");

    const adminWithUsername = admins.find((a) => a.username);
    const keyboard = adminWithUsername
      ? Markup.inlineKeyboard([
          [urlButton(Markup, "Hubungi Admin", `https://t.me/${adminWithUsername.username}`, "chat")],
        ])
      : undefined;

    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      ...(keyboard ? keyboard : {}),
    });
    await ctx.answerCbQuery();
  } catch (err) {
    console.error("❌ Error saldo_topup:", err);
    try {
      await ctx.answerCbQuery("Gagal membuka menu topup.");
    } catch {}
  }
});

// === 🛒 Stock ===
bot.hears(/^(?:🛒\s*)?Stock$/i, async (ctx) => {
  ctx.session = ctx.session || {};
  ctx.session.flashSale = false;
  try {
    await ctx.reply('📦 Menampilkan seluruh stok produk...');

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
    console.error("❌ Gagal menampilkan stok:", err);
    await ctx.reply("⚠️ Terjadi kesalahan saat menampilkan stok.");
  }
});

  // === 💳 HANDLER TRANSAKSI ===
const TX_PATH = path.resolve("data/transactions.json");

// Load transaksi
async function loadTransactions() {
  try {
    const data = await readJson(TX_PATH, []);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("⚠️ Gagal load transactions.json:", err.message);
    return [];
  }
}

// Simpan transaksi
async function saveTransactions(data) {
  try {
    await writeJson(TX_PATH, data);
    console.log("✅ Transactions berhasil disimpan");
  } catch (err) {
    console.error("❌ Gagal simpan transactions.json:", err.message);
  }
}

  }
};
