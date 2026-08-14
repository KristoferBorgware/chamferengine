// The twelve pentagons as a GAMEPLAY problem: how often a player meets one,
// how much of the world would have to change to hide them, and what routing
// around one actually costs. Backs docs/17-pentagons.md
const T = (1 + Math.sqrt(5)) / 2, DEG = 180 / Math.PI;
const norm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b))));

const V = [[-1,T,0],[1,T,0],[-1,-T,0],[1,-T,0],[0,-1,T],[0,1,T],[0,-1,-T],[0,1,-T],
           [T,0,-1],[T,0,1],[-T,0,-1],[-T,0,1]].map(norm);
const F = [[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
           [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];

const R = 1700, D = 11, SPACING = 1.20459 * R / 2 ** D;   // doc 06 worked planet
const m = a => a * R;                                      // radians -> metres on the surface
const nearest = d => Math.min(...V.map(v => ang(d, v)));

console.log(`the twelve pentagons, as something a player runs into`);
console.log(`(doc 06 planet: R = ${R} m, D = ${D}, cell spacing ${SPACING.toFixed(3)} m,`);
console.log(` circumference ${(2*Math.PI*R).toFixed(0)} m, ~2.1 h to walk around)\n`);

// ---- 1. how far apart are they, and how close is the nearest one? -----------
console.log('1. where they are');
{
  let nn = Math.PI;
  for (let i = 0; i < 12; i++) for (let j = i+1; j < 12; j++) nn = Math.min(nn, ang(V[i], V[j]));
  // covering radius: the furthest you can get from all twelve is a face centroid
  const cent = F.map(f => norm(f.map(i => V[i]).reduce((a,v) => a.map((x,k)=>x+v[k]), [0,0,0])));
  const cover = nearest(cent[0]);
  // mean distance to the nearest pentagon, over the sphere
  let s = 0, N = 200000, seed = 12345;
  const rnd = () => { seed ^= seed<<13; seed>>>=0; seed ^= seed>>17; seed ^= seed<<5; seed>>>=0; return seed/4294967296; };
  for (let k = 0; k < N; k++){
    const u = 2*rnd()-1, th = 2*Math.PI*rnd(), r = Math.sqrt(1-u*u);
    s += nearest([r*Math.cos(th), r*Math.sin(th), u]);
  }
  console.log(`   nearest pentagon-to-pentagon: ${(nn*DEG).toFixed(3)}deg = ${m(nn).toFixed(0)} m = ${(m(nn)/SPACING).toFixed(0)} cells`);
  console.log(`   furthest you can stand from all twelve: ${(cover*DEG).toFixed(3)}deg = ${m(cover).toFixed(0)} m`);
  console.log(`   mean distance to the nearest one: ${m(s/N).toFixed(0)} m`);
  console.log(`\n   So on this planet you are NEVER more than ${m(cover).toFixed(0)} m from a pentagon,`);
  console.log(`   and typically about ${m(s/N).toFixed(0)} m. They are not remote curiosities;`);
  console.log(`   they are roughly as common as villages.`);
}

// ---- 2. how much of the surface is actually affected? ----------------------
console.log('\n2. how much of the world they touch');
{
  console.log('   fraction of the surface within k cells of a pentagon:\n');
  console.log('   k cells   radius      area        one pentagon zone');
  for (const k of [1, 3, 10, 50, 200]){
    const a = k * SPACING / R;                       // angular radius
    const frac = 12 * (1 - Math.cos(a)) / 2;         // 12 caps, area 2piR^2(1-cos a)
    console.log(`   ${String(k).padStart(7)} ${(k*SPACING).toFixed(0).padStart(7)} m ${(frac*100).toFixed(4).padStart(10)}%`
      + `   ${(2*Math.PI*R*R*(1-Math.cos(a))).toFixed(0).padStart(9)} m^2`);
  }
  console.log('\n   The distortion itself is ONE cell. Even a generous 50-cell exclusion');
  console.log('   zone around each of the twelve costs well under a percent of the world.');
}

// ---- 3. does a long straight route hit one? --------------------------------
console.log('\n3. a rail line, laid straight');
{
  let seed = 99991;
  const rnd = () => { seed ^= seed<<13; seed>>>=0; seed ^= seed>>17; seed ^= seed<<5; seed>>>=0; return seed/4294967296; };
  const randDir = () => { const u = 2*rnd()-1, th = 2*Math.PI*rnd(), r = Math.sqrt(1-u*u);
    return [r*Math.cos(th), r*Math.sin(th), u]; };
  // exact closest approach of an arc to a point -- sampling the route along its
  // length misses near-misses between samples, which understates this badly
  const closestApproach = (a, e, arc, v) => {
    const A = dot(a, v), E = dot(e, v);                    // cos(dist) = A cos x + E sin x
    let best = Math.max(A, A*Math.cos(arc) + E*Math.sin(arc));   // the two endpoints
    let x = Math.atan2(E, A);                              // where the sinusoid peaks
    if (x < 0) x += 2*Math.PI;
    if (x <= arc) best = Math.max(best, Math.hypot(A, E));  // peak lies inside the arc
    return Math.acos(Math.max(-1, Math.min(1, best)));
  };
  console.log('   Random great-circle routes, with the closest approach solved exactly');
  console.log('   rather than sampled along the line.\n');
  console.log('   route length   within 1 cell   within 10 cells   within 50 cells');
  for (const L of [100, 500, 1000, 5000, 10681]){
    const arc = L / R;
    let h1 = 0, h10 = 0, h50 = 0; const N = 200000;
    for (let t = 0; t < N; t++){
      const a = randDir(), b = randDir();
      const n = norm(cross(a, b)), e = norm(cross(n, a));   // walk from a along the circle
      let best = Math.PI;
      for (const v of V) best = Math.min(best, closestApproach(a, e, arc, v));
      const cells = m(best) / SPACING;
      if (cells < 1) h1++;
      if (cells < 10) h10++;
      if (cells < 50) h50++;
    }
    console.log(`   ${(L + ' m').padStart(12)} ${(h1/N*100).toFixed(3).padStart(14)}% ${(h10/N*100).toFixed(2).padStart(16)}%`
      + ` ${(h50/N*100).toFixed(2).padStart(16)}%`);
  }
  console.log('\n   Sanity check on the last row, which also shows the antipodal pairing');
  console.log('   from doc 13 doing something. A full circumnavigation is a whole great');
  console.log(`   circle; for a random pole the chance a given vertex lies within ${SPACING.toFixed(0)} m of`);
  console.log(`   it is sin(${SPACING.toFixed(0)}/${R}) = ${(Math.sin(SPACING/R)*100).toFixed(3)}%. But a great circle is EQUIDISTANT from v`);
  console.log('   and -v, so the twelve pentagons present only SIX independent chances,');
  console.log(`   not twelve: 6 x ${(Math.sin(SPACING/R)*100).toFixed(3)}% = ${(6*Math.sin(SPACING/R)*100).toFixed(3)}%, against ${'the measured value above'}.`);
  console.log('   Twelve would predict twice the observed rate.');
  console.log('\n   So a rail laid at random right around the planet lands dead on a');
  console.log('   pentagon under 1% of the time -- but passes within 50 cells of one');
  console.log('   about a sixth of the time. Rare to hit, common to meet.');
}

// ---- 4. can a route around the planet avoid all twelve? --------------------
console.log('\n4. the best circumnavigating route');
{
  // a great circle with pole n; distance from vertex v to that circle is |90deg - angle(n,v)|
  const clearance = n => Math.min(...V.map(v => Math.abs(Math.PI/2 - ang(n, v))));
  let best = null, bestC = -1, seed = 777;
  const rnd = () => { seed ^= seed<<13; seed>>>=0; seed ^= seed>>17; seed ^= seed<<5; seed>>>=0; return seed/4294967296; };
  for (let t = 0; t < 120000; t++){
    const u = 2*rnd()-1, th = 2*Math.PI*rnd(), r = Math.sqrt(1-u*u);
    const n = [r*Math.cos(th), r*Math.sin(th), u], c = clearance(n);
    if (c > bestC){ bestC = c; best = n; }
  }
  // local refine
  for (let step = 0.05; step > 1e-7; step *= 0.7)
    for (let t = 0; t < 400; t++){
      const cand = norm(best.map(x => x + (rnd()*2-1)*step));
      const c = clearance(cand);
      if (c > bestC){ bestC = c; best = cand; }
    }
  console.log(`   Searching great circles for the one furthest from all twelve vertices:`);
  console.log(`   best clearance ${(bestC*DEG).toFixed(3)}deg = ${m(bestC).toFixed(0)} m = ${(m(bestC)/SPACING).toFixed(0)} cells`);
  console.log(`\n   So a rail CAN circle the planet and stay ${(m(bestC)/SPACING).toFixed(0)} cells clear of every pentagon.`);
  console.log(`   Avoidance is always possible; it is not always convenient.`);
  // and the worst case: a circle through an antipodal pair
  console.log(`   (The opposite extreme: because the twelve form 6 antipodal pairs, a great`);
  console.log(`    circle can also be chosen to pass through TWO of them exactly.)`);
}

// ---- 5. what going around one costs ----------------------------------------
console.log('\n5. the cost of routing around, versus through');
{
  console.log('   A line entering a pentagon deflects 36.07deg either way (doc 13): there is');
  console.log('   no opposite direction to leave by. So "through" is not an option for a');
  console.log('   rail that must stay straight. Going around it costs:\n');
  console.log('   detour radius   extra track   as % of a 1 km line');
  for (const k of [1, 2, 5]){
    // a hexagonal detour around a blocked cell: 2 extra steps per unit of radius
    const extra = 2 * k * SPACING;
    console.log(`   ${String(k + ' cells').padStart(13)} ${(extra.toFixed(1) + ' m').padStart(13)} ${(extra/1000*100).toFixed(2).padStart(20)}%`);
  }
  console.log('\n   Trivial. The cost of a pentagon is not distance -- it is that an');
  console.log('   AUTOMATED system (a rail router, a conveyor, a pipe network) has to');
  console.log('   contain the special case at all. One cell in 42 million, that every');
  console.log('   piece of directional machinery must nevertheless handle correctly.');
}

// ---- 5b. does keeping machinery AWAY from a pentagon help? -----------------
// doc 13 measured the direction-index slip around a pentagon's own ring. If the
// slip is topological it will be the same around a loop of ANY radius, and no
// exclusion zone can fix it -- which changes what the options below can buy.
console.log('\n5b. does an exclusion zone fix the loop problem? (level 6 grid)');
{
  const n = 1 << 6;
  const pts = [], idx = new Map(), nbs = [];
  const put = p => { const k = p.map(x => Math.round(x*1e7)).join(',');
    if (!idx.has(k)){ idx.set(k, pts.length); pts.push(p); nbs.push(new Set()); } return idx.get(k); };
  const link = (a,b) => { nbs[a].add(b); nbs[b].add(a); };
  for (const f of F){
    const [A,B,C] = f.map(i => V[i]), P = [];
    for (let i = 0; i <= n; i++){ const row = [];
      for (let j = 0; j <= i; j++){ const a=(n-i)/n, b=(i-j)/n, c=j/n;
        row.push(put(norm([A[0]*a+B[0]*b+C[0]*c, A[1]*a+B[1]*b+C[1]*c, A[2]*a+B[2]*b+C[2]*c]))); }
      P.push(row); }
    for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++){
      link(P[i][j],P[i+1][j]); link(P[i][j],P[i+1][j+1]); link(P[i+1][j],P[i+1][j+1]); }
  }
  // neighbours ordered counter-clockwise seen from outside (invariant 9)
  const tangent = (v, u) => { const d = dot(v, u); return v.map((x,i) => x - u[i]*d); };
  const ring = pts.map((u, v) => {
    const ns = [...nbs[v]];
    const e1 = norm(tangent(pts[ns[0]], u)), e2 = cross(u, e1);
    return ns.map(w => { const d = tangent(pts[w], u); return [w, Math.atan2(dot(d, e2), dot(d, e1))]; })
             .sort((a,b) => a[1]-b[1]).map(a => a[0]);
  });
  const pent = ring.map((r,v) => [r.length, v]).filter(a => a[0] === 5).map(a => a[1]);
  // graph distance from one pentagon
  const P0 = pent[0], dist = new Int32Array(pts.length).fill(-1);
  dist[P0] = 0; let fr = [P0];
  for (let k = 1; fr.length; k++){ const nx = [];
    for (const v of fr) for (const w of ring[v]) if (dist[w] < 0){ dist[w] = k; nx.push(w); }
    fr = nx; }
  // walk the cycle of cells at distance k, carrying a direction index
  const slipAt = k => {
    const on = new Set(); for (let v = 0; v < pts.length; v++) if (dist[v] === k) on.add(v);
    if ([...on].some(v => ring[v].length !== 6)) return null;   // rule needs degree 6
    const start = [...on][0], loop = [start]; on.delete(start);
    let cur = start;
    while (true){
      const nxt = ring[cur].find(w => on.has(w));
      if (nxt === undefined) break;
      loop.push(nxt); on.delete(nxt); cur = nxt;
    }
    if (!ring[cur].includes(start)) return null;                // did not close
    const h0 = ring[loop[0]].indexOf(loop[1]); let h = h0;
    for (let i = 0; i < loop.length; i++){
      const A2 = loop[i], B2 = loop[(i+1) % loop.length];
      const mi = ring[A2].indexOf(B2), j = ring[B2].indexOf(A2);
      h = (j + 3 + (((h - mi) % 6) + 6) % 6) % 6;
    }
    return { slip: ((h - h0) % 6 + 6) % 6, len: loop.length };
  };
  console.log('   walk a closed loop at graph distance k around one pentagon,');
  console.log('   carrying a direction index the way a rail carries "straight on":\n');
  console.log('   k    cells in loop   direction slip on return');
  for (const k of [1, 2, 3, 5, 8, 12, 16]){
    const r = slipAt(k);
    if (!r) { console.log(`   ${String(k).padStart(2)}    (loop not clean at this radius)`); continue; }
    console.log(`   ${String(k).padStart(2)} ${String(r.len).padStart(15)} ${String(r.slip).padStart(24)} index`
      + (r.slip ? ` = ${r.slip*60}deg` : ''));
  }
  console.log('\n   The slip is 1 index at EVERY radius. It is topological: it counts the');
  console.log('   pentagons enclosed, not the distance kept from them. So an exclusion');
  console.log('   zone of any size leaves it exactly where it was.');
  console.log('\n   This narrows what every option below can actually buy. Keeping machinery');
  console.log('   off a pentagon removes the LOCAL problem -- five exits instead of six,');
  console.log('   no straight line through. It does NOT remove the loop problem, because');
  console.log('   a loop drawn anywhere around the pentagon still encircles it.');
}

// ---- 5c. twelve of them as places: a tour, and whether you can see one -----
console.log('\n5c. the twelve as destinations');
{
  // shortest closed tour visiting all twelve, along icosahedron edges
  const E = new Map();                              // adjacency by shared-edge distance
  let nn = Math.PI;
  for (let i = 0; i < 12; i++) for (let j = i+1; j < 12; j++) nn = Math.min(nn, ang(V[i], V[j]));
  for (let i = 0; i < 12; i++){
    const adj = [];
    for (let j = 0; j < 12; j++) if (j !== i && Math.abs(ang(V[i], V[j]) - nn) < 1e-9) adj.push(j);
    E.set(i, adj);
  }
  console.log(`   each pentagon has ${E.get(0).length} nearest neighbours at ${m(nn).toFixed(0)} m -- the icosahedron graph`);
  // is there a Hamiltonian cycle? depth-first search
  let cycle = null;
  (function walk(path, seen){
    if (cycle) return;
    if (path.length === 12){ if (E.get(path[11]).includes(path[0])) cycle = path.slice(); return; }
    for (const w of E.get(path[path.length-1])) if (!seen.has(w)){
      seen.add(w); path.push(w); walk(path, seen); path.pop(); seen.delete(w);
    }
  })([0], new Set([0]));
  if (cycle){
    const len = 12 * m(nn);
    console.log(`   a closed tour visiting all twelve exists: ${cycle.join('->')}->${cycle[0]}`);
    console.log(`   length ${len.toFixed(0)} m = ${(len/(2*Math.PI*R)).toFixed(2)}x around the world`);
    console.log(`   at 1.4 m/s that is ${(len/1.4/3600).toFixed(1)} hours of walking`);
  } else console.log('   no Hamiltonian cycle found');
  // can you see one landmark from the next?
  const hor = h => R * Math.acos(R / (R + h));
  console.log(`\n   Can you see one from the next? Eye horizon is ${hor(1.7).toFixed(0)} m (doc 13), so a`);
  console.log(`   tower of height h is visible from ${hor(1.7).toFixed(0)} m + R*acos(R/(R+h)).`);
  console.log(`   height   visible from   reaches the next pentagon (${m(nn).toFixed(0)} m)?`);
  for (const h of [20, 60, 150, 400]){
    const d = hor(1.7) + hor(h);
    console.log(`   ${(h + ' m').padStart(6)} ${(d.toFixed(0) + ' m').padStart(14)}   ${d >= m(nn) ? 'yes' : 'no'}`);
  }
  // solve for the height that would just reach
  let lo = 1, hi = 1e7;
  for (let k = 0; k < 200; k++){ const mid = (lo+hi)/2; if (hor(1.7) + hor(mid) < m(nn)) lo = mid; else hi = mid; }
  console.log(`   a landmark would have to be ${hi.toFixed(0)} m tall to be seen from the next one --`);
  console.log(`   taller than the planet's radius. On a world this small the twelve are NOT`);
  console.log(`   inter-visible, so travelling between them needs coordinates, not line of`);
  console.log(`   sight. That is what makes doc 13's "poles on a pentagon pair" worth taking.`);
}

// ---- 6. what hiding them under ocean would cost ----------------------------
console.log('\n6. burying them, as H3 does on Earth');
{
  console.log('   Force the height field down at the twelve vertices so each sits under');
  console.log('   water. Cost, as a share of the whole surface:\n');
  // measured, not from the 12*cap formula, which double-counts once the discs
  // start overlapping (they touch at half the 1882 m separation)
  let seed = 4242;
  const rnd = () => { seed ^= seed<<13; seed>>>=0; seed ^= seed>>17; seed ^= seed<<5; seed>>>=0; return seed/4294967296; };
  const covered = rad => {
    const a = rad / R; let hit = 0; const N = 400000;
    for (let k = 0; k < N; k++){
      const u = 2*rnd()-1, th = 2*Math.PI*rnd(), r = Math.sqrt(1-u*u);
      if (nearest([r*Math.cos(th), r*Math.sin(th), u]) < a) hit++;
    }
    return hit / N;
  };
  console.log('   ocean radius    surface given to water   still walkable');
  for (const rad of [50, 100, 200, 500, 941, 1109]){
    const frac = covered(rad);
    const note = rad >= 941 ? '   <- discs now overlap' : '';
    console.log(`   ${(rad + ' m').padStart(12)} ${(frac*100).toFixed(2).padStart(23)}% ${((1-frac)*100).toFixed(2).padStart(15)}%${note}`);
  }
  console.log(`\n   ${(covered(100)*100).toFixed(2)}% for a 100 m sea around each -- far more than enough to hide a`);
  console.log('   one-cell defect. This is the only option that removes the problem');
  console.log('   rather than relocating it, because it removes the MACHINERY, not the');
  console.log('   geometry: no rails get built at the bottom of an ocean.');
  console.log(`\n   But note what it does to the map: twelve seas, ${m(ang(V[0], V[1])).toFixed(0)} m apart, at`);
  console.log('   FIXED positions no seed can move. That is a strong world-design');
  console.log('   statement, not a neutral one -- an archipelago planet by construction.');
}
