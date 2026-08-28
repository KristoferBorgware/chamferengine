// Meshing terrain that is GENERATED, not stored. Doc 08 makes terrain a pure
// function of position -- a height-field term, optionally plus a density-field
// term for caves -- and doc 14's cost model quietly assumed the first, on a
// smooth sphere. This measures relief, caves, and what generation costs.
const T=(1+Math.sqrt(5))/2;
const norm=v=>{const l=Math.hypot(...v);return v.map(x=>x/l);};
const add=(a,b)=>a.map((x,i)=>x+b[i]);
const mul=(a,s)=>a.map(x=>x*s);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const N = L => 10*4**L + 2;

function geodesic(L){
  const n=1<<L;
  const V0=[[-1,T,0],[1,T,0],[-1,-T,0],[1,-T,0],[0,-1,T],[0,1,T],[0,-1,-T],[0,1,-T],
            [T,0,-1],[T,0,1],[-T,0,-1],[-T,0,1]].map(norm);
  const F0=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
            [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
  const pts=[], idx=new Map(), nb=[];
  const put=p=>{const k=p.map(x=>Math.round(x*1e7)).join(',');
    if(!idx.has(k)){idx.set(k,pts.length); pts.push(p); nb.push(new Set());} return idx.get(k);};
  const link=(a,b)=>{nb[a].add(b); nb[b].add(a);};
  for(const f of F0){
    const [A,B,C]=f.map(i=>V0[i]), P=[];
    for(let i=0;i<=n;i++){const row=[];
      for(let j=0;j<=i;j++){const a=(n-i)/n,b=(i-j)/n,c=j/n;
        row.push(put(norm([A[0]*a+B[0]*b+C[0]*c,A[1]*a+B[1]*b+C[1]*c,A[2]*a+B[2]*b+C[2]*c])));}
      P.push(row);}
    for(let i=0;i<n;i++) for(let j=0;j<=i;j++){
      link(P[i][j],P[i+1][j]); link(P[i][j],P[i+1][j+1]); link(P[i+1][j],P[i+1][j+1]);}
  }
  return {pts, nb:nb.map(s=>[...s])};
}

// deterministic value-noise fBm, same shape as doc 08's generator
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

const R=1700, BLK=1, D=11;

// ---- 1. relief makes the horizon much further than the ground horizon -------
console.log('1. how far away can you SEE something, versus where the ground ends');
console.log(`   R = ${R} m, eye 1.7 m. Ground horizon = ${(R*Math.acos(R/(R+1.7))).toFixed(0)} m.`);
console.log('   peak height   visible from   visible cells within that range   x ground-only');
const eye=R*Math.acos(R/(R+1.7));
const cellsIn=d=>N(D)*(1-Math.cos(d/R))/2;
const base=cellsIn(eye);
for (const h of [0,10,30,60,120,300]){
  const d=eye + R*Math.acos(R/(R+h));
  console.log(`   ${String(h+' m').padStart(11)} ${(d<1000?d.toFixed(0)+' m':(d/1000).toFixed(2)+' km').padStart(14)}`
    +` ${Math.round(cellsIn(d)).toLocaleString('en-US').padStart(33)} ${(cellsIn(d)/base).toFixed(1).padStart(14)}x`);
}
console.log('   a 60 m hill is visible from 7x further than flat ground, and the cells');
console.log('   inside that radius are ~46x the ground-horizon count. Doc 14\'s 21,000');
console.log('   is the count for a SMOOTH sphere and is a floor, not a budget.');

// ---- 2. exposed faces per column, as relief rises --------------------------
// a column exposes 1 cap plus, toward each neighbour, one side face per block
// of height difference. Flat ground costs 1 face; a cliff costs its height.
const g=geodesic(6);
const CENTRE=norm([0.3,0.25,1]);
const patch=g.pts.map((p,i)=>[i,dot(p,CENTRE)]).filter(a=>a[1]>Math.cos(0.28)).map(a=>a[0]);
const inPatch=new Set(patch);
console.log(`\n2. exposed faces per column -- doc 08's HEIGHT FIELD term alone`);
console.log(`   surfaceRadius = R(1 + amp*fbm(dir)), one evaluation per column, no caves`);
console.log(`   (patch of ${patch.length} cells)`);
console.log('   relief   mean |slope|   cap   side faces   side QUADS after merge   tris/column');
for (const AMP of [0,10,30,60,120]){
  const H=new Map();
  for (const v of patch) H.set(v, Math.round(AMP*fbm(g.pts[v],6,5)/BLK));
  let caps=0, sides=0, quads=0, dh=0, n=0;
  for (const v of patch){
    caps++;
    for (const w of g.nb[v]) if (inPatch.has(w)){
      const d=H.get(v)-H.get(w);
      if (d>0){ sides+=d; quads++; }      // one unbroken run -> exactly one quad
      dh+=Math.abs(d); n++;
    }
  }
  const tris=(4*caps + 2*quads)/patch.length;
  console.log(`   ${String(AMP+' m').padStart(6)} ${(dh/n).toFixed(3).padStart(13)}`
    +` ${(caps/patch.length).toFixed(2).padStart(5)} ${(sides/patch.length).toFixed(2).padStart(12)}`
    +` ${(quads/patch.length).toFixed(2).padStart(23)} ${tris.toFixed(2).padStart(13)}`);
}
console.log('   raw side faces explode with relief, but each unbroken run collapses to');
console.log('   ONE quad, so the triangle count barely moves. Vertical merging is what');
console.log('   keeps a volume affordable -- without it this table is the cost.');

// ---- 3. caves: interior surface a height field never has -------------------
// doc 08's density field: solid where (surfaceRadius - |p|) + noise3D*strength > 0.
// The bias term grows 1 per metre of depth, so ENCLOSED voids need the noise
// gradient (amplitude / feature size) to beat that. A low frequency only
// roughens the surface; it never carves.
console.log("\n3. adding doc 08's DENSITY FIELD term: (surfaceRadius - |p|) + noise3D*strength");
console.log('   64 layers under 30 m of relief. Feature size = R/freq, and enclosed');
console.log('   voids need amplitude/feature > 1 -- otherwise the bias term always wins.');
console.log('   freq  strength  feature  gradient   cave cells   spans/column   faces/column');
const LAYERS=64;
const sub=patch.slice(0, 1200);
const subSet=new Set(sub);
function carve(freq, strength){
  const solid=new Map();
  for (const v of sub){
    const dir=g.pts[v], surf=R + 30*fbm(dir,6,5), col=new Uint8Array(LAYERS);
    for (let y=0;y<LAYERS;y++){
      const r=surf - y*BLK;
      const dens=(surf-r) + (strength ? strength*fbm(mul(dir,r/R),freq,4) : 0);
      col[y] = dens>=0 ? 1 : 0;
    }
    solid.set(v,col);
  }
  return solid;
}
for (const [freq,strength] of [[40,0],[40,26],[140,26],[220,26],[140,40]]){
  const solid=carve(freq,strength);
  const at=(v,y)=> y<0 ? 0 : y>=LAYERS ? 1 : (solid.get(v)?.[y] ?? 1);
  let faces=0, caveCells=0, spans=0;
  for (const v of sub){
    let prev=0;
    for (let y=0;y<LAYERS;y++){
      const me=at(v,y);
      if (me && !prev) spans++;                    // start of a solid run
      prev=me;
      if (!me){ if (y>0 && at(v,y-1)) caveCells++; continue; }   // air under rock
      if (!at(v,y-1)) faces++;
      if (!at(v,y+1)) faces++;
      for (const w of g.nb[v]) if (subSet.has(w) && !at(w,y)) faces++;
    }
  }
  const A=strength*0.5, L=R/freq;
  console.log(`   ${String(freq).padStart(4)} ${String(strength).padStart(9)}`
    +` ${L.toFixed(1).padStart(8)}m ${(A/L).toFixed(2).padStart(9)}`
    +` ${caveCells.toLocaleString('en-US').padStart(12)} ${(spans/sub.length).toFixed(3).padStart(14)}`
    +` ${(faces/sub.length).toFixed(1).padStart(14)}`);
}
console.log('   freq 40 carves nothing at all -- gradient 0.31, the bias always wins.');
console.log('   Only the high-frequency rows make real voids, and those are what drive');
console.log('   both the face count and the multi-span columns the skirt has to handle.');
console.log('   THE ENGINE DOES NOT RUN THIS RULE. Section 3b measures the one it does.');

// ---- 3b. the rule that ships: a BAND around the field's own zero ------------
// `caveDensity` is hollow where |fbm| < threshold, between a ceiling that
// wanders per column and a floor at `reach`. There is no bias term, so there is
// no gradient to beat -- which is the whole reason section 3's table does not
// describe this. The zero set of a field is a set of SURFACES and a band round
// one is a slab, so what this carves is one folded sheet rather than a network
// of corridors.
console.log('\n3b. the rule the engine RUNS: hollow where |fbm| < threshold');
console.log('   Same 1,200 columns and 64 layers. Ceiling wanders per column so a');
console.log('   passage reaches daylight through a mouth rather than under your feet.');
console.log('   scale  band  ceiling  reach   cave cells  multi-span  faces/column  mouths');
const CAVE_OCT=3, MOUTH_OCT=2, VARY=10, RARE=0.5, MOUTH=60;
// The ceiling this column keeps over it: `caveCeilingAt`, in the script's own
// noise. It only ever comes down.
const ceilingAt=(dir,ceiling)=>{
  if (VARY<=0) return ceiling;
  const n=fbm(mul(dir,R),1/MOUTH,MOUTH_OCT);
  return ceiling - VARY*Math.max(0,(n-RARE)/(1-RARE));
};
function band(scale, threshold, ceiling, reach){
  const solid=new Map();
  for (const v of sub){
    const dir=g.pts[v], surf=R + 30*fbm(dir,6,5), col=new Uint8Array(LAYERS);
    const ceil=ceilingAt(dir,ceiling);
    for (let y=0;y<LAYERS;y++){
      const r=surf - y*BLK, depth=surf-r;
      let rock=1;
      if (depth>=ceil && depth<=reach){
        const n=fbm(mul(dir,r),1/scale,CAVE_OCT);
        if (n>-threshold && n<threshold) rock=0;
      }
      col[y]=rock;
    }
    solid.set(v,col);
  }
  return solid;
}
for (const [scale,threshold,ceiling,reach] of
     [[24,0.12,6,28],[24,0.06,6,28],[24,0.20,6,28],[12,0.12,6,28],[48,0.12,6,28],[24,0.12,6,120]]){
  const solid=band(scale,threshold,ceiling,reach);
  const at=(v,y)=> y<0 ? 0 : y>=LAYERS ? 1 : (solid.get(v)?.[y] ?? 1);
  let faces=0, caveCells=0, many=0, mouths=0;
  for (const v of sub){
    let prev=0, open=false, spans=0;
    for (let y=0;y<LAYERS;y++){
      const me=at(v,y);
      if (me && !prev) spans++;
      prev=me;
      if (!me){
        // A void with nothing but void above it has reached the daylight.
        if (y===0) open=true;
        if (y>0 && at(v,y-1)) caveCells++;
        continue;
      }
      if (!at(v,y-1)) faces++;
      if (!at(v,y+1)) faces++;
      for (const w of g.nb[v]) if (subSet.has(w) && !at(w,y)) faces++;
    }
    if (open) mouths++;
    if (spans>1) many++;
  }
  console.log(`   ${String(scale).padStart(5)}m ${threshold.toFixed(2).padStart(5)}`
    +` ${String(ceiling+' m').padStart(8)} ${String(reach+' m').padStart(6)}`
    +` ${caveCells.toLocaleString('en-US').padStart(12)}`
    +` ${((100*many)/sub.length).toFixed(1).padStart(10)}%`
    +` ${(faces/sub.length).toFixed(1).padStart(13)} ${mouths.toString().padStart(7)}`);
}
console.log('   The first row is what ships, and the multi-span share is the number');
console.log('   that moves: the density term left 8-24% of columns holding more than');
console.log('   one slab and this leaves nearly ALL of them, because the sheet runs');
console.log('   through the whole patch rather than carving pockets here and there.');
console.log('   The band decides how WIDE every passage is, not how many there are --');
console.log('   doubling it does not open a second system, it fattens the one sheet.');
console.log('   And the floor at 28 m is what makes caves affordable: the last row is');
console.log('   the same rule reaching to 120 m, at over twice the faces a column.');

// ---- 4. what LOD does to a cave -------------------------------------------
// LOD resamples the terrain function at a coarser spacing. A feature narrower
// than that spacing is not simplified, it is gone.
console.log('\n4. the smallest feature each level can still represent');
console.log('   level   cell spacing   a 3 m cave   a 10 m canyon   a 40 m valley');
for (let L=D; L>=D-5; L--){
  const s=1.20459*R/2**L;
  const ok=w=> w >= 2*s ? 'survives' : 'GONE';
  console.log(`   ${String(L).padStart(5)} ${s.toFixed(2).padStart(11)} m ${ok(3).padStart(12)}`
    +` ${ok(10).padStart(15)} ${ok(40).padStart(15)}`);
}
console.log('   a coarse mesh cannot show a cave narrower than two of its cells, so');
console.log('   interior geometry must not be LOD-ed at all -- it is culled by being');
console.log('   enclosed, which is free and exact, rather than simplified.');

// ---- 5. generation cost: nothing is stored, so LOD is re-generation --------
// Terrain is a pure function of position (doc 08). A coarse mesh is not a
// simplified copy of a fine one -- there is no fine one. It is the same
// function asked again on a wider grid, so LOD cuts generation cost too.
{
  console.log('\n5. noise evaluations to generate one chunk (D = 11, C = 6, 64 layers)');
  const cols = L => { const n = 2**(11-6-L); return (n+1)*(n+2)/2; };   // lattice pts in a triangle
  const HEIGHT_OCT = 5, DENS_OCT = 4, BAND = 32;
  console.log('   LOD   columns   height field   + density, full crust   + density, band only');
  for (let L=0; L<=3; L++){
    const c = cols(L);
    const hf = c*HEIGHT_OCT;
    const full = hf + c*64*DENS_OCT;
    const band = hf + c*BAND*DENS_OCT;
    console.log(`   ${String('-'+L).padStart(5)} ${String(c).padStart(9)}`
      + ` ${hf.toLocaleString('en-US').padStart(14)} ${full.toLocaleString('en-US').padStart(24)}`
      + ` ${band.toLocaleString('en-US').padStart(23)}`);
  }
  const c0 = cols(0);
  console.log(`   the density field is ${((c0*64*DENS_OCT)/(c0*HEIGHT_OCT)).toFixed(0)}x the height field over a full crust,`);
  console.log(`   and ${((c0*BAND*DENS_OCT)/(c0*HEIGHT_OCT)).toFixed(0)}x when restricted to a band around the surface.`);
  console.log('   Each LOD step drops the columns 4x, so it cuts generation as well as');
  console.log('   drawing -- and since a coarse chunk cannot show a cave anyway (section 4),');
  console.log('   far chunks can skip the density term entirely and run height field only.');
  console.log(`   That makes a LOD-2 chunk ${(( (cols(0)*BAND*DENS_OCT + cols(0)*HEIGHT_OCT) / (cols(2)*HEIGHT_OCT) )).toFixed(0)}x cheaper to generate than a near one.`);
}
