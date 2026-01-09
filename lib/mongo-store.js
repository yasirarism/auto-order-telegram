const path = require("path");
const { getDb } = require("./mongo");

const COLLECTION = "kv_store";

function normalizeKey(filePath) {
  return path.resolve(filePath);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function getCollection() {
  const db = await getDb();
  return db.collection(COLLECTION);
}

async function readJson(filePath, defaultValue) {
  const key = normalizeKey(filePath);
  const col = await getCollection();
  const doc = await col.findOne({ key });
  if (!doc) return defaultValue;
  return doc.value;
}

async function writeJson(filePath, value) {
  const key = normalizeKey(filePath);
  const col = await getCollection();
  await col.updateOne(
    { key },
    { $set: { key, value, updatedAt: new Date() } },
    { upsert: true }
  );
}

async function exists(filePath) {
  const key = normalizeKey(filePath);
  const col = await getCollection();
  const doc = await col.findOne({ key }, { projection: { _id: 1 } });
  return Boolean(doc);
}

async function deleteJson(filePath) {
  const key = normalizeKey(filePath);
  const col = await getCollection();
  await col.deleteOne({ key });
}

async function listDir(dirPath) {
  const base = path.resolve(dirPath);
  const prefix = base.endsWith(path.sep) ? base : `${base}${path.sep}`;
  const regex = new RegExp(`^${escapeRegex(prefix)}`);
  const col = await getCollection();
  const docs = await col
    .find({ key: { $regex: regex } }, { projection: { key: 1 } })
    .toArray();
  return docs.map((doc) => path.basename(doc.key));
}

module.exports = {
  readJson,
  writeJson,
  exists,
  deleteJson,
  listDir,
};
