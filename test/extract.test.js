// Smoke test for api/extract.js against real URLs.
// Run: node test/extract.test.js
const handler = require('../api/extract.js');

function mockRes() {
  return {
    _status: 200,
    _json: null,
    _headers: {},
    setHeader(k, v) { this._headers[k] = v; },
    status(c) { this._status = c; return this; },
    json(o) { this._json = o; return this; },
    end() { return this; },
  };
}

async function call(url) {
  const req = { method: 'POST', body: { url } };
  const res = mockRes();
  await handler(req, res);
  return res;
}

const CASES = [
  { name: 'YouTube (has transcript)', url: 'https://www.youtube.com/watch?v=aircAruvnKk', expectOk: true },
  { name: 'YouTube Shorts URL parse', url: 'https://youtube.com/shorts/aircAruvnKk', expectOk: true },
  { name: 'Instagram reel (OG caption)', url: 'https://www.instagram.com/reel/C8Qk1vHtY7z/', expectOk: null },
  { name: 'X / Twitter post (OG)', url: 'https://x.com/elonmusk/status/1', expectOk: null },
  { name: 'Generic web page (OG)', url: 'https://en.wikipedia.org/wiki/Trading_strategy', expectOk: true },
  { name: 'Invalid URL rejected', url: 'not a url', expectOk: false },
];

(async () => {
  let pass = 0, soft = 0, fail = 0;
  for (const c of CASES) {
    try {
      const res = await call(c.url);
      const ok = res._status >= 200 && res._status < 300;
      const body = res._json || {};
      const summary = ok
        ? `OK [${body.platform}/${body.source}] ${String(body.text || '').slice(0, 70).replace(/\n/g, ' ')}…`
        : `HTTP ${res._status}: ${body.error}`;

      if (c.expectOk === true) {
        if (ok) { pass++; console.log(`✅ ${c.name}\n   ${summary}`); }
        else { fail++; console.log(`❌ ${c.name} — expected success\n   ${summary}`); }
      } else if (c.expectOk === false) {
        if (!ok) { pass++; console.log(`✅ ${c.name} (correctly rejected)\n   ${summary}`); }
        else { fail++; console.log(`❌ ${c.name} — expected rejection but got OK`); }
      } else {
        // expectOk null: either outcome acceptable (login walls vary), just report
        soft++; console.log(`ℹ️  ${c.name} (best-effort)\n   ${summary}`);
      }
    } catch (e) {
      fail++; console.log(`❌ ${c.name} THREW: ${e.message}`);
    }
    console.log('');
  }
  console.log(`\n──────── ${pass} passed · ${soft} best-effort · ${fail} failed ────────`);
  process.exit(fail > 0 ? 1 : 0);
})();
