// Which curve is a cell's edge? Three definitions are in play and doc 11 has
// carried the disagreement as the last structural gap. Doc 04 defines a cell by
// what hexRound maps to it; doc 14 meshes the dual polyhedron, whose corners are
// the centroids of subdivided triangles; and "everywhere equidistant on the
// sphere" is the intuitive reading. This measures what actually separates them,
// and whether the mesh can be made to draw the lookup's curve for free.
// Backs docs/18-cell-boundary.md
const T = (1 + Math.sqrt(5)) / 2;
const norm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
const sub = (a,b) => a.map((x,i) => x - b[i]);
const add = (a,b) => a.map((x,i) => x + b[i]);
const mul = (a,s) => a.map(x => x * s);
const dot = (a,b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const len = a => Math.hypot(...a);
const ang = (a,b) => Math.acos(Math.max(-1, Math.min(1, dot(a,b))));
const K = Math.sqrt(8*Math.PI/(10*Math.sqrt(3)));       // doc 06 nominal spacing

const V0 = [[-1,T,0],[1,T,0],[-1,-T,0],[1,-T,0],[0,-1,T],[0,1,T],[0,-1,-T],[0,1,-T],
            [T,0,-1],[T,0,1],[-T,0,-1],[-T,0,1]].map(norm);
const F0 = [[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
            [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];

// THE PLANAR lattice point -- the barycentric blend BEFORE it is normalised.
// Everything in this script turns on keeping that distinction.
const P = (A,B,C,n,i,j) => { const a=(n-i)/n, b=(i-j)/n, c=j/n;
  return [A[0]*a + B[0]*b + C[0]*c, A[1]*a + B[1]*b + C[1]*c, A[2]*a + B[2]*b + C[2]*c]; };
const cen3 = (p,q,r) => mul(add(add(p,q),r), 1/3);
function circum(p,q,r){
  const a=sub(q,p), b=sub(r,p), n=cross(a,b);
  return add(p, mul(cross(sub(mul(b,dot(a,a)), mul(a,dot(b,b))), n), 1/(2*dot(n,n))));
}
function sphTri(X,Y,Z){
  const a=ang(Y,Z), b=ang(X,Z), c=ang(X,Y), s=(a+b+c)/2;
  return 4*Math.atan(Math.sqrt(Math.max(0,
    Math.tan(s/2)*Math.tan((s-a)/2)*Math.tan((s-b)/2)*Math.tan((s-c)/2))));
}
// the six triangles around an interior lattice point, as index triples
const ringOf = (i,j) => [[i,j,i+1,j,i+1,j+1],[i,j,i+1,j+1,i,j+1],[i,j,i,j+1,i-1,j],
                         [i,j,i-1,j,i-1,j-1],[i,j,i-1,j-1,i,j-1],[i,j,i,j-1,i+1,j]];

// ---- 1. the hypothesis doc 11 proposed, tested and dropped -----------------
console.log('1. was it circumcentre versus centroid?');
{
  const [A,B,C] = F0[0].map(i => V0[i]), n = 8;
  let mn = 1e9, mx = 0;
  for (let i=0;i<n;i++) for (let j=0;j<=i;j++){
    const p=P(A,B,C,n,i,j), q=P(A,B,C,n,i+1,j), r=P(A,B,C,n,i+1,j+1);
    for (const [u,v] of [[p,q],[q,r],[p,r]]){ const d=len(sub(u,v)); mn=Math.min(mn,d); mx=Math.max(mx,d); }
  }
  const p=P(A,B,C,n,3,1), q=P(A,B,C,n,4,1), r=P(A,B,C,n,4,2);
  console.log(`   planar lattice edge lengths, max/min: ${(mx/mn).toFixed(12)}`);
  console.log(`   |circumcentre - centroid| in the face plane: ${len(sub(circum(p,q,r), cen3(p,q,r))).toExponential(2)}`);
  console.log('   No. An icosahedron face is equilateral and so is the lattice inside it,');
  console.log('   so the two coincide EXACTLY. Doc 11 guessed wrong; the difference is');
  console.log('   somewhere else entirely.');
}

// ---- 2. what actually differs: the order of two operations -----------------
console.log('\n2. average-then-project, against project-then-average');
console.log('   L    cells      max gap      mean gap    (in cell spacings)   halving?');
{
  let prev = null;
  for (let L = 2; L <= 8; L++){
    const n = 1 << L, nom = K / 2**L;
    let mx = 0, sum = 0, cnt = 0;
    for (const fc of F0){
      const [A,B,C] = fc.map(i => V0[i]);
      for (let i=0;i<n;i++) for (let j=0;j<=i;j++){
        const tris = [[[i,j],[i+1,j],[i+1,j+1]]];
        if (j<i) tris.push([[i,j],[i+1,j+1],[i,j+1]]);
        for (const t of tris){
          const pl = t.map(([a,b]) => P(A,B,C,n,a,b));
          const d = ang(norm(cen3(...pl)), norm(cen3(...pl.map(norm))));
          mx = Math.max(mx, d); sum += d; cnt++;
        }
      }
      if (L >= 7) break;                       // one face is enough at high L
    }
    const r = mx/nom;
    console.log(`   ${L} ${String(10*4**L+2).padStart(9)}   ${r.toExponential(3)}   ${(sum/cnt/nom).toExponential(3)}`
      + (prev ? `        ${(r/prev).toFixed(4)}` : ''));
    prev = r;
  }
  console.log('   The lookup corner averages the FLAT lattice points and then projects.');
  console.log('   The mesh corner projects each point and then averages. That is the');
  console.log('   whole difference, and it HALVES with every level -- unlike every other');
  console.log('   discrepancy in this specification, which plateaus.');
}

// ---- 3. so how big is it where the design actually runs? -------------------
console.log('\n3. at the design level, in units a player could notice');
{
  let g = null;
  const n = 1 << 8, [A,B,C] = F0[0].map(i => V0[i]);
  let mx = 0;
  for (let i=0;i<n;i++) for (let j=0;j<=i;j++){
    const tris = [[[i,j],[i+1,j],[i+1,j+1]]];
    if (j<i) tris.push([[i,j],[i+1,j+1],[i,j+1]]);
    for (const t of tris){
      const pl = t.map(([a,b]) => P(A,B,C,n,a,b));
      mx = Math.max(mx, ang(norm(cen3(...pl)), norm(cen3(...pl.map(norm)))));
    }
  }
  g = mx / (K/2**8);
  const at11 = g / 2**3;
  console.log(`   measured at L=8:            ${g.toExponential(3)} spacings`);
  console.log(`   halving to L=11:            ${at11.toExponential(3)} spacings`);
  console.log(`   on the doc-06 planet's 1 m cells: ${(at11*1000).toFixed(3)} mm`);
  console.log('   Doc 11 recorded all three definitions as agreeing "to within about 0.1');
  console.log('   of a cell". For these two that is out by a factor of about 2,600.');
  console.log('   The 0.11 figure belongs to a different pair -- hexround.js measured it');
  console.log('   against nearest-centre-ON-THE-SPHERE, and THAT one plateaus.');
}

// ---- 4. the area a click could land in the wrong cell ----------------------
console.log('\n4. the sliver between the two outlines, as a share of one cell');
console.log('   L     cell area      sliver');
for (const L of [4,5,6,7]){
  const n = 1 << L, [A,B,C] = F0[0].map(i => V0[i]);
  const i0 = Math.floor(n*0.6), j0 = Math.floor(n*0.25);
  const ring = ringOf(i0,j0);
  const look = ring.map(r => norm(cen3(P(A,B,C,n,r[0],r[1]), P(A,B,C,n,r[2],r[3]), P(A,B,C,n,r[4],r[5]))));
  const mesh = ring.map(r => norm(cen3(norm(P(A,B,C,n,r[0],r[1])), norm(P(A,B,C,n,r[2],r[3])), norm(P(A,B,C,n,r[4],r[5])))));
  const area = Kp => { let s=0; for (let k=1;k<Kp.length-1;k++) s += sphTri(Kp[0],Kp[k],Kp[k+1]); return s; };
  let sliver = 0;
  for (let k=0;k<6;k++)
    sliver += sphTri(look[k],mesh[k],look[(k+1)%6]) + sphTri(mesh[k],mesh[(k+1)%6],look[(k+1)%6]);
  console.log(`   ${L}   ${area(look).toExponential(4)}   ${(sliver/area(look)*100).toExponential(2)}% of the cell`);
}
console.log('   Halving each level, so about 0.003% of a cell at level 11. A click that');
console.log('   lands there is a click within a twentieth of a millimetre of the edge.');

// ---- 5. the corner is a lattice point, which makes the fix free ------------
console.log('\n5. the fix: a corner is a lattice point of the same construction at 3n');
{
  const L = 5, n = 1 << L, [A,B,C] = F0[0].map(i => V0[i]);
  let worst = 0;
  for (let i=0;i<n;i++) for (let j=0;j<=i;j++){
    worst = Math.max(worst, ang(
      norm(cen3(P(A,B,C,n,i,j), P(A,B,C,n,i+1,j), P(A,B,C,n,i+1,j+1))),
      norm(P(A,B,C, 3*n, 3*i+2, 3*j+1))));
    if (j<i) worst = Math.max(worst, ang(
      norm(cen3(P(A,B,C,n,i,j), P(A,B,C,n,i+1,j+1), P(A,B,C,n,i,j+1))),
      norm(P(A,B,C, 3*n, 3*i+1, 3*j+2))));
  }
  console.log(`   worst disagreement over every triangle at L=5: ${worst.toExponential(2)} rad`);
  console.log('   up-triangle   (i,j) -> lattice point (3i+2, 3j+1) at 3n');
  console.log('   down-triangle (i,j) -> lattice point (3i+1, 3j+2) at 3n');
  console.log('   So the exact corner costs one barycentric blend and one normalise from');
  console.log('   integer indices -- the same call that produces a cell centre. Nothing');
  console.log('   about doc 14 gets more expensive, and the corner count does not move.');
}

// ---- 6. the shape the lookup actually draws --------------------------------
console.log('\n6. what the lookup cell is, in the face plane');
{
  const L = 5, n = 1 << L, [A,B,C] = F0[0].map(i => V0[i]);
  const ring = ringOf(10,4);
  const corners = ring.map(r => cen3(P(A,B,C,n,r[0],r[1]), P(A,B,C,n,r[2],r[3]), P(A,B,C,n,r[4],r[5])));
  const c = P(A,B,C,n,10,4);
  const rad = corners.map(k => len(sub(k,c)));
  const edg = corners.map((k,i) => len(sub(k, corners[(i+1)%6])));
  console.log(`   corner-to-centre: min ${Math.min(...rad).toFixed(12)}  max ${Math.max(...rad).toFixed(12)}`);
  console.log(`   edge length:      min ${Math.min(...edg).toFixed(12)}  max ${Math.max(...edg).toFixed(12)}`);
  console.log('   An EXACTLY regular hexagon. Every cell is, in its own face plane. The');
  console.log('   1.99:1 area spread doc 02 measures is entirely what projection does to');
  console.log('   it, and none of it is irregularity in the polygon.');
}

// ---- 7. convexity, and the 30 face edges -----------------------------------
console.log('\n7. two things that could have gone wrong, and did not');
{
  const L = 5, n = 1 << L, [A,B,C] = F0[0].map(i => V0[i]);
  let bad = 0, tot = 0;
  for (let i0=2;i0<n-2;i0++) for (let j0=2;j0<i0-1;j0++){
    const Kp = ringOf(i0,j0).map(r => norm(cen3(P(A,B,C,n,r[0],r[1]), P(A,B,C,n,r[2],r[3]), P(A,B,C,n,r[4],r[5]))));
    const c = norm(P(A,B,C,n,i0,j0));
    tot++;
    for (let k=0;k<6;k++)
      if (dot(cross(sub(Kp[(k+1)%6],Kp[k]), sub(Kp[(k+2)%6],Kp[(k+1)%6])), c) <= 0) bad++;
  }
  console.log(`   convexity: ${tot} interior cells, ${bad} with a reflex corner`);

  // faces 0 and 1 share the edge V0[0]-V0[5]; walk it from both sides
  const [Aa,Ab,Ac] = F0[0].map(i => V0[i]), [Ba,Bb,Bc] = F0[1].map(i => V0[i]);
  let pt = 0, cr = 0;
  for (let k=0;k<=n;k++){
    const a = P(Aa,Ab,Ac,n,k,k), b = P(Ba,Bb,Bc,n,k,0);
    pt = Math.max(pt, len(sub(norm(a), norm(b))));
    if (k<n){
      const a2 = P(Aa,Ab,Ac,n,k+1,k+1), b2 = P(Ba,Bb,Bc,n,k+1,0);
      cr = Math.max(cr, ang(norm(mul(add(a,a2),0.5)), norm(mul(add(b,b2),0.5))));
    }
  }
  console.log(`   the 30 face edges: same lattice points from both sides, worst gap ${pt.toExponential(2)}`);
  console.log(`   boundary crossing computed in each face's own plane, worst gap ${cr.toExponential(2)} rad`);
  console.log('   The per-face construction agrees with itself. There is no seam along the');
  console.log('   30 face edges -- which is where the cost was expected to turn up.');
}

console.log('\nverdict');
console.log('   The mesh and the lookup already draw the same curve to 0.04 mm at level 11,');
console.log('   and the remaining difference is one ordering of operations. Take the');
console.log('   lookup\'s: average the flat lattice points, then project. It is exact by');
console.log('   construction, it is the same cost, and it closes the gap rather than');
console.log('   measuring it.');
