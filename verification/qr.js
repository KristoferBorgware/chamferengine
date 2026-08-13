// walk (i,j) at depth D down C levels -> path digits + leftover (q,r) + orientation
function split(i, j, D, C){
  let n = 1<<D, path = [], flip = 0;
  for (let l=0; l<C; l++){
    const half = n>>1;
    let d;
    if      (i >= half){ d=1; i -= half; }
    else if (j >= half){ d=2; j -= half; }
    else if (i + j < half){ d=0; }
    else { d=3; i = half - i; j = half - j; flip ^= 1; }
    path.push(d); n = half;
  }
  return {path, q:i, r:j, flip};
}
// rebuild (i,j) from path + (q,r)
function join(path, q, r, D){
  let n = 1 << (D - path.length), i = q, j = r;
  for (let l = path.length-1; l >= 0; l--){
    const d = path[l];
    if      (d===1) i += n;
    else if (d===2) j += n;
    else if (d===3){ i = n - i; j = n - j; }
    n <<= 1;
  }
  return [i,j];
}
const D=8, C=4, n=1<<D;
let ok=0, tot=0, maxq=0, flips=0;
for (let i=0;i<=n;i++) for (let j=0;i+j<=n;j++){
  const s = split(i,j,D,C);
  const [i2,j2] = join(s.path, s.q, s.r, D);
  tot++; if (i2===i && j2===j) ok++;
  maxq = Math.max(maxq, s.q, s.r);
  flips += s.flip;
}
console.log(`round-trip: ${ok}/${tot} exact`);
console.log(`leftover q,r range 0..${maxq}  (chunk side = ${1<<(D-C)})`);
console.log(`${flips} of ${tot} points sit in a flipped (middle-child) frame`);
