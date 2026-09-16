const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('order confirmation card joins rich blocks with real newlines', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'main.js'), 'utf8');
  assert.match(source, /function buildOrderConfirmationCard[\s\S]*?\.join\("\\n"\)/);
  assert.doesNotMatch(source, /function buildOrderConfirmationCard[\s\S]*?\.join\("\\\\n"\)/);
});

test('order callbacks preserve variant names containing underscores', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'plugins', 'order-flow.js'), 'utf8');
  assert.match(source, /const \[_, pid, \.\.\.variantParts\] = data\.split\("_"\)/);
  assert.match(source, /const \[action, pid, \.\.\.variantParts\] = data\.split\("_"\)/);
  assert.match(source, /function findVariantLoose/);
});

test('order flow resolves variant names starting with digits (e.g. 1 bulan)', () => {
  const orderFlow = require('../plugins/order-flow');
  const product = {
    id: 11,
    name: 'Canva Pro',
    variants: [
      { name: '1 bulan', price: 1000, stock: 5 },
      { name: '1 tahun', price: 10000, stock: 2 },
      { name: 'v_pro_30', price: 5000, stock: 3 },
    ],
  };

  // Callback tanpa qty (pay_qris, pay_saldo)
  const qrisRes = orderFlow.resolveVariantAndQuantity(product, 'pay_qris_11_1 bulan'.split('_'));
  assert.equal(qrisRes.variant?.name, '1 bulan');
  assert.equal(qrisRes.variantName, '1 bulan');
  assert.equal(qrisRes.jumlahFromCb, null);

  const saldoRes = orderFlow.resolveVariantAndQuantity(product, 'pay_saldo_11_1 bulan'.split('_'));
  assert.equal(saldoRes.variant?.name, '1 bulan');
  assert.equal(saldoRes.variantName, '1 bulan');
  assert.equal(saldoRes.jumlahFromCb, null);

  // Callback dengan qty suffix (confirm_pay)
  const confirmRes = orderFlow.resolveVariantAndQuantity(product, 'confirm_pay_11_1 bulan_2'.split('_'));
  assert.equal(confirmRes.variant?.name, '1 bulan');
  assert.equal(confirmRes.variantName, '1 bulan');
  assert.equal(confirmRes.jumlahFromCb, 2);

  // Callback varian dengan underscore
  const underscoreRes = orderFlow.resolveVariantAndQuantity(product, 'pay_qris_11_v_pro_30'.split('_'));
  assert.equal(underscoreRes.variant?.name, 'v_pro_30');
  assert.equal(underscoreRes.jumlahFromCb, null);
});

test('parseQuantityFromText handles rich tables and plain text formats', () => {
  const orderFlow = require('../plugins/order-flow');

  assert.equal(orderFlow.parseQuantityFromText('<tr><td>Jumlah Pesanan</td><td>x3</td></tr>'), 3);
  assert.equal(orderFlow.parseQuantityFromText('<tr><td>Jumlah Pesanan</td><td>2</td></tr>'), 2);
  assert.equal(orderFlow.parseQuantityFromText('Jumlah Pesanan: x4'), 4);
  assert.equal(orderFlow.parseQuantityFromText('<pre>Jumlah Pesanan | x5</pre>'), 5);
  assert.equal(orderFlow.parseQuantityFromText('Tidak ada teks'), 1);
});

test('pay_saldo confirmation buttons use callbackButton with custom emojis', () => {
  const source = require('fs').readFileSync(require('path').resolve(__dirname, '..', 'plugins', 'order-flow.js'), 'utf8');
  assert.match(source, /callbackButton\(Markup,\s*"Ya, Lanjut Bayar",\s*`confirm_pay_\${pid}_\${variantName}_\${jumlah}`,\s*"success"\)/);
  assert.match(source, /callbackButton\(Markup,\s*"Batal",\s*`cancel_confirm_\${pid}`,\s*"cancel"\)/);
  assert.match(source, /callbackButton\(Markup,\s*"Kembali",\s*`back_\${pid}`,\s*"back"\)/);
});
