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

const { v4: uuidv4 } = require('uuid');

function tryRequire(id) { try { return require(id); } catch { return null; } }
const _loggerMod = tryRequire('../../utils/logger') || {};
const logger = _loggerMod.default || _loggerMod.info ? _loggerMod : console;

let _fetch = globalThis.fetch;
if (!_fetch) {
  try { _fetch = require('node-fetch'); } catch {}
}
if (!_fetch) {
  throw new Error('fetch is not available. Install node-fetch (npm i node-fetch) or use Node 18+');
}
const fetch = (...args) => _fetch(...args);

const DEFAULT_TIMEOUT_MS = Number(process.env.GOBIZ_HTTP_TIMEOUT_MS ?? 15000);

async function fetchWithTimeout(url, options, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      logger.error(`${traceKey}request timeout after ${timeoutMs}ms: ${url}`);
    } else {
      logger.error(`${traceKey}request error: ${url}`, err);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

const traceKey = `[chiwa:module:gopay] `;
const BASE_URL = 'https://api.gobiz.co.id';

/**
 * @typedef {Object} GopayOptions
 * @property {string} [appId]
 * @property {string} [appVersion]
 * @property {string} [userAgent]
 * @property {string} [phoneMake]
 * @property {string} [phoneModel]
 * @property {string} [platform]
 * @property {string} [countryCode]
 * @property {string} [timezone]
 * @property {string} [userLocale]
 * @property {string} [userType]
 * @property {string} [originPortal]
 * @property {string} [refererPortal]
 * @property {string} [originApp]
 * @property {string} [refererApp]
 */

class gopay {
  /**
   * @param {GopayOptions} [opts]
   */
  constructor(opts) {
    this.requestId = uuidv4();
    this.opts = {
      appId: opts?.appId ?? 'go-biz-web-dashboard',
      appVersion: opts?.appVersion ?? 'platform-v3.82.1',
      userAgent: opts?.userAgent ?? 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
      phoneMake: opts?.phoneMake ?? 'Google',
      phoneModel: opts?.phoneModel ?? 'Nexus 5',
      platform: opts?.platform ?? 'Web',
      countryCode: opts?.countryCode ?? 'ID',
      timezone: opts?.timezone ?? 'Asia/Jakarta',
      userLocale: opts?.userLocale ?? 'id-ID',
      userType: opts?.userType ?? 'merchant',
      originPortal: opts?.originPortal ?? 'https://portal.gofoodmerchant.co.id',
      refererPortal: opts?.refererPortal ?? 'https://portal.gofoodmerchant.co.id/',
      originApp: opts?.originApp ?? 'https://app.gobiz.com',
      refererApp: opts?.refererApp ?? 'https://app.gobiz.com/',
    };
  }

  /**
   * @param {string} email
   * @param {string} password
   * @returns {Promise<{access_token:string, refresh_token:string, dbl_enabled:boolean}|undefined>}
   */
  async getTokensByPassword(email, password) {
    const resLogin = await fetchWithTimeout(`${BASE_URL}/goid/login/request`, {
      method: 'POST',
      headers: this.buildHeaders('login'),
      body: JSON.stringify({
        email,
        login_type: 'password',
        client_id: 'go-biz-web-new',
      }),
    });

    const lJson = await this.safeJson(resLogin);

    if (!resLogin.ok) {
      logger.error(`${traceKey}res initial login error, with status ${resLogin.status} ${JSON.stringify(lJson, null, 2)}`);
      return;
    }

    const resToken = await fetchWithTimeout(`${BASE_URL}/goid/token`, {
      method: 'POST',
      headers: this.buildHeaders('token'),
      body: JSON.stringify({
        client_id: 'go-biz-web-new',
        grant_type: 'password',
        data: { email, password },
      }),
    });

    const json = await this.safeJson(resToken);

    if (!resToken.ok) {
      logger.error(`${traceKey}res get token error, with status ${resToken.status} ${JSON.stringify(json, null, 2)}`);
      return;
    }

    return json ?? undefined;
  }

  /**
   * @param {string} refresh_token
   * @returns {Promise<{access_token:string, refresh_token:string, dbl_enabled:boolean}|undefined>}
   */
  async getTokensByRefreshToken(refresh_token) {
    const resToken = await fetchWithTimeout(`${BASE_URL}/goid/token`, {
      method: 'POST',
      headers: this.buildHeaders('token'),
      body: JSON.stringify({
        client_id: 'go-biz-web-new',
        grant_type: 'refresh_token',
        data: { refresh_token },
      }),
    });

    const json = await this.safeJson(resToken);

    if (!resToken.ok) {
      logger.error(`${traceKey}res get token error, with status ${resToken.status} ${JSON.stringify(json, null, 2)}`);
      return;
    }

    return json ?? undefined;
  }

  /**
   * @param {string} access_token
   * @param {import('./gopay.module').Gopay.JournalsSearchPayload} payload
   * @returns {Promise<import('./gopay.module').Gopay.JournalsSearchResponse|undefined>}
   */
  async searchJournals(access_token, payload) {
    const res = await fetchWithTimeout(`${BASE_URL}/journals/search`, {
      method: 'POST',
      headers: this.buildHeaders('journals', access_token),
      body: JSON.stringify(payload),
    });

    const json = await this.safeJson(res);

    if (!res.ok) {
      logger.error(`${traceKey}res journals search error, with status ${res.status} ${JSON.stringify(json, null, 2)}`);
      return;
    }

    if (!json) {
      logger.error(`${traceKey}res journals search error, empty body`);
      return;
    }

    try {
      const out = this.parseAspiQrToStatic(json);
      return /** @type {import('./gopay.module').Gopay.JournalsSearchResponse} */ (out);
    } catch (e) {
      logger.error(`${traceKey}res journals search error, invalid aspi_qr_data ${JSON.stringify(e)}`);
    }
  }

  /**
   * @param {string} access_token
   * @returns {Promise<import('./gopay.module').Gopay.GetMeResponse|undefined>}
   */
  async getMe(access_token) {
    const res = await fetchWithTimeout(`${BASE_URL}/v1/users/me`, {
      method: 'GET',
      headers: this.buildHeaders('me', access_token),
    });

    const json = await this.safeJson(res);

    if (!res.ok) {
      logger.error(`${traceKey}res get me error, with status ${res.status} ${JSON.stringify(json, null, 2)}`);
      return;
    }

    return json ?? undefined;
  }

  /**
   * @param {import('./gopay.module').Gopay.JournalsSearchResponse} src
   * @returns {import('./gopay.module').Gopay.JournalsSearchResponse}
   * @private
   */
  parseAspiQrToStatic(src) {
    const cloned = {
      success: src.success,
      total: src.total,
      total_relation: src.total_relation,
      aggregations: src.aggregations,
      hits: (src.hits || []).map((h) => {
        const tx = h.metadata && h.metadata.transaction;
        const meta = tx && tx.metadata;
        if (!meta || typeof meta.aspi_qr_data !== 'string') {
          throw new Error('aspi_qr_data not found or not string');
        }
        const parsed = JSON.parse(meta.aspi_qr_data);
        const txMeta = { ...meta, aspi_qr_data: parsed };
        const txStatic = { ...tx, metadata: txMeta };
        const mdStatic = { ...h.metadata, transaction: txStatic };
        return { ...h, metadata: mdStatic };
      }),
    };
    return cloned;
  }

  /**
   * @param {'login'|'token'|'journals'|'me'} kind
   * @param {string} [bearer]
   * @returns {Record<string,string>}
   * @private
   */
  buildHeaders(kind, bearer) {
    const common = {
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': `${this.opts.userLocale},id;q=0.9,en-US;q=0.8,en;q=0.7`,
      'Authentication-Type': 'go-id',
      Authorization: bearer ? `Bearer ${bearer}` : 'Bearer',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Content-Type': 'application/json',
      'Gojek-Country-Code': this.opts.countryCode,
      'Gojek-Timezone': this.opts.timezone,
      Pragma: 'no-cache',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site',
      'User-Agent': this.opts.userAgent,
      'X-AppVersion': this.opts.appVersion,
      'X-PhoneMake': this.opts.phoneMake,
      'X-PhoneModel': this.opts.phoneModel,
      'X-Platform': this.opts.platform,
      'X-User-Locale': this.opts.userLocale,
      'X-User-Type': this.opts.userType,
      dnt: '1',
      'sec-ch-ua': '"Not;A=Brand";v="99", "Google Chrome";v="139", "Chromium";v="139"',
      'sec-ch-ua-mobile': '?1',
      'sec-ch-ua-platform': '"Android"',
      'sec-gpc': '1',
      'x-DeviceOS': 'Web',
      'x-appId': this.opts.appId,
      'x-uniqueid': this.requestId,
    };

    if (kind === 'login') {
      return { ...common, Origin: this.opts.originPortal, Referer: this.opts.refererPortal };
    }

    if (kind === 'token') {
      return { ...common, Origin: this.opts.originApp, Referer: this.opts.refererApp };
    }

    if (kind === 'journals') {
      return {
        ...common,
        Accept: 'application/json, text/plain, */*, application/vnd.journal.v1+json',
        Origin: this.opts.originPortal,
        Referer: this.opts.refererPortal,
      };
    }

    return { ...common, Origin: this.opts.originPortal, Referer: this.opts.refererPortal };
  }

  /**
   * @template T
   * @param {Response} res
   * @returns {Promise<T|null>}
   * @private
   */
  async safeJson(res) {
    try { return await res.json(); }
    catch { return null; }
  }
}

module.exports = { gopay };
