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
// doc 03's word is [planet 12][face 5][path 2D][corner 2][layer 10]; solve for D.
// Earlier drafts of this line counted the face and the path alone and printed 29,
// which is the ceiling of a word that holds nothing but a surface address.
{
  const D = Math.floor((64 - 12 - 5 - 2 - 10) / 2);
  console.log('\nbit budget, 64-bit word [planet 12][face 5][path 2D][corner 2][layer 10]');
  console.log('   ->', D, 'levels max  (' + fmtN(10*Math.pow(4,D)+2), 'cells per layer)');
  console.log('   face + path alone would say', Math.floor((64-5)/2) + ', which pays for neither');
  console.log('   the planet field nor the 2-bit corner that names a vertex.');
}
console.log('storage at 1 byte/cell, level 15:', (10*Math.pow(4,15)/1e9).toFixed(1),'GB');
