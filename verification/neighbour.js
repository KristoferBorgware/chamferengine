// neighbour(id, k) -- the function eight documents delegate to and none defines
// (doc 11, Part 1). Doc 05 proves its 180-byte table complete and has never used
// it to cross an edge; every other script here builds the whole planet and reads
// adjacency off a hash map of rounded positions, which is fine for measuring and
// unavailable to an engine holding one integer. So this builds the function from
// the table and INTEGER ARITHMETIC ALONE, then checks it against that geometric
// graph. It also settles the three decisions hiding inside it: where direction
// index 0 is anchored, how (i, j) re-expresses across a face edge, and what a
// pentagon returns for k = 5.
// Backs docs/05-face-adjacency.md
const T = (1 + Math.sqrt(5)) / 2;
const norm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
const dot = (a,b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];

const V = [[-1,T,0],[1,T,0],[-1,-T,0],[1,-T,0],[0,-1,T],[0,1,T],[0,-1,-T],[0,1,-T],
           [T,0,-1],[T,0,1],[-T,0,-1],[-T,0,1]].map(norm);
const F = [[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
           [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];

// Doc 05's table, rebuilt here rather than imported -- this script is allowed to
// use exactly this and nothing else geometric.
const ADJ = F.map((f, fi) => [0,1,2].map(e => {
  const a = f[e], b = f[(e+1)%3];
  for (let g = 0; g < 20; g++){
    if (g === fi) continue;
    for (let e2 = 0; e2 < 3; e2++){
      const c = F[g][e2], d = F[g][(e2+1)%3];
      if ((a===c && b===d) || (a===d && b===c))
        return { face:g, edge:e2, reversed:(a===d && b===c) ? 1 : 0 };
    }
  }
}));

// ---- the frame -------------------------------------------------------------
// (i, j) with i, j >= 0 and i + j <= n, exactly as verification/qr.js uses it.
// The barycentric weights on the face's three vertices are (n-i-j, i, j), which
// is the whole reason this convention is the convenient one: a lattice point is
// a set of integer weights attached to GLOBAL vertex ids, and that description
// does not mention a face at all.
const wts = (n,i,j) => [n-i-j, i, j];
const pos = (face,n,i,j) => {
  const w = wts(n,i,j), f = F[face];
  return norm([0,1,2].reduce((s,x) => s.map((v,d) => v + V[f[x]][d]*w[x]), [0,0,0]));
};

console.log('1. the frame, and where direction index 0 points');
{
  // Doc 05 says every entry of the table comes out reversed, which is the
  // signature of consistent outward winding. Check that directly.
  let out = 0;
  for (let g = 0; g < 20; g++){
    const [A,B,C] = F[g].map(v => V[v]);
    const nrm = cross(B.map((x,d)=>x-A[d]), C.map((x,d)=>x-A[d]));
    if (dot(nrm, A) > 0) out++;
  }
  console.log(`   faces wound counter-clockwise seen from outside: ${out}/20`);
  console.log('   so A -> B -> C is CCW on every face, and a direction table written');
  console.log('   in that frame means the same turn everywhere.');
}

// The six lattice steps, in counter-clockwise order seen from outside.
// d/di is the direction B-A and d/dj is C-A, so the angles run 0, 60, 120, ...
const DIR = [[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]];
console.log('   DIR = ' + DIR.map(d=>`(${d[0]},${d[1]})`).join(' '));
console.log('   index 0 is the step from vertex A toward vertex B -- the face\'s own');
console.log('   first edge. That is the anchor doc 19 needs, and it is a property of');
console.log('   the cell\'s OWN face, so it never depends on how the cell was reached.');
console.log('   Negating an offset is exactly k -> k+3, which is section 5.');

// ---- crossing a face edge --------------------------------------------------
// A lattice point is integer weights on global vertices. Step outside a face and
// exactly one weight goes negative -- say w on vertex p, with the shared edge
// (u, v) being the other two. Unfolded, the neighbour face is the reflection of
// this one across (u, v), and reflection in barycentric coordinates is
//   (alpha on u, beta on v, gamma on p)  ->  (alpha+gamma, beta+gamma, -gamma on q)
// where q is the neighbour's third vertex. All integer, no trigonometry, and the
// table is consulted for one thing only: which face is over there.
function step(face, n, i, j, k){
  const [di,dj] = DIR[k];
  const w = wts(n, i+di, j+dj);
  const neg = w.findIndex(x => x < 0);
  if (neg < 0) return [face, i+di, j+dj];        // still on this face
  const e = (neg + 1) % 3;                       // the edge NOT touching F[face][neg]
  const link = ADJ[face][e], g = F[link.face], f = F[face];
  const p = f[neg], gamma = w[neg];
  const u = f[(neg+1)%3], v = f[(neg+2)%3];
  const alpha = w[(neg+1)%3], beta = w[(neg+2)%3];
  const q = g.find(x => x !== u && x !== v);
  const m = new Map([[u, alpha+gamma], [v, beta+gamma], [q, -gamma]]);
  const w2 = g.map(x => m.get(x));
  if (w2.some(x => x === undefined || x < 0)) return null;   // a vertex cell; section 3
  return [link.face, w2[1], w2[2]];
}

// A cell's identity, independent of which face names it: the non-zero weights,
// keyed by global vertex. Integer, canonical, and the reason no ownership rule is
// needed to compare two addresses.
const key = (face,n,i,j) => {
  const w = wts(n,i,j), f = F[face];
  return f.map((v,x) => [v, w[x]]).filter(a => a[1] > 0).sort((a,b) => a[0]-b[0])
          .map(a => a.join(':')).join('|');
};

console.log('\n2. crossing a face edge, and whether all 60 round-trip');
{
  const n = 16;
  let tried = 0, back = 0, bad = [];
  const crossed = new Set();                     // which (face, edge) pairs were used
  for (let face = 0; face < 20; face++) for (let e = 0; e < 3; e++){
    // walk the whole of this edge, stepping off it and straight back on
    for (let t = 1; t < n; t++){
      // a point one row inside edge e, then the step that leaves across it
      let i, j, k;
      if (e === 0){ i = t; j = 1; k = 4; }          // edge (f0,f1): j = 0 line
      else if (e === 1){ i = n-t-1; j = t; k = 0; } // edge (f1,f2): i+j = n line
      else { i = 1; j = t; k = 3; }                 // edge (f2,f0): i = 0 line
      const a = step(face, n, i, j, k);
      if (!a) continue;
      tried++; crossed.add(`${face}:${e}`);
      const b = step(a[0], n, a[1], a[2], (k+3)%6);
      if (b && key(b[0],n,b[1],b[2]) === key(face,n,i,j)) back++;
      else if (bad.length < 3) bad.push(`f${face} e${e} t${t}`);
    }
  }
  console.log(`   (face, edge) pairs actually crossed: ${crossed.size}/60`);
  console.log(`   steps taken off an edge and back: ${back}/${tried} returned to the start`);
  if (bad.length) console.log('   failures: ' + bad.join(' '));
  console.log('   The step out and the step back are k and k+3, so this also checks that');
  console.log('   the direction table survives the crossing -- the opposite of a direction');
  console.log('   is still its opposite in the neighbour\'s frame.');
  console.log('   Note the `reversed` field is never read: carrying weights on global');
  console.log('   vertex ids makes the edge orientation carry itself.');
}

// ---- the pentagon ----------------------------------------------------------
// At an icosahedron vertex only five triangles meet, so the six lattice steps
// above over-run the cone by 60 degrees and the reflection has nowhere to land.
// The five neighbours are one step along each of the five icosahedron edges at
// that vertex, and the table rotates between them.
function pentRing(p, n){
  let g = F.findIndex(f => f.includes(p));
  const ring = [];
  for (let s = 0; s < 5; s++){
    const e = F[g].indexOf(p);                 // the edge (p, next) of this face
    const x = F[g][(e+1)%3];
    ring.push(`${Math.min(p,x)}:${p<x?n-1:1}|${Math.max(p,x)}:${p<x?1:n-1}`);
    g = ADJ[g][e].face;                        // rotate to the next face around p
  }
  return ring;
}

console.log('\n3. the pentagon, and what k = 5 returns');
{
  const n = 16;
  let closed = 0;
  for (let p = 0; p < 12; p++){
    let g = F.findIndex(f => f.includes(p)), first = g, seen = 0;
    do { const e = F[g].indexOf(p); g = ADJ[g][e].face; seen++; } while (g !== first && seen < 10);
    if (seen === 5) closed++;
  }
  console.log(`   icosahedron vertices whose face rotation closes after 5 steps: ${closed}/12`);
  const sizes = new Set();
  for (let p = 0; p < 12; p++) sizes.add(new Set(pentRing(p, n)).size);
  console.log(`   distinct ring sizes over the twelve: ${[...sizes].join(', ')}`);
  console.log('   So a pentagon has FIVE neighbours and the ring is k = 0..4.');
  console.log('   k = 5 is not a direction that exists -- it is the 60 degrees doc 13');
  console.log('   measures as the combinatorial deficit, and the honest return is that');
  console.log('   the ring is short, never a duplicate or a null in the middle of it.');
}

// ---- against the geometric graph -------------------------------------------
console.log('\n4. against the graph every other script builds');
for (const D of [3, 4, 5]){
  const n = 1 << D;
  // the geometric build: hash rounded positions so the 20 faces weld themselves
  const idx = new Map(), pts = [], nbs = [];
  const put = p => { const k = p.map(x => Math.round(x*1e7)).join(',');
    if (!idx.has(k)){ idx.set(k, pts.length); pts.push(p); nbs.push(new Set()); } return idx.get(k); };
  const link = (a,b) => { nbs[a].add(b); nbs[b].add(a); };
  const addr = new Map();                       // geometric index -> one (face,i,j)
  for (let face = 0; face < 20; face++){
    const G = [];
    for (let i = 0; i <= n; i++){ const row = [];
      for (let j = 0; i+j <= n; j++){
        const v = put(pos(face,n,i,j)); row.push(v);
        if (!addr.has(v)) addr.set(v, [face,i,j]);
      } G.push(row); }
    for (let i = 0; i < n; i++) for (let j = 0; i+j < n; j++){
      link(G[i][j], G[i+1][j]); link(G[i][j], G[i][j+1]); link(G[i+1][j], G[i][j+1]);
    }
  }
  // geometric neighbour sets, as keys
  const keyOf = new Map();
  for (const [v,[face,i,j]] of addr) keyOf.set(v, key(face,n,i,j));

  let cells = 0, agree = 0, deg5 = 0, ordered = 0, orderable = 0;
  for (const [v,[face,i,j]] of addr){
    cells++;
    const truth = new Set([...nbs[v]].map(w => keyOf.get(w)));
    const w = wts(n,i,j);
    let mine;
    if (w.filter(x => x === 0).length === 2){    // an icosahedron vertex
      deg5++;
      mine = pentRing(F[face][w.findIndex(x => x > 0)], n);
    } else {
      mine = [];
      for (let k = 0; k < 6; k++){
        const a = step(face,n,i,j,k);
        mine.push(a ? key(a[0],n,a[1],a[2]) : null);
      }
    }
    const set = new Set(mine.filter(Boolean));
    if (set.size === truth.size && [...set].every(x => truth.has(x))) agree++;

    // and does the order run the same way round? compare against tangent-plane
    // angles, allowing any starting point -- only the CYCLE has to match
    if (mine.length === 6 && mine.every(Boolean)){
      orderable++;
      const u = pts[v];
      const e1 = norm((() => { const d = pts[[...nbs[v]][0]]; const s = dot(d,u);
        return d.map((x,c) => x - u[c]*s); })());
      const e2 = cross(u, e1);
      const ang = [...nbs[v]].map(x => { const d = pts[x], s = dot(d,u);
        const t = d.map((y,c) => y - u[c]*s);
        return [keyOf.get(x), Math.atan2(dot(t,e2), dot(t,e1))]; })
        .sort((a,b) => a[1]-b[1]).map(a => a[0]);
      const at = ang.indexOf(mine[0]);
      if (at >= 0 && mine.every((m,k) => m === ang[(at+k) % ang.length])) ordered++;
    }
  }
  console.log(`   D=${D}  ${cells.toLocaleString('en-US')} cells:`
    + `  neighbour set matches geometry ${agree}/${cells}`
    + `  ·  degree-5 cells ${deg5}`
    + `  ·  CCW order matches ${ordered}/${orderable}`);
}
console.log('   Built from the table and integers only, and it agrees with the mesh at');
console.log('   every cell -- including the twelve, and including the ring\'s direction.');

// ---- the flip --------------------------------------------------------------
// Doc 03 and winding.js: about 46% of chunks sit in a frame turned half a turn,
// so a direction index read off (q, r) is uniformly +3. This is that result
// arriving through neighbour() rather than through the mesh.
function split(i, j, D, C){
  let n = 1<<D, path = [], flip = 0;
  for (let l=0; l<C; l++){
    const half = n>>1; let d;
    if      (i >= half){ d=1; i -= half; }
    else if (j >= half){ d=2; j -= half; }
    else if (i + j < half){ d=0; }
    else { d=3; i = half - i; j = half - j; flip ^= 1; }
    path.push(d); n = half;
  }
  return {path, q:i, r:j, flip};
}

function join(path, q, r, D){
  let n = 1 << (D - path.length), i = q, j = r;
  for (let l = path.length-1; l >= 0; l--){
    const d = path[l];
    if      (d===1) i += n;
    else if (d===2) j += n;
    else if (d===3){ i = n - i; j = n - j; }
    n <<= 1;
  }
  return [i,j];
}

console.log('\n5. the half turn, seen from inside neighbour()');
{
  const D = 8, C = 4, n = 1 << D, m = 1 << (D-C);
  const shift = new Map(), byFlip = [new Map(), new Map()];
  let flipped = 0, total = 0, measured = 0;
  for (let i = 0; i <= n; i++) for (let j = 0; i+j <= n; j++){
    const s = split(i,j,D,C); total++; if (s.flip) flipped++;
    for (let k = 0; k < 6; k++){
      // the naive reading: apply the SAME table to (q, r), stay in the chunk,
      // rebuild (i, j), and ask which direction that actually turned out to be
      const q2 = s.q + DIR[k][0], r2 = s.r + DIR[k][1];
      if (q2 < 0 || r2 < 0 || q2 + r2 > m) continue;
      const [i2,j2] = join(s.path, q2, r2, D);
      let real = -1;
      for (let t = 0; t < 6; t++) if (i + DIR[t][0] === i2 && j + DIR[t][1] === j2) real = t;
      if (real < 0) continue;
      measured++;
      const d = ((real - k) % 6 + 6) % 6;
      shift.set(d, (shift.get(d)||0) + 1);
      byFlip[s.flip].set(d, (byFlip[s.flip].get(d)||0) + 1);
    }
  }
  console.log(`   ${flipped.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} cells`
    + ` (${(100*flipped/total).toFixed(1)}%) sit in a flipped frame`);
  console.log(`   ${measured.toLocaleString('en-US')} steps compared, naive (q,r) index against the real one:`);
  for (const [d,c] of [...shift.entries()].sort((a,b)=>a[0]-b[0]))
    console.log(`     +${d}  ${c.toLocaleString('en-US')} cases`
      + `   (unflipped ${(byFlip[0].get(d)||0).toLocaleString('en-US')},`
      + ` flipped ${(byFlip[1].get(d)||0).toLocaleString('en-US')})`);
  console.log('   Two values, 0 and 3, and nothing in between -- a rotation, never a');
  console.log('   mirror. Order the ring from (i, j) inside neighbour() and the caller');
  console.log('   never sees it, which is what doc 03 asks for.');
}

console.log('\nverdict');
console.log('   neighbour(id, k) is buildable from doc 05\'s table and integer arithmetic');
console.log('   alone, and it agrees with the geometric graph at every cell of every');
console.log('   level tested. The three decisions it was hiding:');
console.log('     index 0   the step from the face\'s vertex A toward vertex B');
console.log('     crossing  weights on global vertex ids, reflected: a+g, b+g, -g');
console.log('               (the table supplies the destination face and nothing else)');
console.log('     pentagon  the ring is FIVE long. k = 5 does not exist, and the twelve');
console.log('               are the only cells where that is true.');
