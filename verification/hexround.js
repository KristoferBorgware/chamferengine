// Does rounding a barycentric triple actually give the CONTAINING cell?
// On a flat triangular lattice the Voronoi cell of a lattice point is the
// hexagon, exactly. The real cells are Voronoi regions ON THE SPHERE of the
// same lattice radially projected outward, and gnomonic projection preserves
// straight lines but not equidistance -- so the two Voronoi diagrams need not
// agree. This measures whether they do. Backs docs/04-position-lookup.md
const T = (1 + Math.sqrt(5)) / 2, DEG = 180 / Math.PI;
const norm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];

const V0 = [[-1,T,0],[1,T,0],[-1,-T,0],[1,-T,0],[0,-1,T],[0,1,T],[0,-1,-T],[0,1,-T],
            [T,0,-1],[T,0,1],[-T,0,-1],[-T,0,1]].map(norm);
const F0 = [[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
            [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
const CENT = F0.map(f => norm(f.map(i => V0[i]).reduce((a,v) => a.map((x,k) => x + v[k]), [0,0,0])));

// one-shot: the construction doc 15 pins the design to
const oneShot = (A, B, C, n, i, j) => {
  const a = (n-i)/n, b = (i-j)/n, c = j/n;
  return norm([A[0]*a + B[0]*b + C[0]*c, A[1]*a + B[1]*b + C[1]*c, A[2]*a + B[2]*b + C[2]*c]);
};

// barycentric of a DIRECTION in a face: solve [A B C] w = d, then scale to sum 1
function bary(A, B, C, d){
  const det = dot(A, cross(B, C));
  const wa = dot(d, cross(B, C)) / det;
  const wb = dot(A, cross(d, C)) / det;
  const wc = dot(A, cross(B, d)) / det;
  const s = wa + wb + wc;
  return [wa/s, wb/s, wc/s];
}

// doc 04's hexRound, verbatim in spirit: repair whichever coordinate moved furthest
function hexRound(ka, kb, kc, n){
  let ra = Math.round(ka), rb = Math.round(kb), rc = Math.round(kc);
  const da = Math.abs(ra-ka), db = Math.abs(rb-kb), dc = Math.abs(rc-kc);
  if      (da > db && da > dc) ra = n - rb - rc;
  else if (db > dc)            rb = n - ra - rc;
  else                         rc = n - ra - rb;
  return [ra, rb, rc];
}

// every distinct cell centre at level L, as flat typed arrays
function cells(L){
  const n = 1 << L, X = [], Y = [], Z = [], idx = new Map();
  for (const f of F0){
    const [A,B,C] = f.map(i => V0[i]);
    for (let i = 0; i <= n; i++) for (let j = 0; j <= i; j++){
      const p = oneShot(A, B, C, n, i, j);
      const k = p.map(x => Math.round(x * 1e7)).join(',');
      if (idx.has(k)) continue;
      idx.set(k, X.length); X.push(p[0]); Y.push(p[1]); Z.push(p[2]);
    }
  }
  return { x: Float64Array.from(X), y: Float64Array.from(Y), z: Float64Array.from(Z), n: X.length };
}

// deterministic sample directions -- no Math.random, so the output is stable
function sampler(seed){
  let s = seed >>> 0;
  const next = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  return () => {                                  // uniform on the sphere
    const u = 2*next() - 1, th = 2*Math.PI*next(), r = Math.sqrt(1 - u*u);
    return [r*Math.cos(th), r*Math.sin(th), u];
  };
}

console.log('does hexRound return the cell whose centre is nearest on the sphere?');
console.log('  hexRound finds the nearest lattice point in the FLAT face plane. Whether');
console.log('  that is also the nearest ON THE SPHERE is the open question from doc 11,');
console.log('  because gnomonic projection keeps straight lines but not equidistance.\n');
console.log('   L   cells   samples   mismatches      rate   worst margin   furthest off');

const rows = [];
for (const [L, S] of [[2, 40000], [3, 40000], [4, 25000], [5, 15000], [6, 12000], [7, 5000]]){
  const GRID = cells(L), n = 1 << L, rnd = sampler(0x9e3779b9 + L);
  let bad = 0, worstMargin = 0, sumMargin = 0, worstHops = 0;
  for (let t = 0; t < S; t++){
    const d = rnd();
    // step 1: nearest face centroid (lookup.js proves this exact)
    let fi = 0, best = -2;
    for (let g = 0; g < 20; g++){ const v = dot(d, CENT[g]); if (v > best){ best = v; fi = g; } }
    const [A,B,C] = F0[fi].map(i => V0[i]);
    // steps 2-3: barycentric, then round
    const [a,b,c] = bary(A, B, C, d);
    const [ra, rb, rc] = hexRound(a*n, b*n, c*n, n);
    if (ra < 0 || rb < 0 || rc < 0) continue;          // rounded off the face; doc 05's job
    const guess = oneShot(A, B, C, n, n - ra, rc);      // (i,j) from the triple
    // brute force: the genuinely nearest cell centre on the sphere
    let bd = -2, bk = -1;
    for (let k = 0; k < GRID.n; k++){
      const v = d[0]*GRID.x[k] + d[1]*GRID.y[k] + d[2]*GRID.z[k];
      if (v > bd){ bd = v; bk = k; }
    }
    const dg = dot(d, guess);
    if (bd - dg > 1e-12){
      bad++;
      const spacing = 1.20459 / n;         // angular cell spacing at unit radius
      const cl = x => Math.acos(Math.max(-1, Math.min(1, x)));
      const margin = (cl(dg) - cl(bd)) / spacing;
      sumMargin += margin;
      if (margin > worstMargin) worstMargin = margin;
      // how far apart are the two cells? 1 spacing = edge-adjacent
      const hops = cl(guess[0]*GRID.x[bk] + guess[1]*GRID.y[bk] + guess[2]*GRID.z[bk]) / spacing;
      if (hops > worstHops) worstHops = hops;
    }
  }
  rows.push({ L, S, bad, rate: bad / S, worstMargin, worstHops, meanMargin: bad ? sumMargin / bad : 0 });
  console.log(`   ${L} ${String(GRID.n).padStart(7)} ${String(S).padStart(9)} ${String(bad).padStart(12)}`
    + ` ${(bad / S * 100).toFixed(3).padStart(8)}% ${worstMargin.toFixed(5).padStart(14)}`
    + ` ${worstHops.toFixed(3).padStart(11)} cells`);
}

console.log('\n  margin       = how much further hexRound\'s cell is than the true nearest,');
console.log('                 as a fraction of one cell spacing');
console.log('  furthest off = distance between the two cells; 1.0 means edge-adjacent');

const worst = Math.max(...rows.map(r => r.worstMargin));
const hops = Math.max(...rows.map(r => r.worstHops));
const meanM = rows.reduce((s,r) => s + r.meanMargin*r.bad, 0) / rows.reduce((s,r) => s + r.bad, 0);
const trend = rows.map(r => (r.rate * 100).toFixed(2) + '%').join(' -> ');

console.log(`\n  RESULT: hexRound and nearest-centre-on-the-sphere DISAGREE, and the rate`);
console.log(`  settles near 1% instead of falling to zero: ${trend}`);
console.log(`  (the last three levels are sampling-limited, +/- 0.1 to 0.2 points, so read`);
console.log(`  them as a plateau around 1% rather than as a trend)`);
console.log(`  It plateaus because a face triangle's shape is scale-free: refining shrinks`);
console.log(`  the cells and the disagreement band together, so their ratio holds.`);
console.log(`\n  But every disagreement is small and local:`);
console.log(`    - the two cells are always EDGE-ADJACENT (worst separation ${hops.toFixed(3)} spacings)`);
console.log(`    - hexRound's cell is at most ${worst.toFixed(4)} of a spacing further away`);
console.log(`    - mean overshoot among disagreements is ${meanM.toFixed(4)} of a spacing`);
console.log(`  So a point is only ever handed to a neighbour when it sits within about a`);
console.log(`  tenth of a cell of the boundary between them.`);

console.log(`\n  READ THIS THE OTHER WAY UP. hexRound is a pure function of position, so it`);
console.log(`  already defines a partition of the sphere: exact, gap-free, overlap-free,`);
console.log(`  and edge-adjacent everywhere. It is the radial projection of the PLANAR`);
console.log(`  Voronoi diagram. That partition is not wrong -- it is simply a different`);
console.log(`  definition of "the cell" from spherical Voronoi, and the two differ by at`);
console.log(`  most ${worst.toFixed(3)} of a cell.`);
console.log(`\n  The design decision is therefore which one is normative, not which one is`);
console.log(`  correct. Defining cells as the projected planar Voronoi diagram makes doc 04`);
console.log(`  exact by construction and doc 09's straight-line ray walk exact as well.`);
console.log(`  Defining them as spherical Voronoi makes both approximate by ~1%. Doc 14`);
console.log(`  meshes a third thing again -- the dual polyhedron's corners -- so the`);
console.log(`  specification currently implies three boundaries that agree only to ~0.1`);
console.log(`  of a cell. Pick one and say so.`);
