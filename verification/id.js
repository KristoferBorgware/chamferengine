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

console.log('\nverdict');
console.log('   Doc 03 asks for three things at once -- a fixed 5 + 2D width, a chunk');
console.log('   reachable by one shift, and a chunk level that can move after launch --');
console.log('   and the layout it draws delivers the width only. Two of the three');
console.log('   problems are forced by invariant 3: a cell is a VERTEX and path digits');
console.log('   name TRIANGLES, so there are always 2 more bits at the bottom, and the');
console.log('   real address is 5 + 2D + 2. Adding a planet field is what made someone');
console.log('   pack the word and look. The choice between A, B and C is a design');
console.log('   decision, and C needs verifying before it is taken.');
