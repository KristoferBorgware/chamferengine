// What a block actually IS, as bits. Doc 03 reserves "16 bits of block state,
// or 12 bits of type plus 4 of rotation"; doc 19 spends 3 of the 4; doc 07 names
// a palette and a side table; doc 12 defines the delta store as cellID -> block
// state. Nobody has ever said what those 12 bits mean, how a type gets its
// number, or what happens when the list of types changes between versions.
// This sizes all of it -- and kills the obvious answer to the numbering question.
// Backs docs/27-block-state.md
const TYPE = 12, ROT = 4, STATE = TYPE + ROT;

console.log('1. what the fields buy');
{
  console.log(`   type     ${TYPE} bits -> ${(2**TYPE).toLocaleString('en-US')} block types`);
  console.log(`   rotation ${ROT} bits -> ${2**ROT} variants of each`);
  console.log(`   together ${STATE} bits -> ${(2**STATE).toLocaleString('en-US')} distinct block states`);
  console.log(`   doc 19 uses 3 of the ${ROT} rotation bits for 6 directions, so one bit`);
  console.log('   is spare -- doc 19 suggests a flag such as powered or reversed.');
  console.log('   For scale: Minecraft ships on the order of a thousand block types, so');
  console.log(`   ${(2**TYPE).toLocaleString('en-US')} is about four times a full game -- comfortable, not unlimited.`);
}

// ---- 2. the obvious numbering scheme does not work -------------------------
// Tempting: give every block a stable NAME and hash it into the type field, so
// two builds always agree without keeping a list. The birthday problem kills it.
console.log('\n2. can a type number just be a hash of the block\'s name?');
{
  const slots = 2 ** TYPE;
  console.log(`   ${slots.toLocaleString('en-US')} slots. Chance that some two names collide:`);
  console.log('     block types   collision chance');
  for (const n of [50, 100, 200, 500, 1000]){
    const p = 1 - Math.exp(-n*(n-1)/(2*slots));
    console.log(`     ${String(n).padStart(11)}   ${(100*p).toFixed(1).padStart(6)}%`);
  }
  const half = Math.round(Math.sqrt(2*slots*Math.log(2)));
  console.log(`   Even odds at about ${half} types -- long before a real game.`);
  console.log('   A collision is not a glitch, it is two different blocks sharing a');
  console.log('   number, so every save containing both is unreadable. Hashing is out.');
  console.log('   Widening the field does not rescue it either:');
  for (const bits of [16, 20, 24, 32]){
    const s = 2**bits, n = 1000;
    console.log(`     ${String(bits).padStart(2)}-bit hash, 1,000 types: `
      + `${(100*(1 - Math.exp(-n*(n-1)/(2*s)))).toFixed(2).padStart(6)}% chance of collision`);
  }
  console.log('   You would need a 32-bit field to make it merely unlikely, and');
  console.log('   "unlikely" is the wrong standard for something that corrupts a save.');
}

// ---- 3. so the save carries a registry -------------------------------------
console.log('\n3. the registry: a list of names, and the index is the number');
{
  const avg = 24;                              // bytes for a name like "chamfer:oak_stairs"
  console.log('   world file header holds the block names in order. The stored number is');
  console.log('   the position in that list. New blocks APPEND; removed blocks leave a');
  console.log('   tombstone so no number is ever reused.');
  console.log('   types    registry size at ~24 bytes a name');
  for (const n of [100, 500, 1000, 4096])
    console.log(`   ${String(n).padStart(5)}    ${((n*avg)/1024).toFixed(1).padStart(6)} KB`);
  console.log('   Even a full registry is under 100 KB -- next to nothing beside a save,');
  console.log('   and it makes the numbering exact instead of probabilistic.');
  console.log('   It also makes the save self-describing: a file from an older build');
  console.log('   still says what its own numbers meant.');
}

// ---- 4. the palette, in a loaded chunk -------------------------------------
// Doc 07 stores a chunk as a palette plus packed indices, not as full block
// states. The width is decided by how many DISTINCT states that chunk contains.
console.log('\n4. inside a loaded chunk: palette width against distinct states');
{
  const SLOTS = 561, LAYERS = 64, cells = SLOTS * LAYERS;
  console.log(`   a chunk at D 11 / C 6 is ${SLOTS} slots x ${LAYERS} layers`
    + ` = ${cells.toLocaleString('en-US')} cells`);
  console.log('   distinct states   bits/cell   chunk size   vs a flat 16-bit field');
  const flat = cells * STATE / 8;
  for (const d of [2, 4, 8, 16, 64, 256, 4096]){
    const bits = Math.max(1, Math.ceil(Math.log2(d)));
    const bytes = cells * bits / 8;
    console.log(`   ${String(d).padStart(15)}   ${String(bits).padStart(9)}`
      + `   ${(bytes/1024).toFixed(1).padStart(8)} KB`
      + `   ${(100*bytes/flat).toFixed(1).padStart(6)}%`);
  }
  console.log(`   flat 16-bit would be ${(flat/1024).toFixed(1)} KB. Doc 07 says most chunks hold`);
  console.log('   three or four states, which is 2 bits and 8.8 KB -- 12.5% of flat.');
  console.log('   The palette is per chunk, so a chunk full of one material costs 1 bit');
  console.log('   a cell however many types the world defines.');
}

// ---- 5. the edit record, and how a save grows ------------------------------
console.log('\n5. on disk: one edit, and a million of them');
{
  const D = 11, addr = 5 + 2*D + 2, LAYER = 10;
  const rec = addr + LAYER + STATE;            // planet is implied by the file
  console.log(`   [ address ${addr} ][ layer ${LAYER} ][ block state ${STATE} ] = ${rec} bits`
    + ` = ${64 - rec} spare in a 64-bit word`);
  console.log('   the planet is NOT in the record: the file already belongs to one planet,');
  console.log('   the same reason doc 07 keeps no cell IDs inside a chunk.');
  console.log('   edits        raw size at 8 bytes each');
  for (const n of [1e3, 1e5, 1e6, 1e7])
    console.log(`   ${n.toExponential(0).padStart(6)}       ${(n*8/1048576).toFixed(1).padStart(8)} MB`);
  console.log('   A player who places ten million blocks costs 76 MB before any');
  console.log('   compression, and runs of identical edits compress hard. The delta');
  console.log('   store is the only thing that grows (doc 07) and it grows slowly.');
  console.log(`   The ${64 - rec} spare bits are room to widen block state later without`);
  console.log('   changing the record size -- which is what a version field is for.');
}

// ---- 6. fixed split, or a flat state index? --------------------------------
console.log('\n6. the one real choice: is rotation a FIELD or part of the number?');
{
  console.log('   (i) FIXED SPLIT -- 12 type + 4 rotation, as doc 03 drew it.');
  console.log('       Reading a rotation is a mask. Doc 19 wants exactly that: rails and');
  console.log('       conveyors read their neighbours\' facings constantly.');
  console.log(`       Costs: at most ${2**ROT} variants per type. A block needing more must`);
  console.log('       spend extra type slots.');
  console.log('   (ii) FLAT INDEX -- 16 bits is one number into a table of every state.');
  console.log('       Unlimited variants per type. Reading a rotation becomes a lookup in');
  console.log(`       a ${(2**STATE * 2 / 1024).toFixed(0)} KB table -- cache-resident, but a lookup rather than a mask.`);
  console.log('');
  console.log('   How many type slots does the fixed split actually burn? A stair-like');
  console.log('   block with 4 facings x 2 halves x 5 join shapes is 40 states:');
  const heavy = 40;
  console.log(`     ${heavy} states / ${2**ROT} per type = ${Math.ceil(heavy/2**ROT)} type slots each.`);
  for (const mats of [10, 30, 60])
    console.log(`     ${String(mats).padStart(2)} such materials -> ${mats*Math.ceil(heavy/2**ROT)} of ${(2**TYPE).toLocaleString('en-US')} slots`
      + ` = ${(100*mats*Math.ceil(heavy/2**ROT)/2**TYPE).toFixed(1)}%`);
  console.log('   Even sixty stair-like materials spend under 5% of the type space, so');
  console.log('   the fixed split is not the constraint it looks like.');
  console.log('   RECOMMENDATION: the fixed split. It keeps doc 19\'s rotation a mask,');
  console.log('   which is the one read that happens per block per frame.');
}

console.log('\nverdict');
console.log('   16 bits of block state: 12 type + 4 rotation, 4,096 types and 16');
console.log('   variants each. Type numbers come from a REGISTRY stored in the save --');
console.log('   a list of names, index is the number, append only, never reuse a slot.');
console.log('   Hashing names into the field is out: it is even odds on a collision by');
console.log('   75 types, and a collision corrupts every save holding both blocks.');
console.log('   A loaded chunk still stores a per-chunk palette, so the common case is');
console.log('   2 bits a cell. One edit is 55 of 64 bits with 9 spare to grow into.');
