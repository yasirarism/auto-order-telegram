const CUSTOM_EMOJI = Object.freeze({
  "arrow_down": "5875008416132370818",
  "arrow_left": "5877536313623711363",
  "arrow_right": "5875506366050734240",
  "arrow_up": "5875078273775439450",
  "back": "5967432796627538166",
  "ban": "5872829476143894491",
  "ban_bw": "5872829476143894491",
  "bank": "5206636501860893075",
  "bell": "5909201569898827582",
  "box": "5924720918826848520",
  "briefcase": "5967389567781703494",
  "cancel": "5987718983728503684",
  "card": "5927169041595634481",
  "cart": "5983399041197675256",
  "chat": "5886436057091673541",
  "check": "5830060857530257978",
  "check_bw": "5825794181183836432",
  "checkmark": "5830060857530257978",
  "clock": "5877613700344450910",
  "close": "5987718983728503684",
  "copy": "5877301185639091664",
  "cross": "5987718983728503684",
  "data": "5877485980901971030",
  "delivery": "5895311993555915037",
  "discount": "5985433648810171091",
  "dislike": "5994368422031397063",
  "download": "5839323457015256759",
  "envelope": "5967280668885913944",
  "exclamation": "5879813604068298387",
  "fingerprint": "5886505193180239900",
  "fire": "5881701547137570062",
  "gift": "6032937473162614352",
  "globe": "5879585266426973039",
  "headphones": "6007938409857815902",
  "heart": "5994453058656931434",
  "help": "5967456680940671207",
  "home": "5943042214224465443",
  "info": "5877332341331857066",
  "info_bw": "5879785854284599288",
  "instagram": "5206383450977750405",
  "internet": "5879585266426973039",
  "key": "5886505193180239900",
  "like": "5992199545151295755",
  "link": "5877465816030515018",
  "list": "5877597667231534929",
  "lock": "5886505193180239900",
  "mail": "5967280668885913944",
  "mastercard": "5206505943445034137",
  "money": "6007852063835297043",
  "notify": "5909201569898827582",
  "order": "5886506997066502636",
  "payment": "5845947563601041174",
  "pencil": "5879841310902324730",
  "pending": "6017174676898321263",
  "phone": "5967591100532134862",
  "pin": "5796440171364749940",
  "process": "5875180111744995604",
  "product": "5875019892284985369",
  "profile": "5879770735999717115",
  "qr": "5987917196469213507",
  "refresh": "5874986954180791957",
  "search": "5886762118123886049",
  "settings": "5875180111744995604",
  "settings_bw": "5877260593903177342",
  "shop": "5983399041197675256",
  "soon": "5877613700344450910",
  "star": "5958376256788502078",
  "stars": "5958376256788502078",
  "stats": "5877485980901971030",
  "store": "5983399041197675256",
  "success": "5830060857530257978",
  "support": "5884510167986343350",
  "tag": "5985433648810171091",
  "telegram": "5206208353751024833",
  "tiktok": "5206421491503088521",
  "trash": "5879896690210639947",
  "upload": "5877443460725739250",
  "urgent": "5776287149724798198",
  "user": "5843862283964390528",
  "verified": "5805532930662996322",
  "visa": "5204357742537492089",
  "wallet": "5769403330761593044",
  "warning": "5776287149724798198",
  "youtube": "5206230030450975877"
});

const UNICODE_TO_STATIC_EMOJI = Object.freeze({
  "\ud83d\udce6": "5875019892284985369",
  "\ud83e\uddfe": "5886506997066502636",
  "\ud83d\udd25": "5881701547137570062",
  "\ud83d\uded2": "5983399041197675256",
  "\ud83d\udcb0": "6007852063835297043",
  "\ud83d\udcb3": "5845947563601041174",
  "\ud83d\udcdc": "5886506997066502636",
  "\u2753": "5967456680940671207",
  "\u26a0\ufe0f": "5776287149724798198",
  "\u26a0": "5776287149724798198",
  "\u274c": "5987718983728503684",
  "\u2705": "5830060857530257978",
  "\u231b": "5877613700344450910",
  "\u23f3": "5877613700344450910",
  "\u23f0": "5877613700344450910",
  "\u23f1\ufe0f": "5877613700344450910",
  "\u23f1": "5877613700344450910",
  "\ud83d\udd04": "5874986954180791957",
  "\ud83d\udd01": "5874986954180791957",
  "\ud83e\udd16": "6032937473162614352",
  "\ud83d\udccb": "5877597667231534929",
  "\u2699\ufe0f": "5875180111744995604",
  "\u2699": "5875180111744995604",
  "\ud83d\udce5": "5839323457015256759",
  "\ud83d\udce4": "5877443460725739250",
  "\ud83d\udcca": "5877485980901971030",
  "\ud83d\udd12": "5886505193180239900",
  "\ud83d\udd10": "5886505193180239900",
  "\ud83d\udcac": "5884510167986343350",
  "\ud83c\udff7\ufe0f": "5985433648810171091",
  "\ud83c\udff7": "5985433648810171091",
  "\u2b50": "5958376256788502078",
  "\ud83d\udc64": "5843862283964390528",
  "\ud83d\ude9a": "5895311993555915037",
  "\ud83c\udf81": "6032937473162614352",
  "\ud83c\udfe0": "5943042214224465443",
  "\ud83d\udd0e": "5886762118123886049",
  "\ud83d\udd0d": "5886762118123886049",
  "\ud83d\udeab": "5872829476143894491",
  "\ud83d\udcf1": "5987917196469213507",
  "\ud83d\udc5b": "5769403330761593044",
  "\ud83d\uddd1": "5879896690210639947"
});

function getEmojiId(nameOrId) {
  if (!nameOrId || typeof nameOrId !== "string") return null;
  if (/^\d{15,22}$/.test(nameOrId)) return nameOrId;
  return CUSTOM_EMOJI[nameOrId] || null;
}

function cleanButtonLabel(text) {
  if (!text || typeof text !== "string") return text;
  const emojiRegexStart = /^[\s\u200d\ufe0f\u2190-\u21ff\u2300-\u23ff\u2600-\u27bf\u2b00-\u2bff\p{Extended_Pictographic}\p{Emoji_Presentation}]+/u;
  const emojiRegexEnd = /[\s\u200d\ufe0f\u2190-\u21ff\u2300-\u23ff\u2600-\u27bf\u2b00-\u2bff\p{Extended_Pictographic}\p{Emoji_Presentation}]+$/u;
  const cleaned = text.replace(emojiRegexStart, "").replace(emojiRegexEnd, "").trim();
  return cleaned || text;
}

function ce(nameOrId, fallback = "") {
  const id = getEmojiId(nameOrId);
  if (!id) return fallback;
  return `<tg-emoji emoji-id="${id}">${fallback}</tg-emoji>`;
}

function ceRich(nameOrId, fallback = "") {
  return ce(nameOrId, fallback);
}

function ceCaption(nameOrId, fallback = "") {
  return ce(nameOrId, fallback);
}

function applyCustomEmoji(text) {
  if (!text || typeof text !== "string") return text;
  const parts = text.split(/(<tg-emoji[^>]*>[\s\S]*?<\/tg-emoji>|<code[^>]*>[\s\S]*?<\/code>|<pre[^>]*>[\s\S]*?<\/pre>)/gi);
  for (let i = 0; i < parts.length; i += 2) {
    let part = parts[i];
    for (const [glyph, id] of Object.entries(UNICODE_TO_STATIC_EMOJI)) {
      part = part.replaceAll(glyph, `<tg-emoji emoji-id="${id}">${glyph}</tg-emoji>`);
    }
    parts[i] = part;
  }
  return parts.join("");
}

function callbackButton(Markup, label, callbackData, nameOrId, extra = {}) {
  const id = getEmojiId(nameOrId) || getEmojiId(extra.icon_custom_emoji_id);
  const textLabel = id ? cleanButtonLabel(label) : label;
  const button = (Markup && Markup.button && typeof Markup.button.callback === "function")
    ? Markup.button.callback(textLabel, callbackData)
    : { text: textLabel, callback_data: callbackData };
  if (id) {
    button.icon_custom_emoji_id = String(id);
  }
  if (extra.style) {
    button.style = extra.style;
  }
  return button;
}

function urlButton(Markup, label, url, nameOrId, extra = {}) {
  const id = getEmojiId(nameOrId) || getEmojiId(extra.icon_custom_emoji_id);
  const textLabel = id ? cleanButtonLabel(label) : label;
  const button = (Markup && Markup.button && typeof Markup.button.url === "function")
    ? Markup.button.url(textLabel, url)
    : { text: textLabel, url: url };
  if (id) {
    button.icon_custom_emoji_id = String(id);
  }
  if (extra.style) {
    button.style = extra.style;
  }
  return button;
}

function keyboardButton(label, nameOrId, extra = {}) {
  const id = getEmojiId(nameOrId) || getEmojiId(extra.icon_custom_emoji_id);
  const textLabel = id ? cleanButtonLabel(label) : label;
  const button = { text: textLabel };
  if (id) {
    button.icon_custom_emoji_id = String(id);
  }
  if (extra.style) {
    button.style = extra.style;
  }
  return button;
}

function inlineButton(options = {}) {
  const id = getEmojiId(options.emoji) || getEmojiId(options.icon_custom_emoji_id);
  const textLabel = id ? cleanButtonLabel(options.text || "") : (options.text || "");
  const button = { text: textLabel };
  if (options.callback_data !== undefined) button.callback_data = options.callback_data;
  if (options.url !== undefined) button.url = options.url;
  if (options.web_app !== undefined) button.web_app = options.web_app;
  if (options.login_url !== undefined) button.login_url = options.login_url;
  if (options.switch_inline_query !== undefined) button.switch_inline_query = options.switch_inline_query;
  if (options.switch_inline_query_current_chat !== undefined) {
    button.switch_inline_query_current_chat = options.switch_inline_query_current_chat;
  }
  if (id) {
    button.icon_custom_emoji_id = String(id);
  }
  if (options.style) {
    button.style = options.style;
  }
  return button;
}

function withCustomEmoji(button, nameOrId, style) {
  if (!button || typeof button !== "object") return button;
  const id = getEmojiId(nameOrId);
  const textLabel = id ? cleanButtonLabel(button.text || "") : (button.text || "");
  const cloned = { ...button, text: textLabel };
  if (id) {
    cloned.icon_custom_emoji_id = String(id);
  }
  if (style) {
    cloned.style = style;
  }
  return cloned;
}

module.exports = {
  CUSTOM_EMOJI,
  UNICODE_TO_STATIC_EMOJI,
  getEmojiId,
  cleanButtonLabel,
  ce,
  ceRich,
  ceCaption,
  applyCustomEmoji,
  callbackButton,
  urlButton,
  keyboardButton,
  inlineButton,
  withCustomEmoji,
  _isCustomEmojiHtml: (value) =>
    typeof value === "string" && /<tg-emoji emoji-id="\d+">/.test(value)
};
