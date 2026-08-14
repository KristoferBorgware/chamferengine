// Multiplayer interest management. Doc 11 has always called this the easy one:
// "which players care about this chunk update is an ID range comparison, and the
// addressing scheme does the work". A contiguous ID range IS one compact patch of
// surface (doc 03) -- but the question here is the CONVERSE, and the converse of
// a true statement is not free. This measures it.
// Backs docs/22-multiplayer-interest.md
const T = (1 + Math.sqrt(5)) / 2;
const norm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
const add = (a,b) => a.map((x,i) => x + b[i]);
const mul = (a,s) => a.map(x => x*s);
const dot = (a,b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const mid = (a,b) => mul(add(a,b), 0.5);

const V0 = [[-1,T,0],[1,T,0],[-1,-T,0],[1,-T,0],[0,-1,T],[0,1,T],[0,-1,-T],[0,1,-T],
            [T,0,-1],[T,0,1],[-T,0,-1],[-T,0,1]].map(norm);
const F0 = [[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
            [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];

const R = 1700, D = 11, C = 6;                    // the doc-06 worked planet
const BLOCK = Math.sqrt(8*Math.PI/(10*Math.sqrt(3))) * R / 2**D;

// ---- build every chunk: its path digits and where it sits ------------------
// children 0,1,2 are the corner children; 3 is the middle one, upside down.
function chunks(order){
  const rank = new Array(4);
  order.forEach((d,k) => rank[d] = k);           // digit -> position in the walk
  const out = [];
  const rec = (A,B,Cc, depth, idx) => {
    if (depth === C){ out.push({ idx, c: norm(add(add(A,B),Cc)) }); return; }
    const ab = mid(A,B), bc = mid(B,Cc), ca = mid(Cc,A);
    const kids = [[A,ab,ca], [ab,B,bc], [ca,bc,Cc], [ab,bc,ca]];
    for (let d=0; d<4; d++){
      const [p,q,r] = kids[d];
      rec(p, q, r, depth+1, idx*4 + rank[d]);
    }
  };
  F0.forEach((f, fi) => { const [A,B,Cc] = f.map(i => V0[i]); rec(A,B,Cc, 0, fi); });
  return out;
}

// how many maximal runs of consecutive indices does a set decompose into?
const runsOf = list => {
  list.sort((a,b) => a-b);
  let runs = 1;
  for (let i=1;i<list.length;i++) if (list[i] !== list[i-1]+1) runs++;
  return list.length ? runs : 0;
};

let seed = 987654321;
const rnd = () => { seed = (seed*1103515245 + 12345) & 0x7fffffff; return seed/0x7fffffff; };
const randomDir = () => { const z = 2*rnd()-1, ph = 2*Math.PI*rnd(), s = Math.sqrt(1-z*z);
  return [s*Math.cos(ph), s*Math.sin(ph), z]; };

console.log(`worked planet: R = ${R} m, D = ${D}, chunk level C = ${C}`);
console.log(`  ${(20*4**C).toLocaleString('en-US')} chunks, each about `
  + `${(BLOCK * 2**(D-C)).toFixed(0)} m across`);

// ---- 1. is a player's interest region one ID range? ------------------------
console.log('\n1. how many ID ranges a player\'s interest region breaks into');
{
  const list = chunks([0,3,1,2]);                // doc 03's recommended child order
  console.log('   radius      chunks in range   contiguous ID runs   chunks per run');
  for (const metres of [76, 200, 500, 1000]){
    const cosT = Math.cos(metres / R);
    let totChunks = 0, totRuns = 0, worstRuns = 0;
    const TRIALS = 60;
    for (let t=0;t<TRIALS;t++){
      const p = randomDir(), inRange = [];
      for (const ch of list) if (dot(ch.c, p) > cosT) inRange.push(ch.idx);
      const r = runsOf(inRange);
      totChunks += inRange.length; totRuns += r; worstRuns = Math.max(worstRuns, r);
    }
    console.log(`   ${String(metres).padStart(5)} m   ${(totChunks/TRIALS).toFixed(0).padStart(12)}`
      + `      ${(totRuns/TRIALS).toFixed(1).padStart(12)}`
      + `        ${(totChunks/totRuns).toFixed(2).padStart(8)}`);
  }
  console.log('   A contiguous ID range really is one compact patch of surface -- doc 03');
  console.log('   is right about that. But a DISC is not a subtree, so the converse fails:');
  console.log('   a player\'s region is not one range, it is many.');
}

// ---- 2. does the child order help? -----------------------------------------
// Doc 03 recommends [0,3,1,2] because it makes 2 of 3 steps edge-adjacent.
// order.js proved no ordering makes all 3 adjacent. Does the choice show up here?
console.log('\n2. does doc 03\'s child order reduce the fragmentation?');
{
  const cosT = Math.cos(300 / R);
  for (const [name, ord] of [['naive [0,1,2,3]', [0,1,2,3]], ['doc 03 [0,3,1,2]', [0,3,1,2]]]){
    const list = chunks(ord);
    let totRuns = 0, totChunks = 0;
    const TRIALS = 40;
    for (let t=0;t<TRIALS;t++){
      const p = randomDir(), inRange = [];
      for (const ch of list) if (dot(ch.c, p) > cosT) inRange.push(ch.idx);
      totRuns += runsOf(inRange); totChunks += inRange.length;
    }
    console.log(`   ${name.padEnd(18)} ${(totChunks/TRIALS).toFixed(0).padStart(5)} chunks`
      + ` in ${(totRuns/TRIALS).toFixed(1).padStart(6)} runs`
      + `   ${(totChunks/totRuns).toFixed(2)} chunks per run`);
  }
  console.log('   The ordering barely moves it, and that is expected: order.js showed the');
  console.log('   four children cannot be walked edge-to-edge, so the curve jumps whatever');
  console.log('   order you pick. Fragmentation is a property of the tree, not the walk.');
}

// ---- 3. so what does the obvious thing cost? -------------------------------
// Turn the question round. Instead of asking which IDs a player covers, ask each
// update which players are near it. That is one dot product per player.
console.log('\n3. the cost of not being clever: one dot product per player per update');
{
  const players = Array.from({length: 200}, () => randomDir());
  const updates = Array.from({length: 20000}, () => randomDir());
  const cosT = Math.cos(300 / R);
  const t0 = Date.now();
  let hits = 0;
  for (const u of updates) for (const p of players) if (dot(u,p) > cosT) hits++;
  const ms = Math.max(1, Date.now() - t0);
  // A wall-clock rate is machine-dependent and moves 30% between runs on one
  // machine, so report the order of magnitude it clears rather than the reading.
  const rate = updates.length*players.length/ms/1000;
  const floor = Math.pow(10, Math.floor(Math.log10(rate)));
  console.log(`   ${updates.length.toLocaleString('en-US')} updates x ${players.length} players`
    + ` = ${(updates.length*players.length/1e6).toFixed(1)}M tests, single threaded`);
  console.log(`   comfortably over ${floor}M tests per second`
    + `  (this run: ${rate.toFixed(0)}M -- a timing, so it moves run to run)`);
  console.log('   A busy server does not produce 20,000 chunk updates a second. The whole');
  console.log('   question is smaller than the machinery doc 11 imagined for it.');
}

// ---- 4. where the ID range IS the right tool --------------------------------
// Not "who cares about this update", but "what does this player need loaded".
console.log('\n4. what the ID ordering is actually good for');
{
  const list = chunks([0,3,1,2]);
  const cosT = Math.cos(300 / R);
  const p = randomDir();
  const inRange = list.filter(ch => dot(ch.c, p) > cosT).map(ch => ch.idx).sort((a,b)=>a-b);
  const runs = [];
  let start = inRange[0], prev = inRange[0];
  for (let i=1;i<inRange.length;i++){
    if (inRange[i] !== prev+1){ runs.push([start, prev]); start = inRange[i]; }
    prev = inRange[i];
  }
  runs.push([start, prev]);
  runs.sort((a,b) => (b[1]-b[0]) - (a[1]-a[0]));
  const biggest = runs.slice(0, 5).reduce((s,r) => s + (r[1]-r[0]+1), 0);
  console.log(`   one player at 300 m: ${inRange.length} chunks in ${runs.length} runs`);
  console.log(`   the 5 largest runs cover ${biggest} of them (${(100*biggest/inRange.length).toFixed(0)}%)`);
  console.log('   So a handful of range reads fetches most of what a player needs, and the');
  console.log('   tail is singletons. That is a DISK layout win -- sequential reads -- not');
  console.log('   an interest-test win.');
}

console.log('\nverdict');
console.log('   Doc 11 called this "specifying, not inventing" and it is, but not for the');
console.log('   stated reason. A contiguous ID range is one compact patch; a compact patch');
console.log('   is NOT one contiguous range, and a player\'s disc breaks into tens to');
console.log('   hundreds of runs however the children are ordered. The interest test wants');
console.log('   a dot product per player, which is free. The ID ordering earns its keep on');
console.log('   DISK, where a few long runs fetch most of a player\'s region sequentially.');
