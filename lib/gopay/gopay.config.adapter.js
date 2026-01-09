'use strict';

const path = require('path');
const store = require('../mongo-store');

const CONFIG_PATH = path.resolve(__dirname, './gopay.creds.json');

async function readAll() {
  return store.readJson(CONFIG_PATH, {});
}

async function writeAll(obj) {
  await store.writeJson(CONFIG_PATH, obj);
}

const Config = {
  path: CONFIG_PATH,
  async get(key) {
    const all = await readAll();
    return all[key];
  },
  async set(key, value) {
    const all = await readAll();
    all[key] = value;
    await writeAll(all);
  },
  async all() {
    return readAll();
  }
};

module.exports = { Config };
