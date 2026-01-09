const { MongoClient } = require("mongodb");

let clientPromise;

function getMongoUri() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI belum diisi di .env");
  }
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
};
