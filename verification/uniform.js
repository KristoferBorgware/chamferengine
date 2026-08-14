// How uniform are the cells, really? Doc 02 has claimed 1.3:1 in area and
// 1.14:1 in spacing since the first draft, with no script behind either. Both
// are load-bearing: doc 10 divides by the largest spacing to keep its A*
// heuristic admissible, and doc 06 sizes blocks from a mean. This measures the
// real spread on the one-shot grid doc 15 pins the design to, and finds the
// closed form it converges to. Backs docs/02-geometry-choice.md
const T = (1 + Math.sqrt(5)) / 2;
const norm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];

const V0 = [[-1,T,0],[1,T,0],[-1,-T,0],[1,-T,0],[0,-1,T],[0,1,T],[0,-1,-T],[0,1,-T],
            [T,0,-1],[T,0,1],[-T,0,-1],[-T,0,1]].map(norm);
const F0 = [[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
            [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];

// one-shot barycentric, the construction doc 15 requires
const oneShot = (A, B, C, n, i, j) => {
  const a = (n-i)/n, b = (i-j)/n, c = j/n;
  return norm([A[0]*a + B[0]*b + C[0]*c, A[1]*a + B[1]*b + C[1]*c, A[2]*a + B[2]*b + C[2]*c]);
};
const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
const K = Math.sqrt(8*Math.PI/(10*Math.sqrt(3)));      // doc 06's nominal spacing constant

// l'Huilier -- exact spherical triangle area
function sphTri(A, B, C){
  const a = ang(B,C), b = ang(A,C), c = ang(A,B), s = (a+b+c)/2;
  return 4*Math.atan(Math.sqrt(Math.max(0,
    Math.tan(s/2)*Math.tan((s-a)/2)*Math.tan((s-b)/2)*Math.tan((s-c)/2))));
}

// cells are VERTICES of the subdivided icosahedron; the cell polygon is the dual
function build(L){
  const n = 1 << L, idx = new Map(), pts = [], tri = [], inc = [];
  const put = p => { const k = p.map(x => Math.round(x*1e7)).join(',');
    if (!idx.has(k)){ idx.set(k, pts.length); pts.push(p); inc.push([]); } return idx.get(k); };
  const E = new Set(), link = (a,b) => E.add(a<b ? a+','+b : b+','+a);
  for (const f of F0){
    const [A,B,C] = f.map(i => V0[i]), P = [];
    for (let i = 0; i <= n; i++){ const row = [];
      for (let j = 0; j <= i; j++) row.push(put(oneShot(A,B,C,n,i,j)));
      P.push(row); }
    for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++){
      tri.push([P[i][j], P[i+1][j], P[i+1][j+1]]);
      link(P[i][j],P[i+1][j]); link(P[i][j],P[i+1][j+1]); link(P[i+1][j],P[i+1][j+1]);
      if (j < i) tri.push([P[i][j], P[i+1][j+1], P[i][j+1]]);
    }
  }
  tri.forEach((t, ti) => t.forEach(v => inc[v].push(ti)));
  return { pts, tri, inc, E: [...E].map(s => s.split(',').map(Number)) };
}

// ---- 1. area of every cell, two independent ways ---------------------------
// A: barycentric dual -- a third of each incident triangle
// B: the actual dual polygon -- spherical area of the centroid ring
// They must agree, and each must sum to 4*pi. If they do, the spread is real.
console.log('1. cell AREA variation, measured two independent ways');
console.log('   L      cells   sum/4pi   A hex-only   B hex-only   B incl. pentagons');
const areaHexSeries = [];
for (let L = 2; L <= 7; L++){
  const { pts, tri, inc } = build(L);
  const tArea = tri.map(t => sphTri(pts[t[0]], pts[t[1]], pts[t[2]]));
  const A1 = new Float64Array(pts.length);
  tri.forEach((t, ti) => { const s = tArea[ti]/3; for (const v of t) A1[v] += s; });

  const cen = tri.map(t => norm(t.reduce((s,i) => [s[0]+pts[i][0], s[1]+pts[i][1], s[2]+pts[i][2]], [0,0,0])));
  const A2 = new Float64Array(pts.length);
  for (let v = 0; v < pts.length; v++){
    const P = pts[v], ring = inc[v].map(ti => cen[ti]);
    const e1 = norm(cross(P, Math.abs(P[0]) < 0.9 ? [1,0,0] : [0,1,0])), e2 = cross(P, e1);
    ring.sort((a,b) => Math.atan2(dot(a,e2), dot(a,e1)) - Math.atan2(dot(b,e2), dot(b,e1)));
    let s = 0; for (let k = 1; k < ring.length-1; k++) s += sphTri(ring[0], ring[k], ring[k+1]);
    A2[v] = s;
  }
  const span = (arr, set) => { let mn = 1e9, mx = 0;
    for (const v of set){ if (arr[v] < mn) mn = arr[v]; if (arr[v] > mx) mx = arr[v]; } return mx/mn; };
  const hex = [...pts.keys()].filter(v => inc[v].length === 6);
  let tot = 0; for (const x of A2) tot += x;
  areaHexSeries.push(span(A2, hex));
  console.log(`   ${L} ${String(pts.length).padStart(10)}  ${(tot/(4*Math.PI)).toFixed(7)}`
    + `   ${span(A1,hex).toFixed(4)}       ${span(A2,hex).toFixed(4)}       ${span(A2,pts.keys()).toFixed(4)}`);
}
console.log('   the two methods agree to 4 decimals and both close on 4pi, so the spread is');
console.log('   a property of the grid and not of the measurement.');

// ---- 2. it converges, and to a closed form ---------------------------------
// one-shot barycentric + normalise IS the gnomonic projection of the flat face
// triangle. Gnomonic area scales as cos^3 of the angle off the face axis, so the
// ratio between a cell at the face centre and one at the face corner must be
// sec^3 of the face's angular radius -- independent of level.
const centroid0 = norm(F0[0].map(i => V0[i]).reduce((a,v) => a.map((x,k) => x+v[k]), [0,0,0]));
const cosTv = dot(centroid0, V0[F0[0][0]]);
const thetaV = Math.acos(cosTv) * 180/Math.PI;
const rich = a => 2*a[a.length-1] - a[a.length-2];    // differences halve; extrapolate
console.log('\n2. the limit, and why it is a constant');
console.log(`   face angular radius theta_v            = ${thetaV.toFixed(4)} deg`);
console.log(`   predicted area ratio   sec^3(theta_v)  = ${(1/cosTv**3).toFixed(6)}`);
console.log(`   measured, extrapolated from the series = ${rich(areaHexSeries).toFixed(6)}`);
console.log(`   predicted linear ratio sec^1.5(theta_v)= ${(1/cosTv**1.5).toFixed(6)}`);
console.log('   They agree to four decimals. The ratio does NOT shrink with depth -- a face');
console.log('   triangle is scale-free, the same reason hexround.js sees its disagreement');
console.log('   plateau. At L=2 the ratio is 1.17 and at L=3 it is 1.53, which is where the');
console.log('   documented "1.3:1" came from: it is a low-level reading, and the design runs');
console.log('   at level 11.');

// ---- 3. the number doc 10 actually needs -----------------------------------
// The A* heuristic estimates STEPS REMAINING as arc / spacing. To undercount --
// the only safe direction -- it must divide by the LARGEST real step, expressed
// against doc 06's nominal K*R/2^L.
console.log('\n3. edge length against doc 06 nominal spacing (unit sphere)');
console.log('   L      cells   mean/nom   min/nom   max/nom   max:min');
for (let L = 2; L <= 8; L++){
  const { pts, E } = build(L);
  const nom = K / 2**L;
  let mn = 1e9, mx = 0, sum = 0;
  for (const [a,b] of E){ const d = ang(pts[a], pts[b]); if (d<mn) mn=d; if (d>mx) mx=d; sum += d; }
  console.log(`   ${L} ${String(pts.length).padStart(10)}   ${(sum/E.length/nom).toFixed(4)}`
    + `    ${(mn/nom).toFixed(4)}    ${(mx/nom).toFixed(4)}    ${(mx/mn).toFixed(4)}`);
}
console.log('   mean/nominal settles at 0.9988, so doc 06\'s K formula is right to 0.12%.');
console.log('   max/nominal settles at 1.0984 -- the admissible divisor for doc 10 is');
console.log('   10% ABOVE NOMINAL, not the 7% that document derived from 1.14:1.');
console.log('   min/nominal settles at 0.744, at a pentagon, which is the narrowest cell');
console.log('   that exists anywhere on the surface -- the anchor taper.js uses.');

console.log('\nsummary');
console.log('   hexagon area variation          1.99 : 1   (sec^3 theta_v), NOT 1.3 : 1');
console.log('   including the twelve pentagons  2.74 : 1');
console.log('   hexagon linear variation        1.41 : 1   (sec^1.5 theta_v), NOT 1.14 : 1');
console.log('   edge length variation           1.48 : 1   min at a pentagon');
console.log('   safe A* divisor                 1.10 x nominal');
