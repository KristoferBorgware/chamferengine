#!/usr/bin/env node
// Generates every diagram in docs/figures/ as a standalone, theme-aware SVG.
//
//   node tools/make-figures.js
//
// The figures are generated rather than drawn so their geometry comes from the
// same constructions the specification describes: real barycentric lattices,
// real duals, real icosahedron coordinates. If a figure disagrees with the
// maths, it is because the maths changed, and re-running this fixes it.
//
// Each file is self-contained: no external CSS, no fonts, its own dark-mode
// block. That way GitHub, the generated site and the single-file bundle all
// render the same picture.

const fs = require('fs');
const path = require('path');
const OUT = path.resolve(__dirname, '..', 'docs', 'figures');
fs.mkdirSync(OUT, { recursive: true });

// ---- shared ink -------------------------------------------------------------
const STYLE = `<style>
  .cf-l{stroke:#9aa3b2;fill:none;stroke-width:1}
  .cf-m{stroke:#48505f;fill:none;stroke-width:1.5}
  .cf-fill{fill:#eceff5;stroke:#48505f;stroke-width:1.5}
  .cf-a{stroke:#2f6fd0;fill:none;stroke-width:2}
  .cf-af{fill:#dbe5f5;stroke:#2f6fd0;stroke-width:2}
  .cf-g{stroke:#b0800f;fill:none;stroke-width:2}
  .cf-gf{fill:#f5ead0;stroke:#b0800f;stroke-width:2}
  .cf-void{fill:#ffffff;stroke:#48505f;stroke-width:1.5}
  text{font-family:ui-sans-serif,-apple-system,"Segoe UI",Roboto,Helvetica,sans-serif;font-size:12px;fill:#39404d}
  text.cf-d{fill:#77808f;font-size:11.5px}
  text.cf-c{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;fill:#2f6fd0}
  text.cf-gd{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;fill:#b0800f}
  text.cf-big{font-size:14px;font-weight:600}
  @media (prefers-color-scheme:dark){
    .cf-l{stroke:#5c6577} .cf-m{stroke:#aeb6c4} .cf-fill{fill:#1b2333;stroke:#aeb6c4}
    .cf-a{stroke:#6aa2f0} .cf-af{fill:#1a2942;stroke:#6aa2f0}
    .cf-g{stroke:#e0b355} .cf-gf{fill:#2a2210;stroke:#e0b355}
    .cf-void{fill:#0f141d;stroke:#aeb6c4}
    text{fill:#d3d9e4} text.cf-d{fill:#98a1b2} text.cf-c{fill:#6aa2f0} text.cf-gd{fill:#e0b355}
  }
</style>`;

function svg(name, w, h, body){
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
${STYLE}
${body}
</svg>
`;
  fs.writeFileSync(path.join(OUT, name + '.svg'), doc);
  return name;
}

// ---- geometry helpers -------------------------------------------------------
const f = n => (+n).toFixed(1);
const pts = a => a.map(p => `${f(p[0])},${f(p[1])}`).join(' ');
const pathOf = segs => segs.map(([a,b]) => `M${f(a[0])} ${f(a[1])}L${f(b[0])} ${f(b[1])}`).join('');

const tri = (cx, cy, s) => {
  const h = s*Math.sqrt(3)/2;
  return { A:[cx, cy-2*h/3], B:[cx-s/2, cy+h/3], C:[cx+s/2, cy+h/3] };
};
const bary = (T,n,i,j) => [
  (T.A[0]*(n-i) + T.B[0]*(i-j) + T.C[0]*j)/n,
  (T.A[1]*(n-i) + T.B[1]*(i-j) + T.C[1]*j)/n ];
function latticeEdges(T, n){
  const segs = [], seen = new Set();
  const push = (a,b) => {
    const k = [a,b].map(p=>p.map(f).join()).sort().join('|');
    if (!seen.has(k)) { seen.add(k); segs.push([a,b]); }
  };
  for (let i=0;i<n;i++) for (let j=0;j<=i;j++){
    const a=bary(T,n,i,j), b=bary(T,n,i+1,j), c=bary(T,n,i+1,j+1);
    push(a,b); push(a,c); push(b,c);
  }
  return segs;
}
// pointy-top hexagon
const hexPts = (cx,cy,R) => Array.from({length:6}, (_,i) => {
  const a = -Math.PI/2 + Math.PI*i/3;
  return [cx + R*Math.cos(a), cy + R*Math.sin(a)];
});
// a wheel of n triangles meeting at a point, plus the polygon their centroids form
function wheel(cx, cy, n, R){
  const spokes=[], rim=[], cent=[];
  for (let i=0;i<n;i++){
    const a0=-Math.PI/2+2*Math.PI*i/n, a1=-Math.PI/2+2*Math.PI*(i+1)/n;
    const p0=[cx+R*Math.cos(a0), cy+R*Math.sin(a0)], p1=[cx+R*Math.cos(a1), cy+R*Math.sin(a1)];
    spokes.push([[cx,cy],p0]); rim.push([p0,p1]);
    cent.push([(cx+p0[0]+p1[0])/3, (cy+p0[1]+p1[1])/3]);
  }
  return { spokes: pathOf(spokes), rim: pathOf(rim), dual: pts(cent) };
}

const made = [];

// =============================================================================
// 00 / 02 — where the 720 degrees lands
// =============================================================================
{
  // Three squares laid flat around one corner. They tile three quadrants and
  // leave the fourth empty: that empty quadrant IS the 90 degrees of defect.
  const S = 42;
  const sq = (ox,oy,k) => {
    const ang = k*Math.PI/2;
    const p=[[0,0],[S,0],[S,S],[0,S]].map(([x,y])=>{
      const c=Math.cos(ang), si=Math.sin(ang);
      return [ox + x*c - y*si, oy + x*si + y*c];
    });
    return `<polygon class="cf-fill" points="${pts(p)}"/>`;
  };
  const CX=100, CY=96;
  const cube = [0,1,2].map(k => sq(CX, CY, k)).join('');
  const w5 = wheel(300, 96, 5, 44);
  made.push(svg('defect-where-it-lands', 400, 236, `
  <g>
    ${cube}
    <path class="cf-g" d="M${CX+S} ${CY} A ${S} ${S} 0 0 0 ${CX} ${CY-S}" stroke-dasharray="4 3"/>
    <text class="cf-gd" x="${CX+S/2+6}" y="${CY-S/2-4}">gap</text>
    <circle cx="${CX}" cy="${CY}" r="4" fill="#b0800f"/>
    <text class="cf-d" x="${CX}" y="26" text-anchor="middle">a cube corner</text>
    <text x="${CX}" y="172" text-anchor="middle">3 x 90&#176; = 270&#176;</text>
    <text class="cf-gd" x="${CX}" y="192" text-anchor="middle">90&#176; short, at 8 corners</text>
  </g>
  <g>
    <path class="cf-l" d="${w5.spokes}"/>
    <path class="cf-m" d="${w5.rim}"/>
    <polygon class="cf-af" points="${w5.dual}"/>
    <circle cx="300" cy="96" r="4" fill="#2f6fd0"/>
    <text class="cf-d" x="300" y="26" text-anchor="middle">a pentagon cell</text>
    <text x="300" y="172" text-anchor="middle">5 x 60&#176; = 300&#176;</text>
    <text class="cf-c" x="300" y="192" text-anchor="middle">60&#176; short, at 12 pentagons</text>
  </g>
  <text class="cf-d" x="200" y="224" text-anchor="middle">8 x 90&#176; = 12 x 60&#176; = 720&#176;, either way</text>`));
}

// =============================================================================
// 02 — six triangles make a hexagon, five make a pentagon
// =============================================================================
{
  const w6 = wheel(96, 82, 6, 52), w5 = wheel(292, 82, 5, 52);
  made.push(svg('hexagon-and-pentagon', 390, 172, `
  <g>
    <path class="cf-l" d="${w6.spokes}"/><path class="cf-m" d="${w6.rim}"/>
    <polygon class="cf-af" points="${w6.dual}"/>
    <circle cx="96" cy="82" r="4" fill="#2f6fd0"/>
    <text x="96" y="158" text-anchor="middle">6 triangles &#8594; hexagon</text>
    <text class="cf-d" x="96" y="20" text-anchor="middle">everywhere else</text>
  </g>
  <g>
    <path class="cf-l" d="${w5.spokes}"/><path class="cf-m" d="${w5.rim}"/>
    <polygon class="cf-gf" points="${w5.dual}"/>
    <circle cx="292" cy="82" r="4" fill="#b0800f"/>
    <text x="292" y="158" text-anchor="middle">5 triangles &#8594; pentagon</text>
    <text class="cf-gd" x="292" y="20" text-anchor="middle">12 places, forever</text>
  </g>`));
}

// =============================================================================
// 03 — subdivision: one triangle into four, and into sixteen
// =============================================================================
{
  const T0=tri(70,70,112), T1=tri(215,70,112), T2=tri(360,70,112);
  const mid = [bary(T1,2,1,0), bary(T1,2,1,1), bary(T1,2,2,1)];
  made.push(svg('subdivision-steps', 430, 140, `
  <polygon class="cf-fill" points="${pts([T0.A,T0.B,T0.C])}"/>
  <polygon class="cf-fill" points="${pts([T1.A,T1.B,T1.C])}"/>
  <polygon class="cf-fill" points="${pts([T2.A,T2.B,T2.C])}"/>
  <polygon class="cf-af" points="${pts(mid)}"/>
  <path class="cf-l" d="${pathOf(latticeEdges(T1,2))}"/>
  <path class="cf-l" d="${pathOf(latticeEdges(T2,4))}"/>
  <text class="cf-d" x="${f(bary(T1,2,0,0)[0])}" y="${f(bary(T1,2,0,0)[1]+26)}" text-anchor="middle">0</text>
  <text class="cf-d" x="${f(bary(T1,2,2,0)[0]+14)}" y="${f(bary(T1,2,2,0)[1]-8)}" text-anchor="middle">1</text>
  <text class="cf-d" x="${f(bary(T1,2,2,2)[0]-14)}" y="${f(bary(T1,2,2,2)[1]-8)}" text-anchor="middle">2</text>
  <text class="cf-c" x="215" y="76" text-anchor="middle">3</text>
  <text class="cf-d" x="70"  y="132" text-anchor="middle">level 0 &#183; 1 triangle</text>
  <text class="cf-d" x="215" y="132" text-anchor="middle">level 1 &#183; 4</text>
  <text class="cf-d" x="360" y="132" text-anchor="middle">level 2 &#183; 16</text>`));
}

// =============================================================================
// 03 — cells sit on the corners; the hexagon is the territory
// =============================================================================
{
  const D=34, OX=40, OY=30;
  const pos=(q,r)=>[OX+(q+r/2)*D, OY+r*D*Math.sqrt(3)/2];
  const range=[]; for(let r=0;r<=5;r++) for(let q=-4;q<=9;q++) range.push([q,r]);
  const has=(q,r)=>range.some(([a,b])=>a===q&&b===r);
  const tris=[];
  for(const [q,r] of range){
    for (const t of [[[q,r],[q+1,r],[q,r+1]], [[q+1,r],[q,r+1],[q+1,r+1]]])
      if (t.every(([a,b])=>has(a,b))) tris.push(t);
  }
  const cen=t=>{const p=t.map(([q,r])=>pos(q,r));
    return [(p[0][0]+p[1][0]+p[2][0])/3,(p[0][1]+p[1][1]+p[2][1])/3];};
  const seen=new Set(), edges=[];
  for(const t of tris) for(let i=0;i<3;i++){
    const a=t[i], b=t[(i+1)%3], k=[a.join(),b.join()].sort().join('|');
    if(!seen.has(k)){seen.add(k); edges.push([pos(...a),pos(...b)]);}
  }
  const hexes=[], dots=[];
  for(const [q,r] of range){
    const inc=tris.filter(t=>t.some(([a,b])=>a===q&&b===r));
    if(inc.length!==6) continue;
    const c=pos(q,r);
    const ring=inc.map(cen).sort((u,v)=>
      Math.atan2(u[1]-c[1],u[0]-c[0])-Math.atan2(v[1]-c[1],v[0]-c[0]));
    hexes.push({c, ring}); dots.push(c);
  }
  const pick = hexes[Math.floor(hexes.length/2)];
  made.push(svg('cells-on-corners', 330, 168, `
  <clipPath id="c1"><rect x="8" y="8" width="314" height="152" rx="4"/></clipPath>
  <g clip-path="url(#c1)">
    <path class="cf-l" d="${pathOf(edges)}"/>
    ${hexes.map(h=>`<polygon class="cf-m" fill="none" points="${pts(h.ring)}" opacity="0.55"/>`).join('')}
    <polygon class="cf-af" points="${pts(pick.ring)}"/>
    ${dots.map(d=>`<circle cx="${f(d[0])}" cy="${f(d[1])}" r="2.4" fill="#77808f"/>`).join('')}
    <circle cx="${f(pick.c[0])}" cy="${f(pick.c[1])}" r="3.8" fill="#2f6fd0"/>
  </g>`));
}

// =============================================================================
// 03 — the address is the route down the splits
// =============================================================================
{
  const T0=tri(70,66,112), T1=tri(215,66,112), T2=tri(360,66,112);
  const childOf = (T,n,i,j) => [bary(T,n,i,j), bary(T,n,i+1,j), bary(T,n,i+1,j+1)];
  made.push(svg('address-is-a-route', 430, 152, `
  <polygon class="cf-af" points="${pts([T0.A,T0.B,T0.C])}"/>
  <polygon class="cf-fill" points="${pts([T1.A,T1.B,T1.C])}"/>
  <polygon class="cf-fill" points="${pts([T2.A,T2.B,T2.C])}"/>
  <polygon class="cf-af" points="${pts(childOf(T1,2,1,0))}"/>
  <polygon class="cf-af" points="${pts(childOf(T2,4,2,0))}"/>
  <path class="cf-l" d="${pathOf(latticeEdges(T1,2))}"/>
  <path class="cf-l" d="${pathOf(latticeEdges(T2,4))}"/>
  <text class="cf-c" x="70"  y="128" text-anchor="middle">7</text>
  <text class="cf-c" x="215" y="128" text-anchor="middle">7 &#183; 1</text>
  <text class="cf-c" x="360" y="128" text-anchor="middle">7 &#183; 1 &#183; 0</text>
  <text class="cf-d" x="70"  y="146" text-anchor="middle">face</text>
  <text class="cf-d" x="215" y="146" text-anchor="middle">+ one digit</text>
  <text class="cf-d" x="360" y="146" text-anchor="middle">+ one more</text>`));
}

// =============================================================================
// 03 — the bit layout, and what truncation does
// =============================================================================
{
  const X=20, Y=42, H=30;
  const parts = [
    { w: 52, label: 'face', sub: '5 bits', cls: 'cf-af' },
    { w: 96, label: 'path digits', sub: '2 bits x C', cls: 'cf-af' },
    { w: 74, label: 'q', sub: 'D-C bits', cls: 'cf-fill' },
    { w: 74, label: 'r', sub: 'D-C bits', cls: 'cf-fill' },
  ];
  let x = X, boxes = '';
  for (const p of parts){
    boxes += `<rect class="${p.cls}" x="${x}" y="${Y}" width="${p.w}" height="${H}" rx="3"/>`
          +  `<text x="${x+p.w/2}" y="${Y+19}" text-anchor="middle">${p.label}</text>`
          +  `<text class="cf-d" x="${x+p.w/2}" y="${Y+H+15}" text-anchor="middle">${p.sub}</text>`;
    x += p.w + 4;
  }
  const chunkEnd = X + 52 + 4 + 96;
  made.push(svg('cell-id-bits', 340, 138, `
  ${boxes}
  <path class="cf-a" d="M${X} ${Y-10} L${chunkEnd} ${Y-10}"/>
  <path class="cf-l" d="M${X} ${Y-14} L${X} ${Y-6} M${chunkEnd} ${Y-14} L${chunkEnd} ${Y-6}"/>
  <text class="cf-c" x="${(X+chunkEnd)/2}" y="${Y-18}" text-anchor="middle">chunk ID</text>
  <path class="cf-l" d="M${chunkEnd+4} ${Y-10} L${x-4} ${Y-10}"/>
  <path class="cf-l" d="M${chunkEnd+4} ${Y-14} L${chunkEnd+4} ${Y-6} M${x-4} ${Y-14} L${x-4} ${Y-6}"/>
  <text class="cf-d" x="${(chunkEnd+x)/2}" y="${Y-18}" text-anchor="middle">where in the chunk</text>
  <text class="cf-d" x="170" y="126" text-anchor="middle">total width is 5 + 2D bits, wherever the cut falls</text>`));
}

// =============================================================================
// 03 — the middle child is upside down
// =============================================================================
{
  const T = tri(120, 92, 150);
  const m = [bary(T,2,1,0), bary(T,2,1,1), bary(T,2,2,1)];
  const corner = [bary(T,2,0,0), bary(T,2,1,0), bary(T,2,1,1)];
  const arrow = (from, to, cls) =>
    `<path class="${cls}" d="M${f(from[0])} ${f(from[1])}L${f(to[0])} ${f(to[1])}" marker-end="url(#ah)"/>`;
  const cOrigin = corner[0], cI = corner[1], cJ = corner[2];
  const mOrigin = m[2], mI = m[1], mJ = m[0];
  const lerp=(a,b,t)=>[a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t];
  made.push(svg('middle-child-flip', 400, 196, `
  <defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
    <path d="M0 0 L10 5 L0 10 z" fill="#2f6fd0"/></marker>
  <marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
    <path d="M0 0 L10 5 L0 10 z" fill="#b0800f"/></marker></defs>
  <polygon class="cf-fill" points="${pts([T.A,T.B,T.C])}"/>
  <path class="cf-l" d="${pathOf(latticeEdges(T,2))}"/>
  <polygon class="cf-gf" points="${pts(m)}"/>
  ${arrow(cOrigin, lerp(cOrigin,cI,0.8), 'cf-a')}
  ${arrow(cOrigin, lerp(cOrigin,cJ,0.8), 'cf-a')}
  <circle cx="${f(cOrigin[0])}" cy="${f(cOrigin[1])}" r="3.5" fill="#2f6fd0"/>
  <path class="cf-g" d="M${f(mOrigin[0])} ${f(mOrigin[1])}L${f(lerp(mOrigin,mI,0.8)[0])} ${f(lerp(mOrigin,mI,0.8)[1])}" marker-end="url(#ag)"/>
  <path class="cf-g" d="M${f(mOrigin[0])} ${f(mOrigin[1])}L${f(lerp(mOrigin,mJ,0.8)[0])} ${f(lerp(mOrigin,mJ,0.8)[1])}" marker-end="url(#ag)"/>
  <circle cx="${f(mOrigin[0])}" cy="${f(mOrigin[1])}" r="3.5" fill="#b0800f"/>
  <text class="cf-c" x="228" y="60">corner child</text>
  <text class="cf-d" x="228" y="76">origin at the top,</text>
  <text class="cf-d" x="228" y="90">axes as expected</text>
  <text class="cf-gd" x="228" y="120">middle child</text>
  <text class="cf-d" x="228" y="136">origin at the bottom,</text>
  <text class="cf-d" x="228" y="150">both axes mirrored</text>
  <text class="cf-d" x="200" y="188" text-anchor="middle">~46% of all cells sit inside a mirrored frame</text>`));
}


// =============================================================================
// 04 — barycentric coordinates are three area fractions
// =============================================================================
{
  const T = tri(112, 106, 158);
  const P = [104, 118];
  const A=T.A, B=T.B, C=T.C;
  const shade = (p1,p2,cls) => `<polygon class="${cls}" points="${pts([P,p1,p2])}"/>`;
  made.push(svg('barycentric-areas', 400, 200, `
  ${shade(B,C,'cf-af')}
  <polygon class="cf-gf" points="${pts([P,C,A])}"/>
  <polygon class="cf-fill" points="${pts([P,A,B])}" opacity="0.85"/>
  <polygon class="cf-m" fill="none" points="${pts([A,B,C])}"/>
  <path class="cf-l" d="${pathOf([[P,A],[P,B],[P,C]])}"/>
  <circle cx="${f(P[0])}" cy="${f(P[1])}" r="4" fill="#48505f"/>
  <text class="cf-d" x="${f(A[0])}" y="${f(A[1]-8)}" text-anchor="middle">A</text>
  <text class="cf-d" x="${f(B[0]-10)}" y="${f(B[1]+6)}" text-anchor="middle">B</text>
  <text class="cf-d" x="${f(C[0]+10)}" y="${f(C[1]+6)}" text-anchor="middle">C</text>
  <text class="cf-c" x="232" y="56">a  = area of PBC / total</text>
  <text class="cf-gd" x="232" y="80">b  = area of PCA / total</text>
  <text class="cf-d" x="232" y="104">c  = area of PAB / total</text>
  <text x="232" y="136">a + b + c = 1, always</text>
  <text class="cf-d" x="232" y="158">each weight is the area of the</text>
  <text class="cf-d" x="232" y="174">sub-triangle OPPOSITE its corner</text>`));
}

// =============================================================================
// 05 — two faces, two frames, one cell on the seam
// =============================================================================
{
  const A=[92,26], B=[34,124], C=[150,124];        // face 1, apex up
  const A2=[92,222];                                // face 2, mirrored across BC
  const lerp=(u,v,t)=>[u[0]+(v[0]-u[0])*t, u[1]+(v[1]-u[1])*t];
  const seam = lerp(B,C,0.62);                      // one physical cell on the shared edge
  const ax = (o,i,j,cls,mk) =>
    `<path class="${cls}" d="M${f(o[0])} ${f(o[1])}L${f(lerp(o,i,0.42)[0])} ${f(lerp(o,i,0.42)[1])}" marker-end="url(#${mk})"/>`
  + `<path class="${cls}" d="M${f(o[0])} ${f(o[1])}L${f(lerp(o,j,0.42)[0])} ${f(lerp(o,j,0.42)[1])}" marker-end="url(#${mk})"/>`
  + `<circle cx="${f(o[0])}" cy="${f(o[1])}" r="4.5" fill="none" stroke="${cls==='cf-a'?'#2f6fd0':'#b0800f'}" stroke-width="2"/>`;
  made.push(svg('two-faces-two-frames', 400, 252, `
  <defs>
    <marker id="m1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="#2f6fd0"/></marker>
    <marker id="m2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="#b0800f"/></marker>
  </defs>
  <polygon class="cf-fill" points="${pts([A,B,C])}"/>
  <polygon class="cf-fill" points="${pts([B,C,A2])}"/>
  <path class="cf-m" d="M${f(B[0])} ${f(B[1])}L${f(C[0])} ${f(C[1])}" stroke-width="2.5"/>
  ${ax(A,B,C,'cf-a','m1')}
  ${ax(A2,C,B,'cf-g','m2')}
  <circle cx="${f(seam[0])}" cy="${f(seam[1])}" r="5" fill="#b0800f" stroke="#fff" stroke-width="1"/>
  <text class="cf-c" x="176" y="60">face 7</text>
  <text class="cf-c" x="176" y="76">origin at its apex</text>
  <text class="cf-gd" x="176" y="196">face 12</text>
  <text class="cf-gd" x="176" y="212">origin somewhere else</text>
  <text class="cf-d" x="176" y="124">one cell, two addresses</text>
  <text class="cf-d" x="176" y="142">-- the table closes that gap</text>`));
}


// =============================================================================
// 07 — four layers, and only one of them grows
// =============================================================================
{
  const rows = [
    ['constant tables', 'a few KB, fixed at build time', 'cf-af'],
    ['pure functions',  'no storage at all',             'cf-af'],
    ['chunk cache',     'bounded by view distance',      'cf-fill'],
    ['delta store',     'the only thing that grows',     'cf-gf'],
  ];
  const W=210, H=34, X=24;
  let body='';
  rows.forEach((r,i)=>{
    const y = 26 + i*(H+12);
    body += `<rect class="${r[2]}" x="${X}" y="${y}" width="${W}" height="${H}" rx="4"/>`
         +  `<text x="${X+12}" y="${y+22}">${r[0]}</text>`
         +  `<text class="cf-d" x="${X+W+14}" y="${y+22}">${r[1]}</text>`;
  });
  made.push(svg('four-layers', 460, 210, body + `
  <path class="cf-g" d="M${X-10} ${26+3*(H+12)} L${X-10} ${26+3*(H+12)+H}"/>
  <text class="cf-gd" x="14" y="${26+3*(H+12)+22}" text-anchor="middle"></text>`));
}

// =============================================================================
// 08 — height field against density field
// =============================================================================
{
  // A radial slice. The height field gives one surface per column; the density
  // field lets noise fight the radial bias, which opens caves and overhangs.
  const groundA = 'M20 78 L52 66 L84 84 L116 70 L148 86 L180 74';
  const box = (x,label) => `<text class="cf-d" x="${x}" y="30" text-anchor="middle">${label}</text>`;
  made.push(svg('height-field-vs-density', 400, 200, `
  ${box(100,'height field')}
  <path class="cf-fill" d="${groundA} L180 150 L20 150 Z"/>
  <path class="cf-m" d="${groundA}"/>
  <text class="cf-c" x="100" y="176" text-anchor="middle">one surface per column</text>
  <text class="cf-d" x="100" y="192" text-anchor="middle">no caves, ever</text>

  ${box(300,'density field')}
  <path class="cf-fill" d="M220 78 L252 66 L284 84 L316 70 L348 86 L380 74 L380 150 L220 150 Z"/>
  <path class="cf-m" d="M220 78 L252 66 L284 84 L316 70 L348 86 L380 74"/>
  <ellipse class="cf-void" cx="268" cy="112" rx="26" ry="11"/>
  <ellipse class="cf-void" cx="340" cy="122" rx="20" ry="9"/>
  <text class="cf-c" x="300" y="176" text-anchor="middle">solid where density &gt; 0</text>
  <text class="cf-d" x="300" y="192" text-anchor="middle">caves, overhangs, islands</text>`));
}

// =============================================================================
// 09 — a ray's ground track is straight in face coordinates
// =============================================================================
{
  const D=26, OX=44, OY=44;
  const pos=(q,r)=>[OX+(q+r/2)*D, OY+r*D*Math.sqrt(3)/2];
  const cells=[]; for(let r=0;r<5;r++) for(let q=0;q<8;q++) cells.push(pos(q,r));
  const hexes = cells.map(c=>`<polygon class="cf-l" points="${pts(hexPts(c[0],c[1],D/Math.sqrt(3)))}"/>`).join('');
  const eye=[36,150], aim=[268,40];
  const hit=[218,66];
  made.push(svg('ray-is-straight', 330, 200, `
  <defs><marker id="ra" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
    <path d="M0 0 L10 5 L0 10 z" fill="#2f6fd0"/></marker></defs>
  ${hexes}
  <polygon class="cf-gf" points="${pts(hexPts(hit[0],hit[1],D/Math.sqrt(3)))}"/>
  <path class="cf-a" d="M${eye[0]} ${eye[1]} L${aim[0]} ${aim[1]}" marker-end="url(#ra)"/>
  <circle cx="${eye[0]}" cy="${eye[1]}" r="4" fill="#2f6fd0"/>
  <text class="cf-c" x="14" y="168">eye</text>
  <text class="cf-gd" x="234" y="60">hit</text>
  <text class="cf-d" x="165" y="190" text-anchor="middle">the ground track is a straight line, exactly -- not approximately</text>`));
}


// =============================================================================
// 13 — three frames, three jobs
// =============================================================================
{
  const panel = (x, title, body, note) =>
    `<text class="cf-d" x="${x+62}" y="20" text-anchor="middle">${title}</text>${body}`
  + `<text class="cf-d" x="${x+62}" y="152" text-anchor="middle">${note}</text>`;
  const globe = (cx,cy,r) => `<circle class="cf-fill" cx="${cx}" cy="${cy}" r="${r}"/>`;
  // 1: axis frame -- meridians converging on two poles
  let mer = '';
  for (let k=-2;k<=2;k++) mer += `<path class="cf-l" d="M64 34 Q${64+k*26} 76 64 118"/>`;
  // 2: transported frame -- a path with a carried arrow that turns with it
  const arrow=(x,y,dx,dy)=>`<path class="cf-a" d="M${x} ${y} l${dx} ${dy}" marker-end="url(#f1)"/>`;
  // 3: grid frame -- a hexagon with its six numbered directions
  const H=hexPts(316,76,34);
  let spokes='', nums='';
  for (let i=0;i<6;i++){
    const a=-Math.PI/2+Math.PI*i/3+Math.PI/6;
    const x=316+27*Math.cos(a), y=76+27*Math.sin(a);
    spokes += `<path class="cf-l" d="M316 76 L${f(x)} ${f(y)}"/>`;
    nums += `<text class="cf-c" x="${f(316+40*Math.cos(a))}" y="${f(76+40*Math.sin(a)+4)}" text-anchor="middle">${i}</text>`;
  }
  made.push(svg('three-frames', 400, 164, `
  <defs><marker id="f1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
    <path d="M0 0 L10 5 L0 10 z" fill="#2f6fd0"/></marker></defs>
  ${panel(2,'axis frame', globe(64,76,42) + mer
    + `<circle cx="64" cy="34" r="4" fill="#b0800f"/><circle cx="64" cy="118" r="4" fill="#b0800f"/>`,
    'breaks at 2 poles')}
  ${panel(128,'transported', globe(190,76,42)
    + `<path class="cf-g" d="M158 96 Q190 56 222 92" fill="none" stroke-dasharray="4 3"/>`
    + arrow(158,96,16,-14) + arrow(214,86,16,10),
    'never breaks, drifts')}
  ${panel(254,'grid frame', `<polygon class="cf-af" points="${pts(H)}"/>${spokes}${nums}`,
    'never breaks, discrete')}`));
}

// =============================================================================
// 14 — what one cell costs, and what merges
// =============================================================================
{
  const H = hexPts(74, 78, 46);
  const R2=30, c1=[248,96], c2=[248+Math.sqrt(3)*R2,96], c3=[248+Math.sqrt(3)*R2/2,96-1.5*R2];
  const share=[c1,c2,c3].map(c=>`<polygon class="cf-l" points="${pts(hexPts(c[0],c[1],R2))}"/>`).join('');
  made.push(svg('cell-mesh-cost', 400, 168, `
  <polygon class="cf-a" points="${pts(H)}"/>
  <path class="cf-m" d="${pathOf([[H[0],H[2]],[H[0],H[3]],[H[0],H[4]]])}"/>
  <circle cx="${f(H[0][0])}" cy="${f(H[0][1])}" r="4.5" fill="#2f6fd0"/>
  <text class="cf-d" x="74" y="148" text-anchor="middle">4 triangles per hexagon</text>
  ${share}
  <circle cx="${f(c1[0]+Math.sqrt(3)*R2/2)}" cy="${f(c1[1]-R2/2)}" r="5.5" fill="#2f6fd0"/>
  <text class="cf-d" x="290" y="148" text-anchor="middle">every corner serves 3 cells</text>
  <text class="cf-c" x="200" y="26" text-anchor="middle">2 vertices and 4 triangles per cell</text>`));

  made.push(svg('vertical-merge', 400, 150, `
  <defs><marker id="v1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
    <path d="M0 0 L10 5 L0 10 z" fill="#2f6fd0"/></marker></defs>
  <g>
    <path class="cf-fill" d="M40 26 L104 26 L104 58 L40 58 Z"/>
    <path class="cf-fill" d="M40 58 L104 58 L104 90 L40 90 Z"/>
    <path class="cf-fill" d="M40 90 L104 90 L104 122 L40 122 Z"/>
    <text class="cf-d" x="72" y="140" text-anchor="middle">3 quads &#183; 6 triangles</text>
  </g>
  <path class="cf-a" d="M150 74 L210 74" marker-end="url(#v1)"/>
  <text class="cf-d" x="180" y="66" text-anchor="middle">merge</text>
  <g>
    <path class="cf-af" d="M256 26 L320 26 L320 122 L256 122 Z"/>
    <text class="cf-c" x="288" y="78" text-anchor="middle">one quad</text>
    <text class="cf-d" x="288" y="140" text-anchor="middle">1 quad &#183; 2 triangles</text>
  </g>
  <text class="cf-d" x="200" y="16" text-anchor="middle">exact to 15 decimal places, and free</text>`));
}

// =============================================================================
// 14 — the LOD seam a skirt cannot close
// =============================================================================
{
  const chunkA = (ox, sealed) => {
    const b = ox + 96;
    return `
    <path class="cf-fill" d="M${ox} ${62} L${ox+22} ${52} L${ox+44} ${68} L${ox+66} ${58} L${b} ${72} L${b} ${132} L${ox} ${132} Z"/>
    <path class="cf-fill" d="M${b} ${104} L${b+48} ${92} L${b+72} ${108} L${b+72} ${132} L${b} ${132} Z"/>
    <clipPath id="cv${ox}"><rect x="${ox}" y="0" width="96" height="160"/></clipPath>
    <g clip-path="url(#cv${ox})"><ellipse class="cf-void" cx="${ox+72}" cy="${100}" rx="34" ry="14"/></g>
    <line class="cf-l" x1="${b}" y1="44" x2="${b}" y2="134" stroke-dasharray="3 3"/>
    <rect class="cf-af" x="${b-2}" y="62" width="4.5" height="18"/>
    ${sealed
      ? `<rect class="cf-af" x="${b-2}" y="88" width="4.5" height="25"/><text class="cf-c" x="${b+8}" y="88">wall</text>`
      : `<line x1="${b}" y1="88" x2="${b}" y2="113" stroke="#b0800f" stroke-width="4"/><text class="cf-gd" x="${b+8}" y="88">open</text>`}
    <text class="cf-c" x="${b+8}" y="58">skirt</text>
    <text class="cf-d" x="${ox+40}" y="102" text-anchor="middle">cave</text>`;
  };
  made.push(svg('lod-seam', 420, 178, `
  ${chunkA(16, false)}
  ${chunkA(228, true)}
  <text class="cf-gd" x="100" y="160" text-anchor="middle">skirt alone &#183; 961 holes</text>
  <text class="cf-c" x="312" y="160" text-anchor="middle">seam owned &#183; 0 holes</text>`));
}

// =============================================================================
// two-constructions -- dividing the chord is not dividing the arc
// =============================================================================
{
  const D2R = Math.PI / 180, O = [214, 250], Rp = 176;
  const half = 31.71747;                       // half the icosahedron edge angle
  const at = d => [O[0] + Rp*Math.sin(d*D2R), O[1] - Rp*Math.cos(d*D2R)];
  const A = at(-half), B = at(half);
  const arcQ = at(-half + 2*half*0.25);        // recursive: quarter of the ARC
  const cq = [A[0] + (B[0]-A[0])*0.25, A[1] + (B[1]-A[1])*0.25];   // quarter of the CHORD
  const dd = Math.hypot(cq[0]-O[0], cq[1]-O[1]);
  const chordQ = [O[0] + (cq[0]-O[0])/dd*Rp, O[1] + (cq[1]-O[1])/dd*Rp];
  made.push(svg('two-constructions', 428, 250, `
  <path class="cf-m" d="M${f(A[0])} ${f(A[1])} A ${f(Rp)} ${f(Rp)} 0 0 1 ${f(B[0])} ${f(B[1])}"/>
  <path class="cf-l" d="M${f(A[0])} ${f(A[1])}L${f(B[0])} ${f(B[1])}" stroke-dasharray="4 3"/>
  <path class="cf-l" d="M${f(O[0])} ${f(O[1])}L${f(A[0])} ${f(A[1])}M${f(O[0])} ${f(O[1])}L${f(B[0])} ${f(B[1])}"/>
  <path class="cf-a" d="M${f(O[0])} ${f(O[1])}L${f(chordQ[0])} ${f(chordQ[1])}" stroke-dasharray="3 3"/>
  <circle class="cf-fill" cx="${f(A[0])}" cy="${f(A[1])}" r="4.5"/>
  <circle class="cf-fill" cx="${f(B[0])}" cy="${f(B[1])}" r="4.5"/>
  <circle class="cf-af" cx="${f(cq[0])}" cy="${f(cq[1])}" r="3.5"/>
  <circle class="cf-af" cx="${f(chordQ[0])}" cy="${f(chordQ[1])}" r="5"/>
  <circle class="cf-gf" cx="${f(arcQ[0])}" cy="${f(arcQ[1])}" r="5"/>
  <text class="cf-big" x="${f(A[0]-14)}" y="${f(A[1]-10)}">A</text>
  <text class="cf-big" x="${f(B[0]+7)}" y="${f(B[1]-10)}">B</text>
  <text class="cf-d" x="${f(cq[0]-6)}" y="${f(cq[1]+16)}" text-anchor="middle">&#188; of the chord</text>
  <text class="cf-c" x="14" y="30">one-shot &#183; divide the chord, then project out</text>
  <text class="cf-c" x="14" y="46">lands 14.5454&#176; from A</text>
  <text class="cf-gd" x="14" y="72">recursive &#183; divide the arc</text>
  <text class="cf-gd" x="14" y="88">lands 15.8587&#176; from A</text>
  <text class="cf-big" x="414" y="30" text-anchor="end">1.3133&#176; apart</text>
  <text class="cf-d" x="414" y="46" text-anchor="end">= 38.97 m on a 1,700 m planet</text>
  <text class="cf-d" x="414" y="62" text-anchor="end">= 39 cells at level 11</text>
  <text class="cf-d" x="${f(O[0])}" y="${f(O[1]+18)}" text-anchor="middle">planet centre</text>`));
}

// =============================================================================
// three-tiers -- which number type holds what
// =============================================================================
{
  const row = (y, tag, kind, note, cls) => `
    <rect class="${cls}" x="14" y="${y}" width="126" height="42" rx="5"/>
    <text class="cf-big" x="77" y="${y+20}" text-anchor="middle">${tag}</text>
    <text class="cf-d" x="77" y="${y+34}" text-anchor="middle">${kind}</text>
    <text x="156" y="${y+25}">${note}</text>`;
  made.push(svg('three-tiers', 520, 176, `
  ${row(12,  'identity',  'integer ID',        'exact at every scale, forever &#8212; never drifts', 'cf-fill')}
  ${row(66,  'world',     'float64',           'under a nanometre at Earth radius', 'cf-af')}
  ${row(120, 'GPU',       'float32, local',    'bounded by the chunk span, so radius drops out', 'cf-gf')}
  <path class="cf-l" d="M77 54L77 66M77 108L77 120" stroke-dasharray="3 3"/>`));
}

// =============================================================================
// light-discs -- a ring at radius k holds 6k cells, or 5k at a pentagon
// =============================================================================
{
  const R = 4, U = 19;                            // rings drawn, pixels per ring
  const disc = (cx, cy, deg) => {
    let s = `<circle class="${deg === 6 ? 'cf-af' : 'cf-gf'}" cx="${f(cx)}" cy="${f(cy)}" r="5"/>`;
    let total = 1;
    for (let k = 1; k <= R; k++){
      const n = deg * k; total += n;
      s += `<circle class="cf-l" cx="${f(cx)}" cy="${f(cy)}" r="${f(k*U)}" stroke-dasharray="2 4"/>`;
      for (let m = 0; m < n; m++){
        const a = 2*Math.PI*m/n - Math.PI/2;
        s += `<circle class="${deg === 6 ? 'cf-af' : 'cf-gf'}" cx="${f(cx + k*U*Math.cos(a))}"`
           + ` cy="${f(cy + k*U*Math.sin(a))}" r="2.6"/>`;
      }
    }
    return { s, total };
  };
  const A = disc(104, 108, 6), B = disc(324, 108, 5);
  made.push(svg('light-discs', 428, 224, `
  ${A.s}
  ${B.s}
  <text class="cf-big" x="104" y="200" text-anchor="middle">hexagon</text>
  <text class="cf-c" x="104" y="216" text-anchor="middle">ring k holds 6k &#183; ${A.total} cells</text>
  <text class="cf-big" x="324" y="200" text-anchor="middle">pentagon</text>
  <text class="cf-gd" x="324" y="216" text-anchor="middle">ring k holds 5k &#183; ${B.total} cells</text>
  <text class="cf-d" x="214" y="24" text-anchor="middle">same light, same radius &#8212; five sixths the area</text>`));
}

// =============================================================================
// terminator -- lit is one dot product against the cell's own up
// =============================================================================
{
  const O = [230, 118], Rp = 84, D2R = Math.PI/180;
  const at = d => [O[0] + Rp*Math.cos(d*D2R), O[1] - Rp*Math.sin(d*D2R)];
  // sun to the left: lit hemisphere is the half facing it
  const arc = `M${f(at(90)[0])} ${f(at(90)[1])} A ${f(Rp)} ${f(Rp)} 0 0 0 ${f(at(270)[0])} ${f(at(270)[1])}`;
  let rays = '';
  for (let y = -70; y <= 70; y += 20)
    rays += `<path class="cf-g" d="M28 ${f(O[1]+y)}L${f(O[0]-Rp-14)} ${f(O[1]+y)}" marker-end="url(#sun)"/>`;
  const probe = (deg, label, cls) => {
    const p = at(deg), q = [O[0] + (Rp+30)*Math.cos(deg*D2R), O[1] - (Rp+30)*Math.sin(deg*D2R)];
    return `<path class="${cls}" d="M${f(p[0])} ${f(p[1])}L${f(q[0])} ${f(q[1])}"/>
      <circle class="cf-fill" cx="${f(p[0])}" cy="${f(p[1])}" r="3.5"/>
      <text class="${cls === 'cf-a' ? 'cf-c' : 'cf-gd'}" x="${f(q[0] + (Math.cos(deg*D2R) < 0 ? -6 : 6))}"
        y="${f(q[1] + 4)}" text-anchor="${Math.cos(deg*D2R) < 0 ? 'end' : 'start'}">${label}</text>`;
  };
  made.push(svg('terminator', 460, 236, `
  <defs><marker id="sun" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
    <path d="M0 0L7 3.5L0 7Z" fill="#b0800f"/></marker></defs>
  ${rays}
  <circle class="cf-void" cx="${f(O[0])}" cy="${f(O[1])}" r="${f(Rp)}"/>
  <path class="cf-gf" d="${arc}Z"/>
  <line class="cf-m" x1="${f(O[0])}" y1="${f(O[1]-Rp)}" x2="${f(O[0])}" y2="${f(O[1]+Rp)}"
    stroke-dasharray="4 3"/>
  ${probe(160, 'dot &gt; 0 &#183; day', 'cf-g')}
  ${probe(90,  'dot = 0 &#183; the terminator', 'cf-m')}
  ${probe(20,  'dot &lt; 0 &#183; night', 'cf-a')}
  <text class="cf-gd" x="28" y="26">sunlight</text>
  <text class="cf-d" x="230" y="228" text-anchor="middle">lit = dot(sunDirection, up) &gt; 0 &#183; and up is already computed for gravity</text>`));
}

console.log(`wrote ${made.length} figures to docs/figures/`);
for (const m of made) console.log('  ' + m + '.svg');
