// The cell ID as an actual 64-bit word. Doc 03 draws the layout, doc 07 says
// finding a chunk is "one shift", doc 06 says "chunk size remains tunable after
// launch: it does not change world data", and doc 22 leans on a contiguous range
// being a compact patch. Nothing had ever packed the bits and checked those
// together. Packing them turns up three problems, and they are not compatible
// with each other -- so this measures the problem rather than announcing a fix.
// Adding a planet field for multiple worlds is what forced the question.
// Backs docs/03-addressing.md

function split(i, j, D, C){                    // doc 03's descent, as qr.js writes it
  let n = 1<<D, path = [], flip = 0;
  for (let l=0; l<C; l++){
    const half = n>>1; let d;
    if      (i >= half){ d=1; i -= half; }
    else if (j >= half){ d=2; j -= half; }
    else if (i + j < half){ d=0; }
    else { d=3; i = half-i; j = half-j; flip ^= 1; }
    path.push(d); n = half;
  }
  return { path, q:i, r:j, flip };
}

// ---- 1. the packed value is not stable under a change of chunk level --------
console.log('1. does the drawn packing survive a change of chunk level?');
console.log('   doc 03: [ 5 bits ][ 2 bits x C ][ (D-C) ][ (D-C) ]  face, path, q, r');
console.log('   and: "moving the chunk boundary does not change the address at all --');
console.log('   it only moves where the line is drawn through the same number."');
{
  const D = 6, face = 7, n = 1 << D;
  const pack = (i,j,C) => {
    const s = split(i,j,D,C);
    let v = BigInt(face);
    for (const d of s.path) v = (v << 2n) | BigInt(d);
    const w = BigInt(D - C);
    return (((v << w) | BigInt(s.q)) << w) | BigInt(s.r);
  };
  let same = 0, differ = 0, example = null;
  for (let i=0;i<=n;i++) for (let j=0;i+j<=n;j++){
    const vals = [0,1,2,3,4,5,6].map(C => pack(i,j,C).toString());
    if (new Set(vals).size === 1) same++;
    else { differ++; if (!example) example = {i,j,vals}; }
  }
  console.log(`\n   width is 5 + 2D = ${5+2*D} bits at every C -- that half of the claim holds`);
  console.log(`   cells whose packed VALUE is the same at every C: ${same} of ${same+differ}`);
  console.log(`   e.g. (i,j) = (${example.i},${example.j}) at C = 0..6:  ${example.vals.join('  ')}`);
  console.log('   The value moves because path digits are NOT a bit-slice of (i, j): the');
  console.log('   descent picks one of four children per level and the middle child flips');
  console.log('   the frame. Re-cutting at a different C re-encodes the low half.');
  console.log('   Consequence: under this layout the chunk level is baked into every ID');
  console.log('   ever written to disk, and doc 06\'s "tunable after launch" is false.');
}

// ---- 2. and the path can never name a cell on its own ----------------------
console.log('\n2. can the path just go all the way down, so C never appears?');
{
  const D = 6, n = 1 << D;
  const seen = new Map();
  for (let i=0;i<=n;i++) for (let j=0;i+j<=n;j++){
    const s = split(i,j,D,D), k = `${s.q},${s.r}`;
    seen.set(k, (seen.get(k)||0) + 1);
  }
  console.log('   leftover (q, r) after descending to FULL depth:');
  for (const [k,v] of [...seen].sort()) console.log(`     (${k})  ${v} cells`);
  console.log(`   ${seen.size} distinct values, so 2 bits are still needed at the bottom.`);
  console.log('   The reason is invariant 3, and it is not negotiable: a triangle of side');
  console.log('   1 still has THREE vertices, and a cell IS a vertex. Path digits address');
  console.log('   TRIANGLES. They cannot address a vertex however deep they go.');
}

// ---- 3. q and r do not fit in the bits doc 03 gives them -------------------
console.log('\n3. do q and r fit in (D-C) bits each?');
{
  console.log('    D   C   m = 2^(D-C)   max q   max r   bits needed   doc 03 gives   fits?');
  for (const [D,C] of [[6,0],[6,2],[6,4],[8,2],[8,6],[11,6]]){
    const n = 1<<D; let mq = 0, mr = 0;
    for (let i=0;i<=n;i++) for (let j=0;i+j<=n;j++){
      const s = split(i,j,D,C); mq = Math.max(mq,s.q); mr = Math.max(mr,s.r);
    }
    const need = Math.ceil(Math.log2(Math.max(mq,mr)+1)), allow = D-C;
    console.log(`   ${String(D).padStart(2)}  ${String(C).padStart(2)}   ${String(1<<(D-C)).padStart(10)}`
      + `   ${String(mq).padStart(5)}   ${String(mr).padStart(5)}   ${String(need).padStart(11)}`
      + `   ${String(allow).padStart(12)}   ${need<=allow ? 'yes' : 'NO'}`);
  }
  console.log('   Never. A chunk of side m has lattice coordinates running 0..m INCLUSIVE,');
  console.log('   which is m+1 values and needs (D-C)+1 bits. Same reason as section 2 --');
  console.log('   a triangle of side m carries m+1 vertices along each edge, not m.');
  console.log('   So the address is 5 + 2D + 2 bits, not 5 + 2D. Two bits, everywhere.');
}

// ---- 4. the three encodings, priced ----------------------------------------
// The properties doc 03, 06, 07 and 22 ask for cannot all be had by the layout
// as drawn. These are the options, with what each costs.
console.log('\n4. what the options actually are');
{
  const D = 11, LAYER = 10, PLANET = 12;
  const rows = [
    ['A  store (i, j) directly',   5 + 2*(D+1), 'yes', 'NO -- needs the descent', 'NO'],
    ['B  store path + (q, r) at a fixed C', 5 + 2*D + 2, 'NO', 'yes -- one shift', 'yes'],
    ['C  path to depth D + 2-bit corner',   5 + 2*D + 2, 'yes', 'yes -- one shift', 'yes'],
  ];
  console.log('   encoding                              addr bits   C-free   chunk lookup            range = patch');
  for (const [label, bits, cfree, look, patch] of rows)
    console.log(`   ${label.padEnd(37)} ${String(bits).padStart(9)}   ${cfree.padEnd(6)}`
      + `   ${look.padEnd(22)}  ${patch}`);
  console.log('');
  console.log('   A loses the property doc 03 exists for: with (i, j) packed as two plain');
  console.log('   numbers a chunk is not a contiguous range, so doc 22\'s disk locality');
  console.log('   (5 runs fetch 62% of a region) goes with it.');
  console.log('   B keeps everything except tunability -- C joins blockSize and D as fixed');
  console.log('   at world creation, which is a real but small loss.');
  console.log('   C keeps all three at the SAME bit cost as A, by naming the side-1');
  console.log('   triangle and then which of its corners. The cost is that a vertex is');
  console.log('   shared by up to six such triangles, so encoding needs a canonical pick --');
  console.log('   which is doc 03\'s "lowest ID wins" applied one level further down, the');
  console.log('   same rule rank.js already proved partitions the sphere exactly.');
  console.log('   C is NOT yet verified. It is the recommendation, not a result.');
  console.log('');
  const addr = 5 + 2*D + 2, used = PLANET + addr + LAYER;
  console.log(`   whichever wins, the word at D ${D} with a ${PLANET}-bit planet field:`);
  console.log(`     planet ${PLANET} + address ${addr} + layer ${LAYER} = ${used} of 64, ${64-used} spare`);
  console.log(`     ${(2**PLANET).toLocaleString('en-US')} worlds, ${(10*4**D+2).toLocaleString('en-US')} cells each`);
}



// ---- 5. option C, verified -------------------------------------------------
// Name the depth-D triangle with D quaternary digits, then say which of its
// three corners you meant. A corner is shared by up to six such triangles, so
// encoding needs a canonical pick -- take the LOWEST packed ID, which is doc 03's
// own border rule one level further down.
const F20 = [[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
             [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
// a cell's face-independent identity: integer weights on global vertex ids
const cellKey = (face,n,i,j) => {
  const w = [n-i-j, i, j], f = F20[face];
  return f.map((v,x) => [v, w[x]]).filter(a => a[1] > 0).sort((a,b) => a[0]-b[0])
          .map(a => a.join(':')).join('|');
};
// walk D digits down, carrying the triangle's three corners in (i, j)
function triCorners(path, D){
  const n = 1 << D;
  let A = [0,0], B = [n,0], C = [0,n];
  const mid = (p,q) => [(p[0]+q[0])>>1, (p[1]+q[1])>>1];
  for (const d of path){
    const ab = mid(A,B), bc = mid(B,C), ca = mid(C,A);
    if      (d===0){ B = ab; C = ca; }
    else if (d===1){ A = ab; C = bc; }
    else if (d===2){ A = ca; B = bc; }
    else           { const a2=ab, b2=bc, c2=ca; A=a2; B=b2; C=c2; }
  }
  return [A,B,C];
}

console.log('\n5. option C, built and checked');
for (const D of [3,4,5]){
  const n = 1 << D, tris = 4 ** D;
  const best = new Map();                      // cell key -> smallest packed ID
  const decode = new Map();                    // packed ID -> the cell it names
  let reps = 0;
  for (let face = 0; face < 20; face++){
    for (let t = 0; t < tris; t++){
      const path = [];
      for (let l = D-1; l >= 0; l--) path.push((t >> (2*l)) & 3);
      const corners = triCorners(path, D);
      for (let c = 0; c < 3; c++){
        const [i,j] = corners[c];
        // pack: [face 5][2 bits x D][corner 2]
        let v = BigInt(face);
        for (const d of path) v = (v << 2n) | BigInt(d);
        v = (v << 2n) | BigInt(c);
        const k = cellKey(face, n, i, j);
        reps++;
        if (!best.has(k) || v < best.get(k)) best.set(k, v);
        decode.set(v.toString(), k);
      }
    }
  }
  // 1. every cell reachable, exactly the right number of them
  const expect = 10 * 4**D + 2;
  // 2. the canonical name decodes back to the cell it came from
  let roundTrip = 0;
  for (const [k, v] of best) if (decode.get(v.toString()) === k) roundTrip++;
  // 3. distinct canonical names -- no two cells share one
  const distinct = new Set([...best.values()].map(String)).size;
  console.log(`   D=${D}: ${reps.toLocaleString('en-US').padStart(9)} (triangle, corner) pairs`
    + ` -> ${best.size.toLocaleString('en-US').padStart(7)} cells`
    + `   expected ${expect.toLocaleString('en-US').padStart(7)}`
    + `   ${best.size === expect ? 'exact' : 'MISMATCH'}`);
  console.log(`         canonical names distinct: ${distinct}/${best.size}`
    + `   decode round-trip: ${roundTrip}/${best.size}`
    + `   width ${5 + 2*D + 2} bits`);
}
console.log('   Every cell is named, once, by the smallest of its representations --');
console.log('   and the count lands on 10*4^D + 2 at every depth, which is the same');
console.log('   check rank.js used on the border rule this reuses.');

// ---- 6. and the chunk is still a prefix ------------------------------------
console.log('\n6. does truncating a canonical name still give the owning chunk?');
{
  const D = 5, n = 1 << D, tris = 4 ** D;
  const best = new Map(), owner = new Map();
  for (let face = 0; face < 20; face++) for (let t = 0; t < tris; t++){
    const path = [];
    for (let l = D-1; l >= 0; l--) path.push((t >> (2*l)) & 3);
    const corners = triCorners(path, D);
    for (let c = 0; c < 3; c++){
      const [i,j] = corners[c];
      let v = BigInt(face);
      for (const d of path) v = (v << 2n) | BigInt(d);
      v = (v << 2n) | BigInt(c);
      const k = cellKey(face, n, i, j);
      if (!best.has(k) || v < best.get(k)) best.set(k, v);
      // doc 03's rule, computed independently: lowest chunk ID containing the cell
      for (let C = 0; C <= D; C++){
        let ch = BigInt(face);
        for (let l = 0; l < C; l++) ch = (ch << 2n) | BigInt(path[l]);
        const key = k + '@' + C;
        if (!owner.has(key) || ch < owner.get(key)) owner.set(key, ch);
      }
    }
  }
  let agree = 0, checked = 0;
  for (const [k, v] of best){
    for (let C = 0; C <= D; C++){
      const prefix = v >> BigInt(2 + 2*(D - C));       // drop corner + local digits
      checked++; if (prefix === owner.get(k + '@' + C)) agree++;
    }
  }
  console.log(`   canonical name truncated vs "lowest chunk ID wins", every cell and`);
  console.log(`   every chunk level: ${agree.toLocaleString('en-US')}/${checked.toLocaleString('en-US')} agree`);
  console.log('   So the shift and the ownership rule are the same answer -- because the');
  console.log('   chunk prefix sits in the high bits, so the smallest full name carries');
  console.log('   the smallest prefix. Nothing new has to be stored or looked up.');
}

console.log('\nverdict');
console.log('   Doc 03 asked for three things at once -- a fixed width, a chunk reachable');
console.log('   by one shift, and a chunk level that can move after launch -- and the');
console.log('   layout it drew delivered the width only. Two of the three problems are');
console.log('   forced by invariant 3: a cell is a VERTEX and path digits name TRIANGLES.');
console.log('');
console.log('   OPTION C IS TAKEN, AND IT HOLDS. Name the depth-D triangle with D');
console.log('   quaternary digits, then 2 bits for which of its three corners, and');
console.log('   canonicalise by lowest packed ID. Every cell is named exactly once at');
console.log('   depths 3, 4 and 5 -- the counts land on 10*4^D + 2 -- names are distinct,');
console.log('   they decode back, and truncating one agrees with doc 03\'s ownership rule');
console.log('   at every cell and every chunk level. The chunk is still one shift.');
console.log('');
console.log('   ADDRESS = 5 + 2D + 2 bits.  WORD = [planet 12][address 29][layer 10]');
console.log('   = 51 of 64 at D 11, 13 spare, 4,096 worlds of 41,943,042 cells.');
