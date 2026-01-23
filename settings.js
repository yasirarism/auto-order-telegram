const parseCsv = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const parseEnvBool = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(normalized)) return true;
  if (["0", "false", "no", "n"].includes(normalized)) return false;
  return undefined;
};

const buildAdminsFromEnv = () => {
  if (process.env.ADMIN_JSON) {
    try {
      const parsed = JSON.parse(process.env.ADMIN_JSON);
      if (Array.isArray(parsed)) {
        return parsed.filter((admin) => admin && typeof admin === "object");
      }
    } catch (error) {
      console.warn("⚠️ ADMIN_JSON tidak valid, fallback ke default.");
    }
  }

  const ids = parseCsv(process.env.ADMIN_IDS || process.env.ADMIN_ID);
  const usernames = parseCsv(
    process.env.ADMIN_USERNAMES || process.env.ADMIN_USERNAME
  );
  if (!ids.length && !usernames.length) return null;

  const count = Math.max(ids.length, usernames.length);
  const admins = Array.from({ length: count }, (_, index) => {
    const admin = {};
    if (ids[index]) admin.id = ids[index];
    if (usernames[index]) admin.username = usernames[index];
    return admin;
  }).filter((admin) => Object.keys(admin).length > 0);

  return admins.length ? admins : null;
};

const defaultSettings = {
  info: {
    BOT_NAME: "YS Auto Order Bot",
    VERSION: "2.0",
    AUTHOR: "Yasir",
  },
  admins: [
    {
      id: "2024984460", // Ganti dengan ID Telegram kamu
      username: "Yasir_ID", // Ganti dengan username Telegram kamu
    },
  ],
  izin: {
    allowUserCekSnk: false,
  },
};

const envAdmins = buildAdminsFromEnv();
const envAllowUserCekSnk = parseEnvBool(process.env.ALLOW_USER_CEK_SNK);

module.exports = {
  info: {
    BOT_NAME: process.env.BOT_NAME || defaultSettings.info.BOT_NAME,
    VERSION: process.env.BOT_VERSION || defaultSettings.info.VERSION,
    AUTHOR: process.env.BOT_AUTHOR || defaultSettings.info.AUTHOR,
  },
  admins: envAdmins || defaultSettings.admins,
  izin: {
    allowUserCekSnk:
      envAllowUserCekSnk !== undefined
        ? envAllowUserCekSnk
        : defaultSettings.izin.allowUserCekSnk,
  },
};
