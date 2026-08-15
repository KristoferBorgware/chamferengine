# Demos

Twenty-seven self-contained HTML files. No build step, no `npm install`, no server
required — open any of them directly in a browser. All are mobile-friendly and
touch-enabled.

The 3D demos load Three.js r128 from a CDN and need an internet connection. The
2D ones are fully offline.

---

## Start here

### [`how-it-works.html`](how-it-works.html)
An illustrated walkthrough of the whole construction, for someone meeting it for
the first time: start with twenty triangles, split each into four, push the
corners onto a ball, and put the blocks **on the corners rather than in the
triangles**. Ten diagrams, no interaction, no dependencies.

It then carries that one idea through to the parts it decides — why there are
exactly twelve pentagons, why an address is just the route down the splits, what
a cell costs to draw, why level of detail has to resample rather than decimate,
and why a skirt closes a chunk seam at the surface but not where a cave runs
into it.

**Docs:** [02 — Choosing the geometry](../docs/02-geometry-choice.md),
[03 — Addressing](../docs/03-addressing.md),
[14 — Meshing and LOD](../docs/14-meshing-and-lod.md)

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

### [`subdivision-and-chunks.html`](subdivision-and-chunks.html)
The two sliders side by side, on real hexagons. Icosahedron faces unfolded flat,
with terrain sampled from each cell's true 3D position using the noise function
[doc 08](../docs/08-terrain-generation.md) pins.

**Move chunk level and nothing on the ground moves** — only the teal lines. Move
subdivision depth and everything does, because level of detail here is resampling
rather than smoothing. That is doc 03's "chunk size stays tunable after launch",
visible rather than asserted, with the bit bar re-cutting the same `5 + 2D` width
underneath.

Tap a hexagon for its face, `(i, j)`, path digits and `(q, r)`, with the nested
triangles that name it drawn one per level and every cell filed under the same
chunk washed white. That wash is `rank.js`'s ownership rule on screen: a chunk of
15 slots owns anywhere from 6 to 15 cells depending on which edges it won. Put two
or more faces up and the terrain crosses the seam without a break.

**Docs:** [03 — Addressing](../docs/03-addressing.md),
[07 — Data structures](../docs/07-data-structures.md),
[08 — Terrain generation](../docs/08-terrain-generation.md)

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
The stored 64-bit word, live: `[planet 12][face 5][path 2×D][corner 2][layer 10]`.
Drag the chunk-level slider and watch the dashed line move while the binary string
below it does not change at all — that is the whole of what the encoding buys.
Drag depth instead and the word runs out of room at `D` 17. Tap the truncate
buttons to see the tail go dark and the surviving prefix's coverage reported.

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

### [`patch-vs-range.html`](patch-vs-range.html)
Doc 11 claimed multiplayer interest was "an ID range comparison; the addressing
scheme does the work". This is what that actually looks like. One face, split into
4,096 chunks, with a player's view drawn over it and **each colour one unbroken
run of consecutive IDs**. A single range would be a single colour. Drag it
anywhere and it never is.

The reason is in the second control. Widen the view and the chunk count grows with
the **area** while the run count grows only with the **rim** — 2.4 chunks per run
at close range, 26 at long range. So ID ranges get *better* with distance, which
is why they earn their keep on disk and not on the network. The order toggle shows
doc 03's `[0,3,1,2]` beating the naive walk by around 10%, and no more.

**Docs:** [22 — Multiplayer interest management](../docs/22-multiplayer-interest.md),
[03 — Addressing](../docs/03-addressing.md)

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

### [`lat-long-on-a-ball.html`](lat-long-on-a-ball.html)
Spin the planet; the crosshair is where you are standing. The readout gives
latitude, longitude and the exact cell, and says whether **the rounded readout
would have named the same cell** — which is the point of doc 20. It usually does
and sometimes does not, so you show lat/long and send the ID.

The lookup is doc 04's real pipeline (nearest face centroid → barycentric →
`hexRound`), not a nearest-centre search, and the survey in the corner is measured
live on load: two decimals name the right cell **87.5%** of the time, three
**98.8%** — the same numbers `coords.js` reports. The red dots are the twelve
pentagons. The axis runs through an antipodal pair, so both poles are pentagons
and the other ten sit at exactly ±26.565°, in every world that will ever exist.

**Docs:** [20 — Player-facing coordinates](../docs/20-player-coordinates.md)

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

### [`rivers-and-lakes.html`](rivers-and-lakes.html)
Doc 21's flow routing, run live on a real level-6 planet — 40,962 cells, filled,
routed and accumulated in about half a second. One button, and it is the whole
argument: **fill lakes flat** and 914 rivers stop dead where they meet the water,
ringed in red. **Fill with a slope** — a ten-thousandth of a metre per cell — and
there are none, with a trunk river running out of the lake system to the sea.

The lake cells are the same cells in both modes. The slope does not change what
holds water; it changes whether "flow to your lowest neighbour" has an answer.

**Docs:** [21 — Rivers, erosion and continents](../docs/21-rivers-and-erosion.md)

---

### [`dam-a-river.html`](dam-a-river.html)
Click to build a wall across a river. **Nothing happens** — the river runs where
it ran, the water above stays, the water below keeps flowing. That is doc 24's
decision and doc 25's rule seen from the inside: water is a block type, and blocks
do not move.

Then press the other button and the demo runs the simulation that is *not* being
built, so you can see what was given up. Two things show up immediately. **One
block dams nothing**, because a cell has six ways out and the water goes round —
it takes a wall that spans the channel before anything floods at all. And when it
does flood, the amber cells are only the upstream half: every cell below the wall
has lost its flow, and terrain bounds the lake while nothing bounds the deficit.

Level 7, the same resolution `verification/edits.js` measures at — at level 6 a
river is one cell wide and one block really would dam it.

**Docs:** [24 — Player edits and global processes](../docs/24-edits-and-global-processes.md),
[21 — Rivers, erosion and continents](../docs/21-rivers-and-erosion.md)

---

## Orientation

### [`local-frame.html`](local-frame.html)
Why there is no global north, made physical. Drag the walker and the two frames
separate: the blue one is carried and updated, the red one recomputed from the
pole axis — watch it go undefined as the walker crosses a pole.

The four loop presets are the point. Each walks a closed path and reports the
heading rotation beside the area enclosed; they agree to two decimals every time
— 0.65°, 90°, 180°, and a full turn for the equator. That is holonomy, and it is
why a carried heading is a camera state and never a stored coordinate.

The gold ring is the true horizon for a 1.7 m eye, drawn to scale: **76 m** on
the doc-06 planet. Switch the planet to Earth and it shrinks below drawable.
The violet dots are the twelve pentagons; the two gold ones are the antipodal
pair carrying the lat/long poles.

**Docs:** [13 — Gravity and orientation](../docs/13-gravity-and-orientation.md)

---

### [`pentagon-loop.html`](pentagon-loop.html)
The claim that costs the most elsewhere in the specification, made touchable.
Carry a heading right around a closed loop of cells and it comes back **turned by
one direction index — 60°** — but only if a pentagon is inside the loop. Drag the
loop away and it closes perfectly.

The grid is the real one (a subdivided icosahedron at level 5) and the transport
rule is lifted from `verification/rotation.js`, so what you see is what the script
measures. Two things worth watching: the loop is a **pentagon** when it wraps the
defect and a **hexagon** when it does not, and the flip happens exactly as the
pentagon crosses the loop — not as it gets further away.

**Docs:** [17 — Pentagons as a place](../docs/17-pentagons.md),
[19 — Directional blocks](../docs/19-directional-blocks.md)

---

## Rendering

### [`mesh-lod.html`](mesh-lod.html)
The tiling at five resolutions, reporting its own vertex and triangle counts.
Watch them converge on exactly **2 vertices and 4 triangles per cell** — the real
cost of an unmerged hex surface, twice a cube's and no worse.

The altitude slider is the argument. It draws the true horizon ring and colours
the cells inside it; at eye height that is **one hexagon on the whole planet**,
0.05% of the surface. The readout gives the figures for a real level-11 world and
the level that fits a 2M-triangle budget.

**Docs:** [14 — Meshing and LOD](../docs/14-meshing-and-lod.md)

### [`precision-scale.html`](precision-scale.html)
A player taking twenty-four 10 cm steps, on a planet you can resize. Hollow
outlines are where the steps really are; solid bars are where a `float32` can
actually put them, and the number on a bar counts how many steps collapsed onto
it.

Drag the radius. All twenty-four land somewhere different on the worked-example
planet, on **six** positions at Earth radius, and on a **single** position by
Jupiter. The same twenty-four steps are drawn again underneath in chunk-local
coordinates, where nothing moves however far the slider goes — which is the whole
argument for anchoring positions to a chunk.

**Docs:** [15 — Precision and the floating origin](../docs/15-precision-and-origin.md)

### [`lighting.html`](lighting.html)
Two tabs. **Torch** puts the same flood fill on a hex field and a square field
side by side, light levels drawn in each cell, with a range slider. The counts
track `3r²+3r+1` against `2r²+2r+1`, so the **1.5×** is visible rather than
asserted, and the readout gives the pentagon figure — 5/6 of the area for the
same light.

**Terminator** spins a planet with a live day/night line and a day-length slider.
A walker stands still on the surface while the terminator sweeps over them, so
you watch day and night arrive as a *place* rather than as a clock value. It
opens on the anchor: a **2.12-hour** day, doc 06's circumnavigation time, where
the terminator moves at exactly walking pace. Slide it shorter and dawn overtakes
you; longer and you can outwalk the sunset indefinitely. Twilight is marked on
both terminators, and its duration is a fixed fraction of the day whatever the
planet's size.

**Docs:** [16 — Lighting](../docs/16-lighting.md)


---

### [`wade-or-swim.html`](wade-or-swim.html)
A shoreline in section, at the size the blocks really are. Drag the player into
the water and watch the states: dry land, then **one block — standing**, then
**two blocks — swimming**. There is no third state, because at 1 m blocks a 1.8 m
player has no depth available between 1 and 2.

That is the point. Walking and swimming is a **threshold exactly one cell wide**,
not a gradient, so the mover never needs a partial-buoyancy case. *Another
shoreline* reseeds the terrain — the band is one cell wide on every one of them,
because it is a fact about block size and player height, not about this coastline.

**Docs:** [25 — Water](../docs/25-water.md)

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
