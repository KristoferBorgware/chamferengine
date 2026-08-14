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
// 18 — click-disagreement: the problem, before the fix
// =============================================================================
{
  const cx = 150, cy = 116, R = 66;
  const H = hexPts(cx, cy, R), H2 = hexPts(cx + Math.sqrt(3)*R, cy, R);
  const a = H[1], b = H[2];
  const click = [f((a[0]+b[0])/2 + 3), f((a[1]+b[1])/2)];
  made.push(svg('click-disagreement', 430, 232, `
  <polygon class="cf-l" points="${pts(H)}"/>
  <polygon class="cf-l" points="${pts(H2)}"/>
  <path class="cf-a" d="M${f(a[0])} ${f(a[1])}L${f(b[0])} ${f(b[1])}" stroke-width="3"/>
  <path class="cf-g" d="M${f(a[0])} ${f(a[1])} Q${f((a[0]+b[0])/2+11)} ${f((a[1]+b[1])/2)} ${f(b[0])} ${f(b[1])}" stroke-width="3"/>
  <circle class="cf-af" cx="${cx}" cy="${cy}" r="4"/>
  <circle class="cf-af" cx="${f(cx+Math.sqrt(3)*R)}" cy="${cy}" r="4"/>
  <circle cx="${click[0]}" cy="${click[1]}" r="5.5" fill="#b0800f"/>
  <text class="cf-gd" x="${f(+click[0]+12)}" y="${f(+click[1]+4)}">the player clicks here</text>
  <text class="cf-c" x="14" y="26">the edge the lookup uses</text>
  <text class="cf-gd" x="14" y="46">the edge the mesh draws</text>
  <text class="cf-d" x="14" y="200">the click is inside the left cell according to one, the right according to</text>
  <text class="cf-d" x="14" y="218">the other &#8212; and no document has ever said which one is the cell</text>`));
}

// =============================================================================
// 18 — order-of-operations: average then project, or project then average
// =============================================================================
{
  const O = [128, 300], R = 236;
  const at = d => [O[0] + R*Math.sin(d*Math.PI/180), O[1] - R*Math.cos(d*Math.PI/180)];
  const A = at(-15), B = at(0), C = at(15);            // three lattice points on the arc
  const flatA = A, flatB = B, flatC = C;                // (drawn as the chord's points)
  const chordMid = [ (A[0]+B[0]+C[0])/3, (A[1]+B[1]+C[1])/3 ];
  const proj = p => { const d = Math.hypot(p[0]-O[0], p[1]-O[1]);
    return [O[0] + (p[0]-O[0])/d*R, O[1] + (p[1]-O[1])/d*R]; };
  const lookup = proj(chordMid);                        // average flat, then project
  const meshAvg = [ (A[0]+B[0]+C[0])/3, (A[1]+B[1]+C[1])/3 ];   // same here (already on sphere)
  made.push(svg('order-of-operations', 430, 250, `
  <path class="cf-m" d="M${f(at(-26)[0])} ${f(at(-26)[1])} A ${R} ${R} 0 0 1 ${f(at(26)[0])} ${f(at(26)[1])}"/>
  <path class="cf-l" d="M${f(A[0])} ${f(A[1])}L${f(C[0])} ${f(C[1])}" stroke-dasharray="4 3"/>
  <circle class="cf-fill" cx="${f(A[0])}" cy="${f(A[1])}" r="4.5"/>
  <circle class="cf-fill" cx="${f(C[0])}" cy="${f(C[1])}" r="4.5"/>
  <circle class="cf-gf" cx="${f(chordMid[0])}" cy="${f(chordMid[1])}" r="5"/>
  <path class="cf-l" d="M${O[0]} ${O[1]}L${f(lookup[0])} ${f(lookup[1])}" stroke-dasharray="2 4"/>
  <circle class="cf-af" cx="${f(lookup[0])}" cy="${f(lookup[1])}" r="5.5"/>
  <text class="cf-gd" x="${f(chordMid[0]+12)}" y="${f(chordMid[1]+4)}">average the flat points</text>
  <text class="cf-c" x="${f(lookup[0]+12)}" y="${f(lookup[1]-6)}">then project &#183; the lookup&#8217;s corner</text>
  <text class="cf-d" x="14" y="26">three lattice points. sag the chord inward, average, push the result out.</text>
  <text class="cf-d" x="14" y="46">do it the other way round &#8212; project each point first, then average &#8212;</text>
  <text class="cf-d" x="14" y="66">and you land somewhere else. that is the entire disagreement.</text>
  <text class="cf-d" x="${O[0]}" y="${f(O[1]+18)}" text-anchor="middle">planet centre</text>`));
}

// =============================================================================
// 18 — gap-shrinks: one difference vanishes with depth, the other never does
// =============================================================================
{
  const x0 = 68, y0 = 168, W = 300, H = 122;
  const X = L => x0 + W*(L-2)/9, Y = v => y0 - H*(Math.log10(v) + 4.6)/3.6;
  const mesh = [[2,1.817e-2],[3,1.009e-2],[4,4.983e-3],[5,2.477e-3],[6,1.234e-3],[7,6.158e-4],[8,3.076e-4]];
  const sphv = [[2,0.108],[3,0.088],[4,0.071],[5,0.071],[6,0.063],[7,0.051]];
  const path = (d,cls) => `<path class="${cls}" d="M` + d.map(p=>`${f(X(p[0]))} ${f(Y(p[1]))}`).join('L') + `" fill="none"/>`;
  const dots = (d,cls) => d.map(p=>`<circle class="${cls}" cx="${f(X(p[0]))}" cy="${f(Y(p[1]))}" r="3"/>`).join('');
  // extrapolate the mesh line to L=11
  let ext = [[8,3.076e-4],[9,1.538e-4],[10,7.69e-5],[11,3.845e-5]];
  made.push(svg('gap-shrinks', 430, 224, `
  <path class="cf-l" d="M${x0} ${y0}L${f(x0+W)} ${y0}M${x0} ${y0}L${x0} ${f(y0-H)}"/>
  ${path(sphv,'cf-g')}${dots(sphv,'cf-gf')}
  ${path(mesh,'cf-a')}${dots(mesh,'cf-af')}
  ${path(ext,'cf-a')}
  <path class="cf-l" d="M${f(X(8))} ${f(Y(3.076e-4))}L${f(X(11))} ${f(Y(3.845e-5))}" stroke-dasharray="3 3"/>
  <text class="cf-gd" x="${f(X(7)+8)}" y="${f(Y(0.051)+4)}">against &#8220;nearest centre on the sphere&#8221;</text>
  <text class="cf-gd" x="${f(X(7)+8)}" y="${f(Y(0.051)+22)}">flat at about 0.1 of a cell, forever</text>
  <text class="cf-c" x="${f(X(6))}" y="${f(Y(3.845e-5)+4)}">against the mesh &#183; halves every level</text>
  <text class="cf-d" x="${f(x0+W/2)}" y="${y0+20}" text-anchor="middle">subdivision level &#8594;</text>
  <text class="cf-d" x="${x0-8}" y="${f(y0-H+6)}" text-anchor="end">0.1</text>
  <text class="cf-d" x="${x0-8}" y="${y0+4}" text-anchor="end">0.00003</text>
  <text class="cf-c" x="14" y="24">two disagreements, and only one of them matters</text>
  <text class="cf-d" x="14" y="212">doc 11 filed both as &#8220;about 0.1 of a cell&#8221;. one of them is 2,600&#215; smaller.</text>`));
}

// =============================================================================
// 18 — corner-is-a-lattice-point: the fix costs nothing
// =============================================================================
{
  const T3 = tri(150, 118, 176);
  const fine = latticeEdges(T3, 2);
  let dots3 = '', cells = '';
  for (let i=0;i<=2;i++) for (let j=0;j<=i;j++){
    const p = bary(T3,2,i,j);
    cells += `<circle class="cf-af" cx="${f(p[0])}" cy="${f(p[1])}" r="5"/>`;
  }
  for (const [i,j] of [[2,1],[1,2],[5,1],[4,2],[5,4],[4,5]]){
    const p = bary(T3,6,i,j);
    dots3 += `<circle class="cf-gf" cx="${f(p[0])}" cy="${f(p[1])}" r="4"/>`;
  }
  made.push(svg('corner-is-a-lattice-point', 430, 234, `
  <path class="cf-l" d="${pathOf(fine)}"/>
  <polygon class="cf-m" points="${pts([T3.A,T3.B,T3.C])}" fill="none"/>
  ${cells}${dots3}
  <text class="cf-c" x="272" y="60">cells &#183; lattice at n</text>
  <text class="cf-gd" x="272" y="88">corners &#183; the same lattice at 3n</text>
  <text class="cf-d" x="272" y="122">up-triangle (i, j)</text>
  <text class="cf-d" x="272" y="140">&#8594; (3i+2, 3j+1)</text>
  <text class="cf-d" x="272" y="166">down-triangle (i, j)</text>
  <text class="cf-d" x="272" y="184">&#8594; (3i+1, 3j+2)</text>
  <text class="cf-d" x="14" y="222">one blend and one normalise from integers &#8212; the same call that places a cell</text>`));
}

// =============================================================================
// 10 — no-diagonals: a square grid has a corner problem, a hex grid has none
// =============================================================================
{
  const S = 30, ox = 46, oy = 58;
  let sq = '';
  for (let r=0;r<3;r++) for (let c=0;c<3;c++)
    sq += `<rect class="${(r===0&&c===1)||(r===1&&c===0)?'cf-gf':'cf-fill'}" x="${f(ox+c*S)}" y="${f(oy+r*S)}" width="${S-1}" height="${S-1}"/>`;
  const H = hexPts(316, 104, 30);
  let ring = '';
  for (let i=0;i<6;i++){
    const a = Math.PI/6 + Math.PI*i/3;
    ring += `<polygon class="cf-fill" points="${pts(hexPts(316 + Math.sqrt(3)*30*Math.cos(a), 104 + Math.sqrt(3)*30*Math.sin(a), 30))}"/>`;
  }
  made.push(svg('no-diagonals', 430, 216, `
  ${sq}
  <path class="cf-a" d="M${f(ox+S*1.5)} ${f(oy+S*1.5)}L${f(ox+S*0.5)} ${f(oy+S*0.5)}" stroke-width="2.5" marker-end="url(#nd1)"/>
  <defs><marker id="nd1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
    <path d="M0 0 L10 5 L0 10 z" fill="#2f6fd0"/></marker></defs>
  <text class="cf-d" x="${f(ox+S*1.5)}" y="34" text-anchor="middle">squares</text>
  <text class="cf-gd" x="14" y="176">a diagonal step slips between two blocked cells</text>
  <text class="cf-d" x="14" y="194">and costs 1.414, which every cost function has to special-case</text>
  ${ring}
  <polygon class="cf-af" points="${pts(H)}"/>
  <text class="cf-d" x="316" y="34" text-anchor="middle">hexagons</text>
  <text class="cf-c" x="416" y="176" text-anchor="end">six neighbours, six shared edges</text>
  <text class="cf-d" x="416" y="194" text-anchor="end">no diagonal exists, so the bug cannot</text>`));
}

// =============================================================================
// 10 — admissible-divisor: dividing by the average overcounts the steps
// =============================================================================
{
  const x0 = 40, y = 84, W = 350;
  const wide = W/10, nom = W/11;                  // 10 real steps vs 11 nominal
  let real = '', ticks = '';
  for (let k=0;k<10;k++)
    real += `<rect class="cf-af" x="${f(x0+k*wide)}" y="${y-16}" width="${f(wide-2)}" height="32" opacity="0.5"/>`;
  for (let k=0;k<=11;k++)
    ticks += `<path class="cf-g" d="M${f(x0+k*nom)} ${y+44}L${f(x0+k*nom)} ${y+68}"/>`;
  made.push(svg('admissible-divisor', 430, 216, `
  ${real}
  <text class="cf-c" x="${f(x0+W+6)}" y="${y+4}">10</text>
  <text class="cf-d" x="14" y="34">the route really crosses 10 cells, because these are wide ones</text>
  ${ticks}
  <path class="cf-l" d="M${x0} ${y+56}L${f(x0+W)} ${y+56}"/>
  <text class="cf-gd" x="${f(x0+W+6)}" y="${y+60}">11</text>
  <text class="cf-gd" x="14" y="${y+94}">divide the distance by the AVERAGE cell and you predict 11</text>
  <text class="cf-d" x="14" y="${y+112}">an estimate that is too high makes A* miss the shortest path &#8212;</text>
  <text class="cf-c" x="14" y="${y+130}">so divide by the LARGEST cell, 1.098 &#215; nominal, and never by the average</text>`));
}

// =============================================================================
// 01 — three-approaches: what S2, H3 and this design put on the sphere
// =============================================================================
{
  const panel = (cx, title, body, note, ncls) =>
    `<text class="cf-d" x="${cx}" y="28" text-anchor="middle">${title}</text>${body}`
  + `<text class="${ncls}" x="${cx}" y="192" text-anchor="middle">${note}</text>`;
  // S2: a quad grid with cells visibly stretched toward one corner
  let s2 = '';
  for (let r=0;r<4;r++) for (let c=0;c<4;c++){
    const w = 13 + c*4, h = 13 + r*4;
    s2 += `<rect class="cf-fill" x="${f(30 + c*19 - (c*c)*0.6)}" y="${f(52 + r*19 - (r*r)*0.6)}" width="${f(w)}" height="${f(h)}"/>`;
  }
  // H3: hexes that cannot nest -- a big one with small ones failing to fill it
  let h3 = `<polygon class="cf-g" points="${pts(hexPts(215, 104, 44))}" stroke-width="2.5"/>`;
  for (const [dx,dy] of [[0,0],[26,-15],[26,15],[0,30],[-26,15],[-26,-15],[0,-30]])
    h3 += `<polygon class="cf-l" points="${pts(hexPts(215+dx, 104+dy, 15))}"/>`;
  // ours: triangles nesting, dots on the corners
  let ours = `<polygon class="cf-m" points="${pts([[400,60],[356,140],[444,140]])}"/>`;
  const T3 = {A:[400,60], B:[356,140], C:[444,140]};
  ours += `<path class="cf-l" d="${pathOf(latticeEdges(T3, 4))}"/>`;
  for (let i=0;i<=4;i++) for (let j=0;j<=i;j++){
    const p = bary(T3,4,i,j);
    ours += `<circle class="cf-af" cx="${f(p[0])}" cy="${f(p[1])}" r="2.6"/>`;
  }
  made.push(svg('three-approaches', 470, 212, `
  ${panel(76, 'S2 &#183; quads on a cube', s2, 'even indexing, uneven cells', 'cf-gd')}
  ${panel(215, 'H3 &#183; hexes all the way down', h3, 'even cells, no exact nesting', 'cf-gd')}
  ${panel(400, 'here &#183; both jobs split', ours, 'triangles nest, corners are cells', 'cf-c')}`));
}

// =============================================================================
// 11 — three-boundaries: the last structural gap, drawn
// =============================================================================
{
  const cx = 160, cy = 108, R = 62;
  const H = hexPts(cx, cy, R), H2 = hexPts(cx + Math.sqrt(3)*R, cy, R);
  const a = H[1], b = H[2], mx = (a[0]+b[0])/2, my = (a[1]+b[1])/2;
  made.push(svg('three-boundaries', 430, 224, `
  <polygon class="cf-l" points="${pts(H)}"/>
  <polygon class="cf-l" points="${pts(H2)}"/>
  <circle class="cf-af" cx="${cx}" cy="${cy}" r="4"/>
  <circle class="cf-af" cx="${f(cx+Math.sqrt(3)*R)}" cy="${cy}" r="4"/>
  <path class="cf-a" d="M${f(a[0])} ${f(a[1])}L${f(b[0])} ${f(b[1])}" stroke-width="3"/>
  <path class="cf-g" d="M${f(a[0])} ${f(a[1])} Q${f(mx+10)} ${f(my)} ${f(b[0])} ${f(b[1])}" stroke-width="3"/>
  <path class="cf-m" d="M${f(a[0]+4)} ${f(a[1]-3)}L${f(b[0]+4)} ${f(b[1]+3)}" stroke-width="3" stroke-dasharray="5 4"/>
  <text class="cf-c" x="256" y="60">what rounding says &#183; docs 04 and 09</text>
  <text class="cf-gd" x="256" y="88">equidistant on the sphere &#183; nobody, now</text>
  <text class="cf-d" x="256" y="116">the dual&#8217;s corners &#183; doc 14 meshing</text>
  <text class="cf-d" x="14" y="196">three curves, about a tenth of a cell apart, and no document says which is drawn</text>
  <text class="cf-c" x="14" y="214">a player clicks the mesh and the lookup answers from a different line</text>`));
}

// =============================================================================
// 14 — no-sideways-merge: columns merge, neighbours zigzag
// =============================================================================
{
  const R = 26, dx = Math.sqrt(3)*R;
  let good = '', bad = '';
  // left: same-facing sides of neighbouring cells are parallel but offset
  for (let k=0;k<4;k++){
    const cx = 60 + k*dx, cy = 96 + (k%2 ? R*0.5 : -R*0.5);
    const H = hexPts(cx, cy, R);
    bad += `<polygon class="cf-l" points="${pts(H)}"/>`;
    bad += `<path class="cf-a" d="M${f(H[4][0])} ${f(H[4][1])}L${f(H[5][0])} ${f(H[5][1])}" stroke-width="3"/>`;
  }
  // right: a column of stacked cells, all sharing one plane
  for (let k=0;k<4;k++){
    good += `<rect class="cf-fill" x="286" y="${f(52+k*30)}" width="72" height="30"/>`;
    good += `<path class="cf-a" d="M286 ${f(52+k*30)}L286 ${f(82+k*30)}" stroke-width="3"/>`;
  }
  made.push(svg('no-sideways-merge', 430, 214, `
  ${bad}
  <text class="cf-c" x="118" y="30" text-anchor="middle">sideways</text>
  <text class="cf-d" x="118" y="176" text-anchor="middle">same direction, parallel,</text>
  <text class="cf-gd" x="118" y="194" text-anchor="middle">but never in line &#8212; nothing to merge</text>
  ${good}
  <text class="cf-c" x="322" y="30" text-anchor="middle">downward</text>
  <text class="cf-d" x="322" y="194" text-anchor="middle">one flat plane &#8212; four faces become one</text>
  <path class="cf-l" d="M215 40 L215 200" stroke-dasharray="2 5"/>`));
}

// =============================================================================
// 14 — relief-saturates: raw side faces explode, merged quads level off
// =============================================================================
{
  const x0 = 66, y0 = 172, W = 320, H = 128;
  const rows = [[0,0,4.00],[10,1.74,7.11],[30,5.17,8.71],[60,10.29,9.25],[120,20.59,9.48]];
  const X = r => x0 + W*r/120, Y = v => y0 - H*v/22;
  const line = (idx, cls) => `<path class="${cls}" d="M` + rows.map(r=>`${f(X(r[0]))} ${f(Y(r[idx]))}`).join('L') + `" fill="none"/>`;
  const dots = (idx, cls) => rows.map(r=>`<circle class="${cls}" cx="${f(X(r[0]))}" cy="${f(Y(r[idx]))}" r="3.5"/>`).join('');
  made.push(svg('relief-saturates', 430, 216, `
  <path class="cf-l" d="M${x0} ${y0}L${f(x0+W)} ${y0}M${x0} ${y0}L${x0} ${f(y0-H)}"/>
  ${line(1,'cf-g')}${dots(1,'cf-gf')}
  ${line(2,'cf-a')}${dots(2,'cf-af')}
  <text class="cf-gd" x="${f(X(120)+6)}" y="${f(Y(20.59)+4)}">raw side faces</text>
  <text class="cf-c" x="${f(X(120)+6)}" y="${f(Y(9.48)+4)}">triangles</text>
  <text class="cf-d" x="${f(x0+W/2)}" y="${y0+22}" text-anchor="middle">terrain relief &#8594;  0 m to 120 m</text>
  <text class="cf-c" x="14" y="26">raw faces grow 20&#215;</text>
  <text class="cf-c" x="14" y="46">triangles grow 2.4&#215; and then stop</text>
  <text class="cf-d" x="14" y="206">because about half your neighbours are lower than you whatever the terrain does</text>`));
}

// =============================================================================
// 14 — lod-is-resampling: the coarse grid is different cells, not fewer
// =============================================================================
{
  const grid = (ox, oy, R, n, cls) => {
    let g = '', dx = Math.sqrt(3)*R;
    for (let r=0;r<n;r++) for (let c=0;c<n;c++){
      const cx = ox + c*dx + (r%2 ? dx/2 : 0), cy = oy + r*R*1.5;
      g += `<polygon class="${cls}" points="${pts(hexPts(cx, cy, R))}"/>`;
    }
    return g;
  };
  made.push(svg('lod-is-resampling', 430, 226, `
  <defs><clipPath id="lodc"><rect x="30" y="44" width="370" height="112"/></clipPath></defs>
  <g clip-path="url(#lodc)">
    ${grid(30, 50, 13, 8, 'cf-l')}
    ${grid(26, 46, 26, 4, 'cf-a')}
  </g>
  <text class="cf-c" x="14" y="30">the coarse cells do not contain the fine ones &#8212; their edges cut through</text>
  <text class="cf-d" x="14" y="184">so a coarse mesh cannot be made by throwing fine cells away</text>
  <text class="cf-d" x="14" y="202">it is built by asking the terrain function again, at the wider spacing &#8212;</text>
  <text class="cf-d" x="14" y="220">which is why LOD makes a chunk cheaper to GENERATE as well as to draw</text>`));
}

// =============================================================================
// 04 — lookup-pipeline: four steps from a position to a cell ID
// =============================================================================
{
  const box = (x, n, title, sub) =>
    `<rect class="${n===4?'cf-gf':'cf-af'}" x="${x}" y="60" width="86" height="58" rx="6"/>`
  + `<text class="cf-big" x="${x+43}" y="52" text-anchor="middle">${n}</text>`
  + `<text class="cf-c" x="${x+43}" y="84" text-anchor="middle">${title}</text>`
  + `<text class="cf-d" x="${x+43}" y="102" text-anchor="middle">${sub}</text>`;
  let arrows = '';
  for (let k=0;k<3;k++) arrows += `<path class="cf-l" d="M${f(16+86+k*100+4)} 89L${f(16+(k+1)*100-6)} 89" marker-end="url(#lp1)"/>`;
  made.push(svg('lookup-pipeline', 430, 178, `
  <defs><marker id="lp1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
    <path d="M0 0 L10 5 L0 10 z" fill="#9aa3b2"/></marker></defs>
  ${arrows}
  ${box(16,  1, 'which face', '20 dot products')}
  ${box(116, 2, 'where in it', 'barycentric')}
  ${box(216, 3, 'which cell', 'hexRound')}
  ${box(316, 4, 'the address', 'walk down')}
  <text class="cf-d" x="14" y="24">a 3D position in, a cell ID out &#8212; no table, no search, nothing stored</text>
  <text class="cf-d" x="14" y="146">every step is arithmetic. the whole thing is a few dozen operations,</text>
  <text class="cf-d" x="14" y="164">and the cost depends on the subdivision depth, never on the world&#8217;s size</text>`));
}

// =============================================================================
// 04 — hexround-repair: rounding three numbers breaks their sum
// =============================================================================
{
  const cellRow = (y, vals, sum, ok, note) => {
    let out = '';
    vals.forEach((v, i) => {
      out += `<rect class="${v[1]||'cf-fill'}" x="${f(78+i*74)}" y="${y}" width="66" height="30" rx="4"/>`
          +  `<text class="cf-c" x="${f(78+i*74+33)}" y="${y+20}" text-anchor="middle">${v[0]}</text>`;
    });
    out += `<text class="cf-d" x="66" y="${y+20}" text-anchor="end">${note}</text>`;
    out += `<text class="${ok?'cf-c':'cf-gd'}" x="308" y="${y+20}">sums to ${sum} ${ok?'&#10003;':'&#10007;'}</text>`;
    return out;
  };
  made.push(svg('hexround-repair', 430, 190, `
  ${cellRow(30, [['4.7'],['8.6'],['2.7']], 16, true, 'measured')}
  ${cellRow(78, [['5'],['9','cf-gf'],['3']], 17, false, 'round each')}
  ${cellRow(126,[['5'],['8','cf-af'],['3']], 16, true, 'repaired')}
  <text class="cf-gd" x="14" y="176">8.6 moved furthest, so throw that one away and recompute it from the other two</text>`));
}

// =============================================================================
// 04 — cell-is-what-rounding-says: two definitions, one thin band of disagreement
// =============================================================================
{
  const cx = 150, cy = 108, R = 46;
  const H = hexPts(cx, cy, R);
  const H2 = hexPts(cx + Math.sqrt(3)*R, cy, R);
  // the "other" boundary: a slightly bowed curve near the shared edge
  const e0 = H[1], e1 = H[2];
  made.push(svg('cell-is-what-rounding-says', 430, 214, `
  <polygon class="cf-af" points="${pts(H)}" opacity="0.5"/>
  <polygon class="cf-fill" points="${pts(H2)}" opacity="0.5"/>
  <path class="cf-a" d="M${f(e0[0])} ${f(e0[1])}L${f(e1[0])} ${f(e1[1])}" stroke-width="2.5"/>
  <path class="cf-g" d="M${f(e0[0])} ${f(e0[1])} Q${f((e0[0]+e1[0])/2+9)} ${f((e0[1]+e1[1])/2)} ${f(e1[0])} ${f(e1[1])}" stroke-width="2.5"/>
  <circle class="cf-af" cx="${cx}" cy="${cy}" r="4"/>
  <circle class="cf-af" cx="${f(cx+Math.sqrt(3)*R)}" cy="${cy}" r="4"/>
  <text class="cf-c" x="14" y="26">what rounding says the edge is</text>
  <text class="cf-gd" x="14" y="46">what &#8220;nearest centre on the sphere&#8221; says</text>
  <text class="cf-d" x="14" y="176">they differ on about 1% of the sphere, never by more than a tenth of a cell,</text>
  <text class="cf-d" x="14" y="194">and always with a neighbour that shares an edge &#8212; so pick one and it is exact</text>
  <text class="cf-c" x="278" y="${cy+4}">both centres agree</text>
  <text class="cf-d" x="278" y="${cy+22}">only the line between them is in question</text>`));
}

// =============================================================================
// 15 — float-ladder: how many positions a float32 leaves inside one block
// =============================================================================
{
  const PX = 30, x0 = 96, span = 300;             // 30 px to the metre, all three rows
  const row = (y, label, gapM, note) => {
    let blocks = '';
    for (let m = 0; m*PX < span; m++)
      blocks += `<path class="cf-l" d="M${f(x0+m*PX)} ${y-14}L${f(x0+m*PX)} ${y+14}"/>`;
    let ticks = '';
    if (gapM*PX < 1.2){                            // too dense to draw: show it solid
      ticks = `<rect class="cf-af" x="${x0}" y="${y-7}" width="${span}" height="14" opacity="0.6"/>`;
    } else {
      for (let k = 0; k*gapM*PX <= span; k++)
        ticks += `<path class="cf-a" d="M${f(x0+k*gapM*PX)} ${y-9}L${f(x0+k*gapM*PX)} ${y+9}" stroke-width="2.5"/>`;
    }
    return `<path class="cf-l" d="M${x0} ${y}L${f(x0+span)} ${y}"/>${blocks}${ticks}`
      + `<text class="cf-d" x="${x0-12}" y="${y+4}" text-anchor="end">${label}</text>`
      + `<text class="cf-c" x="${x0}" y="${y+30}">${note}</text>`;
  };
  made.push(svg('float-ladder', 430, 224, `
  <text class="cf-d" x="14" y="22">faint lines are 1 m blocks &#183; solid marks are positions a float32 can actually hold</text>
  ${row(66,  'R 1,700 m', 0.000122, '8,192 positions per block &#8212; solid')}
  ${row(134, 'Earth',     0.5,      '2 per block &#8212; nothing below half a metre')}
  ${row(202, 'Jupiter',   8,        'one position per 8 blocks')}`));
}

// =============================================================================
// 15 — precision-staircase: resolution halves at every power of two
// =============================================================================
{
  const x0 = 62, y0 = 168, W = 336, H = 122;
  const e0 = 10, e1 = 24;                          // radius 1 km .. 16,000 km
  const X = e => x0 + W*(e - e0)/(e1 - e0);
  const Y = g => y0 - H*(Math.log2(g) + 14)/22;    // gap from 2^-14 m up
  let steps = '';
  for (let e = e0; e <= e1; e++){
    const g = 2**(e-23);
    steps += `<path class="cf-a" d="M${f(X(e))} ${f(Y(g))}L${f(X(e+1))} ${f(Y(g))}"/>`;
    if (e < e1) steps += `<path class="cf-l" d="M${f(X(e+1))} ${f(Y(g))}L${f(X(e+1))} ${f(Y(g*2))}"/>`;
  }
  const mark = (r, txt, cls) => {
    const e = Math.floor(Math.log2(r));
    return `<path class="${cls}" d="M${f(X(Math.log2(r)))} ${f(Y(2**(e-23)))}L${f(X(Math.log2(r)))} ${y0+6}" stroke-dasharray="3 3"/>`
      + `<text class="${cls==='cf-g'?'cf-gd':'cf-c'}" x="${f(X(Math.log2(r)))}" y="${y0+20}" text-anchor="middle">${txt}</text>`;
  };
  made.push(svg('precision-staircase', 430, 216, `
  <path class="cf-l" d="M${x0} ${y0}L${f(x0+W)} ${y0}M${x0} ${y0}L${x0} ${f(y0-H)}"/>
  ${steps}
  ${mark(15000, '15 km', 'cf-g')}
  ${mark(17000, '17 km', 'cf-g')}
  <text class="cf-d" x="${x0-8}" y="${f(y0-H+6)}" text-anchor="end">1 m</text>
  <text class="cf-d" x="${x0-8}" y="${y0+4}" text-anchor="end">0.1 mm</text>
  <text class="cf-d" x="${f(x0+W)}" y="${y0+20}" text-anchor="end">planet radius &#8594;</text>
  <text class="cf-c" x="14" y="24">precision does not fade. it halves, all at once,</text>
  <text class="cf-c" x="14" y="42">every time the radius crosses a power of two</text>
  <text class="cf-gd" x="14" y="200">a 15 km planet and a 17 km planet are a factor of two apart</text>`));
}

// =============================================================================
// 15 — anchor-and-offset: nothing moves except one entity's own two numbers
// =============================================================================
{
  const grid = (ox, oy, n, dx, cls) => {
    let g = '';
    for (let i=0;i<=n;i++){
      g += `<path class="${cls}" d="M${f(ox+i*dx)} ${oy}L${f(ox+i*dx)} ${f(oy+n*dx)}"/>`;
      g += `<path class="${cls}" d="M${ox} ${f(oy+i*dx)}L${f(ox+n*dx)} ${f(oy+i*dx)}"/>`;
    }
    return g;
  };
  made.push(svg('anchor-and-offset', 430, 244, `
  <defs><marker id="ao1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
    <path d="M0 0 L10 5 L0 10 z" fill="#2f6fd0"/></marker></defs>
  <text class="cf-d" x="104" y="24" text-anchor="middle">classic floating origin</text>
  ${grid(34, 40, 4, 34, 'cf-l')}
  <path class="cf-g" d="M40 176 L162 176" stroke-dasharray="5 4" marker-end="url(#ao2)"/>
  <defs><marker id="ao2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M0 0 L10 5 L0 10 z" fill="#b0800f"/></marker></defs>
  <circle class="cf-af" cx="102" cy="108" r="5"/>
  <text class="cf-gd" x="104" y="196" text-anchor="middle">the whole world shifts</text>
  <text class="cf-d" x="104" y="214" text-anchor="middle">one global event, every system told</text>
  <path class="cf-l" d="M215 34 L215 216" stroke-dasharray="2 5"/>
  <text class="cf-d" x="326" y="24" text-anchor="middle">anchor plus offset</text>
  ${grid(256, 40, 4, 34, 'cf-l')}
  <rect class="cf-af" x="290" y="74" width="34" height="34" opacity="0.5"/>
  <rect class="cf-gf" x="324" y="108" width="34" height="34" opacity="0.5"/>
  <path class="cf-a" d="M290 108 L318 88" marker-end="url(#ao1)"/>
  <path class="cf-g" d="M324 142 L352 122" marker-end="url(#ao2)"/>
  <text class="cf-c" x="326" y="196" text-anchor="middle">the anchor changes, the offset resets</text>
  <text class="cf-d" x="326" y="214" text-anchor="middle">one entity, two numbers, nobody else told</text>`));
}

// =============================================================================
// 15 — directions-survive: the position blurs, the angle does not
// =============================================================================
{
  const one = (cx, cy, R, blur, label, note) => {
    const a = -58*Math.PI/180;
    const p = [cx + R*Math.cos(a), cy + R*Math.sin(a)];
    return `<path class="cf-m" d="M${f(cx-R)} ${cy} A ${R} ${R} 0 0 1 ${f(cx+R)} ${cy}" />`
      + `<path class="cf-l" d="M${cx} ${cy}L${f(p[0])} ${f(p[1])}"/>`
      + `<circle class="cf-gf" cx="${f(p[0])}" cy="${f(p[1])}" r="${blur}" opacity="0.55"/>`
      + `<circle class="cf-af" cx="${f(p[0])}" cy="${f(p[1])}" r="3"/>`
      + `<text class="cf-d" x="${cx}" y="${cy+22}" text-anchor="middle">${label}</text>`
      + `<text class="cf-c" x="${cx}" y="${cy+42}" text-anchor="middle">${note}</text>`;
  };
  made.push(svg('directions-survive', 430, 190, `
  ${one(106, 126, 74, 2.5, 'small planet', 'position good to 37 &#181;m')}
  ${one(316, 126, 74, 15, 'Earth-sized', 'position good to 102 mm')}
  <text class="cf-gd" x="215" y="26" text-anchor="middle">the gold blur is how far the position could be wrong</text>
  <text class="cf-c" x="215" y="52" text-anchor="middle">the line from the centre is the same line in both</text>
  <text class="cf-d" x="215" y="74" text-anchor="middle">up is accurate to 0.005&#8243; at every radius &#8212; normalising divides the size out</text>`));
}

// =============================================================================
// 06 — level-is-an-integer: the radius moves so the block size never has to
// =============================================================================
{
  const y = 96, x0 = 56, dx = 96;
  const L = [10, 11, 12];
  let ticks = '';
  L.forEach((l, i) => {
    const x = x0 + i*dx;
    ticks += `<path class="cf-m" d="M${x} ${y-9}L${x} ${y+9}"/>`
          +  `<text class="cf-big" x="${x}" y="${y-18}" text-anchor="middle">${l}</text>`
          +  `<text class="cf-d" x="${x}" y="${y+26}" text-anchor="middle">${(1*2**l/1.20459).toFixed(0)} m</text>`;
  });
  const want = x0 + 0.92*dx;                    // level 10.92 -- what the target asks for
  made.push(svg('level-is-an-integer', 430, 208, `
  <path class="cf-l" d="M28 ${y}L${x0+2*dx+28} ${y}"/>
  ${ticks}
  <path class="cf-g" d="M${f(want)} ${y+52}L${f(want)} ${y+14}" marker-end="url(#li1)"/>
  <defs><marker id="li1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
    <path d="M0 0 L10 5 L0 10 z" fill="#b0800f"/></marker></defs>
  <text class="cf-gd" x="${f(want)}" y="${y+70}" text-anchor="middle">you asked for 1,604 m</text>
  <text class="cf-gd" x="${f(want)}" y="${y+88}" text-anchor="middle">= level 10.92</text>
  <path class="cf-a" d="M${f(want+6)} ${y+42}L${f(x0+dx-8)} ${y+22}" marker-end="url(#li2)"/>
  <defs><marker id="li2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
    <path d="M0 0 L10 5 L0 10 z" fill="#2f6fd0"/></marker></defs>
  <text class="cf-c" x="14" y="26">the level is a whole number &#8212; there is no 10.92</text>
  <text class="cf-d" x="14" y="46">so round it, and let the RADIUS take the difference</text>
  <text class="cf-c" x="${f(x0+dx)}" y="${y+112}" text-anchor="middle">you get 1,700 m, and 1 m blocks exactly</text>
  <text class="cf-d" x="215" y="196" text-anchor="middle">rounding can move the radius up to 40%. it must never move the block.</text>`));
}

// =============================================================================
// 06 — taper-with-depth: cells narrow toward the core, and by how much
// =============================================================================
{
  const O = [215, 396], R = 330, halfW = 13;    // wedge half-angle, degrees
  const arc = (r, cls) => {
    const a = halfW*Math.PI/180;
    return `<path class="${cls}" d="M${f(O[0]-r*Math.sin(a))} ${f(O[1]-r*Math.cos(a))}`
      + ` A ${f(r)} ${f(r)} 0 0 1 ${f(O[0]+r*Math.sin(a))} ${f(O[1]-r*Math.cos(a))}"/>`;
  };
  let cols = '';
  for (let k=-3;k<=3;k++){
    const a = (k*halfW/3)*Math.PI/180;
    cols += `<path class="cf-l" d="M${f(O[0]+R*Math.sin(a))} ${f(O[1]-R*Math.cos(a))}L${O[0]} ${O[1]}"/>`;
  }
  const yAt = r => O[1]-r*Math.cos(halfW*Math.PI/180);
  made.push(svg('taper-with-depth', 430, 226, `
  ${cols}
  ${arc(R, 'cf-m')}
  ${arc(R*(1-64/1700), 'cf-a')}
  ${arc(R*0.744, 'cf-g')}
  <text class="cf-c" x="14" y="${f(yAt(R)+4)}">surface &#183; 1.00 wide</text>
  <text class="cf-c" x="14" y="${f(yAt(R*(1-64/1700))+16)}">64 layers down &#183; 0.962 wide &#8212; the crust in use</text>
  <text class="cf-gd" x="14" y="${f(yAt(R*0.744)+4)}">435 layers &#183; 0.744 wide &#8212; the cap</text>
  <text class="cf-d" x="14" y="${f(yAt(R*0.744)+22)}">as narrow as the narrowest cell already on the surface</text>
  <text class="cf-d" x="215" y="216" text-anchor="middle">the columns meet at the centre, so a crust deeper than the cap has nowhere to go</text>`));
}

// =============================================================================
// 06 — merge-shell: three columns in four dead-end at a resolution change
// =============================================================================
{
  const yTop = 44, ySeam = 118, yBot = 186, x0 = 74, w = 34;
  let fine = '', coarse = '', marks = '';
  for (let k = 0; k < 8; k++){
    const x = x0 + k*w;
    fine += `<rect class="cf-fill" x="${x}" y="${yTop}" width="${w-3}" height="${ySeam-yTop}"/>`;
  }
  for (let k = 0; k < 2; k++){
    const x = x0 + k*w*4;
    coarse += `<rect class="cf-gf" x="${x}" y="${ySeam+6}" width="${w*4-3}" height="${yBot-ySeam-6}"/>`;
  }
  for (let k = 0; k < 8; k++){
    const cx = x0 + k*w + (w-3)/2;
    const through = (k % 4 === 0);              // one in four lines up
    marks += through
      ? `<path class="cf-a" d="M${f(cx)} ${yTop+8}L${f(cx)} ${yBot-8}" marker-end="url(#ms1)"/>`
      : `<path class="cf-l" d="M${f(cx)} ${yTop+8}L${f(cx)} ${ySeam-2}"/>`
        + `<path class="cf-g" d="M${f(cx-7)} ${ySeam+1}l14 0"/>`;
  }
  made.push(svg('merge-shell', 430, 232, `
  <defs><marker id="ms1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
    <path d="M0 0 L10 5 L0 10 z" fill="#2f6fd0"/></marker></defs>
  ${fine}${coarse}${marks}
  <text class="cf-d" x="46" y="${f((yTop+ySeam)/2)}" text-anchor="end">fine</text>
  <text class="cf-d" x="46" y="${f((ySeam+yBot)/2+6)}" text-anchor="end">coarse</text>
  <text class="cf-c" x="14" y="26">one column in four carries straight on</text>
  <text class="cf-gd" x="14" y="212">three in four stop dead at the shell</text>
  <text class="cf-d" x="14" y="${yBot+18}">cell centres nest exactly; cell areas never do</text>
  <text class="cf-d" x="416" y="212" text-anchor="end">on the worked planet that is 41,943,042 columns</text>`));
}

// =============================================================================
// 06 — hexagon-vs-cube: the same "block size" buys less ground
// =============================================================================
{
  const W = 104, cy = 104;
  const hx = 118, sx = 292;
  const H = Array.from({length:6},(_,i)=>{        // flat-to-flat width W
    const a = Math.PI/6 + Math.PI*i/3;
    return [hx + (W/Math.sqrt(3))*Math.cos(a), cy + (W/Math.sqrt(3))*Math.sin(a)];
  });
  made.push(svg('hexagon-vs-cube', 430, 214, `
  <rect class="cf-fill" x="${f(sx-W/2)}" y="${f(cy-W/2)}" width="${W}" height="${W}"/>
  <polygon class="cf-af" points="${pts(H)}"/>
  <path class="cf-a" d="M${f(hx-W/2)} ${f(cy+W/2+14)}L${f(hx+W/2)} ${f(cy+W/2+14)}"/>
  <path class="cf-m" d="M${f(sx-W/2)} ${f(cy+W/2+14)}L${f(sx+W/2)} ${f(cy+W/2+14)}"/>
  <text class="cf-d" x="${hx}" y="${f(cy+W/2+32)}" text-anchor="middle">same width</text>
  <text class="cf-d" x="${sx}" y="${f(cy+W/2+32)}" text-anchor="middle">same width</text>
  <text class="cf-c" x="${hx}" y="${f(cy+4)}" text-anchor="middle">0.87&#215; the area</text>
  <text class="cf-d" x="${sx}" y="${f(cy+4)}" text-anchor="middle">1.00&#215;</text>
  <path class="cf-g" d="M${f(H[5][0])} ${f(H[5][1])}L${f(H[2][0])} ${f(H[2][1])}" stroke-dasharray="4 3"/>
  <text class="cf-gd" x="${hx}" y="${f(cy-W/2-16)}" text-anchor="middle">but 1.15&#215; corner to corner</text>
  <text class="cf-d" x="215" y="200" text-anchor="middle">a &#8220;1 m block&#8221; covers about 13% less ground than the same number in Minecraft</text>`));
}

// =============================================================================
// 17 — never-far-from-one: pentagons 1,882 m apart, cover radius 1,109 m
// =============================================================================
{
  // Locally the twelve sit on a triangular arrangement: each has five nearest
  // neighbours at the same distance. Cover discs of the circumradius just close.
  const D = 108, cov = D/Math.sqrt(3);          // 1882 m -> D px, 1086 m -> cov px
  const base = [[120,64],[120+D,64],[120+D/2,64+D*Math.sqrt(3)/2],
                [120-D/2,64+D*Math.sqrt(3)/2],[120+D*1.5,64+D*Math.sqrt(3)/2]];
  const discs = base.map(p => `<circle class="cf-gf" cx="${f(p[0])}" cy="${f(p[1])}" r="${f(cov)}" opacity="0.34"/>`).join('');
  const dots  = base.map(p => `<polygon class="cf-gf" points="${pts(
    Array.from({length:5},(_,i)=>{const a=-Math.PI/2+2*Math.PI*i/5;
      return [p[0]+9*Math.cos(a), p[1]+9*Math.sin(a)];}))}"/>`).join('');
  const mid = [120+D/2, 64+D/Math.sqrt(3)];      // the worst point: a circumcentre
  made.push(svg('never-far-from-one', 430, 244, `
  ${discs}
  <path class="cf-l" d="${pathOf([[base[0],base[1]],[base[0],base[2]],[base[1],base[2]],
                                  [base[0],base[3]],[base[2],base[3]],[base[1],base[4]],[base[2],base[4]]])}"/>
  ${dots}
  <path class="cf-a" d="M${f(base[0][0])} ${f(base[0][1])}L${f(base[1][0])} ${f(base[1][1])}"/>
  <text class="cf-c" x="${f(120+D/2)}" y="56" text-anchor="middle">1,882 m</text>
  <circle class="cf-af" cx="${f(mid[0])}" cy="${f(mid[1])}" r="4"/>
  <text class="cf-c" x="${f(mid[0]+10)}" y="${f(mid[1]+16)}">1,109 m &#8212; as far away as you can get</text>
  <text class="cf-d" x="14" y="212">typical distance to the nearest one: 663 m</text>
  <text class="cf-d" x="14" y="230">on a planet that is 10,681 m around, and 2 hours to walk</text>`));
}

// =============================================================================
// 17 — protected-column: the rule covers the whole column, not the top cell
// =============================================================================
{
  const col = (x, cls, n, label) => {
    let out = '';
    for (let k = 0; k < n; k++)
      out += `<rect class="${cls}" x="${x}" y="${f(52 + k*17)}" width="46" height="17"/>`;
    return out + `<text class="cf-d" x="${x+23}" y="42" text-anchor="middle">${label}</text>`;
  };
  made.push(svg('protected-column', 430, 214, `
  ${col(60,  'cf-fill', 8, 'ordinary')}
  ${col(130, 'cf-gf',   8, 'pentagon')}
  ${col(200, 'cf-fill', 8, 'ordinary')}
  <path class="cf-g" d="M120 52 L120 188" stroke-dasharray="4 3"/>
  <path class="cf-g" d="M186 52 L186 188" stroke-dasharray="4 3"/>
  <text class="cf-gd" x="300" y="76">protected all the way down</text>
  <text class="cf-d" x="300" y="98">not just the cell you can see</text>
  <text class="cf-d" x="300" y="126">otherwise a player tunnels underneath</text>
  <text class="cf-d" x="300" y="144">and the landmark is left floating</text>
  <text class="cf-c" x="300" y="172">768 cells out of 2.7 billion</text>
  <text class="cf-d" x="14" y="204">12 columns &#215; the crust depth &#8212; the entire cost of the rule</text>`));
}

// =============================================================================
// 17 — not-intervisible: no tower reaches the next pentagon
// =============================================================================
{
  const O = [214, 470], R = 400;                       // R = 1700 m -> 400 px
  const S = R/1700;                                    // px per metre
  const at = (deg, r) => [O[0] + r*Math.sin(deg*Math.PI/180), O[1] - r*Math.cos(deg*Math.PI/180)];
  const half = (1882/1700) * 180/Math.PI / 2;          // half the gap, in degrees
  const A = at(-half, R), B = at(half, R);
  const towerH = 400*S, top = at(-half, R + towerH);
  const reachDeg = -half + (1143/1700) * 180/Math.PI;  // 400 m tower sees 1,143 m
  const reach = at(reachDeg, R);
  made.push(svg('not-intervisible', 430, 248, `
  <path class="cf-m" d="M${f(at(-half*1.5,R)[0])} ${f(at(-half*1.5,R)[1])} A ${R} ${R} 0 0 1 ${f(at(half*1.5,R)[0])} ${f(at(half*1.5,R)[1])}"/>
  <path class="cf-a" d="M${f(A[0])} ${f(A[1])}L${f(top[0])} ${f(top[1])}"/>
  <path class="cf-g" d="M${f(top[0])} ${f(top[1])}L${f(reach[0])} ${f(reach[1])}"/>
  <circle class="cf-gf" cx="${f(reach[0])}" cy="${f(reach[1])}" r="4"/>
  <polygon class="cf-gf" points="${pts(Array.from({length:5},(_,i)=>{const a=-Math.PI/2+2*Math.PI*i/5;
    return [A[0]+8*Math.cos(a), A[1]+8*Math.sin(a)];}))}"/>
  <polygon class="cf-gf" points="${pts(Array.from({length:5},(_,i)=>{const a=-Math.PI/2+2*Math.PI*i/5;
    return [B[0]+8*Math.cos(a), B[1]+8*Math.sin(a)];}))}"/>
  <path class="cf-l" d="M${f(reach[0])} ${f(reach[1]-10)}L${f(B[0])} ${f(B[1]-10)}" stroke-dasharray="3 3"/>
  <text class="cf-c" x="${f(top[0]-6)}" y="${f(top[1]-8)}" text-anchor="middle">a 400 m tower</text>
  <text class="cf-gd" x="${f(reach[0]-4)}" y="${f(reach[1]+20)}" text-anchor="middle">sees 1,143 m</text>
  <text class="cf-d" x="${f(B[0]+10)}" y="${f(B[1]-4)}">next pentagon,</text>
  <text class="cf-d" x="${f(B[0]+10)}" y="${f(B[1]+12)}">1,882 m away</text>
  <text class="cf-c" x="14" y="26">to see one pentagon from the next</text>
  <text class="cf-c" x="14" y="46">you would need a 1,793 m tower</text>
  <text class="cf-d" x="14" y="70">which is taller than the planet&#8217;s radius</text>`));
}

// =============================================================================
// 17 — ocean-lock: burial is affordable and still costs every world its map
// =============================================================================
{
  const planet = (cx, cy, r, seed, label) => {
    let land = '';
    for (let k = 0; k < 9; k++){                       // terrain that differs by seed
      const a = (k*40 + seed*17) * Math.PI/180, rr = r*(0.32 + 0.12*((k*seed)%5)/4);
      land += `<circle class="cf-l" cx="${f(cx + rr*Math.cos(a))}" cy="${f(cy + rr*Math.sin(a)*0.8)}" r="${f(7+((k+seed)%4)*3)}"/>`;
    }
    let seas = '';
    for (const [a, e] of [[-64,0.62],[8,0.34],[86,0.70],[152,0.48],[-140,0.72]]){
      const t = a*Math.PI/180;                         // the SAME twelve places, always
      seas += `<circle class="cf-af" cx="${f(cx + r*e*Math.cos(t))}" cy="${f(cy + r*e*Math.sin(t)*0.86)}" r="11"/>`;
    }
    return `<circle class="cf-fill" cx="${cx}" cy="${cy}" r="${r}"/>${land}${seas}`
      + `<text class="cf-d" x="${cx}" y="${cy+r+22}" text-anchor="middle">${label}</text>`;
  };
  made.push(svg('ocean-lock', 430, 216, `
  ${planet(112, 100, 76, 1, 'seed 4823')}
  ${planet(300, 100, 76, 3, 'seed 91170')}
  <text class="cf-c" x="215" y="24" text-anchor="middle">different terrain, identical seas</text>
  <text class="cf-d" x="215" y="204" text-anchor="middle">1% of the surface is affordable &#183; the same map in every world is not</text>`));
}

// =============================================================================
// 13 — up-is-local: one shared up on a flat world, one per place on a round one
// =============================================================================
{
  const AR = `<defs><marker id="u1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
    <path d="M0 0 L10 5 L0 10 z" fill="#2f6fd0"/></marker></defs>`;
  // flat: four figures, four identical arrows
  let flat = '', gy = 118;
  for (let k = 0; k < 4; k++){
    const x = 34 + k*36;
    flat += `<path class="cf-a" d="M${x} ${gy} L${x} ${gy-40}" marker-end="url(#u1)"/>`
         +  `<circle class="cf-af" cx="${x}" cy="${gy}" r="4"/>`;
  }
  // round: four figures on an arc, four arrows that disagree
  const O = [300, 190], Rr = 92;
  let round = '';
  for (let k = 0; k < 4; k++){
    const a = (-125 + k*36) * Math.PI/180;
    const px = O[0] + Rr*Math.sin(a), py = O[1] - Rr*Math.cos(a);
    const qx = O[0] + (Rr+40)*Math.sin(a), qy = O[1] - (Rr+40)*Math.cos(a);
    round += `<path class="cf-a" d="M${f(px)} ${f(py)} L${f(qx)} ${f(qy)}" marker-end="url(#u1)"/>`
          +  `<circle class="cf-af" cx="${f(px)}" cy="${f(py)}" r="4"/>`;
  }
  made.push(svg('up-is-local', 430, 214, `${AR}
  <path class="cf-m" d="M20 ${gy} L154 ${gy}"/>
  ${flat}
  <text class="cf-d" x="87" y="${gy+22}" text-anchor="middle">flat world</text>
  <text class="cf-c" x="87" y="24" text-anchor="middle">one up, shared</text>
  <text class="cf-d" x="87" y="42" text-anchor="middle">a constant in the code</text>
  <circle class="cf-fill" cx="${O[0]}" cy="${O[1]}" r="${Rr}"/>
  ${round}
  <text class="cf-c" x="300" y="24" text-anchor="middle">round world</text>
  <text class="cf-d" x="300" y="42" text-anchor="middle">one up per place &#183; normalize(position)</text>
  <text class="cf-d" x="300" y="${O[1]+18}" text-anchor="middle">centre</text>`));
}

// =============================================================================
// 13 — no-global-north: comb the sphere flat and a cowlick always survives
// =============================================================================
{
  const O = [212, 108], R = 84;
  // tangent hairs combed around the axis: they shrink to nothing at the two poles
  let hair = '';
  for (let ring = 1; ring <= 4; ring++){
    const colat = ring * 36 * Math.PI/180;
    const n = 12, rr = R*Math.sin(colat), yy = O[1] - R*Math.cos(colat)*0.55;
    for (let k = 0; k < n; k++){
      const t = 2*Math.PI*k/n;
      const x = O[0] + rr*Math.cos(t), y = yy + rr*0.34*Math.sin(t);
      const L = 15*Math.sin(colat);                 // hair length dies at the poles
      hair += `<path class="cf-l" d="M${f(x)} ${f(y)} l${f(-L*Math.sin(t))} ${f(L*0.34*Math.cos(t))}"/>`;
    }
  }
  made.push(svg('no-global-north', 430, 214, `
  <circle class="cf-fill" cx="${O[0]}" cy="${O[1]}" r="${R}"/>
  ${hair}
  <circle class="cf-gf" cx="${O[0]}" cy="${f(O[1]-R)}" r="6"/>
  <circle class="cf-gf" cx="${O[0]}" cy="${f(O[1]+R)}" r="6"/>
  <text class="cf-gd" x="${O[0]+14}" y="${f(O[1]-R+4)}">no direction here</text>
  <text class="cf-gd" x="${O[0]+14}" y="${f(O[1]+R+4)}">or here</text>
  <text class="cf-c" x="14" y="24">comb every point to face &#8220;north&#8221;</text>
  <text class="cf-d" x="14" y="42">and two points are left with nowhere to face</text>
  <text class="cf-d" x="14" y="196">no choice of axis removes them &#8212; only moves them</text>`));
}

// =============================================================================
// 13 — holonomy: walk a closed loop, come back turned
// =============================================================================
{
  const O = [140, 122], R = 96;
  const AR = `<defs><marker id="h1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
    <path d="M0 0 L10 5 L0 10 z" fill="#b0800f"/></marker></defs>`;
  const arr = (x,y,dx,dy) => `<path class="cf-g" d="M${f(x)} ${f(y)} l${f(dx)} ${f(dy)}" marker-end="url(#h1)"/>`;
  // one octant: north pole, then a quarter of the equator, then back
  const P = [O[0], O[1]-R], A = [O[0]-R, O[1]], B = [O[0], O[1]+R*0.36];
  made.push(svg('holonomy-walk', 430, 246, `${AR}
  <circle class="cf-fill" cx="${O[0]}" cy="${O[1]}" r="${R}"/>
  <path class="cf-m" d="M${P[0]} ${P[1]} L${A[0]} ${A[1]}"/>
  <path class="cf-m" d="M${A[0]} ${A[1]} A ${R} ${f(R*0.36)} 0 0 0 ${B[0]} ${B[1]}"/>
  <path class="cf-m" d="M${B[0]} ${B[1]} L${P[0]} ${P[1]}"/>
  ${arr(P[0]-4, P[1]+8, -26, 12)}
  ${arr(A[0]+10, A[1]+6, 4, 28)}
  ${arr(B[0]-6, B[1]-10, -6, -28)}
  ${arr(P[0]+6, P[1]+10, 26, 12)}
  <circle class="cf-af" cx="${P[0]}" cy="${P[1]}" r="5"/>
  <text class="cf-d" x="${P[0]+10}" y="${P[1]-8}">start and finish</text>
  <text class="cf-gd" x="256" y="30">1 &#183; set off facing left</text>
  <text class="cf-gd" x="256" y="52">2 &#183; turn nothing, walk on</text>
  <text class="cf-gd" x="256" y="74">3 &#183; turn nothing, walk home</text>
  <text class="cf-c" x="256" y="104">back where you started,</text>
  <text class="cf-c" x="256" y="122">facing 90&#176; from where you left</text>
  <text class="cf-d" x="256" y="150">you never turned. the ground did.</text>
  <text class="cf-d" x="256" y="176">rotation = enclosed area / R&#178;</text>
  <text class="cf-d" x="256" y="194">1/8 of the sphere = 90&#176;</text>
  <text class="cf-d" x="256" y="212">a 100 m city block = 0.20&#176;</text>`));
}

// =============================================================================
// 13 — pentagon-slip: the ring closes on a hexagon and does not on a pentagon
// =============================================================================
{
  // A ring of n neighbours around one cell. Set off from the top neighbour
  // pointing "0"; walk all the way round; see what you are pointing at on return.
  const ring = (cx, cy, n, R, cls) => {
    const c = [], sp = [];
    for (let i=0;i<n;i++){
      const a = -Math.PI/2 + 2*Math.PI*i/n;
      c.push([cx + R*Math.cos(a), cy + R*Math.sin(a)]);
    }
    for (const p of c) sp.push([[cx,cy],p]);
    let out = `<path class="cf-l" d="${pathOf(sp)}"/>`;
    // the walk itself, as an arc just inside the neighbours
    out += `<path class="${n===6?'cf-a':'cf-g'}" d="M${f(c[0][0])} ${f(c[0][1])}`
        +  c.slice(1).concat([c[0]]).map(p => `L${f(p[0])} ${f(p[1])}`).join('') + `" fill="none" stroke-dasharray="5 4"/>`;
    out += c.map(p => `<circle class="cf-fill" cx="${f(p[0])}" cy="${f(p[1])}" r="13"/>`).join('');
    out += `<circle class="${cls}" cx="${cx}" cy="${cy}" r="16"/>`;
    out += `<text class="cf-d" x="${cx}" y="${cy+4}" text-anchor="middle">${n===6?'6':'5'}</text>`;
    return out;
  };
  const startArrow = (cx, cy, cls, mk) =>
    `<path class="${cls}" d="M${cx} ${cy} l0 -26" marker-end="url(#${mk})"/>`;
  made.push(svg('pentagon-slip', 430, 236, `
  <defs>
    <marker id="s1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="#2f6fd0"/></marker>
    <marker id="s2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="#b0800f"/></marker>
  </defs>
  ${ring(112, 118, 6, 60, 'cf-af')}
  ${startArrow(112, 32, 'cf-a', 's1')}
  <text class="cf-c" x="112" y="22" text-anchor="middle">set off &#8593;  came back &#8593;</text>
  <text class="cf-d" x="112" y="206" text-anchor="middle">six neighbours, six steps</text>
  <text class="cf-c" x="112" y="228" text-anchor="middle">the ring closes</text>
  ${ring(318, 118, 5, 60, 'cf-gf')}
  <path class="cf-a" d="M310 32 l0 -22" marker-end="url(#s1)"/>
  <path class="cf-g" d="M326 34 l11 -19" marker-end="url(#s2)"/>
  <text class="cf-c" x="256" y="22">set off &#8593;</text>
  <text class="cf-gd" x="346" y="22">came back &#8599;</text>
  <text class="cf-d" x="318" y="206" text-anchor="middle">five neighbours, but six directions to account for</text>
  <text class="cf-gd" x="318" y="228" text-anchor="middle">the ring closes one short &#8212; you are turned 60&#176;</text>`));
}

// =============================================================================
// 13 — pentagon-deflect: no way to go straight through a pentagon
// =============================================================================
{
  const C = [150, 116], R = 62;
  let spokes = '', tips = [];
  for (let i=0;i<5;i++){
    const a = -Math.PI/2 + 2*Math.PI*i/5;
    const p = [C[0] + R*Math.cos(a), C[1] + R*Math.sin(a)];
    tips.push(p);
    spokes += `<path class="cf-l" d="M${C[0]} ${C[1]} L${f(p[0])} ${f(p[1])}"/>`;
  }
  const AR = `<defs><marker id="d1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
    <path d="M0 0 L10 5 L0 10 z" fill="#2f6fd0"/></marker></defs>`;
  made.push(svg('pentagon-deflect', 430, 214, `${AR}
  <polygon class="cf-gf" points="${pts(tips)}"/>
  ${spokes}
  <path class="cf-a" d="M${C[0]} ${f(C[1]-R-34)} L${C[0]} ${f(C[1]-6)}" marker-end="url(#d1)"/>
  <path class="cf-a" d="M${C[0]} ${C[1]} L${f(tips[2][0])} ${f(tips[2][1])}" stroke-dasharray="4 3" marker-end="url(#d1)"/>
  <path class="cf-a" d="M${C[0]} ${C[1]} L${f(tips[3][0])} ${f(tips[3][1])}" stroke-dasharray="4 3" marker-end="url(#d1)"/>
  <path class="cf-l" d="M${C[0]} ${C[1]} L${C[0]} ${f(C[1]+R+22)}" stroke-dasharray="2 4"/>
  <text class="cf-d" x="${C[0]+6}" y="${f(C[1]+R+34)}">nothing here to leave by</text>
  <text class="cf-c" x="${C[0]}" y="${f(C[1]-R-44)}" text-anchor="middle">rail arrives</text>
  <text class="cf-c" x="252" y="46">the two best exits both bend</text>
  <text class="cf-c" x="252" y="68">36.07&#176;</text>
  <text class="cf-d" x="252" y="96">adjacent directions sit 71.965&#176; apart,</text>
  <text class="cf-d" x="252" y="114">so no pair is 180&#176; &#8212; there is no</text>
  <text class="cf-d" x="252" y="132">&#8220;carry straight on&#8221; on a five</text>`));
}

// =============================================================================
// 13 — small-planet: the horizon at eye height, and the lean between builds
// =============================================================================
{
  // left: the horizon at eye height. Angles exaggerated 8x or nothing is visible
  // at 1.7 m on a 1,700 m planet -- the caption says so.
  const O = [128, 372], R = 300, EX = 8;
  const at = (d, r) => [O[0] + r*Math.sin(d*Math.PI/180), O[1] - r*Math.cos(d*Math.PI/180)];
  const hzDeg = (180/Math.PI) * Math.acos(1700/1701.7) * EX;
  const top = at(0, R), eye = at(0, R+30), hz = at(hzDeg, R);
  made.push(svg('small-planet', 430, 232, `
  <circle class="cf-fill" cx="${O[0]}" cy="${O[1]}" r="${R}"/>
  <path class="cf-a" d="M${f(top[0])} ${f(top[1])} L${f(eye[0])} ${f(eye[1])}"/>
  <circle class="cf-af" cx="${f(eye[0])}" cy="${f(eye[1])}" r="4"/>
  <path class="cf-g" d="M${f(eye[0])} ${f(eye[1])} L${f(hz[0])} ${f(hz[1])}"/>
  <path class="cf-l" d="M${O[0]} ${O[1]} L${f(hz[0])} ${f(hz[1])}" stroke-dasharray="3 4"/>
  <circle class="cf-gf" cx="${f(hz[0])}" cy="${f(hz[1])}" r="4.5"/>
  <text class="cf-c" x="${f(eye[0]-10)}" y="${f(eye[1]-6)}" text-anchor="end">eye, 1.7 m up</text>
  <text class="cf-gd" x="${f(hz[0]+8)}" y="${f(hz[1]-4)}">horizon</text>
  <text class="cf-gd" x="${f(hz[0]+8)}" y="${f(hz[1]+12)}">76 m away</text>
  <text class="cf-d" x="14" y="204">the same eye on Earth sees 4.7 km</text>
  <text class="cf-d" x="14" y="222">everything a standing player can see is about 21,000 cells</text>
  <text class="cf-c" x="300" y="30" text-anchor="middle">and the ground leans as you cross it</text>
  ${(() => {                                   // right: two towers 100 m apart
    const P = [300, 196], Rr = 620, half = 1.685*EX/2;
    const foot = d => [P[0] + Rr*Math.sin(d*Math.PI/180), P[1] + Rr - Rr*Math.cos(d*Math.PI/180)];
    const twr = d => { const b = foot(d);
      return [b, [b[0] + 62*Math.sin(d*Math.PI/180), b[1] - 62*Math.cos(d*Math.PI/180)]]; };
    const [b1,t1] = twr(-half), [b2,t2] = twr(half);
    return `<path class="cf-m" d="M${f(foot(-half*2.4)[0])} ${f(foot(-half*2.4)[1])}`
      + ` A ${Rr} ${Rr} 0 0 1 ${f(foot(half*2.4)[0])} ${f(foot(half*2.4)[1])}"/>`
      + `<path class="cf-a" d="M${f(b1[0])} ${f(b1[1])}L${f(t1[0])} ${f(t1[1])}"/>`
      + `<path class="cf-a" d="M${f(b2[0])} ${f(b2[1])}L${f(t2[0])} ${f(t2[1])}"/>`
      + `<path class="cf-l" d="M${f(t1[0])} ${f(t1[1])}L${f(b1[0]+(b1[0]-t1[0])*1.1)} ${f(b1[1]+(b1[1]-t1[1])*1.1)}" stroke-dasharray="2 4"/>`
      + `<path class="cf-l" d="M${f(t2[0])} ${f(t2[1])}L${f(b2[0]+(b2[0]-t2[0])*1.1)} ${f(b2[1]+(b2[1]-t2[1])*1.1)}" stroke-dasharray="2 4"/>`
      + `<text class="cf-d" x="300" y="188" text-anchor="middle">100 m apart</text>`
      + `<text class="cf-c" x="300" y="60" text-anchor="middle">3.37&#176; out of parallel</text>`;
  })()}`));
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
// why-cells-differ -- the face plane sags inward, so pushing its grid out to
// the sphere stretches the middle and leaves the corners alone
// =============================================================================
{
  const D2R = Math.PI/180, O = [236, 268], Rp = 196;
  const tv = 37.3774;                            // face angular radius
  const at = d => [O[0] + Rp*Math.sin(d*D2R), O[1] - Rp*Math.cos(d*D2R)];
  const A = at(-tv), B = at(tv);
  const N = 10;
  const onChord = k => [A[0] + (B[0]-A[0])*k/N, A[1] + (B[1]-A[1])*k/N];
  const project = p => { const d = Math.hypot(p[0]-O[0], p[1]-O[1]);
    return [O[0] + (p[0]-O[0])/d*Rp, O[1] + (p[1]-O[1])/d*Rp]; };

  const rays = [], flat = [], curved = [];
  for (let k = 0; k <= N; k++){
    const p = onChord(k), q = project(p);
    rays.push([p, q]);
    flat.push(`<circle class="cf-af" cx="${f(p[0])}" cy="${f(p[1])}" r="3"/>`);
    curved.push(`<circle class="cf-gf" cx="${f(q[0])}" cy="${f(q[1])}" r="3.6"/>`);
  }
  // the widest gap (across the middle) and the narrowest (at a corner)
  const gap = (k, cls) => {
    const a = project(onChord(k)), b = project(onChord(k+1));
    return `<path class="${cls}" d="M${f(a[0])} ${f(a[1])} A ${f(Rp)} ${f(Rp)} 0 0 1 ${f(b[0])} ${f(b[1])}" stroke-width="4"/>`;
  };
  made.push(svg('why-cells-differ', 520, 292, `
  <path class="cf-m" d="M${f(A[0])} ${f(A[1])} A ${f(Rp)} ${f(Rp)} 0 0 1 ${f(B[0])} ${f(B[1])}"/>
  ${gap(N/2, 'cf-g')}${gap(N-1, 'cf-a')}
  <path class="cf-l" d="${pathOf(rays)}" stroke-dasharray="3 3"/>
  <path class="cf-m" d="M${f(A[0])} ${f(A[1])}L${f(B[0])} ${f(B[1])}"/>
  ${flat.join('')}${curved.join('')}
  <circle class="cf-fill" cx="${f(A[0])}" cy="${f(A[1])}" r="5"/>
  <circle class="cf-fill" cx="${f(B[0])}" cy="${f(B[1])}" r="5"/>
  <circle cx="${f(O[0])}" cy="${f(O[1])}" r="3.5" fill="#48505f"/>
  <text class="cf-d" x="${f(O[0])}" y="${f(O[1]+18)}" text-anchor="middle">planet centre</text>
  <text class="cf-c" x="14" y="26">flat face &#183; lattice points evenly spaced</text>
  <text class="cf-gd" x="14" y="46">sphere &#183; the same points, bunched at the corners</text>
  <text class="cf-big" x="${f(A[0]-10)}" y="${f(A[1]+20)}" text-anchor="end">corner</text>
  <text class="cf-d" x="${f(A[0]-10)}" y="${f(A[1]+36)}" text-anchor="end">already on the sphere</text>
  <text class="cf-big" x="506" y="26" text-anchor="end">middle sits at 79% of R</text>
  <text class="cf-d" x="506" y="44" text-anchor="end">cos 37.3774&#176; = 0.7947</text>
  <text class="cf-gd" x="506" y="70" text-anchor="end">widest cell, at the face centre</text>
  <text class="cf-c" x="506" y="90" text-anchor="end">narrowest cell, at the corner</text>
  <text class="cf-big" x="506" y="120" text-anchor="end">1 / 0.7947&#179; = 1.99</text>`));
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

// =============================================================================
// pentagon-loops -- the slip is topological, so distance buys nothing
// =============================================================================
{
  const O = [128, 128], U = 26;
  let s = `<circle class="cf-gf" cx="${f(O[0])}" cy="${f(O[1])}" r="6"/>`;
  // rings at radius k hold 5k cells around a degree-5 cell (doc 16)
  for (let k = 1; k <= 3; k++){
    const n = 5 * k;
    s += `<circle class="cf-a" cx="${f(O[0])}" cy="${f(O[1])}" r="${f(k*U)}" stroke-dasharray="${k === 1 ? '' : '5 4'}"/>`;
    for (let i = 0; i < n; i++){
      const a = 2*Math.PI*i/n - Math.PI/2;
      s += `<circle class="cf-af" cx="${f(O[0] + k*U*Math.cos(a))}" cy="${f(O[1] + k*U*Math.sin(a))}" r="2.8"/>`;
    }
    // an arrow showing the carried heading, and where it comes back to
    const a0 = -Math.PI/2, tip = [O[0] + k*U*Math.cos(a0), O[1] + k*U*Math.sin(a0)];
    s += `<path class="cf-g" d="M${f(tip[0]-9)} ${f(tip[1]-11)}L${f(tip[0]+9)} ${f(tip[1]-11)}"
           marker-end="url(#hd)"/>`;
  }
  made.push(svg('pentagon-loops', 430, 256, `
  <defs><marker id="hd" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
    <path d="M0 0L7 3.5L0 7Z" fill="#b0800f"/></marker></defs>
  ${s}
  <text class="cf-gd" x="${f(O[0])}" y="${f(O[1] + 4)}" text-anchor="middle" font-size="10">5</text>
  <text class="cf-c" x="266" y="60">loop radius 1 &#183; 5 cells</text>
  <text class="cf-c" x="266" y="80">loop radius 2 &#183; 10 cells</text>
  <text class="cf-c" x="266" y="100">loop radius 3 &#183; 15 cells</text>
  <text class="cf-big" x="266" y="136">every one returns</text>
  <text class="cf-big" x="266" y="154">rotated 1 index = 60&#176;</text>
  <text class="cf-d" x="266" y="180">the slip counts the pentagons</text>
  <text class="cf-d" x="266" y="196">enclosed, not the distance kept</text>
  <text class="cf-d" x="128" y="240" text-anchor="middle">measured out to radius 16</text>`));
}

console.log(`wrote ${made.length} figures to docs/figures/`);
for (const m of made) console.log('  ' + m + '.svg');
