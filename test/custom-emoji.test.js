const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CUSTOM_EMOJI,
  UNICODE_TO_STATIC_EMOJI,
  getEmojiId,
  cleanButtonLabel,
  ce,
  applyCustomEmoji,
  callbackButton,
  urlButton,
  keyboardButton,
  inlineButton,
  withCustomEmoji,
  _isCustomEmojiHtml
} = require('../utils/customEmoji');
const { buildRichMessage, richTable, richDetails, richSlideshow, richCollage, toRichHtml, richToFallbackHtml } = require('../utils/richMessage');

test('custom emoji resolves static catalog keys and raw document IDs', () => {
  assert.equal(getEmojiId('product'), '5875019892284985369');
  assert.equal(getEmojiId('fire'), '5881701547137570062');
  assert.equal(getEmojiId('5875019892284985369'), '5875019892284985369');
  assert.equal(getEmojiId('nonexistent_key_xyz'), null);

  const html = ce('product', '📦');
  assert.equal(html, '<tg-emoji emoji-id="5875019892284985369">📦</tg-emoji>');
  assert.equal(_isCustomEmojiHtml(html), true);
  assert.equal(ce('unknown', '❓'), '❓');
});

test('cleanButtonLabel strips redundant unicode emojis from labels', () => {
  assert.equal(cleanButtonLabel('🚫 VIP - Rp 10.000'), 'VIP - Rp 10.000');
  assert.equal(cleanButtonLabel('⬅️ Sebelumnya'), 'Sebelumnya');
  assert.equal(cleanButtonLabel('Selanjutnya ➡️'), 'Selanjutnya');
  assert.equal(cleanButtonLabel('🔄 Refresh'), 'Refresh');
  assert.equal(cleanButtonLabel('❌ Batal'), 'Batal');
  assert.equal(cleanButtonLabel('💬 Hubungi Admin'), 'Hubungi Admin');
});

test('buttons attach icon_custom_emoji_id and strip duplicate emojis from labels', () => {
  const cb = callbackButton(null, '🔄 Refresh', 'cekstok_refresh', 'refresh');
  assert.equal(cb.text, 'Refresh');
  assert.equal(cb.callback_data, 'cekstok_refresh');
  assert.equal(cb.icon_custom_emoji_id, CUSTOM_EMOJI.refresh);

  const ub = urlButton(null, '💬 Hubungi Admin', 'https://t.me/admin', 'chat', { style: 'primary' });
  assert.equal(ub.text, 'Hubungi Admin');
  assert.equal(ub.url, 'https://t.me/admin');
  assert.equal(ub.icon_custom_emoji_id, CUSTOM_EMOJI.chat);
  assert.equal(ub.style, 'primary');

  const kb = keyboardButton('🧾 List Produk', 'product');
  assert.equal(kb.text, 'List Produk');
  assert.equal(kb.icon_custom_emoji_id, CUSTOM_EMOJI.product);

  const ib = inlineButton({ text: '❌ Batal', callback_data: 'cancel', emoji: 'cancel' });
  assert.equal(ib.text, 'Batal');
  assert.equal(ib.icon_custom_emoji_id, CUSTOM_EMOJI.cancel);

  const modified = withCustomEmoji({ text: '⭐ Star' }, 'star', 'success');
  assert.equal(modified.text, 'Star');
  assert.equal(modified.icon_custom_emoji_id, CUSTOM_EMOJI.star);
  assert.equal(modified.style, 'success');
});

test('applyCustomEmoji converts unicode emojis in text into static custom emojis', () => {
  const text = '📦 DAFTAR STOK: 5 produk 🔥';
  const res = applyCustomEmoji(text);
  assert.match(res, /<tg-emoji emoji-id="5875019892284985369">📦<\/tg-emoji>/);
  assert.match(res, /<tg-emoji emoji-id="5881701547137570062">🔥<\/tg-emoji>/);

  const withCode = '<code>📦</code> and 📦';
  const codeRes = applyCustomEmoji(withCode);
  assert.equal(codeRes, '<code>📦</code> and <tg-emoji emoji-id="5875019892284985369">📦</tg-emoji>');
});

test('rich message builders generate valid HTML and graceful fallback', () => {
  const tableHtml = richTable(['No', 'Produk', 'Stok'], [['1', 'Netflix', '10']]);
  assert.match(tableHtml, /<table bordered striped compact>/);
  assert.match(tableHtml, /<th>Produk<\/th>/);
  assert.match(tableHtml, /<td>Netflix<\/td>/);

  const detailsHtml = richDetails('Info', '<p>Detail akun</p>');
  assert.equal(detailsHtml, '<details><summary>Info</summary><p>Detail akun</p></details>');

  const converted = toRichHtml('<emoji id="5875019892284985369">📦</emoji>');
  assert.equal(converted, '<tg-emoji emoji-id="5875019892284985369">📦</tg-emoji>');

  const fallback = richToFallbackHtml(detailsHtml);
  assert.match(fallback, /<blockquote expandable><b>Info<\/b>/);

  const tableFallback = richToFallbackHtml(tableHtml);
  assert.match(tableFallback, /<pre>/);
});
