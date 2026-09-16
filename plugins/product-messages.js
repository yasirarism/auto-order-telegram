module.exports = function registerProductMessages(scope) {
  with (scope) {
// =======================
// ⚙️ FINAL FINAL PATCH — AUTO-DETECT FOTO/TEXT TANPA ERROR
// =======================
async function safeEditProductMessage(bot, msg, caption, keyboard) {
  try {
    if (!msg.chatId || !msg.messageId) return;

    // ⛔ jangan sentuh pesan transaksi/QR
    if (msg.isTransaction === true) return;

    // ✅ Deteksi langsung dari data aktif
    const isPhoto = msg.isPhoto || msg.type === "photo";
    const formattedCaption = typeof caption === 'string' ? applyCustomEmoji(caption) : caption;
    let cleanKeyboard = keyboard;
    if (Array.isArray(keyboard)) {
      cleanKeyboard = keyboard.map(row => Array.isArray(row) ? row.map(btn => {
        if (btn && btn.icon_custom_emoji_id && typeof btn.text === 'string') {
          return { ...btn, text: cleanButtonLabel(btn.text) };
        }
        return btn;
      }) : row);
    }

    if (isPhoto) {
      await bot.telegram.editMessageCaption(
        msg.chatId,
        msg.messageId,
        undefined,
        richToFallbackHtml(formattedCaption),
        {
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: cleanKeyboard },
        }
      );
    } else if (typeof formattedCaption === "string" && /<table\b|<details\b|<tg-emoji\b/i.test(formattedCaption)) {
      const richResult = await editRichMessageSafe(
        bot,
        msg.chatId,
        msg.messageId,
        toRichHtml(formattedCaption),
        { reply_markup: { inline_keyboard: cleanKeyboard } }
      );
      if (!richResult) {
        await bot.telegram.editMessageText(
          msg.chatId,
          msg.messageId,
          undefined,
          richToFallbackHtml(formattedCaption),
          {
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: cleanKeyboard },
          }
        );
      }
    } else {
      await bot.telegram.editMessageText(
        msg.chatId,
        msg.messageId,
        undefined,
        formattedCaption,
        {
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: cleanKeyboard },
        }
      );
    }
  } catch (err) {
    const errMsg = String(err);

    // 🔁 Fallback otomatis
    if (
      errMsg.includes("no caption") ||
      errMsg.includes("PHOTO_CAPTION_EMPTY") ||
      errMsg.includes("message has no caption")
    ) {
      try {
        const formattedCaption = typeof caption === 'string' ? applyCustomEmoji(caption) : caption;
        let cleanKeyboard = keyboard;
        if (Array.isArray(keyboard)) {
          cleanKeyboard = keyboard.map(row => Array.isArray(row) ? row.map(btn => {
            if (btn && btn.icon_custom_emoji_id && typeof btn.text === 'string') {
              return { ...btn, text: cleanButtonLabel(btn.text) };
            }
            return btn;
          }) : row);
        }
        await bot.telegram.editMessageText(
          msg.chatId,
          msg.messageId,
          undefined,
          richToFallbackHtml(formattedCaption),
          {
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: cleanKeyboard },
          }
        );
      } catch (err2) {
        if (!String(err2).includes("message is not modified"))
          console.error("❌ Gagal update teks produk:", err2.description);
      }
      return;
    }

    // ⏭️ Kalau gak ada perubahan → skip
    if (errMsg.includes("message is not modified")) return;

    // ❌ Log error real
    if (!errMsg.includes("can't be edited")) {
      console.error("❌ editCaptionSafe error:", errMsg);
    }
  }
}

// 🔁 Edit pesan produk aktif (auto-sync)
const oldEditProductMessages = async (product, caption, keyboard) => {
  const formattedCaption = typeof caption === "string" ? applyCustomEmoji(caption) : caption;
  const cleanKeyboard = Array.isArray(keyboard)
    ? keyboard.map(row => Array.isArray(row) ? row.map(btn => btn?.icon_custom_emoji_id
      ? { ...btn, text: cleanButtonLabel(btn.text) }
      : btn) : row)
    : keyboard;
  const targets = activeMessages.filter(
    (m) =>
      m.productId === product.id &&
      m.messageId &&
      m.chatId &&
      // ⛔ WAJIB eksplisit katalog saja:
      m.isTransaction === false
      // (tidak ada cek lain yang bisa nyenggol handler lain)
  );

  if (!targets.length) {
    console.log(`⚪ Lewati ${product.name} — tidak ada pesan katalog aktif yang aman di-edit.`);
    return;
  }

  for (const msg of targets) {
    try {
      console.log("🧩 Update target:", msg);
      if (msg.isPhoto) {
        await bot.telegram.editMessageCaption(
          msg.chatId,
          msg.messageId,
          undefined,
          formattedCaption,
          {
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: cleanKeyboard },
          }
        );
      } else if (typeof formattedCaption === "string" && /<table\b|<details\b|<tg-emoji\b/i.test(formattedCaption)) {
        const richResult = await editRichMessageSafe(
          bot,
          msg.chatId,
          msg.messageId,
          toRichHtml(formattedCaption),
          { reply_markup: { inline_keyboard: cleanKeyboard } }
        );
        if (!richResult) {
          await bot.telegram.editMessageText(
            msg.chatId,
            msg.messageId,
            undefined,
            richToFallbackHtml(formattedCaption),
            {
              parse_mode: "HTML",
              reply_markup: { inline_keyboard: cleanKeyboard },
            }
          );
        }
      } else {
        await bot.telegram.editMessageText(
          msg.chatId,
          msg.messageId,
          undefined,
          formattedCaption,
          {
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: cleanKeyboard },
          }
        );
      }
    } catch (err) {
      const d = String(err.description || "");
      if (d.includes("message to edit not found")) {
        activeMessages = activeMessages.filter(
          (m) => m.messageId !== msg.messageId
        );
      } else if (d.includes("no caption")) {
        try {
          await bot.telegram.editMessageText(
            msg.chatId,
            msg.messageId,
            undefined,
            caption,
            {
              parse_mode: "HTML",
              reply_markup: { inline_keyboard: keyboard },
            }
          );
        } catch (e2) {
          console.error("❌ Retry editMessageText gagal:", e2.description);
        }
      } else {
        console.error(`⚠️ Gagal update ${product.name}:`, d);
      }
    }
  }
};

// === 🧩 Saat pertama kali kirim pesan (produk / transaksi)
async function trackSentProduct(ctx, product, sentMsg, isTransaction = false) {
  try {
    activeMessages = activeMessages.filter(
      (m) => !(m.chatId === ctx.chat.id && m.productId === product.id)
    );

    const isPhoto =
      !!(ctx.message?.photo || sentMsg.photo) ||
      !!sentMsg.caption ||
      !!ctx.message?.caption;

    activeMessages.push({
      chatId: ctx.chat.id,
      messageId: sentMsg.message_id,
      productId: product.id,
      isPhoto,
      type: isPhoto ? "photo" : "text",
      isTransaction, // katalog = false, transaksi/QR = true
    });

    console.log(
      `💳 Pesan ${isTransaction ? "transaksi" : "produk"} ${
        product.name
      } ditandai isTransaction=${isTransaction}, isPhoto=${isPhoto}`
    );

    console.table(
      activeMessages.map((m) => ({
        chat: m.chatId,
        prod: m.productId,
        trans: m.isTransaction,
        photo: m.isPhoto,
        type: m.type,
      }))
    );
  } catch (err) {
    console.error("⚠️ trackSentProduct error:", err);
  }
}

    scope.safeEditProductMessage = safeEditProductMessage;
    scope.oldEditProductMessages = oldEditProductMessages;
    scope.trackSentProduct = trackSentProduct;
  }
};
