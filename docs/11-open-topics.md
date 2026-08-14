# 11 — Open topics

## What this is

The honest list of what is **not yet designed**. Each item needs its own document
before implementation, and they are ordered roughly by how much they force
changes elsewhere.

Seven entries are struck through because they have since been closed. They are
kept rather than deleted, because what they turned out to be worth is the most
useful thing on this page.

---

## ~~Gravity and "up"~~ — designed, see [doc 13](13-gravity-and-orientation.md)

Closed. Three frames rather than one: an axis frame for coordinates, a
transported quaternion for the camera, and a discrete grid frame for directional
machinery. Gravity itself is one `normalize`; the hard half was the horizontal
frame, and there is provably no global one.

The finding that reaches furthest back into the rest of the design: the 720°
appears **twice**, and the two behave oppositely under refinement. The geometric
defect at a pentagon shrinks ~4× per level; the combinatorial deficit is
**60° at every level, forever**. Raising subdivision depth hides pentagons from
walkers and terrain, and does nothing at all for rails, pipes and roads. That
should be read before deciding the pentagon question below.

---

## ~~Meshing~~ — designed, see [doc 14](14-meshing-and-lod.md)

Closed, and the pessimism above was overstated. An unmerged hex surface costs
**2 vertices and 4 triangles per cell** — exactly twice a cube surface, a flat
factor, not a blow-up. What does not transfer is the rectangle-growing half of
greedy meshing; run-length merging down a column is exact and free.

The scheme is: naive mesher, altitude-driven LOD by resampling the terrain
function, and **two** different fixes at chunk boundaries because there are two
different holes. Cap merging is optional and bounded to a 37 m patch by curvature
rather than by the algorithm.

The boundary rule is the part worth carrying away, because the obvious answer was
wrong. A **skirt** — a vertical apron one coarse cell deep — closes the surface
step where two LOD levels meet, and that is all it closes. Under a density field
8–24% of columns hold more than one slab of rock, and a skirt cannot reach the
cave mouths: it hangs *downward*, and a cave mouth is a *horizontal* hole. Doc 14
measures 961 holes left over 385 rim columns with skirts alone. The fix is
**seam ownership** — the finer chunk emits a face wherever its solidity differs
from the coarse neighbour's, in both directions — which leaves **zero**, for 2.7
faces per rim column. Keep the skirt too, as cover for the frames after a
neighbour changes level.

The reason it lands so cheaply is the horizon from
[doc 13](13-gravity-and-orientation.md): a standing player sees about **21,000
cells**, 84,000 triangles. The 76 m horizon is the greedy mesher.

---

## ~~Is `hexRound` exact on the sphere?~~ — measured, see [doc 04](04-position-lookup.md)

Closed, and the answer was neither of the two everyone expected.

`hexRound` and "nearest cell centre on the sphere" **do** disagree, on about
**1%** of the sphere, and the rate **settles rather than falling to zero** as the
grid refines — a face triangle's shape is scale-free, so refinement shrinks the
cells and the disagreement band together. Depth is not a fix.

But every disagreement is with an **edge-adjacent** cell and never further than
**0.11 of a cell spacing**. A point is handed to a neighbour only when it sits
within about a tenth of a cell of the boundary between them.

Which reframed the question. `hexRound` is a pure function of position, so it
already defines a partition of the sphere — exact, gap-free, overlap-free,
edge-adjacent everywhere. It is not an approximation *of* spherical Voronoi; it
is a different and equally valid definition of where a cell is. So the design
adopts it: **a cell is the radial projection of its lattice point's planar
Voronoi hexagon.** Doc 04's rounding becomes exact by construction, and so does
doc 09's straight-line ray walk, which steps across exactly those boundaries.
The alternative would have made both approximate by ~1% and bought nothing.

Same shape as doc 15's finding, one document later: the specification had not
said precisely enough what it meant, and measuring is what exposed it.

---

## Which boundary does the mesh draw?

The leftover from the item above, and the last of the three definitional gaps.

There are now **three** places the specification implies a cell boundary, and
they are not the same curve:

| Where | Boundary | Used by |
|---|---|---|
| Projected planar Voronoi | what `hexRound` maps to the cell | [doc 04](04-position-lookup.md) lookup, [doc 09](09-ray-traversal.md) ray walk |
| Spherical Voronoi | everywhere equidistant between centres | the intuitive reading, nothing formally |
| Dual polyhedron | corners at subdivided-triangle centroids | [doc 14](14-meshing-and-lod.md) meshing |

They agree to within about **0.1 of a cell**, so nothing visibly breaks and no
number in the specification moves. But a player clicks on the mesh and the lookup
answers from a different boundary, so the two should be the same curve or the
difference should be stated deliberately.

The likely answer is that meshing should draw the projected planar diagram, since
that is what everything else now keys on — but the dual is what makes doc 14's
"2 vertices and 4 triangles per cell" count come out, and whether that survives
the swap is unmeasured. Small, well-posed, and worth closing before anything is
built on top of the mesh.

---

## ~~Layer merging~~ — struck, see [doc 06](06-world-sizing.md)

Closed by pricing it. It had never been more than a sentence, and the sentence
was not worth what it cost.

The taper it was meant to solve is smaller than the guess it was based on. Doc 06
put the visibility threshold at 85% of surface width and admitted there was no
script behind it; the measured anchor is **0.744** — the narrowest cell already on
the surface, next to a pentagon — which puts the budget at **25.6% of the radius**
rather than 15%. In layers that is `(1 − 0.744)·2^D/K`, and **the radius cancels**:
the crust cap depends on subdivision depth alone, the same on a 10 km planet as on
an Earth-sized one. At `D` 11 it is **435 layers** against the **64** the worked
planet uses — 6.8× of headroom.

So the thing merging was for barely exists. And what it would buy is capped by
something else entirely: the ID sizes its layer field for a **512-layer** crust,
and the unmerged cap is already 435, so **the first merge buys 77 addressable
layers — 18% — and every merge after it buys nothing**, because the ID cannot
address the result.

Against that, the cost is an interior LOD seam wrapping the entire planet. The
finding that makes it concrete: **cell centres nest exactly and cell areas do
not.** `oneShot(n/2, i, j)` equals `oneShot(n, 2i, 2j)`, so every coarse centre is
also a fine centre — but a hexagon is not a union of four hexagons, so **one fine
column in four continues through the shell and three in four terminate** against a
cell they only partly overlap. All 41,943,042 of the worked planet's columns cross
it. [Doc 14](14-meshing-and-lod.md)'s LOD seam is a *rim*, 2.70 faces per rim
column at chunks bordering a different level; this one has no rim.

Plus the four results that invariant 10 pays for, all broken at that shell: free
vertical neighbours ([doc 03](03-addressing.md)), tractable gravity
([doc 13](13-gravity-and-orientation.md)), exact vertical face merging
([doc 14](14-meshing-and-lod.md)), and sky light stored per column at 32× smaller
([doc 16](16-lighting.md)).

**Cap the crust.** That is now doc 06's recommendation rather than its
provisional one, and this entry is a decision rather than a question.

---

## ~~Floating-point precision~~ — designed, see [doc 15](15-precision-and-origin.md)

Closed, and like the other two it was smaller than feared in the place everyone
looks and larger somewhere nobody was looking.

The fear was justified in the abstract: `float32` holds **500 mm** at Earth
radius, two representable positions per block, and 8 m at Jupiter. But the fix
was already built. **A cell ID is entirely integers**, so the world's ground
truth cannot drift at any scale, and floating point only enters when an ID is
turned into a position — which can be done relative to any origin. Entities carry
an anchor ID plus a bounded offset; rebasing is renormalising the two, per
entity, with no world-shift event to schedule. Velocities, orientations and mesh
buffers all survive a rebase untouched.

Two findings reach back into the rest of the design. **Directions are
precision-robust where positions are not** — `up` is accurate to 0.005″ at every
planet size, so gravity and all three frames of
[doc 13](13-gravity-and-orientation.md) need no special handling, and doc 04's
pipeline is already in the right shape because it works on a direction.

And the one that has nothing to do with precision: **the specification was
describing two different spheres.** One-shot barycentric and recursive
arc-midpoint subdivision are not two spellings of one construction; they differ
by a fixed **38.97 m** — 39 cells at level 11 — and the gap does not shrink with
depth. Docs 04 and 09 both require one-shot, so one-shot it is, and the wording
in doc 02, doc 03 and the glossary has been corrected. That was found by asking a
precision question, not a geometry one.

---

## ~~Lighting~~ — designed, see [doc 16](16-lighting.md)

Closed, and it is the one system where the sphere costs almost nothing.

All three predictions above held, and none of them hurt. **8 neighbours** costs a
flat **1.5×** a cube world, because a hex disc holds `3r²+3r+1` cells against
`2r²+2r+1`. **Radial sky light** turned out to be a distinction without a
difference: invariant 10 makes a column a straight line of cells sharing one
address, so the sky pass is exactly as cheap as it is in a flat world. And the
**terminator** really is free — `dot(sunDirection, up) > 0`, reusing the `up`
already computed for gravity, with no shadow map anywhere.

Two things that were not predicted. **The twelve pentagons cost nothing at all**
— a torch there lights 5/6 as many cells, but only because a ring holds `5k`
instead of `6k`, so there is one sixth less world within reach. Nothing is
dimmer. That is the same 60° that costs a direction index forever in
[doc 13](13-gravity-and-orientation.md), and the entire difference is that light
carries no direction.

And **storage is the real bill**: light costs **4×** the block data it lights,
35 KB against 9 KB per chunk. Half of it comes back by noticing sky light is
monotone down a column and storing the depth it reaches rather than a value per
cell — **32× smaller** — which needs columns to be straight, which is invariant
10 for the third time in one document.

---

## Block rotation

Hexagons have **6 orientations**, not 4. Any directional block — rails, pipes,
conveyors, machines — needs a 6-state rotation field and 6-way logic.

Hex is arguably *better* for these, but no existing recipe or tutorial will
transfer. Budget design time.

**Two of the three hard parts are now gone.** [Doc 17](17-pentagons.md) makes the
twelve pentagon columns unbuildable, so a directional block can never sit on a
degree-5 cell and the rotation field is a clean 6 states with no exceptions. And
[doc 13](13-gravity-and-orientation.md) already fixed the ordering rule: index
into the cell's neighbour ring, counter-clockwise seen from outside, never
derived from `(q, r)` sign.

What is left is genuinely just the 6-way logic — plus one rule that no design
choice can remove: **a heading carried along a path must not be assumed to close
when the path does.** A circuit enclosing an odd number of pentagons returns
rotated by one index, at any radius ([doc 17](17-pentagons.md)).

---

## ~~Pentagons as a gameplay problem~~ — decided, see [doc 17](17-pentagons.md)

Closed, and it is the only entry on this page that was a **game design** decision
rather than a mathematical one.

**The twelve pentagon columns are protected terrain and are landmarks.** Nothing
is placed or removed on them, so every piece of directional machinery may assume
six neighbours rather than handling five — the special case is deleted rather than
managed. Two of the twelve carry the coordinate poles, per this document's own
note about antipodal pairs.

Burying them under ocean was rejected. It costs an affordable 1% of the surface,
but it fixes the macro geography of every world at positions no seed can move, and
it cannot be undone once baked into the generator.

The finding that reframed the choice: **the direction-index slip is topological.**
Measured at loop radii 1 through 16, it is one index every time — it counts the
pentagons a loop encloses, not the distance kept from them. So no option removes
it, ocean included, and heading-carrying code has to handle it regardless. That
turned the decision into a narrow one about the cell itself, and made the cheap
answer the right one.

## Player-facing coordinates

`x: 412, y: 68, z: -190` is meaningless on a sphere. Show **latitude, longitude
and altitude**.

Small, but it affects every navigation feature players expect: waypoints, maps,
sharing locations, compasses.

---

## Rivers, erosion, and continents

Covered in [doc 08](08-terrain-generation.md) as the limit of pure noise. The
two-tier coarse-heightmap approach is sketched there but not designed: the
erosion algorithm, river tracing, and plate assignment are all still open.

---

## Multiplayer interest management

The easy one, listed for completeness: "which players care about this chunk
update" is an **ID range comparison**. The addressing scheme does the work. Needs
specifying, not inventing.

---

## Suggested next step

**Which boundary the mesh draws** is now the last structural gap, and the
smallest. It should not be left to be discovered during implementation, since it
is the difference between a player clicking on a cell and being told they clicked
on its neighbour.

It also has a candidate answer worth measuring rather than assuming. The planar
Voronoi vertices of a triangular lattice sit at triangle **circumcentres**;
[doc 14](14-meshing-and-lod.md) meshes **centroids**. On an equilateral triangle
those coincide, which is why the difference went unnoticed — and subdivided
icosahedron faces are near-equilateral but not equilateral. If that accounts for
the whole ~0.1-cell gap, the fix is one formula, and doc 14's cost model survives
untouched because moving a corner does not change the dual's combinatorics.

**Block rotation** is now unblocked and much easier than it looked, because
[doc 17](17-pentagons.md) removed its hard case: directional machinery may assume
six neighbours, since it can never be placed on a five. What is left is a 6-state
rotation field and 6-way logic, plus the loop rule from doc 17 — a heading carried
along a path must not be assumed to close.

**Player-facing coordinates** are also unblocked and now more attractive: doc 17
puts the lat/long poles on two protected, standable landmarks, so the coordinate
system has somewhere to point at.

After those, what remains is **content** rather than structure — rivers and
erosion, and multiplayer interest management. **The geometric core is closed.**

---

## What closing seven of these taught

All seven closed items came back with the same shape of answer, and it is worth
expecting again:

- **The pessimistic estimate was wrong in kind, not degree.** Meshing was
  supposed to be a blow-up and turned out to be a flat 2×. Gravity was supposed
  to be hard everywhere and turned out to be one `normalize` plus a genuinely
  hard horizontal problem. Precision was supposed to need a floating origin bolted
  on, and turned out to have had one all along, because the ID is integers.
- **The real cost showed up somewhere nobody was looking.** Not in the triangle
  count, but in what a pentagon does to a *direction index* — which no amount of
  subdivision fixes. Not in the floats, but in the discovery that the
  specification had been describing two different spheres.
- **Measuring first changed the design, not just the confidence.** Every
  recommendation in docs 13, 14 and 15 came out of a number, and several reversed
  the intuition that preceded them.
- **Each closure moved work rather than removing it.** Doc 13 handed the pentagon
  question a price tag, doc 14 handed doc 08 a reason for the density band, doc 15
  handed the `hexRound` question the precondition that makes it answerable, and
  doc 16 handed doc 07 a storage line four times the size of the blocks. Expect
  the next one to do the same.
- **The same invariant keeps paying.** "The tessellation is identical at every
  layer" made vertical neighbours free (doc 03), gravity tractable (doc 13),
  vertical face merging exact (doc 14), and then in doc 16 it made the sky pass
  as cheap as a flat world's *and* shrank sky-light storage 32×. An invariant
  that has paid out five times is not a convenience — and when doc 06's
  suggestion to break it was finally priced, the bill was all five at once for
  18% more crust.
- **An unmeasured number stayed load-bearing longer than anyone noticed.** This
  is the new one, and it is the least comfortable. Closing layer merging needed a
  threshold for how uniform cells are, which sent someone to look at the 1.3:1
  area figure — the only load-bearing constant in the specification with no script
  behind it. It is **1.99:1**. It had been read off a level-2 picture, repeated
  into eight documents, and had already made [doc 10](10-pathfinding.md)'s A*
  heuristic **inadmissible by its own argument**: that document correctly insisted
  on dividing by maximum spacing, then computed the maximum from the wrong spread.
  Everything with a script attached held up. The one thing without a script did
  not. **Cite a script or do not state a number.**
