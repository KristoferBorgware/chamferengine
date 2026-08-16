// What the server has to know, and what each thing it does not know costs.
//
//   node verification/authority.js
//
// Doc 29 left one question open and called it the biggest one left about the
// shape of the system: does the server generate terrain, so it can validate
// edits and simulate mobs, or does it only store and route and take the
// client's word?
//
// That question is usually argued as a binary -- "an authoritative server has
// to run the whole generator" -- and the binary is wrong. What the server needs
// depends entirely on WHICH cheat it wants to refuse, and the answers span four
// orders of magnitude. This script prices them.
//
// It also separates two things that get muddled: a cheat about the WORLD (I
// broke a block I could not reach) and a cheat about the PLAYER (I now have
// three iron). They have completely different answers, and only the first one
// is about terrain.

const CELLS_PER_CHUNK_SLOT = 561;     // doc 07, D 11 / C 6
const LAYERS = 64;                    // doc 06, crust in use
const CHUNK_CELLS = CELLS_PER_CHUNK_SLOT * LAYERS;

console.log('authority.js -- what the server must know, per cheat, and what it costs');

// ---- 1. the checks the server can already make, for nothing ----------------
// Doc 29 established that the server holds ADDRESSING (the delta store is keyed
// by cell ID and interest is a dot product against a chunk direction) and the
// DELTA STORE. Anything answerable from those two is free -- the data is
// already in hand.
console.log('\n1. what the server can already refuse, holding no terrain at all');
{
  const rows = [
    ['reach: the cell is 1 km away',         'addressing', 'ID -> position, one distance against the player position'],
    ['rate: 400 blocks in one second',       'nothing',    'a counter per player'],
    ['moving faster than a player can',      'nothing',    'positions over time; doc 22 already streams them'],
    ['editing a protected pentagon column',  'addressing', 'doc 17: is this one of the 12? a property of the address'],
    ['a cell ID that does not exist',        'addressing', 'decode and range-check'],
    ['a block type not in the registry',     'the save',   'doc 27: the registry is server-side'],
    ['an action a KNOWN cell contradicts',   'delta store','breaking a cell the store says is already air, or'],
    ['',                                     '',           'placing into one it says is solid'],
  ];
  console.log('   refused by                              needs         how');
  for (const [c, n, h] of rows)
    console.log(`   ${c.padEnd(39)} ${n.padEnd(13)} ${h}`);
  console.log('');
  console.log('   Seven checks, and the server pays NOTHING NEW for any of them: it already');
  console.log('   has addressing, positions and the delta store.');
  console.log('');
  console.log('   TWO THINGS THAT LAST ROW IS NOT. Earlier drafts of this script claimed the');
  console.log('   delta store put "the built world under authority" and called it the place');
  console.log('   where griefing happens. Both were wrong:');
  console.log('');
  console.log('     GRIEFING IS NOT CHEATING. Breaking a block someone else placed is a');
  console.log('     legal move. The server cannot tell it from ordinary mining and no');
  console.log('     amount of terrain would help -- that needs land claims or permissions,');
  console.log('     which this specification does not have and this script cannot price.');
  console.log('');
  console.log('     WHAT THE DELTA STORE ACTUALLY BUYS IS CONSISTENCY, not authority. It');
  console.log('     knows the CURRENT STATE of every cell a player has changed, so it can');
  console.log('     refuse an action that contradicts it. That catches a desynced client');
  console.log('     and a lazy cheat. It is a modest thing and worth stating modestly.');
}

// ---- 2. a point query is not a chunk generation ----------------------------
// The usual objection is "so the server has to run the generator". It does not.
// It has to answer solidity(cellID) for ONE cell, when an edit arrives, at
// human rates. That is a different order of magnitude from generating a chunk.
console.log('\n2. the blind spot costs a POINT QUERY, not a chunk');
{
  // The pinned kernel, one sample: ID -> position (blend + normalize) then the
  // height field. Same arithmetic as language.js section 1, timed here per call.
  const U32 = 4294967296, imul = Math.imul;
  function hash3(x,y,z){
    let h = (imul(x|0,374761393) + imul(y|0,668265263) + imul(z|0,1274126177)) >>> 0;
    h = (h ^ (h>>>13)) >>> 0; h = imul(h,1274126177) >>> 0;
    return ((h ^ (h>>>16)) >>> 0) / U32;
  }
  const fade = t => t*t*t*(t*(t*6-15)+10);
  function value3(px,py,pz){
    const xi=Math.floor(px), yi=Math.floor(py), zi=Math.floor(pz);
    const u=fade(px-xi), v=fade(py-yi), w=fade(pz-zi);
    let s=0;
    for(let c=0;c<8;c++){
      const dx=c&1, dy=(c>>1)&1, dz=(c>>2)&1;
      s += (dx?u:1-u)*(dy?v:1-v)*(dz?w:1-w)*hash3(xi+dx,yi+dy,zi+dz);
    }
    return s*2-1;
  }
  function fbm(x,y,z,freq,oct){
    let sum=0, amp=1, tot=0, f=freq;
    for(let o=0;o<oct;o++){ sum += amp*value3(x*f,y*f,z*f); tot += amp; amp *= 0.5; f *= 2; }
    return sum/tot;
  }
  const A=[0,1,1.618033988749895], B=[1.618033988749895,0,1], C=[1,1.618033988749895,0];
  const R = 1700;
  // solidity(cell) = is this layer below the generated height at that direction?
  function solidity(i, j, n, layer){
    const a=(n-i-j)/n, b=i/n, c=j/n;
    let px=A[0]*a+B[0]*b+C[0]*c, py=A[1]*a+B[1]*b+C[1]*c, pz=A[2]*a+B[2]*b+C[2]*c;
    const len = Math.sqrt(px*px+py*py+pz*pz);
    px=px/len*R; py=py/len*R; pz=pz/len*R;
    return (R - layer) < R + fbm(px,py,pz,0.01,6)*60;
  }
  const N = 200000, n = 2048;
  let seed = 20260815, sink = 0;
  const once = () => {
    for (let k=0;k<N;k++){
      seed = (imul(seed,1103515245) + 12345) >>> 0;
      const i = seed % (n+1), j = (seed>>>11) % (n+1-i);
      if (solidity(i, j, n, seed & 63)) sink++;
    }
  };
  once(); once();                                  // warm the JIT
  let best = Infinity;
  for (let t=0;t<5;t++){
    const t0 = process.hrtime.bigint(); once();
    best = Math.min(best, Number(process.hrtime.bigint()-t0)/1e6);
  }
  const live = best*1e6/N;                         // nanoseconds, this machine
  // The table below is quoted as a headline, so it is built from a recorded
  // cost rather than from whatever machine happens to run this. A live timing
  // would move the conclusion by a third between two runs on one laptop.
  const perQuery = 310;
  console.log(`   one solidity(cell) query: ${perQuery} ns, recorded`);
  console.log('   (doc 28 measured Rust at 1.14x C and JS at 1.75x, so read this as an');
  console.log(`    upper bound -- Rust is about ${(perQuery/1.75*1.14).toFixed(0)} ns)`);
  console.log(`   this machine, now: ${live.toFixed(0)} ns -- a timing, so it moves run to run`);
  console.log('');
  console.log('   against generating a whole chunk, which is what "the server runs the');
  console.log('   generator" is usually taken to mean:');
  console.log('');
  console.log('     unit                                 evaluations   vs one query');
  const units = [
    ['one edit, one cell', 1],
    ['a chunk, height field only (doc 14)', CELLS_PER_CHUNK_SLOT],
    ['a chunk, full crust with caves (doc 08)', CHUNK_CELLS],
  ];
  for (const [what, ev] of units)
    console.log(`     ${what.padEnd(38)} ${ev.toLocaleString('en-US').padStart(9)}   ${ev.toLocaleString('en-US').padStart(7)}x`);
  console.log('');
  // what validation actually costs at scale
  const EDITS_PER_PLAYER = 2;                      // doc 27: about twice a second
  console.log(`   and doc 27 measured a player acting on a block about ${EDITS_PER_PLAYER}x a second:`);
  console.log('');
  console.log('     players   queries/s   CPU of one core');
  for (const p of [10, 100, 1000, 10000]){
    const q = p * EDITS_PER_PLAYER;
    const frac = q * perQuery / 1e9;
    console.log(`     ${String(p).padStart(7)}   ${String(q).padStart(9)}   ${(100*frac).toFixed(4).padStart(9)}%`);
  }
  console.log('');
  console.log('   SO EDIT VALIDATION IS NOT THE EXPENSIVE THING. A thousand players cost');
  console.log('   a rounding error of one core, because a player is a slow, human-rate');
  console.log('   event source and each event needs ONE cell, not a chunk. "Does the');
  console.log('   server generate?" is not a binary: validating needs a POINT QUERY and');
  console.log('   nothing else -- no chunk, no cache, no mesh, no layers above or below.');
  console.log('');
  console.log('   AND HERE IS WHY THE VIRGIN-GROUND QUESTION IS WORTH ASKING AT ALL, which');
  console.log('   earlier drafts of this script asserted and never explained.');
  console.log('');
  console.log('   It is not mainly about legality. It is about THE DROP. Doc 08\'s generator');
  console.log('   returns a MATERIAL -- stone, dirt, grass, water -- not just solid or air.');
  console.log('   Section 4\'s rule says the client sends intents and the SERVER issues what');
  console.log('   the broken block drops. To do that the server has to know WHAT WAS THERE.');
  console.log('');
  console.log('     a cell in the delta store   the server knows the type. Free.');
  console.log('     a virgin cell               the server knows nothing -- so it must');
  console.log('                                 either ask the client, which is exactly the');
  console.log('                                 farming cheat section 4 exists to refuse,');
  console.log('                                 or generate the cell.');
  console.log('');
  console.log('   Almost every cell in a world is virgin, so without the point query the');
  console.log('   intents rule only works on ground somebody has already dug. THE POINT');
  console.log('   QUERY IS WHAT MAKES "INTENTS, NEVER OUTCOMES" IMPLEMENTABLE AT ALL.');
  console.log('   That, and not legality, is what the 0.06% is buying.');
}

// ---- 3. mobs are the expensive case, and for a different reason ------------
console.log('\n3. mobs, which is where the cost actually lands');
{
  // A mob is not a human. It does not act twice a second; it is simulated every
  // tick, and it needs terrain AROUND it rather than at one cell.
  const HZ = 20;                                   // a server tick rate
  const SPEED = 1.4, BLOCK = 1;                    // doc 27's walking mob
  const rekey = BLOCK / SPEED;
  console.log(`   a mob at ${SPEED} m/s crosses a cell every ${rekey.toFixed(2)} s`);
  console.log(`   at ${HZ} Hz that is a cell every ${Math.round(HZ*rekey)} ticks -- doc 27's number, and`);
  console.log('   the reason entities are held per chunk by containment rather than keyed');
  console.log('   by cell.');
  console.log('');
  // the working set: terrain a mob needs resident to walk and path
  console.log('   what one mob needs resident, by what it is doing:');
  const m = 32;                                    // cells across a chunk at D11/C6
  const jobs = [
    ['stand still (gravity only)',    1,            'the cell under it'],
    ['walk (collision + step up)',    7,            'its own cell and the six neighbours'],
    ['path 32 cells ahead (doc 10)',  3*32*32+3*32+1, 'a hex disc of radius 32: 3r^2+3r+1'],
  ];
  for (const [job, cells, how] of jobs)
    console.log(`     ${job.padEnd(30)} ${cells.toLocaleString('en-US').padStart(7)} cells   ${how}`);
  console.log('');
  console.log(`   A pathfinding mob touches ${(3*32*32+3*32+1).toLocaleString('en-US')} cells, and doc 16's light disc formula`);
  console.log('   is the same 3r^2+3r+1 because a hex disc is a hex disc. That is the');
  console.log('   number that decides this, not the edit rate:');
  console.log('');
  // price it against the same point-query cost section 2 measured, so the two
  // numbers are directly comparable rather than separately plausible.
  const NS = 202;                        // ns per cell, Rust, from section 2
  const disc = 3*32*32 + 3*32 + 1;
  console.log('     mobs pathing once a second   cells/s        cores, regenerating');
  for (const n of [10, 100, 1000]){
    const cells = n * disc;
    console.log(`     ${String(n).padStart(26)}   ${cells.toLocaleString('en-US').padStart(11)}`
      + `   ${(cells*NS/1e9).toFixed(2).padStart(18)}`);
  }
  console.log('');
  console.log(`   One path is ${disc.toLocaleString('en-US')} cells = ${(disc*NS/1e6).toFixed(2)} ms of generation if nothing is cached.`);
  console.log(`   A hundred mobs pathing once a second is ${(100*disc*NS/1e9*100).toFixed(0)}% of a core -- ${(100*disc/2000).toFixed(0)}x what a`);
  console.log('   thousand players cost in section 2, from a hundredth of the population.')
  console.log('');
  console.log('   A REAL IMPLEMENTATION WOULD NOT RE-GENERATE PER STEP -- it would cache the');
  console.log('   chunk, which is exactly the thing edit validation was able to avoid. So');
  console.log('   the honest statement of the trade is:');
  console.log('');
  console.log('     validating edits   -> a point query per edit, no cache, no memory');
  console.log('     simulating mobs    -> generated chunks RESIDENT on the server, plus a');
  console.log('                           tick loop, plus doc 10 pathfinding, plus entity');
  console.log('                           interest which doc 22 lists as open');
  console.log('');
  console.log(`   A chunk cached as block data is doc 07's ${(CHUNK_CELLS*2/8/1024).toFixed(1)} KB at 2 bits a cell.`);
  console.log('   Mobs are what turn the server from a store into a simulator. Edit');
  console.log('   validation, on its own, does not.');
}

// ---- 4. the other kind of cheat, and it is not about terrain ---------------
// "The client claims it farmed resources it never farmed." No amount of terrain
// on the server answers that, because the claim is not about the world.
console.log('\n4. the cheat that terrain cannot catch, and the rule that does');
{
  console.log('   Two different claims, which get muddled because both arrive as packets:');
  console.log('');
  console.log('     A WORLD claim   "I broke cell X"      -> checkable: sections 1 and 2');
  console.log('     A PLAYER claim  "I now have 3 iron"   -> NOT checkable, at any cost');
  console.log('');
  console.log('   The second cannot be validated by generating terrain, by caching chunks,');
  console.log('   or by any amount of server CPU -- because the server has no independent');
  console.log('   way to know what a player is holding. It can only know what it ISSUED.');
  console.log('');
  console.log('   So the fix is not a check. It is a rule about what the client is allowed');
  console.log('   to say:');
  console.log('');
  console.log('     THE CLIENT SENDS INTENTS, NEVER OUTCOMES.');
  console.log('       "I act on cell X"        yes -- the server validates and applies it');
  console.log('       "I now have 3 iron"      never sent, and never believed');
  console.log('');
  console.log('   Under that rule the farming cheat has nowhere to live. The sequence is:');
  console.log('     1. client: I break cell X');
  console.log('     2. server: reach ok, rate ok, not protected  (section 1, free)');
  console.log('     3. server: what was there? delta store, or one point query (section 2)');
  console.log('     4. server: that type drops that item          <- the SERVER decides');
  console.log('     5. server: your inventory is now this         <- the SERVER tells you');
  console.log('');
  console.log('   Step 4 is the whole answer, and it costs nothing: doc 27 already puts the');
  console.log('   BLOCK REGISTRY in the save, server-side, so the type -> drop table is');
  console.log('   already where it needs to be. The client never names an item at all.');
  console.log('');
  console.log('   This also settles whether the wire needs general RPC. It does not, and');
  console.log('   it must not: an RPC surface is a list of things the client may ask the');
  console.log('   server to do, and the moment one of them takes an outcome as an argument');
  console.log('   the rule above is broken. What crosses the wire is a small closed set:');
  console.log('');
  console.log('     client -> server   my position   |   I act on cell X with intent Y');
  console.log('     server -> client   these cells changed   |   your inventory is this');
  console.log('                        |   these entities are here');
  console.log('');
  console.log('   Doc 22 already named the first and third of those and said the server');
  console.log('   needs "a player position per client, and nothing else". This adds intents');
  console.log('   and inventory to that list and closes it.');
  console.log('');
  console.log('   HONEST LIMIT: none of this stops a cheat that only needs INFORMATION.');
  console.log('   Every client generates the whole planet (doc 29), so every client can');
  console.log('   already see where the ore is without digging. That is not a bug in this');
  console.log('   design, it is what "terrain is generated, not stored" means -- and it is');
  console.log('   true of every seed-based world including Minecraft. An x-ray cheat is');
  console.log('   unpreventable here BY CONSTRUCTION. What is preventable is acting on it');
  console.log('   faster than a player could, which is section 1, row 2.');
}

console.log('\nverdict');
console.log('   "Does the server generate?" is the wrong question because it has three');
console.log('   answers, not two, and they differ by four orders of magnitude.');
console.log('');
console.log('   NO GENERATION -- the server holds addressing and the delta store, which');
console.log('   doc 29 already gives it. That is enough to refuse every cheat in section');
console.log('   1: reach, rate, protected cells, malformed IDs, unknown block types, and');
console.log('   anything about a cell a player has already touched. Free.');
console.log('');
console.log('   POINT QUERIES -- one solidity(cell) per edit closes the last blind spot,');
console.log('   virgin ground. At 1,000 players it is a rounding error of one core, and');
console.log('   it needs no cache and no resident chunks. This is a cheap upgrade and');
console.log('   the design should assume it.');
console.log('');
console.log('   RESIDENT CHUNKS -- only mobs need this, and they need it continuously');
console.log('   rather than per event. That is what turns the server into a simulator,');
console.log('   and it pulls in doc 10 pathfinding and doc 22\'s open entity-interest');
console.log('   question with it. It is a real decision and it is NOT forced by wanting');
console.log('   an honest server.');
console.log('');
console.log('   And the resource-farming cheat is in none of those tiers, because it is');
console.log('   not a claim about the world. THE CLIENT SENDS INTENTS, NEVER OUTCOMES --');
console.log('   the server reads the block type it just removed and issues the drop');
console.log('   itself, from the registry doc 27 already puts in the save.');
