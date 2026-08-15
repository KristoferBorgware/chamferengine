// rank(q, r) -- doc 07 gives a chunk's storage layout as
//   index = rank(q, r) * layerCount + layer
// and that is the only time rank appears in the specification. It is never
// defined, and it is not a plain triangular number, because doc 03's border rule
// (the lowest chunk ID wins) means a chunk owns some of the cells on its own
// edges and not others. So two questions wear one name: how many cells does a
// chunk hold, and which slot does a given (q, r) sit in. This answers both, and
// prices the only real choice between them.
// Backs docs/07-data-structures.md
const F = [[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
           [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];

// doc 03's descent, exactly as verification/qr.js writes it
function join(path, q, r, D){
  let n = 1 << (D - path.length), i = q, j = r;
  for (let l = path.length-1; l >= 0; l--){
    const d = path[l];
    if      (d===1) i += n;
    else if (d===2) j += n;
    else if (d===3){ i = n - i; j = n - j; }
    n <<= 1;
  }
  return [i,j];
}
// a cell's face-independent identity: integer barycentric weights on global
// icosahedron vertices (see verification/neighbour.js)
const key = (face,n,i,j) => {
  const w = [n-i-j, i, j], f = F[face];
  return f.map((v,x) => [v, w[x]]).filter(a => a[1] > 0).sort((a,b) => a[0]-b[0])
          .map(a => a.join(':')).join('|');
};

// ---- 1. how big is a chunk, before ownership -------------------------------
console.log('1. the chunk triangle, before anyone owns anything');
{
  console.log('   a chunk at chunk level C on a world of depth D is a triangle of side');
  console.log('   m = 2^(D-C), holding (m+1)(m+2)/2 lattice points.');
  console.log('   D   C    m    points   on the border   interior');
  for (const [D,C] of [[11,4],[11,6],[11,8],[6,2],[5,2]]){
    const m = 1 << (D-C), pts = (m+1)*(m+2)/2, border = 3*m, inner = (m-1)*(m-2)/2;
    console.log(`   ${String(D).padStart(2)}  ${String(C).padStart(2)}  ${String(m).padStart(4)}`
      + `  ${String(pts).padStart(8)}   ${String(border).padStart(6)}`
      + ` = ${(100*border/pts).toFixed(1).padStart(4)}%  ${String(inner).padStart(8)}`);
  }
  console.log('   The 561 at D 11 / C 6 is the same number doc 14 counts columns with.');
  console.log('   17.1% of a chunk sits on its own border, which is what the rule below');
  console.log('   is deciding the fate of -- not a rounding error. And note the C = 8');
  console.log('   row: cut the chunk small enough and it is more border than interior,');
  console.log('   which is a reason to keep C well below D quite apart from file count.');
}

// ---- 2. the ownership rule, applied to a whole planet ----------------------
// Doc 03: a cell on a chunk border belongs to two or three chunks at once, and
// the LOWEST CHUNK ID WINS. Nothing has ever checked that this partitions the
// sphere, which is the property the whole storage model rests on.
console.log('\n2. lowest chunk ID wins -- does it actually partition the planet?');
const shapes = [];
for (const [D,C] of [[4,1],[5,2],[6,2],[6,3]]){
  const n = 1 << D, m = 1 << (D-C), nch = 4**C;
  const owner = new Map();                       // cell key -> lowest chunk id
  const cellsOf = new Map();                     // chunk id -> [cell keys]
  let outOfRange = 0;
  for (let face = 0; face < 20; face++){
    for (let c = 0; c < nch; c++){
      const path = [];
      for (let l = C-1; l >= 0; l--) path.push((c >> (2*l)) & 3);
      const id = face * nch + c;
      const mine = [];
      for (let q = 0; q <= m; q++) for (let r = 0; q+r <= m; r++){
        const [i,j] = join(path, q, r, D);
        if (i < 0 || j < 0 || i+j > n){ outOfRange++; continue; }
        const k = key(face, n, i, j);
        mine.push(k);
        if (!owner.has(k) || id < owner.get(k)) owner.set(k, id);
      }
      cellsOf.set(id, mine);
    }
  }
  let owned = 0;
  const per = new Map();
  for (const [id, list] of cellsOf){
    const c = list.filter(k => owner.get(k) === id).length;
    owned += c; per.set(id, c);
  }
  const expect = 10 * 4**D + 2;
  const counts = [...per.values()];
  const full = (m+1)*(m+2)/2, inner = (m-1)*(m-2)/2;
  shapes.push({D,C,m,counts,full,inner});
  console.log(`   D=${D} C=${C} m=${m}:  ${owned.toLocaleString('en-US')} cells owned`
    + `  ·  N(L) = ${expect.toLocaleString('en-US')}`
    + `  ·  ${owned === expect ? 'exact partition' : 'MISMATCH'}`
    + (outOfRange ? `  ·  ${outOfRange} out of range` : ''));
}
console.log('   Every cell owned exactly once, on four different cuts. The rule works,');
console.log('   and this is the first time anything has checked it.');

// ---- 3. so a chunk's cell count is not one number --------------------------
console.log('\n3. what a chunk actually holds, and why it varies');
{
  const s = shapes[2];                            // D=6 C=2, m=16
  const counts = s.counts.slice().sort((a,b)=>a-b);
  const uniq = [...new Set(counts)].sort((a,b)=>a-b);
  const mean = counts.reduce((a,b)=>a+b,0)/counts.length;
  console.log(`   D=${s.D} C=${s.C}, m=${s.m}: full triangle ${s.full}, interior ${s.inner}`);
  console.log(`   owned per chunk: min ${counts[0]}, max ${counts[counts.length-1]},`
    + ` mean ${mean.toFixed(1)}, ${uniq.length} distinct values`);
  console.log(`   the values: ${uniq.join(' ')}`);
  console.log('   They are exactly interior + e*(m-1) + c, for e owned edges (0..3) and');
  console.log('   c owned corners -- an edge is won or lost whole, because every cell');
  console.log('   along it is shared with the same one neighbour.');
  const hist = new Map();
  for (const c of counts) hist.set(c, (hist.get(c)||0)+1);
  console.log('   how many chunks hold each count:');
  for (const v of uniq) console.log(`     ${String(v).padStart(4)} cells  ${hist.get(v)} chunks`);
}

// ---- 4. the choice, priced -------------------------------------------------
console.log('\n4. two ranks, and what the difference costs');
{
  console.log('   (A) rank the WHOLE triangle and let unowned border slots go unused:');
  console.log('         rank(q, r) = q + r*(2m + 3 - r)/2        0 <= q+r <= m');
  console.log('       one multiply, one shift, no ownership knowledge, and the stride');
  console.log('       (m+1)(m+2)/2 is the same for every chunk on the planet.');
  console.log('   (B) rank only the cells this chunk owns: dense, but the array length');
  console.log('       and the rank function both depend on which of 3 edges and 3');
  console.log('       corners it won -- 64 variants, and a per-chunk header to say which.');
  // check (A) is a bijection onto 0..full-1
  for (const s of shapes){
    const m = s.m, seen = new Set();
    for (let q = 0; q <= m; q++) for (let r = 0; q+r <= m; r++) seen.add(q + r*(2*m+3-r)/2);
    const ok = seen.size === s.full && Math.min(...seen) === 0 && Math.max(...seen) === s.full-1;
    if (!ok){ console.log(`   rank(A) is NOT a bijection at m=${m}`); }
  }
  console.log('   rank(A) checked as a bijection onto 0..(m+1)(m+2)/2-1 at every m above.');
  console.log('');
  console.log('   And what (A) wastes needs no extrapolating, because the mean is forced:');
  console.log('   every cell is owned once (section 2), so the mean owned per chunk is');
  console.log('   just N(D) / chunks = (10*4^D + 2) / (20*4^C), which is m^2/2. Subtract');
  console.log('   that from the full triangle and the waste is exactly (3m + 2)/2 slots.');
  console.log('   D   C    m   full   mean owned   wasted   (3m+2)/2   waste');
  for (const s of shapes){
    const mean = s.counts.reduce((a,b)=>a+b,0)/s.counts.length;
    console.log(`   ${String(s.D).padStart(2)}  ${String(s.C).padStart(2)}  ${String(s.m).padStart(4)}`
      + `  ${String(s.full).padStart(5)}   ${mean.toFixed(1).padStart(10)}`
      + `   ${(s.full-mean).toFixed(1).padStart(6)}`
      + `   ${String((3*s.m+2)/2).padStart(8)}`
      + `   ${(100*(s.full-mean)/s.full).toFixed(1).padStart(5)}%`);
  }
  console.log('   The closed form matches the measurement at every cut, so the worked');
  console.log('   planet is arithmetic rather than a guess:');
  {
    const m = 32, full = (m+1)*(m+2)/2, waste = (3*m+2)/2, layers = 64;
    console.log(`     D 11 / C 6, m = ${m}:  ${full} slots, ${m*m/2} owned, ${waste} wasted`
      + ` = ${(100*waste/full).toFixed(1)}%`);
    console.log(`     at doc 07's 2-bit palette and ${layers} layers that is`
      + ` ${(full*layers*2/8).toLocaleString('en-US')} bytes a chunk,`
      + ` of which ${(waste*layers*2/8).toLocaleString('en-US')} are never used.`);
  }
}

// ---- 5. the recommendation -------------------------------------------------
console.log('\n5. recommendation');
console.log('   Take (A). Two reasons, and neither is the byte count.');
console.log('   Doc 07 states the layout as index = rank(q,r) * layerCount + layer, one');
console.log('   sentence with no per-chunk case in it. (A) keeps that sentence true for');
console.log('   every chunk on the planet; (B) makes it 64 sentences and puts a header');
console.log('   in front of an array that doc 07 designed to have no header at all.');
console.log('   And doc 03\'s rule is about AUTHORITY, not about slots: a border cell has');
console.log('   exactly one home, so the unowned slot is never written and never read.');
console.log('   Leave it as the hole it is, and spend nothing to close it.');

console.log('\nverdict');
console.log('   rank(q, r) = q + r*(2m + 3 - r)/2, over the whole triangle, m = 2^(D-C).');
console.log('   A chunk is (m+1)(m+2)/2 slots -- 561 at D 11 / C 6 -- the same for every');
console.log('   chunk, of which it OWNS interior + e*(m-1) + c. Lowest chunk ID wins is');
console.log('   an exact partition of the planet, checked on four cuts. The unowned');
console.log('   slots are exactly (3m+2)/2 -- 49 of 561, 8.7%, 784 bytes a chunk -- and');
console.log('   buying them back costs the uniform stride that made the layout worth');
console.log('   having.');
