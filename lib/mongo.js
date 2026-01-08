const { MongoClient } = require("mongodb");

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || "auto_order_telegram";

let clientPromise;

function isMongoEnabled() {
  return Boolean(MONGODB_URI);
}

async function getMongoClient() {
  if (!isMongoEnabled()) return null;
  if (!clientPromise) {
    const client = new MongoClient(MONGODB_URI);
    clientPromise = client.connect();
  }
  return clientPromise;
}

async function getMongoCollection(name = "app_data") {
  const client = await getMongoClient();
  if (!client) return null;
  return client.db(MONGODB_DB).collection(name);
}

module.exports = {
  getMongoCollection,
  isMongoEnabled,
};
