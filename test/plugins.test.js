const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

test('plugins/index.js exports registerAllPlugins function', () => {
  const registerAllPlugins = require('../plugins/index');
  assert.equal(typeof registerAllPlugins, 'function');
});

test('plugins load and register handlers without throwing', () => {
  const registerAllPlugins = require('../plugins/index');

  const registered = {
    hears: [],
    commands: [],
    actions: [],
    ons: [],
    uses: [],
  };

  const mockBot = {
    start(handler) {
      registered.commands.push('start');
    },
    hears(pattern, ...handlers) {
      registered.hears.push(pattern);
    },
    command(cmd, ...handlers) {
      registered.commands.push(cmd);
    },
    action(act, ...handlers) {
      registered.actions.push(act);
    },
    on(event, ...handlers) {
      registered.ons.push(event);
    },
    use(...handlers) {
      registered.uses.push(handlers);
    },
    telegram: {
      setMyCommands: async () => true,
    },
    launch: () => {},
    stop: () => {},
  };

  const dummyScope = {
    bot: mockBot,
    CE: () => '',
    fs: require('fs'),
    path: require('path'),
    axios: {},
    FormData: class {},
    Transactions: class {},
    txHandler: {},
    Database: class {
      constructor() {}
      find() { return []; }
      getAll() { return []; }
    },
    store: {
      readJson: async () => [],
      writeJson: async () => {},
      exists: async () => false,
      deleteJson: async () => {},
      listDir: async () => [],
    },
    tx: {
      find: async () => [],
      getAll: async () => [],
    },
    logger: {
      debug: () => {},
      error: () => {},
      warn: () => {},
      info: () => {},
    },
    settingsPath: path.resolve('settings.js'),
    dayjs: require('dayjs'),
    utc: {},
    tz: {},
    STORE_NICKNAME: 'TEST',
    PAYMENT_GATEWAY_LABEL: 'YSPAY',
    normalizeChannelId: () => null,
    CHANNEL_TARGET: null,
    APP_TZ: 'Asia/Jakarta',
    resolveAssetPath: () => '',
    INFO_BANNER_PATH: '',
    CANCELED_BANNER_PATH: '',
    tzLabel: () => 'WIB',
    nowTZ: () => require('dayjs')(),
    fmtFull: () => '',
    fmtShort: () => '',
    fmtDate: () => '',
    fmtTime: () => '',
    greetingByHour: () => 'pagi',
    CronRegistry: class {
      register() {}
      start() {}
    },
    CornService: {
      register: () => {},
      start: () => {},
    },
    trx: {
      create: async () => ({ id: 1, refId: 'REF', total_amount: 1000 }),
      setMessageId: async () => {},
    },
    getSettings: () => ({ info: {}, admins: [], izin: {} }),
    getAdminContactLabel: () => 'admin',
    sessions: new Map(),
    broadcastSessions: new Map(),
    getBroadcastKey: () => null,
    setBroadcastSession: () => {},
    getBroadcastSession: () => null,
    clearBroadcastSession: () => {},
    isAdmin: () => false,
    isAdminNow: () => false,
    productPath: '',
    info: {},
    BOT_NAME: 'TestBot',
    AUTHOR: 'TestAuthor',
    esc: (s) => s,
    rupiah: (n) => String(n),
    FLASH_SALE_PATH: '',
    normalizeVariantName: (s) => s,
    parseFlashSaleTime: () => null,
    calcDiscountPercent: () => 0,
    getActiveFlashSale: () => null,
    getFlashSaleInfo: () => ({ active: false, price: 0 }),
    formatPriceHtml: () => '',
    formatPriceButton: () => '',
    getProductFlashSaleBadge: () => null,
    saldoLabel: () => 'Saldo: 0',
    buildOrderConfirmationCard: () => '',
    buildPaymentConfirmationCard: () => '',
    buildProductCard: () => ({ text: '', keyboard: [] }),
    DB_PATH: '',
    PRODUCTS_PATH: '',
    BOT_TOKEN: '123456:ABC-DEF',
    webServer: { close: () => {} },
    buildFramedQris: async () => '',
    isQrisFrameOn: async () => false,
    sendPaymentAnnouncement: async () => {},
    maskUserId: () => '',
    CUSTOM_EMOJI: {},
    ce: () => '',
    ceRich: () => '',
    ceCaption: () => '',
    applyCustomEmoji: (t) => t,
    cleanButtonLabel: (t) => t,
    callbackButton: () => ({}),
    urlButton: () => ({}),
    keyboardButton: () => ({}),
    inlineButton: () => ({}),
    withCustomEmoji: () => ({}),
    buildRichMessage: () => ({}),
    richTable: () => '',
    richDetails: () => '',
    toRichHtml: (t) => t,
    richToFallbackHtml: (t) => t,
    sendRichMessageSafe: async () => null,
    editRichMessageSafe: async () => null,
    getDb: async () => null,
    isMongoEnabled: () => false,
    createSessionStore: () => ({ get: async () => null, set: async () => {}, delete: async () => {} }),
    ValidateTransactions: async () => {},
    sendOrderLogToChannel: async () => {},
    Telegraf: class {},
    Markup: {
      button: { callback: () => ({}), url: () => ({}) },
      keyboard: () => ({ resize: () => ({}) }),
      inlineKeyboard: () => ({}),
    },
    session: () => (ctx, next) => next(),
    startDashboard: () => ({ close: () => {} }),
    approveTelegramLogin: () => true,
    loadProducts: async () => [],
    saveProducts: async () => {},
    loadFlashSales: async () => [],
    saveFlashSales: async () => {},
    skipLaunch: true,
  };

  assert.doesNotThrow(() => {
    registerAllPlugins(dummyScope);
  });

  assert.ok(registered.commands.length > 10, `Expected >10 commands, got ${registered.commands.length}`);
  assert.ok(registered.hears.length > 5, `Expected >5 hears, got ${registered.hears.length}`);
  assert.ok(registered.actions.length > 10, `Expected >10 actions, got ${registered.actions.length}`);
});
