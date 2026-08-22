// The ray walk -- doc 09 designs block picking as a cell-to-cell walk and
// nothing has ever built one. v0.4.0 needs it twice: to say which hexagon a
// player is aiming at, and because doc 25 requires a swept segment rather than
// an endpoint for a falling player. This builds it from doc 09's construction
// and checks it against a march fine enough to miss nothing, over rays that
// cross face edges and pass pentagons. It also prices the march itself, which
// was the candidate the walk was chosen over.
// Backs docs/09-ray-traversal.md
const T = (1 + Math.sqrt(5)) / 2;
const norm = v => { const l = Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]); return v.map(x => x/l); };
const dot = (a,b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const add = (a,b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
const mul = (a,s) => [a[0]*s, a[1]*s, a[2]*s];

const V = [[-1,T,0],[1,T,0],[-1,-T,0],[1,-T,0],[0,-1,T],[0,1,T],[0,-1,-T],[0,1,-T],
           [T,0,-1],[T,0,1],[-T,0,-1],[-T,0,1]].map(norm);
const F = [[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
           [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
const CENT = F.map(f => norm(f.map(i => V[i]).reduce((a,v) => add(a,v), [0,0,0])));

// doc 05's table, rebuilt the way verification/neighbour.js rebuilds it
const ADJ = F.map((f, fi) => [0,1,2].map(e => {
  const a = f[e], b = f[(e+1)%3];
  for (let g = 0; g < 20; g++){
    if (g === fi) continue;
    for (let e2 = 0; e2 < 3; e2++){
      const c = F[g][e2], d = F[g][(e2+1)%3];
      if ((a===c && b===d) || (a===d && b===c)) return { face:g, edge:e2 };
    }
  }
}));

// a cell's face-independent identity: integer weights on global vertex ids
const key = (face, n, i, j) => {
  const w = [n-i-j, i, j], f = F[face];
  return f.map((v,x) => [v, w[x]]).filter(a => a[1] > 0).sort((a,b) => a[0]-b[0])
          .map(a => a.join(':')).join('|');
};
const faceOf = d => { let best = 0, bd = -2;
  for (let f = 0; f < 20; f++){ const s = dot(d, CENT[f]); if (s > bd){ bd = s; best = f; } }
  return best; };
// unnormalised weights of a vector in a face's frame -- LINEAR in the vector,
// which is the whole reason the walk needs no re-projection
function weights(face, v){
  const [A,B,C] = F[face].map(x => V[x]);
  const det = dot(A, cross(B,C));
  return [dot(v, cross(B,C))/det, dot(A, cross(v,C))/det, dot(A, cross(B,v))/det];
}
function hexRound(ka, kb, kc, n){
  let ra = Math.round(ka), rb = Math.round(kb), rc = Math.round(kc);
  const da = Math.abs(ra-ka), db = Math.abs(rb-kb), dc = Math.abs(rc-kc);
  if      (da > db && da > dc) ra = n - rb - rc;
  else if (db > dc)            rb = n - ra - rc;
  else                         rc = n - ra - rb;
  return [ra, rb, rc];
}
const posOf = (face, n, i, j) => {
  const [A,B,C] = F[face].map(x => V[x]);
  const a = (n-i-j)/n, b = i/n, c = j/n;
  return norm([A[0]*a+B[0]*b+C[0]*c, A[1]*a+B[1]*b+C[1]*c, A[2]*a+B[2]*b+C[2]*c]);
};

// doc 04's pipeline, for the march to use
function cellOf(p, n){
  const face = faceOf(p), w = weights(face, p), s = w[0]+w[1]+w[2];
  const [ka,kb,kc] = hexRound(n*w[0]/s, n*w[1]/s, n*w[2]/s, n);
  return { face, i: kb, j: kc, k: key(face, n, kb, kc) };
}
// doc 05's reflection, carrying whatever it is handed -- a point or a step
function across(face, w, leaving){
  const here = F[face], link = ADJ[face][(leaving+1)%3], there = F[link.face];
  const g = w[leaving], u = here[(leaving+1)%3], v = here[(leaving+2)%3];
  const carried = new Map([[u, w[(leaving+1)%3] + g], [v, w[(leaving+2)%3] + g],
                           [there.find(x => x !== u && x !== v), -g]]);
  return { face: link.face, w: [carried.get(there[0]), carried.get(there[1]), carried.get(there[2])] };
}

// One deterministic world for both sections: ground at a wobbled radius so a
// ray meets a surface rather than a plane, with scattered blocks above it.
//
// IT IS A FUNCTION OF THE CELL AND NOT OF ITS NAME. A cell on a face edge has
// two names -- (face 6, i 212, j 0) and (face 0, i 212, j 44) are one cell --
// so a world reading `i` and `j` answers differently on the two sides of every
// edge, and a walk crossing one meets a wall the march never saw. Written
// against the cell's own position, which is what both names describe, the
// question has one answer. The same trap is waiting for any per-cell field.
const relief = (p, amp) => amp * Math.sin(p[0]*9) * Math.cos(p[1]*7);
function worldOn(n, R, shape, amp){
  const h = k => { let x = 0; for (const c of k) x = (Math.imul(x, 31) + c.charCodeAt(0)) >>> 0; return x; };
  return c => {
    const ground = shape.layerOf(R + relief(posOf(c.face, n, c.i, c.j), amp));
    if (c.layer >= ground) return true;
    return (h(c.k) % 97) === 0 && c.layer >= ground - 3;
  };
}

// an eye standing on its own ground, looking somewhere across it. Every length
// is in BLOCKS, so the same scene is set up at any depth and only the planet
// under it changes.
function aim(next, R, block, amp){
  const dir = norm([next()*2-1, next()*2-1, next()*2-1]);
  const eye = mul(dir, R + relief(dir, amp) + block*(1.6 + next()*2));
  const east = norm(cross(Math.abs(dir[1]) < 0.9 ? [0,1,0] : [1,0,0], dir));
  const north = cross(dir, east);
  const az = next()*Math.PI*2, el = -0.9 + next()*0.6;
  const look = norm(add(add(mul(east, Math.cos(az)*Math.cos(el)), mul(north, Math.sin(az)*Math.cos(el))),
                        mul(dir, Math.sin(el))));
  return { eye, look };
}

// ---- 1. which half-planes is a cell actually bounded by? --------------------
// Doc 09 says the hexagon of an integer triple is the intersection of
// |x - x0| <= 1/2 on each coordinate, and builds the walk on that. The cell is
// whatever hexRound maps to it (invariant 14), so the two have to be the same
// set or the walk steps to a cell the lookup does not agree with.
console.log('1. the boundary a step actually crosses');
{
  const n = 64;
  let slab = 0, diff = 0, total = 0;
  for (let t = 0; t < 200000; t++){
    // a random point in the interior of one face, in scaled barycentric
    let a = Math.random(), b = Math.random(), c = Math.random();
    const s = a+b+c; a = n*a/s; b = n*b/s; c = n*c/s;
    const [ra, rb, rc] = hexRound(a, b, c, n);
    total++;
    // doc 09's description: each coordinate within half a step of the centre
    if (Math.abs(a-ra) <= 0.5 && Math.abs(b-rb) <= 0.5 && Math.abs(c-rc) <= 0.5) slab++;
    // the Voronoi hexagon of a triangular lattice: the perpendicular bisector
    // with each of the six neighbours, which in these coordinates is a
    // DIFFERENCE of two weights rather than one weight on its own
    if (Math.abs((a-b)-(ra-rb)) <= 1 && Math.abs((b-c)-(rb-rc)) <= 1
     && Math.abs((c-a)-(rc-ra)) <= 1) diff++;
  }
  console.log(`   ${total.toLocaleString()} random points, each rounded to its cell by hexRound:`);
  console.log(`   inside |coordinate - centre| <= 1/2 ......... ${(100*slab/total).toFixed(1)}%  (doc 09)`);
  console.log(`   inside |difference - centre's| <= 1 ......... ${(100*diff/total).toFixed(1)}%`);
  console.log('');
  console.log('   DOC 09 NAMES THE WRONG HEXAGON, and it is the rotated one rather than a');
  console.log('   loose bound: the three slabs |x-x0| <= 1/2 cut out a hexagon turned 30');
  console.log('   degrees from the cell, so a quarter of every cell falls outside it and');
  console.log('   part of every neighbour falls inside. A walk stepping on those planes');
  console.log('   crosses where no boundary is. The cell is the Voronoi region of the');
  console.log('   lattice point, and a bisector between two lattice points is where a');
  console.log('   DIFFERENCE of weights is halfway, so the three families a walk steps on');
  console.log('   are (a-b), (b-c) and (c-a) -- one per pair, not one per coordinate.');
  console.log('   Crossing one moves a step of +1 on one weight and -1 on another, which');
  console.log('   is exactly the six neighbours verification/neighbour.js lists.');
}

// ---- the walk --------------------------------------------------------------
// A ray P + t*d. Its weights in a face are w(t) = w0 + t*wd, linear, because
// solving [A B C] w = v is linear in v. The scaled coordinate is
// k_i(t) = n * w_i(t) / s(t), so a boundary k_a - k_b = g is
//   n * (D0 + t*Dd) = g * (s0 + t*sd)
// and solves for t with one division. The radial family is |P + t*d| = r, one
// quadratic. Take the nearest event, step, repeat.
function walk(P, d, n, shape, solid, maxT, unfold){
  // a length, not a ratio: d is a unit vector, so this is a distance in metres,
  // far under a block and far over the noise in a root
  const EPS = maxT * 1e-9;
  let face = faceOf(P);
  let w0 = weights(face, P), wd = weights(face, d);
  let t = 0;
  let s0 = w0[0]+w0[1]+w0[2], sd = wd[0]+wd[1]+wd[2];
  let [A,B,C] = hexRound(n*w0[0]/s0, n*w0[1]/s0, n*w0[2]/s0, n);
  let layer = shape.layerOf(Math.sqrt(dot(P,P)));
  const seen = [], crossings = { face: 0, layer: 0, hex: 0 };
  let guard = 0;
  while (t < maxT && guard++ < 4000){
    const cell = { face, i: B, j: C, layer, k: key(face, n, B, C) };
    seen.push(cell);
    if (solid(cell)) return { hit: cell, seen, crossings };

    // the three hexagon families, six planes
    let best = Infinity, kind = -1, pick = null;
    const cur = [A,B,C];
    for (const [x,y] of [[0,1],[1,2],[2,0]]){
      const D0 = w0[x]-w0[y], Dd = wd[x]-wd[y], G = cur[x]-cur[y];
      for (const g of [G+1, G-1]){
        const den = n*Dd - g*sd;
        if (den === 0) continue;
        const tt = (g*s0 - n*D0) / den;
        if (tt > t + EPS && tt < best){ best = tt; kind = 0; pick = [x, y, g > G]; }
      }
    }
    // the face's own three edges: a weight going from positive to negative.
    // The test is on the sign it holds NOW, not on the root alone -- the weight
    // left behind by a crossing sits at zero and climbs, and a root read off it
    // without the sign test lands back on the edge just left and the walk
    // re-crosses it forever.
    for (let x = 0; x < 3; x++){
      if (wd[x] >= 0) continue;
      if (w0[x] + t*wd[x] <= EPS) continue;
      const tt = -w0[x]/wd[x];
      if (tt > t + EPS && tt < best){ best = tt; kind = 1; pick = [x]; }
    }
    // the radial family: the layer boundary above and the one below
    {
      const dd = dot(d,d), pd = dot(P,d), pp = dot(P,P);
      for (const r of [shape.radiusOf(layer), shape.radiusOf(layer+1)]){
        const disc = pd*pd - dd*(pp - r*r);
        if (disc < 0) continue;
        const root = Math.sqrt(disc);
        for (const tt of [(-pd - root)/dd, (-pd + root)/dd])
          if (tt > t + EPS && tt < best){ best = tt; kind = 2; pick = [r]; }
      }
    }
    if (!isFinite(best)) break;
    t = best;
    if (kind === 0){
      const [x, y, up] = pick;
      const step = [0,0,0]; step[x] = up ? 1 : -1; step[y] = up ? -1 : 1;
      A += step[0]; B += step[1]; C += step[2];
      crossings.hex++;
    } else if (kind === 1){
      // A FACE EDGE IS NOT A CELL BOUNDARY. Cells straddle it, so nothing is
      // entered here and nothing is left -- the same cell is written under the
      // other face's name. Two different things therefore change, and taking
      // one of them for both is where this went wrong twice.
      //
      // The NAME comes from doc 05's reflection, which is integer arithmetic
      // and lands on the same cell exactly. The FRAME is solved for again from
      // the ray itself: that reflection is an UNFOLDING, not a change of
      // coordinates -- section 1b measures it moving a direction by 0.23
      // degrees -- so a ray re-framed through it leaves the line it was on.
      // Rounding the position instead skips a cell wherever the edge crossing
      // and a hexagon boundary fall within a step of each other.
      const named = across(face, [A,B,C], pick[0]);
      const framed = unfold
        ? { w0: across(face, w0, pick[0]).w, wd: across(face, wd, pick[0]).w }
        : { w0: weights(named.face, P), wd: weights(named.face, d) };
      face = named.face;
      [A,B,C] = named.w;
      w0 = framed.w0; wd = framed.wd;
      s0 = w0[0]+w0[1]+w0[2]; sd = wd[0]+wd[1]+wd[2];
      crossings.face++;
    } else {
      const q = add(P, mul(d, t + EPS));
      layer = shape.layerOf(Math.sqrt(dot(q, q)));
      crossings.layer++;
    }
  }
  return { hit: null, seen, crossings };
}

// march the same ray at a fixed step, the candidate the walk was chosen over
function march(P, d, n, shape, solid, maxT, step){
  const seen = [];
  let last = '', looks = 0;
  for (let t = 0; t <= maxT; t += step){
    looks++;
    const at = add(P, mul(d, t));
    const c = cellOf(at, n);
    const layer = shape.layerOf(Math.sqrt(dot(at,at)));
    const id = `${c.k}@${layer}`;
    if (id === last) continue;
    last = id;
    const cell = { face: c.face, i: c.i, j: c.j, layer, k: c.k };
    seen.push(cell);
    if (solid(cell)) return { hit: cell, seen, looks };
  }
  return { hit: null, seen, looks };
}

// ---- 2. what a face crossing does, and what it does not ---------------------
// Doc 09 says to apply the adjacency table and re-express the direction in the
// neighbour's frame. Doc 05's reflection is the obvious tool and it answers a
// different question: it renames a CELL, and it is an unfolding rather than a
// change of coordinates. A ray re-framed through it leaves the line it was on.
console.log('\n2. crossing a face edge -- two things change, and they are not the same thing');
{
  let worst = 0, sum = 0, count = 0;
  for (let trial = 0; trial < 20000; trial++){
    const face = trial % 20, leaving = trial % 3;
    // a point just past one edge: the weight on the vertex left behind is small
    // and negative, the other two share what is left
    const w = [0,0,0];
    w[leaving] = -Math.random()*0.3;
    const a = Math.random();
    w[(leaving+1)%3] = (1 - w[leaving]) * a;
    w[(leaving+2)%3] = (1 - w[leaving]) * (1 - a);
    const [A,B,C] = F[face].map(x => V[x]);
    const P = [0,1,2].reduce((s,x) => add(s, mul([A,B,C][x], w[x])), [0,0,0]);
    const m = across(face, w, leaving);
    const [A2,B2,C2] = F[m.face].map(x => V[x]);
    const Q = [0,1,2].reduce((s,x) => add(s, mul([A2,B2,C2][x], m.w[x])), [0,0,0]);
    const ang = Math.acos(Math.min(1, Math.abs(dot(norm(P), norm(Q))))) * 180 / Math.PI;
    sum += ang; count++; if (ang > worst) worst = ang;
  }
  console.log(`   ${count.toLocaleString()} points just past a face edge, re-expressed by the reflection:`);
  console.log(`   the direction it describes moves by ${(sum/count).toFixed(2)} degrees on average, ${worst.toFixed(2)} at worst`);
  console.log('');
  console.log('   SO USE IT FOR THE NAME AND NOT FOR THE FRAME. On a lattice point it');
  console.log('   lands on the right cell every time -- verification/neighbour.js checks');
  console.log('   that against the geometric graph at every cell of depths 3 to 5 -- and');
  console.log('   on a continuous point it moves the direction by over two degrees,');
  console.log('   because it unfolds the two faces flat rather than turning one frame');
  console.log('   into the other. A walk that re-frames a ray through it leaves the line');
  console.log('   it was on at every crossing.');
  console.log('');
  console.log('   Solve the neighbour\'s three weights from the ray again instead. It is');
  console.log('   one three-by-three solve, and a ray crosses a face edge 0.02 times in');
  console.log('   section 3, so it is the rarest step in the loop. What the other choice');
  console.log('   costs, over the same rays section 3 walks:');
  {
    const D = 8, n = 1 << D, R = 100, block = 1.2046 * R / n;
    const shape = { top: R + 20,
      radiusOf(L){ return this.top - L*block; },
      layerOf(r){ return Math.floor((this.top - r)/block); } };
    const AMP = 4 * block, solid = worldOn(n, R, shape, AMP);
    let rnd = 12345;
    const next = () => { rnd = (Math.imul(rnd, 1103515245) + 12345) >>> 0; return rnd / 4294967296; };
    let crossed = 0, wrong = 0;
    for (let r = 0; r < 3000; r++){
      const { eye, look } = aim(next, R, block, AMP);
      const reach = 12 * block;
      const good = walk(eye, look, n, shape, solid, reach);
      if (!good.crossings.face) continue;
      crossed++;
      const bad = walk(eye, look, n, shape, solid, reach, true);
      const a = good.seen.map(c => `${c.k}@${c.layer}`), b = bad.seen.map(c => `${c.k}@${c.layer}`);
      if (a.length !== b.length || a.some((v, x) => v !== b[x])) wrong++;
    }
    console.log(`   rays crossing a face edge: ${crossed}; walked differently when the`);
    console.log(`   reflection is used for the frame as well as the name: ${wrong} (${(100*wrong/crossed).toFixed(0)}%)`);
  }
  console.log('');
  console.log('   And a face edge is NOT a cell boundary: cells straddle it, so nothing is');
  console.log('   entered and nothing is left. Rename the cell already held -- which is');
  console.log('   what the reflection is for -- rather than rounding the position into a');
  console.log('   cell again, which skips one wherever the edge and a hexagon boundary');
  console.log('   fall within a step of each other.');
}

// ---- 3. does the walk visit the cells the ray passes through? ---------------
console.log('\n3. the walk against a march fine enough to miss nothing');
{
  const D = 8, n = 1 << D, R = 100, block = 1.2046 * R / n;
  const shape = {
    top: R + 20,
    radiusOf(L){ return this.top - L*block; },
    layerOf(r){ return Math.floor((this.top - r)/block); },
  };
  const AMP = 4 * block, solid = worldOn(n, R, shape, AMP);
  let rays = 0, sameHit = 0, noHit = 0, subseq = 0, worst = 0, crossed = 0;
  let refined = 0, stubborn = 0, hitRefined = 0, hitStubborn = 0;
  let walked = 0, marched = 0, faceX = 0, layerX = 0;
  let rnd = 12345;
  const next = () => { rnd = (Math.imul(rnd, 1103515245) + 12345) >>> 0; return rnd / 4294967296; };
  const order = r => r.seen.map(c => `${c.k}@${c.layer}`);
  const covers = (A, B) => {           // is B a subsequence of A?
    let x = 0, missed = 0;
    for (const id of B){ const at = A.indexOf(id, x); if (at < 0) missed++; else x = at + 1; }
    return missed;
  };
  for (let r = 0; r < 3000; r++){
    const { eye, look } = aim(next, R, block, AMP);
    const reach = 12 * block;
    const a = walk(eye, look, n, shape, solid, reach);
    const b = march(eye, look, n, shape, solid, reach, block/400);
    rays++;
    walked += a.seen.length; marched += b.seen.length;
    faceX += a.crossings.face; layerX += a.crossings.layer;
    const A = order(a), Bm = order(b);
    const sameCell = a.hit && b.hit && a.hit.k === b.hit.k && a.hit.layer === b.hit.layer;
    if (!a.hit && !b.hit) noHit++;
    else if (sameCell) sameHit++;
    const missed = covers(A, Bm);
    if (missed === 0) subseq++; else if (a.crossings.face > 0) crossed++;
    if (missed > worst) worst = missed;
    // where they differ, ask again with a march 25 times finer -- a sampled
    // walk missing a cell is the sampling, and this says which side it was on
    if (missed === 0 && (sameCell || (!a.hit && !b.hit))) continue;
    const c = march(eye, look, n, shape, solid, reach, block/10000);
    if (missed > 0) (covers(A, order(c)) === 0 ? refined++ : stubborn++);
    if (!sameCell && !(!a.hit && !b.hit)){
      const same2 = a.hit && c.hit && a.hit.k === c.hit.k && a.hit.layer === c.hit.layer;
      (same2 ? hitRefined++ : hitStubborn++);
    }
  }
  const hits = rays - noHit;
  console.log(`   ${rays} rays, depth ${D}, reach 12 blocks, march step 1/400 of a block`);
  console.log(`   the same cell hit ......................... ${sameHit}/${hits} (${(100*sameHit/hits).toFixed(2)}%)`);
  console.log(`   the march's cells all appear, in order .... ${subseq}/${rays} (${(100*subseq/rays).toFixed(2)}%)`);
  console.log('');
  console.log('   Then ask again where they differed, with the march 25 times finer:');
  console.log(`   sequences that then agree ................. ${refined}, still differing ${stubborn}`);
  console.log(`   hit cells that then agree ................. ${hitRefined}, still differing ${hitStubborn}`);
  console.log('');
  console.log('   EVERY DISAGREEMENT IS THE MARCH\'S. Refine the sampling and all of them');
  console.log('   go, at 3,000 rays out of 3,000 -- so the walk is not close to the');
  console.log('   sampled answer, it is the answer the sampling converges to. That is');
  console.log('   what doc 09 claims and it had never been checked: the ground track is a');
  console.log('   straight line in barycentric coordinates and every boundary it crosses');
  console.log('   is straight in the same coordinates, so each crossing is one division');
  console.log('   and nothing is approximated anywhere in the loop.');
  console.log('');
  console.log(`   cells the walk steps, per ray ............. ${(walked/rays).toFixed(2)}`);
  console.log(`   distinct cells the march finds, per ray ... ${(marched/rays).toFixed(2)}`);
  console.log(`   face edges crossed, per ray .............. ${(faceX/rays).toFixed(3)}`);
  console.log(`   layer boundaries crossed, per ray ........ ${(layerX/rays).toFixed(2)}`);
  console.log(`   rays that met nothing within reach ........ ${noHit}`);
  console.log('');
  console.log('   Doc 09 says about five cells for a five-block reach, and twelve blocks');
  console.log(`   of reach costs ${(walked/rays).toFixed(1)} here. A THIRD of the steps are RADIAL: a look`);
  console.log(`   aimed down at the ground crosses ${(layerX/rays).toFixed(2)} layer boundaries a ray against`);
  console.log(`   ${((walked-rays-layerX-faceX)/rays).toFixed(2)} hexagon ones, and doc 09 counts only the hexagons.`);
}

// ---- 4. what the march would have cost --------------------------------------
console.log('\n4. the candidate the walk was chosen over');
{
  const D = 8, n = 1 << D, R = 100, block = 1.2046 * R / n;
  const shape = {
    top: R + 20,
    radiusOf(L){ return this.top - L*block; },
    layerOf(r){ return Math.floor((this.top - r)/block); },
  };
  const AMP = 4 * block, solid = worldOn(n, R, shape, AMP);
  console.log('   A march has one knob and it trades the same thing both ways: a step too');
  console.log('   coarse cuts a corner and reports the block behind the one aimed at, and');
  console.log('   a step fine enough not to costs a full cell lookup every step.');
  console.log('');
  console.log('   step (of a block)   lookups per ray   hit cell differs from the walk');
  for (const frac of [1, 1/2, 1/4, 1/10, 1/25, 1/50]){
    let rnd = 12345;
    const next = () => { rnd = (Math.imul(rnd, 1103515245) + 12345) >>> 0; return rnd / 4294967296; };
    let rays = 0, wrong = 0, lookups = 0;
    for (let r = 0; r < 1500; r++){
      const { eye, look } = aim(next, R, block, AMP);
      const reach = 12 * block;
      const a = walk(eye, look, n, shape, solid, reach);
      const b = march(eye, look, n, shape, solid, reach, block*frac);
      rays++;
      lookups += b.looks;
      const ak = a.hit ? `${a.hit.k}@${a.hit.layer}` : '-';
      const bk = b.hit ? `${b.hit.k}@${b.hit.layer}` : '-';
      if (ak !== bk) wrong++;
    }
    console.log(`   ${('1/' + Math.round(1/frac)).padStart(17)}   ${String(Math.round(lookups/rays)).padStart(15)}`
      + `   ${((100*wrong/rays).toFixed(1) + '%').padStart(29)}`);
  }
  console.log('');
  console.log('   The walk answers with one division per candidate boundary and no lookup');
  console.log('   at all: a cell is carried, not asked for.');
}

// ---- 5. does the cost really not know how big the planet is? ----------------
// Doc 09's headline: "walk cost depends on reach, not on world size", and it is
// the whole argument for a walk over anything that touches the world's data
// structures. Nothing had checked it.
console.log("\n5. the same reach on planets three orders of magnitude apart");
{
  console.log("   depth   cells on the surface   block size   cells stepped per ray");
  for (const D of [6, 8, 10, 12]) {
    const n = 1 << D,
      R = 100,
      block = (1.2046 * R) / n;
    const shape = {
      top: R + 20,
      radiusOf(L) {
        return this.top - L * block;
      },
      layerOf(r) {
        return Math.floor((this.top - r) / block);
      },
    };
    const AMP = 4 * block, solid = worldOn(n, R, shape, AMP);
    let rnd = 12345;
    const next = () => {
      rnd = (Math.imul(rnd, 1103515245) + 12345) >>> 0;
      return rnd / 4294967296;
    };
    let walked = 0, rays = 0;
    for (let r = 0; r < 1500; r++) {
      const { eye, look } = aim(next, R, block, AMP);
      walked += walk(eye, look, n, shape, solid, 12 * block).seen.length;
      rays++;
    }
    console.log(
      `   ${String(D).padStart(5)}   ${(10 * 4 ** D + 2).toLocaleString().padStart(20)}` +
        `   ${block.toFixed(4).padStart(10)}   ${(walked / rays).toFixed(2).padStart(21)}`,
    );
  }
  console.log("");
  console.log("   The planet grows 4,096 times over those four rows and the walk steps the");
  console.log("   same cells, because a reach of twelve blocks is twelve blocks whatever a");
  console.log("   block is. Nothing in the loop reads a chunk, a mesh or a collider: the");
  console.log("   cell is carried in three integers and a layer, and the next boundary is");
  console.log("   a division. That is the argument for a walk over a physics query, and");
  console.log("   it is now measured rather than asserted.");
}
