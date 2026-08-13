# Demos

Fifteen self-contained HTML files. No build step, no `npm install`, no server
required — open any of them directly in a browser. All are mobile-friendly and
touch-enabled.

The 3D demos load Three.js r128 from a CDN and need an internet connection. The
2D ones are fully offline.

---

## Geometry

### [`sphere-tiling-shapes.html`](sphere-tiling-shapes.html)
Six tilings side by side, colour-coded by where the curvature defect lands.
Blue = regular cells, red = major defect, amber = minor.

Compare *Quads · cube* against *Quads · rhombic 30* at the same resolution: same
720° total, but the cube dumps 90° into 8 corners while the rhombic-30 spreads it
across 32 points. The last two buttons show the space-filling lattice cells.

**Docs:** [02 — Choosing the geometry](../docs/02-geometry-choice.md)

### [`goldberg-voxel-sphere.html`](goldberg-voxel-sphere.html)
The chosen tiling, generated as the dual of a subdivided icosahedron. Four
resolutions from 12 to 2,562 cells. At the highest setting the twelve pentagons
become hard to spot.

**Docs:** [02 — Choosing the geometry](../docs/02-geometry-choice.md)

### [`s2-vs-h3.html`](s2-vs-h3.html)
The prior art. Switch S2's projection between linear, quadratic and tangent and
watch the **measured** area ratio drop from ~5.1 to ~2.1 to ~1.4 — computed live
from the cells on screen with l'Huilier's formula, not quoted. The red cells are
the eight cube corners that no projection fixes. The gold thread is the Hilbert
order.

The second tab shows the H3-family structure with icosahedron face edges
overlaid. Structurally accurate; real H3 cells are rotated relative to these
because of aperture-7 subdivision.

**Docs:** [01 — Prior art](../docs/01-prior-art.md)

---

## Addressing

### [`chunk-hierarchy.html`](chunk-hierarchy.html)
Triangles carrying the hierarchy, hexes sitting on their vertices. Raise the
depth and watch the colours stay put — exact containment. Switch to *Hex cells*
and colour boundaries cut *through* hexagons; the readout gives the live
border-cell percentage.

**Docs:** [03 — Addressing](../docs/03-addressing.md)

### [`flat-cells-chunks.html`](flat-cells-chunks.html)
The same idea flat, in four tap-through steps: scaffolding → cells on corners →
chunk division → ownership. The simplest entry point to the whole design.

**Docs:** [03 — Addressing](../docs/03-addressing.md)

### [`cell-id-bits.html`](cell-id-bits.html)
The bit layout, live. Drag the depth and chunk-level sliders and watch the total
width stay at `5 + 2D` regardless of where you cut. Tap the truncate buttons to
see bits vanish and the surviving prefix's surface coverage reported.

**Docs:** [03 — Addressing](../docs/03-addressing.md)

### [`address-split.html`](address-split.html)
Tap any lattice point to see `(i, j)` carved into path digits plus `(q, r)`.
*Find a flipped one* demonstrates the middle-child orientation flip that affects
~46% of cells.

**Docs:** [03 — Addressing](../docs/03-addressing.md)

### [`adjacency-table-2d.html`](adjacency-table-2d.html)
One icosahedron face laid flat with its three neighbours folded out. Each ringed
circle is a triangle's `0,0` origin with its `i`/`j` axes. The gold dot is one
physical cell on the seam, with its address in **both** frames — the gap between
those numbers is what the table exists to close.

**Docs:** [05 — Face adjacency](../docs/05-face-adjacency.md)

### [`barycentric.html`](barycentric.html)
Drag a point in a triangle. The shaded regions *are* the coordinates — each one's
area equals the opposite corner's weight. The table shows rounding breaking the
sum and being repaired. Drag outside and a weight goes negative: that is the
face-boundary test.

**Docs:** [04 — Position lookup](../docs/04-position-lookup.md)

---

## Sizing and structure

### [`planet-size-calculator.html`](planet-size-calculator.html)
Block size and travel time in; subdivision level, snapped radius, cell count,
total voxels, and crust taper out. Drag the time slider slowly to watch the level
tick over and the rounding penalty swing up to ±40%.

**Docs:** [06 — World sizing](../docs/06-world-sizing.md)

### [`data-structures.html`](data-structures.html)
Three tabbed diagrams: what lives where (constant / pure / RAM / disk), inside a
chunk (palette and packed indices), and the lookup path with its hit/miss branch.

**Docs:** [07 — Data structures](../docs/07-data-structures.md)

---

## Terrain

### [`planet-slice-noise.html`](planet-slice-noise.html)
A cross-section through a planet, showing the density field in volume. Push
*Cave carving* up slowly to watch noise overpower the radial bias: pockets →
overhangs → floating islands → swiss cheese. Sea level is visibly a radius.

**Docs:** [08 — Terrain generation](../docs/08-terrain-generation.md)

### [`planet-3d-noise.html`](planet-3d-noise.html)
The same generator on the real hex grid. The thing to look for is what you
*don't* see: no mountain range, coastline, or biome boundary lines up with a face
seam or pentagon, because the generator samples 3D world space and never sees the
addressing scheme.

**Docs:** [08 — Terrain generation](../docs/08-terrain-generation.md)

---

## Interaction

### [`ray-traversal.html`](ray-traversal.html)
Block picking as a grid walk. Drag the eye or aim point; numbered cells show the
walk order. Compare *cells walked* against *cells in field*. The white bar on the
hit cell is the entry edge, ready for placement. Aim through the triangle edge to
trigger the face-exit case.

**Docs:** [09 — Ray traversal](../docs/09-ray-traversal.md)

### [`pathfinding.html`](pathfinding.html)
A* on hexes versus squares on the same map. Watch the *Illegal cuts* column go
red on squares — structurally always zero on hexes. The *Chunks* toggle shows
hierarchical corridor search cutting the explored node count.

**Docs:** [10 — Pathfinding](../docs/10-pathfinding.md)

---

## A note on what is missing

Two earlier demos were built during design exploration and are deliberately not
included: an early Platonic-solids viewer superseded by `sphere-tiling-shapes`,
and a hardcoded truncated-icosahedron attempt that was **geometrically wrong** —
its vertex coordinates and face indices were invented rather than computed, and
it rendered as disconnected triangles.

Every demo here generates its geometry algorithmically from first principles.
That is the standard for anything added to this folder.
