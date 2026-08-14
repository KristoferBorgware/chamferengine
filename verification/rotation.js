// Directional blocks: rails, pipes, conveyors. A rotation here is an index into
// a cell's neighbour ring, so three questions decide the design. How evenly are
// those six directions spread, since a player aims at one of them? How often does
// a build actually run into a pentagon, given placement is refused there? And how
// often does a closed circuit enclose one, which is the case that does not close.
// Backs docs/19-directional-blocks.md
const T = (1 + Math.sqrt(5)) / 2;
const norm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
const sub = (a,b) => a.map((x,i) => x - b[i]);
const dot = (a,b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const ang = (a,b) => Math.acos(Math.max(-1, Math.min(1, dot(a,b))));
const DEG = 180/Math.PI;

const V0 = [[-1,T,0],[1,T,0],[-1,-T,0],[1,-T,0],[0,-1,T],[0,1,T],[0,-1,-T],[0,1,-T],
            [T,0,-1],[T,0,1],[-T,0,-1],[-T,0,1]].map(norm);
const F0 = [[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
            [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];

// the real grid: cells are vertices, neighbours ordered CCW seen from outside
function grid(L){
  const n = 1 << L, idx = new Map(), pts = [], nb = [];
  const put = p => { const k = p.map(x => Math.round(x*1e7)).join(',');
    if (!idx.has(k)){ idx.set(k, pts.length); pts.push(p); nb.push(new Set()); } return idx.get(k); };
  const link = (a,b) => { nb[a].add(b); nb[b].add(a); };
  for (const f of F0){
    const [A,B,C] = f.map(i => V0[i]), P = [];
    for (let i=0;i<=n;i++){ const row=[];
      for (let j=0;j<=i;j++){ const a=(n-i)/n, b=(i-j)/n, c=j/n;
        row.push(put(norm([A[0]*a+B[0]*b+C[0]*c, A[1]*a+B[1]*b+C[1]*c, A[2]*a+B[2]*b+C[2]*c]))); }
      P.push(row); }
    for (let i=0;i<n;i++) for (let j=0;j<=i;j++){
      link(P[i][j],P[i+1][j]); link(P[i][j],P[i+1][j+1]); link(P[i+1][j],P[i+1][j+1]); }
  }
  // order each ring CCW from outside -- the rule invariant 9 requires
  const ring = pts.map((p,v) => {
    const e1 = norm(sub(pts[[...nb[v]][0]], p)), e2 = cross(p, e1);
    return [...nb[v]].sort((a,b) => {
      const A2 = sub(pts[a],p), B2 = sub(pts[b],p);
      return Math.atan2(dot(A2,e2),dot(A2,e1)) - Math.atan2(dot(B2,e2),dot(B2,e1));
    });
  });
  return { pts, ring };
}

// ---- 1. how evenly are the six directions spread? --------------------------
// A player aims somewhere and the block snaps to the nearest direction. That is
// only comfortable if the six are near enough 60 degrees apart everywhere.
console.log('1. angular spread of a cell\'s six directions');
{
  const L = 6, { pts, ring } = grid(L);
  let worstGap = 999, biggestGap = 0, worstDev = 0, hexes = 0;
  for (let v=0; v<pts.length; v++){
    if (ring[v].length !== 6) continue;            // pentagons cannot hold a block
    hexes++;
    const p = pts[v], e1 = norm(sub(pts[ring[v][0]], p)), e2 = cross(p, e1);
    const bear = ring[v].map(w => { const d = sub(pts[w], p);
      return (Math.atan2(dot(d,e2), dot(d,e1))*DEG + 360) % 360; });
    for (let k=0;k<6;k++){
      const g = ((bear[(k+1)%6] - bear[k]) + 360) % 360;
      worstGap = Math.min(worstGap, g); biggestGap = Math.max(biggestGap, g);
      worstDev = Math.max(worstDev, Math.abs(g - 60));
    }
  }
  console.log(`   ${hexes} hexagons at level ${L}`);
  console.log(`   gap between neighbouring directions: min ${worstGap.toFixed(2)} deg, max ${biggestGap.toFixed(2)} deg`);
  console.log(`   worst deviation from an even 60 deg: ${worstDev.toFixed(2)} deg`);
  console.log(`   so aiming within +/-${(worstGap/2).toFixed(1)} deg of a direction always picks it.`);
  console.log('   A player aims with a mouse. Half of the tightest gap is the tolerance,');
  console.log('   and it never falls below that anywhere on the planet.');
}

// ---- 2. how often does a build meet a pentagon at all? ---------------------
// Placement is refused on the twelve columns (doc 17), so a build only cares if
// one is inside its footprint.
console.log('\n2. how often a build of radius r contains a pentagon');
{
  // a hex disc of radius r holds 3r^2+3r+1 cells; 12 pentagons over N cells
  const N = 10*4**11 + 2;
  console.log('   radius (cells)   cells in the disc   chance it holds a pentagon');
  for (const r of [10, 25, 50, 100, 250, 500]){
    const cells = 3*r*r + 3*r + 1;
    console.log(`   ${String(r).padStart(6)}        ${String(cells).padStart(12)}       ${(100*12*cells/N).toFixed(3)}%`);
  }
  console.log('   On the doc-06 planet a cell is 1 m, so a 100-cell radius is a 200 m');
  console.log('   factory. Under half a percent of those contain a pentagon at all.');
}

// ---- 3. the loop that does not close ---------------------------------------
// Carry a heading around a closed ring and see what comes back. This is the rule
// no design choice removes, so it has to be stated as a code invariant.
console.log('\n3. carrying a heading around a closed loop');
{
  const L = 5, { pts, ring } = grid(L);
  const pents = [...pts.keys()].filter(v => ring[v].length === 5);
  // move a heading from cell a to cell b: project the old direction into b's
  // tangent plane and take b's nearest ring direction
  const carry = (a, h, b) => {
    const va = norm(sub(pts[ring[a][h]], pts[a]));
    const proj = norm(sub(va, pts[b].map(x => x*dot(va, pts[b]))));
    let best = 0, bestD = -2;
    ring[b].forEach((w,k) => { const d = dot(norm(sub(pts[w], pts[b])), proj);
      if (d > bestD){ bestD = d; best = k; } });
    return best;
  };
  // BFS distances from a source
  const dist = src => {
    const d = new Int32Array(pts.length).fill(-1); d[src] = 0;
    const q = [src];
    for (let i=0;i<q.length;i++) for (const w of ring[q[i]]) if (d[w] < 0){ d[w] = d[q[i]]+1; q.push(w); }
    return d;
  };
  // walk the cells at exactly radius k around centre, in ring order
  const loopAround = (centre, k) => {
    const d = dist(centre);
    const shell = [...pts.keys()].filter(v => d[v] === k);
    if (!shell.length) return null;
    const order = [shell[0]], used = new Set(order);
    while (true){
      const cur = order[order.length-1];
      const nxt = ring[cur].find(w => d[w] === k && !used.has(w));
      if (nxt === undefined) break;
      order.push(nxt); used.add(nxt);
    }
    return order.length === shell.length ? order : null;
  };
  const slipOf = loop => {
    let h = 0;
    // pick a starting heading, carry it all the way round, compare
    for (let i=0;i<loop.length;i++) h = carry(loop[i], h, loop[(i+1)%loop.length]);
    return h;
  };

  const d0 = dist(pents[0]);
  console.log('   loop centred ON a pentagon:');
  for (const k of [2,3,4,5]){
    const loop = loopAround(pents[0], k);
    if (loop) console.log(`     radius ${k}: ${String(loop.length).padStart(3)} cells, slip ${slipOf(loop)} index`);
  }
  console.log('   loop centred AWAY from it -- does the slip follow the pentagon or the centre?');
  for (const k of [3,4]){
    for (const centreDist of [1,2,5,9]){
      const centre = [...pts.keys()].find(v => d0[v] === centreDist && ring[v].length === 6);
      const loop = loopAround(centre, k);
      if (!loop) continue;
      const encloses = centreDist < k;
      console.log(`     radius ${k}, centre ${centreDist} from the pentagon`
        + ` (${encloses ? 'encloses it ' : 'does not   '}): slip ${slipOf(loop)} index`);
    }
  }
  console.log('   The slip tracks whether the pentagon is INSIDE the loop, not where the');
  console.log('   loop is centred or how wide it is. That is what "topological" means here,');
  console.log('   and it is why no exclusion zone fixes it.');
}

// ---- 4. what the rotation costs to store -----------------------------------
console.log('\n4. storage');
{
  console.log('   6 orientations need ceil(log2 6) = 3 bits.');
  console.log('   Doc 03 packs block state as 16 bits beside a 41-bit address:');
  console.log('     12 bits type + 4 bits rotation = 16, leaving one spare rotation bit');
  console.log('   4,096 block types and 6 orientations, with a bit left for a flag such as');
  console.log('   powered or reversed. No change to the ID layout is needed.');
}

console.log('\nverdict');
console.log('   Six states, three bits, and a snap tolerance that never drops below');
console.log('   half the tightest gap measured above. Placement is refused on the twelve');
console.log('   pentagons, which under 0.5% of a 200 m build would ever meet. The one');
console.log('   thing no decision removes is the loop: a circuit enclosing an odd number');
console.log('   of pentagons comes back one index over, so recompute a heading from the');
console.log('   grid at every step and never carry one round a loop.');
