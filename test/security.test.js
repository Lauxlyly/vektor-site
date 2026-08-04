// Security behaviour tests: malicious/abusive inputs must be rejected.
// Run: node test/security.test.js
const extract = require('../api/extract.js');
const genReport = require('../api/generate-report.js');
const webhook = require('../api/webhook.js');
const fs = require('fs');

function mockRes() {
  return {
    _status: 200, _json: null, _ended: false, _headers: {},
    setHeader(k, v) { this._headers[k] = v; },
    status(c) { this._status = c; return this; },
    json(o) { this._json = o; return this; },
    end() { this._ended = true; return this; },
  };
}
async function call(handler, req) { const res = mockRes(); await handler(req, res); return res; }

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name} — ${detail || 'failed'}`); }
}

(async () => {
  // ---- extract: SSRF guard ----
  const ssrf = [
    'http://localhost/x', 'http://127.0.0.1/x', 'http://169.254.169.254/latest/meta-data/',
    'http://10.0.0.1/', 'http://192.168.1.1/', 'http://172.16.0.5/', 'http://metadata.google.internal/',
    'ftp://evil.com/', 'file:///etc/passwd', 'http://[::1]/',
  ];
  for (const url of ssrf) {
    const res = await call(extract, { method: 'POST', body: { url } });
    check(`extract blocks ${url}`, res._status === 400, `got ${res._status}`);
  }
  // oversized url
  const bigUrl = 'https://x.com/' + 'a'.repeat(2100);
  check('extract blocks oversized url', (await call(extract, { method: 'POST', body: { url: bigUrl } }))._status === 400);
  // non-POST
  check('extract rejects GET', (await call(extract, { method: 'GET', body: {} }))._status === 405);

  // ---- generate-report: gating before any Stripe call ----
  check('genReport rejects bad session_id format',
    (await call(genReport, { method: 'POST', body: { session_id: 'hacker', strategy: 'x'.repeat(50) } }))._status === 400);
  check('genReport rejects missing strategy',
    (await call(genReport, { method: 'POST', body: { session_id: 'cs_test_' + 'a'.repeat(24) } }))._status === 400);
  check('genReport rejects oversized strategy',
    (await call(genReport, { method: 'POST', body: { session_id: 'cs_test_' + 'a'.repeat(24), strategy: 'x'.repeat(20001) } }))._status === 413);
  // valid format but (no Stripe key in test env) -> must NOT leak a report; expect 503 or 403, never 200
  const noKey = await call(genReport, { method: 'POST', body: { session_id: 'cs_test_' + 'a'.repeat(24), strategy: 'a valid length strategy description here' } });
  check('genReport never returns a report without payment', noKey._status !== 200 && !(noKey._json && noKey._json.report), `got ${noKey._status}`);

  // ---- webhook: forgery / method ----
  check('webhook rejects GET', (await call(webhook, { method: 'GET', body: {} }))._status === 405);
  check('webhook ignores non-payment events',
    (await call(webhook, { method: 'POST', body: { type: 'ping' } }))._status === 200);
  check('webhook rejects invalid session ref',
    (await call(webhook, { method: 'POST', body: { type: 'checkout.session.completed', data: { object: { id: 'fake' } } } }))._status === 400);

  // ---- XSS: esc() in success.html neutralises script ----
  const html = fs.readFileSync('success.html', 'utf8');
  const m = html.match(/function esc\(s\)\s*\{[\s\S]*?\n\}/);
  // eslint-disable-next-line no-eval
  eval(m[0]);
  const escaped = esc('<img src=x onerror=alert(1)>');
  check('esc() neutralises HTML', !escaped.includes('<') && escaped.includes('&lt;'), escaped);

  console.log(`\n──────── ${pass} passed · ${fail} failed ────────`);
  process.exit(fail > 0 ? 1 : 0);
})();
