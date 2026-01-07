// lib/config.js
const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "../data/bot-config.json");

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    // default kalau file belum ada
    return { useQrisFrame: true };
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

function isQrisFrameOn() {
  const cfg = loadConfig();
  return !!cfg.useQrisFrame;
}

function setQrisFrame(on) {
  const cfg = loadConfig();
  cfg.useQrisFrame = !!on;
  saveConfig(cfg);
  return cfg.useQrisFrame;
}

module.exports = {
  isQrisFrameOn,
  setQrisFrame,
};
