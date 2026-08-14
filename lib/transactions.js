const QRIS = require('../utils/qr')
const Database = require('./database')
const { detectCollision, checkStatus } = require('./payment-gateways')
const { webcrypto: crypto } = require('node:crypto')
require('dotenv').config({quiet: true})

const paymentGatewayProvider = process.env.PAYMENT_GATEWAY ?? 'gopay'
const paymentExpiryIn = Number(process.env.PAYMENT_EXPIRES_MINUTES ?? 1)
const qrBase = process.env.QR_STRING 

const tx = new Database('./data/transactions.json')


function generateTrxId() {
  const now = new Date()
  const yyyy = String(now.getFullYear()).padStart(4, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const base = `${yyyy}${mm}${dd}`
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase()
  const label = (process.env.PAYMENT_GATEWAY_LABEL || 'SENPRO')
    .replace(/\s+/g, '')
    .toUpperCase()
  return `${label}-${base}-${rnd}`
}



class Transactions {
  async create(userId, username, productId, variantName, baseTotalAmount, qty, metadata = {}) {
    switch (paymentGatewayProvider) {
      case 'gopay': {
        const now = Date.now()
        const txStart = new Date(now - paymentExpiryIn * 60 * 1000)
        const txEnd = new Date(now)
        const expiryAt = new Date(now + paymentExpiryIn * 60 * 1000)

        let amount = Number(baseTotalAmount)
        for (let i = 0; i < 1000; i++) {
          const localCol = await tx.find(t => {
            const isPending = t.status === 'pending'
            const sameAmount = Number(t.total_amount) === amount
            const createdAt = new Date(t.created_at)
            const inWindow = createdAt >= txStart && createdAt <= txEnd
            return isPending && sameAmount && inWindow
          })
          const hasLocal = Array.isArray(localCol) ? localCol.length > 0 : Boolean(localCol)
          if (hasLocal) {
            amount += 1
            continue
          }
          const collision = await detectCollision(paymentGatewayProvider, amount, txStart, txEnd)
          if (!collision) break
          amount += 1
        }

        const referenceId = generateTrxId()

        const row = await tx.add({
          user_id: userId,
          reference_id: referenceId,
          username,
          product_id: productId,
          variant_name: variantName,
          qty: Number(qty),
          method: 'qris',
          amount: Number(baseTotalAmount),
          total_amount: amount,
          message_id: 0,
          status: 'pending',
          pg_provider: paymentGatewayProvider,
          created_at: new Date().getTime(),
          expires_at: expiryAt.getTime(),
          warn_sent: false,
          sent_account: false,
          // Metadata dipakai dashboard untuk menampilkan status order yang dibuat
          // dari web. Field sensitif tidak pernah dikirim kembali lewat API publik.
          source: metadata.source || 'telegram',
          web_order_token: metadata.webOrderToken || null
        })

        const qr_url = new QRIS(amount, qrBase).toURL()

        return { qr_url, refId: referenceId, total_amount: amount, id: row.id }
      }
      default:
        throw new Error(`Payment dengan ${paymentGatewayProvider} belum didukung`)
    }
  }

  async validate(txIds) {
  const ids = Array.isArray(txIds) ? txIds : [txIds];
  const totalValidated = [];

  for (const id of ids) {
    // Ambil status TERKINI sebelum hit gateway
    let current = await tx.findById(id);
    if (!current) continue;

    // Kalau sudah bukan pending (canceled/completed/expired), jangan hit gateway & jangan overwrite
    if (String(current.status || '').toLowerCase() !== 'pending') {
      totalValidated.push({
        id: current.id,
        qty: current.qty,
        status: current.status,
        message_id: current.message_id,
        user_id: current.user_id,
        reference_id: current.reference_id,
        username: current.username,
        amount: current.amount,
        total_amount: current.total_amount,
        method: current.method,
        product_id: current.product_id,
        variant_name: current.variant_name
      });
      continue;
    }

    // Masih pending → baru hit gateway
    const res = await checkStatus(
      current.pg_provider,
      current.total_amount,
      current.created_at,
      current.expires_at
    );

    // Double-check: selama nunggu gateway, status bisa berubah (mis. dibatalkan)
    const latest = await tx.findById(id);
    if (!latest) continue;

    if (String(latest.status || '').toLowerCase() !== 'pending') {
      // Sudah berubah (mis. canceled) → jangan overwrite
      totalValidated.push({
        id: latest.id,
        qty: latest.qty,
        status: latest.status,
        message_id: latest.message_id,
        user_id: latest.user_id,
        reference_id: latest.reference_id,
        username: latest.username,
        amount: latest.amount,
        total_amount: latest.total_amount,
        method: latest.method,
        product_id: latest.product_id,
        variant_name: latest.variant_name
      });
      continue;
    }

    // Masih pending → aman di-update dengan status dari gateway
    const updated = { ...latest, status: res.status };
    await tx.update(latest.id, updated);

    totalValidated.push({
      id: updated.id,
      qty: updated.qty,
      status: updated.status,
      message_id: updated.message_id,
      user_id: updated.user_id,
      reference_id: updated.reference_id,
      username: updated.username,
      amount: updated.amount,
      total_amount: updated.total_amount,
      method: updated.method,
      product_id: updated.product_id,
      variant_name: updated.variant_name
    });
  }

  return totalValidated;
}

  async setMessageId(trx_id, messageId) {
    const data = await tx.findById(trx_id)
    if (!data) return null
    data.message_id = messageId
    return await tx.update(trx_id, data)
  }
}

module.exports = Transactions
