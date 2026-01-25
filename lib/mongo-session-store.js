const path = require("path");
const fileStore = require("./file-store");
const { getDb, isMongoEnabled } = require("./mongo");

const COLLECTION = "sessions";
const SESSION_DIR = path.resolve("data/sessions");

async function getCollection() {
  const db = await getDb();
  return db.collection(COLLECTION);
}

function getSessionPath(key) {
  const safeKey = encodeURIComponent(String(key));
  return path.join(SESSION_DIR, `${safeKey}.json`);
}

function createSessionStore() {
  if (!isMongoEnabled()) {
    return {
      async get(key) {
        return fileStore.readJson(getSessionPath(key), undefined);
      },
      async set(key, value) {
        await fileStore.writeJson(getSessionPath(key), value);
      },
      async delete(key) {
        await fileStore.deleteJson(getSessionPath(key));
      },
    };
  }

  return {
    async get(key) {
      const col = await getCollection();
      const doc = await col.findOne({ _id: key });
      return doc?.value;
    },
    async set(key, value) {
      const col = await getCollection();
      await col.updateOne(
        { _id: key },
        { $set: { value, updatedAt: new Date() } },
        { upsert: true }
      );
    },
    async delete(key) {
      const col = await getCollection();
      await col.deleteOne({ _id: key });
    },
  };
}

module.exports = {
  createSessionStore,
};
