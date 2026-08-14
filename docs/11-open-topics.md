# 11 — Open topics

## What this is

The honest list of what is **not yet designed**. Each item needs its own document
before implementation, and they are ordered roughly by how much they force
changes elsewhere.

Five entries are struck through because they have since been closed. They are
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

## Layer merging — proposed, never designed

[Doc 06](06-world-sizing.md) observes that cells taper as `(R − h)/R` with depth,
and that past roughly 85% of surface width the narrowing becomes visible. There
are two ways out: cap the crust, or **merge layers** — drop the horizontal
resolution by one level at a chosen depth. Doc 06 recommends capping and raises
merging only to decline it; this is where the declining is justified.

Capping the crust is fully specified and costs nothing on the worked-example
planet, whose crust floor sits at 96%. Merging layers has never been more than a
sentence, and it contradicts an invariant that three closed results are built on. [Doc
03](03-addressing.md) states the tessellation is *identical at every layer*,
which is what makes vertical neighbours free (`layer ± 1`, no face crossing, no
pentagon case). [Doc 13](13-gravity-and-orientation.md) calls that the fact that
makes gravity tractable. [Doc 14](14-meshing-and-lod.md) measures vertical face
merging as exact to 1.5e-16 *because* stacked cells share a radial plane.

A resolution change at some depth breaks all three at that boundary — and it is
an interior boundary, wrapped around the whole planet, which no chunk-seam rule
currently covers. Either design it properly or strike the suggestion. **Do not
implement it from the sentence in doc 06.** Capping the crust is the safe default
and costs nothing on the worked-example planet, where the floor sits at 96%.

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

---

## Pentagons as a gameplay problem

The twelve pentagons are solved mathematically, not experientially. A player
laying a conveyor line will eventually hit a cell with five sides where their
sixth direction does not exist.

Options:

- Bury them under ocean, as H3 does on Earth
- Make them unbuildable landmarks — shrines, anomalies, world features
- Accept the break and let players route around it

This is a **design decision**, not a technical one, and it should be made
explicitly rather than by default.

[Doc 13](13-gravity-and-orientation.md) quantifies what is actually being
decided. A line entering a pentagon deflects **36.07°** either way — there is no
opposite direction to leave by — and a circuit encircling one returns rotated by
exactly one direction index. Neither shrinks with subdivision depth. Only the
first option removes the problem rather than relocating it. Doc 13 also notes
that the twelve pentagons form **six antipodal pairs**, so one pair can be made
to carry the lat/long poles — which turns two of them into places worth naming.

---

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

**Pentagons as a gameplay problem** is now the cheapest remaining item and the
only one blocked by nothing at all. [Doc 13](13-gravity-and-orientation.md)
supplies every number needed to decide it — 60° forever, a 36.07° deflection, six
antipodal pairs — and [doc 16](16-lighting.md) has since shown they cost lighting
nothing, which narrows what is actually being traded. Deciding it unblocks block
rotation, rails, and the "north landmark" question. It is a conversation rather
than a document.

**Which boundary the mesh draws** is small and should not be left to be
discovered during implementation, since it is the difference between a player
clicking on a cell and being told they clicked on its neighbour.

After those, the undesigned systems left are all **content** rather than
structure: rivers and erosion, block rotation, player-facing coordinates, and
multiplayer interest management. The geometric core is closed.

---

## What closing five of these taught

All five closed items came back with the same shape of answer, and it is worth
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
  that has paid out five times is not a convenience; doc 06's suggestion to
  break it deserves the scepticism it now gets.
