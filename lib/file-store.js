const fs = require("fs/promises");
const path = require("path");

function normalizePath(filePath) {
  return path.resolve(filePath);
}

async function readJson(filePath, defaultValue) {
  const fullPath = normalizePath(filePath);
  try {
    const raw = await fs.readFile(fullPath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return defaultValue;
    }
    console.warn(`⚠️ Gagal baca JSON lokal: ${fullPath}`);
    return defaultValue;
  }
}

async function writeJson(filePath, value) {
  const fullPath = normalizePath(filePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, JSON.stringify(value, null, 2));
}

async function exists(filePath) {
  const fullPath = normalizePath(filePath);
  try {
    await fs.access(fullPath);
    return true;
  } catch (_) {
    return false;
  }
}

async function deleteJson(filePath) {
  const fullPath = normalizePath(filePath);
  try {
    await fs.unlink(fullPath);
  } catch (error) {
    if (error && error.code !== "ENOENT") {
      console.warn(`⚠️ Gagal hapus file lokal: ${fullPath}`);
    }
  }
}

async function listDir(dirPath) {
  const base = normalizePath(dirPath);
  try {
    const entries = await fs.readdir(base, { withFileTypes: true });
    return entries.map((entry) => entry.name);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return [];
    }
    console.warn(`⚠️ Gagal baca folder lokal: ${base}`);
    return [];
  }
}

module.exports = {
  readJson,
  writeJson,
  exists,
  deleteJson,
  listDir,
};
