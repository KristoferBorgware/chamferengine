#!/usr/bin/env node
// Builds docs/REFERENCE.md: every measured number in the specification, with
// the script that produced it.
//
//   node tools/make-reference.js
//
// Nothing here is written by hand. Each section's purpose comes from the
// script's own header comment, its citations come from grepping docs/, and its
// numbers come from running it. So the reference cannot disagree with the
// specification or with itself -- if a constant changes, this changes with it.
//
// It is NOT wired into build-docs.js, because it executes every verification
// script and that is far too slow to run on every keystroke in --watch. Run it
// when the maths changes.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const VDIR = path.join(ROOT, 'verification');
const DDIR = path.join(ROOT, 'docs');

const scripts = fs.readdirSync(VDIR).filter(f => f.endsWith('.js')).sort();
const docs = fs.readdirSync(DDIR).filter(f => f.endsWith('.md') && f !== 'REFERENCE.md').sort();
const docText = new Map(docs.map(f => [f, fs.readFileSync(path.join(DDIR, f), 'utf8')]));

// ---- a script's purpose is its own leading comment --------------------------
function purpose(file){
  const lines = fs.readFileSync(path.join(VDIR, file), 'utf8').split('\n');
  const out = [];
  for (const l of lines){
    if (l.startsWith('#!')) continue;
    if (!l.startsWith('//')) break;
    out.push(l.replace(/^\/\/\s?/, '').trim());
  }
  // drop trailing usage/backing lines; keep the description itself
  return out.join(' ').replace(/\s+/g, ' ')
    .replace(/\s*Backs docs\/.*$/, '')
    .trim();
}

// ---- which documents cite it ------------------------------------------------
function citedBy(file){
  return docs.filter(d => docText.get(d).includes('verification/' + file));
}

// ---- run it -----------------------------------------------------------------
function run(file){
  const t0 = Date.now();
  try {
    const out = execSync(`node ${JSON.stringify(path.join(VDIR, file))}`,
      { cwd: ROOT, timeout: 120000, maxBuffer: 8 << 20 }).toString().replace(/\s+$/, '');
    return { out, ms: Date.now() - t0 };
  } catch (e) {
    return { out: null, ms: Date.now() - t0, err: (e.stderr || e.message || '').toString().slice(0, 400) };
  }
}

console.log(`running ${scripts.length} verification scripts...`);
const results = scripts.map(f => {
  const r = run(f);
  console.log(`  ${f.padEnd(12)} ${r.out === null ? 'FAILED' : (r.ms + ' ms').padStart(8)}`);
  return { file: f, purpose: purpose(f), cites: citedBy(f), ...r };
});

// ---- consistency checks -----------------------------------------------------
const problems = [];
for (const r of results){
  if (r.out === null) problems.push(`${r.file} does not run: ${r.err.split('\n')[0]}`);
  if (!r.cites.length) problems.push(`${r.file} is cited by no document`);
}
// a script named in a document must exist
for (const [d, text] of docText)
  for (const m of text.matchAll(/verification\/(\w+\.js)/g))
    if (!scripts.includes(m[1])) problems.push(`${d} cites verification/${m[1]}, which does not exist`);
// a script named in CLAUDE.md's constants table must exist
const claude = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
for (const m of claude.matchAll(/`(\w+\.js)`/g))
  if (!scripts.includes(m[1])) problems.push(`CLAUDE.md cites ${m[1]}, which does not exist`);

// ---- write it ---------------------------------------------------------------
const stamp = results.reduce((s, r) => s + r.ms, 0);
const lines = [];
lines.push('# Reference');
lines.push('');
lines.push('Every measured number in the specification, and the script that produced it.');
lines.push('');
lines.push('> **Generated file. Do not edit.** Rebuild with `node tools/make-reference.js`.');
lines.push('>');
lines.push('> Each section below is the actual output of a verification script, run');
lines.push('> fresh. The prose documents explain *why* these numbers matter; this page');
lines.push('> exists so an agent can look one up without reading the argument around it,');
lines.push('> and so the numbers can never drift from the scripts that prove them.');
lines.push('');
lines.push('For invariants, naming conventions and the design rules an implementation');
lines.push('must not break, see [`CLAUDE.md`](../CLAUDE.md). For the reasoning, see the');
lines.push('numbered documents.');
lines.push('');
lines.push('---');
lines.push('');
lines.push('## Index');
lines.push('');
lines.push('| Script | Establishes | Used by |');
lines.push('|---|---|---|');
for (const r of results){
  const used = r.cites.length
    ? r.cites.map(d => `[${d.slice(0,2)}](${d})`).join(' ')
    : '—';
  lines.push(`| [\`${r.file}\`](../verification/${r.file}) | ${r.purpose || '—'} | ${used} |`);
}
lines.push('');
lines.push('---');
lines.push('');
for (const r of results){
  lines.push(`## \`${r.file}\``);
  lines.push('');
  if (r.purpose) { lines.push(r.purpose); lines.push(''); }
  lines.push(r.cites.length
    ? `Cited by ${r.cites.map(d => `[doc ${d.slice(0,2)}](${d})`).join(', ')}.`
    : '_Not currently cited by any document._');
  lines.push('');
  lines.push('```');
  lines.push(r.out === null ? `SCRIPT FAILED\n${r.err}` : r.out);
  lines.push('```');
  lines.push('');
}
lines.push('---');
lines.push('');
lines.push(`_${results.length} scripts. Every number above is reproduced by running them._`);
lines.push('');

fs.writeFileSync(path.join(DDIR, 'REFERENCE.md'), lines.join('\n'));
console.log(`\nwrote docs/REFERENCE.md (${(fs.statSync(path.join(DDIR,'REFERENCE.md')).size/1024).toFixed(0)} KB, ${(stamp/1000).toFixed(1)} s of computation)`);

if (problems.length){
  console.error('\nPROBLEMS:');
  for (const p of problems) console.error('  ' + p);
  process.exitCode = 1;
} else {
  console.log('every script runs, is cited, and every cited script exists.');
}
