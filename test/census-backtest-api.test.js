// Tests for api/backtest.js: auth gating, input validation, and a full
// happy-path run with global.fetch mocked (no real network — deterministic
// synthetic klines stand in for Binance).
// Run: node test/census-backtest-api.test.js

process.env.VEKTOR_ADMIN_KEY = 'test-admin-key';
delete process.env.UPSTASH_REDIS_REST_URL; // keep the rate limiter fail-open for this test
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const handler = require('../api/backtest.js');

function mockRes() {
  return {
    _status: 200, _json: null, _headers: {},
    setHeader(k, v) { this._headers[k] = v; },
    status(c) { this._status = c; return this; },
    json(o) { this._json = o; return this; },
    end() { return this; },
  };
}
async function call(body, headers = {}) {
  const res = mockRes();
  await handler({ method: 'POST', headers, body }, res);
  return res;
}

const VALID_BODY = {
  ruleset: {
    entry: [{ type: 'rsi_below', period: 14, value: 35 }],
    stop_pct: 0.02,
    take_profit_pct: 0.02,
    max_hold_bars: 10,
    seed: 42,
  },
  universe: ['BTCUSDT'],
  interval: '1h',
  start: '2024-01-01',
  end: '2024-02-01',
};
const AUTH = { 'x-vektor-admin-key': 'test-admin-key' };

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name} — ${detail !== undefined ? detail : 'failed'}`); }
}

(async () => {
  // ---- auth gate ----
  check('rejects a request with no admin key', (await call(VALID_BODY, {}))._status === 401);
  check('rejects a request with the wrong admin key', (await call(VALID_BODY, { 'x-vektor-admin-key': 'wrong' }))._status === 401);
  {
    const res = mockRes();
    await handler({ method: 'GET', headers: AUTH, body: null }, res);
    check('rejects GET', res._status === 405, res._status);
  }

  // ---- input validation (all under valid auth) ----
  check('rejects missing ruleset.entry',
    (await call({ ...VALID_BODY, ruleset: { stop_pct: 0.02, take_profit_pct: 0.02 } }, AUTH))._status === 400);
  check('rejects missing stop_pct/take_profit_pct',
    (await call({ ...VALID_BODY, ruleset: { entry: [{ type: 'always' }] } }, AUTH))._status === 400);
  check('rejects an empty universe',
    (await call({ ...VALID_BODY, universe: [] }, AUTH))._status === 400);
  check('rejects more than 10 symbols',
    (await call({ ...VALID_BODY, universe: Array(11).fill('BTCUSDT') }, AUTH))._status === 400);
  check('rejects missing interval',
    (await call({ ...VALID_BODY, interval: undefined }, AUTH))._status === 400);
  check('rejects end before start',
    (await call({ ...VALID_BODY, start: '2024-02-01', end: '2024-01-01' }, AUTH))._status === 400);
  check('rejects an invalid cost_label',
    (await call({ ...VALID_BODY, cost_label: '5x' }, AUTH))._status === 400);

  // ---- happy path, with global.fetch mocked to synthetic (non-network) klines ----
  {
    const realFetch = global.fetch;
    const HOUR = 3600000;
    global.fetch = async (url) => {
      const u = new URL(url);
      const startTime = Number(u.searchParams.get('startTime'));
      const endTime = Number(u.searchParams.get('endTime'));
      const rows = [];
      for (let t = startTime, i = 0; t <= endTime && i < 1000; t += HOUR, i++) {
        const price = 100 + Math.sin(t / (HOUR * 6)) * 6 + Math.sin(t / (HOUR * 37)) * 3;
        rows.push([t, String(price - 0.3), String(price + 1), String(price - 1), String(price), '10', t + HOUR - 1, '0', 0, '0', '0', '0']);
      }
      return { ok: true, json: async () => rows };
    };

    try {
      const res = await call(VALID_BODY, AUTH);
      check('happy path: returns 200', res._status === 200, JSON.stringify(res._json));
      check('happy path: response includes the falsification block', res._json && typeof res._json.block === 'string' && res._json.block.includes('Empirical falsification'));
      check('happy path: response includes real/random/wrong-sign metrics at 1x/2x/3x',
        res._json && res._json.metrics && ['1x', '2x', '3x'].every((k) =>
          res._json.metrics.real[k] && res._json.metrics.random_entry_null[k] && res._json.metrics.wrong_sign_null[k]));
      check('happy path: per_symbol reports the requested symbol', res._json && res._json.per_symbol && 'BTCUSDT' in res._json.per_symbol);
    } finally {
      global.fetch = realFetch;
    }
  }

  // ---- a data-fetch failure surfaces as a clean error, not a 500 crash ----
  {
    const realFetch = global.fetch;
    global.fetch = async () => ({ ok: false, status: 451, text: async () => 'blocked' });
    try {
      const res = await call(VALID_BODY, AUTH);
      check('market data failure returns 502, not an unhandled crash', res._status === 502, res._status);
    } finally {
      global.fetch = realFetch;
    }
  }

  console.log(`\n──────── ${pass} passed · ${fail} failed ────────`);
  process.exit(fail > 0 ? 1 : 0);
})();
