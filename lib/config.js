// lib/config.js
const path = require("path");
const store = require("./mongo-store");

const CONFIG_PATH = path.join(__dirname, "../data/bot-config.json");

async function loadConfig() {
  return store.readJson(CONFIG_PATH, { useQrisFrame: true });
}

async function saveConfig(cfg) {
  await store.writeJson(CONFIG_PATH, cfg);
}

async function isQrisFrameOn() {
  const cfg = await loadConfig();
  return !!cfg.useQrisFrame;
}

async function setQrisFrame(on) {
  const cfg = await loadConfig();
  cfg.useQrisFrame = !!on;
  await saveConfig(cfg);
  return cfg.useQrisFrame;
}

module.exports = {
  isQrisFrameOn,
  setQrisFrame,
};
