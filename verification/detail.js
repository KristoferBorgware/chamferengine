// Which level of detail a chunk is drawn at, and where on the ground the steps
// between levels land. Backs docs/14-meshing-and-lod.md
const T = (1 + Math.sqrt(5)) / 2;
const norm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];

const VERTS = [[-1,T,0],[1,T,0],[-1,-T,0],[1,-T,0],[0,-1,T],[0,1,T],[0,-1,-T],[0,1,-T],
               [T,0,-1],[T,0,1],[-T,0,-1],[-T,0,1]].map(norm);
const FACES = [[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
               [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];

const K = Math.sqrt((8 * Math.PI) / (10 * Math.sqrt(3)));   // blockSize ~ K*R/2^D

/** One lattice point of a face, by the one-shot barycentric blend. */
function latticePoint(face, n, i, j) {
  const [ia, ib, ic] = FACES[face], A = VERTS[ia], B = VERTS[ib], C = VERTS[ic];
  const wb = i / n, wc = j / n, wa = 1 - wb - wc;
  return norm([A[0]*wa + B[0]*wb + C[0]*wc, A[1]*wa + B[1]*wb + C[1]*wc, A[2]*wa + B[2]*wb + C[2]*wc]);
}

/** `(i, j)` from the route down the triangles, replayed from the bottom up. */
function joinPath(path, q, r, depth) {
  let n = 1 << (depth - path.length), i = q, j = r;
  for (let l = path.length - 1; l >= 0; l--) {
    const d = path[l];
    if (d === 1) i += n; else if (d === 2) j += n;
    else if (d === 3) { i = n - i; j = n - j; }
    n <<= 1;
  }
  return [i, j];
}

/** Where a chunk's triangle points, and the cap that holds it. */
function extent(face, path, depth, chunkLevel) {
  const n = 1 << depth, m = 1 << (depth - chunkLevel);
  const points = [[0,0],[m,0],[0,m]].map(([q, r]) => {
    const [i, j] = joinPath(path, q, r, depth);
    return latticePoint(face, n, i, j);
  });
  const c = norm(points.reduce((s, p) => [s[0]+p[0], s[1]+p[1], s[2]+p[2]], [0,0,0]));
  return { c, cosRadius: Math.min(...points.map(p => dot(c, p))) };
}

/** The walk the client runs: split a triangle while the viewer is close to it. */
function select(depth, finest, view, viewerRadius, surfaceRadius, detail, peak = 0) {
  const eye = view.map(x => x * viewerRadius);
  const horizon = (r, s) => (r <= s ? 0 : Math.acos(s / r));
  const reach = horizon(viewerRadius, surfaceRadius) + horizon(surfaceRadius + peak, surfaceRadius);
  const out = [];
  const walk = (face, path, level) => {
    const e = extent(face, path, depth, level);
    const cos = dot(view, e.c);
    const spread = Math.acos(Math.min(1, e.cosRadius));
    if (cos < Math.cos(Math.min(Math.PI, reach + spread))) return;
    const d = Math.hypot(e.c[0]*surfaceRadius - eye[0], e.c[1]*surfaceRadius - eye[1],
                         e.c[2]*surfaceRadius - eye[2]);
    const width = 2 * spread * surfaceRadius;
    if (level < finest && d < detail * width) {
      for (let child = 0; child < 4; child++) walk(face, [...path, child], level + 1);
      return;
    }
    out.push({ lod: finest - level, level, distance: d, width });
  };
  for (let face = 0; face < 20; face++) walk(face, [], 0);
  return out;
}

// The worked planet, at the settings the client ships: 1 m blocks on a radius
// that makes them exact, which is depth 13.
const D = 13, BLOCK = 1, R = (BLOCK * 2 ** D) / K;
const VIEW = norm([0.31, 0.62, 0.72]);

// ---- 1. a chunk's width, against the edge it spans ---------------------------
// The rule compares a distance against a chunk's width, and "width" is the cap
// that holds the triangle rather than the triangle's own edge. Cell spacing
// varies 1.41:1 across a face, so that cap is not one number.
console.log('1. a chunk triangle, and the cap the selector measures it by');
console.log(`   worked planet: depth ${D}, ${BLOCK} m blocks, radius ${R.toFixed(1)} m\n`);
console.log('   chunk level   cells on an edge   nominal edge   cap width, narrowest to widest');
for (const C of [10, 9, 8, 7, 6]) {
  const cells = 2 ** (D - C);
  const widths = [];
  // Every chunk of one face, at levels where that is a small enough number.
  const walk = (path) => {
    if (path.length === Math.min(C, 5)) {
      const e = extent(0, [...path, ...new Array(Math.max(0, C - 5)).fill(0)], D, C);
      widths.push(2 * Math.acos(Math.min(1, e.cosRadius)) * R);
      return;
    }
    for (let child = 0; child < 4; child++) walk([...path, child]);
  };
  walk([]);
  const lo = Math.min(...widths), hi = Math.max(...widths), nominal = cells * BLOCK;
  console.log(`   ${String(C).padStart(11)}   ${String(cells).padStart(16)}   ${(nominal + ' m').padStart(12)}`
    + `   ${lo.toFixed(1)} to ${hi.toFixed(1)} m  (${(lo / nominal).toFixed(2)} to ${(hi / nominal).toFixed(2)} of it)`);
}
console.log('\n   So a detail ring is not a circle. A chunk sitting where the lattice is');
console.log('   stretched is wider than one at a face corner, and the wider chunk needs to');
console.log('   be further away before it is drawn.');

// ---- 2. where the ground coarsens, and by how much ---------------------------
// A chunk is drawn once the viewer is `detail` of its own widths away from it,
// and a chunk one step coarser is twice as wide.
const DETAIL = 2;
console.log('\n2. where each detail step begins, at 1 m blocks');
console.log('   (the nearest chunk drawn at that step, over the whole selection)\n');
console.log('   chunk cells   first 2 m cells   first 4 m   first 8 m   first 16 m');
const rings = new Map();
for (const cells of [8, 16, 32, 64]) {
  const C = D - Math.round(Math.log2(cells));
  const picks = select(D, C, VIEW, R + 1.7, R, DETAIL, 1);
  const nearest = new Map();
  for (const p of picks)
    if (!(nearest.get(p.lod) <= p.distance)) nearest.set(p.lod, p.distance);
  rings.set(cells, nearest);
  const at = lod => nearest.has(lod) ? Math.round(nearest.get(lod)) + ' m' : '--';
  console.log(`   ${String(cells).padStart(11)}   ${at(1).padStart(15)}   ${at(2).padStart(9)}`
    + `   ${at(3).padStart(9)}   ${at(4).padStart(10)}`);
}
console.log('\n   Every step doubles the distance, exactly, because a chunk one step coarser');
console.log('   is twice as wide. And the four rows are one sequence read at four offsets:');
console.log('   what decides a ring is how wide the chunk drawn there is, in metres, and');
console.log('   not which knob produced that width.\n');
console.log('   chunk drawn is   ...which happens at');
const byWidth = new Map();
// Step 0 has no ring: it is what is drawn wherever nothing coarser has taken
// over, right down to the viewer's feet.
for (const [cells, nearest] of rings)
  for (const [lod, d] of nearest)
    if (lod > 0) byWidth.set(cells * BLOCK * 2 ** lod, d);
for (const [w, d] of [...byWidth].sort((a, b) => a[0] - b[0]))
  console.log(`   ${(w + ' m wide').padStart(14)}   ${(Math.round(d) + ' m out').padStart(18)}`
    + `   = ${(d / w).toFixed(2)} of its width`);
console.log('\n   One number, at every width: a chunk is drawn once the viewer is about 2.4');
console.log('   of its nominal widths away from it -- the multiplier of 2, against a cap');
console.log('   some 1.2 times the nominal edge.');

// ---- 3. how big a cell is at a given distance --------------------------------
console.log('\n3. what a standing player sees, by distance');
console.log('   (the coarsest chunk covering that distance; a band holds two levels');
console.log('    where the rings fall)\n');
console.log('   distance     chunk 8 cells   chunk 32 cells');
for (const d of [10, 20, 40, 60, 100, 150, 250, 400, 700]) {
  const sizes = [8, 32].map(cells => {
    const C = D - Math.round(Math.log2(cells));
    const picks = select(D, C, VIEW, R + 1.7, R, DETAIL, 1)
      .filter(p => Math.abs(p.distance - d) < d * 0.15);
    if (picks.length === 0) return '--';
    const lods = [...new Set(picks.map(p => p.lod))].sort((a, b) => a - b);
    return lods.map(l => (BLOCK * 2 ** l) + ' m').join(' / ');
  });
  console.log(`   ${(d + ' m').padStart(8)}     ${sizes[0].padStart(13)}   ${sizes[1].padStart(14)}`);
}

// ---- 4. what the detail multiplier costs -------------------------------------
// Raising it holds full detail further out and pays for it in chunks held.
console.log('\n4. chunks held, by the detail multiplier, at 32 cells a chunk');
console.log('   (60 m of altitude is the worst case: near and far are both on screen)\n');
console.log('   altitude    detail 2   detail 2.5   detail 3');
for (const alt of [1.7, 60, 300]) {
  const C = D - 5;
  const counts = [2, 2.5, 3].map(detail => select(D, C, VIEW, R + alt, R, detail, 1).length);
  console.log(`   ${(alt + ' m').padStart(8)}    ${String(counts[0]).padStart(8)}`
    + `   ${String(counts[1]).padStart(10)}   ${String(counts[2]).padStart(8)}`);
}
// ---- 5. how far apart two touching chunks can be ----------------------------
// The apron has to cover whatever the neighbour drew, so what matters is not
// that two chunks differ but by how much they can differ.
function selectWithCaps(depth, finest, view, viewerRadius, surfaceRadius, detail, peak) {
  const eye = view.map(x => x * viewerRadius);
  const horizon = (r, s) => (r <= s ? 0 : Math.acos(s / r));
  const reach = horizon(viewerRadius, surfaceRadius) + horizon(surfaceRadius + peak, surfaceRadius);
  const out = [];
  const walk = (face, path, level) => {
    const e = extent(face, path, depth, level);
    const spread = Math.acos(Math.min(1, e.cosRadius));
    if (dot(view, e.c) < Math.cos(Math.min(Math.PI, reach + spread))) return;
    const d = Math.hypot(e.c[0]*surfaceRadius - eye[0], e.c[1]*surfaceRadius - eye[1],
                         e.c[2]*surfaceRadius - eye[2]);
    if (level < finest && d < detail * 2 * spread * surfaceRadius) {
      for (let child = 0; child < 4; child++) walk(face, [...path, child], level + 1);
      return;
    }
    out.push({ level, c: e.c, r: spread });
  };
  for (let face = 0; face < 20; face++) walk(face, [], 0);
  return out;
}

console.log('\n5. the level jump between chunks that touch');
console.log('   (two chunks touch when their caps do)\n');
console.log('   chunk cells   altitude   view   pairs touching   1 level apart   2 or more');
let worstJump = 0, pairsSeen = 0;
for (const cells of [8, 32]) {
  for (const alt of [1.7, 60, 300]) {
    for (const [name, v] of [['A', VIEW], ['B', norm([1, 0.2, -0.4])], ['C', norm([0, 1, 0])]]) {
      const C = D - Math.round(Math.log2(cells));
      const held = selectWithCaps(D, C, v, R + alt, R, DETAIL, 1);
      const jumps = [0, 0, 0];
      let pairs = 0;
      for (let a = 0; a < held.length; a++)
        for (let b = a + 1; b < held.length; b++) {
          const sep = Math.acos(Math.min(1, dot(held[a].c, held[b].c)));
          if (sep > (held[a].r + held[b].r) * 1.02) continue;
          pairs++;
          const gap = Math.abs(held[a].level - held[b].level);
          worstJump = Math.max(worstJump, gap);
          jumps[Math.min(2, gap)]++;
        }
      pairsSeen += pairs;
      console.log(`   ${String(cells).padStart(11)}   ${(alt + ' m').padStart(8)}   ${name}`
        + `   ${String(pairs).padStart(14)}   ${String(jumps[1]).padStart(13)}   ${String(jumps[2]).padStart(9)}`);
    }
  }
}
console.log(`\n   Over ${pairsSeen.toLocaleString('en-US')} touching pairs the widest jump is ${worstJump} level.`);
console.log('   Splitting on a triangle\'s own width restricts itself: a neighbour close');
console.log('   enough to be split is close enough that its own neighbour splits too. So a');
console.log('   seam is always between two levels, never three -- but that is a measurement');
console.log('   over these views and not a rule the walk enforces, and the apron does not');
console.log('   need it: it covers the strip whatever the neighbour chose.');

console.log('\n   ANSWER: the level is chosen per triangle, from distance against that');
console.log('   triangle\'s own width -- never from the viewer\'s altitude, which reaches it');
console.log('   only by moving every distance at once. At 32 cells and 1 m blocks the');
console.log('   ground first coarsens at 154 m; at 8 cells it coarsens at 38 m.');
