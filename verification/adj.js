const F=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
         [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
const table = F.map((f,fi) => [0,1,2].map(e => {
  const a=f[e], b=f[(e+1)%3];
  for (let g=0; g<20; g++){
    if (g===fi) continue;
    for (let e2=0; e2<3; e2++){
      const c=F[g][e2], d=F[g][(e2+1)%3];
      if ((a===c&&b===d) || (a===d&&b===c))
        return { face:g, edge:e2, reversed: (a===d&&b===c) ? 1 : 0 };
    }
  }
}));
console.log('face  edge0            edge1            edge2');
table.slice(0,4).forEach((row,fi)=>console.log(
  String(fi).padStart(3),
  row.map(l=>`-> f${String(l.face).padStart(2)} e${l.edge} ${l.reversed?'rev':'   '}`).join('  ')));
const flat = table.flat();
console.log(`\n${flat.length} entries · every edge matched: ${flat.every(Boolean)}`);
console.log('all reversed (consistent winding):', flat.every(l=>l.reversed===1));
console.log('bytes at 3 fields x 1 byte:', flat.length*3);
