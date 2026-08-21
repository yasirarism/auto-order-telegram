// Custom emoji IDs from the Telegram Android Icons pack.
// Keep fallback glyphs in the HTML tag for clients that cannot render premium emoji.
const CUSTOM_EMOJI = Object.freeze({
  home: "5943042214224465443",      // 🏠
  gift: "6032937473162614352",      // 🎁
  product: "5875019892284985369",   // 📦
  order: "5886506997066502636",     // 📝
  payment: "5845947563601041174",   // 💳
  money: "6007852063835297043",     // 💰
  pending: "6017174676898321263",   // 🕓
  process: "5875180111744995604",   // ⚙
  success: "5830060857530257978",   // ✅
  cancel: "5987718983728503684",    // ❌
  delivery: "5895311993555915037",  // 🚚
  download: "5839323457015256759",  // 📥
  upload: "5877443460725739250",    // 📤
  help: "5967456680940671207",      // ❓
  warning: "5776287149724798198",   // ⚠
  info: "5877332341331857066",      // ℹ
  search: "5886762118123886049",    // 🔎
  settings: "5875180111744995604",  // ⚙
  back: "5967432796627538166",      // ⬅
  close: "5987718983728503684",     // ❌
  refresh: "5874986954180791957",   // 🔄
  fire: "5881701547137570062",      // 🔥
  user: "5843862283964390528",      // 👤
});

function ce(name, fallback = "") {
  const id = CUSTOM_EMOJI[name];
  if (!id) return fallback;
  return `<emoji id="${id}">${fallback}</emoji>`
}

// Inline buttons support an icon independently from the label text.
// Do not put the fallback glyph in the label as that would render twice.
function callbackButton(Markup, label, callbackData, name) {
  const button = Markup.button.callback(label, callbackData);
  if (name && CUSTOM_EMOJI[name]) {
    button.icon_custom_emoji_id = CUSTOM_EMOJI[name];
  }
  return button;
}

module.exports = { CUSTOM_EMOJI, ce, callbackButton };

// Exported for a small deterministic unit test without Telegram credentials.
module.exports._isCustomEmojiHtml = (value) =>
  typeof value === "string" && /<emoji id="\d+">/.test(value);
