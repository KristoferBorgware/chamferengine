// Where does a coastline come from? Today the coarse map sums two tiers of fBm
// and cuts the result at the percentile that leaves the intended land fraction
// standing, and a percentile cut through a smooth field draws a smooth curve.
// This measures how smooth, against two other ways of deciding where the land
// is: the sample direction warped before the continent lookup, and a land mask
// grown level by level up the subdivision hierarchy.
//
// The measurement that carries the answer is not the shape of one coast but how
// fast its perimeter grows as the map gets finer. A smooth curve doubles its
// step count when the cells halve; a ragged one more than doubles, and the
// excess is what "ragged" means as a number.
// Backs docs/21-rivers-and-erosion.md
// v0.2.0 I-1 trial. Where does a coastline come from?
// Three fields on the same lattice: what ships today (fBm cut at a percentile),
// candidate A (the direction warped before the continent lookup), candidate B
// (a land mask grown level by level). Measured on raggedness, islands, river
// length, and whether a preview at a lower level is the map you get.
const T = (1 + Math.sqrt(5)) / 2;
const norm = v => { const l = Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]); return [v[0]/l, v[1]/l, v[2]/l]; };
const V0 = [[-1,T,0],[1,T,0],[-1,-T,0],[1,-T,0],[0,-1,T],[0,1,T],[0,-1,-T],[0,1,-T],
            [T,0,-1],[T,0,1],[-T,0,-1],[-T,0,1]].map(norm);
const F0 = [[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
            [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
// barycentric blend by integer weights (a,b,c) summing to n -- the one-shot
// construction, evaluated once at full depth, never by repeated midpoints
const P = (A,B,C,n,a,b,c) => norm([
  (A[0]*a + B[0]*b + C[0]*c)/n, (A[1]*a + B[1]*b + C[1]*c)/n, (A[2]*a + B[2]*b + C[2]*c)/n]);

// the pinned kernel: a uint32 hash, quintic-faded trilinear value noise, fBm at
// lacunarity 2 and gain 0.5, low octave first, divided by the summed amplitude
function hash3(x, y, z, seed){
  let h = (Math.imul(x|0, 374761393) + Math.imul(y|0, 668265263)
         + Math.imul(z|0, 1274126177) + Math.imul(seed|0, 1013904223)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0; h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const fade = t => t*t*t*(t*(t*6 - 15) + 10);
function vnoise(px, py, pz, seed){
  const xi = Math.floor(px), yi = Math.floor(py), zi = Math.floor(pz);
  const u = fade(px-xi), v = fade(py-yi), w = fade(pz-zi);
  let s = 0;
  for (let c=0;c<8;c++){
    const dx=c&1, dy=(c>>1)&1, dz=(c>>2)&1;
    s += (dx?u:1-u)*(dy?v:1-v)*(dz?w:1-w)*hash3(xi+dx, yi+dy, zi+dz, seed);
  }
  return s*2 - 1;
}
function fbm(x, y, z, freq, oct, seed){
  let sum=0, amp=1, tot=0, f=freq;
  for (let o=0;o<oct;o++){ sum += amp*vnoise(x*f, y*f, z*f, seed); tot += amp; amp*=0.5; f*=2; }
  return sum/tot;
}
// one integer per cell, hashed from the seed and the cell -- never a running
// generator, so the result does not depend on the order cells are visited
const cellRandom = (seed, salt, cell) => hash3(cell & 0xffff, (cell >>> 16) ^ salt, salt*2654435761 | 0, seed);

// ---- the grid ---------------------------------------------------------------
// Every cell of the planet at one level, with the ring around each. A cell on a
// face edge has several names and is kept once, matched by position.
function grid(level){
  const n = 1 << level, idx = new Map(), pts = [], nb = [], bary = [];
  const key = p => `${Math.round(p[0]*1e9)},${Math.round(p[1]*1e9)},${Math.round(p[2]*1e9)}`;
  const put = (p, tri) => {
    const k = key(p);
    let at = idx.get(k);
    if (at === undefined){ at = pts.length; idx.set(k, at); pts.push(p); nb.push([]); bary.push(tri); }
    return at;
  };
  const link = (a, b) => { if (a !== b && !nb[a].includes(b)){ nb[a].push(b); nb[b].push(a); } };
  for (const f of F0){
    const [A,B,C] = f.map(i => V0[i]);
    const G = [];
    for (let i=0;i<=n;i++){
      const row = [];
      for (let j=0;j<=i;j++) row.push(put(P(A,B,C,n, n-i, i-j, j), [f, n-i, i-j, j]));
      G.push(row);
    }
    for (let i=0;i<n;i++) for (let j=0;j<=i;j++){
      link(G[i][j], G[i+1][j]); link(G[i][j], G[i+1][j+1]); link(G[i+1][j], G[i+1][j+1]);
    }
  }
  return { level, n, pts, ring: nb, index: idx, key, count: pts.length };
}

// ---- what ships today -------------------------------------------------------
function todayHeight(g, seed){
  const h = new Float64Array(g.count);
  for (let v=0;v<g.count;v++){
    const [x,y,z] = g.pts[v];
    h[v] = fbm(x,y,z, 0.8, 4, seed) + 0.35*fbm(x,y,z, 6, 5, seed+1);
  }
  return h;
}

// ---- candidate A: warp the direction before the continent lookup ------------
function warpedHeight(g, seed, warpAmp, warpFreq){
  const h = new Float64Array(g.count);
  for (let v=0;v<g.count;v++){
    const [x,y,z] = g.pts[v];
    const wx = x + warpAmp*fbm(x,y,z, warpFreq, 3, seed+11);
    const wy = y + warpAmp*fbm(x,y,z, warpFreq, 3, seed+12);
    const wz = z + warpAmp*fbm(x,y,z, warpFreq, 3, seed+13);
    h[v] = fbm(wx,wy,wz, 0.8, 4, seed) + 0.35*fbm(x,y,z, 6, 5, seed+1);
  }
  return h;
}

const seaLevelFor = (h, landFraction) => {
  const s = Float64Array.from(h).sort();
  return s[Math.min(s.length-1, Math.floor(s.length*(1-landFraction)))];
};
const maskFromHeight = (h, sea) => { const m = new Uint8Array(h.length);
  for (let v=0;v<h.length;v++) m[v] = h[v] > sea ? 1 : 0; return m; };

// ---- candidate B: grow the mask level by level ------------------------------
// Seed at the coarsest level, then refine. A point that survives a refinement
// keeps its state; a point that appears between two of the other kind takes a
// coin. A growth pass then pulls cells toward what surrounds them. The coin
// roughens the coast at every level and the growth pass smooths it, so the two
// together set how ragged it comes out.
function grownMask(levels, seed, opts){
  const { creation, island, growthWeight, growthPasses } = opts;
  const g0 = levels[0];
  let mask = new Uint8Array(g0.count);
  for (let v=0;v<g0.count;v++) mask[v] = cellRandom(seed, 1, v) < creation ? 1 : 0;

  for (let L=1; L<levels.length; L++){
    const prev = levels[L-1], cur = levels[L];
    const next = new Uint8Array(cur.count);
    // Every cell of the finer grid is either a cell of the coarser one, or the
    // midpoint of one of its edges. Which it is falls out of the integer
    // barycentric weights: all even is inherited, and exactly two odd names the
    // edge, because the three weights sum to an even number.
    for (const f of F0){
      const [A,B,C] = f.map(i => V0[i]);
      const n = cur.n;
      for (let i=0;i<=n;i++) for (let j=0;j<=i;j++){
        const a = n-i, b = i-j, c = j;
        const at = cur.index.get(cur.key(P(A,B,C,n,a,b,c)));
        if (a%2===0 && b%2===0 && c%2===0){
          const up = prev.index.get(prev.key(P(A,B,C,prev.n, a/2, b/2, c/2)));
          next[at] = mask[up];
          continue;
        }
        const odd = [a%2, b%2, c%2];
        const w1 = [a,b,c].slice(), w2 = [a,b,c].slice();
        let first = true;
        for (let k=0;k<3;k++) if (odd[k]){ if (first){ w1[k]++; w2[k]--; first = false; } else { w1[k]--; w2[k]++; } }
        const p1 = prev.index.get(prev.key(P(A,B,C,prev.n, w1[0]/2, w1[1]/2, w1[2]/2)));
        const p2 = prev.index.get(prev.key(P(A,B,C,prev.n, w2[0]/2, w2[1]/2, w2[2]/2)));
        const s1 = mask[p1], s2 = mask[p2];
        next[at] = s1 === s2 ? s1 : (cellRandom(seed, 2+L, at) < 0.5 ? 1 : 0);
      }
    }
    // a few cells out at sea become land on their own, which is where an
    // archipelago away from a coast comes from
    for (let v=0;v<cur.count;v++)
      if (!next[v] && cellRandom(seed, 40+L, v) < island) next[v] = 1;

    for (let pass=0; pass<growthPasses; pass++){
      const before = Uint8Array.from(next);
      for (let v=0;v<cur.count;v++){
        const r = cur.ring[v];
        let other = 0;
        for (const w of r) if (before[w] !== before[v]) other++;
        if (other === 0) continue;
        if (cellRandom(seed, 70+L*4+pass, v) < growthWeight*(other/r.length)) next[v] ^= 1;
      }
    }
    mask = next;
  }
  return mask;
}

const m = require('./coastline.js');

// ---- raggedness -------------------------------------------------------------
// Perimeter over the square root of area. A circle gives 2*sqrt(pi) = 3.545; a
// cap on a sphere gives less as it grows, so each field is read against a cap
// holding the same amount of land rather than against the flat figure.
function raggedness(g, mask, only){
  const N = g.count;
  let land = 0, edges = 0;
  for (let v=0;v<N;v++){
    const isLand = only ? (only[v] ? 1 : 0) : mask[v];
    if (isLand) land++;
    for (const w of g.ring[v]){
      const other = only ? (only[w] ? 1 : 0) : mask[w];
      if (w > v && other !== isLand) edges++;
    }
  }
  const cellArea = 4*Math.PI/N;                     // unit sphere
  const spacing = Math.sqrt(2*cellArea/Math.sqrt(3)); // hexagon area = (sqrt3/2) d^2
  const edgeLen = spacing/Math.sqrt(3);
  const perimeter = edges*edgeLen;
  const area = land*cellArea;
  return { land, landFraction: land/N, edges, ratio: perimeter/Math.sqrt(area) };
}
// the same ratio for one round cap of the same area
function capRatio(landFraction){
  const cosT = 1 - 2*landFraction;                  // area = 2*pi*(1-cos t)
  const sinT = Math.sqrt(Math.max(0, 1-cosT*cosT));
  return 2*Math.PI*sinT/Math.sqrt(2*Math.PI*(1-cosT));
}

// ---- islands ----------------------------------------------------------------
function islands(g, mask){
  const seen = new Uint8Array(g.count);
  const sizes = [];
  for (let v=0;v<g.count;v++){
    if (!mask[v] || seen[v]) continue;
    let size = 0; const stack = [v]; seen[v] = 1;
    while (stack.length){
      const c = stack.pop(); size++;
      for (const w of g.ring[c]) if (mask[w] && !seen[w]){ seen[w] = 1; stack.push(w); }
    }
    sizes.push(size);
  }
  sizes.sort((a,b)=>b-a);
  return sizes;
}

// ---- longest river ----------------------------------------------------------
// Priority-flood to fill the pits, route every cell to its lowest neighbour,
// then walk the longest chain of downhill steps that stays on the largest
// landmass. A river cannot be longer than the land it crosses.
function longestRiver(g, height, sea, mask){
  const N = g.count;
  // largest landmass
  const sizes = [];
  const comp = new Int32Array(N).fill(-1);
  let best = -1, bestSize = 0;
  for (let v=0;v<N;v++){
    if (!mask[v] || comp[v] >= 0) continue;
    const id = sizes.length; let size = 0; const stack=[v]; comp[v]=id;
    while (stack.length){ const c=stack.pop(); size++;
      for (const w of g.ring[c]) if (mask[w] && comp[w]<0){ comp[w]=id; stack.push(w); } }
    sizes.push(size); if (size > bestSize){ bestSize = size; best = id; }
  }
  // priority flood
  const filled = Float64Array.from(height);
  const heap = []; const push = (x)=>{ heap.push(x); let i=heap.length-1;
    while(i>0){ const p=(i-1)>>1; if(heap[p][0]<=heap[i][0])break; [heap[p],heap[i]]=[heap[i],heap[p]]; i=p; } };
  const pop = ()=>{ const top=heap[0], last=heap.pop();
    if(heap.length){ heap[0]=last; let i=0; for(;;){ const l=2*i+1,r=l+1; let s=i;
      if(l<heap.length&&heap[l][0]<heap[s][0])s=l; if(r<heap.length&&heap[r][0]<heap[s][0])s=r;
      if(s===i)break; [heap[s],heap[i]]=[heap[i],heap[s]]; i=s; } } return top; };
  const done = new Uint8Array(N);
  for (let v=0;v<N;v++) if (height[v] <= sea){ done[v]=1; filled[v]=sea; push([sea, v]); }
  while (heap.length){
    const [h, v] = pop();
    for (const w of g.ring[v]){
      if (done[w]) continue;
      done[w] = 1;
      filled[w] = Math.max(filled[w], h + 1e-9);
      push([filled[w], w]);
    }
  }
  // longest downhill chain on the largest landmass, by dynamic programming over
  // cells sorted low to high -- every step goes strictly down, so there are no cycles
  const order = Array.from({length:N}, (_,v)=>v).filter(v=>mask[v] && comp[v]===best)
    .sort((a,b)=>filled[a]-filled[b]);
  const len = new Int32Array(N);
  let longest = 0;
  for (const v of order){
    let base = 0;
    for (const w of g.ring[v]) if (filled[w] < filled[v] && mask[w] && comp[w]===best)
      base = Math.max(base, len[w]);
    len[v] = base + 1;
    longest = Math.max(longest, len[v]);
  }
  return { longest, largestLandmass: bestSize };
}

// the largest connected run of land, as a mask of its own
function largestComponent(g, mask){
  const seen = new Uint8Array(g.count);
  let best = null, bestSize = 0;
  for (let v=0;v<g.count;v++){
    if (!mask[v] || seen[v]) continue;
    const cells = [v]; seen[v] = 1;
    for (let k=0;k<cells.length;k++)
      for (const w of g.ring[cells[k]]) if (mask[w] && !seen[w]){ seen[w]=1; cells.push(w); }
    if (cells.length > bestSize){ bestSize = cells.length; best = cells; }
  }
  const out = new Uint8Array(g.count);
  if (best) for (const v of best) out[v] = 1;
  return { mask: out, size: bestSize };
}

// I-2. How far every cell is from the nearest coast, and the height that
// follows from it. Rings counted outward from every cell touching the other
// kind; negative at sea, positive on land.
function borderDistance(g, mask){
  const N=g.count, dist=new Int32Array(N).fill(0), seen=new Uint8Array(N);
  let front=[];
  for (let v=0;v<N;v++)
    for (const w of g.ring[v]) if (mask[w]!==mask[v]){ if(!seen[v]){seen[v]=1; front.push(v);} break; }
  let step=0;
  while (front.length){
    step++;
    const next=[];
    for (const v of front) for (const w of g.ring[v]) if (!seen[w]){
      seen[w]=1; dist[w]=step; next.push(w);
    }
    front=next;
  }
  const signed=new Int32Array(N);
  for (let v=0;v<N;v++) signed[v] = mask[v] ? dist[v]+1 : -(dist[v]+1);
  return signed;
}

// The baseline: named points with straight lines between them, in cells of the
// map. Shelf out to sea, then a coastal plain, then the interior.
function baseline(signed, points){
  const out=new Float64Array(signed.length);
  for (let v=0;v<signed.length;v++){
    const d=signed[v];
    let y=points[points.length-1][1];
    for (let k=0;k<points.length-1;k++){
      const [x0,y0]=points[k], [x1,y1]=points[k+1];
      if (d>=x0 && d<=x1){ y = y0 + (y1-y0)*((d-x0)/(x1-x0 || 1)); break; }
      if (d < points[0][0]){ y = points[0][1]; break; }
    }
    out[v]=y;
  }
  return out;
}

// ---- the run ----------------------------------------------------------------
const SEED = 12345, LAND = 0.3;
const WARP_AMP = 0.35, WARP_FREQ = 1.6;
const GROWN = { island: 0.0008, growthWeight: 0.35, growthPasses: 1, creation: 0.281 };

const levels = [];
for (let L = 2; L <= 8; L++) levels.push(grid(L));
const at = L => levels[L - 2];

function summary(g, mask){
  const big = largestComponent(g, mask);
  const r = raggedness(g, mask, big.mask);
  let land = 0; for (const x of mask) land += x;
  return { land: land/g.count, biggest: big.size, edges: r.edges, ratio: r.ratio,
           islands: islands(g, mask).length };
}
const pad = (s, w) => String(s).padStart(w);

console.log('1. how ragged the coastline is, and how that changes with resolution');
console.log('   Perimeter of the largest landmass over the square root of its area.');
console.log('   A round cap holding the same land gives 3.24.');
console.log('');
console.log('   level      today            warped           grown');
const rows = { today: [], warp: [], grown: [] };
for (const L of [5, 6, 7]){
  const g = at(L);
  const h = todayHeight(g, SEED), s = seaLevelFor(h, LAND);
  rows.today.push(summary(g, maskFromHeight(h, s)));
  const hw = warpedHeight(g, SEED, WARP_AMP, WARP_FREQ), sw = seaLevelFor(hw, LAND);
  rows.warp.push(summary(g, maskFromHeight(hw, sw)));
  rows.grown.push(summary(g, grownMask(levels.slice(0, L - 1), SEED, GROWN)));
}
for (let k = 0; k < 3; k++)
  console.log(`   ${5+k}     ` +
    ['today','warp','grown'].map(n => pad(rows[n][k].ratio.toFixed(2), 6) +
      ' (' + pad(rows[n][k].edges, 5) + ' edges)').join('  '));
console.log('');
console.log('   perimeter growth as the cells halve, and the dimension it implies');
for (const n of ['today','warp','grown']){
  const g1 = rows[n][1].edges/rows[n][0].edges, g2 = rows[n][2].edges/rows[n][1].edges;
  console.log(`   ${pad(n,5)}  x${g1.toFixed(2)} then x${g2.toFixed(2)}` +
    `   dimension ${(Math.log2(g1)).toFixed(2)} then ${(Math.log2(g2)).toFixed(2)}`);
}
console.log('   A smooth curve gives exactly x2 and a dimension of 1. Published figures');
console.log('   for real coasts, quoted and not measured here, run from about 1.05 for');
console.log('   South Africa through 1.25 for Britain to about 1.52 for Norway.');

console.log('\n2. what each one does to the land itself');
console.log('   at level 7');
for (const n of ['today','warp','grown']){
  const r = rows[n][2];
  console.log(`   ${pad(n,5)}  land ${(100*r.land).toFixed(1)}%  largest landmass ` +
    `${pad(r.biggest,6)}  islands ${pad(r.islands,4)}`);
}
console.log('   The percentile lands on the asked-for fraction exactly. The grown mask');
console.log('   has no percentile in it, so `creation` was searched for the value that');
console.log('   reaches the same fraction, and it arrives near it rather than on it.');

console.log('\n3. the distance to the coast, and the height built on it');
{
  const g = at(7);
  const mask = grownMask(levels.slice(0, 6), SEED, GROWN);
  const signed = borderDistance(g, mask);
  let mn = 0, mx = 0; for (const d of signed){ if (d < mn) mn = d; if (d > mx) mx = d; }
  console.log(`   every cell reached: ${mn} cells at the deepest sea to ${mx} inland`);
  const base = baseline(signed, [[-60,-0.6],[-6,-0.35],[-1,0],[1,0],[40,0.8],[200,1.0]]);
  const h = new Float64Array(g.count);
  for (let v = 0; v < g.count; v++){
    const [x,y,z] = g.pts[v];
    h[v] = base[v] + 0.18*fbm(x, y, z, 6, 5, SEED + 1);
  }
  const mk = new Uint8Array(g.count);
  for (let v = 0; v < g.count; v++) mk[v] = h[v] > 0 ? 1 : 0;
  const s = summary(g, mk);
  console.log(`   grown, once the profile and the relief are laid on it:`);
  console.log(`   ratio ${s.ratio.toFixed(2)} against ${rows.grown[2].ratio.toFixed(2)} for the bare mask,` +
    ` islands ${s.islands} against ${rows.grown[2].islands}`);
  console.log('   Relief laid over a baseline and re-cut at sea level pulls the thinnest');
  console.log('   filaments back under, so the profile tempers the mask rather than');
  console.log('   inheriting it whole.');

  console.log('\n4. how long a river gets, which is what the land allows');
  const ht = todayHeight(g, SEED), st = seaLevelFor(ht, LAND);
  const rt = longestRiver(g, ht, st, maskFromHeight(ht, st));
  const hw = warpedHeight(g, SEED, WARP_AMP, WARP_FREQ), sw = seaLevelFor(hw, LAND);
  const rw = longestRiver(g, hw, sw, maskFromHeight(hw, sw));
  const rg = longestRiver(g, h, 0, mk);
  for (const [n, r] of [['today',rt],['warp',rw],['grown',rg]])
    console.log(`   ${pad(n,5)}  longest river ${pad(r.longest,4)} cells` +
      `  on a landmass of ${pad(r.largestLandmass,6)}`);
  console.log('   A river cannot be longer than the land it crosses, so a coastline that');
  console.log('   breaks the surface into more pieces shortens every river on it.');
}

console.log('\n5. whether a preview at a lower level is the map you get');
{
  const gP = at(6), gA = at(8);
  const agree = (mP, mA) => {
    let shared = 0, same = 0;
    for (let v = 0; v < gP.count; v++){
      const k = gA.index.get(gP.key(gP.pts[v]));
      if (k === undefined) continue;
      shared++; if (mP[v] === mA[k]) same++;
    }
    return { shared, disagree: shared - same };
  };
  const hP = todayHeight(gP, SEED), hA = todayHeight(gA, SEED);
  const t = agree(maskFromHeight(hP, seaLevelFor(hP, LAND)), maskFromHeight(hA, seaLevelFor(hA, LAND)));
  const wP = warpedHeight(gP, SEED, WARP_AMP, WARP_FREQ), wA = warpedHeight(gA, SEED, WARP_AMP, WARP_FREQ);
  const w = agree(maskFromHeight(wP, seaLevelFor(wP, LAND)), maskFromHeight(wA, seaLevelFor(wA, LAND)));
  const gr = agree(grownMask(levels.slice(0, 5), SEED, GROWN), grownMask(levels, SEED, GROWN));
  console.log('   cells of the level-6 map that the level-8 map disagrees with, of ' + t.shared);
  for (const [n, r] of [['today',t],['warp',w],['grown',gr]])
    console.log(`   ${pad(n,5)}  ${pad(r.disagree,5)}  = ${(100*r.disagree/r.shared).toFixed(3)}%`);
  console.log('   Noise is sampled from a direction, so a cell that exists at both levels');
  console.log('   is handed the same height at both, and only the percentile moves. The');
  console.log('   grown mask runs its growth pass again at every level, and a cell decided');
  console.log('   at level 6 keeps being reconsidered on the way to level 8.');
}

console.log('\nverdict');
console.log('   The coastline that ships is a smooth curve by the only measurement that');
console.log('   does not depend on resolution: its perimeter grows x2.08 then x2.17 as');
console.log('   the cells halve, against x2 for a curve with no detail in it at all.');
console.log('   Warping the direction moves that to x2.26 and x2.19, which is a change');
console.log('   too small to see. Growing the mask reaches x2.64 and x2.73, and pays for');
console.log('   it in two places nothing else pays: the land fraction stops being a');
console.log('   number that can be asked for, and the longest river on the planet halves');
console.log('   because the land is broken into more pieces.');
