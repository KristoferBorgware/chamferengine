// Player-facing coordinates. "x: 412, y: 68, z: -190" says nothing useful on a
// sphere, so the readout has to be latitude, longitude and altitude. That raises
// three questions a design has to answer: where the axis goes, how many decimal
// places actually name a cell, and whether a rounded readout is precise enough to
// share. Backs docs/20-player-coordinates.md
const T = (1 + Math.sqrt(5)) / 2;
const norm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
const dot = (a,b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const DEG = 180/Math.PI;
const K = Math.sqrt(8*Math.PI/(10*Math.sqrt(3)));

const V0 = [[-1,T,0],[1,T,0],[-1,-T,0],[1,-T,0],[0,-1,T],[0,1,T],[0,-1,-T],[0,1,-T],
            [T,0,-1],[T,0,1],[-T,0,-1],[-T,0,1]].map(norm);
const F0 = [[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
            [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
const CENT = F0.map(f => norm(f.map(i => V0[i]).reduce((a,v) => a.map((x,k) => x + v[k]), [0,0,0])));

// ---- 1. put the poles on a pentagon pair, and see where the rest land -------
// Doc 13 found the twelve pentagons form six antipodal pairs. Doc 17 makes them
// protected landmarks. So the coordinate axis has somewhere principled to go.
//
// That leaves WHICH pair, which end is north, and where longitude 0 runs. Doc 20
// called the first arbitrary; parts (b) and (c) below test whether it really is,
// and find the only thing that separates the six.
console.log('1. choosing the axis: run it through an antipodal pentagon pair');
{
  const pairs = [];
  for (let a=0;a<12;a++) for (let b=a+1;b<12;b++)
    if (Math.abs(dot(V0[a], V0[b]) + 1) < 1e-12) pairs.push([a,b]);
  console.log(`   antipodal pairs among the twelve: ${pairs.length}  ${pairs.map(p=>p.join('-')).join(' ')}`);

  const N = V0[pairs[0][0]];                 // north = one pentagon of the first pair
  const lat = v => Math.asin(Math.max(-1, Math.min(1, dot(v, N)))) * DEG;
  const bands = new Map();
  for (let i=0;i<12;i++){
    const key = lat(V0[i]).toFixed(3);
    bands.set(key, (bands.get(key) || 0) + 1);
  }
  console.log('   with the axis through that pair, the twelve sit at these latitudes:');
  for (const [l,n] of [...bands.entries()].sort((a,b)=>b[0]-a[0]))
    console.log(`     ${String(l).padStart(8)} deg   ${n} pentagon${n>1?'s':''}`);
  console.log('   Two poles and two rings of five. The same in every world ever generated,');
  console.log('   because the positions are geometry and no seed can move them.');
  console.log('   The ring latitude is atan(1/2) exactly:'
    + ` ${(Math.atan(0.5)*DEG).toFixed(3)} deg.`);

  // (b) is any pair a better choice than the others? The icosahedron is
  // vertex-transitive, so the honest expectation is no -- but "arbitrary" is a
  // claim like any other and doc 20 states it without a number behind it.
  console.log('\n   (b) do the six pairs differ at all?');
  const sig = ([a]) => {
    const A = V0[a], b = new Map();
    for (let i=0;i<12;i++){
      const k = (Math.asin(Math.max(-1,Math.min(1,dot(V0[i],A))))*DEG).toFixed(3);
      b.set(k, (b.get(k)||0)+1);
    }
    return [...b.entries()].sort((x,y)=>y[0]-x[0]).map(([l,n])=>`${l}x${n}`).join(' ');
  };
  const sigs = new Set(pairs.map(sig));
  for (const p of pairs) console.log(`     axis ${p.join('-').padEnd(5)}  ${sig(p)}`);
  console.log(`   distinct latitude signatures among all six: ${sigs.size}`);
  console.log('   They are the same world seen from a different angle. No measurement');
  console.log('   will ever prefer one, so the choice cannot be made on merit -- it can');
  console.log('   only be made once and written down.');

  // The one thing that is NOT symmetric is the face table, because F0 was
  // written vertex-0-first. A polar cap that is a contiguous run of face indices
  // turns "am I near a pole" into a range check.
  const capOf = v => F0.map((f,i) => f.includes(v) ? i : -1).filter(i => i >= 0);
  const contiguous = a => a.every((x,i) => i === 0 || x === a[i-1] + 1);
  console.log('\n   which faces meet each pole, and whether they are a contiguous run:');
  let winner = null;
  for (const [a,b] of pairs){
    const ca = capOf(a), cb = capOf(b), both = contiguous(ca) && contiguous(cb);
    if (both) winner = [a,b];
    console.log(`     ${(a+'-'+b).padEnd(6)} north [${ca.join(',')}]  south [${cb.join(',')}]`
      + (both ? '   BOTH CONTIGUOUS' : ''));
  }
  console.log(`   exactly one pair has both caps contiguous: ${winner.join('-')}`);
  console.log('   That is a property of the face LIST, not of the sphere -- but it is the');
  console.log('   only tiebreaker there is, and a weak written reason beats a coin flip.');

  // (c) the decision doc 20 does not name: where longitude 0 runs.
  console.log('\n   (c) where longitude 0 runs -- a separate free choice');
  const NP = V0[winner[0]];
  let e1; { const t = Math.abs(NP[0]) < 0.9 ? [1,0,0] : [0,1,0];
    const d = dot(t, NP); e1 = norm(t.map((x,i) => x - NP[i]*d)); }
  let e2 = cross(NP, e1);
  // anchor the meridian on the northern ring pentagon that is nearest it
  const ring = [];
  for (let i=0;i<12;i++){
    const la = Math.asin(Math.max(-1,Math.min(1,dot(V0[i],NP))))*DEG;
    if (Math.abs(la) < 89) ring.push({ i, la, lo: Math.atan2(dot(V0[i],e2), dot(V0[i],e1))*DEG });
  }
  // Anchor on a NAMED vertex rather than whichever one an arbitrary basis put
  // first: the second vertex of face 0, which is the first ring pentagon the
  // face table mentions after the north pole. Stable, and derived from data the
  // engine already has rather than from a choice of basis.
  const anchorId = F0[0].find(v => v !== winner[0] && v !== winner[1]);
  const anchor = ring.find(o => o.i === anchorId);
  const wrap = x => ((x % 360) + 540) % 360 - 180;
  console.log(`   anchoring the prime meridian on v${anchor.i}, the second vertex of face 0`);
  console.log('   (the first ring pentagon the face table names after the north pole):');
  for (const o of ring.sort((a,b) => (+b.la.toFixed(6)) - (+a.la.toFixed(6))
                                  || wrap(a.lo-anchor.lo) - wrap(b.lo-anchor.lo)))
    console.log(`     v${String(o.i).padStart(2)}   lat ${o.la.toFixed(3).padStart(8)} deg`
      + `   lon ${wrap(o.lo - anchor.lo).toFixed(3).padStart(8)} deg`);
  const lons = ring.map(o => wrap(o.lo - anchor.lo));
  const round = lons.every(l => Math.abs(l - 36*Math.round(l/36)) < 1e-9);
  console.log(`   every ring longitude is an exact multiple of 36 deg: ${round}`);
  console.log('   So all twelve pentagons land on round numbers: poles at +/-90, the');
  console.log('   northern five at 0 and +/-72 and +/-144, the southern five offset by 36.');
  console.log('   Costs nothing, and makes doc 17\'s landmarks nameable and greppable.');
}

// ---- 2. how many decimal places name a cell? -------------------------------
// This is the number that decides whether the readout is usable. One degree of
// latitude is R*pi/180 metres, so the angle a cell subtends is blockSize/R.
console.log('\n2. how fine the readout has to be');
console.log('   planet            block   1 cell in degrees   decimals to resolve a cell');
for (const [name, R, D] of [
  ['doc-06 worked', 1700, 11],
  ['10 km', 10000, 13],
  ['100 km moon', 100000, 16],
  ['Earth-sized', 6371000, 22],
]){
  const block = K*R/2**D;
  const degPerCell = (block/R) * DEG;
  // the coarsest step finer than a cell: 10^-d degrees must be under one cell
  const decimals = Math.max(0, Math.ceil(-Math.log10(degPerCell)));
  console.log(`   ${name.padEnd(15)} ${block.toFixed(2).padStart(7)} m   ${degPerCell.toExponential(2).padStart(10)}`
    + `        ${decimals}`);
}
console.log('   On the worked planet a cell is 0.0337 deg across, so TWO decimal places');
console.log('   resolve 0.30 m -- finer than a 1 m cell. Earth needs five. A small planet');
console.log('   is easier to read, not harder: the same block covers more angle.');

// ---- 3. does a rounded readout actually name the right cell? ---------------
// A player reads two decimals off the HUD and types them to a friend. Does the
// friend land in the same cell?
console.log('\n3. round-tripping a rounded readout back to a cell');
{
  const D = 11, n = 1 << D;
  const bary = (A,B,C,d) => {
    const det = dot(A, cross(B,C));
    const wa = dot(d, cross(B,C))/det, wb = dot(A, cross(d,C))/det, wc = dot(A, cross(B,d))/det;
    const s = wa+wb+wc; return [wa/s, wb/s, wc/s];
  };
  const hexRound = (ka,kb,kc) => {
    let ra=Math.round(ka), rb=Math.round(kb), rc=Math.round(kc);
    const da=Math.abs(ra-ka), db=Math.abs(rb-kb), dc=Math.abs(rc-kc);
    if (da>db && da>dc) ra = n-rb-rc; else if (db>dc) rb = n-ra-rc; else rc = n-ra-rb;
    return `${ra},${rb},${rc}`;
  };
  const cellOf = d => {
    let best=0, bd=-2;
    for (let i=0;i<20;i++){ const t=dot(d,CENT[i]); if (t>bd){ bd=t; best=i; } }
    const [A,B,C] = F0[best].map(i => V0[i]);
    const w = bary(A,B,C,d);
    return best + ':' + hexRound(w[0]*n, w[1]*n, w[2]*n);
  };
  const N = V0[0], E0 = norm(cross(N, V0[1])), E1 = cross(N, E0);
  const toLL = d => [Math.asin(Math.max(-1,Math.min(1,dot(d,N))))*DEG,
                     Math.atan2(dot(d,E1), dot(d,E0))*DEG];
  const fromLL = (la,lo) => {
    const cl = Math.cos(la/DEG);
    return norm([N[0]*Math.sin(la/DEG) + (E0[0]*Math.cos(lo/DEG) + E1[0]*Math.sin(lo/DEG))*cl,
                 N[1]*Math.sin(la/DEG) + (E0[1]*Math.cos(lo/DEG) + E1[1]*Math.sin(lo/DEG))*cl,
                 N[2]*Math.sin(la/DEG) + (E0[2]*Math.cos(lo/DEG) + E1[2]*Math.sin(lo/DEG))*cl]);
  };
  let seed = 12345;
  const rnd = () => { seed = (seed*1103515245 + 12345) & 0x7fffffff; return seed/0x7fffffff; };
  const spacing = K / 2**D;                     // nominal cell spacing, radians
  console.log('   decimals   lands in the same cell   worst miss');
  for (const dp of [1,2,3,4]){
    let same = 0, tot = 20000, worst = 0;
    for (let t=0;t<tot;t++){
      const z = 2*rnd()-1, ph = 2*Math.PI*rnd(), r = Math.sqrt(1-z*z);
      const d = [r*Math.cos(ph), r*Math.sin(ph), z];
      const [la,lo] = toLL(d);
      const back = fromLL(+la.toFixed(dp), +lo.toFixed(dp));
      if (cellOf(d) === cellOf(back)) same++;
      worst = Math.max(worst, Math.acos(Math.max(-1,Math.min(1,dot(d,back)))) / spacing);
    }
    console.log(`   ${String(dp).padStart(5)}          ${(100*same/tot).toFixed(1)}%`
      + `             ${worst.toFixed(2)} cells`);
  }
  console.log('   Two decimals land in the right cell seven times in eight, and the worst');
  console.log('   case is under a cell away -- so it is always you or a neighbour. Fine for');
  console.log('   TELLING someone where you are, useless as an identity. That is the ID.');
}

// ---- 4. longitude gets cheap near the poles --------------------------------
console.log('\n4. what a degree of longitude is worth, by latitude (R = 1,700 m)');
{
  const R = 1700;
  console.log('   latitude    1 deg of longitude    cells across');
  for (const la of [0, 26.57, 45, 60, 80, 89]){
    const m = R * Math.cos(la/DEG) * Math.PI/180;
    console.log(`   ${String(la).padStart(6)} deg   ${m.toFixed(2).padStart(8)} m        ${m.toFixed(0).padStart(4)}`);
  }
  console.log('   At the two polar pentagons longitude stops meaning anything, which is');
  console.log('   exactly what every player already expects a compass to do at a pole.');
}

// ---- 5. the exact form is the ID, and it is short --------------------------
console.log('\n5. sharing an exact location');
{
  // doc 03's word: [planet 12][face 5][path 2D][corner 2][layer 11].
  // The address is 5 + 2D + 2 -- the last two bits name a corner of the
  // smallest triangle, because path digits name triangles and a cell is a
  // vertex. Earlier drafts of this section used 5 + 2D and got 27 bits at
  // D 11, which is two bits short and one character optimistic.
  const chars = b => Math.ceil(b / Math.log2(36));
  for (const D of [11, 13]){
    const addr = 5 + 2*D + 2;
    console.log(`   D=${D}: address ${addr} bits -> ${chars(addr)} chars`
      + `,  +11-bit layer ${addr+11} -> ${chars(addr+11)} chars`
      + `,  +12-bit planet ${addr+23} -> ${chars(addr+23)} chars`);
  }
  console.log('   So an exact, lossless "here" inside one world is EIGHT base-36');
  console.log('   characters, and ELEVEN if the code has to say which planet too.');
  console.log('   Either way a player can read it aloud, and it never needs a');
  console.log('   decimal point.');
}

console.log('\nverdict');
console.log('   Put the axis through an antipodal pentagon pair: both poles land on');
console.log('   protected, standable landmarks and the other ten sit on two rings at');
console.log('   +/-26.57 deg, identically in every world. WHICH pair cannot be decided on');
console.log('   merit -- all six give the same world rotated -- so decide it by the only');
console.log('   asymmetry there is and record it: axis through 0-3, north at v0, prime');
console.log('   meridian through v11. Show latitude and longitude to');
console.log('   TWO decimals plus altitude in metres -- that resolves 0.30 m on the worked');
console.log('   planet. Show it, but do not share it: the shareable form is the cell ID,');
console.log('   which is 40 bits with its layer -- eight base-36 characters, or eleven');
console.log('   if the code names the planet as well.');
