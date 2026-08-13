// Gravity and orientation: the local frame, its holonomy, and what the grid's
// 720 degrees does to direction indices. Backs docs/13-gravity-and-orientation.md
const T=(1+Math.sqrt(5))/2, DEG=180/Math.PI;
const norm=v=>{const l=Math.hypot(...v);return v.map(x=>x/l);};
const add=(a,b)=>a.map((x,i)=>x+b[i]);
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const mul=(a,s)=>a.map(x=>x*s);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const angle=(a,b)=>Math.atan2(Math.hypot(...cross(a,b)),dot(a,b));
const tang=(v,u)=>sub(v,mul(u,dot(v,u)));            // component of v tangent at u

// ---- 1. continuous transport: holonomy of a loop == solid angle it encloses --
// swing (twist-free) rotation carrying u to v, applied to t
function swing(u,v,t){
  const ax=cross(u,v), s=Math.hypot(...ax);
  if (s<1e-15) return t.slice();
  const k=mul(ax,1/s), th=Math.atan2(s,dot(u,v)), c=Math.cos(th), si=Math.sin(th);
  return add(add(mul(t,c),mul(cross(k,t),si)),mul(k,dot(k,t)*(1-c)));
}
function holonomy(theta,steps){
  const p=f=>[Math.sin(theta)*Math.cos(f),Math.sin(theta)*Math.sin(f),Math.cos(theta)];
  let cur=p(0), t=norm(tang([0,0,1],cur));           // start pointing "north"
  const t0=t.slice(), b0=cross(cur,t0);
  for(let k=1;k<=steps;k++){const nx=p(2*Math.PI*k/steps); t=swing(cur,nx,t); cur=nx;}
  const a=Math.atan2(dot(t,b0),dot(t,t0));
  return ((a % (2*Math.PI)) + 2*Math.PI) % (2*Math.PI);
}
console.log('1. parallel transport around a circle of colatitude t (unit sphere)');
console.log('   (holonomy is an angle mod one full turn, so both are compared mod 360)');
console.log('   colat   holonomy   solid angle 2pi(1-cos t)   diff');
for (const th of [10,30,60,90,120]){
  const h=holonomy(th/DEG,200000)*DEG, o=(2*Math.PI*(1-Math.cos(th/DEG)))*DEG;
  const d=((h-o)%360+540)%360-180;
  console.log(`   ${String(th).padStart(4)}deg ${h.toFixed(4).padStart(10)}deg ${o.toFixed(4).padStart(14)}deg  ${d.toExponential(2).padStart(10)}`);
}

// ---- the grid: cells are vertices of the subdivided icosahedron -------------
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
  // neighbours ordered counter-clockwise as seen from outside
  const rings=pts.map((u,v)=>{
    const ns=[...nb[v]], e1=norm(tang(pts[ns[0]],u)), e2=cross(u,e1);
    return ns.map(w=>{const d=tang(pts[w],u); return [w,Math.atan2(dot(d,e2),dot(d,e1))];})
             .sort((a,b)=>a[1]-b[1]).map(a=>a[0]);
  });
  return {pts,rings};
}

// ---- 2. where the 720 degrees actually sits, geometrically vs combinatorially
console.log('\n2. the 720deg, two ways  (cells = vertices of the subdivided icosahedron)');
console.log('   L   cells  pent  GEOMETRIC defect/pentagon   720/N    total     COMBINATORIAL 6-deg  total');
for (let L=1; L<=5; L++){
  const {pts,rings}=geodesic(L);
  const defect=v=>{const r=rings[v]; let s=0;
    for(let k=0;k<r.length;k++) s+=angle(sub(pts[r[k]],pts[v]),sub(pts[r[(k+1)%r.length]],pts[v]));
    return 2*Math.PI-s;};
  const pent=rings.map((r,v)=>[r.length,v]).filter(a=>a[0]===5).map(a=>a[1]);
  const tot=pts.reduce((s,_,v)=>s+defect(v),0)*DEG;
  const combo=rings.reduce((s,r)=>s+(6-r.length),0);
  console.log(`   ${L} ${String(pts.length).padStart(7)} ${String(pent.length).padStart(5)}`
    +`   ${(defect(pent[0])*DEG).toFixed(4).padStart(11)}deg ${(720/pts.length).toFixed(4).padStart(8)}deg`
    +` ${tot.toFixed(3).padStart(9)}deg`
    +`   ${String(6-rings[pent[0]].length).padStart(10)} unit ${String(combo*60).padStart(7)}deg`);
}
console.log('   geometric defect shrinks ~4x per level; the combinatorial unit never does.');

// ---- 3. discrete transport of a direction index around one cell -------------
// heading h at A is an index into A's CCW ring; step A->B keeps the heading's
// angle to the path, which on a degree-6 cell is exact.
function transport(rings,C){
  const loop=rings[C];
  if (loop.some(v=>rings[v].length!==6)) return null;   // rule needs even degree
  const h0=rings[loop[0]].indexOf(C); let h=h0;
  for(let k=0;k<loop.length;k++){
    const A=loop[k], B=loop[(k+1)%loop.length];
    const m=rings[A].indexOf(B), j=rings[B].indexOf(A);
    h=(j+3+(((h-m)%6)+6)%6)%6;
  }
  return ((h-h0)%6+6)%6;
}
{
  const {pts,rings}=geodesic(4);
  const pent=rings.map((r,v)=>[r.length,v]).filter(a=>a[0]===5).map(a=>a[1]);
  const near=new Set(pent.flatMap(v=>rings[v]));
  const hex=rings.map((r,v)=>v).filter(v=>rings[v].length===6 && !near.has(v));
  const ps=pent.map(v=>transport(rings,v)), hs=hex.map(v=>transport(rings,v));
  console.log('\n3. walk the ring of one cell, carrying a direction index (level 4)');
  console.log(`   around each of the 12 pentagons: slip = ${[...new Set(ps)].join(',')} index`
              + `  (= ${[...new Set(ps)][0]*60} deg)`);
  console.log(`   around all ${hex.length} pentagon-free hexagons:  slip = ${[...new Set(hs)].join(',')} index`);
  console.log(`   12 pentagons x 60deg = ${12*60}deg  -- Gauss-Bonnet, in direction-index units`);
  // straight-ahead through a pentagon: no opposite direction exists
  const p0=pent[0], r=rings[p0];
  const a=angle(sub(pts[r[0]],pts[p0]),sub(pts[r[1]],pts[p0]))*DEG;
  console.log(`   pentagon interior angle between adjacent directions: ${a.toFixed(3)}deg`);
  console.log(`   so a line entering a pentagon deflects by ${(180-2*a).toFixed(3)}deg either way -- straight is not an option`);
}

// ---- 4. can the lat/long poles be put ON two pentagons? ---------------------
{
  const V=[[-1,T,0],[1,T,0],[-1,-T,0],[1,-T,0],[0,-1,T],[0,1,T],[0,-1,-T],[0,1,-T],
           [T,0,-1],[T,0,1],[-T,0,-1],[-T,0,1]].map(norm);
  const anti=V.map(v=>V.findIndex(w=>Math.hypot(...add(w,v))<1e-12));
  const pairs=new Set(V.map((_,i)=>[i,anti[i]].sort((a,b)=>a-b).join('-')));
  console.log('\n4. antipodal structure of the pentagons');
  console.log(`   every icosahedron vertex has its negation as a vertex: ${anti.every(i=>i>=0)}`);
  console.log(`   -> the 12 pentagons form ${pairs.size} antipodal pairs: ${[...pairs].join(' ')}`);
  console.log('   so a lat/long axis can be chosen through a pentagon pair: the two');
  console.log('   coordinate poles then land exactly on two of the twelve pentagons.');
}

// ---- 5. what this costs on the worked-example planet ------------------------
const R=1700, blk=1;                         // doc 06 worked example
console.log(`\n5. consequences on the doc-06 planet (R = ${R} m, ${blk} m blocks)`);
console.log('   separation   relative tilt of "up"');
for (const s of [1,10,50,100,500,1000]) console.log(`   ${String(s+' m').padStart(9)}   ${(s/R*DEG).toFixed(3)}deg`);
const hor=h=>R*Math.acos(R/(R+h));
console.log('   eye height   horizon distance   (Earth, R = 6371 km)');
for (const h of [1.7,10,50,200]){
  const e=6371000*Math.acos(6371000/(6371000+h));
  console.log(`   ${String(h+' m').padStart(9)}   ${hor(h).toFixed(0).padStart(6)} m            ${(e/1000).toFixed(1)} km`);
}
for (const [D,C] of [[11,4],[11,6],[11,8]]){
  const span=(1<<(D-C))*blk;
  console.log(`   D=${D} C=${C}: chunk spans ${span} cells -> "up" varies ${(span/R*DEG).toFixed(3)}deg across it`);
}
