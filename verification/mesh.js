// Meshing and LOD: what a hex surface actually costs, how far a flat patch may
// span before the sphere's curvature shows, and whether LOD levels share
// vertices. Backs docs/14-meshing-and-lod.md
const T=(1+Math.sqrt(5))/2, DEG=180/Math.PI;
const norm=v=>{const l=Math.hypot(...v);return v.map(x=>x/l);};
const add=(a,b)=>a.map((x,i)=>x+b[i]);
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const mul=(a,s)=>a.map(x=>x*s);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const len=a=>Math.hypot(...a);

// cells are vertices of the subdivided icosahedron; hexagon corners are the
// triangle centroids, i.e. the vertices of the dual.
// NOTE: doc 18 changed where a corner sits -- average the FLAT lattice points and
// then project, rather than averaging the projected ones. That moves a corner by
// 3.85e-5 of a cell at level 11 and changes no count on this page, because each
// triangle still yields one corner and each corner still serves three cells. The
// corner formula itself is owned by boundary.js; this script owns the cost model.
function geodesic(L){
  const n=1<<L;
  const V0=[[-1,T,0],[1,T,0],[-1,-T,0],[1,-T,0],[0,-1,T],[0,1,T],[0,-1,-T],[0,1,-T],
            [T,0,-1],[T,0,1],[-T,0,-1],[-T,0,1]].map(norm);
  const F0=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
            [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
  const pts=[], idx=new Map(), nb=[], tris=[];
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
      tris.push([P[i][j],P[i+1][j],P[i+1][j+1]]);
      link(P[i][j],P[i+1][j]); link(P[i][j],P[i+1][j+1]); link(P[i+1][j],P[i+1][j+1]);
      if(j<i) tris.push([P[i][j],P[i+1][j+1],P[i][j+1]]);
    }
  }
  return {pts, nb:nb.map(s=>[...s]), tris};
}
const N = L => 10*4**L + 2;

// ---- 1. what one exposed hex surface costs ---------------------------------
console.log('1. cost of a fully exposed surface, per cell  (caps only, vertices shared)');
console.log('   L   cells   dual verts (hex corners)   cap triangles   verts/cell  tris/cell');
for (let L=1; L<=5; L++){
  const {pts,nb,tris}=geodesic(L);
  const capTris=nb.reduce((s,r)=>s+r.length-2,0);      // fan: degree-2 triangles per cell
  console.log(`   ${L} ${String(pts.length).padStart(7)} ${String(tris.length).padStart(14)}`
    +` ${String(capTris).padStart(15)} ${(tris.length/pts.length).toFixed(3).padStart(12)}`
    +` ${(capTris/pts.length).toFixed(3).padStart(10)}`);
}
console.log('   closed form: dual verts = 2V-4, cap triangles = 4V-12  ->  2 and 4 per cell');
console.log('   a square grid with every top exposed costs 1 vertex and 2 triangles per cell,');
console.log('   so an UNMERGED hex surface is exactly 2x a cube one -- not the disaster');
console.log('   it is usually described as. The gap is entirely about merging.');

// ---- 2. can side faces be merged along the column? -------------------------
// a cell's side face in one direction is the quad between two hexagon corners
// at the top radius and the same two at the bottom radius. Stacked cells share
// that radial plane, so a vertical run should merge exactly.
{
  const {pts,nb,tris}=geodesic(3);
  // hexagon corners around cell v, in ring order
  const centroid=t=>norm(t.reduce((s,i)=>add(s,pts[i]),[0,0,0]));
  const inc=pts.map(()=>[]);
  tris.forEach((t,ti)=>t.forEach(v=>inc[v].push(ti)));
  let worst=0;
  for(let v=0; v<400; v++){
    const c=inc[v].map(ti=>centroid(tris[ti]));
    for(let k=0;k<c.length;k++){
      const a=c[k], b=c[(k+1)%c.length];
      // four corners of a two-layer side face at radii r0>r1>r2
      const q=[mul(a,1.00),mul(b,1.00),mul(b,0.98),mul(a,0.98),mul(b,0.96),mul(a,0.96)];
      const nrm=norm(cross(sub(q[1],q[0]),sub(q[3],q[0])));
      for(const p of q) worst=Math.max(worst, Math.abs(dot(sub(p,q[0]),nrm)));
    }
  }
  console.log('\n2. side faces of vertically stacked cells');
  console.log(`   max deviation from a single plane over 3 layers: ${worst.toExponential(2)} (radii)`);
  console.log('   they are coplanar -- a run of exposed side faces down a column merges into');
  console.log('   ONE quad, exactly, at no geometric cost. Vertical merging is free.');
}

// ---- 3. how wide may a flat merged patch be? -------------------------------
// merging coplanar cells drops the interior vertices that were following the
// sphere, so the patch sags away from the surface by ~ s^2/8R
{
  console.log('\n3. flat-patch sag on a 1,700 m planet with 1 m blocks');
  console.log('   patch span   sag (exact)   s^2/8R   cells across');
  const R=1700, blk=1;
  for (const s of [8,16,32,37,64,128]){
    const exact=R*(1-Math.cos(s/(2*R)));
    console.log(`   ${String(s+' m').padStart(9)} ${exact.toFixed(4).padStart(11)} m`
      +` ${(s*s/(8*R)).toFixed(4).padStart(8)} m ${String(Math.round(s/blk)).padStart(11)}`);
  }
  const budget=b=>Math.sqrt(8*R*b);
  console.log(`   sag = 10% of a block  ->  patch may span ${budget(0.1).toFixed(0)} m`);
  console.log(`   sag = 25% of a block  ->  patch may span ${budget(0.25).toFixed(0)} m`);
  console.log('   merging is limited by curvature, not by the algorithm. A chunk at C=6');
  console.log('   spans 32 cells, which sits just inside the 10%-of-a-block limit.');
}

// ---- 4. do LOD levels share hexagon corners? -------------------------------
// the triangle hierarchy nests exactly, but the mesh is built on the DUAL, so
// the question is whether a coarse hexagon corner is also a fine one
{
  const coarse=geodesic(3), fine=geodesic(4);
  const cen=g=>g.tris.map(t=>norm(t.reduce((s,i)=>add(s,g.pts[i]),[0,0,0])));
  const C=cen(coarse), F=cen(fine);
  // nearest fine corner to each coarse corner
  let max=0, sum=0;
  for(const c of C){
    let best=Infinity;
    for(const f of F){ const d=len(sub(c,f)); if(d<best) best=d; }
    max=Math.max(max,best); sum+=best;
  }
  // typical spacing between neighbouring cells at the coarse level, for scale
  const spacing=len(sub(coarse.pts[0], coarse.pts[coarse.nb[0][0]]));
  console.log('\n4. LOD boundaries: is a coarse hexagon corner also a fine one?');
  console.log(`   coarse corners: ${C.length}   fine corners: ${F.length}`);
  console.log(`   nearest-fine-corner distance: mean ${(sum/C.length/spacing*100).toFixed(2)}%`
              + ` max ${(max/spacing*100).toFixed(2)}% of coarse cell spacing`);
  console.log('   near-coincident but NOT exact: the middle child of a split shares its');
  console.log('   parent triangle\'s centroid only when the triangle is equilateral, and');
  console.log('   subdivided triangles are not. But the mismatch is under 1% of a cell,');
  console.log('   so the SPHERE contributes almost nothing to an LOD seam. See section 5.');
}

// ---- 5. what actually opens an LOD seam: terrain sampled twice --------------
// the base sphere lines up to within 1% of a cell (section 4), so a crack at an
// LOD boundary is terrain evaluated at two spacings, not geometry that fails to
// meet. Skirt depth follows from that, and nothing else.
{
  const R=1700, blk=1, D=11;
  // the pinned hash: three wrapping uint32 multiplies, two xor-shifts, /2^32.
  // No float multiply past 2^53, so every language computes the same planet.
  const hash=(x,y,z)=>{let h=(Math.imul(x|0,374761393)+Math.imul(y|0,668265263)
    +Math.imul(z|0,1274126177))>>>0;
    h=(h^(h>>>13))>>>0; h=Math.imul(h,1274126177)>>>0;
    return ((h^(h>>>16))>>>0)/4294967296;};
  // quintic fade: smooth in the second derivative too, so shading shows no
  // grid at the lattice planes.
  const smooth=t=>t*t*t*(t*(t*6-15)+10);
  function value3(p){                       // trilinear value noise
    const f=p.map(Math.floor), d=p.map((x,i)=>smooth(x-f[i]));
    let s=0;
    for(let i=0;i<8;i++){
      const c=[f[0]+(i&1), f[1]+((i>>1)&1), f[2]+((i>>2)&1)];
      const w=(i&1?d[0]:1-d[0])*((i>>1)&1?d[1]:1-d[1])*((i>>2)&1?d[2]:1-d[2]);
      s+=w*hash(c[0],c[1],c[2]);
    }
    return s*2-1;
  }
  const fbm=(dir,freq,oct)=>{let a=1,f=freq,s=0,n=0;
    for(let i=0;i<oct;i++){s+=a*value3(dir.map(x=>x*f)); n+=a; a*=0.5; f*=2;} return s/n;};
  const AMP=60;                              // 60 m of relief, a modest landscape
  const height=dir=>AMP*fbm(dir,6,5);

  const {pts}=geodesic(6);                   // a stand-in surface to sample on
  console.log('\n5. LOD seam depth: the same terrain sampled one level apart');
  console.log(`   ${AMP} m of relief, D = ${D}, ${blk} m blocks on a ${R} m planet`);
  console.log('   level  spacing   coarse   mean |dh|   max |dh|   covered by a 1-cell skirt?');
  let allCovered = true;
  for (let L=D; L>=D-4; L--){
    const fine=1.20459*R/2**L, coarse=fine*2;   // doc 06: blockSize = K*R/2^L
    let sum=0, max=0, n=0;
    for(const p of pts){
      // offset a neighbouring sample by one coarse spacing along the surface
      let t=cross(p,[0,0,1]); if(len(t)<1e-6) t=cross(p,[1,0,0]); t=norm(t);
      const q=norm(add(p, mul(t, coarse/R)));
      const d=Math.abs(height(p)-height(q));
      sum+=d; max=Math.max(max,d); n++;
    }
    const covered = max <= coarse;
    allCovered = allCovered && covered;
    console.log(`   ${String(L).padStart(5)} ${fine.toFixed(2).padStart(7)} m`
      +` ${coarse.toFixed(1).padStart(6)} m ${(sum/n).toFixed(3).padStart(9)} m`
      +` ${max.toFixed(3).padStart(9)} m ${(covered?'yes':'NO').padStart(18)}`);
  }
  console.log(`   every level covered: ${allCovered}`);
  console.log('   a skirt one coarse cell deep covers the worst case at every level,');
  console.log('   and costs 2 triangles per boundary cell. Cheaper than stitching, and');
  console.log('   it does not care which level the neighbour chose.');
}

// ---- 6. what is actually on screen, by altitude -----------------------------
{
  const R=1700, D=11, budget=2e6;
  const visibleCells=(h,L)=> N(L)*(1-R/(R+h))/2;
  console.log(`\n6. visible cells by altitude (R = ${R} m, full depth D = ${D})`);
  console.log('   altitude   horizon   cells at D=11   cap tris   finest level within 2M tris');
  for (const h of [1.7,10,50,200,850,1700]){
    const cells=visibleCells(h,D), hor=R*Math.acos(R/(R+h));
    let best=D; while(best>0 && visibleCells(h,best)*4>budget) best--;
    console.log(`   ${String(h+' m').padStart(8)} ${(hor<1000?hor.toFixed(0)+' m':(hor/1000).toFixed(1)+' km').padStart(9)}`
      +` ${Math.round(cells).toLocaleString('en-US').padStart(14)} ${(cells*4/1e6).toFixed(2).padStart(9)}M`
      +` ${String(best).padStart(26)}`);
  }
  console.log('   at eye height the whole visible world is ~21k cells / 84k triangles.');
  console.log('   the near field needs no merging at all; the horizon already did that job.');
}
