// A chunk drawn at a coarser level of detail spaces its cells further apart and
// asks the terrain for a height at each one. The terrain answers with the value
// at that exact point, which is not the same as the average of the ground the
// cell covers -- so a coarse chunk does not draw a smoothed version of the fine
// one, it draws an arbitrary selection from it. This measures what that costs,
// what two ways of band-limiting the detail term buy, and whether the coarse
// map has the same problem once the detail term is fixed.
// Backs docs/14-meshing-and-lod.md
const T = (1 + Math.sqrt(5)) / 2;
const norm = v => { const l = Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]); return [v[0]/l, v[1]/l, v[2]/l]; };
const V0 = [[-1,T,0],[1,T,0],[-1,-T,0],[1,-T,0],[0,-1,T],[0,1,T],[0,-1,-T],[0,1,-T],
            [T,0,-1],[T,0,1],[-T,0,-1],[-T,0,1]].map(norm);
const F0 = [[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
            [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
const P = (A,B,C,n,i,j) => { const a=(n-i)/n, b=(i-j)/n, c=j/n;
  return norm([A[0]*a+B[0]*b+C[0]*c, A[1]*a+B[1]*b+C[1]*c, A[2]*a+B[2]*b+C[2]*c]); };

function hash3(x, y, z, seed){
  let h = (Math.imul(x|0, 374761393) + Math.imul(y|0, 668265263)
         + Math.imul(z|0, 1274126177) + Math.imul(seed|0, 1013904223)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0; h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const fade = t => t*t*t*(t*(t*6 - 15) + 10);
function vnoise(px, py, pz, seed){
  const xi = Math.floor(px), yi = Math.floor(py), zi = Math.floor(pz);
  const u = fade(px-xi), v = fade(py-yi), w = fade(pz-zi);
  let s = 0;
  for (let c=0;c<8;c++){
    const dx=c&1, dy=(c>>1)&1, dz=(c>>2)&1;
    s += (dx?u:1-u)*(dy?v:1-v)*(dz?w:1-w)*hash3(xi+dx, yi+dy, zi+dz, seed);
  }
  return s*2 - 1;
}
// fBm with a weight per octave. All ones is the engine's own detail term; the
// two candidates hand it a different set.
function fbmWeighted(p, freq, weights, seed){
  let sum = 0, amp = 1, total = 0, f = freq;
  for (let o = 0; o < weights.length; o++){
    sum += amp * weights[o] * vnoise(p[0]*f, p[1]*f, p[2]*f, seed);
    total += amp;
    amp *= 0.5; f *= 2;
  }
  return sum/total;
}

// ---- the worked planet, as the client ships it ------------------------------
const RADIUS = 6801, BLOCK = 1, DEPTH = 13;
const DETAIL_AMPLITUDE = 5, DETAIL_FEATURE = 112, DETAIL_OCTAVES = 4;
const DETAIL_FREQ = RADIUS/DETAIL_FEATURE;
const SEED = 12345;
const N = 1 << DEPTH;
const ONES = new Array(DETAIL_OCTAVES).fill(1);

console.log('1. which octaves a level of detail can still carry');
console.log(`   ${DETAIL_OCTAVES} octaves from a ${DETAIL_FEATURE} m feature, amplitude ${DETAIL_AMPLITUDE} m.`);
console.log('   An octave needs two cells across a feature to be drawn at all.');
console.log('');
console.log('   octave  feature   its share of the 5 m');
let share = 0, tot = 0;
for (let o = 0; o < DETAIL_OCTAVES; o++) tot += 0.5**o;
for (let o = 0; o < DETAIL_OCTAVES; o++){
  const metres = DETAIL_FEATURE / 2**o;
  const amp = DETAIL_AMPLITUDE * (0.5**o)/tot;
  console.log(`     ${o}    ${String(metres.toFixed(0)).padStart(4)} m    ${amp.toFixed(2)} m` +
    `   gone past LOD ${Math.floor(Math.log2(metres/2/BLOCK))}`);
  share += amp;
}
console.log('');
console.log('   lod  cell   octaves it can carry');
const carried = [];
for (let lod = 0; lod <= 8; lod++){
  const cell = BLOCK * 2**lod;
  let k = 0;
  for (let o = 0; o < DETAIL_OCTAVES; o++) if (DETAIL_FEATURE/2**o >= 2*cell) k++;
  carried.push(k);
  console.log(`   ${String(lod).padStart(3)}  ${String(cell).padStart(4)} m   ${k}`);
}
console.log('   The detail term has nothing left to say past LOD 5, which is where');
console.log('   section 3 picks the coarse map up.');

// ---- 2. what a coarse chunk actually draws ----------------------------------
// The honest surface for a cell is the average of the ground it covers. Point
// sampling is what the generator does today. The gap between them is the error,
// and the gap between one level and the next is what a player sees pop.
function weightsFor(lod, mode){
  const cell = BLOCK * 2**lod;
  const w = new Array(DETAIL_OCTAVES);
  for (let o = 0; o < DETAIL_OCTAVES; o++){
    const feature = DETAIL_FEATURE / 2**o;
    if (mode === 'today') w[o] = 1;
    else if (mode === 'drop') w[o] = feature >= 2*cell ? 1 : 0;
    else {
      // a smooth roll-off: full while the feature is wide against the cell,
      // nothing once it is under two cells, and a cosine-free ramp between
      const r = feature/(2*cell);
      w[o] = r >= 1 ? 1 : r <= 0.5 ? 0 : (r - 0.5)*2;
    }
  }
  return w;
}
const detail = (p, w) => DETAIL_AMPLITUDE * fbmWeighted(p, DETAIL_FREQ, w, SEED);

console.log('\n2. how far the drawn ground moves, in metres');
console.log('   Against the average of the ground a cell covers, over 190 places on');
console.log('   one face, each averaged across its own footprint.');
console.log('');
console.log('   lod   today          drop octaves   roll off');
console.log('         rms    worst   rms    worst   rms    worst');
const [A,B,C] = F0[0].map(i => V0[i]);
const err = { today: [], drop: [], ramp: [] };
for (let lod = 1; lod <= 6; lod++){
  const step = 1 << lod;
  const acc = { today: [0,0], drop: [0,0], ramp: [0,0] };
  const wToday = weightsFor(lod, 'today'), wDrop = weightsFor(lod, 'drop'), wRamp = weightsFor(lod, 'ramp');
  let used = 0;
  // a spread of coarse lattice points well inside the face, so every one has a
  // full footprint under it
  for (let a = 1; a < 20; a++) for (let b = 1; b < 20; b++){
    if (a + b > 20) continue;
    const i = step*Math.floor((a/22)*N/step);
    const j = step*Math.floor((b/22)*N/step);
    if (i < step || j < step || i + j + 2*step > N) continue;
    let sum = 0, count = 0;
    for (let di = 0; di < step; di++) for (let dj = 0; dj < step; dj++){
      const fi = i + di - (step>>1), fj = j + dj - (step>>1);
      if (fi < 0 || fj < 0 || fi + fj > N) continue;
      sum += detail(P(A,B,C,N,fi,fj), ONES); count++;
    }
    if (!count) continue;
    const truth = sum/count;
    const p = P(A,B,C,N,i,j);
    for (const [k, w] of [['today',wToday],['drop',wDrop],['ramp',wRamp]]){
      const e = Math.abs(detail(p, w) - truth);
      acc[k][0] += e*e; acc[k][1] = Math.max(acc[k][1], e);
    }
    used++;
  }
  const row = k => `${(Math.sqrt(acc[k][0]/used)).toFixed(2).padStart(5)}  ${acc[k][1].toFixed(2).padStart(5)}`;
  for (const k of ['today','drop','ramp']) err[k].push(Math.sqrt(acc[k][0]/used));
  console.log(`   ${String(lod).padStart(3)}   ${row('today')}   ${row('drop')}   ${row('ramp')}` +
    `    (${used} places)`);
}
console.log('');
console.log('   the step a player sees when a chunk changes level, rms metres');
console.log('   lod change   today   drop octaves   roll off');
for (let k = 0; k < err.today.length - 1; k++){
  const jump = o => Math.abs(err[o][k+1] - err[o][k]).toFixed(2).padStart(5);
  console.log(`   ${k+1} -> ${k+2}      ${jump('today')}   ${jump('drop')}          ${jump('ramp')}`);
}
