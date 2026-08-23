# 09 — Ray traversal

## The question

The player looks somewhere and clicks. **Which cell do they want to mutate?**

## It is a grid walk, not a physics query

No colliders, no broadphase, no physics engine involvement. The standard
technique is **voxel DDA** (Amanatides & Woo): step cell to cell along the ray,
checking occupancy as you go.

With a 5-block reach you touch about 5 cells. A physics raycast, by contrast,
needs collision meshes generated for every chunk — for a world where nothing is
meshed until it is seen, that is an enormous amount of work to answer a question
about five cells.

**Walk cost depends on reach, not on world size.** This is the whole argument.

> **[verified]** `verification/ray.js`, section 5. A twelve-block reach over the
> same scene at subdivision depths 6, 8, 10 and 12 — **40,962** surface cells up
> to **167,772,162**, a planet 4,096× larger — steps **8.42, 7.83, 7.74** and
> **7.75** cells. Nothing in the loop reads a chunk, a mesh or a collider: the
> cell is carried in three integers and a layer, and the next boundary is a
> division.

---

## The property that makes it elegant here

You would expect that walking a straight line across a *sphere* means following a
curve, and re-projecting at every step. It does not, and the reason is worth
following.

Finding the face uses central projection from the planet's centre onto the flat
face plane — that is the **gnomonic projection**, and gnomonic projection maps
great circles to straight lines. Meanwhile, a straight 3D ray plus the origin
defines a plane, so the ray's radial shadow on the sphere is always a great
circle.

Put those together: **the ray's ground track is a perfectly straight line in face
barycentric coordinates.** Not approximately — exactly. No curve following, no
re-projection per step.

**And the boundaries it crosses are straight too — by definition.** This used to
be the shaky half of the argument. Gnomonic projection preserves straight lines
but not equidistance, so a cell boundary drawn as "everywhere equidistant between
two centres on the sphere" would *not* be straight in the face plane, and the
walk below would be an approximation.

[Doc 04](04-position-lookup.md) settles it by defining a cell as the radial
projection of its lattice point's **planar** Voronoi hexagon — the set of
directions `hexRound` maps to it. Those boundaries are straight in the face plane
because that is where they were drawn. The measured cost of that choice is that
"which cell am I in" and "which centre is nearest" disagree on about 1% of the
sphere, always with an edge-adjacent cell and never by more than a tenth of a
cell — and in exchange this walk is exact rather than approximate.

So both halves hold: the ground track is straight, and so is every boundary it
crosses.

And since [doc 18](18-cell-boundary.md), the mesh draws those same boundaries — so
the cell this walk reports is the cell the player was looking at, with no tolerance
to tune.

![A straight ray crossing a field of hexagons, stopping at the first solid cell](figures/ray-is-straight.svg)

*The same straight-line walk a flat voxel game does, on a sphere, with no
correction term anywhere.*

---

## Four families of boundaries

- **3 horizontal.** Each family is a **pair** of barycentric coordinates, not one
  of them. The bisector between two lattice points is where a *difference* of two
  weights is halfway, so the cell of an integer triple is the intersection of
  `|(a−b) − (A−B)| ≤ 1`, `|(b−c) − (B−C)| ≤ 1`, `|(c−a) − (C−A)| ≤ 1` — and
  crossing one moves `+1` on one weight and `−1` on another, which is exactly the
  six neighbours [doc 05](05-face-adjacency.md) lists.

  > **[verified]** `verification/ray.js`, section 1. Over 200,000 points rounded
  > by `hexRound`, the difference form holds for **100%**. The coordinate form —
  > `|x − x₀| ≤ ½`, `|y − y₀| ≤ ½`, `|z − z₀| ≤ ½`, one slab per axis — holds for
  > **75%**: the three slabs cut out the hexagon turned 30° from the cell, so a
  > quarter of every cell falls outside it and part of every neighbour falls
  > inside. A walk stepping on those planes crosses where no boundary is.
- **1 radial.** Layer boundaries are concentric spheres.
  `|P + t·d|² = r²` is a cheap quadratic, and you only ever need the next one.

Compute the parameter `t` at which each family is next crossed, step whichever is
smallest, repeat. Same loop shape as the classic algorithm.

---

## Two cases to handle

**Face crossings.** When a barycentric coordinate goes negative you have walked
off the face. Apply the adjacency table ([doc 05](05-face-adjacency.md)),
re-express the direction in the neighbour's frame, and continue. The line stays
straight, because it is still the same great circle — no restart, no
special-casing the geometry.

**A face edge is not a cell boundary.** Cells straddle it, so nothing is entered
and nothing is left: the same cell is written under the other face's name. Two
different things therefore change, and one tool does not do both.

The **name** comes from doc 05's reflection, which is integer arithmetic and
lands on the same cell every time. The **frame** is solved for again from the ray
itself, because that reflection is an *unfolding* rather than a change of
coordinates.

> **[verified]** `verification/ray.js`, section 2. Over 20,000 points just past a
> face edge, the reflection moves the direction it describes by **2.28°** on
> average and **6.47°** at worst. Used for the frame as well as the name it
> changes the cells walked on **52%** of the rays that cross an edge. Re-solving
> is one 3×3 solve, at **0.02** crossings per ray — the rarest step in the loop.

Rounding the position into a cell after the crossing, rather than renaming the
cell already held, skips a cell wherever the edge and a hexagon boundary fall
within a step of each other.

**Pentagons.** A cell with five edges instead of six. Rare, but the loop cannot
assume six.

---

## Free bonus

The DDA tells you **which boundary you crossed to enter the hit cell** — which is
precisely the face-you-are-looking-at needed for block *placement*. The new block
goes on that side. No extra work.

---

## Demo

[`demos/ray-traversal.html`](../demos/ray-traversal.html) — drag the eye or the
aim point across a hex field. Numbered cells show the walk in order; it stops the
instant it touches something solid.

- Compare *cells walked* against *cells in field* — single digits against 91, and
  the ratio only improves as the world grows.
- The white bar on the hit cell is the entry edge, ready for placement.
- Aim out through the triangle's edge: the walk reports a negative barycentric
  coordinate, which is where the adjacency table takes over.

The demo solves each boundary crossing analytically rather than sampling, which
is what makes it exact.

---

## The walk is what a march converges to

The cheap alternative is to step along the ray a fraction of a block at a time
and ask `positionToCell` at each step. It has one knob and it trades the same
thing both ways: too coarse and it cuts a corner and reports the block behind the
one aimed at, fine enough not to and it costs a full cell lookup every step.

> **[verified]** `verification/ray.js`, sections 3 and 4, at depth 8 over 3,000
> rays with a twelve-block reach. Against a march at **1/400** of a block the
> walk reports the same hit cell on **99.90%** of rays — and asking again with
> the march 25× finer, **every one** of the disagreements goes. The walk is not
> close to the sampled answer; it is the answer the sampling converges to.
>
> The march's own cost, at the same reach: **43.0%** of hits wrong at one sample
> per block, **11.4%** at a quarter, **1.1%** at a twenty-fifth — which costs
> **102** cell lookups a ray. The walk carries its cell and looks nothing up.

Doc 09's five-cells figure counts hexagons. A twelve-block reach costs **7.85**
cells here, of which **2.49** are layer boundaries — a look aimed down at the
ground spends a third of its steps going radially.

---

## Reuse

The same traversal is the line-of-sight test that any-angle pathfinding needs —
see [doc 10](10-pathfinding.md). Build it once.

---

## In one breath

- Block picking is a **grid walk**, not a physics query, and it costs **7.85**
  cells for a twelve-block reach whatever the planet's size — 8.42 at 40,962
  surface cells and 7.75 at 167,772,162.
- Gnomonic projection maps great circles to straight lines, so **the ground track
  is exactly straight** in face coordinates — and the boundaries it crosses are
  straight too, because doc 04 defines cells as the projection of the planar
  Voronoi diagram. Both halves are exact.
- Four boundary families: three horizontal, one radial. Step the nearest. Each
  horizontal family is a **pair** of weights, `|(a−b) − (A−B)| ≤ 1` — one
  coordinate on its own describes the hexagon turned 30°, which holds for only
  **75%** of a cell.
- Walking off a face is the adjacency table's job; the line does not bend. **A
  face edge is not a cell boundary**, so the cell is renamed by doc 05's
  reflection and the frame is re-solved from the ray — that reflection unfolds
  the faces and moves a direction **2.28°**, so using it for the frame changes
  the cells walked on **52%** of the rays that cross an edge.
- The walk is **what a march converges to**: every disagreement with a march at
  1/400 of a block goes when the march is refined 25×. A march is wrong on
  **11.4%** of hits at a quarter-block step and costs 102 lookups a ray at the
  step that gets it to 1.1%.
- The entry boundary **is** the placement face, so picking needs no second test.
