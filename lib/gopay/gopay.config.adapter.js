'use strict';

const fs = require('fs/promises');
const path = require('path');

const CONFIG_PATH = path.resolve(__dirname, './gopay.creds.json');

async function readAll() {
  try {
    const txt = await fs.readFile(CONFIG_PATH, 'utf8');
    return JSON.parse(txt);
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      await writeAll({});
      return {};
    }
    throw e;
  }
}

async function writeAll(obj) {
  const dir = path.dirname(CONFIG_PATH);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify(obj, null, 2), 'utf8');
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
