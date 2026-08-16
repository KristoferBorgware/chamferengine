#!/usr/bin/env node
// Checks docs/ against the rules in HOW-TO-WRITE-DOCS.md. Only the mechanical
// ones -- voice and sentence length need a reader.
//
//   node tools/check-style.js              check every document
//   node tools/check-style.js docs/17-*.md check one
//
// Exits non-zero when anything is flagged, so it can gate a build.

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const only = process.argv.slice(2);
const FILES = only.length ? only : fs.readdirSync(path.join(ROOT, 'docs'))
  .filter(f => /^\d\d-.*\.md$/.test(f)).sort().map(f => `docs/${f}`);

// ---- the rules --------------------------------------------------------------
// Each is [name, regex, note]. A line matching the regex is reported. Rules
// that need document structure rather than a line are further down.
const LINE_RULES = [
  ['anchor', /\bMinecraft\b/,
    'not a comparison anchor -- this is not a Minecraft clone'],
  ['free', /\b(?:for|is|are|was|were|comes?|came|stays?|remains?)\s+free\b|\bfree\s+(?:in|at)\b/i,
    'nothing is free -- name what is reused'],
  ['meta', /\bworth (?:stating|noting|saying)\b|\bit is worth\b|\bnote that\b/i,
    'leave no trace of how the page was written'],
];

// A history marker belongs in Still open and nowhere else.
const HISTORY = /\bearlier drafts?\b|\bthis (?:document|page) (?:said|had|used|first|originally)\b|\bused to (?:say|claim|be|call|read|imply|mean)\b|\boriginally (?:said|claimed|implied)\b|\bfirst draft\b|\bno longer\b|\bany more\b|\bpreviously\b/i;

// Compounds where "free" is ordinary English rather than a claim about cost.
const FREE_OK = /\b(?:gap|overlap|dependency|hands|error|seam|lock|hassle|worry|debt)-free\b|\bfree(?:dom|ly)\b|\bfree of\b|\bfree to\b|\bfree from\b/i;

function sections(lines) {
  const out = [];
  lines.forEach((line, i) => {
    const m = line.match(/^##\s+(.*)$/);
    if (m) out.push({ title: m[1].trim(), start: i });
  });
  out.forEach((s, i) => {
    s.end = i + 1 < out.length ? out[i + 1].start : lines.length;
  });
  return out;
}

let total = 0;
const report = [];

for (const rel of FILES) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) continue;
  const text = fs.readFileSync(abs, 'utf8');
  const lines = text.split('\n');
  const secs = sections(lines);
  const hits = [];

  const stillOpen = secs.find(s => /^still open$/i.test(s.title));
  const oneBreath = secs.find(s => /^in one breath$/i.test(s.title));

  // Fenced code holds formulae and sample output; the rules are about prose.
  const inFence = new Array(lines.length).fill(false);
  let fenced = false;
  lines.forEach((l, i) => {
    if (/^```/.test(l)) { fenced = !fenced; inFence[i] = true; return; }
    inFence[i] = fenced;
  });

  lines.forEach((line, i) => {
    if (inFence[i]) return;
    for (const [name, re, note] of LINE_RULES) {
      if (!re.test(line)) continue;
      if (name === 'free' && FREE_OK.test(line)) continue;
      hits.push({ line: i + 1, name, note, text: line.trim().slice(0, 78) });
    }
    if (HISTORY.test(line)) {
      const inStillOpen = stillOpen && i >= stillOpen.start && i < stillOpen.end;
      if (!inStillOpen) hits.push({
        line: i + 1, name: 'history',
        note: 'history belongs in Still open',
        text: line.trim().slice(0, 78),
      });
    }
  });

  if (!oneBreath) hits.push({ line: 0, name: 'structure', note: 'no "In one breath"', text: '' });
  if (stillOpen && oneBreath && stillOpen.end !== oneBreath.start) hits.push({
    line: stillOpen.start + 1, name: 'structure',
    note: '"Still open" must sit immediately before "In one breath"', text: '',
  });
  if (!/^!\[/m.test(text)) hits.push({ line: 0, name: 'figure', note: 'no figure', text: '' });

  if (hits.length) { report.push({ rel, hits }); total += hits.length; }
}

if (!total) {
  console.log(`Every document matches HOW-TO-WRITE-DOCS.md. ${FILES.length} checked.`);
} else {
  console.log(`${total} flagged across ${report.length} of ${FILES.length} documents:\n`);
  for (const r of report) {
    console.log(`  ${r.rel}  (${r.hits.length})`);
    for (const h of r.hits)
      console.log(`    ${String(h.line).padStart(4)}  ${h.name.padEnd(9)} ${h.note}`
        + (h.text ? `\n          ${h.text}` : ''));
    console.log('');
  }
  console.log('Each is a rule in HOW-TO-WRITE-DOCS.md. Fix it or argue the rule.');
}
process.exitCode = total ? 1 : 0;
