const rows=[];
for (let L=0; L<=20; L++){
  const N = 10*Math.pow(4,L)+2;
  for (const [name,R] of [['Earth 6371km',6371000],['small 10km',10000]]){
    const A = 4*Math.PI*R*R/N;            // m^2 per cell
    const d = Math.sqrt(2*A/Math.sqrt(3)); // centre-to-centre spacing, m
    rows.push({L,N,name,d});
  }
}
const fmt=n=> n<1?(n*100).toFixed(1)+' cm' : n<1000?n.toFixed(1)+' m' : (n/1000).toFixed(1)+' km';
const fmtN=n=> n<1e6?n.toLocaleString('en-US'):n.toExponential(2);
console.log('L'.padStart(3), 'cells'.padStart(11), '  Earth spacing', '   10km-planet spacing');
for (let L=0;L<=20;L++){
  const a=rows.find(r=>r.L===L&&r.name.startsWith('Earth')), b=rows.find(r=>r.L===L&&r.name.startsWith('small'));
  console.log(String(L).padStart(3), fmtN(a.N).padStart(11), fmt(a.d).padStart(15), fmt(b.d).padStart(20));
}
console.log('\nbit budget, 64-bit id: 5 bits face + 2 bits/level ->', Math.floor((64-5)/2), 'levels max');
console.log('storage at 1 byte/cell, level 15:', (10*Math.pow(4,15)/1e9).toFixed(1),'GB');
