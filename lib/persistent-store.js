const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { getMongoCollection, isMongoEnabled } = require("./mongo");

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

async function readStore({ key, filePath, fallback }) {
  if (!isMongoEnabled()) {
    return readJsonFile(filePath, fallback);
  }

  const collection = await getMongoCollection("app_data");
  if (!collection) {
    return readJsonFile(filePath, fallback);
  }

  const doc = await collection.findOne({ _id: key });
  if (doc && doc.value !== undefined) {
    await writeJsonFile(filePath, doc.value);
    return doc.value;
  }

  const fileData = await readJsonFile(filePath, fallback);
  await collection.updateOne(
    { _id: key },
    { $set: { value: fileData } },
    { upsert: true }
  );
  await writeJsonFile(filePath, fileData);
  return fileData;
}

async function writeStore({ key, filePath, value }) {
  if (isMongoEnabled()) {
    const collection = await getMongoCollection("app_data");
    if (collection) {
      await collection.updateOne(
        { _id: key },
        { $set: { value } },
        { upsert: true }
      );
      await writeJsonFile(filePath, value);
      return;
    }
  }

  await writeJsonFile(filePath, value);
}

module.exports = {
  readStore,
  writeStore,
};
