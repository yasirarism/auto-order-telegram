'use strict';

/**
Copyright (c) 2025 Chiwa Workspace
+abuses@chiwa.id

Permission is hereby granted, free of charge, to use, copy, and modify this software for personal or internal commercial purposes, subject to the following conditions:

1. Restricted Redistribution & Source Disclosure
- Redistribution, sublicensing, resale, or any form of source disclosure of this software or its derivative modules to any third party is strictly prohibited without explicit written consent or a valid license from the Maintainer.
- This includes, but is not limited to: publishing the source code, embedding the module in public repositories, or sharing binaries derived from it.

2. Commercial Usage
- The use of this software within commercial or revenue-generating environments is permitted only if the software is not itself commercialized, resold, sublicensed, or distributed externally.
- Any direct monetization of the module, or offering it as a standalone product or service, requires a separate commercial license.

3. Attribution
- All copies or substantial portions of the software must include this license and copyright notice.

4. Long-Term Support (LTS) Disclaimer
- The Maintainer provides support only within the official Long-Term Support (LTS) period.
- The existence of an LTS period must be explicitly stated, documented, and verifiably provided by the Maintainer.
- In the absence of such written and verifiable declaration, no LTS obligation shall be assumed.
- After the LTS period has ended, or if none was formally declared, the Maintainer has no obligation to provide updates, bug fixes, or security patches.

5. Limitation of Liability
- The software is provided "AS IS", without warranty of any kind, express or implied.
- In no event shall the Maintainer or copyright holders be liable for any claim, damages, or other liability, whether in an action of contract, tort, or otherwise, arising from or in connection with the software or its use.

6. Prohibited Actions
- Commercialization, sublicensing, redistribution, or disclosure of the source code or compiled binaries without explicit permission.
- Use in unlawful, malicious, exploitative, or harmful activities.
- Inclusion in datasets or systems designed to reproduce, learn from, or redistribute the module without authorization.

7. Disclaimer
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.
"Chiwa Workspace" IS NOT AFFILIATED WITH OR ENDORSED BY GOJEK OR ANY OF ITS SUBSIDIARIES.
IN NO EVENT SHALL THE MAINTAINERS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY, WHETHER IN CONTRACT, TORT, OR OTHERWISE, ARISING FROM, OUT OF, OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE, INCLUDING BUT NOT LIMITED TO ANY LOSSES INCURRED OUTSIDE THE LTS SUPPORT PERIOD.
*/


const { Config } = require('./gopay.config.adapter');
const { gopay: GopayClient } = require('./gopay.module'); 
function tryRequire(id) { try { return require(id); } catch { return null; } }
const _loggerMod = tryRequire(`../../utils/logger`) || {};
const logger = _loggerMod.default || _loggerMod.info ? _loggerMod : console;

const traceKey = `[chiwa:ceir:repositories:Gopay] `;

const gopay = new GopayClient({
  userLocale: 'id-ID',
  timezone: 'Asia/Jakarta',
});

class GopayRepositories {

  async AuthenticateGopay() {
    logger.info(traceKey + 'authenticate start');
    let access = await Config.get('GOBIZ_ACCESS_TOKEN');
    let refresh = await Config.get('GOBIZ_REFRESH_TOKEN');

    if (!access && !refresh) {
      logger.info(traceKey + 'no tokens in config, trying password login');
      const tokens = await this.loginByPasswordOrFail();
      access = tokens.access_token;
      refresh = tokens.refresh_token;
      await this.persistTokens(access, refresh);
    }

    const me = await gopay.getMe(access);
    const isValid =
      !!me && (typeof me.user?.expired !== 'boolean' ? true : me.user.expired === false);

    if (me?.user?.merchant_id) {
      await Config.set('GOBIZ_MERCHANT_ID', me.user.merchant_id);
    }

    if (isValid) {
      logger.debug(traceKey + 'access token valid');
      logger.info(traceKey + 'authenticate success (cached token)');
      return access;
    }

    if (!refresh) {
      logger.error(traceKey + 'access invalid and no refresh token available');
      throw new Error('Gopay auth failed: access invalid & no refresh token');
    }

    logger.info(traceKey + 'access invalid, trying refresh token');
    let refreshed = await gopay.getTokensByRefreshToken(refresh);
    if (!refreshed) {
      logger.error(traceKey + 'refresh token flow failed, last try with get token by password');
      refreshed = await this.loginByPasswordOrFail(); 
      await this.persistTokens(refreshed.access_token, refreshed.refresh_token);
      const again = await gopay.getMe(refreshed.access_token);
      const ok =
        !!again && (typeof again.user?.expired !== 'boolean' ? true : again.user.expired === false);
      if (!ok) {
        logger.error(traceKey + 'token still invalid after password login');
        throw new Error('Gopay auth failed after password login');
      }
      if (again?.user?.merchant_id) {
        await Config.set('GOBIZ_MERCHANT_ID', again.user.merchant_id);
      }
      logger.info(traceKey + 'password login success & token valid');
      return refreshed.access_token;
    }

    await this.persistTokens(refreshed.access_token, refreshed.refresh_token);
    const meAfter = await gopay.getMe(refreshed.access_token);
    const stillValid =
      !!meAfter && (typeof meAfter.user?.expired !== 'boolean' ? true : meAfter.user.expired === false);

    if (!stillValid) {
      logger.error(traceKey + 'token still invalid after refresh');
      throw new Error('Gopay auth failed after refresh');
    }

    if (meAfter?.user?.merchant_id) {
      await Config.set('GOBIZ_MERCHANT_ID', meAfter.user.merchant_id);
    }

    logger.info(traceKey + 'refresh success & token valid');
    return refreshed.access_token;
  }

  /**
   * @param {Object} opts
   * @returns {Promise<import('./gopay.module').JournalsSearchResponse|undefined>}
   */
async SearchJournalsRelative(opts = {}) {
  const access = await this.AuthenticateGopay();
  const now = new Date();

  const resolveDate = (input, fallback) => {
    if (input == null) return fallback;
    if (input instanceof Date) return input;

    if (typeof input === 'number') {
      const ms = input > 1e12 ? input : input * 1000;
      const d = new Date(ms);
      return isNaN(d.getTime()) ? fallback : d;
    }

    if (typeof input === 'string') {
      const d = new Date(input);
      return isNaN(d.getTime()) ? fallback : d;
    }

    if (typeof input === 'object' && input !== null) {
      const amount = Number(input.amount);
      const unit = String(input.unit || '').toLowerCase();
      const mult =
        unit.startsWith('min')  ? 60_000 :
        unit.startsWith('hour') ? 3_600_000 :
        unit.startsWith('sec')  ? 1_000 :
        unit.startsWith('day')  ? 86_400_000 :
        NaN;

      if (Number.isFinite(amount) && Number.isFinite(mult)) {
        const d = new Date(now.getTime() - amount * mult);
        return isNaN(d.getTime()) ? fallback : d;
      }
    }
    
    return fallback;
  };

  const start = resolveDate(opts.start, undefined);
  const end   = resolveDate(opts.end, now);

  let _start = start, _end = end;
  if (_start && _end && _start > _end) {
    const tmp = _start; _start = _end; _end = tmp;
  }

  const sortOrder = opts.sort ?? 'desc';
  const from = opts.from ?? 0;
  const size = opts.size ?? 50;

  const mid = await Config.get('GOBIZ_MERCHANT_ID');

  const andClauses = [
    ...(_start ? [{ field: 'metadata.transaction.transaction_time', op: 'gte', value: _start.toISOString() }] : []),
    ...(_end   ? [{ field: 'metadata.transaction.transaction_time', op: 'lte', value: _end.toISOString()   }] : []),
    { field: 'metadata.transaction.merchant_id', op: 'equal', value: mid },
  ];

  if (opts.amount_eq != null) {
    andClauses.push({
      field: 'metadata.transaction.gross_amount',
      op: 'equal',
      value: Math.round(Number(opts.amount_eq) * 100), 
    });
  }

  const payload = {
    from,
    size,
    sort: { time: { order: sortOrder } },
    ...(opts.included_categories ? { included_categories: opts.included_categories } : {}),
    query: [{ clauses: andClauses, op: 'and' }],
  };

  return gopay.searchJournals(access, payload);
}


  async SearchJournalsLastMinutes(opts) { return this.SearchJournalsRelative(opts); }
  async SearchJournalsLastHours(opts)   { return this.SearchJournalsRelative(opts); }
  async SearchJournalsLastDays(opts)    { return this.SearchJournalsRelative(opts); }

  async loginByPasswordOrFail() {
    const email = await Config?.get('GOBIZ_EMAIL') || process.env.GOBIZ_EMAIL;
    const password = await Config?.get('GOBIZ_PASSWORD') || process.env.GOBIZ_PASSWORD;

    if (!email || !password) {
      logger.error(traceKey + 'missing GOBIZ_EMAIL or GOBIZ_PASSWORD in JSON');
      throw new Error('missing GOBIZ_EMAIL or GOBIZ_PASSWORD');
    }

    const tokens = await gopay.getTokensByPassword(email, password);
    if (!tokens) {
      logger.error(traceKey + 'your gobiz email or password is incorrect');
      throw new Error('gobiz email/password incorrect');
    }
    return tokens;
  }

  async persistTokens(access, refresh) {
    await Config.set('GOBIZ_ACCESS_TOKEN', access);
    await Config.set('GOBIZ_REFRESH_TOKEN', refresh);
  }
}

const gopayClient = new GopayRepositories()

module.exports = { gopayClient, Config };
