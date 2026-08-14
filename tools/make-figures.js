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

console.log(`wrote ${made.length} figures to docs/figures/`);
for (const m of made) console.log('  ' + m + '.svg');
