# 14 — Meshing and level of detail

## The problem

Turn a chunk of hexagonal prisms into triangles, cheaply enough to stream, with
a level-of-detail scheme that decides **per triangle** how finely to draw the
ground under it, and without cracks where two levels meet.

## The received wisdom is half wrong

[Doc 11](11-open-topics.md) said hex prisms have 8 faces to a cube's 6, that
greedy meshing mostly does not apply, and to expect meaningfully more vertices.
The first is true, the second needs qualifying, and the third is smaller than it
sounds.

> **[verified]** `verification/mesh.js` builds the real dual mesh at levels 1–5
> and counts. A fully exposed hex surface costs **2 vertices and 4 triangles per
> cell** — converging to exactly that, since the dual of a triangulation with `V`
> cells has `2V − 4` vertices and a fan triangulation gives `4V − 12` triangles.
> An unmerged square grid costs 1 vertex and 2 triangles per cell.

![A hexagon fanned into four triangles, and a corner shared between three hexagons](figures/cell-mesh-cost.svg)

*Four triangles per cap, and because every corner is shared by three cells, only
two vertices per cell are new.*

So an unmerged hex surface is **exactly 2× an unmerged cube surface**. Not a
disaster — a flat, predictable factor of two. The whole difference is about
*merging*, and even there the loss is narrower than expected.

---

## Three kinds of face, three different answers

**Caps** — the top and bottom of a prism. A hexagon fans into 4 triangles from
one of its own corners; a pentagon into 3. Do not add a centre vertex: it buys
nothing on a near-regular cell and costs a vertex per cell. Corners are shared
by three cells, which is where the 2-vertices-per-cell figure comes from.

**Side faces, vertically** — merge perfectly.

> **[verified]** `verification/mesh.js` — the side face of a prism lies in the
> radial plane through the shared edge, and stacked cells share that plane. Over
> three layers the four corners deviate from a single plane by **1.5e-16**
> radii. A run of exposed side faces down a column collapses to one quad,
> exactly, at no geometric cost.

![Three stacked side quads collapsing into one tall quad](figures/vertical-merge.svg)

*A run of exposed side faces down a column collapses into a single rectangle, and
the merge is exact — the faces genuinely lie in one plane.*

**Side faces, horizontally** — do not merge. In a hex lattice the faces of
neighbouring cells pointing the same way are parallel but offset; they zigzag
rather than lining up, so there is no run to collapse.

![On the left, four hexagons in a row with one face of each highlighted, the highlighted faces parallel but staggered; on the right, four stacked cells whose side faces form one continuous flat surface](figures/no-sideways-merge.svg)

*Merging needs faces that lie in one plane. Going down a column they do, exactly.
Going sideways they never do — each neighbour's matching face is shifted half a
cell, so there is no run to collapse and no algorithm can invent one.*

That is the honest summary of what transfers: **run-length merging along the
radial axis is exact and costs one comparison per layer; the rectangle-growing
part of greedy meshing has no hex equivalent.** Which is the same shape as everything else in this design —
the radial axis is easy, the horizontal one is not ([doc 13](13-gravity-and-orientation.md)).

---

## It is a volume, not a surface

The 2-and-4 figure above is for a flat, fully exposed surface. A world with
mountains, cliffs, overhangs and caves is a **volume**, and it costs more. How
much more is the question, and the answer is: much less than the raw face count
suggests, because vertical merging absorbs almost all of it.

### Relief

A cell exposes one cap, plus — toward each of its six neighbours — one side face
per block of height difference. So raw side faces climb steeply with terrain
relief. But every one of those runs is unbroken, so each collapses to exactly one
quad.

> **[verified]** `verification/volume.js`, 1 m blocks on the doc-06 planet.
>
> | Relief | Raw side faces / cell | Side quads after merge | **Triangles / cell** |
> |---|---|---|---|
> | 0 m (flat) | 0.00 | 0.00 | **4.00** |
> | 10 m | 1.74 | 1.55 | **7.11** |
> | 30 m | 5.17 | 2.36 | **8.71** |
> | 60 m | 10.29 | 2.62 | **9.25** |
> | 120 m | 20.59 | 2.74 | **9.48** |

![Two curves against terrain relief: raw side faces climbing steeply and without limit, and triangles per cell rising then flattening out just below ten](figures/relief-saturates.svg)

*The frightening curve is the one that does not matter. Raw faces climb 20× as the
terrain gets rougher; the triangles you actually draw rise 2.4× and then flatten,
because vertical merging absorbs the difference.*

Raw faces grow 20×; **triangles grow 2.4× and then saturate.** The merged quad
count cannot exceed six and settles near 2.7, because on average about half a
cell's neighbours are lower than it whatever the relief.

So the working number is **4 triangles per cell on flat ground, about 9 on
mountainous ground**. Vertical merging is not a nice-to-have — without it the raw
face column is the cost, and it is five times worse.

### Caves — and a warning about the density term

The density field from [doc 08](08-terrain-generation.md) is
`(surfaceRadius − |p|) + noise3D(p) × strength`. The bias term grows by 1 per
metre of depth, so **enclosed voids only form when the noise gradient beats
it** — amplitude divided by feature size must exceed 1. Turn the strength up
without raising the frequency and you do not get caves; you get a rougher
surface and a much larger bill for it.

> **[verified]** `verification/volume.js`, 64 layers under 30 m of relief.
> Feature size is `R / frequency`.
>
> | Freq | Strength | Feature | Gradient | Cave cells | Spans/column | Faces/column |
> |---|---|---|---|---|---|---|
> | 40 | 0 | 42.5 m | 0.00 | 0 | 1.000 | 1.0 |
> | 40 | 26 | 42.5 m | 0.31 | **0** | 1.000 | 10.1 |
> | 140 | 26 | 12.1 m | 1.07 | 64 | 1.084 | 12.0 |
> | 220 | 26 | 7.7 m | 1.68 | 186 | 1.243 | 11.6 |
> | 140 | 40 | 12.1 m | 1.65 | 185 | 1.242 | 17.5 |

Two things to take from that table.

**Most of the density term's cost is not caves.** Going from no carving to
strength 26 at low frequency multiplies faces **11×** while carving **zero**
voids — all of it is surface roughening, which section 2 already accounts for.
Real caves add only about another 20% on top.

**Caves are what create multi-span columns.** With genuine voids, 8% to 24% of
columns hold more than one separate slab of rock. On flat or merely rough
terrain every column is a single span. That distinction is what the chunk
boundary rules below have to cope with.

Cave surface is still **invisible** — enclosed by definition, nothing outside
the rock can see it until a player opens a way in. **Cull interior geometry by
enclosure, never by simplification.** It costs build time and memory, not draw
time, and it must never be handed to the LOD system.

---

## Merging caps is limited by curvature, not by the algorithm

You *can* merge coplanar same-material cells: take the union of a patch and
triangulate its boundary polygon. Nothing about hexagons forbids it. What
forbids it is the sphere.

Merging drops the interior vertices that were following the surface, so a flat
patch sags away from it by `s² / 8R`.

> **[verified]** `verification/mesh.js`, R = 1,700 m, 1 m blocks.

| Patch span | Sag | Cells across |
|---|---|---|
| 8 m | 0.005 m | 8 |
| 16 m | 0.019 m | 16 |
| 32 m | 0.075 m | 32 |
| 37 m | 0.101 m | 37 |
| 64 m | 0.301 m | 64 |
| 128 m | 1.205 m | 128 |

Allow a tenth of a block of sag and a patch may span **37 m**; allow a quarter
and it may span 58 m. A chunk at `C = 6` spans 32 cells — which lands just
inside the tighter budget, by coincidence rather than design.

**Rule: never merge across a chunk boundary.** Not for the usual bookkeeping
reasons, but because the chunk is already about the largest flat patch the
curvature permits.

---

## You probably should not merge at all in the near field

This is the part that changes the plan.

> **[verified]** `verification/mesh.js`, R = 1,700 m at full depth D = 11.

| Altitude | Horizon | Visible cells | Cap triangles |
|---|---|---|---|
| 1.7 m | 76 m | 20,951 | 0.08 M |
| 10 m | 184 m | 122,640 | 0.49 M |
| 50 m | 407 m | 599,186 | 2.40 M |
| 200 m | 787 m | 2,207,529 | 8.83 M |
| 1,700 m | 1.8 km | 10,485,761 | 41.9 M |

A standing player can see about **21,000 cells — 84,000 triangles**, at full
resolution, unmerged, with no cleverness whatsoever. That is a rounding error on
any GPU made this century.

**But that figure is a floor, not a budget.** It is the count for a perfectly
smooth sphere. Terrain sticks up, and anything tall is visible from much further
than the ground is — the range to a peak of height `h` is the ground horizon
*plus* `R·acos(R/(R+h))`.

> **[verified]** `verification/volume.js`, 1.7 m eye on the doc-06 planet.
>
> | Peak height | Visible from | Cells within that range | vs ground only |
> |---|---|---|---|
> | 0 m | 76 m | 20,951 | 1× |
> | 10 m | 260 m | 244,673 | 12× |
> | 30 m | 393 m | 558,028 | 27× |
> | 60 m | 521 m | 977,791 | 47× |
> | 120 m | 697 m | 1,736,972 | 83× |

A 60 m hill is visible from **seven times further** than flat ground. The
conclusion survives — the near field still needs no merging — but the render
budget has to be set from the relief-extended range, not from 76 m, and the
distant part of that range is exactly what LOD is for.

**The 76 m horizon is the greedy mesher.** It has already thrown away everything
a merge pass would have, and it did so before the mesher ran, at no cost in
code. Build the naive version, ship it, and spend the effort on the view from
above instead — which is where the numbers actually go bad.

---

## Level of detail

### The level is chosen per triangle, from how far away that triangle is

There is no level for the view. Walk the triangle hierarchy from the twenty
faces downward and ask each triangle one question: **is the viewer at least two
of this triangle's own widths away from it?** If yes, draw it. If no, split it
into its four children and ask each of them the same thing.

That is the whole rule. A face is enormous, so from anywhere on the surface the
answer at the top is always "no" and the walk descends. It stops when a triangle
is far enough away for its own size, which happens early in the distance and
late underfoot — so one frame holds many levels at once, fine where you stand
and coarse at the horizon.

The multiplier of two is the only free number in it. **Width** is not the
triangle's edge but the cap that holds it, which is what the walk already has to
compute to know whether the triangle is over the horizon at all.

### Every step doubles the cell and doubles the distance

A triangle one level coarser covers four times the area, so it is **twice as
wide**, so it has to be **twice as far away** before it is drawn. The rings
where the ground coarsens are therefore a doubling sequence, and where the first
one lands is set by how wide a chunk is in metres.

> **[verified]** `verification/detail.js`, sections 2 and 3. The worked planet at
> 1 m blocks — depth 13 — with a standing player. The nearest chunk drawn at each
> step:
>
> | Chunk | First 2 m cells | First 4 m | First 8 m | First 16 m |
> |---|---|---|---|---|
> | 8 cells | 39 m | 77 m | 154 m | 307 m |
> | 16 cells | 77 m | 154 m | 307 m | — |
> | 32 cells | 154 m | 307 m | — | — |
> | 64 cells | 307 m | — | — | — |
>
> The four rows are one sequence read at four offsets. What decides a ring is
> **how wide the chunk drawn there is, in metres** — a 16 m chunk first appears
> at 39 m, a 64 m chunk at 154 m, and both are **2.41** of their own nominal
> width, whichever knob produced that width.

So the chunk size is not a detail setting, and it moves the picture more than it
looks as though it should. Cutting a chunk from 32 cells to 8 does not coarsen
the world; it pulls every ring in by a factor of four, which puts 8 m cells at
154 m where there had been 1 m cells.

**A ring is not a circle.** Cell spacing varies 1.41:1 across a face
(`uniform.js`), so two chunks with the same cell count are not the same width,
and the wider one has to be further away before it is drawn.

> **[verified]** `verification/detail.js`, section 1. Over every chunk of one
> face, the cap the walk measures runs **0.96 to 1.27** of the chunk's nominal
> edge, at every chunk level. The rings are that fuzzy — about a quarter of a
> ring's own radius — and they wobble with the lattice rather than with anything
> the viewer does.

### Altitude is a budget, not the control

Altitude reaches the level only by moving every distance at once. What it does
decide is how much there is to draw, which is a budget rather than a rule.
Within 2 M triangles:

| Altitude | Finest level that fits |
|---|---|
| 1.7 m | 11 — full detail |
| 10 m | 11 — full detail |
| 50 m | 10 |
| 200 m | 9 |
| 850 m | 9 |
| 1,700 m | 8 |

Roughly **one level per doubling of altitude** above 50 m, and full detail below
it. A view-distance slider is the wrong control for a player to hold, and so is
an altitude curve for the engine to follow: both set one level for everything on
screen, and the near ground and the horizon are not one thing.

### What the multiplier costs

Raising it from two holds full detail further out, and pays in chunks held —
every one of which is generated, meshed, uploaded and drawn.

> **[verified]** `verification/detail.js`, section 4. Chunks held at 32 cells a
> chunk, on the worked planet:
>
> | Altitude | Detail 2 | Detail 2.5 | Detail 3 |
> |---|---|---|---|
> | 1.7 m | 279 | 353 | 428 |
> | 60 m | **490** | 678 | 924 |
> | 300 m | 365 | 566 | 782 |
>
> 60 m of altitude is the worst case, because near and far ground are both on
> screen there. Going from 2 to 3 costs **89%** more chunks and buys one step of
> sharpness at the ring.

**Two is the setting.** The cost is close to the square of the multiplier and
the gain is one ring of cells moved outward.

### Two chunks that touch are never more than one level apart

Splitting on a triangle's own width restricts itself. A neighbour close enough
to be split is close enough that *its* neighbour splits too, so the level cannot
jump twice across one boundary — not because the walk forbids it, but because
the distances that would be needed do not occur.

> **[verified]** `verification/detail.js`, section 5. Over **43,499** pairs of
> chunks whose caps touch — two chunk sizes, three altitudes, three view
> directions — the widest gap is **1 level**, and about 20% of pairs have any gap
> at all.

That is measured rather than enforced, so nothing downstream may assume it. The
apron does not: it covers the strip whatever the neighbour chose.

### LOD is resampling, not decimation

In a cube world, dropping to a coarser level of detail means throwing away every
other block. Here you cannot, and the reason is worth seeing rather than being
told.

![A coarse hexagon grid drawn over a finer one, with the coarse cell edges cutting straight across fine cells instead of following their boundaries](figures/lod-is-resampling.svg)

*The coarse cells do not contain whole fine cells — their edges cut straight
through. The two levels are simply different sets of cells, so there is nothing to
discard your way from one to the other.*

Goldberg levels do not nest into each other at all — [doc 01](01-prior-art.md)
states this as the trade the design accepts. So a coarse mesh is **not** a subset
of the fine one, and you cannot drop every other cell.

Instead, evaluate the same terrain function on the coarser grid. This works
because terrain is a pure function of world position ([doc 08](08-terrain-generation.md)),
so any grid can sample it and no grid is privileged. The rule that keeps seams
out of terrain is the same rule that makes LOD possible at all — it earns its
keep twice.

### An edit has no terrain function to re-evaluate

A player's block is the one thing on the coarse grid that cannot be asked for
again. Terrain is a function and answers at any spacing; a placed block is a
record against one fine cell, and if nothing carries it outward a built
structure is complete underfoot and gone entirely a few hundred metres back.

**The centres nest and the areas do not**, and the difference is the whole
problem. A coarse chunk keeps its path and drops the subdivision depth, so its
lattice points really are the fine ones scaled by a power of two — which makes
shifting a fine `(i, j)` right by the level look like the answer. It is not,
because a cell is the Voronoi region around a lattice point and a shift is a
floor.

> **[verified]** `verification/delta.js`, section 3, against this document's own
> pipeline run at the coarse level. Shifting `(i, j)` names the wrong cell for
> **43.9%** of cells one level out and **79.3%** four levels out. Rounding `i`
> and `j` separately is worse again at the first level — **53.8%** — for the
> reason [doc 04](04-position-lookup.md) gives `hexRound`: two coordinates
> cannot detect the error, so rounding them apart breaks the sum and names a
> lattice point that is not there.

**Scale the three barycentric weights and repair them.** A lattice point's
barycentric recovers its own `(n−i−j, i, j)` exactly, because the one-shot blend
*is* gnomonic projection, so the coarse lookup reduces to `hexRound` on those
three numbers divided by `2^lod`. Three divisions, no position, no face search
and no distance.

> **[verified]** Same section. It disagrees with the full pipeline on **2.4% to
> 32%** of cells and **every one of those is a tie** — the point sits exactly on
> the boundary between two coarse cells, both are the same distance from it, and
> the two roundings break the tie differently. **Zero cells, at every level
> measured, land somewhere genuinely further away.**

The layer needs none of this. Layers stack at a fixed thickness from a crust top
that does not move with the level, so layer `L` falls in coarse layer `L >> lod`
with no rounding to get wrong.

What the mapping cannot avoid is that **many fine cells arrive at one coarse
one** — `4^lod` across and `2^lod` down, so 8 at the first level and 4,096 at the
fourth. A placed block therefore grows to the cell it lands in and reads as a
16 m cube at the coarsest level anybody stands at. The rule for a collision is
that **a placed block beats a broken one**: a coarse cell holding any placed
block is solid and reads as air only when every fine cell inside it was broken,
so a wall stays a wall at distance and a one-block hole in a hillside fills in.

---

## Terrain is generated, not stored — and that changes LOD

Every assumption in this document rests on one fact. **There is no heightmap.** [Doc 08](08-terrain-generation.md) makes terrain two
pure functions of position — a height-field term giving `surfaceRadius(direction)`,
and optionally a density term `(surfaceRadius − |p|) + noise3D(p) × strength`
that carves caves and overhangs into it. Nothing is on disk but the seed and the
player's edits.

Three consequences that a mesh-simplification mindset gets wrong.

### LOD is cheaper to generate, not just to draw

There is no fine mesh to decimate — there is no mesh at all until something asks
for one. A coarse chunk is the same function asked again on a wider grid, so a
LOD step cuts **generation** cost by 4× at the same time as it cuts drawing.
Distant terrain is cheaper twice over. Classical mesh LOD gets neither saving:
it decimates a mesh that has already been built.

### The two terms cost wildly different amounts

The height-field term is one fBm evaluation per *column*, reused down the whole
column. The density term is one evaluation per *cell* in the band where it could
change the answer.

> **[verified]** `verification/volume.js`, one chunk at D 11 / C 6, 64 layers,
> 5 octaves for height and 4 for density.
>
> | LOD | Columns | Height field | + density, full crust | + density, band only |
> |---|---|---|---|---|
> | −0 | 561 | 2,805 | 146,421 | 74,613 |
> | −1 | 153 | 765 | 39,933 | 20,349 |
> | −2 | 45 | 225 | 11,745 | 5,985 |
> | −3 | 15 | 75 | 3,915 | 1,995 |

The density term is **51× the height term** over a full crust, and **26×** when
restricted to a band around the surface. Doc 08 already recommends that band;
this is the number that justifies it.

### The LOD level should choose the generator

A coarse mesh cannot represent a feature narrower than about two of its cells.

> **[verified]** `verification/volume.js` — at level 10 (2 m cells) a 3 m cave is
> already gone; at level 8 (8 m cells) a 10 m canyon is gone; a 40 m valley
> survives to level 7.

That is not a defect to engineer around. **A cave you cannot see into does not
need geometry**, and by the time a chunk is far enough to drop a level, its caves
are sealed rock as far as the camera is concerned. So:

> **Near chunks run the density field. Far chunks run the height-field term
> alone.**

Which makes a LOD-2 chunk about **330× cheaper to generate** than a near one:
**12.5×** from having fewer columns (561 → 45; two levels would quarter twice
over to 16× but for the rim) and **26.6×** from skipping the density term
entirely. It also means the
expensive cave geometry from the section above is only ever built where a player
could actually reach it.

The one piece of stored terrain doc 08 contemplates — a coarse global heightmap
at level 8, for rivers and erosion — does not change any of this. It is an
*input* to the height-field term, not a mesh, and it is sampled by masking a cell
ID rather than by any second spatial structure.

### A coarse chunk is exact where it draws, and silent in between

The generator takes a face and a lattice offset and nothing else. It is not
told which level the chunk asking for the column is drawn at, and that turns out
to be the property the whole scheme rests on.

A coarse chunk draws a subset of a fine chunk's points — every fourth, every
sixteenth. Because the height of a point does not depend on who asked, **the
points a coarse chunk keeps hold exactly the height the fine chunk gives them**,
to the bit. So a chunk changing level moves no ground at all. What appears and
disappears is the surface between the retained points, which the coarse chunk
draws flat.

That is the trade, and it is the right way round. A coarse chunk is **not
inaccurate, it is incomplete**: a hill sitting between two of its points is
missing rather than misplaced, and a point that lands on a bump stretches that
height across its whole flat span.

> **[verified]** `verification/lod.js`, section 2. The shipped detail term — 5 m
> over features 112 m across, four octaves — at 190 places on one face, against
> the average of the ground each cell covers. What the flat span misses runs
> from **0.02 m** at LOD 1 to **0.31 m** at LOD 6, worst case **1.19 m**.

**Do not make the generator level-aware to close that gap.** Dropping or fading
octaves by level is the obvious fix and it is a bad trade: a retained point
would then hold one height in the coarse chunk and another in the fine one, so
ground that currently never moves would start moving every time a chunk changed
level. Both attempts measured worse against the same reference — **1.02 m** and
**0.50 m** at LOD 6 against **0.31 m** for leaving it alone — and they would buy
that with a popping artifact the engine does not currently have.

---

## Cracks, and which cause actually matters

Two things could open a seam where levels meet. Only one of them does.

**The base sphere: almost nothing.**

> **[verified]** `verification/mesh.js` compares hexagon corners at level 3
> against level 4. Every coarse corner lands within **0.72% mean, 0.97% max** of
> a fine corner, as a fraction of coarse cell spacing. They are near-coincident
> because the middle child of a triangle split shares its parent's centroid —
> exactly so only when the triangle is equilateral, and subdivided triangles are
> not quite.

**Terrain sampled at two spacings: everything.**

> **[verified]** Same script, 60 m of relief on the doc-06 planet. The height
> difference between a level and the one above it:
>
> | Level | Spacing | Mean Δh | Max Δh | Covered by a one-cell skirt? |
> |---|---|---|---|---|
> | 11 | 1 m | 0.26 m | 1.52 m | yes |
> | 10 | 2 m | 0.53 m | 3.20 m | yes |
> | 9 | 4 m | 1.04 m | 6.76 m | yes |
> | 8 | 8 m | 2.00 m | 12.84 m | yes |
> | 7 | 16 m | 3.60 m | 19.89 m | yes |

**Fix: each chunk draws one cell past its own rim.** The *apron*. A chunk meshes
the ring of cells just beyond its boundary at its own level, a centimetre below
their true height so a real cell wins wherever one exists. Both levels' surfaces
then cover the strip where they meet, and the step between them shows as the
higher surface standing over the lower rather than as a gap.

The apron beats stitching for a specific reason: **it enumerates no cases**. A
stitching scheme has to know what the neighbour drew, which means the mesher has
to be told the neighbour's level and the rim has to be re-meshed whenever that
level changes. An apron is one ring of the chunk's own cells and does not care
what the neighbour chose — which is also what makes it the only option that
survives a chunk being remeshed after an edit while its neighbour is not.

**A curtain does not work, and the reason is the cap plane.** The first answer
here was a *skirt* — a wall hung one coarse cell deep from every rim, closing
the slit from above. It was built and taken out again. A skirt hangs **from the
cap plane**, so wherever the two sides put their surface on the same layer it is
coplanar with the neighbour's own cap along their shared edge, and no depth
buffer separates two coplanar surfaces: the darker wall speckles through the
ground as a dashed outline of every chunk boundary.

> **[verified]** `verification/seam.js`. Even at a genuine LOD boundary, where
> the two sides are supposed to disagree, **85% of rim columns at a 2 m coarse
> cell** put both levels on the same cap — 74% at 4 m, 49% at 8 m. At a boundary
> between two chunks of the **same** level, which is most of them, both ran one
> generator on one grid, so every column agrees and **every** skirt quad is
> coplanar. The apron hangs no wall anywhere.

The apron is not free of the deeper problem, and neither was the skirt.

### Neither closes a cave mouth, and a volume has more than one surface

That covers a height field, where every rim column has exactly one slab of rock
and therefore one surface to hang from. Under a density field, 13–32% of columns
have several — and a skirt cannot reach the others, because **a skirt hangs
downward and a cave mouth is a horizontal hole in the boundary plane.**

The failure is specific. A cave in the fine chunk runs up to the rim. The coarse
neighbour ran the height-field term only, so it is solid rock at that depth — but
it does not know a cave is there, so it emits no face; and the fine chunk assumes
its own generator continues past the rim, so it emits none either. Nobody draws
the wall, and you can see through the rock into the void.

![Two chunk boundaries: with the apron alone the cave mouth stays open, with the seam owned it is walled](figures/lod-seam.svg)

*The apron carries the surface past the rim in both. Only the right-hand chunk
also walls off the cave where it meets the coarser neighbour's rock.*

> **[verified]** `verification/seam.js` builds a real rim — full density field on
> the fine side, height field one level coarser on the other — and scores four
> policies over 385 rim columns at a 2 m coarse cell:
>
> | Policy | Holes left |
> |---|---|
> | Each side trusts its own generator past the rim | 1,150 |
> | The same, plus a skirt one coarse cell deep | **1,060** |
> | The same, plus the apron | **1,074** |
> | The finer chunk owns the seam | **0** |
>
> Both close every one of the 76 surface-slit layers. The skirt also happens to
> reach **14 of 1,074 cave mouths** — the shallowest ones — and the apron reaches
> none, because it draws surfaces and not walls. **99% of cave mouths sit deeper
> than a skirt reaches** anyway; the deepest is 18 layers below the surface. The
> two are the same answer to the surface and the same non-answer to the volume,
> and they differ in what they cost where nothing is wrong.

**More curtains are not the answer.** One skirt per span was the obvious guess
and it is wrong: extra skirts hang down into rock from ledges that were never
the problem, and still do not cover a horizontal hole. Neither does a deeper
apron, for the same reason — depth is not the axis the hole is on.

### The finer chunk owns the seam

The rule that does work:

> At a boundary where the neighbour is coarser, the **finer** chunk emits a face
> wherever its own solidity differs from the coarse neighbour's — in both
> directions. Its rock facing the neighbour's air, *and* the neighbour's rock
> facing its own caves. The coarser chunk emits nothing at that rim.

It needs one height-field evaluation per rim column to learn where the coarse
neighbour put its surface, which is the cheapest query in the generator.

> **[verified]** `verification/seam.js` — **zero holes**, at every coarse cell
> size tested, for **2.70 boundary faces per rim column** plus that one
> evaluation. Against the ~12 faces per column the chunk already emits, it is
> noise.

At a boundary where both sides are at the *same* level the rule costs nothing at
all: both ran the same generator on the same grid, so there are no disagreements
to draw and it degenerates to emitting nothing.

**Keep the apron as well.** Seam ownership is exact but needs the chunk to know
its neighbours' levels, so a chunk must be remeshed when a neighbour changes
level. The apron needs no such knowledge and closes the most visible failure,
the surface slit. One is correctness, the other is what holds while a level
changes.

**What covers the frames during a level change is the residency loop, not
geometry.** A chunk leaving the selection is not dropped when its replacement is
still being built: it keeps drawing until every wanted chunk covering its
triangle has been uploaded. That is the honest version of the insurance a skirt
used to stand in for — the old chunk itself, rather than a wall pretending to be
it.

---

## Pentagons

A pentagon cap is 3 triangles rather than 4, and a pentagon column has 5 side
faces rather than 6. That is the entire impact.

Meshing is the one system in this design where the twelve pentagons cost nothing
beyond a loop bound — no special case, no deflection, no lost direction. Compare
[doc 13](13-gravity-and-orientation.md), where they cost a permanent 60°.

---

## The chunk-local frame

Mesh in chunk-local space with the chunk's centre as the origin. Two reasons,
both already on the table:

- `up` varies about **1.08°** across a `C = 6` chunk ([doc 13](13-gravity-and-orientation.md)),
  so a single chunk normal is wrong for lighting but fine for culling. Compute
  normals per cell — one `normalize`, and never wrong.
- It is the same rebasing that floating origin needs ([doc 11](11-open-topics.md)).
  One transform, applied once, in one place.

---

## What to build, in order

1. **Height field only.** `surfaceRadius(direction)`, one evaluation per column.
   4 triangles per cap, run-length merged side faces, no cap merging. This is a
   whole planet with mountains and no caves, and it is cheap.
2. **The apron** at chunk boundaries, one cell of the chunk's own level.
3. **Distance-driven LOD** by re-evaluating the terrain function at a coarser
   level — one level per triangle, from the two-widths test, with the render
   budget set from the relief-extended range rather than the 76 m ground
   horizon.
4. **The density term**, restricted to a band around the surface and to
   full-detail chunks only. This is where caves, overhangs and most of the
   triangle count arrive at once — and where **seam ownership** becomes
   necessary, because until there are caves there is nothing the apron misses.
5. **Cap merging**, only for high-altitude shells, bounded to a 37 m patch.

Steps 1–3 are a working planet you can fly over. Step 4 is the one that turns it
into a volume, and it is deliberately last because it is the expensive half of
the generator and the easiest to get wrong.

---

## Still open

- ~~Which boundary this mesh actually draws~~ — **settled by
  [doc 18](18-cell-boundary.md)**, and it cost nothing. The corners here used to
  come from the centroids of the *projected* triangle vertices. Average the
  **flat** lattice points instead and then project, and the mesh draws exactly the
  boundary [doc 04](04-position-lookup.md)'s lookup uses. Equivalently, and more
  usefully: a corner is a lattice point of the same construction at `3n` —
  `(3i+2, 3j+1)` for an up-triangle, `(3i+1, 3j+2)` for a down-triangle. The
  **2 vertices and 4 triangles per cell** count is untouched, because each triangle
  still gives one corner and each corner still serves three cells; only where the
  corner sits moves, by 0.038 mm at level 11.
- **Texture coordinates.** Hexagons are near-regular but **not congruent** —
  area varies **1.99:1** ([doc 02](02-geometry-choice.md), measured; earlier
  drafts said 1.3:1) — so a tiled texture cannot be identical per cell, and the
  per-cell distortion to absorb is twice what this document used to assume. Either accept slight per-cell distortion, or use
  triplanar projection in world space and let the addressing scheme stay out of
  it, which is the same answer terrain generation reached.
- **Ambient occlusion** with 8 neighbours rather than 6, and what a corner even
  means when three hexagons meet.
- ~~Water and transparency~~ — closed by [doc 25](25-water.md). Water is a block
  type, the ocean culls to a **skin** (0.89% of the naive face count), and a
  player sees **one** body of water from 82.3% of viewpoints and two from 0.6%.
  So it is two draw passes and a sort of one thing. The sphere never made it
  harder: back-to-front is a distance comparison and never needed a global axis.
- **Remesh or store.** Whether a chunk's mesh is rebuilt on edit or cached, and
  what that costs when a player mines one cell. Sharpened by the generation
  numbers above: rebuilding a near chunk means re-running the density term over
  the band, which is the expensive path.
- **Where the density band should sit** when the surface itself is 60 m of
  relief — a band that follows `surfaceRadius` is not the same shape as a band
  at fixed depth, and floating islands sit outside both.
- **Culling by enclosure**, concretely. The claim that cave geometry costs no
  draw time assumes something detects that it is sealed. Which structure does
  that, and what does it cost to keep current when a player breaks through?

---

## In one breath

- An unmerged hex surface costs **2 vertices and 4 triangles per cell** — a flat
  2× a cube, not a blow-up.
- **Vertical merging is exact and free**; horizontal merging has no hex
  equivalent. Cap merging is bounded by curvature at **37 m**, not by the
  algorithm.
- A standing player sees about **21,000 cells** on smooth ground — but relief
  extends that far: a 60 m hill is visible from **521 m**, 47× the cells.
- Relief barely moves the triangle count (**4.0 → 9.5 per cell**, then it
  saturates). Caves multiply *faces* but stay invisible until opened.
- **LOD is resampling, not decimation**, because Goldberg levels do not nest.
  The level is chosen **per triangle**: draw it once the viewer is **two of its
  own widths** away, split it into four children when closer. Every step doubles
  the cell and doubles the distance, so at 32 cells and 1 m blocks the ground
  first coarsens at **154 m** and at 8 cells at **39 m**.
- Seams: the **apron** — one cell drawn past the rim — closes the surface step
  without hanging a wall in the cap plane, where a skirt was coplanar with the
  neighbour's cap on **85%** of rim columns. Only the finer chunk **owning the
  seam** closes a cave mouth.

---

**Demo:** [`demos/mesh-lod.html`](../demos/mesh-lod.html) — the tiling at five
resolutions, reporting its own vertex and triangle counts so you can watch them
converge on 2 and 4 per cell. The altitude slider draws the true horizon ring and
colors the cells inside it: at eye height that is **one hexagon on the whole
planet**, 0.05% of the surface, and the readout gives the real figures for a
level-11 world.

**Demo:** [`demos/detail-with-distance.html`](../demos/detail-with-distance.html) —
the three settings that decide where the steps land, and the ground from above
banded by how big a cell is drawn there. Drop the chunk from 32 cells to 8 and
watch the first step come in from 154 m to 39 m.
