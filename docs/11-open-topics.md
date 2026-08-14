# 11 — Open topics

## What this is

The honest list of what is **not yet designed**. Each item needs its own document
before implementation, and they are ordered roughly by how much they force
changes elsewhere.

Three entries are struck through because they have since been closed. They are
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

## Is `hexRound` exact on the sphere?

The one place the specification asserts something load-bearing with no script
behind it, found by reading the corpus against itself rather than by running
anything.

[Doc 04](04-position-lookup.md) turns a position into a cell in four steps. Step
1 — nearest face centroid is the containing face — is verified exact on 200,000
random directions. Step 3 — round the barycentric triple and you have the
containing cell — is verified nowhere, and it is **not** the same kind of claim.
On a flat lattice the Voronoi cell of a lattice point is the hexagon, exactly.
The real cells are Voronoi regions *on the sphere* of radially projected points,
and gnomonic projection preserves straight lines but not equidistance, so the two
Voronoi diagrams are not the same diagram.

What depends on it is everything that goes **position → cell**:
[doc 09](09-ray-traversal.md) entirely, since its DDA steps across exactly the
boundaries this assumption places (and it has no verification of its own); the
lookup path in [doc 07](07-data-structures.md); and invariant 5 — *a cell's ID is
computed from position* — which is the load-bearing claim of the whole addressing
scheme.

What does **not** depend on it is anything going cell → position. Doc 10's
heuristic walks path digits from an ID it already has, and doc 14's LOD corner
figures come from the dual construction directly. Both are unaffected either way.

The work is small: build the real grid, sample random directions, compare
`hexRound` against true nearest-cell-on-the-sphere, report the mismatch rate and
the distance-to-boundary distribution, and repeat across levels to see whether it
shrinks with depth. Three outcomes, and they are not equally likely:

- **Zero mismatches** — the cheapest and most likely-feeling outcome given how
  little a single face triangle bends. Promote the claim to `[verified]`, done.
- **Mismatches confined to a thin boundary band, shrinking with depth** — the
  expected outcome. Document the band width and move on; a player at the exact
  edge of a hexagon being assigned to its neighbour is invisible in play.
- **Mismatches that do not shrink** — then the ray walk in doc 09 can step onto
  the wrong boundary and drift, and doc 04 needs a correction term. Only this
  outcome costs anything, and it is the reason to measure rather than assume.

Worth doing before the floating-origin work below, because it is an afternoon and
it sits underneath docs 04, 07 and 09 and one of the eleven invariants.

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

## Lighting

Flood-fill propagation works, but:

- Each cell has **8 neighbours** (6 around, 2 vertical) instead of 6.
- Sky light arrives along the **radial** direction, not straight down.
- Day/night is a sun direction vector dotted against cell normals — which gives a
  real terminator sweeping the planet for free.

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

**First, the `hexRound` question above** — it is an afternoon's work, it sits
underneath three documents and an invariant, and it is the only place the
specification currently asserts something load-bearing without a script. Closing
[doc 15](15-precision-and-origin.md) sharpened that question rather than
answering it: now that the construction is pinned to one-shot, "does planar
rounding find the right spherical cell?" is finally well-posed.

Then **lighting**, now the largest genuinely undesigned system: 8 neighbours
instead of 6, sky light along the radial direction, and a sun direction that
gives a real terminator sweeping the planet for free. It is also the most
self-contained thing left — nothing already written depends on it, so it cannot
invalidate anything.

**Pentagons as a gameplay problem** is the cheapest remaining item and the only
one blocked by nothing at all. Doc 13 supplies every number needed to decide it,
and deciding it unblocks block rotation, rails, and the "north landmark"
question. It is a conversation rather than a document.

---

## What closing three of these taught

All three closed items came back with the same shape of answer, and it is worth
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
  question a price tag, doc 14 handed doc 08 a reason for the density band, and
  doc 15 handed the `hexRound` question the precondition that makes it answerable.
  Expect the next one to do the same.
