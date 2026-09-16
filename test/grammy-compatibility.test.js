const test = require('node:test');
const assert = require('node:assert/strict');
const { Bot, Api, InputFile, setupBotCompatibility } = require('../lib/grammy-compat');
const { createSessionStore } = require('../lib/mongo-session-store');

test('grammY bot initializes with shims and compatibility helpers', () => {
  const bot = setupBotCompatibility(new Bot('123456:ABC-DEF'));

  assert.equal(typeof bot.launch, 'function');
  assert.equal(typeof bot.action, 'function');
  assert.equal(bot.telegram, bot.api);
  assert.equal(typeof bot.api.callApi, 'function');
  assert.equal(typeof bot.api.getFileLink, 'function');
  assert.equal(typeof Api.prototype.callApi, 'function');
  assert.equal(typeof Api.prototype.getFileLink, 'function');
});

test('grammY transformer normalizes { source } objects into InputFile', async () => {
  const bot = new Bot('123456:ABC-DEF');

  let interceptedPayload = null;
  bot.api.config.use(async (prev, method, payload, signal) => {
    interceptedPayload = payload;
    return { ok: true, result: {} };
  });

  setupBotCompatibility(bot);

  await bot.api.sendPhoto(12345, { source: Buffer.from('test'), filename: 'test.png' });
  assert.ok(interceptedPayload);
  assert.ok(interceptedPayload.photo instanceof InputFile);
});

test('session store implements both get/set and read/write for grammY compatibility', async () => {
  const store = createSessionStore();
  assert.equal(typeof store.get, 'function');
  assert.equal(typeof store.set, 'function');
  assert.equal(typeof store.read, 'function');
  assert.equal(typeof store.write, 'function');
  assert.equal(typeof store.delete, 'function');

  // Test read/write pass-through
  const testKey = 'test_key_' + Date.now();
  await store.write(testKey, { count: 42 });
  const val = await store.read(testKey);
  assert.deepEqual(val, { count: 42 });
  await store.delete(testKey);
  const afterDelete = await store.read(testKey);
  assert.equal(afterDelete, undefined);
});

test('TX_PATH is defined and loaded properly in main.js', () => {
  const mainSource = require('fs').readFileSync(require('path').resolve(__dirname, '..', 'main.js'), 'utf8');
  assert.match(mainSource, /const TX_PATH = path\.resolve\(__dirname, "data\/transactions\.json"\);/);
  assert.match(mainSource, /TX_PATH: TX_PATH/);
});
