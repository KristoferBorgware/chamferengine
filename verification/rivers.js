// Rivers, erosion and continents are the three things fBm cannot make, because
// all three are GLOBAL: where water goes depends on the whole planet, not on the
// neighbourhood. Doc 08 sketches a coarse stored map to carry them. This measures
// whether that works -- how the coarse map is looked up, what flow routing costs
// on a hex sphere, and how much of the planet ends up river.
// Backs docs/21-rivers-and-erosion.md
const T = (1 + Math.sqrt(5)) / 2;
const norm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
const dot = (a,b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const K = Math.sqrt(8*Math.PI/(10*Math.sqrt(3)));

const V0 = [[-1,T,0],[1,T,0],[-1,-T,0],[1,-T,0],[0,-1,T],[0,1,T],[0,-1,-T],[0,1,-T],
            [T,0,-1],[T,0,1],[-T,0,-1],[-T,0,1]].map(norm);
const F0 = [[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
            [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
const P = (A,B,C,n,i,j) => { const a=(n-i)/n, b=(i-j)/n, c=j/n;
  return [A[0]*a + B[0]*b + C[0]*c, A[1]*a + B[1]*b + C[1]*c, A[2]*a + B[2]*b + C[2]*c]; };

// deterministic 3D value noise -- no dependencies, stable output
function hash3(x,y,z){
  let h = x*374761393 + y*668265263 + z*1274126177;
  h = (h ^ (h >>> 13)) >>> 0; h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(p){
  const x=Math.floor(p[0]), y=Math.floor(p[1]), z=Math.floor(p[2]);
  const fx=p[0]-x, fy=p[1]-y, fz=p[2]-z;
  const s=t=>t*t*(3-2*t), sx=s(fx), sy=s(fy), sz=s(fz);
  let v=0;
  for (let dz=0;dz<2;dz++) for (let dy=0;dy<2;dy++) for (let dx=0;dx<2;dx++){
    const w = (dx?sx:1-sx)*(dy?sy:1-sy)*(dz?sz:1-sz);
    v += w * hash3(x+dx, y+dy, z+dz);
  }
  return v*2 - 1;
}
const fbm = (p, f, oct) => {
  let v=0, a=1, tot=0;
  for (let o=0;o<oct;o++){ v += a*vnoise([p[0]*f, p[1]*f, p[2]*f]); tot += a; a*=0.5; f*=2; }
  return v/tot;
};

// ---- 1. how the coarse map is actually addressed ---------------------------
// Doc 08 says "the coarse map is your own cell grid truncated, so the lookup is
// masking its ID". Truncating PATH DIGITS gives an ancestor triangle, not a
// coarse cell -- so check what really lines up.
console.log('1. does a coarse cell sit on a fine cell?');
{
  const [A,B,C] = F0[0].map(i => V0[i]);
  const Dc = 8, Df = 11, step = 1 << (Df - Dc);
  let worst = 0, checked = 0;
  for (let i=0;i<=1<<Dc;i+=7) for (let j=0;j<=i;j+=5){
    const coarse = norm(P(A,B,C, 1<<Dc, i, j));
    const fine   = norm(P(A,B,C, 1<<Df, i*step, j*step));
    worst = Math.max(worst, Math.hypot(...coarse.map((x,k)=>x-fine[k])));
    checked++;
  }
  console.log(`   level ${Dc} point (i,j) against level ${Df} point (${step}i, ${step}j):`);
  console.log(`   ${checked} sampled, worst separation ${worst.toExponential(2)}`);
  console.log('   They are the same points. So the coarse samples ARE fine cells -- the');
  console.log('   ones whose (i, j) are multiples of ' + step + ' -- and finding the three');
  console.log('   that surround a fine cell is masking the low bits of (i, j), then using');
  console.log('   the remainder as barycentric weights. No second structure, no search.');
  console.log('   NOTE: it is the (i,j) low bits, not the path digits. Truncating path');
  console.log('   digits gives the containing TRIANGLE, which is a chunk, not a cell.');
}

// ---- 2. what the coarse map costs ------------------------------------------
console.log('\n2. storage, and what one coarse cell covers on the worked planet');
console.log('   level     cells    at 4 bytes   coarse cell size (R = 1,700 m)');
for (const L of [6,7,8,9,10]){
  const n = 10*4**L + 2, bytes = n*4;
  console.log(`   ${L}  ${n.toLocaleString('en-US').padStart(10)}  ${(bytes/1048576).toFixed(2).padStart(8)} MB`
    + `      ${(K*1700/2**L).toFixed(1).padStart(6)} m`);
}
console.log('   Doc 08 proposes level 8: 2.5 MB, and a coarse cell 8 m across. A river');
console.log('   channel is therefore about one coarse cell wide before detail is added.');

// ---- 3. flow routing on a hex sphere ---------------------------------------
console.log('\n3. routing every cell downhill');
const L = 7;
const t0 = Date.now();
const { pts, ring } = (() => {
  const n = 1 << L, idx = new Map(), pts = [], nb = [];
  const put = p => { const k = p.map(x => Math.round(x*1e7)).join(',');
    if (!idx.has(k)){ idx.set(k, pts.length); pts.push(p); nb.push(new Set()); } return idx.get(k); };
  const link = (a,b) => { nb[a].add(b); nb[b].add(a); };
  for (const f of F0){
    const [A,B,C] = f.map(i => V0[i]), G = [];
    for (let i=0;i<=n;i++){ const row=[];
      for (let j=0;j<=i;j++) row.push(put(norm(P(A,B,C,n,i,j))));
      G.push(row); }
    for (let i=0;i<n;i++) for (let j=0;j<=i;j++){
      link(G[i][j],G[i+1][j]); link(G[i][j],G[i+1][j+1]); link(G[i+1][j],G[i+1][j+1]); }
  }
  return { pts, ring: nb.map(s => [...s]) };
})();
const N = pts.length;
const height = new Float64Array(N);
for (let v=0;v<N;v++) height[v] = fbm(pts[v], 3.0, 6);
// pick sea level so about 30% of the surface is land, as on Earth
const SEA = (() => { const s = Float64Array.from(height).sort();
  return s[Math.floor(s.length*0.70)]; })();
let land = 0; for (let v=0;v<N;v++) if (height[v] > SEA) land++;
console.log(`   ${N.toLocaleString('en-US')} cells at level ${L}, ${(100*land/N).toFixed(1)}% above sea level`);

// each cell drains to its lowest neighbour; a cell with none is a pit
const down = new Int32Array(N).fill(-1);
let pits = 0, pentPits = 0, pents = 0;
for (let v=0;v<N;v++){
  if (ring[v].length === 5) pents++;
  if (height[v] <= SEA) continue;                  // ocean cells are outlets
  let best = -1, bh = height[v];
  for (const w of ring[v]) if (height[w] < bh){ bh = height[w]; best = w; }
  down[v] = best;
  if (best < 0){ pits++; if (ring[v].length === 5) pentPits++; }
}
console.log(`   land cells with nowhere lower to go (pits): ${pits}`
  + `  = ${(100*pits/land).toFixed(2)}% of land`);
console.log(`   of the ${pents} pentagons, ${pentPits} are pits`
  + ` -- expected ${(pents*pits/land).toFixed(1)} if they behave like anything else`);
console.log('   A pentagon picks the lowest of five instead of six. That is the entire');
console.log('   difference: flow routing needs no pentagon case at all.');

// ---- 4. pits have to be filled, and that is the real algorithm -------------
// Priority-flood: grow the ocean inward, raising each cell to the lowest level
// that lets it drain. Standard, and it is what makes the network connected.
console.log('\n4. filling the pits so every drop reaches the sea');
{
  const filled = Float64Array.from(height);
  const done = new Uint8Array(N);
  // simple binary-heap priority queue
  const hq = [], hpush = (h,v) => { hq.push([h,v]); let i=hq.length-1;
    while (i>0){ const p=(i-1)>>1; if (hq[p][0] <= hq[i][0]) break; [hq[p],hq[i]]=[hq[i],hq[p]]; i=p; } };
  const hpop = () => { const top=hq[0], last=hq.pop();
    if (hq.length){ hq[0]=last; let i=0;
      for(;;){ const l=2*i+1, r=l+1; let m=i;
        if (l<hq.length && hq[l][0]<hq[m][0]) m=l;
        if (r<hq.length && hq[r][0]<hq[m][0]) m=r;
        if (m===i) break; [hq[m],hq[i]]=[hq[i],hq[m]]; i=m; } }
    return top; };
  // The epsilon is the part that is easy to leave out and fatal to leave out.
  // Fill alone makes a lake perfectly flat, so no cell in it has a lower
  // neighbour and every river stops dead at the first lake it reaches.
  const EPS = 1e-7;
  for (let v=0;v<N;v++) if (height[v] <= SEA){ done[v]=1; hpush(height[v], v); }
  let raised = 0, maxRaise = 0;
  while (hq.length){
    const [h,v] = hpop();
    for (const w of ring[v]){
      if (done[w]) continue;
      done[w] = 1;
      if (filled[w] <= h){ maxRaise = Math.max(maxRaise, h - filled[w]); filled[w] = h + EPS; raised++; }
      hpush(filled[w], w);
    }
  }
  let pits2 = 0;
  for (let v=0;v<N;v++){
    if (filled[v] <= SEA) continue;
    let ok = false;
    for (const w of ring[v]) if (filled[w] < filled[v]) { ok = true; break; }
    if (!ok) pits2++;
  }
  console.log(`   cells raised into lakes: ${raised.toLocaleString('en-US')} (${(100*raised/land).toFixed(1)}% of land)`);
  console.log(`   largest single raise: ${maxRaise.toFixed(4)} of the height range`);
  console.log(`   cells still with nowhere to go: ${pits2}`);
  console.log('   The tiny slope added while filling is what makes that last number zero.');
  console.log('   Fill without it and a lake is perfectly flat, so no cell in it has a');
  console.log('   lower neighbour and every river stops dead at the first lake it meets.');

  // ---- 5. drainage, and how much of the planet is river --------------------
  console.log('\n5. drainage area, and what counts as a river');
  const order = [...Array(N).keys()].filter(v => filled[v] > SEA).sort((a,b) => filled[b] - filled[a]);
  const flow = new Float64Array(N).fill(1);
  const dn = new Int32Array(N).fill(-1);
  for (const v of order){
    let best = -1, bh = filled[v];
    for (const w of ring[v]) if (filled[w] < bh){ bh = filled[w]; best = w; }
    dn[v] = best;
  }
  for (const v of order) if (dn[v] >= 0) flow[dn[v]] += flow[v];
  const cellArea = 4*Math.PI*1700*1700 / N;
  console.log('   threshold (upstream cells)   cells that qualify   share of land');
  for (const th of [20, 100, 500, 2000]){
    let c = 0; for (const v of order) if (flow[v] >= th) c++;
    console.log(`   ${String(th).padStart(9)}                  ${String(c).padStart(9)}        ${(100*c/land).toFixed(2)}%`);
  }
  // longest path down the network
  const len = new Int32Array(N);
  for (const v of order) if (dn[v] >= 0) len[dn[v]] = Math.max(len[dn[v]], len[v] + 1);
  let longest = 0; for (let v=0;v<N;v++) longest = Math.max(longest, len[v]);
  const spacing = K*1700/2**L;
  console.log(`   longest continuous flow path: ${longest} cells = ${(longest*spacing/1000).toFixed(2)} km`);
  console.log(`   the planet is ${(2*Math.PI*1700/1000).toFixed(2)} km around, so that is`
    + ` ${(longest*spacing/(2*Math.PI*1700)).toFixed(2)}x the circumference`);
}
console.log(`\n   whole pass took ${Date.now()-t0} ms for ${N.toLocaleString('en-US')} cells`);
console.log('   At level 8 that is four times the cells and still seconds, once, at world');
console.log('   creation. This is not a runtime cost.');

// ---- 6. why the rivers came out so short -----------------------------------
// A river cannot be longer than the landmass it runs across. So the three
// problems doc 08 lists are not independent: continents come first.
console.log('\n6. rivers are as long as the continent lets them be');
{
  const run = freq => {
    const h = new Float64Array(N);
    for (let v=0;v<N;v++) h[v] = fbm(pts[v], freq, 6);
    const s = Float64Array.from(h).sort(), sea = s[Math.floor(s.length*0.70)];
    // largest connected landmass
    const seen = new Uint8Array(N); let biggest = 0;
    for (let v=0;v<N;v++){
      if (seen[v] || h[v] <= sea) continue;
      let size = 0; const q = [v]; seen[v] = 1;
      for (let i=0;i<q.length;i++){ size++;
        for (const w of ring[q[i]]) if (!seen[w] && h[w] > sea){ seen[w]=1; q.push(w); } }
      biggest = Math.max(biggest, size);
    }
    // fill with epsilon, then longest flow path
    const filled = Float64Array.from(h), done = new Uint8Array(N), EPS = 1e-7;
    const hq = [], hpush = (k,v) => { hq.push([k,v]); let i=hq.length-1;
      while (i>0){ const p=(i-1)>>1; if (hq[p][0] <= hq[i][0]) break; [hq[p],hq[i]]=[hq[i],hq[p]]; i=p; } };
    const hpop = () => { const top=hq[0], last=hq.pop();
      if (hq.length){ hq[0]=last; let i=0;
        for(;;){ const l=2*i+1, r=l+1; let m=i;
          if (l<hq.length && hq[l][0]<hq[m][0]) m=l;
          if (r<hq.length && hq[r][0]<hq[m][0]) m=r;
          if (m===i) break; [hq[m],hq[i]]=[hq[i],hq[m]]; i=m; } }
      return top; };
    for (let v=0;v<N;v++) if (h[v] <= sea){ done[v]=1; hpush(h[v], v); }
    while (hq.length){ const [k,v] = hpop();
      for (const w of ring[v]){ if (done[w]) continue; done[w]=1;
        if (filled[w] <= k) filled[w] = k + EPS;
        hpush(filled[w], w); } }
    const order = [...Array(N).keys()].filter(v => filled[v] > sea).sort((a,b) => filled[b]-filled[a]);
    const len = new Int32Array(N);
    for (const v of order){
      let best=-1, bh=filled[v];
      for (const w of ring[v]) if (filled[w] < bh){ bh = filled[w]; best = w; }
      if (best >= 0) len[best] = Math.max(len[best], len[v] + 1);
    }
    let longest = 0; for (let v=0;v<N;v++) longest = Math.max(longest, len[v]);
    return { biggest, longest };
  };
  const spacing = K*1700/2**L;
  console.log('   noise frequency   biggest landmass   longest river');
  for (const f of [6.0, 3.0, 1.5, 0.8]){
    const { biggest, longest } = run(f);
    console.log(`   ${f.toFixed(1).padStart(11)}     ${String(biggest).padStart(9)} cells`
      + `    ${String(longest).padStart(4)} cells = ${(longest*spacing/1000).toFixed(2)} km`);
  }
  console.log('   Lower the frequency and the continents grow, and the rivers grow with');
  console.log('   them. A river cannot be longer than the land it crosses, so the three');
  console.log('   problems doc 08 lists are NOT independent: continents decide rivers.');
  console.log('   Plain fBm makes many small blobs, which is why raw noise gives streams');
  console.log('   and never a river system. Fix the continents first.');
}

console.log('\nverdict');
console.log('   Flow routing works on the hex sphere with no pentagon case and no face');
console.log('   case, because it only ever compares a cell against its neighbours. The');
console.log('   real algorithm is not the routing but the PIT FILLING, without which');
console.log('   most land drains into a hole instead of the sea. Store the coarse map at');
console.log('   level 8 for 2.5 MB, look it up by masking the low bits of (i, j), and');
console.log('   interpolate with the remainder.');
