// Layer merging: buy it or strike it. Doc 06 caps the crust because cells taper
// as (R-h)/R with depth, and raises merging -- dropping horizontal resolution one
// level at some depth -- only to decline it. Doc 11 has carried it as "proposed,
// never designed" ever since. This prices both sides: how deep the taper really
// lets a crust run, what a merge would buy, and what the interior shell would
// cost. Backs docs/06-world-sizing.md
const T = (1 + Math.sqrt(5)) / 2;
const norm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
const K = Math.sqrt(8*Math.PI/(10*Math.sqrt(3)));
const N = L => 10 * 4**L + 2;

// The narrowest cell anywhere on the surface, as a fraction of doc 06 nominal
// spacing. Measured by uniform.js section 3, where it settles at 0.744 by L=8.
const MIN_SURFACE = 0.744;

// ---- 1. the threshold, anchored instead of guessed --------------------------
// Doc 06 says cells "visibly narrow" below 85% of surface width and admits there
// is no script behind it. There is a measured anchor available: the surface
// already carries cells 0.744 of nominal, next to the twelve pentagons. A taper
// that stays above that has not produced any cell narrower than one the player
// has already walked across at the surface.
console.log('1. where the taper threshold actually sits');
console.log(`   narrowest surface cell, from uniform.js : ${MIN_SURFACE} of nominal`);
console.log(`   so the taper budget is                  : ${((1-MIN_SURFACE)*100).toFixed(1)}% of the radius`);
console.log(`   doc 06's guess was 85% -> 15% of R, which is CONSERVATIVE against this,`);
console.log('   so nothing built on it was wrong -- but it was a judgement, and this is not.');

// ---- 2. max crust depends on subdivision depth alone ------------------------
// layers = (1-t)*R / blockSize, and blockSize = K*R/2^D, so R cancels.
console.log('\n2. max crust in layers = (1-t) * 2^D / K  -- the radius cancels');
console.log('   D    block @ R=1700   max crust (layers)   as metres @ R=1700   ID layer field');
for (const D of [9, 10, 11, 12, 13, 14]){
  const layers = (1 - MIN_SURFACE) * 2**D / K;
  const bs = K * 1700 / 2**D;
  const binds = layers < 512 ? 'taper binds' : 'layer field binds (512)';
  console.log(`   ${String(D).padStart(2)}  ${bs.toFixed(3).padStart(10)} m   ${layers.toFixed(0).padStart(14)}`
    + `   ${(layers*bs).toFixed(0).padStart(15)} m   ${binds}`);
}
console.log('   Same layer count on a 10 km planet and on an Earth-sized one: block size and');
console.log('   radius scale together, so only D matters. That is worth stating on its own --');
console.log('   the crust cap is a property of the grid, not of the world you sized.');

// ---- 3. what the worked planet actually uses --------------------------------
const D = 11, R = 1700, crust = 64;
const cap = (1 - MIN_SURFACE) * 2**D / K;
console.log('\n3. the doc 06 worked planet: 1 m blocks, D 11, R 1700 m');
console.log(`   crust in use          : ${crust} layers  (cells at the floor are `
  + `${(100*(R-crust)/R).toFixed(1)}% of surface width)`);
console.log(`   taper cap             : ${cap.toFixed(0)} layers`);
console.log(`   headroom              : ${(cap/crust).toFixed(1)}x deeper than the design uses`);
console.log('   Capping costs this planet nothing at all. It is not a constraint, it is a');
console.log('   ceiling nobody is near.');

// ---- 4. what a merge would buy ---------------------------------------------
// Each merge doubles cell width, so the taper budget restarts from twice as wide.
console.log('\n4. what merging layers would buy, as a fraction of the radius');
let reach = 0;
for (let k = 0; k <= 3; k++){
  reach = 1 - MIN_SURFACE * Math.pow(0.5, k);
  const layersEquivalent = reach * R;
  console.log(`   after ${k} merge(s): reach ${(reach*100).toFixed(1)}% of R`
    + `  = ${layersEquivalent.toFixed(0)} m = ${layersEquivalent.toFixed(0)} layers @ 1 m`);
}
console.log(`   But the ID layout sizes the layer field for a 512-layer crust (docs 03, 06).`);
console.log(`   Unmerged reach is ${cap.toFixed(0)} layers; the field stops at 512. So the first merge`);
console.log(`   buys ${(512-cap).toFixed(0)} addressable layers -- ${(100*(512-cap)/cap).toFixed(0)}% more crust -- and every merge after`);
console.log('   it buys nothing at all, because the ID cannot address the result.');

// ---- 5. what the shell would cost -------------------------------------------
// Merging is a LOD change on an interior surface that wraps the entire planet.
// Doc 14's LOD seam is a rim around a chunk; this one is every column there is.
console.log('\n5. what the interior shell would cost');
console.log('   L      fine cells   coarse cells   columns continuing   columns dead-ending');
for (const L of [9, 10, 11]){
  const f = N(L), c = N(L-1);
  console.log(`   ${L} ${f.toLocaleString('en-US').padStart(12)} ${c.toLocaleString('en-US').padStart(14)}`
    + `   ${(100*c/f).toFixed(2)}%${' '.repeat(15)} ${(100*(1-c/f)).toFixed(2)}%`);
}
console.log('   Cell CENTRES nest exactly -- oneShot(n/2, i, j) equals oneShot(n, 2i, 2j), so');
console.log('   every coarse centre is also a fine centre. Cell AREAS do not: a hexagon is not');
console.log('   a union of four hexagons. So one fine column in four continues through the');
console.log('   shell and three in four terminate against a cell they only partly overlap.');
console.log('');
console.log(`   Every one of the worked planet's ${N(11).toLocaleString('en-US')} columns crosses that shell.`);
console.log('   Compare doc 14\'s LOD seam, which is a rim: 2.70 faces per rim column, and only');
console.log('   at chunks that border a different level. This seam has no rim -- it is the');
console.log('   whole planet, at one depth, forever.');

// ---- 6. and what it breaks --------------------------------------------------
console.log('\n6. what the shell breaks (invariant 10: the tessellation is identical at every layer)');
for (const [what, doc, cost] of [
  ['vertical neighbour is layer +/- 1',      'doc 03', 'becomes a full doc 04 lookup at the shell'],
  ['gravity and the three frames stay cheap','doc 13', 'frames must be rebuilt across the shell'],
  ['vertical face merging is exact (1.5e-16)','doc 14', 'stacked cells no longer share a radial plane'],
  ['sky light stored per column, 32x smaller','doc 16', 'columns are no longer straight through'],
]) console.log(`   ${what.padEnd(42)} ${doc}  ->  ${cost}`);

console.log('\nverdict');
console.log(`   buys : ${(512-cap).toFixed(0)} layers of addressable crust on the worked planet, ${(100*(512-cap)/cap).toFixed(0)}%`);
console.log(`   costs: an unrimmed seam across all ${N(11).toLocaleString('en-US')} columns, and four results`);
console.log('          that four separate documents are built on');
console.log('   Cap the crust. Strike layer merging.');
