// Static page guardrails — catches classic HTML/CSS mistakes that manual review
// misses because they only show in certain states. Runs on `npm test`.
// (Contrast has its own file. The definitive layer for layout/overflow bugs is a
//  headless-browser render check — see README/TODO; this covers the greppable classes.)
const fs = require('fs');
const path = require('path');

const FILES = ['index.html', 'sample-report.html', 'success.html', 'terms.html', 'privacy.html'];
const root = path.join(__dirname, '..');
const fails = [];

function read(f) {
  const fp = path.join(root, f);
  return fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8') : null;
}

for (const f of FILES) {
  const html = read(f);
  if (!html) continue;

  // 1) Tight unitless line-height (<1.15) — a heavy display heading's descenders (g, y, p)
  //    overlap the next line when it wraps. 1.12 shipped once and still overlapped, so the
  //    floor is 1.15. (line-height:0 is allowed — it's only used to reset icon-only boxes.)
  let m; const lh = /line-height:\s*(\d*\.?\d+)\s*[;}]/g;
  while ((m = lh.exec(html))) {
    const v = parseFloat(m[1]);
    if (v > 0 && v < 1.15) fails.push(`${f}: line-height:${m[1]} (<1.15 — headings overlap descenders when they wrap; use ≥1.2 on display headings)`);
  }

  // 2) Broken internal anchors: href="#foo" with no matching id="foo".
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(x => x[1]));
  for (const a of html.matchAll(/href="#([^"]+)"/g)) {
    if (!ids.has(a[1])) fails.push(`${f}: href="#${a[1]}" has no matching id`);
  }

  // 3) <img> without alt.
  for (const im of html.matchAll(/<img\b[^>]*>/g)) {
    if (!/\salt=/.test(im[0])) fails.push(`${f}: <img> without alt= (${im[0].slice(0, 60)}…)`);
  }

  // 4) Duplicate id attributes.
  const seen = {}, dup = new Set();
  for (const i of html.matchAll(/id="([^"]+)"/g)) { if (seen[i[1]]) dup.add(i[1]); seen[i[1]] = 1; }
  dup.forEach(d => fails.push(`${f}: duplicate id="${d}"`));

  // 5) Leftover debug/placeholder TEXT (not the legit placeholder="" input attribute).
  for (const p of ['TODO:', 'FIXME', 'lorem ipsum', 'xxxxx']) {
    if (new RegExp(p, 'i').test(html)) fails.push(`${f}: contains debug/placeholder text "${p}"`);
  }
}

if (fails.length) {
  console.error('❌ page-guardrails FAILED:\n' + fails.map(x => '  ' + x).join('\n'));
  process.exit(1);
}
console.log('✅ page-guardrails passed — line-height, anchors, img-alt, unique-ids, no placeholders.');
