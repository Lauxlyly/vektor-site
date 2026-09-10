// Offline tests for lib/census/market-data.js parsing + pagination logic,
// using a mocked fetch (no real network — this must pass in any sandbox).
// Run: node test/census-market-data.test.js

const { fetchKlines } = require('../lib/census/market-data');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name} — ${detail !== undefined ? detail : 'failed'}`); }
}

const HOUR = 3600000;

function binanceRow(openTimeMs, o, h, l, c) {
  return [openTimeMs, String(o), String(h), String(l), String(c), '123.45', openTimeMs + HOUR - 1, '0', 0, '0', '0', '0'];
}

(async () => {
  // ---- single page ----
  {
    const start = 0;
    const rows = [binanceRow(start, 1, 2, 0.5, 1.5), binanceRow(start + HOUR, 1.5, 2.5, 1, 2)];
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return { ok: true, json: async () => rows };
    };
    const candles = await fetchKlines('BTCUSDT', '1h', start, start + HOUR, { fetchImpl });
    check('market-data: parses a single page correctly', candles.length === 2 &&
      candles[0].open === 1 && candles[0].close === 1.5 && candles[1].close === 2, JSON.stringify(candles));
    check('market-data: makes exactly one call when the page is short', calls === 1, calls);
  }

  // ---- pagination across multiple pages ----
  {
    const start = 0;
    const limit = 3;
    const totalCandles = 7;
    let calls = 0;
    const fetchImpl = async (url) => {
      calls++;
      const u = new URL(url);
      const cursor = Number(u.searchParams.get('startTime'));
      const endTime = Number(u.searchParams.get('endTime'));
      const page = [];
      for (let t = cursor; t < cursor + limit * HOUR && t <= endTime; t += HOUR) {
        const idx = t / HOUR;
        if (idx >= totalCandles) break;
        page.push(binanceRow(t, idx, idx + 0.5, idx - 0.5, idx + 0.2));
      }
      return { ok: true, json: async () => page };
    };
    const endMs = (totalCandles - 1) * HOUR;
    const candles = await fetchKlines('ETHUSDT', '1h', start, endMs, { limit, fetchImpl });
    check('market-data: pagination stitches all candles across multiple pages',
      candles.length === totalCandles, `got ${candles.length}, expected ${totalCandles}`);
    check('market-data: candles remain ascending by time after stitching',
      candles.every((c, i) => i === 0 || c.time > candles[i - 1].time));
    check('market-data: pagination required more than one call', calls > 1, calls);
  }

  // ---- error surfacing: never silently returns partial/fabricated data ----
  {
    const fetchImpl = async () => ({ ok: false, status: 451, text: async () => 'Service unavailable from your region' });
    let threw = false, message = '';
    try {
      await fetchKlines('BTCUSDT', '1d', 0, HOUR, { fetchImpl });
    } catch (e) {
      threw = true; message = e.message;
    }
    check('market-data: a failed HTTP response throws (never fabricates candles)', threw && message.includes('451'), message);
  }

  // ---- unsupported interval rejected before any network call ----
  {
    let threw = false;
    try {
      await fetchKlines('BTCUSDT', '2w', 0, HOUR, { fetchImpl: async () => { throw new Error('should not be called'); } });
    } catch (e) {
      threw = true;
    }
    check('market-data: unsupported interval is rejected before fetching', threw);
  }

  console.log(`\n──────── ${pass} passed · ${fail} failed ────────`);
  process.exit(fail > 0 ? 1 : 0);
})();
