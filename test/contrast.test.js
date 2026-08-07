// Contrast guardrail — fails if any text color:# on the (dark) site drops below
// WCAG AA 4.5:1 against the page background. Stops "invisible purple/grey text"
// regressions being shipped: enforced by `npm test`, not by eyeballing.
const fs = require('fs');
const path = require('path');

const BG = '#050508';           // body background
const MIN = 4.5;                // WCAG AA, normal text
const FILES = ['index.html', 'sample-report.html', 'success.html', 'terms.html', 'privacy.html'];

function lum(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const ch = [0, 2, 4].map(i => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function contrast(a, b) {
  const la = lum(a), lb = lum(b);
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

const root = path.join(__dirname, '..');
const fails = [];
let checked = 0;
for (const f of FILES) {
  const fp = path.join(root, f);
  if (!fs.existsSync(fp)) continue;
  const html = fs.readFileSync(fp, 'utf8');
  // Only the `color` property — not background-color / accent-color / border-color etc.
  const re = /(?<![-\w])color:\s*(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6})\b/g;
  const seen = new Set();
  let m;
  while ((m = re.exec(html))) {
    const c = m[1].toLowerCase();
    if (seen.has(c)) continue;
    seen.add(c);
    checked++;
    const cr = contrast(c, BG);
    if (cr < MIN) fails.push(`  ${f}: color:${c} → ${cr.toFixed(2)}:1 (need ≥ ${MIN} on ${BG})`);
  }
}

if (fails.length) {
  console.error(`❌ contrast.test FAILED — ${fails.length} low-contrast text color(s):\n` + fails.join('\n'));
  console.error(`\nFix: use a lighter tone (e.g. #94a3b8 ≈ 7.8:1, #a78bfa ≈ 7.3:1, #c4b5fd ≈ 9:1).`);
  process.exit(1);
}
console.log(`✅ contrast.test passed — ${checked} distinct text colors, all ≥ ${MIN}:1 on ${BG}.`);
