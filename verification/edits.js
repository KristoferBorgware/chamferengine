// A player dams a river. The coarse map from doc 21 is computed once at world
// creation and read only, so it still says the river runs there. Something has to
// give. Before choosing what, measure how far a single edit actually reaches --
// upstream, downstream, and how often an edit touches a river at all.
// Backs docs/24-edits-and-global-processes.md
const T = (1 + Math.sqrt(5)) / 2;
const norm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
const K = Math.sqrt(8*Math.PI/(10*Math.sqrt(3)));
const R = 1700;

const V0 = [[-1,T,0],[1,T,0],[-1,-T,0],[1,-T,0],[0,-1,T],[0,1,T],[0,-1,-T],[0,1,-T],
            [T,0,-1],[T,0,1],[-T,0,-1],[-T,0,1]].map(norm);
const F0 = [[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
            [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];

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
  for (let dz=0;dz<2;dz++) for (let dy=0;dy<2;dy++) for (let dx=0;dx<2;dx++)
    v += (dx?sx:1-sx)*(dy?sy:1-sy)*(dz?sz:1-sz) * hash3(x+dx,y+dy,z+dz);
  return v*2-1;
}
const fbm = (p,f,oct) => { let v=0,a=1,tot=0,ff=f;
  for (let o=0;o<oct;o++){ v += a*vnoise([p[0]*ff,p[1]*ff,p[2]*ff]); tot+=a; a*=0.5; ff*=2; }
  return v/tot; };

// ---- the level-7 world, as doc 21 builds it --------------------------------
const L = 7, n = 1 << L;
const idx = new Map(), pts = [], nbs = [];
const put = p => { const k = p.map(x => Math.round(x*1e7)).join(',');
  if (!idx.has(k)){ idx.set(k, pts.length); pts.push(p); nbs.push(new Set()); } return idx.get(k); };
const link = (a,b) => { nbs[a].add(b); nbs[b].add(a); };
for (const f of F0){
  const [A,B,C] = f.map(i => V0[i]), G = [];
  for (let i=0;i<=n;i++){ const row=[];
    for (let j=0;j<=i;j++){ const a=(n-i)/n,b=(i-j)/n,c=j/n;
      row.push(put(norm([A[0]*a+B[0]*b+C[0]*c, A[1]*a+B[1]*b+C[1]*c, A[2]*a+B[2]*b+C[2]*c]))); }
    G.push(row); }
  for (let i=0;i<n;i++) for (let j=0;j<=i;j++){
    link(G[i][j],G[i+1][j]); link(G[i][j],G[i+1][j+1]); link(G[i+1][j],G[i+1][j+1]); }
}
const ring = nbs.map(s => [...s]), N = pts.length;
const spacing = K*R/2**L;

const raw = new Float64Array(N);
for (let v=0;v<N;v++) raw[v] = fbm(pts[v], 1.5, 6);
const sorted = Float64Array.from(raw).sort();
const SEA = sorted[Math.floor(N*0.70)];
const EPS = 1e-7;

// priority-flood with the slope doc 21 requires
function fill(h){
  const filled = Float64Array.from(h), done = new Uint8Array(N), hq = [];
  const push = (k,v) => { hq.push([k,v]); let i=hq.length-1;
    while (i>0){ const p=(i-1)>>1; if (hq[p][0] <= hq[i][0]) break; [hq[p],hq[i]]=[hq[i],hq[p]]; i=p; } };
  const pop = () => { const top=hq[0], last=hq.pop();
    if (hq.length){ hq[0]=last; let i=0;
      for(;;){ const l=2*i+1, r=l+1; let m=i;
        if (l<hq.length && hq[l][0]<hq[m][0]) m=l;
        if (r<hq.length && hq[r][0]<hq[m][0]) m=r;
        if (m===i) break; [hq[m],hq[i]]=[hq[i],hq[m]]; i=m; } }
    return top; };
  for (let v=0;v<N;v++) if (h[v] <= SEA){ done[v]=1; push(h[v], v); }
  while (hq.length){ const [k,v] = pop();
    for (const w of ring[v]){ if (done[w]) continue; done[w]=1;
      if (filled[w] <= k) filled[w] = k + EPS;
      push(filled[w], w); } }
  return filled;
}
function routeAndFlow(filled){
  const order = [...Array(N).keys()].filter(v => filled[v] > SEA).sort((a,b) => filled[b] - filled[a]);
  const dn = new Int32Array(N).fill(-1), flow = new Float64Array(N).fill(1);
  for (const v of order){ let best=-1, bh=filled[v];
    for (const w of ring[v]) if (filled[w] < bh){ bh = filled[w]; best = w; }
    dn[v] = best; }
  for (const v of order) if (dn[v] >= 0) flow[dn[v]] += flow[v];
  return { dn, flow, order };
}

const base = fill(raw);
const { dn, flow } = routeAndFlow(base);
let land = 0; for (let v=0;v<N;v++) if (base[v] > SEA) land++;
console.log(`level ${L}: ${N.toLocaleString('en-US')} cells, ${(100*land/N).toFixed(0)}% land,`
  + ` one cell ${spacing.toFixed(1)} m across`);

// ---- 1. does a random edit even touch a river? -----------------------------
console.log('\n1. how often an edit lands on flowing water at all');
{
  console.log('   upstream cells   cells at or above   share of land');
  for (const th of [10, 50, 200, 1000]){
    let c = 0; for (let v=0;v<N;v++) if (base[v] > SEA && flow[v] >= th) c++;
    console.log(`   ${String(th).padStart(11)}   ${String(c).padStart(14)}      ${(100*c/land).toFixed(2)}%`);
  }
  console.log('   Most of the land is hillside, not channel. The overwhelming majority of');
  console.log('   what a player builds never meets a river, so whatever this costs, it is');
  console.log('   paid rarely.');
}

// ---- 2. dam it, and see how far the water backs up -------------------------
// Raise one cell by a wall and re-fill. The lake is every cell whose water level
// moved. Terrain decides where it stops -- the dam cannot flood past the lowest
// lip out of the valley.
console.log('\n2. damming a river takes a wall, not a block');
{
  // Pick a site well inside the land, on a real channel.
  const cand = [];
  for (let v=0;v<N;v++) if (base[v] > SEA && flow[v] >= 200) cand.push(v);
  cand.sort((a,b) => flow[b] - flow[a]);
  const site = cand[Math.floor(cand.length/2)];
  const DAM = 0.02 * (sorted[N-1] - sorted[0]);
  console.log(`   site carrying ${Math.round(flow[site])} upstream cells, wall`
    + ` ${(0.02*100).toFixed(0)}% of the height range tall`);
  console.log('   wall spans   cells raised   cells flooded   lake reaches');
  for (const r of [0, 1, 2, 3]){
    // a wall = every cell within r steps of the site
    const wall = new Set([site]);
    let front = [site];
    for (let k=0;k<r;k++){
      const nxt = [];
      for (const c of front) for (const w of ring[c]) if (!wall.has(w)){ wall.add(w); nxt.push(w); }
      front = nxt;
    }
    const h2 = Float64Array.from(raw);
    for (const c of wall) h2[c] += DAM;
    const f2 = fill(h2);
    const seen = new Uint8Array(N), q = [], dist = new Int32Array(N);
    for (const c of wall) seen[c] = 1;
    for (const c of wall) for (const w of ring[c])
      if (!seen[w] && f2[w] > base[w] + EPS*2){ seen[w]=1; dist[w]=1; q.push(w); }
    let maxDist = q.length ? 1 : 0;
    for (let i=0;i<q.length;i++){ const c=q[i];
      for (const w of ring[c]) if (!seen[w] && f2[w] > base[w] + EPS*2){
        seen[w]=1; dist[w]=dist[c]+1; maxDist=Math.max(maxDist,dist[w]); q.push(w); } }
    console.log(`   ${String(2*r+1).padStart(6)} cells   ${String(wall.size).padStart(12)}`
      + `   ${String(q.length).padStart(13)}   ${(maxDist*spacing).toFixed(0).padStart(6)} m`);
  }
  console.log('   One block dams nothing -- the water simply goes round it, which is what');
  console.log('   a hex grid with six ways out should do. A wall has to span the channel');
  console.log('   before anything backs up, and once it does the lake is bounded by the');
  console.log('   valley: water rises to the lowest lip and stops.');
}

// ---- 3. downstream, the loss is diluted away -------------------------------
// A dam holds back its own upstream area. Every tributary joining below it puts
// water back, so the deficit shrinks with distance.
console.log('\n3. downstream, and the thing a small planet does not give you');
{
  // pick sites by how far they are from the sea along the flow path, so that
  // "headwater" means headwater rather than "small river near the coast"
  const toSea = new Int32Array(N).fill(-1);
  const order = [...Array(N).keys()].filter(v => base[v] > SEA).sort((a,b) => base[a] - base[b]);
  for (const v of order) toSea[v] = dn[v] < 0 ? 0 : (toSea[dn[v]] >= 0 ? toSea[dn[v]] + 1 : 0);
  let longest = 0; for (let v=0;v<N;v++) longest = Math.max(longest, toSea[v]);
  console.log(`   longest flow path on this world: ${longest} cells`
    + ` = ${(longest*spacing).toFixed(0)} m`);
  console.log('   dam at        held back   deficit after 5 / 20 / 50 steps   reaches the sea?');
  for (const frac of [0.9, 0.6, 0.3, 0.1]){
    const want = Math.round(frac*longest);
    let site = -1, bestGap = 1e9;
    for (let v=0;v<N;v++) if (base[v] > SEA && flow[v] >= 30 && Math.abs(toSea[v]-want) < bestGap){
      bestGap = Math.abs(toSea[v]-want); site = v; }
    if (site < 0) continue;
    const held = flow[site];
    const at = k => { let c = site;
      for (let i=0;i<k && c>=0;i++) c = dn[c];
      return c < 0 ? null : Math.max(0, (held - 0) / flow[c]); };
    const d5 = at(5), d20 = at(20), d50 = at(50);
    const fm = x => x === null ? '  --  ' : `${(100*Math.min(1,x)).toFixed(0).padStart(4)}%`;
    console.log(`   ${String(toSea[site]).padStart(4)} from sea  ${String(Math.round(held)).padStart(9)}`
      + `   ${fm(d5)} ${fm(d20)} ${fm(d50)}`
      + `            ${d50 === null || d50 > 0.1 ? 'yes' : 'no'}`);
  }
  console.log('   The deficit is the share of the flow that is missing. It depends entirely');
  console.log('   on WHERE you dam. High up, tributaries below refill the river and the');
  console.log('   deficit fades to a few percent within twenty cells -- the sea never hears');
  console.log('   about it. On a main stem there is nothing below big enough to make up the');
  console.log('   difference, so the loss runs to the coast. One of these has a local');
  console.log('   answer and the other does not, and they are the same edit.');
}

// ---- 4. what a coarse-map override would cost ------------------------------
console.log('\n4. if the coarse map could be overridden, what would it cost?');
{
  const coarse = 10*4**8 + 2;
  console.log(`   the whole level-8 map:            ${coarse.toLocaleString('en-US')} cells, 2.50 MB`);
  for (const [what, cells] of [['a 100 m pond', Math.round(Math.PI*100*100/(8*8))],
                               ['a 300 m lake', Math.round(Math.PI*300*300/(8*8))]]){
    console.log(`   ${what.padEnd(33)} ${String(cells).padStart(7)} coarse cells`
      + ` = ${(cells*4/1024).toFixed(1)} KB  (${(100*cells/coarse).toFixed(4)}% of the map)`);
  }
  console.log('   An override layer is small. The question was never storage -- it is what');
  console.log('   happens to everything downstream of the cell you changed.');
}

console.log('\nverdict');
console.log('   Two different shapes of consequence, and they want different answers.');
console.log('   UPSTREAM the effect is bounded by terrain: the lake fills to the lowest');
console.log('   lip and stops, a few hundred metres across even on a main stem. That is');
console.log('   small enough to simulate locally from the delta store, with no change to');
console.log('   the coarse map at all.');
console.log('   DOWNSTREAM it depends where. A headwater dam fades to a few percent within');
console.log('   twenty cells and the coast never notices. A main-stem dam is felt all the');
console.log('   way down, because nothing below it is big enough to refill the river.');
console.log('   So the same player action is local in one place and global in another --');
console.log('   which is why a single rule cannot cover it, and why the honest answer is');
console.log('   to bound what the coarse map is allowed to promise.');
