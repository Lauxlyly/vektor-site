#!/usr/bin/env node
// Pre-publish hard-stop gate for VEKTOR case-study pages.
// Mirrors the census framework's code-enforced gates — a human comment is not enough.
// FAILS (exit 1) if any "{{VERIFY" slot remains in the target file(s).
//   node scripts/check-publishable.js [file ...]   (defaults to case-study.html)
//
// A green result means "no placeholder remains" — NOT "the numbers are correct".
// The figures must be read straight off the append-only census ledger, and the headline
// verdict re-derived from them (publish "worse than random" only if the proxy lost to BOTH
// nulls out-of-sample). That correctness check is the owner's job against the ledger.

const fs = require('fs');
const path = require('path');

// Machine sigil is the literal `{{VERIFY` — chosen so prose describing the gate never trips it.
const SIGIL = '{{' + 'VERIFY';

const files = process.argv.slice(2);
if (files.length === 0) files.push(path.join(process.cwd(), 'case-study.html'));

let failed = false;
for (const f of files) {
  if (!fs.existsSync(f)) {
    console.error(`ERROR: not found: ${f}`);
    failed = true;
    continue;
  }
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  const hits = [];
  lines.forEach((ln, i) => { if (ln.includes(SIGIL)) hits.push(`${i + 1}: ${ln.trim()}`); });
  if (hits.length) {
    console.error(`BLOCKED: ${f} has ${hits.length} unresolved {{VERIFY}} slot(s) — not publishable:`);
    hits.forEach(h => console.error('  ' + h));
    failed = true;
  } else {
    console.log(`OK: ${f} has no unresolved {{VERIFY}} slots.`);
  }
}

if (failed) {
  console.error('\nPUBLISH BLOCKED. Resolve every {{VERIFY}} slot against the census ledger first.');
  console.error('Re-DERIVE the headline verdict from the pasted figures. If the proxy did NOT lose to');
  console.error('both nulls out-of-sample, this family is the wrong case study — do not publish.');
  process.exit(1);
}
