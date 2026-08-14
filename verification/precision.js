// Floating-point precision at planet scale: what a float can resolve, where the
// ID->position conversion loses accuracy, and how much a chunk-local origin buys
// back. Backs docs/15-precision-and-origin.md
const f = Math.fround, DEG = 180 / Math.PI;
const norm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
const sub = (a, b) => a.map((x, i) => x - b[i]);
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const angle = (a,b) => Math.atan2(Math.hypot(...cross(a,b)), dot(a,b));
const len = v => Math.hypot(...v);
const T = (1 + Math.sqrt(5)) / 2;

// spacing between representable numbers just above x, by incrementing the bit
// pattern -- a relative probe is NOT safe here, it can skip a representable value
const ulp32 = x => { const b = new DataView(new ArrayBuffer(4)); b.setFloat32(0, x);
  b.setUint32(0, b.getUint32(0) + 1); return b.getFloat32(0) - f(x); };
const ulp64 = x => { const b = new DataView(new ArrayBuffer(8)); b.setFloat64(0, x);
  b.setBigUint64(0, b.getBigUint64(0) + 1n); return b.getFloat64(0) - x; };

const m = (x, p = 3) => x >= 1 ? x.toFixed(p) + ' m'
  : x >= 1e-3 ? (x * 1e3).toFixed(p) + ' mm'
  : x >= 1e-6 ? (x * 1e6).toFixed(p) + ' um' : (x * 1e9).toFixed(p) + ' nm';

// ---- 0. where "about 7 digits" comes from, and why it is relative -----------
console.log('0. the arithmetic behind "float32 carries about 7 significant digits"');
{
  const b = new DataView(new ArrayBuffer(4));
  const parts = x => { b.setFloat32(0, x); const u = b.getUint32(0);
    return { e: ((u >>> 23) & 0xff) - 127, m: u & 0x7fffff }; };
  const nudge = (x, k) => { b.setFloat32(0, x); b.setUint32(0, b.getUint32(0) + k); return b.getFloat32(0); };
  console.log('   layout: 1 sign + 8 exponent + 23 stored mantissa bits.');
  console.log('   an implicit leading 1 makes the significand 24 bits, and');
  console.log(`   24 * log10(2) = ${(24 * Math.log10(2)).toFixed(4)} decimal digits.`);
  console.log('   every float is +/- 1.f x 2^e with 1.f in [1,2), so the exponent slides a');
  console.log('   FIXED ladder of rungs along the number line: the count never changes and');
  console.log('   the spacing scales with the magnitude.');
  console.log('\n        for x in [2^e, 2^(e+1)):   gap = 2^(e-23)\n');
  console.log('   R              2^e         e    gap = 2^(e-23)   measured');
  for (const R of [1700, 10000, 6371000]){
    const { e } = parts(R);
    console.log(`   ${String(R).padStart(9)} ${String(2**e).padStart(12)} ${String(e).padStart(5)}`
      + ` ${m(2**(e-23)).padStart(15)}   ${m(ulp32(R))}`);
  }
  const E = parts(6371000).e;
  console.log(`\n   at Earth radius: 6371000 lies in [2^${E}, 2^${E+1}) = [${2**E}, ${2**(E+1)}),`);
  console.log(`   so the gap is 2^(${E}-23) = ${2**(E-23)} m. The neighbouring representable values are`);
  console.log(`   ${[-1,0,1].map(k => nudge(6371000, k)).join(', ')}`);
  console.log('   Counting digits agrees: 6371000 is 7 digits and lands ON the metres');
  console.log('   column; 6371000.5 would need 8; 7.22 digits is what buys the half.');
  console.log('   So it is not that metres are unrepresentable -- it is that nothing BELOW');
  console.log('   a metre is.');
  // why thresholds land on powers of two
  console.log('\n   gap >= t  means  e >= 23 + log2(t), and e is an integer, so every');
  console.log('   threshold crossing snaps to a binade boundary:');
  for (const [label, t] of [['1 mm', 1e-3], ['1 cm', 1e-2], ['10 cm', 0.1], ['1 m', 1]]){
    const e = Math.ceil(23 + Math.log2(t));
    console.log(`      gap >= ${label.padEnd(6)} at e = ${String(e).padStart(2)}  ->  R = 2^${e} = ${(2**e).toLocaleString()} m`);
  }
}

// ---- 1. what a float can resolve, by distance from the origin ---------------
console.log('\n1. spacing between adjacent representable positions, at distance R from the origin');
console.log('   (a world position IS that distance from the centre, so this is the resolution');
console.log('    of every position on the surface of a planet of radius R)\n');
console.log('   planet                       R          float32          float64   f32 vs 1 m block');
const PLANETS = [
  ['doc-06 worked example',   1700],
  ['10 km planet',           10000],
  ['100 km moon',           100000],
  ['1000 km dwarf',        1000000],
  ['Earth',                6371000],
  ['Jupiter',             69911000],
];
for (const [name, R] of PLANETS) {
  const a = ulp32(R), b = ulp64(R);
  const perBlock = 1 / a;   // representable positions per 1 m block
  const verdict = a < 0.001 ? `fine (${Math.round(perBlock)} per block)`
    : a < 0.05 ? `visible jitter (${Math.round(perBlock)} per block)`
    : a < 0.5 ? `coarse (${Math.round(perBlock)} per block)`
    : a <= 1 ? `${perBlock < 1.5 ? '2' : Math.round(perBlock)} positions per block -- no sub-block detail`
    : `ONE position per ${a.toFixed(0)} blocks`;
  console.log(`   ${name.padEnd(22)} ${String(R).padStart(9)} m ${m(a).padStart(12)} ${m(b).padStart(16)}   ${verdict}`);
}

// ---- 2. where float32 crosses each threshold --------------------------------
console.log('\n2. the radius at which float32 position spacing first exceeds a threshold');
console.log('   threshold        radius            i.e.');
const SCALES = [['0.1 mm', 1e-4], ['1 mm', 1e-3], ['1 cm', 1e-2], ['10 cm', 0.1], ['1 m', 1]];
for (const [label, t] of SCALES) {
  let lo = 1, hi = 1e12;
  for (let k = 0; k < 200; k++) { const mid = (lo + hi) / 2; if (ulp32(mid) < t) lo = mid; else hi = mid; }
  const km = hi / 1000;
  console.log(`   ${label.padStart(7)}   ${(hi).toExponential(3).padStart(12)} m   ${km < 1 ? hi.toFixed(0) + ' m' : km.toFixed(0) + ' km'}`);
}
console.log('   Thresholds land on powers of two because the spacing is 2^(e-23) for R in');
console.log('   [2^e, 2^(e+1)). float32 holds sub-millimetre precision out to a 16 km planet');
console.log('   and has no sub-block detail left at all by Earth radius.');

// ---- the grid ---------------------------------------------------------------
const V0 = [[-1,T,0],[1,T,0],[-1,-T,0],[1,-T,0],[0,-1,T],[0,1,T],[0,-1,-T],[0,1,-T],
            [T,0,-1],[T,0,1],[-T,0,-1],[-T,0,1]].map(norm);
const F0 = [[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
            [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];

// one-shot: the lattice point (i,j) as a single barycentric blend, then normalise
const oneShot = (A, B, C, n, i, j) => {
  const a = (n - i) / n, b = (i - j) / n, c = j / n;
  return norm([A[0]*a + B[0]*b + C[0]*c, A[1]*a + B[1]*b + C[1]*c, A[2]*a + B[2]*b + C[2]*c]);
};

// the same point in float32 throughout
const oneShot32 = (A, B, C, n, i, j) => {
  const a = f(f(n - i) / n), b = f(f(i - j) / n), c = f(j / n);
  const p = [0,1,2].map(k => f(f(f(A[k]*a) + f(B[k]*b)) + f(C[k]*c)));
  const l = f(Math.sqrt(f(f(f(p[0]*p[0]) + f(p[1]*p[1])) + f(p[2]*p[2]))));
  return p.map(x => f(x / l));
};

// recursive: split each triangle into four, normalising every new midpoint
function recursive(A, B, C, L) {
  const n = 1 << L, key = (i, j) => i * (n + 1) + j, pos = new Map();
  pos.set(key(0,0), A); pos.set(key(n,0), B); pos.set(key(n,n), C);
  let tris = [[[0,0],[n,0],[n,n]]];
  for (let l = 0; l < L; l++) {
    const next = [];
    for (const [p, q, r] of tris) {
      const mid = (u, v) => {
        const ij = [(u[0]+v[0])/2, (u[1]+v[1])/2];
        const k = key(ij[0], ij[1]);
        if (!pos.has(k)) pos.set(k, norm([0,1,2].map(t => (pos.get(key(u[0],u[1]))[t] + pos.get(key(v[0],v[1]))[t]) / 2)));
        return ij;
      };
      const a = mid(p,q), b = mid(q,r), c = mid(p,r);
      next.push([p,a,c],[a,q,b],[c,b,r],[a,b,c]);
    }
    tris = next;
  }
  return { pos, key, n };
}

// ---- 3. the two constructions the docs describe are not the same sphere ------
console.log('\n3. one-shot barycentric vs recursive midpoint subdivision');
console.log('   docs 02 and 03 describe the sphere as a "recursively subdivided icosahedron";');
console.log('   docs 04 and 09 require the one-shot lattice (uniform in the face plane).');
console.log('   These are different point sets. Deviation as a fraction of cell spacing:\n');
console.log('   L    cells    spacing (R=1700)   max deviation   as % of spacing');
{
  const [A, B, C] = F0[0].map(i => V0[i]);
  for (let L = 1; L <= 7; L++) {
    const { pos, key, n } = recursive(A, B, C, L);
    let worst = 0;
    for (let i = 0; i <= n; i++) for (let j = 0; j <= i; j++) {
      const p = pos.get(key(i, j)); if (!p) continue;
      worst = Math.max(worst, len(sub(p, oneShot(A, B, C, n, i, j))));
    }
    const cells = 10 * 4 ** L + 2, spacing = 1.20459 * 1700 / 2 ** L;
    console.log(`   ${L} ${String(cells).padStart(8)} ${(spacing).toFixed(2).padStart(14)} m ${m(worst*1700).padStart(15)} ${(worst*1700/spacing*100).toFixed(1).padStart(15)}%`);
  }
  // closed form, as an independent check on the mesh walk above
  const th = Math.acos(1 / Math.sqrt(5)), t = 0.25;
  const chord = Math.atan2(t * Math.sin(th), (1 - t) + t * Math.cos(th));
  console.log(`\n   closed form for the worst point (the quarter point of a base edge):`);
  console.log(`   icosahedron edge subtends ${(th*DEG).toFixed(4)}deg; at t = 1/4 the two rules place it at`);
  console.log(`   ${(chord*DEG).toFixed(4)}deg (one-shot, equal chord) vs ${(t*th*DEG).toFixed(4)}deg (recursive, equal arc)`);
  console.log(`   = ${((t*th-chord)*DEG).toFixed(4)}deg apart = ${(1700*(t*th-chord)).toFixed(3)} m on the doc-06 planet.`);
  console.log('\n   The gap is FIXED IN METRES and does not shrink with level, so as a fraction');
  console.log('   of a cell it GROWS without bound. These are two different tilings, not two');
  console.log('   roundings of one. At level 11 the two spheres disagree by 39 cells.');
  console.log('   Doc 04 (hexRound) and doc 09 (gnomonic straightness) both require one-shot,');
  console.log('   so one-shot is the construction; "recursively subdivided" is loose wording.');
}

// ---- 4. does the ID -> position conversion accumulate error? ----------------
console.log('\n4. ID -> position, worst error over 20,000 sampled cells');
console.log('   The path walk is integer arithmetic, so the only floating-point work is');
console.log('   one barycentric blend and one normalise, at any depth.\n');
console.log('   depth    float64 (R=1700)   float32 (R=1700)   float32 on an Earth-sized world');
for (const D of [4, 8, 11, 13, 16, 20, 23]) {
  const n = 2 ** D;
  let e64 = 0, e32 = 0;
  for (let s = 0; s < 20000; s++) {
    const fi = F0[s % 20], [A, B, C] = fi.map(i => V0[i]);
    const i = Math.floor((s * 2654435761 % 2 ** 31) / 2 ** 31 * (n + 1));
    const j = Math.floor((s * 40503 % 65536) / 65536 * (i + 1));
    const ref = oneShot(A, B, C, n, i, j);
    // float64 reference recomputed in a different association order, to expose drift
    const a = (n-i)/n, b = (i-j)/n, c = j/n;
    const alt = norm([0,1,2].map(k => C[k]*c + (B[k]*b + A[k]*a)));
    e64 = Math.max(e64, len(sub(ref, alt)));
    e32 = Math.max(e32, len(sub(ref, oneShot32(A, B, C, n, i, j))));
  }
  const earth = e32 * 6371000;
  console.log(`   ${String(D).padStart(5)}   ${m(e64*1700).padStart(16)}   ${m(e32*1700).padStart(16)}   ${m(earth).padStart(12)}`
    + (earth > 1 ? '  <-- worse than a block' : ''));
}
console.log('   Error is flat in depth: the path walk is integers, and the float work is');
console.log('   one blend plus one normalise however deep the world goes. Nothing accumulates.');

// ---- 5. direction survives what position does not ---------------------------
console.log('\n5. "up" is a direction, and directions are precision-robust');
console.log('   up = normalize(position). The normalise divides out the magnitude, so the');
console.log('   ANGLE survives even where the position itself has collapsed.\n');
console.log('   planet             float32 position error   float32 "up" error   as a distance on the surface');
for (const [name, R] of PLANETS) {
  const d = norm([0.3, 0.7, 0.64]);
  const p = d.map(x => x * R), p32 = p.map(f);
  const posErr = len(sub(p, p32));
  const up32 = (() => { const l = f(Math.sqrt(f(f(f(p32[0]*p32[0]) + f(p32[1]*p32[1])) + f(p32[2]*p32[2]))));
    return p32.map(x => f(x / l)); })();
  const ang = angle(d, up32);
  console.log(`   ${name.padEnd(18)} ${m(posErr).padStart(20)} ${(ang*DEG*3600).toExponential(2).padStart(18)}"   ${m(ang*R).padStart(12)}`);
}
console.log('   Position degrades linearly with R. The direction does not degrade at all.');

// ---- 6. what a chunk-local origin buys back --------------------------------
console.log('\n6. chunk-local coordinates, D = 11, 1 m blocks');
console.log('   Offsets are bounded by the chunk span, so float32 resolves them finely');
console.log('   no matter how big the planet is.\n');
console.log('   chunk level   cells across   span      float32 resolution inside the chunk');
for (const C of [4, 6, 8, 10]) {
  const span = 2 ** (11 - C);
  console.log(`   C = ${String(C).padStart(2)} ${String(span).padStart(14)} ${(span + ' m').padStart(9)}   ${m(ulp32(span)).padStart(12)}`);
}
console.log('\n   the same, for an Earth-sized world at 1 m blocks (D = 23):');
for (const C of [16, 18, 20]) {
  const span = 2 ** (23 - C);
  console.log(`   C = ${String(C).padStart(2)} ${String(span).padStart(14)} ${(span + ' m').padStart(9)}   ${m(ulp32(span)).padStart(12)}`);
}

// ---- 7. how often does a walking player cross a rebase boundary? ------------
console.log('\n7. rebase frequency for a player walking at 1.4 m/s');
console.log('   anchor          span      one crossing every');
for (const [label, span] of [['cell (D=11)', 1], ['chunk C=8', 8], ['chunk C=6', 32], ['chunk C=4', 128]]) {
  const s = span / 1.4;
  console.log(`   ${label.padEnd(14)} ${(span + ' m').padStart(7)}   ${s < 60 ? s.toFixed(1) + ' s' : (s/60).toFixed(1) + ' min'}`);
}
console.log('   Re-anchoring is renormalising an integer and a small offset: no world shift,');
console.log('   no traversal of live objects, nothing to schedule.');
