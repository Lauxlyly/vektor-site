// Real historical OHLCV from Binance's public REST API (spot klines). No API
// key required — this is public market data, not account data. Paginates
// past Binance's 1000-candles-per-call cap to cover a full [start, end] window.
//
// NOTE: this calls out to api.binance.com. It only runs where general
// outbound internet is allowed (e.g. the deployed Vercel function) — sandboxed
// dev/CI environments that block egress to non-package-registry hosts will
// fail here by design; see test/census-engine.test.js for the offline,
// synthetic-data tests that do not require network access.

const BASE_URL = 'https://api.binance.com/api/v3/klines';
const MS_PER_CANDLE = { '1m': 60e3, '5m': 300e3, '15m': 900e3, '1h': 3600e3, '4h': 14400e3, '1d': 86400e3 };

function _parseRow(row) {
  return {
    time: row[0],       // open_time, epoch ms
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
  };
}

/**
 * Fetch candles for one symbol between startMs and endMs (inclusive), paginating
 * as needed. Throws on a non-2xx response (surfaced to the caller — never
 * silently returns partial/fabricated data).
 */
async function fetchKlines(symbol, interval, startMs, endMs, { limit = 1000, fetchImpl = fetch } = {}) {
  if (!MS_PER_CANDLE[interval]) throw new Error(`Unsupported interval: ${interval}`);
  const out = [];
  let cursor = startMs;
  const seen = new Set();

  while (cursor <= endMs) {
    const url = `${BASE_URL}?symbol=${encodeURIComponent(symbol)}&interval=${interval}&startTime=${cursor}&endTime=${endMs}&limit=${limit}`;
    const res = await fetchImpl(url);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Binance klines fetch failed for ${symbol} (${res.status}): ${body.slice(0, 300)}`);
    }
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) break;

    for (const row of rows) {
      const c = _parseRow(row);
      if (!seen.has(c.time)) { seen.add(c.time); out.push(c); }
    }

    const lastOpenTime = rows[rows.length - 1][0];
    const next = lastOpenTime + MS_PER_CANDLE[interval];
    if (next <= cursor) break; // safety: guarantee forward progress
    cursor = next;
    if (rows.length < limit) break; // fewer than a full page → reached the end
  }

  out.sort((a, b) => a.time - b.time);
  return out;
}

/**
 * Fetch candles for multiple symbols over the same window.
 * @returns {Promise<Record<string, Array>>}
 */
async function fetchUniverse(symbols, interval, startMs, endMs, opts = {}) {
  const result = {};
  for (const symbol of symbols) {
    result[symbol] = await fetchKlines(symbol, interval, startMs, endMs, opts);
  }
  return result;
}

module.exports = { fetchKlines, fetchUniverse, MS_PER_CANDLE };
