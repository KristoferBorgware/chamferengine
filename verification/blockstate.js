// What a block actually IS, as bits. Doc 03 reserves "16 bits of block state,
// or 12 bits of type plus 4 of rotation"; doc 19 spends 3 of the 4; doc 07 names
// a palette and a side table; doc 12 defines the delta store as cellID -> block
// state. Nobody has ever said what those 12 bits mean, how a type gets its
// number, or what happens when the list of types changes between versions.
// This sizes all of it -- and kills the obvious answer to the numbering question.
// Backs docs/27-block-state.md
const TYPE = 12, ROT = 4, STATE = TYPE + ROT;
// Quoted from the Minecraft wiki, not measured here: 1,159 registry entries in
// Java 1.21.11, and "tens of thousands" of block states, taken as ~26,000.
const MC_TYPES = 1159, MC_STATES = 26000;

console.log('1. what the fields buy');
{
  console.log(`   type     ${TYPE} bits -> ${(2**TYPE).toLocaleString('en-US')} block types`);
  console.log(`   rotation ${ROT} bits -> ${2**ROT} variants of each`);
  console.log(`   together ${STATE} bits -> ${(2**STATE).toLocaleString('en-US')} distinct block states`);
  console.log(`   doc 19 uses 3 of the ${ROT} rotation bits for 6 directions, so one bit`);
  console.log('   is spare -- doc 19 suggests a flag such as powered or reversed.');
  // The yardstick. 1,159 is the Minecraft wiki's count of registry entries in
  // Java 1.21.11; the state total is its "tens of thousands", taken as ~26,000.
  // Neither is produced by a script here -- they are quoted, and flagged as such.
  console.log(`   For scale, Minecraft Java: ${MC_TYPES.toLocaleString('en-US')} block types in the registry, so`);
  console.log(`   ${(2**TYPE).toLocaleString('en-US')} is ${(2**TYPE/MC_TYPES).toFixed(1)}x a full game -- comfortable, not unlimited.`);
  console.log(`   But it also ships roughly ${MC_STATES.toLocaleString('en-US')} block STATES, which is`
    + ` ${(MC_STATES/MC_TYPES).toFixed(1)} per type`);
  console.log(`   on average -- ABOVE the ${2**ROT} variants a type gets here. Section 6 prices that.`);
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
  console.log('   That example is real and it is FLATTERING. Take the yardstick instead:');
  const lower = Math.ceil(MC_STATES / 2**ROT);
  console.log(`     ${MC_STATES.toLocaleString('en-US')} states over ${MC_TYPES.toLocaleString('en-US')} types needs at least`
    + ` ceil(states/${2**ROT}) = ${lower.toLocaleString('en-US')} slots,`);
  console.log(`     and every type needs one, so realistically ${lower.toLocaleString('en-US')}-${(lower+MC_TYPES).toLocaleString('en-US')}`
    + ` of ${(2**TYPE).toLocaleString('en-US')}`);
  console.log(`     = ${(100*lower/2**TYPE).toFixed(0)}%-${(100*(lower+MC_TYPES)/2**TYPE).toFixed(0)}% of the type space.`);
  console.log(`   A flat index would use ${MC_STATES.toLocaleString('en-US')} of ${(2**STATE).toLocaleString('en-US')}`
    + ` = ${(100*MC_STATES/2**STATE).toFixed(0)}%, so the split's`);
  console.log('   waste is what rounding each type up to a multiple of 16 costs.');
  console.log('   So the fixed split is NOT nearly free -- at Minecraft scale it spends');
  console.log('   about half the type space. It still fits, and the deciding argument');
  console.log('   was never the space anyway.');
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

// ---- 7. the side table -----------------------------------------------------
// Doc 03 and doc 07 both say "chests, signs, entities go in a side table keyed
// by the same cellID" and neither defines one. Sizing it turns up a sorting
// error in that sentence.
console.log('\n7. the side table, and the word in it that does not belong');
{
  // what actually needs more than 16 bits, and how much more
  const rows = [
    ['a chest, 27 slots',        27 * 4],
    ['a sign, 4 lines of text',  4 * 60],
    ['a furnace: 3 slots + progress', 3*4 + 4],
    ['a spawner',                32],
  ];
  console.log('   things that do not fit in 16 bits, and what they cost:');
  for (const [what, bytes] of rows)
    console.log(`     ${what.padEnd(32)} ~${String(bytes).padStart(4)} bytes`);
  console.log('');
  // how often does a cell have one?
  const CELLS = 561 * 64;
  console.log('   how often a cell has side data, for a heavily built chunk:');
  console.log('     containers   share of the chunk   side table size');
  for (const n of [10, 100, 1000]){
    console.log(`     ${String(n).padStart(10)}   ${(100*n/CELLS).toFixed(3).padStart(17)}%`
      + `   ${((n*120)/1024).toFixed(1).padStart(11)} KB`);
  }
  console.log(`   a chunk is ${CELLS.toLocaleString('en-US')} cells; a thousand containers in one chunk is`);
  console.log('   an absurd build and still costs 117 KB. The side table is not a');
  console.log('   scaling problem, so it should be designed for clarity, not density.');
  console.log('');
  console.log('   HOW A BLOCK KNOWS IT HAS SIDE DATA: it does not need a flag bit.');
  console.log('   The TYPE says so -- a chest always has contents, stone never does --');
  console.log('   and the registry already carries a line per type. So no bit is spent,');
  console.log('   and the spare rotation bit stays spare.');
  console.log('');
  console.log('   AND ENTITIES DO NOT BELONG IN IT. Doc 07 lists "chests, signs,');
  console.log('   entities, keyed by the same cellID". The first two are attached to a');
  console.log('   cell and stay there. An entity has a POSITION and it MOVES, so keying');
  console.log('   one by cell means rewriting its key every time it walks:');
  const HZ = 30, SPEED = 1.4, BLOCK = 1;
  console.log(`     a mob at ${SPEED} m/s over ${BLOCK} m cells changes cell every`
    + ` ${(BLOCK/SPEED).toFixed(2)} s`);
  console.log(`     at ${HZ} Hz that is a rekey every ${Math.round(HZ*BLOCK/SPEED)} frames, per entity, forever`);
  console.log('   Entities are a separate list, held per chunk by CONTAINMENT, not a');
  console.log('   map keyed by cell. That is one word out of place in doc 07 and it');
  console.log('   would have become a hash table nobody could keep still.');
}

// ---- 8. how does a cell know it has side data? -----------------------------
// Section 7 answered "the type says so". That is an answer, but it decides a
// per-BLOCK question from a per-TYPE fact, and it forbids ever putting a note
// on a stone block. Price the alternatives properly instead of asserting one.
console.log('\n8. how a cell knows it has side data: four answers, priced');
{
  const SLOTS = 561, LAYERS = 64, CELLS = SLOTS * LAYERS;
  // (a) WHO ASKS, AND HOW OFTEN. This is the whole argument, so measure it
  // before comparing storage: a question asked twice a second does not deserve
  // a data structure.
  console.log('   who asks "does this cell have side data?", and at what rate:');
  const askers = [
    ['the mesher, per cell per rebuild', 0,
     'a chest\'s MODEL is its type; the contents are not drawn'],
    ['the renderer, per cell per frame', 0,
     'never -- the palette index is the whole draw input'],
    ['lighting, ray walk, physics',      0,
     'all read solidity, which is the type'],
    ['chunk save / load',                0,
     'iterates the TABLE (1,000 entries), never the 35,904 cells'],
    ['a player opening or breaking one', 2,
     'human rates, one cell, one probe'],
  ];
  console.log('     asker                              per second   why');
  for (const [who, rate, why] of askers)
    console.log(`     ${who.padEnd(34)} ${String(rate).padStart(10)}   ${why}`);
  console.log(`   Nothing on the frame path asks. The question is asked about`);
  console.log(`   ${askers.reduce((s,a)=>s+a[1],0)} times a second, by a human, about one cell.`);
  console.log('');

  // (b) the four options
  console.log('   A  the TYPE says so          registry line per type');
  console.log('   B  a FLAG BIT in block state doc 19\'s spare rotation bit');
  console.log('   C  ASK THE TABLE             no marker anywhere; probe on demand');
  console.log('   D  a per-chunk BITMAP        one bit per cell, resident');
  console.log('');

  // B: the flag bit is free in WIDTH and not free in PALETTE. A flag is part of
  // the state value, so "stone" and "stone-with-a-note" are two palette entries.
  console.log('   B costs nothing in width -- the bit is already spare -- but a flag is');
  console.log('   part of the state VALUE, so every type that carries data splits into');
  console.log('   two palette entries. Section 4\'s typical chunk holds 3-4 states:');
  console.log('     distinct states   palette bits   chunk size   vs 4 states');
  const base = 4, baseBits = Math.ceil(Math.log2(base));
  for (const d of [4, 5, 6, 8, 9]){
    const bits = Math.ceil(Math.log2(d)), kb = CELLS * bits / 8 / 1024;
    console.log(`     ${String(d).padStart(15)}   ${String(bits).padStart(12)}`
      + `   ${kb.toFixed(1).padStart(8)} KB`
      + `   ${(100*bits/baseBits).toFixed(0).padStart(7)}%`);
  }
  console.log('   Three flagged types push 4 distinct states to 7, which crosses a power');
  console.log('   of two: 2 bits a cell becomes 3, and the chunk goes 8.8 KB -> 13.1 KB.');
  console.log(`   That is +4.4 KB resident, to shortcut a question asked twice a second.`);
  console.log('');

  // D: the bitmap, priced against the table it is meant to shortcut
  const bitmapKB = CELLS / 8 / 1024;
  console.log(`   D is one bit per cell: ${CELLS.toLocaleString('en-US')} bits`
    + ` = ${bitmapKB.toFixed(1)} KB per chunk -- and it is`);
  console.log('   the same size whether the chunk holds a thousand chests or none:');
  console.log('     entries in the chunk   table   bitmap   bitmap / table');
  for (const n of [0, 1, 10, 1000]){
    const t = n * 120 / 1024;
    console.log(`     ${String(n).padStart(20)}   ${t.toFixed(1).padStart(5)} KB`
      + `   ${bitmapKB.toFixed(1).padStart(4)} KB`
      + `   ${n === 0 ? '        infinite' : (bitmapKB/t).toFixed(1).padStart(13) + 'x'}`);
  }
  console.log('   Almost every chunk on a planet has ZERO entries -- nobody has been');
  console.log('   there -- and pays 4.4 KB anyway. Doc 22\'s player keeps hundreds of');
  console.log('   chunks resident, so D is megabytes of zeroes to shortcut a probe.');
  console.log('');

  // C: the probe, and the rule that keeps the table honest
  console.log('   C stores nothing and asks the table. One probe, at human rates. And it');
  console.log('   removes a bug class the other three have to remember not to write:');
  console.log('     place a chest, fill it, break it, put stone there.');
  console.log('     A: check the OLD type, then delete    -- two rules, one order-dependent');
  console.log('     B: clear the flag AND delete the blob -- two writes that can disagree');
  console.log('     D: clear the bit AND delete the blob  -- same, plus a resident bitmap');
  console.log('     C: delete the blob                    -- writing a block clears its');
  console.log('                                              side data. One rule, no cases.');
  console.log('   Under A a stale blob is INVISIBLE: the new type says "no side data", so');
  console.log('   nothing ever reads it, nothing ever frees it, and a chest placed there');
  console.log('   later inherits a dead player\'s inventory. That is the failure the');
  console.log('   type-gate makes possible and the probe cannot express.');
  console.log('');
  console.log('   VERDICT: C. Existence is a property of the CELL, so the table that holds');
  console.log('   the data is the thing that should answer for it. The type keeps a real');
  console.log('   job -- it says what a freshly placed block is BORN with, and what a');
  console.log('   tag MEANS -- but it no longer gates whether an entry may exist. Which');
  console.log('   is what section 7 got wrong: it decided a per-CELL question from a');
  console.log('   per-TYPE fact, and that forbids ever naming a stone block.');
  console.log('   Doc 19\'s spare rotation bit stays spare either way.');
}
