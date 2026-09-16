module.exports = function registerStart(scope) {
  with (scope) {
// === /start Command (fixed + optimized ringan) ===
bot.start(async (ctx) => {
  ctx.session = ctx.session || {};
  ctx.session.flashSale = false;

  // Deep-link dari web: /start web_<token>. Identitas diambil langsung dari
  // Telegram, jadi pengguna tidak perlu mengetik ID atau kode OTP manual.
  const startPayload = String(ctx.startPayload || "");
  if (startPayload.startsWith("web_")) {
    const approved = approveTelegramLogin(startPayload.slice(4), ctx.from);
    if (approved) {
      await ctx.reply("✅ Login web berhasil. Kamu boleh kembali ke browser.");
    } else {
      await ctx.reply("⚠️ Link login web sudah tidak berlaku. Silakan buat link baru dari website.");
    }
  }
  const chatId = String(ctx.chat.id);
  const user = ctx.from;

  // 🚀 Reload data dari file agar saldo tidak ke-reset oleh cache lama
  global.dbCache = await loadDB();

  // 🧩 Perbaikan utama: selalu reload transaksi biar realtime
  try {
    global.txCache = await loadTransactions();
  } catch (err) {
    console.error("⚠️ Gagal load transaksi:", err.message);
    global.txCache = [];
  }

  let db = global.dbCache || {};

  if (!db.users) db.users = {};
  if (!db.stats) db.stats = { totalUsers: 0 };

  global.dbCache = db; 

  const transactions = global.txCache || {};

  // 🧍‍♂️ Buat user baru jika belum ada
  if (!db.users[chatId]) {
    db.users[chatId] = {
      id: chatId,
      username: user.username || null,
      first_name: user.first_name || null,
      transaksi: 0,
      balance: 0,
      createdAt: Date.now()
    };

    db.stats.totalUsers += 1;
    await saveDB(db);
  }

  const me = db.users[chatId];
  if (user?.username && me.username !== user.username) me.username = user.username;
  if (user?.first_name && me.first_name !== user.first_name) me.first_name = user.first_name;
  const now = fmtFull();
  const totalUsers = db.stats.totalUsers || 1;
  const isPaidStatus = (status) =>
    ["paid", "sukses", "success", "completed"].includes(
      String(status || "").toLowerCase()
    );
  const greeting = greetingByHour();

  // 💰 Hitung total transaksi user dari transactions.json (fix: realtime)
  const userTotalTransaksi = Array.isArray(transactions)
    ? transactions
        .filter(t => String(t.user_id) === chatId && isPaidStatus(t.status))
        .reduce(
          (sum, t) =>
            sum + Number(t.total_amount ?? t.total ?? t.amount ?? 0),
          0
        )
    : 0;

  // 🔄 Update data user (sinkron)
  me.transaksi = userTotalTransaksi;

  // 📊 Hitung statistik global (real-time)
  const totalSold = Array.isArray(transactions)
    ? transactions.reduce((sum, t) => sum + (t.jumlah || t.qty || 0), 0)
    : 0;

  const totalTransaksi = Array.isArray(transactions)
    ? transactions
    .filter(t => isPaidStatus(t.status))
    .reduce(
      (sum, t) =>
        sum + Number(t.total_amount ?? t.total ?? t.amount ?? 0),
      0
    )
    : 0;

  db.stats.totalSold = totalSold;
  db.stats.totalTransaksi = totalTransaksi;

  // 🧠 Simpan database cuma kalau data berubah
  await saveDB(db);

  const text = [
    `Selamat ${greeting} ${esc(me.first_name || me.username || 'Pengguna')} 👋`,
    `<i>${esc(now)}</i>`,
    ``,
    `<b>User Info :</b>`,
    `└ <b>ID :</b> <code>${esc(me.id)}</code>`,
    `└ <b>Username :</b> ${me.username ? '@' + esc(me.username) : '-'}`,
    `└ <b>Transaksi :</b> Rp ${rupiah(userTotalTransaksi)}`,
    ``,
    `<b>BOT Stats :</b>`,
    `└ <b>Terjual :</b> ${totalSold} Acc`,
    `└ <b>Total Transaksi :</b> Rp ${rupiah(totalTransaksi)}`,
    `└ <b>Total User :</b> ${rupiah(totalUsers)}`,
    ``,
    `<b>Shortcuts :</b>`,
    `/start - Mulai bot`,
    `/akusiapa - Status Kamu`,
    `/cekstok - Lihat Seluruh Stok`,
    `/helpadmin — Panduan ( Untuk Admin )`,
    ``,
    `<i>Dikelola oleh ${AUTHOR} © 2025</i>`
  ].join('\n');

  // 🎛️ Keyboard utama
  const keyboard = Markup.keyboard([
    [keyboardButton('List Produk', 'product'), keyboardButton('Flash Sale', 'fire')],
    [keyboardButton('Stock', 'product'), keyboardButton(saldoLabel(me.balance), 'money')],
    [keyboardButton('Riwayat Transaksi', 'order'), keyboardButton('Cara Order', 'help')]
  ]).resize();

    const bannerPath = INFO_BANNER_PATH;
  const caption = `${ce('gift', '🎁')} <b>${esc(BOT_NAME)}</b> — by ${esc(AUTHOR)}\n\n${text}`;

  // 🖼️ Kirim banner cuma kalau ada, biar cepat
  if (fs.existsSync(bannerPath)) {
    await ctx.replyWithPhoto(
      { source: bannerPath },
      { caption, parse_mode: 'HTML', ...keyboard }
    );
  } else {
    await ctx.reply(caption, { parse_mode: 'HTML', ...keyboard });
  }
});


  }
};
