const { getDb } = require("./mongo");

const COLLECTION = "sessions";

async function getCollection() {
  const db = await getDb();
  return db.collection(COLLECTION);
}

function createSessionStore() {
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
