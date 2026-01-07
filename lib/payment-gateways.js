const logger = require("../utils/logger");
const { gopayClient } = require("./gopay/gopay.client")

const traceKey = `[chiwa:sphy:lib:payment-gateway] `

const gopay = gopayClient

async function isAmountPaidGopay(amount, start, end){
  const res = (await gopay.SearchJournalsLastMinutes({
    start,
    end,
    amount_eq: amount,
  })) 
  const hits = res?.hits ?? [];
  logger.debug(traceKey, `aggregating trx from gopay: `, res)
  return hits.length > 0;
}


async function detectCollision(provider, amount, start, end) {
  if (provider === "gopay") return isAmountPaidGopay(amount, start, end);
}

async function checkStatus(provider, baseTotalAmount, createdAt, expiryAt)  {
 

  const expired = new Date().getTime() > expiryAt


  const deposit = {
    status: 'pending',
    amount: baseTotalAmount,
    provider_ref: null
  }

  if (expired) {
    deposit.status ='expired'
  }

  if (provider === "gopay") {
    const trxs = (await gopay.SearchJournalsRelative({
      start: createdAt,
      end: expiryAt,
      amount_eq: baseTotalAmount,
    }))

    const hit = trxs?.hits && trxs.hits.length > 0 ? trxs.hits[0] : null;
    if (hit) {
      const rrn =
        (hit.metadata?.transaction?.metadata?.INTERNAL_CHALLENGE_ID) ??
        (hit.metadata?.provider_metadata?.metadata?.retrieval_reference_number) ??
        null;
      deposit.provider_ref = rrn
      deposit.status = 'paid'
    }
    return deposit
  }
}

module.exports =  {
  detectCollision,
  checkStatus,
};
