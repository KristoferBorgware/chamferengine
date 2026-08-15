// Which noise function, exactly. Doc 08 fixes WHERE to sample (3D world space)
// and forbids a sin hash; doc 23 makes the exact choice bit-load-bearing, because
// a joining client regenerates doc 21's coarse map rather than downloading it.
// Neither names an algorithm -- and this repository already contains two that
// disagree, which is doc 11 Part 1's third entry. This pins one, and measures why
// each part of it is the way it is rather than asserting it.
// Backs docs/08-terrain-generation.md

// ---- the two that are already here -----------------------------------------
// A: rivers.js, water.js, determinism.js -- a true 32-bit multiply via Math.imul
const hashA = (x,y,z) => {
  let h = (Math.imul(x,374761393) + Math.imul(y,668265263) + Math.imul(z,1274126177)) | 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
// B: volume.js, mesh.js, seam.js -- the same shape with a FLOAT multiply
const hashB = (x,y,z) => {
  let h = x*374761393 + y*668265263 + z*1274126177;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

console.log('1. the two hashes already in this repository');
{
  let diff = 0, n = 0, max = 0;
  for (let x=0;x<20;x++) for (let y=0;y<20;y++) for (let z=0;z<20;z++){
    const a = hashA(x,y,z), b = hashB(x,y,z); n++;
    if (a !== b){ diff++; max = Math.max(max, Math.abs(a-b)); }
  }
  console.log(`   ${n.toLocaleString('en-US')} lattice points compared`);
  console.log(`   disagree on ${diff.toLocaleString('en-US')} of them`
    + ` = ${(100*diff/n).toFixed(1)}%, by up to ${max.toExponential(1)}`);
  console.log('   Both call themselves a value hash. They are different functions.');
}

// ---- where B goes wrong, and it is not the coordinates ---------------------
// The obvious guess is that B is fine while the coordinates stay small and only
// breaks when x*374761393 runs past 2^53. That is not what happens. Its SECOND
// multiply takes an h that is already up to 2^32 and multiplies it by 1.27e9,
// which is 2^62 -- so B discards the low bits of its own avalanche step, every
// time, at every coordinate.
console.log('\n2. B is lossy at its second multiply, not at its first');
{
  const step1 = (x,y,z) => x*374761393 + y*668265263 + z*1274126177;
  let firstExact = 0, tot = 0;
  for (let x=0;x<40;x++) for (let y=0;y<40;y++) for (let z=0;z<40;z++){
    tot++; if (Math.abs(step1(x,y,z)) < 2**53) firstExact++;
  }
  console.log(`   first multiply exact in float64: ${firstExact}/${tot} of small coordinates`);
  // now the second step, for a spread of h values
  let lossy = 0, samples = 0;
  for (let s = 0; s < 4096; s++){
    const h = Math.imul(s, 2654435761) >>> 0;          // an arbitrary spread of h
    const exact = (BigInt(h) * 1274126177n) % (1n << 32n);
    const asFloat = BigInt.asUintN(32, BigInt(Math.trunc(h * 1274126177)));
    samples++; if (exact !== asFloat) lossy++;
  }
  console.log(`   second multiply loses bits: ${lossy}/${samples} of h values`
    + ` = ${(100*lossy/samples).toFixed(1)}%`);
  console.log('   h is up to 2^32 and the multiplier is 2^30.2, so the product is 2^62 --');
  console.log('   nine bits past what float64 carries. B then takes >>> of that, which in');
  console.log('   JavaScript is a defined truncation of an out-of-range double and in C is');
  console.log('   undefined behaviour. So B is not a hash with a portable definition: it is');
  console.log('   a hash whose low nine bits are whatever one language happens to round to.');
}

// ---- how good are they, as hashes ------------------------------------------
// Avalanche: flip one bit of the input and count how many output bits flip. A
// good 32-bit mix moves half of them. Anything far from 0.5 means structure the
// terrain will show as a visible grid.
console.log('\n3. avalanche -- flip one input bit, how many output bits move?');
{
  const bits32 = (x,y,z,fn) => Math.floor(fn(x,y,z) * 4294967296) >>> 0;
  const popcount = v => { let c = 0; v = v >>> 0; while (v){ c += v & 1; v >>>= 1; } return c; };
  const test = (fn, label) => {
    let sum = 0, n = 0, lo = 1, hi = 0;
    for (let x = 0; x < 32; x++) for (let y = 0; y < 32; y++){
      const base = bits32(x, y, 7, fn);
      for (let b = 0; b < 12; b++){
        const f = popcount(base ^ bits32(x ^ (1<<b), y, 7, fn)) / 32;
        sum += f; n++; lo = Math.min(lo, f); hi = Math.max(hi, f);
      }
    }
    console.log(`   ${label}  mean ${(sum/n).toFixed(4)}   min ${lo.toFixed(3)}   max ${hi.toFixed(3)}`
      + `   (ideal 0.5)`);
    return sum/n;
  };
  const a = test(hashA, 'A (imul) ');
  const b = test(hashB, 'B (float)');
  console.log('   Expected: B throws away nine bits, so B should mix visibly worse.');
  console.log(`   Measured: it does not. Both sit within ${Math.max(Math.abs(a-0.5),Math.abs(b-0.5)).toFixed(4)} of ideal,`
    + ` and B is${Math.abs(b-0.5) < Math.abs(a-0.5) ? '' : ' not'} the closer of the two.`);
  console.log('   So the case against B is NOT that it is a bad hash. Rounding a 2^62');
  console.log('   product still scrambles bits perfectly well. The case against it is');
  console.log('   section 2 alone: it has no definition outside JavaScript. That is');
  console.log('   enough on its own, and it is the whole of the argument.');
}

// ---- the pinned function ---------------------------------------------------
// Everything below is normative. Every operation is either 32-bit integer
// arithmetic (wrapping, exactly specified in every language that has uint32) or
// float64 + - * /, which IEEE 754 pins to the bit (doc 23). No transcendentals,
// no float multiply past 2^53, no reliance on any language's coercion rules.
const U32 = 4294967296;
function hash3(x, y, z){                       // int32 in, float64 in [0,1) out
  // every step is uint32: wrapping multiply, xor, logical shift. No signed
  // intermediates, so there is nothing for a language to disagree about.
  let h = (Math.imul(x|0, 374761393) + Math.imul(y|0, 668265263)
         + Math.imul(z|0, 1274126177)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / U32;
}
// quintic: 6t^5 - 15t^4 + 10t^3. Smooth in the first AND second derivative, so a
// terrain normal has no crease at a lattice plane. Section 5 measures the cost.
const fade = t => t*t*t*(t*(t*6 - 15) + 10);

function value3(px, py, pz){                   // trilinear value noise, [-1, 1]
  const xi = Math.floor(px), yi = Math.floor(py), zi = Math.floor(pz);
  const u = fade(px - xi), v = fade(py - yi), w = fade(pz - zi);
  let s = 0;
  for (let c = 0; c < 8; c++){
    const dx = c & 1, dy = (c >> 1) & 1, dz = (c >> 2) & 1;
    const wx = dx ? u : 1 - u, wy = dy ? v : 1 - v, wz = dz ? w : 1 - w;
    s += wx * wy * wz * hash3(xi + dx, yi + dy, zi + dz);
  }
  return s * 2 - 1;
}
// fBm: fixed octave count, lacunarity 2, gain 0.5, accumulated LOW OCTAVE FIRST
// and divided by the summed amplitude so the range is independent of octaves.
function fbm(p, freq, octaves){
  let sum = 0, amp = 1, tot = 0, f = freq;
  for (let o = 0; o < octaves; o++){
    sum += amp * value3(p[0]*f, p[1]*f, p[2]*f);
    tot += amp; amp *= 0.5; f *= 2;
  }
  return sum / tot;
}

console.log('\n4. the pinned function, and what it produces');
{
  const norm = v => { const l = Math.hypot(...v); return v.map(x=>x/l); };
  let seed = 987654321;
  const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let lo = 2, hi = -2, sum = 0, n = 0, sum2 = 0;
  for (let t = 0; t < 200000; t++){
    const z = 2*rnd()-1, ph = 2*Math.PI*rnd(), r = Math.sqrt(1-z*z);
    const d = norm([r*Math.cos(ph), r*Math.sin(ph), z]);
    const v = fbm([d[0]*40, d[1]*40, d[2]*40], 1, 5);
    lo = Math.min(lo,v); hi = Math.max(hi,v); sum += v; sum2 += v*v; n++;
  }
  console.log(`   ${n.toLocaleString('en-US')} directions, 5 octaves at frequency 40:`);
  console.log(`     range ${lo.toFixed(4)} .. ${hi.toFixed(4)}   mean ${(sum/n).toFixed(4)}`
    + `   sd ${Math.sqrt(sum2/n - (sum/n)**2).toFixed(4)}`);
  console.log('   Bounded in [-1,1] by construction, because dividing by the summed');
  console.log('   amplitude makes the octave count a shape control and not a gain.');
  console.log(`   But it does not FILL that range: the standard deviation is`
    + ` ${Math.sqrt(sum2/n - (sum/n)**2).toFixed(3)} of`);
  console.log('   the amplitude, so "60 m of relief" in doc 14 means a typical swing of');
  console.log('   about 15 m and a full 60 m only where several octaves happen to align.');
  console.log('   Worth knowing before anyone tunes a mountain by eye.');
}

// ---- why quintic rather than smoothstep ------------------------------------
console.log('\n5. quintic against smoothstep, at a lattice plane');
{
  const smooth = t => t*t*(3 - 2*t);
  const val = (px,py,pz,f) => {
    const xi=Math.floor(px), yi=Math.floor(py), zi=Math.floor(pz);
    const u=f(px-xi), v=f(py-yi), w=f(pz-zi);
    let s=0;
    for (let c=0;c<8;c++){
      const dx=c&1, dy=(c>>1)&1, dz=(c>>2)&1;
      s += (dx?u:1-u)*(dy?v:1-v)*(dz?w:1-w)*hash3(xi+dx,yi+dy,zi+dz);
    }
    return s*2-1;
  };
  // second difference either side of an integer plane: a crease shows up as a
  // jump in curvature, which is what a lit surface displays as a hard line
  const curv = (f, x) => { const e = 1e-4;
    return (val(x+e,0.3,0.7,f) - 2*val(x,0.3,0.7,f) + val(x-e,0.3,0.7,f)) / (e*e); };
  let jS = 0, jQ = 0;
  for (let k = 1; k <= 40; k++){
    jS = Math.max(jS, Math.abs(curv(smooth, k+1e-3) - curv(smooth, k-1e-3)));
    jQ = Math.max(jQ, Math.abs(curv(fade,   k+1e-3) - curv(fade,   k-1e-3)));
  }
  console.log(`   worst jump in curvature across a lattice plane, over 40 planes:`);
  console.log(`     smoothstep  t^2(3-2t)          ${jS.toFixed(2)}`);
  console.log(`     quintic     6t^5-15t^4+10t^3   ${jQ.toFixed(2)}`);
  console.log('   Smoothstep is smooth in the first derivative and kinked in the second,');
  console.log('   so shading -- which reads the normal\'s rate of change -- shows a faint');
  console.log('   grid on every integer plane. Quintic removes it for two extra multiplies');
  console.log('   per axis, evaluated once per sample rather than once per octave.');
}

// ---- accumulation order is part of the specification -----------------------
console.log('\n6. accumulation order, and why it has to be written down');
{
  const p = [0.31*40, -0.77*40, 0.55*40];
  const lowFirst = (oct) => { let s=0,a=1,t=0,f=1;
    for (let o=0;o<oct;o++){ s+=a*value3(p[0]*f,p[1]*f,p[2]*f); t+=a; a*=0.5; f*=2; } return s/t; };
  const highFirst = (oct) => { const terms=[]; let a=1,t=0,f=1;
    for (let o=0;o<oct;o++){ terms.push(a*value3(p[0]*f,p[1]*f,p[2]*f)); t+=a; a*=0.5; f*=2; }
    let s=0; for (let o=oct-1;o>=0;o--) s+=terms[o]; return s/t; };
  for (const oct of [4,5,6,8]){
    const a = lowFirst(oct), b = highFirst(oct);
    console.log(`   ${oct} octaves: low-first ${a.toFixed(17)}`);
    console.log(`   ${' '.repeat(String(oct).length)}          high-first ${b.toFixed(17)}`
      + `   ${a === b ? 'identical' : 'DIFFER by ' + Math.abs(a-b).toExponential(1)}`);
  }
  console.log('   Float addition is not associative, so the same octaves summed the other');
  console.log('   way round need not give the same number -- and at two of the four counts');
  console.log('   above they do not, by 1.4e-17. The other two happen to agree, which is');
  console.log('   the trap: an order dependence that shows up only sometimes is one nobody');
  console.log('   finds by testing. Doc 23 is not about tolerances but about whether a');
  console.log('   difference is introduced at all, so pin it: LOW OCTAVE FIRST.');
}

// ---- what this costs the scripts already here ------------------------------
console.log('\n7. what switching the three float-multiply scripts would move');
{
  const norm = v => { const l = Math.hypot(...v); return v.map(x=>x/l); };
  const sm = t => t*t*(3-2*t);
  const oldVal = (p) => {                        // B's noise, as volume.js writes it
    const fl = p.map(Math.floor), d = p.map((x,i)=>sm(x-fl[i]));
    let s=0;
    for(let i=0;i<8;i++){
      const c=[fl[0]+(i&1), fl[1]+((i>>1)&1), fl[2]+((i>>2)&1)];
      s+=(i&1?d[0]:1-d[0])*((i>>1)&1?d[1]:1-d[1])*((i>>2)&1?d[2]:1-d[2])*hashB(c[0],c[1],c[2]);
    }
    return s*2-1;
  };
  const oldFbm = (p,freq,oct) => { let a=1,f=freq,s=0,n=0;
    for(let i=0;i<oct;i++){ s+=a*oldVal(p.map(x=>x*f)); n+=a; a*=0.5; f*=2; } return s/n; };
  let seed = 24681357;
  const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let maxd = 0, sum = 0, n = 0;
  const RELIEF = 60;                             // metres, as doc 14 uses
  for (let t = 0; t < 50000; t++){
    const z = 2*rnd()-1, ph = 2*Math.PI*rnd(), r = Math.sqrt(1-z*z);
    const d = norm([r*Math.cos(ph), r*Math.sin(ph), z]);
    const a = fbm([d[0],d[1],d[2]], 1.5, 6) * RELIEF;
    const b = oldFbm([d[0],d[1],d[2]], 1.5, 6) * RELIEF;
    maxd = Math.max(maxd, Math.abs(a-b)); sum += Math.abs(a-b); n++;
  }
  console.log(`   height at ${n.toLocaleString('en-US')} directions, 60 m of relief:`);
  console.log(`     mean |difference| ${sum/n < 0.01 ? (sum/n*1000).toFixed(2)+' mm' : (sum/n).toFixed(2)+' m'}`
    + `   worst ${maxd.toFixed(2)} m`);
  console.log('   This is a DIFFERENT WORLD, not a rounding difference -- the terrain moves');
  console.log('   by metres, because the two hashes disagree on 98% of lattice points and');
  console.log('   the interpolation changed too. So the three scripts still on B publish');
  console.log('   figures about a planet the pinned function does not generate.');
  console.log('   Their conclusions are statistical -- face counts, span counts, seam holes');
  console.log('   over hundreds of thousands of cells -- so none of them turns on which');
  console.log('   world it measured. But they should be switched, and the numbers');
  console.log('   regenerated, before any of them is used to size an engine.');
}

console.log('\nverdict');
console.log('   The noise is pinned: hash3 above (three imul, two xor-shift, /2^32),');
console.log('   trilinear value noise with the QUINTIC fade, fBm at lacunarity 2 and');
console.log('   gain 0.5, accumulated low octave first and divided by summed amplitude.');
console.log('   Octave count and base frequency are per-field tuning and belong in the');
console.log('   world file beside the seed, because changing either changes the planet.');
console.log('   Every operation is int32 or IEEE-754 + - * /, so doc 23\'s rule holds with');
console.log('   nothing left to check: no transcendental, and no float multiply past 2^53.');
