function buildRichMessage(options = {}) {
  if (typeof options === "string") {
    return { html: options };
  }
  const payload = {};
  if (options.html !== undefined) payload.html = options.html;
  if (options.markdown !== undefined) payload.markdown = options.markdown;
  if (options.blocks !== undefined) payload.blocks = options.blocks;
  if (options.media !== undefined) payload.media = options.media;
  if (options.is_rtl !== undefined) payload.is_rtl = options.is_rtl;
  if (options.skip_entity_detection !== undefined) {
    payload.skip_entity_detection = options.skip_entity_detection;
  }
  return payload;
}

function richTable(headers = [], rows = [], options = {}) {
  const { bordered = true, striped = true, compact = true } = options;
  const attrs = [];
  if (bordered) attrs.push("bordered");
  if (striped) attrs.push("striped");
  if (compact) attrs.push("compact");
  const attrStr = attrs.length ? " " + attrs.join(" ") : "";

  const headHtml = Array.isArray(headers) && headers.length
    ? `<thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>`
    : "";

  const bodyHtml = Array.isArray(rows) && rows.length
    ? `<tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c ?? "—"}</td>`).join("")}</tr>`).join("")}</tbody>`
    : "";

  return `<table${attrStr}>${headHtml}${bodyHtml}</table>`;
}

function richDetails(summary, content) {
  return `<details><summary>${summary}</summary>${content}</details>`;
}

function richSlideshow(mediaUrls = [], caption = "") {
  const imgs = mediaUrls.map(url => `<img src="${url}"/>`).join("");
  const cap = caption ? `<figcaption>${caption}</figcaption>` : "";
  return `<tg-slideshow>${imgs}${cap}</tg-slideshow>`;
}

function richCollage(mediaUrls = [], caption = "") {
  const imgs = mediaUrls.map(url => `<img src="${url}"/>`).join("");
  const cap = caption ? `<figcaption>${caption}</figcaption>` : "";
  return `<tg-collage>${imgs}${cap}</tg-collage>`;
}

function toRichHtml(text) {
  if (!text || typeof text !== "string") return "";
  let clean = text
    .replace(/<emoji id="?(\d+)"?>([^<]*)<\/emoji>/g, '<tg-emoji emoji-id="$1">$2</tg-emoji>')
    .replace(/<blockquote expandable>/g, '<details><summary>Detail</summary>')
    .replace(/<\/blockquote>/g, '</details>');
  return clean.trim();
}

function richToFallbackHtml(html) {
  if (!html || typeof html !== "string") return "";
  let out = html
    .replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, '<b>$1</b>')
    .replace(/<tg-emoji[^>]*>([\s\S]*?)<\/tg-emoji>/gi, "$1");
  out = out.replace(/<details>\s*<summary>(.*?)<\/summary>([\s\S]*?)<\/details>/gi, (m, summary, body) => {
    return `<blockquote expandable><b>${summary}</b>\n${body.trim()}</blockquote>`;
  });
  out = out.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (m, tableContent) => {
    const rows = [];
    const rowMatches = tableContent.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
    for (const r of rowMatches) {
      const cells = [];
      const cellMatches = r.match(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi) || [];
      for (const c of cellMatches) {
        cells.push(c.replace(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/i, '$1').trim());
      }
      if (cells.length) rows.push(cells.join(' | '));
    }
    return rows.length ? `\n<pre>${rows.join('\n')}</pre>\n` : '';
  });
  return out;
}

async function sendRichMessageSafe(botOrTelegram, chatId, richContent, extra = {}) {
  const telegram = botOrTelegram?.telegram || botOrTelegram?.api || (typeof botOrTelegram?.callApi === "function" ? botOrTelegram : null);
  if (!telegram || !chatId) return null;

  const sourceMessage = typeof richContent === "string" ? { html: richContent } : buildRichMessage(richContent);
  const richMessage = {
    ...sourceMessage,
    ...(sourceMessage.html ? { html: toRichHtml(sourceMessage.html) } : {})
  };
  const payload = {
    chat_id: chatId,
    rich_message: richMessage,
    ...(extra.reply_markup ? { reply_markup: extra.reply_markup } : {}),
    ...(extra.reply_parameters ? { reply_parameters: extra.reply_parameters } : {}),
    ...(extra.disable_notification !== undefined ? { disable_notification: extra.disable_notification } : {}),
    ...(extra.protect_content !== undefined ? { protect_content: extra.protect_content } : {})
  };

  try {
    return await telegram.callApi("sendRichMessage", payload);
  } catch (err) {
    const fallbackText = richToFallbackHtml(richMessage.html || richMessage.markdown || "");
    try {
      return await telegram.sendMessage(chatId, fallbackText, {
        parse_mode: "HTML",
        ...extra
      });
    } catch (sendErr) {
      return null;
    }
  }
}

async function editRichMessageSafe(botOrTelegram, chatId, messageId, richContent, extra = {}) {
  const telegram = botOrTelegram?.telegram || botOrTelegram?.api || (typeof botOrTelegram?.callApi === "function" ? botOrTelegram : null);
  if (!telegram || !chatId || !messageId) return null;

  const sourceMessage = typeof richContent === "string" ? { html: richContent } : buildRichMessage(richContent);
  const richMessage = {
    ...sourceMessage,
    ...(sourceMessage.html ? { html: toRichHtml(sourceMessage.html) } : {})
  };
  const payload = {
    chat_id: chatId,
    message_id: messageId,
    rich_message: richMessage,
    ...(extra.reply_markup ? { reply_markup: extra.reply_markup } : {})
  };

  try {
    return await telegram.callApi("editMessageText", payload);
  } catch (err) {
    const fallbackText = richToFallbackHtml(richMessage.html || richMessage.markdown || "");
    try {
      if (telegram.raw && typeof telegram.raw.editMessageText === "function") {
        return await telegram.raw.editMessageText({
          chat_id: chatId,
          message_id: messageId,
          text: fallbackText,
          parse_mode: "HTML",
          ...(extra.reply_markup ? { reply_markup: extra.reply_markup } : {}),
        });
      }
      return await telegram.editMessageText(chatId, messageId, null, fallbackText, {
        parse_mode: "HTML",
        ...extra
      });
    } catch (editErr) {
      return null;
    }
  }
}

module.exports = {
  buildRichMessage,
  richTable,
  richDetails,
  richSlideshow,
  richCollage,
  toRichHtml,
  richToFallbackHtml,
  sendRichMessageSafe,
  editRichMessageSafe
};
