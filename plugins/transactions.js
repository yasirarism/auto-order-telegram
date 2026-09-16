module.exports = function registerTransactions(scope) {
  with (scope) {
// === 📜 RIWAYAT TRANSAKSI (pagination 5 per halaman) ===
const PRODUCTS_PATH = path.resolve('data/products.json');
const PER_PAGE      = 5;

// escape HTML aman
const esc = (v) => String(v ?? '')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

// rupiah sederhana (pakai punyamu juga boleh)
const fmtRp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');

// ke WIB
const tsWIB = (ms) => {
  try {
    const d = new Date(Number(ms || 0));
    return d.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  } catch { return '-'; }
};

const formatTxTime = (tx) => {
  const raw = tx?.timestamp ?? tx?.created_at ?? tx?.paid_at ?? tx?.createdAt ?? null;
  if (!raw) return '-';
  if (typeof raw === 'number') return tsWIB(raw);
  const rawStr = String(raw);
  if (/^\d+$/.test(rawStr)) return tsWIB(Number(rawStr));
  return rawStr;
};

const txSortValue = (tx) => {
  const raw = tx?.created_at ?? tx?.timestamp ?? tx?.paid_at ?? tx?.createdAt ?? 0;
  if (typeof raw === 'number') return raw;
  const rawStr = String(raw);
  if (/^\d+$/.test(rawStr)) return Number(rawStr);
  const parsed = Date.parse(rawStr);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const statusBadge = (s) => {
  s = String(s || '').toLowerCase();
  if (['completed','paid','success','sukses'].includes(s)) return `${ce('success', '✅')} Selesai`;
  if (s === 'pending')   return `${ce('pending', '⏳')} Pending`;
  if (s === 'canceled')  return `${ce('cancel', '❌')} Dibatalkan`;
  if (s === 'expired')   return `${ce('soon', '⏰')} Kadaluarsa`;
  return `${ce('help', '❔')} ${s || '-'}`;
};

bot.hears(/^(?:📜\s*)?Riwayat Transaksi$/i, async (ctx) => {
  ctx.session = ctx.session || {};
  ctx.session.flashSale = false;
  const chatId = String(ctx.chat.id);

  const txAll = await loadTransactions();
  const userTx = (txAll || []).filter(t => String(t.user_id) === chatId);

  if (!userTx.length) {
    return ctx.reply('📜 Belum ada transaksi.');
  }

  // load products buat resolve nama
  const products = await loadProducts();
  const prodIndex = Object.fromEntries(products.map(p => [String(p.id), p]));

  const totalPages = Math.max(1, Math.ceil(userTx.length / PER_PAGE));

  // 🧩 render 1 halaman
  const renderPage = async (page = 1, msgId = null) => {
    const p = Math.min(Math.max(1, page), totalPages);
    const start = (p - 1) * PER_PAGE;
    const end   = start + PER_PAGE;

    // terbaru duluan
    const txPage = userTx
      .slice()
      .sort((a, b) => txSortValue(b) - txSortValue(a))
      .slice(start, end);

    const items = txPage.map(t => {
      const prod = prodIndex[String(t.product_id)];
      const prodName = prod?.name || t.product || 'Tanpa Nama';
      const variant  = t.variant_name || t.variant || '-';
      const qty      = Number(t.qty ?? t.jumlah ?? 1);
      const amount   = Number(t.total_amount ?? t.total ?? t.amount ?? t.price ?? 0);
      const method   = String(t.method || t.payment_method || '-').toUpperCase();
      const akun     = t.username ? `@${t.username}` : (t.user || 'Tidak ada akun tercatat');
      const ref      = t.reference_id || t.reference || '-';
      const idStr    = t.id != null ? `#${t.id}` : '-';
      const when     = formatTxTime(t);

      return [
        '╭──────────────────────────',
        `├ <b>${esc(prodName)}</b> <i>(${esc(variant)})</i>`,
        `├ <b>${fmtRp(amount)}</b> (${qty}x)`,
        `├ Metode : ${esc(method)}`,
        `├ Akun   : ${esc(akun)}`,
        `├ Status : ${statusBadge(t.status)}`,
        `├ Ref    : ${esc(ref)}`,
        `├ ID     : ${esc(idStr)}`,
        `├ Tanggal: ${esc(when)}`,
        '╰──────────────────────────'
      ].join('\n');
    });

    const tableRows = txPage.map(t => {
      const prod = prodIndex[String(t.product_id)];
      const prodName = prod?.name || t.product || 'Tanpa Nama';
      const variant = t.variant_name || t.variant || '-';
      const amount = Number(t.total_amount ?? t.total ?? t.amount ?? t.price ?? 0);
      const qty = Number(t.qty ?? t.jumlah ?? 1);
      return [esc(prodName), esc(variant), `${qty}x`, fmtRp(amount), statusBadge(t.status)];
    });
    const tableHtml = richTable(['Produk', 'Varian', 'Qty', 'Total', 'Status'], tableRows);

    const content = [
      `<b>${ce('order', '📜')} RIWAYAT TRANSAKSI KAMU</b>`,
      tableHtml,
      `Menampilkan ${txPage.length} transaksi (halaman ${p}/${totalPages}).`
    ].join('\n');

    const nav = [];
    if (p > 1) nav.push(callbackButton(Markup, 'Sebelumnya', `tx_page_${p-1}`, 'back'));
    if (p < totalPages) nav.push(callbackButton(Markup, 'Selanjutnya', `tx_page_${p+1}`, 'arrow_right'));
    const markup = nav.length ? { inline_keyboard: [nav] } : undefined;

    if (msgId) {
      try {
        await editRichMessageSafe(ctx, ctx.chat.id, msgId, content, { reply_markup: markup });
      } catch (err) {
        console.error('editMessageText error:', err.message);
      }
    } else {
      const sent = await sendRichMessageSafe(ctx, ctx.chat.id, content, { reply_markup: markup });
      return sent?.message_id;
    }
  };

  const msgId = await renderPage(1);
  // simpan state sederhana untuk pagination
  ctx.session = ctx.session || {};
  ctx.session.tx = { page: 1, msgId };
});

// === pagination handler (callback) ===
bot.action(/^tx_page_(\d+)$/, async (ctx) => {
  const nextPage = Number(ctx.match[1] || '1') || 1;
  const msgId = ctx.session?.tx?.msgId || ctx.callbackQuery?.message?.message_id || null;

  // panggil ulang fungsi yang sama seperti di atas:
  // (copas kecil renderPage supaya tidak duplikasi banyak; atau taruh renderPage ke scope luar)
  const chatId = String(ctx.chat.id);

  const txAll = await loadTransactions();
  const userTx = (txAll || []).filter(t => String(t.user_id) === chatId);
  if (!userTx.length) {
    try { await ctx.answerCbQuery('Tidak ada transaksi.'); } catch {}
    return;
  }

  const products = await loadProducts();
  const prodIndex = Object.fromEntries(products.map(p => [String(p.id), p]));
  const totalPages = Math.max(1, Math.ceil(userTx.length / PER_PAGE));
  const p = Math.min(Math.max(1, nextPage), totalPages);
  const start = (p - 1) * PER_PAGE;
  const end   = start + PER_PAGE;

  const txPage = userTx
    .slice()
    .sort((a, b) => txSortValue(b) - txSortValue(a))
    .slice(start, end);

  const items = txPage.map(t => {
    const prod = prodIndex[String(t.product_id)];
    const prodName = prod?.name || t.product || 'Tanpa Nama';
    const variant  = t.variant_name || t.variant || '-';
    const qty      = Number(t.qty ?? t.jumlah ?? 1);
    const amount   = Number(t.total_amount ?? t.total ?? t.amount ?? t.price ?? 0);
    const method   = String(t.method || t.payment_method || '-').toUpperCase();
    const akun     = t.username ? `@${t.username}` : (t.user || 'Tidak ada akun tercatat');
    const ref      = t.reference_id || t.reference || '-';
    const idStr    = t.id != null ? `#${t.id}` : '-';
    const when     = formatTxTime(t);

    return [
      '╭──────────────────────────',
      `├ <b>${esc(prodName)}</b> <i>(${esc(variant)})</i>`,
      `├ <b>${fmtRp(amount)}</b> (${qty}x)`,
      `├ Metode : ${esc(method)}`,
      `├ Akun   : ${esc(akun)}`,
      `├ Status : ${statusBadge(t.status)}`,
      `├ Ref    : ${esc(ref)}`,
      `├ ID     : ${esc(idStr)}`,
      `├ Tanggal: ${esc(when)}`,
      '╰──────────────────────────'
    ].join('\n');
  });

  const tableRows = txPage.map(t => {
    const prod = prodIndex[String(t.product_id)];
    const prodName = prod?.name || t.product || 'Tanpa Nama';
    const variant = t.variant_name || t.variant || '-';
    const amount = Number(t.total_amount ?? t.total ?? t.amount ?? t.price ?? 0);
    const qty = Number(t.qty ?? t.jumlah ?? 1);
    return [esc(prodName), esc(variant), `${qty}x`, fmtRp(amount), statusBadge(t.status)];
  });
  const tableHtml = richTable(['Produk', 'Varian', 'Qty', 'Total', 'Status'], tableRows);

  const content = [
    `<b>${ce('order', '📜')} RIWAYAT TRANSAKSI KAMU</b>`,
    tableHtml,
    `Menampilkan ${txPage.length} transaksi (halaman ${p}/${totalPages}).`
  ].join('\n');

  const nav = [];
  if (p > 1) nav.push(callbackButton(Markup, 'Sebelumnya', `tx_page_${p-1}`, 'back'));
  if (p < totalPages) nav.push(callbackButton(Markup, 'Selanjutnya', `tx_page_${p+1}`, 'arrow_right'));
  const markup = nav.length ? { inline_keyboard: [nav] } : undefined;

  try {
    await editRichMessageSafe(ctx, ctx.chat.id, msgId || ctx.callbackQuery?.message?.message_id, content, {
      reply_markup: markup,
    });
  } catch {
    await sendRichMessageSafe(ctx, ctx.chat.id, content, {
      reply_markup: markup,
    });
  }

  ctx.session = ctx.session || {};
  ctx.session.tx = { page: p, msgId: msgId || ctx.callbackQuery?.message?.message_id || null };

  try { await ctx.answerCbQuery(); } catch {}
});

// 🧹 Auto-clear session setiap command baru diketik (kecuali multi-step)
bot.use((ctx, next) => {
  if (ctx.message && ctx.message.text && ctx.message.text.startsWith("/")) {
    const cmd = ctx.message.text.split(" ")[0].toLowerCase();

    // Daftar command yang PAKAI multi-step (jangan dihapus session-nya)
    const multiStepCommands = ["/tambahproduk", "/tambahstok", "/editstok", "/editproduk"];

    if (!multiStepCommands.includes(cmd)) {
      ctx.session = {}; // clear session biasa
      console.log(`🧽 Session direset karena command baru: ${cmd}`);
    } else {
      console.log(`🧩 Session dipertahankan untuk multi-step: ${cmd}`);
    }
  }
  return next();
});


// === 📄 PAGINATION HANDLER RIWAYAT ===
bot.on("callback_query", async (ctx, next) => {
  try {
    const data = ctx.callbackQuery.data;
    if (!data.startsWith("tx_page_")) return next();

    const page = parseInt(data.split("_")[2]);
    const chatId = String(ctx.chat.id);
    const transactions = await loadTransactions();
    const nextTestiIndex = (() => {
      const numericIds = transactions
        .map((t) => Number(t?.id))
        .filter((n) => Number.isFinite(n));
      const maxId = numericIds.length ? Math.max(...numericIds) : 0;
      return maxId + 1;
    })();
    const userTx = transactions.filter(t => String(t.user_id) === chatId);

    if (userTx.length === 0) {
      await ctx.answerCbQuery("📭 Tidak ada transaksi.");
      return next();
    }

    const perPage = 5;
    const totalPages = Math.ceil(userTx.length / perPage);
    const start = (page - 1) * perPage;
    const end = start + perPage;
    const txPage = userTx.slice().reverse().slice(start, end);

    const content = [
      `<b>📜 RIWAYAT TRANSAKSI KAMU</b>`,
      ``,
      ...txPage.map(t => {
        const date = t.timestamp || "-";
        const qtyText = t.qty ? ` (${t.qty}x)` : "";
        let akunListText = "";

        if (Array.isArray(t.akun) && t.akun.length > 0) {
          akunListText = t.akun
            .map((a, i) => {
              const extra = a.twofa || a.otp || a.note || a.extra || a.message || "";
              const extraLine = extra ? `\nPesan: <code>${extra}</code>` : "";
              return (
                `🔹 <b>Akun ${i + 1}</b>\n` +
                `Email: <code>${a.email || "-"}</code>\n` +
                `Password: <code>${a.password || "-"}</code>` +
                extraLine
              );
            })
            .join("\n\n");
        } else if (t.email && t.password) {
          const extra = t.twofa || t.otp || t.note || t.extra || t.message || "";
          akunListText = `Email: <code>${t.email}</code>\nPassword: <code>${t.password}</code>` +
            (extra ? `\nPesan: <code>${extra}</code>` : "");
        } else {
          akunListText = "❌ Tidak ada akun tercatat";
        }

        return [
          `${ce('order', '🧾')} <b>${t.product}</b> (${t.variant})`,
          `${ce('money', '💰')} Rp ${rupiah(t.total)}${qtyText}`,
          `${ce('payment', '💳')} Metode: ${t.method}`,
          `${ce('product', '📦')} <b>Akun:</b>\n${akunListText}`,
          `🆔 <code>${t.id}</code>`,
          `${ce('calendar', '📅')} ${date}`,
          `━━━━━━━━━━━━━━━━━━`
        ].join("\n");
      }),
      ``,
      `Menampilkan ${txPage.length} transaksi (halaman ${page}/${totalPages}).`
    ].join("\n");

    const navButtons = [];
    if (page > 1)
      navButtons.push(callbackButton(Markup, "Sebelumnya", `tx_page_${page - 1}`, "back"));
    if (page < totalPages)
      navButtons.push(callbackButton(Markup, "Selanjutnya", `tx_page_${page + 1}`, "arrow_right"));

    await ctx.editMessageText(content, {
  parse_mode: "HTML",
  reply_markup: { inline_keyboard: [navButtons] },
});

    await ctx.answerCbQuery();
    next();
  } catch (err) {
    console.error("❌ Error di pagination transaksi:", err);
    await ctx.answerCbQuery("⚠️ Gagal memuat halaman!");
    next();
  }
});
  }
};
