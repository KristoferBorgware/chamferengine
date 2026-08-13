const N = 1<<7; // 32x32 per face
function uvLinear(s){ return 2*s-1; }
function uvQuad(s){ return s>=0.5 ? (1/3)*(4*s*s-1) : (1/3)*(1-4*(1-s)*(1-s)); }
function uvTan(s){ const u=2*s-1; return Math.tan(Math.PI/4*u); }
function faceXYZ(f,u,v){
  let p;
  switch(f){
    case 0: p=[1,u,v]; break;  case 1: p=[-u,1,v]; break; case 2: p=[-u,-v,1]; break;
    case 3: p=[-1,-v,-u]; break; case 4: p=[v,-1,-u]; break; case 5: p=[v,u,-1]; break;
  }
  const l=Math.hypot(...p); return p.map(x=>x/l);
}
const ang=(a,b)=>Math.acos(Math.min(1,Math.max(-1,a.reduce((s,x,i)=>s+x*b[i],0))));
function triArea(A,B,C){ // l'Huilier
  const a=ang(B,C), b=ang(A,C), c=ang(A,B), s=(a+b+c)/2;
  const t=Math.tan(s/2)*Math.tan((s-a)/2)*Math.tan((s-b)/2)*Math.tan((s-c)/2);
  return 4*Math.atan(Math.sqrt(Math.max(0,t)));
}
for (const [name,fn] of [['linear',uvLinear],['quadratic',uvQuad],['tangent',uvTan]]){
  let mn=Infinity,mx=0,tot=0;
  for(let f=0;f<6;f++) for(let i=0;i<N;i++) for(let j=0;j<N;j++){
    const S=[i/N,(i+1)/N], T=[j/N,(j+1)/N];
    const P=[[0,0],[1,0],[1,1],[0,1]].map(([a,b])=>faceXYZ(f,fn(S[a]),fn(T[b])));
    const A=triArea(P[0],P[1],P[2])+triArea(P[0],P[2],P[3]);
    mn=Math.min(mn,A); mx=Math.max(mx,A); tot+=A;
  }
  console.log(name.padEnd(10), 'ratio', (mx/mn).toFixed(3), ' total/4pi', (tot/(4*Math.PI)).toFixed(6));
}
