// Water is a block type: translucent, no collision, written once by the generator
// (doc 24). Blocks are cheap; TRANSLUCENT blocks are the ones that make renderers
// difficult, because they cannot be drawn in any order. So the questions are how
// much water surface there is, and how many layers of it a player ever looks
// through at once. Backs docs/25-water.md
const T = (1 + Math.sqrt(5)) / 2;
const norm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
const dot = (a,b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const K = Math.sqrt(8*Math.PI/(10*Math.sqrt(3)));
const R = 1700, BLOCK = 1;

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

// ---- the world, in metres of elevation -------------------------------------
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

const RELIEF = 60;                                   // metres, as doc 14 uses
const ground = new Float64Array(N);
for (let v=0;v<N;v++) ground[v] = fbm(pts[v], 1.5, 6) * RELIEF;
const s = Float64Array.from(ground).sort();
const SEA = s[Math.floor(N*0.70)];                   // 30% land, as on Earth

// Doc 21's priority-flood, so that lakes ABOVE sea level exist -- without them
// every water surface sits at one height and the overlap question is trivial by
// construction rather than by measurement.
const surface = (() => {
  const filled = Float64Array.from(ground), done = new Uint8Array(N), hq = [], EPS = 1e-7;
  const push = (k,v) => { hq.push([k,v]); let i=hq.length-1;
    while (i>0){ const p=(i-1)>>1; if (hq[p][0] <= hq[i][0]) break; [hq[p],hq[i]]=[hq[i],hq[p]]; i=p; } };
  const pop = () => { const top=hq[0], last=hq.pop();
    if (hq.length){ hq[0]=last; let i=0;
      for(;;){ const l=2*i+1, r=l+1; let m=i;
        if (l<hq.length && hq[l][0]<hq[m][0]) m=l;
        if (r<hq.length && hq[r][0]<hq[m][0]) m=r;
        if (m===i) break; [hq[m],hq[i]]=[hq[i],hq[m]]; i=m; } }
    return top; };
  for (let v=0;v<N;v++) if (ground[v] <= SEA){ done[v]=1; push(ground[v], v); }
  while (hq.length){ const [k,v] = pop();
    for (const w of ring[v]){ if (done[w]) continue; done[w]=1;
      if (filled[w] <= k) filled[w] = k + EPS;
      push(filled[w], w); } }
  // below sea level the surface IS sea level; above it, a lake sits where the
  // fill raised the ground
  return Float64Array.from({length:N}, (_,v) =>
    ground[v] <= SEA ? SEA : filled[v]);
})();
const depth = v => Math.max(0, Math.round((surface[v] - ground[v]) / BLOCK));

let wet = 0, totalWaterCells = 0, deepest = 0;
for (let v=0;v<N;v++){ const d = depth(v); if (d > 0){ wet++; totalWaterCells += d; deepest = Math.max(deepest, d); } }
console.log(`level ${L}: ${N.toLocaleString('en-US')} columns, ${RELIEF} m of relief, 1 m blocks`);
console.log(`  ${(100*wet/N).toFixed(1)}% of columns hold water, deepest ${deepest} m`);

// ---- 1. water is a surface, not a volume -----------------------------------
// Interior faces between two water cells are culled exactly as they are between
// two stone cells. What survives is the top of the topmost water cell, plus the
// sides wherever a water column stands taller than its neighbour.
console.log('\n1. how much water actually gets drawn');
{
  let tops = 0, sides = 0;
  for (let v=0;v<N;v++){
    const d = depth(v);
    if (d === 0) continue;
    tops++;                                          // one surface per wet column
    for (const w of ring[v]){
      const dw = depth(w);
      // water faces the neighbour wherever this column's water stands above
      // whatever the neighbour has there
      const myTop = surface[v], neighbourTop = dw > 0 ? surface[w] : ground[w];
      if (neighbourTop < myTop)
        sides += Math.round((myTop - Math.max(neighbourTop, surface[v] - d)) / BLOCK);
    }
  }
  console.log(`   water cells in the world:      ${totalWaterCells.toLocaleString('en-US')}`);
  console.log(`   faces if drawn as a volume:    ${(totalWaterCells*8).toLocaleString('en-US')} (8 per prism)`);
  console.log(`   faces actually drawn:          ${(tops+sides).toLocaleString('en-US')}`
    + `  = ${tops.toLocaleString('en-US')} tops + ${sides.toLocaleString('en-US')} sides`);
  console.log(`   ratio:                         ${((tops+sides)/(totalWaterCells*8)*100).toFixed(2)}%`);
  console.log('   The sea is one skin, not a solid. Every ocean cell below the top one is');
  console.log('   enclosed by other water and emits nothing -- the same rule doc 14 already');
  console.log('   applies to stone, with no extra work for being transparent.');
  console.log('   And note the side count. GENERATED water never has an exposed side: it is');
  console.log('   always held by land at or above its own level, or by more water. A water');
  console.log('   face that stands in open air only exists where a PLAYER built one.');
}

// ---- 2. and it is the flattest thing on the planet -------------------------
console.log('\n2. the sea surface merges better than anything else');
{
  // doc 14 caps a merged flat patch at 37 m by curvature. The sea surface is at
  // a constant radius, so it is exactly a sphere -- the ONLY surface that is.
  const spacing = K*R/2**11;
  console.log(`   sea level is a constant radius, so the surface has no relief at all`);
  console.log(`   doc 14's merge limit is curvature alone: ${(Math.sqrt(8*R*0.1)).toFixed(0)} m at 0.1 m of sag`);
  console.log(`   that is ${(Math.sqrt(8*R*0.1)/spacing).toFixed(0)} cells across, merged into one quad`);
  console.log('   Terrain never merges that far because terrain is not flat. The ocean is,');
  console.log('   everywhere, so the largest surface in the world is also the cheapest.');
}

// A body of water is a connected run of wet columns: the sea is one, and each
// lake above sea level is another. Sections 3 and 4 both need the labelling.
const bodyOf = new Int32Array(N).fill(-1);
let bodies = 0;
for (let v=0;v<N;v++){
  if (depth(v) === 0 || bodyOf[v] >= 0) continue;
  const id = bodies++, q = [v]; bodyOf[v] = id;
  for (let i=0;i<q.length;i++) for (const w of ring[q[i]])
    if (depth(w) > 0 && bodyOf[w] < 0){ bodyOf[w] = id; q.push(w); }
}

// ---- 3. how many layers does a player look through? ------------------------
// This is the question that decides whether sorting is hard. Transparent
// surfaces must be drawn back to front, and the cost is in how many overlap.
console.log('\n3. how many water surfaces overlap in one view');
{
  const spacing = K*R/2**L;
  const cosH = Math.cos(76 / R);
  let seed = 31337;
  const rnd = () => { seed = (seed*1103515245 + 12345) & 0x7fffffff; return seed/0x7fffffff; };
  const hist = new Map();
  let worst = 0;
  for (let t=0;t<3000;t++){
    const z = 2*rnd()-1, ph = 2*Math.PI*rnd(), rr = Math.sqrt(1-z*z);
    const eye = [rr*Math.cos(ph), rr*Math.sin(ph), z];
    const seen = new Set();
    for (let v=0;v<N;v++) if (dot(pts[v], eye) > cosH && depth(v) > 0) seen.add(bodyOf[v]);
    hist.set(seen.size, (hist.get(seen.size)||0) + 1);
    worst = Math.max(worst, seen.size);
  }
  console.log(`   ${bodies} separate bodies of water on the planet`);
  console.log('   distinct bodies within a standing player\'s 76 m horizon:');
  for (const k of [...hist.keys()].sort((a,b)=>a-b))
    console.log(`     ${k} ${k===1?'body ':'bodies'}   ${(100*hist.get(k)/3000).toFixed(1)}% of viewpoints`);
  console.log(`   worst seen: ${worst}`);
  console.log('   Water fills a column from the bottom up, so a view crosses one body once.');
  console.log('   Sorting a handful of surfaces per frame is not a sorting problem -- it is');
  console.log('   a sort of a handful of things.');
}

// ---- 4. wading in, and getting back out ------------------------------------
// Water has no collision, but it is NOT nothing: the player floats and swims
// rather than dropping through it. Two things have to hold for that to be
// playable. Shallow water has to exist, or every shore is a plunge; and the
// bank has to be climbable, or a player who swims out cannot get back.
console.log('\n4. wading in, and getting back out');
{
  const PLAYER = 1.8, STEP = 1;         // metres: player height, step-up height
  let shore = 0, wade = 0, over = 0, stepOut = 0, worstStep = -Infinity;
  const byDepth = new Map();
  const exits = new Map();              // body id -> how many shore columns you can climb at
  for (let v=0;v<N;v++){
    const d = depth(v);
    if (d === 0) continue;
    const dry = ring[v].filter(w => depth(w) === 0);
    if (!dry.length) continue;          // open water, not a shore
    shore++;
    byDepth.set(Math.min(d,4), (byDepth.get(Math.min(d,4))||0) + 1);
    if (d*BLOCK < PLAYER) wade++;       // feet on the bottom, head clear
    else over++;                        // swimming from the first cell in
    // the bank you have to climb: how far the dry land stands above the water
    const rise = Math.min(...dry.map(w => ground[w] - surface[v]));
    worstStep = Math.max(worstStep, rise);
    if (rise <= STEP){ stepOut++; exits.set(bodyOf[v], (exits.get(bodyOf[v])||0) + 1); }
  }
  console.log(`   ${shore.toLocaleString('en-US')} shore columns (wet, with dry land next to them)`);
  console.log('   depth at the water\'s edge:');
  for (const k of [...byDepth.keys()].sort((a,b)=>a-b))
    console.log(`     ${k === 4 ? '4+' : ' '+k} block${k===1?' ':'s'}  ${(100*byDepth.get(k)/shore).toFixed(1)}%`);
  console.log(`   wade in (bottom reachable by a ${PLAYER} m player): ${(100*wade/shore).toFixed(1)}%`);
  console.log(`   swimming from the first cell:                  ${(100*over/shore).toFixed(1)}%`);
  console.log(`   you can step out (bank <= ${STEP} m) at ${(100*stepOut/shore).toFixed(1)}% of shore columns`);
  console.log(`   bodies of water with at least one exit: ${exits.size} of ${bodies}`);
  console.log(`   worst bank anywhere: ${worstStep.toFixed(2)} m`);
  console.log('   Water deepens gradually because it fills a valley, and a valley has');
  console.log('   sides -- so a shore is a ramp, not a wall, and the wading band exists');
  console.log('   without anyone designing it. Nothing traps a swimmer.');
  console.log(`   Note there is no chest-deep: at ${BLOCK} m blocks a ${PLAYER} m player`);
  console.log('   stands in one block of water and swims in two. The transition between');
  console.log('   walking and swimming is ONE cell wide, so it is a threshold rather than');
  console.log('   a gradient, and the mover needs no partial-buoyancy case.');

  // The one movement bug this invites. A block with no collision is a block a
  // fast mover can pass straight through, so entering water must be tested
  // along the step rather than at the end of it -- which is doc 09's ray walk.
  const VT = 50;                        // m/s, roughly terminal velocity
  console.log(`   a player falling at ${VT} m/s crosses, per frame:`);
  for (const hz of [144, 60, 30, 20])
    console.log(`     ${String(hz).padStart(3)} Hz  ${(VT/hz).toFixed(2)} m = ${(VT/hz/BLOCK).toFixed(1)} blocks`
      + (VT/hz > BLOCK ? '  <- skips a cell' : ''));
  console.log('   So test the swept segment, not the endpoint. Doc 09 already walks a');
  console.log('   ray cell by cell; entering water is that walk with a different test.');
}

// ---- 5. what an edit costs -------------------------------------------------
console.log('\n5. what it costs when a player touches it');
{
  console.log('   remove one water block   -> one delta, 57 bits (doc 03)');
  console.log('   place one water block    -> one delta, and it stays where it was put');
  console.log('   wall across a river      -> as many deltas as blocks placed, and nothing else');
  console.log('   drain a lake by hand     -> one delta per block removed, no propagation');
  console.log('   Because water never moves, an edit to it costs exactly what an edit to');
  console.log('   stone costs. There is no flood fill, no re-route, no cascade, and no');
  console.log('   second system to keep consistent.');
  console.log('   Placement is what breaks the 0-sides result in section 1, and only that:');
  console.log('   GENERATED water has no exposed side, so a player-built one is the only');
  console.log('   kind there is. Same for the one-surface figure in section 3 -- a built');
  console.log('   aquarium in front of a lake is two surfaces, and no measurement of the');
  console.log('   generated world can bound what someone chooses to build.');
}

// ---- 6. blocks against a surface -------------------------------------------
// Everything above prices the ocean as blocks and finds it cheap. This section
// prices the alternative -- one shell around the camera -- and the two do not
// scale the same way, which is what decides between them.
console.log('\n6. the ocean as blocks, against the ocean as one surface');
{
  const CRUST = 64;                              // layers in use, doc 06
  const slots = N * CRUST;
  // The shell: a disc of RINGS by SECTORS carried onto the sphere, which is
  // what the engine draws. It is built once, at every planet size.
  const RINGS = 96, SECTORS = 128;
  const shellTris = SECTORS + (RINGS - 1) * SECTORS * 2;

  let tops = 0;
  for (let v=0;v<N;v++) if (depth(v) > 0) tops++;

  console.log(`   water cells:                   ${totalWaterCells.toLocaleString('en-US')}`);
  console.log(`   block slots in the crust:      ${slots.toLocaleString('en-US')} (${N.toLocaleString('en-US')} columns x ${CRUST} layers)`);
  console.log(`   share of the world that is water: ${(100*totalWaterCells/slots).toFixed(1)}%`);
  console.log(`   surface faces at this level:   ${tops.toLocaleString('en-US')}`);
  console.log(`   one shell, any planet:         ${shellTris.toLocaleString('en-US')} triangles`);
  console.log('');
  // N(L) = 10*4^L + 2, so columns quadruple per level and so does the sea
  // surface drawn out of them. The shell does not move.
  for (const level of [7, 9, 11, 13]) {
    const columns = 10 * 4 ** level + 2;
    const seaFaces = Math.round(tops * (columns / N));
    console.log(`   level ${String(level).padStart(2)}: ${String(seaFaces.toLocaleString('en-US')).padStart(13)} sea faces as blocks`
      + `   vs ${shellTris.toLocaleString('en-US')} as a surface`
      + `   (${(seaFaces/shellTris).toFixed(0)}x)`);
  }
  console.log('');
  console.log('   THE FACES WERE NEVER THE COST -- section 1 measured them at 0.89% of the');
  console.log('   naive count, and a 15% slice of the block slots is memory a chunk holds');
  console.log('   rather than work a frame does. What decides it is the last column: the');
  console.log('   sea drawn out of blocks grows with the planet, at 4x a level, and the');
  console.log('   sea drawn as a shell is the same mesh at every size and every altitude.');
  console.log('   At the shipped depth of 11 that is a factor of 1,188.');
  console.log('   And the shell can do what a field of blocks cannot do at any price: a');
  console.log('   wave, a sun sitting on it, and a colour that deepens with what the look');
  console.log('   passes through. A block is one flat quad of one colour.');
}

console.log('\nverdict');
console.log('   Water as blocks is cheaper than it sounds in every direction that matters.');
console.log('   Interior faces cull like any other material, so the ocean draws as a skin');
console.log('   rather than a solid. The surface is at a constant radius, which makes it');
console.log('   the only genuinely flat thing on the planet and the best merging candidate');
console.log('   there is. And because water fills columns from the bottom, a player almost');
console.log('   never looks through more than one surface at a time -- so the transparency');
console.log('   sorting doc 14 left open is a sort of very few things.');
console.log('   None of that saved it. Section 6 is why the OCEAN is a surface now: not');
console.log('   because blocks were expensive, but because the shell costs the same on');
console.log('   every planet and can carry a wave. Sections 1 to 5 still describe water');
console.log('   as a material, which is what a lake and a river will be built out of.');
