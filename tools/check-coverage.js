#!/usr/bin/env node
// Guards a rewrite. Compares each document against its committed version and
// reports every fact the new text dropped: numbers, code identifiers, link
// targets, and defined terms.
//
//   node tools/check-coverage.js            compare working tree against HEAD
//   node tools/check-coverage.js <ref>      compare against another git ref
//   node tools/check-coverage.js <ref> docs/03-addressing.md   one file
//
// It is deliberately noisy. A reported item is not automatically a mistake --
// a number can legitimately move to another document or be dropped on purpose.
// The point is that every drop is seen and decided on, not discovered later.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const REF = args.find(a => !a.includes('/')) || 'HEAD';
const ONLY = args.find(a => a.includes('/'));

// Every document the specification is made of, plus the indexes that quote it.
const FILES = ONLY ? [ONLY] : [
  'README.md', 'CLAUDE.md', 'demos/README.md', 'verification/README.md',
  ...fs.readdirSync(path.join(ROOT, 'docs')).filter(f => f.endsWith('.md')).sort()
     .map(f => `docs/${f}`),
];

const old = f => {
  try { return execSync(`git show ${REF}:${f}`, { cwd: ROOT, stdio: ['ignore','pipe','ignore'] }).toString(); }
  catch { return null; }
};

// ---- what counts as a fact --------------------------------------------------
// Numbers carry the maths. Code spans carry identifiers and formulae. Link
// targets carry the cross-references. Bold runs carry the defined terms.
function facts(md){
  const strip = md.replace(/```[\s\S]*?```/g, m => m);   // keep code blocks: they hold formulae
  const out = { num: new Set(), code: new Set(), link: new Set(), term: new Set(), raw: new Set() };

  // numbers, with their unit or symbol so "12" and "12 pentagons" stay distinct
  for (const m of strip.matchAll(/(\d[\d,]*\.?\d*)\s*(°|%|×|x\b|m\b|km\b|bits?\b|bytes?\b|GB\b|MB\b|KB\b)?/g)){
    const n = m[1].replace(/,/g, '');
    if (n.length && !/^0+$/.test(n)) out.num.add(n + (m[2] ? ' ' + m[2].trim() : ''));
    out.raw.add(m[1]);                       // the number exactly as written
  }
  for (const m of strip.matchAll(/`([^`\n]+)`/g)) out.code.add(m[1].trim());
  for (const m of strip.matchAll(/\]\(([^)\s]+)\)/g)) out.link.add(m[1].split('#')[0]);
  for (const m of strip.matchAll(/\*\*([^*\n]{2,60})\*\*/g))
    out.term.add(m[1].replace(/[.,:;]$/, '').toLowerCase().trim());
  return out;
}

// A fact survives if it appears anywhere in the new corpus, not only in the
// same file -- rewrites legitimately move material between documents.
const corpus = FILES.map(f => {
  const p = path.join(ROOT, f);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}).join('\n');
const figures = fs.existsSync(path.join(ROOT, 'docs/figures'))
  ? fs.readdirSync(path.join(ROOT, 'docs/figures'))
      .map(f => fs.readFileSync(path.join(ROOT, 'docs/figures', f), 'utf8')).join('\n')
  : '';
const haystack = corpus + '\n' + figures;
// Markdown wraps lines, so a phrase can be split across two of them. Compare
// against a whitespace-flattened copy or every wrapped term reads as lost.
const flat = haystack.replace(/\s+/g, ' ');
const flatLower = flat.toLowerCase();

let totalMissing = 0, totalChecked = 0;
const report = [];

for (const f of FILES){
  const before = old(f);
  if (before === null) continue;
  const now = fs.existsSync(path.join(ROOT, f)) ? fs.readFileSync(path.join(ROOT, f), 'utf8') : '';
  if (before === now) continue;                       // untouched

  const a = facts(before);
  const miss = { num: [], code: [], link: [], term: [] };
  for (const kind of ['num','code','link','term']){
    for (const item of a[kind]){
      totalChecked++;
      const needle = (kind === 'num' ? item.split(' ')[0] : item).replace(/\s+/g, ' ');
      // terms are collected lowercased, so they must be looked up that way
      const hay = kind === 'term' ? flatLower : flat;
      // a number may be reformatted with separators, or written as a list like
      // [0,1,2] whose commas this strips -- accept any of those spellings
      const forms = [needle];
      if (kind === 'num'){
        if (needle.length > 3) forms.push(needle.replace(/\B(?=(\d{3})+(?!\d))/g, ','));
        for (const r of a.raw) if (r.replace(/,/g, '') === needle) forms.push(r);
      }
      if (!forms.some(x => hay.includes(x))){ miss[kind].push(item); totalMissing++; }
    }
  }
  const n = Object.values(miss).reduce((s, x) => s + x.length, 0);
  if (n) report.push({ f, miss, n });
}

if (!report.length){
  console.log(`No facts lost against ${REF}. ${totalChecked} checked across ${FILES.length} files.`);
} else {
  console.log(`Checked ${totalChecked} facts against ${REF}. ${totalMissing} no longer appear anywhere:\n`);
  for (const r of report){
    console.log(`  ${r.f}  (${r.n})`);
    for (const kind of ['num','code','link','term'])
      if (r.miss[kind].length)
        console.log(`    ${kind.padEnd(5)} ${r.miss[kind].slice(0,40).map(x => JSON.stringify(x)).join('  ')}`
          + (r.miss[kind].length > 40 ? `  ...+${r.miss[kind].length-40}` : ''));
    console.log('');
  }
  console.log('Each line is a fact the rewrite dropped. Restore it, move it somewhere');
  console.log('deliberate, or decide it was never worth keeping -- but decide.');
}
process.exitCode = 0;
