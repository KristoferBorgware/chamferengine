const T=(1+Math.sqrt(5))/2;
const n=v=>{const l=Math.hypot(...v);return v.map(x=>x/l);};
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const V=[[-1,T,0],[1,T,0],[-1,-T,0],[1,-T,0],[0,-1,T],[0,1,T],[0,-1,-T],[0,1,-T],
         [T,0,-1],[T,0,1],[-T,0,-1],[-T,0,1]].map(n);
const F=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
         [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
const CEN=F.map(f=>n(f.reduce((s,i)=>s.map((x,k)=>x+V[i][k]),[0,0,0])));

// ground truth: solve d = a*A + b*B + c*C with a,b,c >= 0
function containing(d){
  for (let fi=0; fi<20; fi++){
    const [A,B,C]=F[fi].map(i=>V[i]);
    const det = A[0]*(B[1]*C[2]-B[2]*C[1]) - A[1]*(B[0]*C[2]-B[2]*C[0]) + A[2]*(B[0]*C[1]-B[1]*C[0]);
    const s=(M)=>M[0]*(M[4]*M[8]-M[5]*M[7])-M[1]*(M[3]*M[8]-M[5]*M[6])+M[2]*(M[3]*M[7]-M[4]*M[6]);
    const a=s([d[0],d[1],d[2],B[0],B[1],B[2],C[0],C[1],C[2]])/det;
    const b=s([A[0],A[1],A[2],d[0],d[1],d[2],C[0],C[1],C[2]])/det;
    const c=s([A[0],A[1],A[2],B[0],B[1],B[2],d[0],d[1],d[2]])/det;
    if (a>=-1e-9 && b>=-1e-9 && c>=-1e-9) return {fi,bary:[a,b,c]};
  }
  return null;
}
let bad=0, N=200000;
for (let k=0;k<N;k++){
  const d=n([Math.random()*2-1,Math.random()*2-1,Math.random()*2-1]);
  const truth=containing(d);
  let best=0; for(let i=1;i<20;i++) if (dot(d,CEN[i])>dot(d,CEN[best])) best=i;
  if (!truth || truth.fi!==best) bad++;
}
console.log(`argmax-centroid picks the containing face: ${N-bad}/${N} correct  (${bad} mismatches)`);
