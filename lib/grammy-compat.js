const { Bot, Api, session, InputFile } = require("grammy");

if (typeof Api.prototype.callApi !== "function") {
  Api.prototype.callApi = function (method, payload) {
    return this.raw[method](payload);
  };
}

if (typeof Api.prototype.getFileLink !== "function") {
  Api.prototype.getFileLink = async function (fileId) {
    const file = await this.getFile(fileId);
    return typeof file?.getUrl === "function"
      ? file.getUrl()
      : `https://api.telegram.org/file/bot${this.token}/${file.file_path}`;
  };
}

const origApiEditMessageText = Api.prototype.editMessageText;
Api.prototype.editMessageText = function (chatId, messageId, textOrInline, otherOrText, extra, signal) {
  if (textOrInline === null || textOrInline === undefined) {
    // Telegraf signature: (chatId, messageId, null/undefined, text, extra)
    return origApiEditMessageText.call(this, chatId, messageId, otherOrText, extra, signal);
  }
  return origApiEditMessageText.call(this, chatId, messageId, textOrInline, otherOrText, extra);
};

const origApiEditMessageCaption = Api.prototype.editMessageCaption;
Api.prototype.editMessageCaption = function (chatId, messageId, inlineOrOptions, captionOrOther, extra, signal) {
  if (inlineOrOptions === null || inlineOrOptions === undefined) {
    // Telegraf signature: (chatId, messageId, null/undefined, caption, extra)
    const options = { caption: captionOrOther, ...(typeof extra === "object" ? extra : {}) };
    return origApiEditMessageCaption.call(this, chatId, messageId, options, signal);
  }
  if (typeof inlineOrOptions === "string") {
    const options = { caption: inlineOrOptions, ...(typeof captionOrOther === "object" ? captionOrOther : {}) };
    return origApiEditMessageCaption.call(this, chatId, messageId, options, extra);
  }
  return origApiEditMessageCaption.call(this, chatId, messageId, inlineOrOptions, captionOrOther);
};

const Markup = {
  button: {
    callback: (text, data) => ({ text, callback_data: data }),
    url: (text, url) => ({ text, url }),
  },
  keyboard: (buttons) => ({
    reply_markup: { keyboard: buttons, resize_keyboard: true },
    resize() { this.reply_markup.resize_keyboard = true; return this; },
  }),
  inlineKeyboard: (buttons) => ({
    reply_markup: { inline_keyboard: buttons },
  }),
};

function setupBotCompatibility(bot) {
  bot.api.config.use(async (prev, method, payload, signal) => {
    if (payload && typeof payload === "object") {
      for (const field of ["photo", "document", "video", "audio", "voice", "animation"]) {
        if (payload[field] && typeof payload[field] === "object" && "source" in payload[field]) {
          payload[field] = new InputFile(payload[field].source, payload[field].filename);
        }
      }
    }
    return prev(method, payload, signal);
  });

  bot.telegram = bot.api;

  const origStart = bot.start.bind(bot);
  bot.start = function (arg, ...rest) {
    if (typeof arg === "function") {
      return this.command("start", arg, ...rest);
    }
    const run = async () => {
      let retries = 10;
      while (retries > 0) {
        try {
          await origStart(arg, ...rest);
          break;
        } catch (err) {
          const isConflict = err?.error_code === 409 || String(err?.message || "").includes("Conflict") || String(err?.description || "").includes("Conflict");
          if (isConflict) {
            retries--;
            console.warn(`⚠️ Bot 409 Conflict (menunggu container lama mati), retry dalam 3 detik... (${10 - retries}/10)`);
            await new Promise((r) => setTimeout(r, 3000));
            continue;
          }
          console.error("Bot start error:", err);
          throw err;
        }
      }
    };
    return run();
  };

  bot.launch = function (options) {
    return this.start(options);
  };

  bot.action = function (trigger, ...handlers) {
    return this.callbackQuery(trigger, ...handlers);
  };

  const origOn = bot.on.bind(bot);
  const eventMap = {
    photo: ":photo",
    document: ":document",
    text: ":text",
    video: ":video",
    audio: ":audio",
    voice: ":voice",
    sticker: ":sticker",
    animation: ":animation",
  };
  bot.on = function (filter, ...handlers) {
    const mapped = (typeof filter === "string" && eventMap[filter]) ? eventMap[filter] : filter;
    return origOn(mapped, ...handlers);
  };

  return bot;
}

module.exports = {
  Bot,
  Api,
  InputFile,
  Markup,
  session,
  grammySession: session,
  setupBotCompatibility,
};
