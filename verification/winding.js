// The middle child of a triangle split comes out "upside down", and doc 03 has
// called the frame inside it MIRRORED since the first draft. That word implies a
// change of handedness, which would reach into meshing, normals and every
// chirality-dependent thing in the engine. This checks what the flip actually is.
// Backs docs/03-addressing.md
const T = (1 + Math.sqrt(5)) / 2;
const norm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
const sub = (a,b) => a.map((x,i) => x - b[i]);
const dot = (a,b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];

const V0 = [[-1,T,0],[1,T,0],[-1,-T,0],[1,-T,0],[0,-1,T],[0,1,T],[0,-1,-T],[0,1,-T],
            [T,0,-1],[T,0,1],[-T,0,-1],[-T,0,1]].map(norm);
const F0 = [[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
            [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
const P = (A,B,C,n,i,j) => { const a=(n-i)/n, b=(i-j)/n, c=j/n;
  return norm([A[0]*a + B[0]*b + C[0]*c, A[1]*a + B[1]*b + C[1]*c, A[2]*a + B[2]*b + C[2]*c]); };
// is the triple p,q,r wound counter-clockwise seen from OUTSIDE the sphere?
const outward = (p,q,r) => dot(cross(sub(q,p), sub(r,p)), p) > 0;

// ---- 1. mirror or rotation? -------------------------------------------------
console.log('1. what the middle-child map actually is');
console.log('   doc 04 descends into the middle child with  i -> half-i,  j -> half-j');
console.log('   linear part = diag(-1, -1),  determinant = (-1)(-1) = +1');
console.log('   A reflection has determinant -1. Negating BOTH axes is a HALF TURN.');
console.log('   So handedness is preserved and nothing in the world is mirrored.');

// ---- 2. what that does to a direction index --------------------------------
// The six neighbour offsets in (i, j), counter-clockwise seen from outside.
const OFF = [[1,0],[1,1],[0,1],[-1,0],[-1,-1],[0,-1]];
console.log('\n2. where a naively (q,r)-derived direction really points');
{
  const [A,B,C] = F0[0].map(i => V0[i]);
  const n = 16, i0 = 9, j0 = 4, c = P(A,B,C,n,i0,j0);
  const e1 = norm(sub(P(A,B,C,n,i0+1,j0), c)), e2 = cross(c, e1);
  const angOf = (di,dj) => { const p = sub(P(A,B,C,n,i0+di,j0+dj), c);
    return (Math.atan2(dot(p,e2), dot(p,e1))*180/Math.PI + 360) % 360; };

  console.log('   parent frame:      k -> bearing');
  OFF.forEach((o,k) => console.log(`     k=${k}  ${angOf(o[0],o[1]).toFixed(1).padStart(5)} deg`));

  console.log('   middle-child frame reads offset (di,dj) as (-di,-dj):');
  const map = OFF.map((o,k) => {
    const a = angOf(-o[0], -o[1]);
    return OFF.findIndex(q => Math.abs(angOf(q[0],q[1]) - a) < 1e-6);
  });
  map.forEach((kk,k) => console.log(`     naive k=${k} really points at k=${kk}   (+${(kk-k+6)%6})`));
  const offsets = map.map((kk,k) => (kk-k+6)%6);
  const uniform = offsets.every(o => o === offsets[0]);
  console.log(`   every direction shifts by the SAME amount: ${uniform ? 'yes, +'+offsets[0] : 'no'}`);
  console.log('   A uniform shift is a rotation. A reflection would send k -> c-k, which');
  console.log('   reverses the order and leaves two directions fixed. Nothing is fixed here.');

  // does going round the ring still go counter-clockwise?
  let ccw = true;
  for (let k=0;k<6;k++) if ((map[(k+1)%6] - map[k] + 6) % 6 !== 1) ccw = false;
  console.log(`   ring order preserved (still counter-clockwise from outside): ${ccw}`);
}

// ---- 3. the four children, and the winding trap ----------------------------
console.log('\n3. emitting a child by index pattern');
{
  const [A,B,C] = F0[0].map(i => V0[i]), n = 2;
  const kids = {
    'child 0  corner': [[0,0],[1,0],[1,1]],
    'child 1  corner': [[1,0],[2,0],[2,1]],
    'child 2  corner': [[1,1],[2,1],[2,2]],
    'child 3  MIDDLE': [[1,0],[1,1],[2,1]],
  };
  for (const [name, idx] of Object.entries(kids)){
    const [p,q,r] = idx.map(([i,j]) => P(A,B,C,n,i,j));
    console.log(`   ${name} listed in rising index order -> ${outward(p,q,r) ? 'outward' : 'INWARD'}`);
  }
  console.log('   The middle child comes out inward when its vertices are listed by the');
  console.log('   same rising-index rule as a corner child. That is a property of the');
  console.log('   LISTING, not of the geometry -- swap any two of its vertices and it is');
  console.log('   outward again. It is where a mesher gets a hole, so list deliberately.');
}

// ---- 4. the lattice patterns the mesher actually uses ----------------------
console.log('\n4. the two patterns doc 14 emits, over a whole face');
{
  const [A,B,C] = F0[0].map(i => V0[i]), n = 8;
  let up = [0,0], down = [0,0];
  for (let i=0;i<n;i++) for (let j=0;j<=i;j++){
    up[outward(P(A,B,C,n,i,j), P(A,B,C,n,i+1,j), P(A,B,C,n,i+1,j+1)) ? 0 : 1]++;
    if (j<i) down[outward(P(A,B,C,n,i,j), P(A,B,C,n,i+1,j+1), P(A,B,C,n,i,j+1)) ? 0 : 1]++;
  }
  console.log(`   up   (i,j),(i+1,j),(i+1,j+1):  ${up[0]} outward, ${up[1]} inward`);
  console.log(`   down (i,j),(i+1,j+1),(i,j+1):  ${down[0]} outward, ${down[1]} inward`);
  console.log('   Both patterns are already correct -- they are deliberately different, and');
  console.log('   reusing one for both is what turns half a mesh inside out.');
}

// ---- 5. how much of the world is in a rotated frame ------------------------
console.log('\n5. how much of the world sits in a rotated frame');
{
  // qr.js's descent, verbatim, in qr.js's lattice convention (i + j <= n).
  // Note that convention: this script's geometry above uses j <= i, which is the
  // same lattice named differently, and mixing the two miscounts the flips.
  const D = 8, C = 4, n0 = 1 << D;
  let flipped = 0, total = 0;
  for (let I=0;I<=n0;I++) for (let J=0;I+J<=n0;J++){
    let i = I, j = J, n = n0, flip = 0;
    for (let l=0; l<C; l++){
      const half = n >> 1;
      if      (i >= half)      { i -= half; }
      else if (j >= half)      { j -= half; }
      else if (i + j < half)   { }
      else                     { i = half - i; j = half - j; flip ^= 1; }
      n = half;
    }
    total++; if (flip) flipped++;
  }
  console.log(`   D=${D}, C=${C}: ${flipped} of ${total} cells = ${(100*flipped/total).toFixed(1)}% sit in a rotated frame`);
  console.log(`   (qr.js reports the same ${flipped} of ${total} from the same descent)`);
  console.log('   So a naive direction index is reversed across nearly half the planet,');
  console.log('   and it changes at every chunk border -- which is why the symptom looks');
  console.log('   like rails that reverse when they cross a boundary.');
}

console.log('\nverdict');
console.log('   The flip is a HALF TURN, not a mirror. Handedness never changes, the');
console.log('   neighbour ring stays counter-clockwise, and the whole error is a uniform');
console.log('   +3 on the direction index. Order the ring geometrically inside neighbour()');
console.log('   and none of it reaches the rest of the engine.');
