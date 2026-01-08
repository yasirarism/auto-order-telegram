const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { getMongoCollection, isMongoEnabled } = require("./mongo");

const DEFAULT_DB = {
  users: {},
  stats: { totalUsers: 0, totalSold: 0, totalTransaksi: 0 },
};

async function readJsonFile(filePath, fallback) {
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath, data) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

async function syncFromMongo({ key, filePath, fallback }) {
  const collection = await getMongoCollection("app_data");
  if (!collection) return;

  const doc = await collection.findOne({ _id: key });
  if (doc && doc.value !== undefined) {
    await writeJsonFile(filePath, doc.value);
    return;
  }

  const fileData = await readJsonFile(filePath, fallback);
  await collection.updateOne(
    { _id: key },
    { $set: { value: fileData } },
    { upsert: true }
  );
  if (!fs.existsSync(filePath)) {
    await writeJsonFile(filePath, fileData);
  }
}

function watchFileSync({ key, filePath }) {
  if (!fs.existsSync(filePath)) return;

  let timer;
  fs.watch(filePath, { persistent: false }, () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const collection = await getMongoCollection("app_data");
        if (!collection) return;
        const data = await readJsonFile(filePath, null);
        if (data === null) return;
        await collection.updateOne(
          { _id: key },
          { $set: { value: data } },
          { upsert: true }
        );
      } catch (err) {
        console.error("⚠️ Gagal sync file ke MongoDB:", err.message);
      }
    }, 200);
  });
}

async function initMongoSync({ dbPath, productsPath, transactionsPath, ordersPath }) {
  if (!isMongoEnabled()) return;

  await syncFromMongo({ key: "db", filePath: dbPath, fallback: DEFAULT_DB });
  await syncFromMongo({ key: "products", filePath: productsPath, fallback: [] });
  await syncFromMongo({ key: "transactions", filePath: transactionsPath, fallback: [] });

  if (ordersPath) {
    await syncFromMongo({ key: "orders", filePath: ordersPath, fallback: [] });
  }

  watchFileSync({ key: "db", filePath: dbPath });
  watchFileSync({ key: "products", filePath: productsPath });
  watchFileSync({ key: "transactions", filePath: transactionsPath });
  if (ordersPath) {
    watchFileSync({ key: "orders", filePath: ordersPath });
  }
}

module.exports = {
  initMongoSync,
};
