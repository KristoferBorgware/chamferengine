#!/usr/bin/env node
// Checks every Markdown file against the rules in HOW-TO-WRITE-DOCS.md. Only
// the mechanical ones -- voice and sentence length need a reader.
//
//   node tools/check-style.js              check everything
//   node tools/check-style.js docs/17-*.md check one
//
// docs/ is the specification and argues each decision from a measurement.
// Every other page states what is true today, so it carries no history and no
// argument, and the `reason` rule applies to it alone. Figures and the
// "Still open" / "In one breath" structure are the specification's, and are
// checked on docs/ alone.
//
// Exits non-zero when anything is flagged, so it can gate a build.

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

function walk(dir, out) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (/^(node_modules|site|_site|dist|dist-types|\.git)$/.test(entry.name)) continue;
      walk(rel, out);
    } else if (entry.name.endsWith('.md')) out.push(rel.replace(/^\.\//, ''));
  }
  return out;
}

const only = process.argv.slice(2);
const FILES = only.length ? only : walk('.', []).sort();

const isSpec = rel => /^docs\/\d\d-.*\.md$/.test(rel);

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

// A reference page states what is true today. It does not argue for it.
const REASON = /\bwhich is why\b|\bfor (?:one|two|three|four|several) reasons?\b|\bthe reason (?:is|being|for)\b|\bthis (?:matters|is important) because\b|\bbecause otherwise\b|\brather than (?:several|the alternative)\b|\bthat is why\b/i;

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

// Two documents are not arguments and are exempt from the structure rules.
// Doc 11 is an index of what is undesigned -- the whole page is Still open
// content, so history belongs in its body. Doc 12 is a lookup table.
const EXEMPT = {
  'docs/11-open-topics.md': ['structure', 'history'],
  'docs/12-glossary.md': ['structure', 'figure'],
  // The style guide quotes the phrasings it bans, so it matches its own rules.
  'HOW-TO-WRITE-DOCS.md': ['reason', 'history', 'meta', 'free', 'anchor'],
  'CODE-STYLE.md': ['history', 'meta', 'free'],
  // The register says why each entry is there, which is the one place outside
  // docs/ that argues. Its own guide quotes the phrasings it asks for.
  'FINDINGS.md': ['reason', 'history'],
  'HOW-TO-WRITE-FINDINGS.md': ['reason', 'history', 'meta', 'free', 'anchor'],
  // Generated: every line is a verification script's own output.
  'docs/REFERENCE.md': ['history', 'free', 'anchor', 'meta', 'reason'],
  // A digest of the specification, carrying its corrections verbatim. An agent
  // that does not know 1.3:1 was a level-2 reading writes it down again.
  'CLAUDE.md': ['history', 'free', 'anchor'],
};

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
    if (!isSpec(rel) && REASON.test(line)) hits.push({
      line: i + 1, name: 'reason',
      note: 'a reference page states, it does not argue',
      text: line.trim().slice(0, 78),
    });
    if (HISTORY.test(line)) {
      const inStillOpen = stillOpen && i >= stillOpen.start && i < stillOpen.end;
      if (!inStillOpen) hits.push({
        line: i + 1, name: 'history',
        note: 'history belongs in Still open',
        text: line.trim().slice(0, 78),
      });
    }
  });

  if (isSpec(rel)) {
    if (!oneBreath) hits.push({ line: 0, name: 'structure', note: 'no "In one breath"', text: '' });
    if (stillOpen && oneBreath && stillOpen.end !== oneBreath.start) hits.push({
      line: stillOpen.start + 1, name: 'structure',
      note: '"Still open" must sit immediately before "In one breath"', text: '',
    });
    if (!/^!\[/m.test(text)) hits.push({ line: 0, name: 'figure', note: 'no figure', text: '' });
  }

  // A plan records a decision, and a decision without the measurement that
  // made it cannot be reviewed. It also records the candidates that lost,
  // which is the most useful thing in the file a year later.
  const exempt =
    EXEMPT[rel] || (rel.startsWith('plans/') ? ['reason', 'history'] : []);
  const kept = hits.filter(h => !exempt.includes(h.name));
  if (kept.length) { report.push({ rel, hits: kept }); total += kept.length; }
}

if (!total) {
  console.log(`Every page matches HOW-TO-WRITE-DOCS.md. ${FILES.length} checked.`);
} else {
  console.log(`${total} flagged across ${report.length} of ${FILES.length} pages:\n`);
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
