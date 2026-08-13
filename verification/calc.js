const K = Math.sqrt(8*Math.PI/(10*Math.sqrt(3)));   // d = K * R / 2^L
console.log('constant K =', K.toFixed(5));
const check=(R,L)=>{ const N=10*4**L+2; const A=4*Math.PI*R*R/N; return Math.sqrt(2*A/Math.sqrt(3)); };
for (const [R,L] of [[10000,13],[6371000,10],[1700,11]])
  console.log(`R=${R} L=${L}  exact d=${check(R,L).toFixed(3)}  formula d=${(K*R/2**L).toFixed(3)}`);
// worked example from the message
const d=1, hours=2, v=1.4;
const circ=hours*3600*v, R=circ/(2*Math.PI);
const Lx=Math.log2(K*R/d), L=Math.round(Lx);
const Rs=d*2**L/K;
console.log(`\ntarget R=${R.toFixed(0)}m  L exact=${Lx.toFixed(2)} -> ${L}  snapped R=${Rs.toFixed(0)}m`);
console.log(`circumference=${(2*Math.PI*Rs/1000).toFixed(2)}km  walk=${(2*Math.PI*Rs/v/3600).toFixed(2)}h  cells=${(10*4**L+2).toLocaleString('en-US')}`);
