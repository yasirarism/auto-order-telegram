const { MongoClient } = require("mongodb");

let clientPromise;

function isMongoEnabled() {
  return Boolean(process.env.MONGODB_URI && String(process.env.MONGODB_URI).trim());
}

function getMongoUri() {
  if (!isMongoEnabled()) {
    throw new Error("MONGODB_URI belum diisi di .env");
  }
  const uri = String(process.env.MONGODB_URI).trim();
  return uri;
}

async function getClient() {
  if (!clientPromise) {
    const uri = getMongoUri();
    const client = new MongoClient(uri);
    clientPromise = client.connect();
  }
  return clientPromise;
}

async function getDb() {
  const client = await getClient();
  const dbName = process.env.MONGODB_DB || "auto_order";
  return client.db(dbName);
}

module.exports = {
  getDb,
  isMongoEnabled,
};
