// Can the 4 children of a midpoint-split triangle be visited edge-to-edge?
// children: T0=(A,ab,ca) T1=(ab,B,bc) T2=(ca,bc,C) T3=(ab,bc,ca)
const ch = { T0:['A','ab','ca'], T1:['ab','B','bc'], T2:['ca','bc','C'], T3:['ab','bc','ca'] };
const keys = Object.keys(ch);
const sharesEdge = (a,b) => ch[a].filter(v => ch[b].includes(v)).length === 2;
for (const a of keys) console.log(a, '->', keys.filter(b => b!==a && sharesEdge(a,b)).join(',') || '(none)');

// brute force: is there an ordering where every consecutive pair is edge-adjacent?
const perm = (arr) => arr.length<=1 ? [arr] : arr.flatMap((x,i)=>perm([...arr.slice(0,i),...arr.slice(i+1)]).map(p=>[x,...p]));
const best = perm(keys).map(p => ({p, adj: p.slice(1).filter((x,i)=>sharesEdge(p[i],x)).length}))
                       .sort((a,b)=>b.adj-a.adj)[0];
console.log('\nbest ordering:', best.p.join(' -> '), '| adjacent steps:', best.adj, 'of 3');
