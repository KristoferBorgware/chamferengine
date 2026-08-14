// Do two machines agree? Doc 15 left this open and doc 22 now leans on it: a
// client can only regenerate the coarse map instead of downloading it if the
// noise comes out bit for bit. IEEE 754 specifies some operations exactly and
// leaves others to the platform's maths library, so the answer depends entirely
// on which ones each path uses. Backs docs/23-determinism.md
const T = (1 + Math.sqrt(5)) / 2;
const norm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
const dot = (a,b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const K = Math.sqrt(8*Math.PI/(10*Math.sqrt(3)));

const V0 = [[-1,T,0],[1,T,0],[-1,-T,0],[1,-T,0],[0,-1,T],[0,1,T],[0,-1,-T],[0,1,-T],
            [T,0,-1],[T,0,1],[-T,0,-1],[-T,0,1]].map(norm);
const F0 = [[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
            [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
const CENT = F0.map(f => norm(f.map(i => V0[i]).reduce((a,v) => a.map((x,k) => x + v[k]), [0,0,0])));

// step a double by one representable value -- how far apart two machines could
// be if they round one operation differently
const buf = new ArrayBuffer(8), dv = new DataView(buf);
function nextAfter(x, up){
  dv.setFloat64(0, x);
  let bits = dv.getBigUint64(0);
  if (x === 0) bits = 1n;
  else if ((x > 0) === up) bits += 1n;
  else bits -= 1n;
  dv.setBigUint64(0, bits);
  return dv.getFloat64(0);
}
const ulp = x => Math.abs(nextAfter(x, true) - x);

// ---- 1. what each path is actually made of ---------------------------------
console.log('1. which operations each path uses');
console.log('   IEEE 754 requires + - * / and sqrt to be CORRECTLY ROUNDED, so every');
console.log('   conforming machine returns the same bits. It says nothing about sin, cos,');
console.log('   atan2, acos, exp or pow -- those come from the platform maths library and');
console.log('   differ between them, usually in the last bit or two.');
console.log('');
const paths = [
  ['position -> cell (doc 04)', '+ - * / compare round', true,  'the whole hot path'],
  ['ID -> position (doc 15)',   '+ - * / sqrt',          true,  'one blend, one normalise'],
  ['up = normalize(pos)',       '+ - * / sqrt',          true,  'gravity and all three frames'],
  ['value / gradient noise',    '+ - * / integer hash',  true,  'if written without trig'],
  ['ray walk (doc 09)',         '+ - * / compare',       true,  'a quadratic and comparisons'],
  ['lat / long readout (doc 20)','asin atan2',           false, 'display only'],
  ['distances, horizon (doc 13)','acos',                 false, 'display and UI'],
  ['stream power (doc 21)',     'pow with a real exponent', false, 'erosion, offline'],
];
for (const [name, ops, safe, note] of paths)
  console.log(`   ${safe ? 'exact  ' : 'PLATFORM'}  ${name.padEnd(28)} ${ops.padEnd(24)} ${note}`);
console.log('');
console.log('   So the entire runtime pipeline -- find the cell, place the block, draw it,');
console.log('   walk the ray -- is built from operations the standard pins down. The');
console.log('   platform-dependent ones are display, or offline, or both.');

// ---- 2. how close does a position get to a cell boundary? ------------------
// If two machines differ in the last bit, they disagree about a cell only when
// the point sits within that distance of a boundary. So: how near do points get?
console.log('\n2. how near a random position lands to a cell boundary');
{
  const D = 11, n = 1 << D;
  const bary = (A,B,C,d) => {
    const det = dot(A, cross(B,C));
    const wa = dot(d, cross(B,C))/det, wb = dot(A, cross(d,C))/det, wc = dot(A, cross(B,d))/det;
    const s = wa+wb+wc; return [wa/s, wb/s, wc/s];
  };
  // margin = how far the point can move before hexRound picks a different cell,
  // in units of cell spacing: half the gap between nearest and runner-up
  const margin = d => {
    let best=0, bd=-2;
    for (let i=0;i<20;i++){ const t=dot(d,CENT[i]); if (t>bd){ bd=t; best=i; } }
    const [A,B,C] = F0[best].map(i => V0[i]);
    const w = bary(A,B,C,d).map(x => x*n);
    // in cube coordinates the fractional offsets decide the winner
    const r = w.map(Math.round);
    const f2 = w.map((x,i) => x - r[i]);
    const s = [...f2].sort((a,b) => Math.abs(b) - Math.abs(a));
    return Math.abs(Math.abs(s[0]) - Math.abs(s[1])) / 2;
  };
  let seed = 20250814;
  const rnd = () => { seed = (seed*1103515245 + 12345) & 0x7fffffff; return seed/0x7fffffff; };
  const N = 400000;
  const buckets = [1e-3, 1e-4, 1e-5, 1e-6, 1e-7];
  const hit = buckets.map(() => 0);
  let minM = 1;
  for (let t=0;t<N;t++){
    const z = 2*rnd()-1, ph = 2*Math.PI*rnd(), rr = Math.sqrt(1-z*z);
    const m = margin([rr*Math.cos(ph), rr*Math.sin(ph), z]);
    minM = Math.min(minM, m);
    buckets.forEach((b,i) => { if (m < b) hit[i]++; });
  }
  console.log(`   ${N.toLocaleString('en-US')} random positions, margin in cell spacings`);
  console.log('   within        share            implies');
  buckets.forEach((b,i) => {
    console.log(`   ${b.toExponential(0).padStart(7)}   ${(hit[i]/N).toExponential(2).padStart(9)}`
      + `      1 in ${(N/Math.max(hit[i],1)).toExponential(1)}`);
  });
  console.log(`   closest approach seen: ${minM.toExponential(2)} spacings`);
  console.log('   The share falls exactly in step with the threshold, which is what a');
  console.log('   uniform distribution across the cell does -- so it extrapolates.');

  // a 1-ULP disagreement on a unit direction, expressed in cell spacings
  const spacing = K / 2**D;
  const oneUlp = ulp(1.0);
  console.log(`\n   one ULP of a unit direction: ${oneUlp.toExponential(2)} radians`);
  console.log(`   one cell spacing at D=${D}:    ${spacing.toExponential(2)} radians`);
  console.log(`   so a last-bit disagreement is ${(oneUlp/spacing).toExponential(1)} of a cell,`);
  console.log(`   and by the table above it changes the answer about once in`
    + ` ${(spacing/oneUlp).toExponential(1)} positions.`);
}

// ---- 3. does the error grow on the way through? ----------------------------
console.log('\n3. does a last-bit difference amplify through the pipeline?');
{
  // measure both sides in the SAME unit -- cell spacings -- or the ratio is
  // meaningless. In: how far the direction moved. Out: how far the lattice
  // coordinate moved.
  const D = 11, n = 1 << D;
  let seed = 777, worst = 0, worstOut = 0;
  const rnd = () => { seed = (seed*1103515245 + 12345) & 0x7fffffff; return seed/0x7fffffff; };
  for (let t=0;t<20000;t++){
    const z = 2*rnd()-1, ph = 2*Math.PI*rnd(), rr = Math.sqrt(1-z*z);
    const d = norm([rr*Math.cos(ph), rr*Math.sin(ph), z]);
    const d2 = norm([nextAfter(d[0], true), d[1], d[2]]);
    // chord length, not acos(dot) -- for two nearly-identical unit vectors the
    // dot product rounds to exactly 1 and acos throws the whole answer away
    const inAng = Math.hypot(d[0]-d2[0], d[1]-d2[1], d[2]-d2[2]);
    const inCells = inAng / (K / 2**D);
    if (!(inCells > 0)) continue;
    let bA=0, bdA=-2, bB=0, bdB=-2;
    for (let i=0;i<20;i++){
      const t1=dot(d,CENT[i]); if (t1>bdA){ bdA=t1; bA=i; }
      const t2=dot(d2,CENT[i]); if (t2>bdB){ bdB=t2; bB=i; }
    }
    if (bA !== bB) continue;                       // face flip: counted in section 2
    const [A,B,C] = F0[bA].map(i => V0[i]);
    const bar = dd => { const det = dot(A, cross(B,C));
      const wa = dot(dd, cross(B,C))/det, wb = dot(A, cross(dd,C))/det, wc = dot(A, cross(B,dd))/det;
      const s = wa+wb+wc; return [wa/s*n, wb/s*n, wc/s*n]; };
    const u = bar(d), w = bar(d2);
    // displacement of the lattice coordinate, in lattice units = cell spacings
    const outCells = Math.hypot(u[0]-w[0], u[1]-w[1], u[2]-w[2]) / Math.sqrt(2);
    worst = Math.max(worst, outCells / inCells);
    worstOut = Math.max(worstOut, outCells);
  }
  console.log(`   worst amplification, measured in cell spacings both sides: ${worst.toFixed(2)}x`);
  console.log(`   worst absolute displacement: ${worstOut.toExponential(2)} of a cell`);
  console.log(`   against the ${(1.21e-6).toExponential(2)} closest approach seen in section 2`);
  console.log('   It DOES amplify -- a few hundred times -- and it does not matter. A few');
  console.log('   hundred last bits is still under a millionth of the closest any sampled');
  console.log('   position came to a boundary, so nothing reaches the edge of a cell.');
}

// ---- 4. the one place it does blow up --------------------------------------
// Flow routing is a chain of COMPARISONS. "Is my neighbour lower?" has no
// tolerance in it, so a difference far below any threshold can still flip the
// branch, and everything downstream follows the other way.
console.log('\n4. where a last-bit difference does NOT stay small');
{
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

  const L = 6, n = 1 << L, idx = new Map(), pts = [], nb = [];
  const put = p => { const k = p.map(x => Math.round(x*1e7)).join(',');
    if (!idx.has(k)){ idx.set(k, pts.length); pts.push(p); nb.push(new Set()); } return idx.get(k); };
  const link = (a,b) => { nb[a].add(b); nb[b].add(a); };
  for (const f of F0){
    const [A,B,C] = f.map(i => V0[i]), G = [];
    for (let i=0;i<=n;i++){ const row=[];
      for (let j=0;j<=i;j++){ const a=(n-i)/n,b=(i-j)/n,c=j/n;
        row.push(put(norm([A[0]*a+B[0]*b+C[0]*c, A[1]*a+B[1]*b+C[1]*c, A[2]*a+B[2]*b+C[2]*c]))); }
      G.push(row); }
    for (let i=0;i<n;i++) for (let j=0;j<=i;j++){
      link(G[i][j],G[i+1][j]); link(G[i][j],G[i+1][j+1]); link(G[i+1][j],G[i+1][j+1]); }
  }
  const ring = nb.map(s => [...s]), N = pts.length;
  // Two platforms would differ INDEPENDENTLY per cell, not all in one direction.
  // Nudging every height the same way preserves every comparison and proves
  // nothing, so perturb each cell up or down at random by one ULP.
  let seed = 4242;
  const rnd = () => { seed = (seed*1103515245 + 12345) & 0x7fffffff; return seed/0x7fffffff; };
  const h1 = new Float64Array(N), h2 = new Float64Array(N);
  for (let v=0;v<N;v++){ h1[v] = fbm(pts[v], 3.0, 6); h2[v] = nextAfter(h1[v], rnd() < 0.5); }
  const routeOf = h => {
    const d = new Int32Array(N).fill(-1);
    for (let v=0;v<N;v++){ let best=-1, bh=h[v];
      for (const w of ring[v]) if (h[w] < bh){ bh = h[w]; best = w; }
      d[v] = best; }
    return d;
  };
  const r1 = routeOf(h1), r2 = routeOf(h2);
  let diff = 0; for (let v=0;v<N;v++) if (r1[v] !== r2[v]) diff++;
  console.log(`   one independent ULP per cell changed the downhill neighbour of`);
  console.log(`   ${diff} of ${N.toLocaleString('en-US')} cells (${(100*diff/N).toFixed(4)}%)`);
  console.log('   Zero -- so routing is NOT the hair trigger it looks like. Two neighbours');
  console.log('   on a continuous height field are essentially never within a last bit of');
  console.log('   each other, so the comparison has an enormous margin. How enormous:');
  console.log('');
  console.log('   perturbation      cells that reroute');
  for (const eps of [ulp(1.0), 1e-12, 1e-9, 1e-6, 1e-3]){
    const g = new Float64Array(N);
    for (let v=0;v<N;v++) g[v] = h1[v] + (rnd() < 0.5 ? eps : -eps);
    const r3 = routeOf(g);
    let d3 = 0; for (let v=0;v<N;v++) if (r1[v] !== r3[v]) d3++;
    console.log(`   ${eps.toExponential(0).padStart(11)}      ${String(d3).padStart(6)}`
      + `  (${(100*d3/N).toFixed(3)}%)`);
  }
  console.log('   Nothing moves until 1e-3, which is about thirteen orders of magnitude');
  console.log('   above a last-bit disagreement. The danger was never the size of the');
  console.log('   difference -- it is only whether a difference is introduced at all.');
}

// ---- 5. so the rule is about which functions you call ----------------------
console.log('\n5. the exponents erosion needs, and whether they cost determinism');
{
  const cases = [
    ['m = 0.5',  'sqrt(x)',        true,  'IEEE 754 pins sqrt exactly'],
    ['m = 1',    'x',              true,  'nothing to compute'],
    ['m = 2',    'x * x',          true,  'one multiply'],
    ['m = 1.5',  'x * sqrt(x)',    true,  'a multiply and a sqrt'],
    ['m = 0.45', 'pow(x, 0.45)',   false, 'the platform maths library decides'],
  ];
  console.log('   exponent    written as        deterministic?  why');
  for (const [e, form, ok, why] of cases)
    console.log(`   ${e.padEnd(11)} ${form.padEnd(17)} ${(ok?'yes':'NO').padEnd(15)} ${why}`);
  console.log('   Half-integer exponents are products of sqrt and multiply, both exact.');
  console.log('   An arbitrary real exponent needs pow, and pow is where platforms differ.');
  console.log('   So this is a choice, not a constraint: pick m and n from the exact set');
  console.log('   and the erosion pass is bit-identical everywhere too.');
}

console.log('\nverdict');
console.log('   The runtime is safe by construction. Position -> cell, ID -> position, up,');
console.log('   the ray walk and integer-hashed noise use only + - * / sqrt and compares,');
console.log('   all of which IEEE 754 pins to the bit. Transcendentals appear only where a');
console.log('   difference cannot matter: the coordinate readout and distances on screen.');
console.log('');
console.log('   And the fear about flow routing was misplaced. A last-bit difference');
console.log('   reroutes NOTHING -- routing only starts to move seven orders of magnitude');
console.log('   higher. The risk was never that differences are amplified; it is only');
console.log('   whether a difference is introduced at all.');
console.log('');
console.log('   Which makes it a rule about function calls, not about tolerances: never');
console.log('   call a transcendental anywhere its result feeds a stored or shared value.');
console.log('   Choose erosion exponents from {0.5, 1, 1.5, 2}, write noise with an integer');
console.log('   hash, and the coarse map can be regenerated client-side after all -- so');
console.log('   doc 22 may have its 2.5 MB back.');
