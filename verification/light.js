// Lighting on a hex sphere: what 8 neighbours cost, why sky light is still one
// downward pass, and what a sun direction buys for free.
// Backs docs/16-lighting.md
const T = (1 + Math.sqrt(5)) / 2, DEG = 180 / Math.PI;
const norm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
const sub = (a, b) => a.map((x, i) => x - b[i]);
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const tang = (v, u) => sub(v, u.map(x => x * dot(v, u)));

// the real grid: cells are vertices of the subdivided icosahedron (one-shot)
function geodesic(L){
  const n = 1 << L;
  const V0 = [[-1,T,0],[1,T,0],[-1,-T,0],[1,-T,0],[0,-1,T],[0,1,T],[0,-1,-T],[0,1,-T],
              [T,0,-1],[T,0,1],[-T,0,-1],[-T,0,1]].map(norm);
  const F0 = [[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
              [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
  const pts = [], idx = new Map(), nb = [];
  const put = p => { const k = p.map(x => Math.round(x*1e7)).join(',');
    if (!idx.has(k)){ idx.set(k, pts.length); pts.push(p); nb.push(new Set()); } return idx.get(k); };
  const link = (a,b) => { nb[a].add(b); nb[b].add(a); };
  for (const f of F0){
    const [A,B,C] = f.map(i => V0[i]), P = [];
    for (let i = 0; i <= n; i++){ const row = [];
      for (let j = 0; j <= i; j++){ const a=(n-i)/n, b=(i-j)/n, c=j/n;
        row.push(put(norm([A[0]*a+B[0]*b+C[0]*c, A[1]*a+B[1]*b+C[1]*c, A[2]*a+B[2]*b+C[2]*c]))); }
      P.push(row); }
    for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++){
      link(P[i][j],P[i+1][j]); link(P[i][j],P[i+1][j+1]); link(P[i+1][j],P[i+1][j+1]); }
  }
  return { pts, nb: nb.map(s => [...s]) };
}

const MAX = 15;                                  // Minecraft's light range, kept

// ---- 1. how many neighbours does a cell have? -------------------------------
console.log('1. neighbour count, and where the sphere shows through');
{
  const { nb } = geodesic(4);
  const tally = new Map();
  for (const r of nb) tally.set(r.length, (tally.get(r.length) || 0) + 1);
  const pent = tally.get(5) || 0, hex = tally.get(6) || 0;
  console.log(`   lateral neighbours: ${hex} cells have 6, ${pent} cells have 5`);
  console.log(`   plus up and down, always -- the radial axis never branches`);
  console.log(`   so a cell has 8 neighbours, and exactly ${pent} cells in the world have 7.`);
  console.log(`   A cube voxel has 6. Light is a scalar, so degree is the ONLY thing that`);
  console.log(`   changes: no direction is carried, so holonomy and the pentagon direction`);
  console.log(`   deficit from doc 13 do not apply to light at all.`);
}

// ---- 2. what one torch costs, hex vs cube -----------------------------------
console.log('\n2. one torch at full brightness, in open air');
{
  // hex prism lattice: 6 lateral + 2 vertical, light drops 1 per step
  const hexDisk = r => 3*r*r + 3*r + 1;
  let hexVol = 0;
  for (let dz = -MAX; dz <= MAX; dz++) hexVol += hexDisk(MAX - Math.abs(dz));
  // cube lattice, 6-neighbour: the L1 ball
  const sqDiamond = r => 2*r*r + 2*r + 1;
  let cubeVol = 0;
  for (let dz = -MAX; dz <= MAX; dz++) cubeVol += sqDiamond(MAX - Math.abs(dz));
  console.log(`   light level ${MAX}, dropping 1 per step`);
  console.log(`   hex prism grid: ${hexVol.toLocaleString()} cells reached`);
  console.log(`   cube grid:      ${cubeVol.toLocaleString()} cells reached`);
  console.log(`   ratio: ${(hexVol/cubeVol).toFixed(3)}x  -- the cost of 6 lateral neighbours`);
  console.log(`   (a hex disk of radius r holds 3r^2+3r+1 cells against 2r^2+2r+1 on squares,`);
  console.log(`    so the ratio tends to 1.5 as the light range grows)`);
  // confirm the single-layer closed form by BFS on the real grid, starting well
  // away from any pentagon so the disc is pure hexagon
  const G = geodesic(7);
  const start = farFromPentagons(G.nb, MAX + 4);
  const reached = discSize(G.nb, start, MAX);
  console.log(`   BFS on the real level-7 grid, one layer, ${MAX + 4}+ cells from any pentagon:`);
  console.log(`   ${reached} cells within ${MAX} steps; closed form 3r^2+3r+1 = ${hexDisk(MAX)}`
    + ` -- ${reached === hexDisk(MAX) ? 'exact match' : 'MISMATCH'}`);
}

// how many cells are within r steps of s
function discSize(nb, s, r){
  const seen = new Uint8Array(nb.length); seen[s] = 1;
  let fr = [s], n = 1;
  for (let d = 1; d <= r; d++){ const nx = [];
    for (const v of fr) for (const w of nb[v]) if (!seen[w]){ seen[w] = 1; nx.push(w); n++; }
    fr = nx; }
  return n;
}

// a cell at least `d` steps from every pentagon, by multi-source BFS
function farFromPentagons(nb, d){
  const dist = new Int32Array(nb.length).fill(-1);
  let fr = nb.map((r, v) => v).filter(v => nb[v].length === 5);
  fr.forEach(v => dist[v] = 0);
  for (let k = 1; fr.length; k++){ const nx = [];
    for (const v of fr) for (const w of nb[v]) if (dist[w] < 0){ dist[w] = k; nx.push(w); }
    fr = nx; }
  for (let v = 0; v < nb.length; v++) if (dist[v] >= d) return v;
  throw new Error('no cell far enough from a pentagon at this level');
}

// ---- 3. does a pentagon change what a torch lights? -------------------------
console.log('\n3. a torch standing on a pentagon');
{
  const { nb } = geodesic(7);
  const pent = nb.map((r,v) => [r.length,v]).filter(a => a[0] === 5).map(a => a[1]);
  const hexStart = farFromPentagons(nb, MAX + 4);
  const pv = pent.map(v => discSize(nb, v, MAX));
  const hv = discSize(nb, hexStart, MAX);
  const same = new Set(pv).size === 1;
  console.log(`   from a hexagon:  ${hv} cells lit   (closed form 1 + 3r(r+1) = ${1 + 3*MAX*(MAX+1)})`);
  console.log(`   from a pentagon: ${pv[0]} cells lit   (closed form 1 + 5r(r+1)/2 = ${1 + 5*MAX*(MAX+1)/2})`);
  console.log(`   identical at all 12 pentagons: ${same}`);
  console.log(`   ratio ${(pv[0]/hv).toFixed(4)} at range ${MAX}, tending to 5/6 = ${(5/6).toFixed(4)} as range grows`);
  console.log(`\n   Read that carefully, because the obvious reading is wrong. The light is`);
  console.log(`   NOT dimmer at a pentagon and needs no special case. A ring at radius k`);
  console.log(`   holds 5k cells instead of 6k, so there is simply 1/6 LESS WORLD within`);
  console.log(`   reach. Every cell that exists gets exactly the light level it should.`);
  console.log(`   This is Gauss-Bonnet once more: a cone point has less area inside a given`);
  console.log(`   radius. Compare doc 13, where the same 60deg costs a direction index`);
  console.log(`   forever -- here it costs nothing at all, because light carries no direction.`);
}

// ---- 4. sky light is still one downward pass -------------------------------
console.log('\n4. sky light, and why the sphere does not make it harder');
{
  const D = 11, C = 6, layers = 64, side = 2 ** (D - C);
  const cols = (side + 1) * (side + 2) / 2;               // lattice points in the chunk triangle
  const voxels = cols * layers;                           // matches volume.js's 561 columns
  console.log(`   Sky light travels along -up, which is radial. The tessellation is`);
  console.log(`   identical at every layer (invariant 10), so a column IS a straight line`);
  console.log(`   of cells sharing one address. Sky light is therefore exactly as cheap as`);
  console.log(`   it is in a flat world: one downward pass per column, no face crossing.`);
  console.log(`\n   per chunk at D=${D} C=${C}, ${layers} layers: ${cols.toLocaleString()} columns, ${voxels.toLocaleString()} voxels`);
  const perCell = voxels;                                  // 4 bits sky + 4 bits block = 1 byte
  const blockBytes = voxels * 2 / 8;                       // doc 07's 2-bit palette
  console.log(`   light at 1 byte per cell (4 bits sky + 4 block): ${(perCell/1024).toFixed(0)} KB`);
  console.log(`   block data at 2 bits per cell (doc 07):           ${(blockBytes/1024).toFixed(0)} KB`);
  console.log(`   light costs ${(perCell/blockBytes).toFixed(0)}x the blocks it lights.`);
  // sky light is monotone down a column: store the depth it reaches, not the value
  const skyPerCell = voxels * 4 / 8, skyPerCol = cols * 1;
  console.log(`\n   But sky light down a column is MONOTONE -- full until the first solid`);
  console.log(`   cell, then attenuating. Store the depth it reaches, one byte per column:`);
  console.log(`   sky light per cell:   ${(skyPerCell/1024).toFixed(0)} KB`);
  console.log(`   sky light per column: ${(skyPerCol/1024).toFixed(1)} KB   -- ${(skyPerCell/skyPerCol).toFixed(0)}x smaller`);
  console.log(`   That trick needs columns to be straight, which is invariant 10 again.`);
}

// ---- 5. the terminator, which the sphere gives away free --------------------
console.log('\n5. day and night from one dot product');
{
  const R = 1700, circ = 2 * Math.PI * R, WALK = 1.4;
  console.log(`   A cell is lit when dot(sunDirection, up) > 0. up is per-cell and already`);
  console.log(`   computed for gravity (doc 13), so a real terminator costs one dot product`);
  console.log(`   per cell and no shadow map at all.\n`);
  console.log(`   R = ${R} m, circumference ${circ.toFixed(0)} m`);
  console.log(`   day length      terminator speed   vs a walking player (${WALK} m/s)`);
  for (const [label, secs] of [['10 min', 600], ['20 min', 1200], ['1 hour', 3600],
                               ['2.12 h', 7629], ['6 hours', 21600], ['24 hours', 86400]]){
    const v = circ / secs;
    console.log(`   ${label.padStart(8)} ${(v.toFixed(2) + ' m/s').padStart(18)}   ${
      v > WALK ? (v/WALK).toFixed(1) + 'x faster -- dawn overtakes you' : (WALK/v).toFixed(1) + 'x slower -- you can outrun it'}`);
  }
  const eq = circ / WALK;
  console.log(`\n   The terminator moves at exactly walking pace when the day lasts`);
  console.log(`   ${(eq/3600).toFixed(2)} hours -- which is doc 06's circumnavigation time, by construction.`);
  console.log(`   That is the natural anchor: pick the day length in units of "how long it`);
  console.log(`   takes to walk around", and you have chosen whether players can chase sunset.`);
  // twilight is an angle, so its DURATION does not depend on planet size
  const tw = 12;                                   // degrees of sun elevation either side
  console.log(`\n   Twilight, taken as ${tw}deg of sun elevation:`);
  console.log(`   band width on the ground: ${(circ * tw/360).toFixed(0)} m  (${(tw/360*100).toFixed(1)}% of the circumference)`);
  for (const [label, secs] of [['20 min', 1200], ['2.12 h', 7629], ['24 hours', 86400]]){
    const t = secs * tw / 360;
    console.log(`   duration with a ${label.padEnd(8)} day: ${t < 120 ? t.toFixed(0) + ' s' : (t/60).toFixed(1) + ' min'}`);
  }
  console.log(`   Twilight duration is a fixed FRACTION of the day and does not depend on`);
  console.log(`   the planet's size at all -- it is an angle, not a distance.`);
}

// ---- 6. shadows are longer than the world is wide ---------------------------
console.log('\n6. long shadows meet a short horizon');
{
  const R = 1700, hor = h => R * Math.acos(R / (R + h));
  console.log(`   Shadow length is h / tan(elevation). On a ${R} m planet the ground horizon`);
  console.log(`   from a ${(1.7).toFixed(1)} m eye is only ${hor(1.7).toFixed(0)} m (doc 13), so near sunrise a shadow`);
  console.log(`   runs off the edge of the visible world.\n`);
  console.log(`   sun elevation   shadow of a 10 m tower   past the ${hor(1.7).toFixed(0)} m horizon?`);
  for (const e of [45, 20, 10, 5, 2, 1]){
    const s = 10 / Math.tan(e / DEG);
    console.log(`   ${String(e + 'deg').padStart(13)} ${(s.toFixed(0) + ' m').padStart(24)}   ${s > hor(1.7) ? 'yes' : 'no'}`);
  }
  console.log(`   So a shadow-casting scheme only ever has to reach about ${hor(1.7).toFixed(0)} m before the`);
  console.log(`   curvature hides the rest. The small planet bounds the shadow budget the`);
  console.log(`   same way it bounds the render budget.`);
}

// ---- 7. what a block edit costs ---------------------------------------------
console.log('\n7. re-lighting after one block changes');
{
  const hexDisk = r => 3*r*r + 3*r + 1;
  let vol = 0; for (let dz = -MAX; dz <= MAX; dz++) vol += hexDisk(MAX - Math.abs(dz));
  console.log(`   Worst case is removing a block that was blocking a full-strength light:`);
  console.log(`   the flood fill can touch every cell within ${MAX} steps, ${vol.toLocaleString()} of them.`);
  console.log(`   In practice the fill stops at solid cells, and doc 14 already measured`);
  console.log(`   that real terrain is mostly solid below the surface.`);
  console.log(`\n   light range   cells possibly touched   vs a cube world`);
  for (const r of [4, 8, 15]){
    let h = 0, c = 0;
    for (let dz = -r; dz <= r; dz++){ h += hexDisk(r - Math.abs(dz)); c += 2*(r-Math.abs(dz))**2 + 2*(r-Math.abs(dz)) + 1; }
    console.log(`   ${String(r).padStart(11)} ${h.toLocaleString().padStart(24)} ${(h/c).toFixed(3)}x`);
  }
  console.log(`   Shortening the light range is the cheapest lever: cost grows as the cube`);
  console.log(`   of it. Range 8 costs ${(1 - (() => { let a=0,b=0; for(let d=-8;d<=8;d++) a+=hexDisk(8-Math.abs(d)); for(let d=-15;d<=15;d++) b+=hexDisk(15-Math.abs(d)); return a/b; })()) * 100 | 0}% less than range 15.`);
}
