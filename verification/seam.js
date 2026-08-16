// What actually happens at a chunk boundary when the two sides are at different
// LOD and one of them has caves. Doc 14 said "a skirt one coarse cell deep";
// this checks whether that is enough once a rim column has more than one solid
// span, and what does close the remaining holes.
const T=(1+Math.sqrt(5))/2;
const norm=v=>{const l=Math.hypot(...v);return v.map(x=>x/l);};
const add=(a,b)=>a.map((x,i)=>x+b[i]);
const mul=(a,s)=>a.map(x=>x*s);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

function geodesic(L){
  const n=1<<L;
  const V0=[[-1,T,0],[1,T,0],[-1,-T,0],[1,-T,0],[0,-1,T],[0,1,T],[0,-1,-T],[0,1,-T],
            [T,0,-1],[T,0,1],[-T,0,-1],[-T,0,1]].map(norm);
  const F0=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
            [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
  const pts=[], idx=new Map();
  const put=p=>{const k=p.map(x=>Math.round(x*1e7)).join(',');
    if(!idx.has(k)){idx.set(k,pts.length); pts.push(p);} return idx.get(k);};
  for(const f of F0){
    const [A,B,C]=f.map(i=>V0[i]);
    for(let i=0;i<=n;i++) for(let j=0;j<=i;j++){
      const a=(n-i)/n,b=(i-j)/n,c=j/n;
      put(norm([A[0]*a+B[0]*b+C[0]*c,A[1]*a+B[1]*b+C[1]*c,A[2]*a+B[2]*b+C[2]*c]));
    }
  }
  return pts;
}
// the pinned hash: three wrapping uint32 multiplies, two xor-shifts, /2^32.
// No float multiply past 2^53, so every language computes the same planet.
const hash=(x,y,z)=>{let h=(Math.imul(x|0,374761393)+Math.imul(y|0,668265263)
  +Math.imul(z|0,1274126177))>>>0;
  h=(h^(h>>>13))>>>0; h=Math.imul(h,1274126177)>>>0;
  return ((h^(h>>>16))>>>0)/4294967296;};
// quintic fade: smooth in the second derivative too, so shading shows no
// grid at the lattice planes.
const sm=t=>t*t*t*(t*(t*6-15)+10);
function value3(p){
  const f=p.map(Math.floor), d=p.map((x,i)=>sm(x-f[i]));
  let s=0;
  for(let i=0;i<8;i++){
    const c=[f[0]+(i&1), f[1]+((i>>1)&1), f[2]+((i>>2)&1)];
    s+=(i&1?d[0]:1-d[0])*((i>>1)&1?d[1]:1-d[1])*((i>>2)&1?d[2]:1-d[2])*hash(c[0],c[1],c[2]);
  }
  return s*2-1;
}
const fbm=(p,freq,oct)=>{let a=1,f=freq,s=0,n=0;
  for(let i=0;i<oct;i++){s+=a*value3(p.map(x=>x*f)); n+=a; a*=0.5; f*=2;} return s/n;};

const R=1700, BLK=1, LAYERS=80, RELIEF=30;
const CAVE_FREQ=140, CAVE_STRENGTH=26;      // gradient 1.07 -> real enclosed voids
const height = dir => R + RELIEF*fbm(dir,6,5);
// fine side: doc 08's full density field, so it has caves
const solidFine = (dir,surf,y) => {
  const r = surf - y*BLK;
  return ((surf-r) + CAVE_STRENGTH*fbm(mul(dir,r/R),CAVE_FREQ,4)) >= 0 ? 1 : 0;
};
// coarse side: height-field term only (doc 14's rule for far chunks), and its
// surface is resampled one coarse cell away -- that offset is the whole mismatch

const pts = geodesic(6);
const CENTRE = norm([0.3,0.25,1]);
const rim = pts.map((p,i)=>[i,dot(p,CENTRE)]).filter(a=>a[1]>Math.cos(0.20)).map(a=>a[0]);

// ---- run one LOD step and score three policies -----------------------------
function run(coarseCells){
  const skirt = coarseCells;                 // "one coarse cell deep", in layers
  let cols=0, spans=0, multi=0, caveMouths=0, mouthsBelowSkirt=0;
  const holes={own:0, skirt:0, owned:0}, faces={own:0, skirt:0, owned:0};
  let deepest=0;

  for (const v of rim){
    const dir = pts[v];
    const surfF = height(dir);
    // the coarse neighbour samples the height field one coarse cell along the surface
    let t = cross(dir,[0,0,1]); if (Math.hypot(...t)<1e-9) t = cross(dir,[1,0,0]);
    t = norm(t);
    const surfC = height(norm(add(dir, mul(t, coarseCells*BLK/R))));

    const F=new Uint8Array(LAYERS), C=new Uint8Array(LAYERS);
    for (let y=0;y<LAYERS;y++){
      F[y] = solidFine(dir,surfF,y);
      C[y] = (surfF - y*BLK) <= surfC ? 1 : 0;     // coarse: solid below its surface
    }
    cols++;
    let runs=0, prev=0, top=-1;
    for (let y=0;y<LAYERS;y++){ if (F[y] && !prev) { runs++; if (top<0) top=y; } prev=F[y]; }
    spans+=runs; if (runs>1) multi++;
    if (top<0) continue;

    for (let y=0;y<LAYERS;y++){
      if (F[y] === C[y]) continue;                  // sides agree: nothing to draw
      // POLICY 1 -- each chunk evaluates its margin with its OWN generator, so
      // each believes the terrain simply continues and neither emits anything
      holes.own++;
      // POLICY 2 -- the same, plus a skirt hanging from the fine top surface
      const covered = (y >= top && y < top + skirt);
      if (covered) faces.skirt++; else holes.skirt++;
      // POLICY 3 -- the finer chunk owns the seam and emits wherever the two
      // sides disagree, having evaluated the coarse neighbour's height field
      faces.owned++;
      // a cave mouth is coarse-solid against fine-air: rock facing a void
      if (!F[y] && C[y]){
        caveMouths++;
        if (!(y >= top && y < top + skirt)) mouthsBelowSkirt++;
        deepest = Math.max(deepest, y - top);
      }
    }
  }
  faces.skirt += cols;                              // the skirt quad itself, per column
  return {cols, spans, multi, caveMouths, mouthsBelowSkirt, holes, faces, deepest};
}

console.log('A chunk rim where the neighbour is one LOD coarser.');
console.log(`Fine side: full density field (freq ${CAVE_FREQ}, strength ${CAVE_STRENGTH}) -- has caves.`);
console.log('Coarse side: height-field term only, resampled one coarse cell away.\n');
console.log('  coarse   rim      spans   columns with   cave     holes: own-margin   +skirt   seam-owned');
console.log('  cell     columns  /col    >1 span        mouths');
for (const cc of [2,4,8]){
  const r=run(cc);
  console.log(`  ${String(cc+' m').padStart(6)} ${String(r.cols).padStart(9)}`
    +` ${(r.spans/r.cols).toFixed(3).padStart(7)} ${String(r.multi).padStart(14)}`
    +` ${String(r.caveMouths).padStart(8)} ${String(r.holes.own).padStart(17)}`
    +` ${String(r.holes.skirt).padStart(8)} ${String(r.holes.owned ?? 0).padStart(12)}`);
}
console.log('\n  own-margin  = each side trusts its own generator past the boundary.');
console.log('                Neither emits anything, so every disagreement is a hole.');
console.log('  +skirt      = same, plus a curtain one coarse cell deep from the top');
console.log('                surface. It closes the surface slit and nothing else.');
console.log('  seam-owned  = the finer chunk emits a face wherever its solidity differs');
console.log('                from the coarse neighbour\'s. Zero holes, by construction.');

// ---- what the skirt cannot reach -------------------------------------------
console.log('\nWhy the skirt alone is not enough:');
for (const cc of [2,4,8]){
  const r=run(cc);
  const pct = r.caveMouths ? (100*r.mouthsBelowSkirt/r.caveMouths) : 0;
  console.log(`  coarse cell ${String(cc+' m').padStart(5)}:`
    +` ${r.mouthsBelowSkirt} of ${r.caveMouths} cave mouths (${pct.toFixed(0)}%) sit deeper than`
    +` the skirt reaches; deepest is ${r.deepest} layers below the surface.`);
}
console.log('  A skirt hangs DOWN from the top surface. A cave mouth is a HORIZONTAL');
console.log('  hole in the boundary plane, often far below it. The two do not meet.');

// ---- cost of owning the seam ----------------------------------------------
{
  const r=run(2);
  console.log('\nCost of the fine chunk owning the seam:');
  console.log(`  ${r.faces.owned} boundary faces over ${r.cols} rim columns`
    + ` = ${(r.faces.owned/r.cols).toFixed(2)} per column,`);
  console.log('  plus ONE height-field evaluation per rim column to learn where the');
  console.log('  coarse neighbour put its surface. Both are negligible against the');
  console.log(`  ${(r.spans/r.cols).toFixed(2)} spans and ~12 faces per column the chunk already emits.`);
}
