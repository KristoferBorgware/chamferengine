// verify the rhombic triacontahedron construction before putting it in the artifact
const T=(1+Math.sqrt(5))/2;
const norm=v=>{const l=Math.hypot(...v);return v.map(x=>x/l);};
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const add=(a,b)=>a.map((x,i)=>x+b[i]);
const mul=(a,s)=>a.map(x=>x*s);
const len=a=>Math.hypot(...a);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);

const V=[[-1,T,0],[1,T,0],[-1,-T,0],[1,-T,0],[0,-1,T],[0,1,T],[0,-1,-T],[0,1,-T],[T,0,-1],[T,0,1],[-T,0,-1],[-T,0,1]].map(norm);
const F=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];

// edges -> adjacent faces
const em=new Map();
F.forEach((f,fi)=>{for(let i=0;i<3;i++){const a=f[i],b=f[(i+1)%3];const k=Math.min(a,b)+'_'+Math.max(a,b);
  if(!em.has(k))em.set(k,{v:[Math.min(a,b),Math.max(a,b)],f:[]}); em.get(k).f.push(fi);}});
console.log('edges:',em.size, 'each with 2 faces:', [...em.values()].every(e=>e.f.length===2));

let planarMax=0, ratios=[];
for(const e of em.values()){
  const v1=V[e.v[0]], v2=V[e.v[1]];
  const c=e.f.map(fi=>mul(F[fi].reduce((s,i)=>add(s,V[i]),[0,0,0]),1/3));
  const m=mul(add(v1,v2),0.5);
  const s=len(m)/len(mul(add(c[0],c[1]),0.5));
  const p=[v1,mul(c[0],s),v2,mul(c[1],s)];
  // planarity: volume of tetra from the 4 pts
  const vol=Math.abs(dot(sub(p[1],p[0]),cross(sub(p[2],p[0]),sub(p[3],p[0]))))/6;
  planarMax=Math.max(planarMax,vol);
  ratios.push(len(sub(p[0],p[2]))/len(sub(p[1],p[3])));
}
console.log('max non-planarity (should be ~0):',planarMax.toExponential(3));
console.log('diagonal ratio min/max:',Math.min(...ratios).toFixed(6),Math.max(...ratios).toFixed(6),' phi =',T.toFixed(6));

// total angular defect sanity for the quad spheres
console.log('RT defect: 20*(360-3*116.565) + 12*(360-5*63.435) =',
  (20*(360-3*116.5650512)+12*(360-5*63.4349488)).toFixed(2));
