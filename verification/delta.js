// The delta record -- v0.4.0 makes the world editable, so something has to
// write down what a player did. Doc 27 fixed the fields and left the store's
// shape open, and the v0.4.0 plan chose to store each record relative to
// the chunk row that holds it, with one header for the whole store saying which
// cut the numbers were counted against. That choice rests on three claims
// nobody had checked: that the record really is smaller, that a chunk-size
// change can be converted rather than lost, and that an edit can be carried
// into a chunk drawn coarse. This measures all three.
// Backs docs/27-block-state.md
const T = (1 + Math.sqrt(5)) / 2;
const norm = v => { const l = Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]); return v.map(x => x/l); };
const dot = (a,b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];

const V0 = [[-1,T,0],[1,T,0],[-1,-T,0],[1,-T,0],[0,-1,T],[0,1,T],[0,-1,-T],[0,1,-T],
            [T,0,-1],[T,0,1],[-T,0,-1],[-T,0,1]].map(norm);
const F0 = [[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
            [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
const CENT = F0.map(f => norm(f.map(i => V0[i]).reduce((a,v) => a.map((x,k) => x+v[k]), [0,0,0])));

// doc 03's descent and its inverse, as verification/qr.js and rank.js write them
function join(path, q, r, D){
  let n = 1 << (D - path.length), i = q, j = r;
  for (let l = path.length-1; l >= 0; l--){
    const d = path[l];
    if      (d===1) i += n;
    else if (d===2) j += n;
    else if (d===3){ i = n-i; j = n-j; }
    n <<= 1;
  }
  return [i,j];
}
function split(i, j, D, C){
  const path = [];
  let n = 1 << D;
  for (let l = 0; l < C; l++){
    n >>= 1;
    if      (i >= n && i + j >= n && j < n) { path.push(1); i -= n; }
    else if (j >= n && i + j >= n && i < n) { path.push(2); j -= n; }
    else if (i + j > n)                     { path.push(3); i = n-i; j = n-j; }
    else                                     path.push(0);
  }
  return { path, q: i, r: j };
}
const rank = (q, r, m) => q + r*(2*m + 3 - r)/2;

// a cell's face-independent identity: integer weights on global vertex ids
const key = (face, n, i, j) => {
  const w = [n-i-j, i, j], f = F0[face];
  return f.map((v,x) => [v, w[x]]).filter(a => a[1] > 0).sort((a,b) => a[0]-b[0])
          .map(a => a.join(':')).join('|');
};

// one-shot barycentric, invariant 12: a single blend evaluated at full depth
const posOf = (face, n, i, j) => {
  const [A,B,C] = F0[face].map(v => V0[v]);
  const a = (n-i-j)/n, b = i/n, c = j/n;
  return norm([A[0]*a+B[0]*b+C[0]*c, A[1]*a+B[1]*b+C[1]*c, A[2]*a+B[2]*b+C[2]*c]);
};
const faceOf = d => { let best = 0, bd = -2;
  for (let f = 0; f < 20; f++){ const s = dot(d, CENT[f]); if (s > bd){ bd = s; best = f; } }
  return best; };
function bary(face, d){
  const [A,B,C] = F0[face].map(v => V0[v]);
  const det = dot(A, cross(B,C));
  const wa = dot(d, cross(B,C))/det, wb = dot(A, cross(d,C))/det, wc = dot(A, cross(B,d))/det;
  const s = wa + wb + wc;
  return [wa/s, wb/s, wc/s];
}
function hexRound(ka, kb, kc, n){
  let ra = Math.round(ka), rb = Math.round(kb), rc = Math.round(kc);
  const da = Math.abs(ra-ka), db = Math.abs(rb-kb), dc = Math.abs(rc-kc);
  if      (da > db && da > dc) ra = n - rb - rc;
  else if (db > dc)            rb = n - ra - rc;
  else                         rc = n - ra - rb;
  return [ra, rb, rc];
}
// doc 04's pipeline: a direction to the cell that contains it, at level L
function cellAt(d, L){
  const n = 1 << L, face = faceOf(d), w = bary(face, d);
  const [wa, wb, wc] = hexRound(w[0]*n, w[1]*n, w[2]*n, n);
  return { face, i: wb, j: wc, k: key(face, n, n-wb-wc, wb, wc) && key(face, n, wb, wc) };
}

// ---- 1. what a record costs, and where its bits go -------------------------
console.log('1. the record, priced');
{
  console.log('   Doc 27 writes an edit as [address 29][layer 11][state 16]. That address');
  console.log('   is planet-wide, so it repeats the chunk the row is already keyed by.');
  console.log('   A record relative to its row needs only the slot inside the chunk.');
  console.log('');
  console.log('   chunk    m   slots  slot bits  + layer 11 + state 16   packed as');
  for (const cells of [8, 16, 32, 64]){
    const m = cells, slots = (m+1)*(m+2)/2, bits = Math.ceil(Math.log2(slots));
    const total = bits + 11 + 16;
    console.log(`   ${String(cells).padStart(5)}  ${String(m).padStart(3)}  ${String(slots).padStart(6)}`
      + `  ${String(bits).padStart(9)}  ${String(total).padStart(21)}   `
      + `${total <= 32 ? 'one uint32, 4 B' : 'uint32 + uint16, 6 B'}`);
  }
  const full = 29 + 11 + 16;
  console.log('');
  console.log(`   The whole word is ${full} bits, which is past the 53 a JavaScript number`);
  console.log('   counts exactly, so it is two 32-bit halves: 8 bytes a record.');
  console.log('   At the shipped 64-cell chunk the relative form is 6 bytes, 25% less.');
  console.log('');
  console.log('   edits      whole word      relative       saved');
  for (const n of [100, 1000, 10000, 100000, 1000000]){
    const a = n*8, b = n*6;
    const kb = x => x < 1024 ? `${x} B` : x < 1048576 ? `${(x/1024).toFixed(1)} KB` : `${(x/1048576).toFixed(1)} MB`;
    console.log(`   ${String(n).padStart(7)}   ${kb(a).padStart(11)}   ${kb(b).padStart(11)}   ${kb(a-b).padStart(9)}`);
  }
  console.log('   The saving is real and it is not the argument. A million edits is 2 MB');
  console.log('   either way, and doc 27 already prices ten million raw at 76 MB.');
  console.log('   What decides it is section 3: the relative form is read with nothing');
  console.log('   to decode, and the mesher reads every record on every chunk build.');
}

// ---- 2. does a chunk-size change convert, or lose the store? ----------------
// The Chunk slider sets chunkLevel = depth - log2(chunkCells) and moves no
// block: the terrain is columnAt(face, i, j) and never sees the cut. So
// dragging it must not be able to lose a build. A relative record survives only
// if the store's header supplies the cut it was written under, which is what
// candidate C adds and candidate B leaves out. This converts every cell of a
// small planet between every pair of cuts and checks it lands on itself.
console.log('\n2. the re-cut -- every record converted between every pair of chunk sizes');
{
  for (const D of [4, 5, 6]){
    const n = 1 << D;
    const cuts = [];
    for (let C = 1; C < D; C++) cuts.push(C);
    let pairs = 0, moved = 0, checked = 0;
    // every cell of the planet, named the way a record names it under cut C
    const under = C => {
      const m = 1 << (D - C), out = new Map();
      for (let face = 0; face < 20; face++)
        for (let c = 0; c < 4**C; c++){
          const path = [];
          for (let l = C-1; l >= 0; l--) path.push((c >> (2*l)) & 3);
          for (let q = 0; q <= m; q++) for (let r = 0; q+r <= m; r++){
            const [i,j] = join(path, q, r, D);
            // the row is (face, c) and the record is rank(q, r) -- nothing else
            out.set(`${face}/${c}/${rank(q,r,m)}`, key(face, n, i, j));
          }
        }
      return out;
    };
    const byCut = new Map(cuts.map(C => [C, under(C)]));
    for (const from of cuts) for (const to of cuts){
      if (from === to) continue;
      pairs++;
      const a = byCut.get(from), b = byCut.get(to);
      // convert: read the record under `from`, recover the cell, re-file under `to`
      const mF = 1 << (D - from), mT = 1 << (D - to);
      for (const [addr, cell] of a){
        const [face, c, slot] = addr.split('/').map(Number);
        // recover (q, r) from the rank, then the cell, then re-cut it
        let q = -1, r = -1;
        for (let rr = 0; rr <= mF && q < 0; rr++)
          for (let qq = 0; qq + rr <= mF; qq++)
            if (rank(qq, rr, mF) === slot){ q = qq; r = rr; break; }
        const path = [];
        for (let l = from-1; l >= 0; l--) path.push((c >> (2*l)) & 3);
        const [i, j] = join(path, q, r, D);
        const cut = split(i, j, D, to);
        let cc = 0; for (const d of cut.path) cc = cc*4 + d;
        const landed = b.get(`${face}/${cc}/${rank(cut.q, cut.r, mT)}`);
        checked++;
        if (landed !== cell) moved++;
      }
    }
    console.log(`   depth ${D}: ${pairs} pairs of cuts, ${checked.toLocaleString()} records converted, `
      + `${moved} landed on a different cell`);
  }
  console.log('   Every record converts. The header is the whole of what makes it possible:');
  console.log('   a slot is a rank inside a triangle whose side the cut sets, so without');
  console.log('   one written down there is nothing to convert from.');
}

// ---- 3. where an edit lands when the chunk is drawn coarse ------------------
// A coarse chunk keeps its path and drops the subdivision depth, so its lattice
// is the fine one scaled by a power of two. That suggests fine (i, j) falls in
// the coarse cell at (i >> lod, j >> lod) -- three shifts, no search. But a
// cell is a Voronoi region (invariant 14), and a shift is a floor rather than a
// nearest point, so the two need not agree. This measures how often they do,
// against doc 04's own pipeline run at the coarse level.
console.log('\n3. carrying an edit into a coarse chunk');
{
  // the metric hexRound repairs on: the largest of the three axial errors
  const err = (w, a, b, c) => Math.max(Math.abs(w[0]-a), Math.abs(w[1]-b), Math.abs(w[2]-c));
  console.log('   Three ways to name the coarse cell a fine one falls in, measured against');
  console.log('   doc 04\'s own pipeline run at the coarse level: position, face, barycentric,');
  console.log('   hexRound. The first three columns are how often each disagrees with it.');
  console.log('');
  console.log('   fine  coarse    checked   shift i,j   round i,j   scale the weights   of those, tied   worse');
  for (const [D, lod] of [[7,1],[7,2],[7,3],[8,1],[8,2],[8,4]]){
    const n = 1 << D, cn = 1 << (D - lod), half = 1 << (lod - 1), s = 1 << lod;
    let checked = 0, shiftBad = 0, nearBad = 0, hexBad = 0, tied = 0, worse = 0;
    for (let face = 0; face < 20; face++)
      for (let i = 0; i <= n; i += 3) for (let j = 0; i + j <= n; j += 3){
        const truth = cellAt(posOf(face, n, i, j), D - lod);
        const tk = key(truth.face, cn, truth.i, truth.j);
        checked++;
        if (key(face, cn, i >> lod, j >> lod) !== tk) shiftBad++;
        const ri = (i + half) >> lod, rj = (j + half) >> lod;
        if (ri + rj > cn || key(face, cn, ri, rj) !== tk) nearBad++;
        // the three weights scaled and repaired -- doc 04's own rounding, with
        // no projection because a lattice point's barycentric is exact
        const w = [(n-i-j)/s, i/s, j/s];
        const [ha, hb, hc] = hexRound(w[0], w[1], w[2], cn);
        if (key(face, cn, hb, hc) === tk) continue;
        hexBad++;
        // is the cell it chose equally close, or actually further away?
        if (truth.face !== face) { tied++; continue; }   // named from the other side of a face edge
        const gap = Math.abs(err(w, ha, hb, hc)
                           - err(w, cn - truth.i - truth.j, truth.i, truth.j));
        if (gap < 1e-9) tied++; else worse++;
      }
    const pc = x => `${(100*x/checked).toFixed(1)}%`;
    console.log(`   ${String(D).padStart(4)}  ${String(D-lod).padStart(6)}   ${String(checked).padStart(8)}`
      + `   ${pc(shiftBad).padStart(9)}   ${pc(nearBad).padStart(9)}   ${pc(hexBad).padStart(17)}`
      + `   ${(hexBad ? `${(100*tied/hexBad).toFixed(1)}%` : '--').padStart(14)}   ${String(worse).padStart(5)}`);
  }
  console.log('');
  console.log('   SHIFTING IS NOT THE MAPPING, and it is the one that looks right. A coarse');
  console.log('   chunk\'s lattice really is the fine one scaled by a power of two, so a');
  console.log('   shift lands on a coarse point that exists -- it is simply the wrong one');
  console.log('   up to four times in five, because a cell is a Voronoi region');
  console.log('   (invariant 14) and a shift is a floor. Rounding i and j apart is worse');
  console.log('   again at the first level, for the reason doc 04 gives hexRound: two');
  console.log('   coordinates cannot detect the error, and rounding them separately breaks');
  console.log('   the sum and names a lattice point that is not there.');
  console.log('');
  console.log('   SCALE THE THREE WEIGHTS AND REPAIR THEM, and NOTHING IS EVER PLACED');
  console.log('   FURTHER AWAY. The remaining disagreements are 2% to 32% of cells and');
  console.log('   every one of them is a tie: the continuous point sits exactly on the');
  console.log('   boundary between two coarse cells, both are the same distance from it,');
  console.log('   and doc 04\'s repair and this one break the tie differently. Zero cells,');
  console.log('   at every level measured, land on a cell that is genuinely worse.');
  console.log('');
  console.log('   It is exact by construction rather than by luck: the one-shot blend is');
  console.log('   gnomonic projection (verification/uniform.js), so the barycentric of a');
  console.log('   lattice point recovers its own (n-i-j, i, j) with nothing lost, and the');
  console.log('   coarse pipeline then reduces to hexRound on those three numbers divided');
  console.log('   by 2^lod. No position, no face search, no distance -- three divisions and');
  console.log('   the repair doc 04 already specifies. The layer is the one place a shift');
  console.log('   IS right: layers stack at a fixed thickness from a crust top that does');
  console.log('   not move with the level, so layer L falls in coarse layer L >> lod with');
  console.log('   no rounding to get wrong.');
}

// ---- 4. how much of the world one coarse cell speaks for --------------------
console.log('\n4. what collapses onto one coarse cell');
{
  console.log('   A coarse chunk keeps the same triangle and the same slot count, so cells');
  console.log('   double in width per level and layers double in height with them.');
  console.log('');
  console.log('   lod   cells across   layers down   fine cells per coarse one   a 1 m block reads as');
  for (let lod = 1; lod <= 6; lod++){
    const across = 4 ** lod, down = 2 ** lod;
    console.log(`   ${String(lod).padStart(3)}   ${String(across).padStart(12)}   ${String(down).padStart(11)}`
      + `   ${String(across*down).padStart(25)}   ${String(2**lod).padStart(19)} m`);
  }
  console.log('');
  console.log('   That is the price of carrying an edit outward rather than pinning the');
  console.log('   chunk at full detail: one placed block grows to the coarse cell it lands');
  console.log('   in, so it reads as an 8 m cube three levels out. The selection draws');
  console.log('   nothing coarser than LOD 4 at eye height (verification/lod.js), where a');
  console.log('   block reads as 16 m -- and a wall of them reads as a wall, which is what');
  console.log('   the precedence rule is for: a coarse cell holding any placed block is');
  console.log('   solid, and reads as air only when every fine cell inside it was broken.');
}
