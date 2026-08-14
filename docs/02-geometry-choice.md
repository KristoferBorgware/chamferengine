# 02 — Choosing the geometry

## What we have to pick

A unit cell shape that tiles a sphere seamlessly, without distorting the cell at
the seams. That is the whole job of this document, and the answer turns out to be
forced more than chosen.

## Three things you cannot have at once

1. Perfectly uniform cells
2. A perfect sphere
3. No distortion at seams

Pick any two. The reason is the 720° from [doc 00](00-introduction.md): every
closed surface topologically a sphere carries **exactly 720° of angular defect**.
This is the Gauss–Bonnet theorem, and it is not negotiable. The design question
is only *where that 720° goes* and *how finely it is subdivided*.

So the way to compare candidates is: **how many points does the defect land on,
and how much lands on the worst one?**

| Tiling | Defect points | Worst single point |
|---|---|---|
| Cube sphere | 8 | 90° |
| Rhombic triacontahedron | 32 (20 + 12) | 42.8° |
| Goldberg (hex + pentagons) | 12 pentagons | small, and shrinks with resolution |

## Why cubes are the worst choice

Six square faces wrapped onto a sphere put the entire 720° into eight corners,
90° each. That concentration is what produces visible pinching.

![Three squares meet around a cube corner, leaving a 90-degree quadrant empty; five triangles meet around a pentagon cell, leaving 60 degrees](figures/defect-where-it-lands.svg)

*At a cube corner, three squares meet where four would on a flat floor — the
empty quadrant **is** the 90° of defect. At a pentagon, five triangles meet where
six would, and the shortfall is only 60°. Warping the projection (as S2 does)
evens out cell **areas**, but the corners remain: three quads meet where four
should.*

**Demo:** [`demos/sphere-tiling-shapes.html`](../demos/sphere-tiling-shapes.html)
— compare *Quads · cube* against *Quads · rhombic 30* at the same resolution.
Red marks major defect, amber minor.

---

## The candidates, in full

### Hexagons plus twelve pentagons — **chosen**

Hexagons have zero curvature; they tile a plane and cannot close a sphere alone.
Pentagons carry positive curvature. Exactly twelve are required, and they are
not a hack — they are the solution.

The reason twelve is forced becomes obvious once you look at where a cell comes
from. Build the sphere by subdividing an icosahedron and put a cell on every
**corner** of the result. Six triangles meet at an ordinary corner, so its cell
has six sides. At the twelve original icosahedron corners only five meet.

![Six triangles meeting at a point produce a hexagon; five produce a pentagon](figures/hexagon-and-pentagon.svg)

*Twelve corners of the icosahedron survive every subdivision, so twelve cells are
pentagons at every level, forever. This is the same fact as the 720°, counted a
different way: 12 × 60° = 720°.*

This is the structure of soccer balls, buckminsterfullerene (C60), and geodesic
domes. Formally it is a **Goldberg polyhedron**, constructed as the **dual of a
subdivided icosahedron**: every vertex of the geodesic sphere becomes a cell;
degree-6 vertices become hexagons, and the twelve original icosahedron vertices,
which have degree 5, become the pentagons.

**"Subdivided" needs pinning down**, because there are two ways to do it and they
give different spheres. A vertex's position is **one** barycentric blend of its
face's three corners, normalised once — not the result of repeatedly splitting at
arc midpoints. The two differ by a fixed 38.97 m on the worked planet, which is
39 cells at level 11, and [doc 15](15-precision-and-origin.md) shows why the
one-shot rule is the one this design is committed to.

Cell counts follow `N(L) = 10 · 4^L + 2`:

| Level | Cells | Composition |
|---|---|---|
| 0 | 12 | 12 pentagons (a dodecahedron) |
| 1 | 42 | 30 hexagons + 12 pentagons |
| 2 | 162 | 150 + 12 |
| 3 | 642 | 630 + 12 |
| 4 | 2,562 | 2,550 + 12 |

**Why chosen:** best neighbour ergonomics of any option. Every adjacency is a
**shared edge** — no diagonals, no ambiguity, no corner-cutting. That part is
exact and holds everywhere. Away from the twelve pentagons a cell also has six
neighbours, near enough equidistant to be treated as such for movement.

"Near enough" is doing real work in that second sentence, and the caveat below
says how much — more than earlier drafts of this document claimed. The shared-edge
guarantee is the one to lean on; equidistance is the approximation.

**Honest caveat:** the hexagons are **near-regular, not congruent**. Edge lengths
and angles vary, with most distortion clustered near the twelve pentagons and
fading out. This is *smoothly distributed* with no discontinuity, which is the
real win over a cube map — but "all hexagons are identical" is false, and code
must not assume it.

How false was, until recently, the one load-bearing number in this specification
with no script behind it. Earlier drafts of this document said 1.3:1 in area and
1.14:1 in spacing. Measured, it is closer to **2:1**.

### Why the cells differ at all

The reason is worth seeing before the numbers, because it also explains why no
amount of extra subdivision fixes it.

Cells start life as evenly spaced points on a **flat** triangle, and are then
pushed straight outward from the planet's centre until they land on the sphere
([doc 15](15-precision-and-origin.md)). The flat triangle's three corners are
icosahedron vertices, so they are **already on the sphere** and do not move at
all. Its middle sags inward, to 79% of the radius, so points there have to travel
a fifth of the way out — and they spread apart as they go.

![A circle in cross-section with a flat chord inside it, evenly divided, and rays from the centre projecting those divisions onto the arc where they bunch toward the ends](figures/why-cells-differ.svg)

*Evenly spaced on the flat face, unevenly spaced once projected. The gaps stay
wide across the middle and tighten toward the corners, which is why the smallest
cells on the whole planet sit next to the twelve pentagons.*

Everything follows from that one sag. The middle stretches by `1 / 0.7947` in each
direction and the corner not at all, so the **area** ratio is that cubed:

```
θᵥ = 37.3774°           how far a face's corner sits from its centre
cos θᵥ = 0.7947         so the face's middle sits at 79% of the radius

1 / 0.7947³ = 1.9928    ← area ratio, face centre against face corner
1 / 0.7947^1.5 = 1.4117 ← the same thing measured as width
```

Push it further and nothing changes: the sag belongs to the **face**, not to the
cells inside it. Halving the cells halves the distortion band along with them, so
the ratio holds at every level. That is the same reason `hexRound`'s disagreement
stops falling in [doc 04](04-position-lookup.md).

Here is what that predicts, and what measuring finds.

> **[verified]** `verification/uniform.js` measures every cell's area two
> independent ways — a third of each incident triangle, and the exact spherical
> area of the dual polygon. They agree to four decimals and both sum to exactly
> 4π.
>
> | Level | Cells | Hexagon area ratio | Including pentagons |
> |---|---|---|---|
> | 2 | 162 | 1.17 | 1.90 |
> | 3 | 642 | 1.53 | 2.33 |
> | 4 | 2,562 | 1.75 | 2.54 |
> | 5 | 10,242 | 1.87 | 2.64 |
> | 6 | 40,962 | 1.93 | 2.69 |
> | 7 | 163,842 | **1.96** | **2.72** |

The measured ratio climbs level by level and settles on **1.9926** — against the
**1.9928** the sag predicts. Agreement to four decimals, so the picture above is
the whole explanation and nothing else is going on.

That climb is also where 1.3:1 came from. At level 2 the ratio really is 1.17, and
at level 3 it is 1.53; someone read the number off a coarse grid, before it had
finished rising. **The design runs at level 11.**

If you need the formal name for the projection, it is **gnomonic** — the one that
maps great circles to straight lines, which [doc 09](09-ray-traversal.md) leans on
for a different reason entirely.

So the figures to use are:

| Quantity | Value |
|---|---|
| Hexagon area variation | **1.99 : 1** |
| Area variation including the twelve pentagons | **2.74 : 1** |
| Hexagon spacing variation | **1.41 : 1** |
| Edge length variation, min at a pentagon | **1.48 : 1** |
| Largest edge ÷ nominal spacing | **1.098** |

That last row is the one to reach for whenever something divides by "the" cell
spacing. [Doc 10](10-pathfinding.md) is where it has teeth: a heuristic that
divides by nominal spacing rather than maximum spacing stops being admissible —
and the safe divisor is **10% above nominal**, not the 7% that document had
derived from 1.14:1.

**Demo:**
[`demos/goldberg-voxel-sphere.html`](../demos/goldberg-voxel-sphere.html) —
the tiling at four resolutions, generated as the dual of a subdivided
icosahedron. At 2,562 cells the pentagons are hard to spot.

---

### Geodesic triangles

The dual of the above: the subdivided icosahedron itself. All cells are
triangles, perfectly uniform in shape; twelve vertices have five neighbours
instead of six.

**Rejected because** triangles alternate up/down orientation, which makes
movement rules, building, and adjacency logic messy. Kept as the *hierarchy*
layer — see [doc 03](03-addressing.md).

---

### Quads on a cube sphere

Simplest indexing, worst distribution. See above.

---

### Quads on a rhombic triacontahedron

Thirty identical **golden rhombi**, subdividable into an n×n grid per face.
Spreads the same 720° over 32 vertices instead of 8: 42.8° at each of the twelve
5-valent vertices, 10.3° at each of the twenty 3-valent ones.

> **[verified]** `verification/check.js` constructs the solid from the
> icosahedron — for each of the 30 edges, a rhombus formed by the edge's two
> vertices plus the two adjacent face centroids, scaled so the diagonals share a
> midpoint. All 30 faces come out planar (max non-planarity 8e-18) with diagonal
> ratio exactly φ = 1.618034 on every face. Defect sums to 720.00°.

**Rejected because** quads reintroduce diagonal adjacency, which is precisely
what hexagons remove. But it is a genuinely better quad sphere than a cube, and
worth knowing about if quad indexing is ever required.

---

### HEALPix

Twelve base quads subdividing 4-into-1, with **exactly equal cell area**. Built
for astronomy. Excellent when equal-area sampling matters most; rejected here for
the same reason as the rhombic-30.

---

### Face-transitive solids

If every cell must be *literally congruent*, you need a face-transitive solid:

- Pentagonal hexecontahedron — 60 identical pentagons
- Deltoidal hexecontahedron — 60 identical kites
- Rhombic triacontahedron — 30 identical rhombi

**Rejected because** they do not subdivide further while staying congruent.
Resolution is capped at 30–120 cells. Far too coarse for a world.

---

## Space-filling cells, for depth

A separate question from tiling the surface: what shape should fill the
*volume*? Two candidates tile 3D space perfectly with a single cell shape and are
far more isotropic than cubes:

- **Rhombic dodecahedron** — 12 identical rhombic faces, fills space in an FCC
  packing (the shape of a cell in the densest sphere packing).
- **Truncated octahedron** — 8 hexagons + 6 squares, fills space in a BCC
  packing. The most sphere-like single cell that tiles 3D space with no gaps.

Neither wraps a sphere any better than a cube does. They are relevant only if the
world is ever built as a large flat lattice carved into a ball, rather than as
radial layers over a spherical shell. **Not the chosen approach** — see
[doc 06](06-world-sizing.md) for how depth is handled instead.

**Demo:** [`demos/sphere-tiling-shapes.html`](../demos/sphere-tiling-shapes.html)
— the last two buttons show each solid plus its neighbours, demonstrating how
they pack.

---

## Decision

**Goldberg polyhedron**: hexagonal cells with exactly twelve pentagons,
constructed as the dual of a subdivided icosahedron.

The consequences that follow — where the hierarchy lives, how cells are
addressed, how positions are looked up — are the subject of the next documents.
