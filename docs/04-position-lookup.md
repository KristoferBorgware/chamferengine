# 04 — Position lookup

## The question this answers

A player is standing at some 3D world position. **Which cell are they in?**

And the harder version: answer that without ever having enumerated or stored a
single cell.

## There is no chicken-and-egg

The thing that trips people up here is imagining that cells must exist before
they can be found. They do not.

**IDs are never generated or stored. They are computed from position, on the
spot.** The same way nobody maintains a registry of Earth's coordinates: the grid
is a rule, not a list.

Level 13 "has" 671 million cells the way a sheet of graph paper has infinite
coordinates — addressable, not allocated.

---

## The pipeline

Four steps, and each one is arithmetic:

```
dir   = normalize(pos)
layer = floor((surfaceRadius - |pos|) / blockSize)

face  = argmax over the 20 face centroids of dot(dir, centroid)
(a,b,c) = barycentric of dir in that face's triangle
(i,j) = hexRound(a*n, b*n, c*n)          // n = 2^depth

// walk down, emitting one digit per level
for level in 0..chunkLevel:
    half = n/2
    if      i >= half:   digit = 1; i -= half
    else if j >= half:   digit = 2; j -= half
    else if i + j < half: digit = 0
    else:                digit = 3; i = half - i; j = half - j; flip ^= 1
    n = half
```

Cost is O(depth) — a few dozen operations, no data structure in memory. The
`flip` bit at the end is the middle-child mirror from [doc 03](03-addressing.md),
carried down the walk.

---

## Step 1: which of the twenty faces

Twenty dot products, take the largest. That is the whole step, and it is
**exact, not an approximation**.

That surprises people, so here is why it holds. On an icosahedron, the
perpendicular bisector plane between two adjacent face centroids contains the
shared edge's two vertices. (There is a 2-fold rotation about the edge-midpoint
axis swapping the two faces, so the bisector must contain the edge.) The face
boundaries therefore *are* the Voronoi boundaries of the face centroids — and
"nearest centroid" is exactly "inside that face".

> **[verified]** `verification/lookup.js` compares `argmax` against a true
> barycentric containment test on 200,000 random directions: **0 mismatches**.

Twenty dot products is negligible, but a precomputed spatial lookup is possible
if this ever shows up in a profile.

---

## Step 2: where inside the face

Barycentric coordinates are **mixing ratios**. Instead of "3.2 cm right, 1.7 cm
up", you say "30% corner A, 55% corner B, 15% corner C". Three numbers that
always sum to 1.

| Position | Coordinates |
|---|---|
| Corner A | `(1, 0, 0)` |
| Midpoint of A and B | `(0.5, 0.5, 0)` |
| Dead centre | `(⅓, ⅓, ⅓)` |
| Outside the triangle | any coordinate negative |

Three numbers for a 2D position because one is redundant: `c = 1 − a − b`. You
only need to *store* two — but the third is essential while calculating, for a
reason that shows up in the next step.

![A triangle with an interior point joined to all three corners, splitting it into three sub-triangles](figures/barycentric-areas.svg)

*Each coordinate is an **area fraction**: `a` equals the area of triangle `PBC` —
the sub-triangle **opposite** corner A — divided by the total. Drag toward a
corner and the opposite sub-triangle shrinks to nothing.*

**Why this is the right tool here:** barycentric needs nothing but the triangle's
three corners — no origin, no axes, no per-face frame. Exactly what you want when
twenty faces each chose their own origin independently.

**Demo:** [`demos/barycentric.html`](../demos/barycentric.html) — drag a point and
watch the shaded areas, the weights, and the rounding table update together.

### Relation to `(i, j)`

On a triangle divided `n` per side, the lattice points **are** the barycentric
coordinates scaled to whole numbers:

```
(i, j, k)  with  i + j + k = n
```

`(i, j)` is that with `k` dropped, because `k = n − i − j`. And the
"am I inside the triangle?" test being `i + j ≤ n` is literally just `k ≥ 0`.

`(q, r)` is the identical idea at chunk scale, using the chunk's own three
corners as reference.

---

## Step 3: `hexRound`, and why the third number earns its keep

Converting a continuous position gives fractions, and rounding each one
independently breaks the sum:

```
(4.7, 8.6, 2.7)   sums to 16 ✓
round each      → (5, 9, 3)  sums to 17 ✗
```

A triple that does not sum to `n` is not a lattice point at all. The fix: find
which coordinate moved furthest (here `8.6 → 9`, a shift of 0.4) and recompute
*that one* from the other two:

```
(5, 8, 3)   sums to 16 ✓
```

```js
function hexRound(k, i, j, n){
  let rk = Math.round(k), ri = Math.round(i), rj = Math.round(j);
  const dk = Math.abs(rk-k), di = Math.abs(ri-i), dj = Math.abs(rj-j);
  if      (dk > di && dk > dj) rk = n - ri - rj;
  else if (di > dj)            ri = n - rk - rj;
  else                         rj = n - rk - ri;
  return [rk, ri, rj];
}
```

**This is why the third coordinate earns its keep** — you could not detect or
repair the error with only two. Store `(i, j)` afterwards and forget `k`.

### Why this step is *not* known to be exact, unlike step 1

On a flat, uniform triangular lattice the Voronoi cell of a lattice point **is**
the hexagon, so "nearest lattice point" and "which cell am I in" are the same
question and rounding answers both. That is a theorem, and it is where the
confidence in this step comes from.

But the cells are not on a flat lattice. They are the Voronoi regions **on the
sphere** of the lattice points after they have been projected radially outward.
Gnomonic projection maps great circles to straight lines — which is what
[doc 09](09-ray-traversal.md) leans on — but it does **not** preserve
equidistance. Two points that are equally far from a lattice point in the face
plane are not equally far from it on the sphere. So the spherical Voronoi
boundary is not the planar one, and near a cell boundary the nearest *planar*
lattice point need not be the nearest *spherical* cell.

Step 1 is verified exact against 200,000 random directions. **Step 3 is not
verified at all**, and the two should not be read as carrying the same weight:

> **[unverified]** The mismatch is expected to be confined to a thin band along
> cell boundaries and to shrink with subdivision depth, since the projection
> distorts less over a smaller triangle. Expected, not measured. What is needed
> is a script that builds the real grid, samples random directions, compares
> `hexRound` against true nearest-cell-on-the-sphere, and reports both the
> mismatch rate and how close to a boundary the mismatches sit. Until that
> exists, treat "rounding gives the containing cell" as a **working assumption**.

The practical stakes are low and the correctness stakes are not. A cell-boundary
disagreement means a player standing at the very edge of a hexagon is
occasionally assigned to the neighbouring one — invisible in play. But the same
assumption is what makes the ray walk in [doc 09](09-ray-traversal.md) exact
rather than approximate, and a DDA that steps on the wrong boundary can drift,
which is not invisible.

Note the direction of travel. This affects **position → cell** only. Anything
that starts from an ID and walks path digits to a position — the pathfinding
heuristic in [doc 10](10-pathfinding.md), the mesh geometry in
[doc 14](14-meshing-and-lod.md) — is untouched by it. See
[doc 11](11-open-topics.md).

---

## The face-boundary test

A single sign check. If any barycentric coordinate goes negative, the position is
outside this face — apply the adjacency table ([doc 05](05-face-adjacency.md)) and
continue in the neighbour's frame.

That is the same test as `k ≥ 0` above, which is the same test as `i + j ≤ n`.
One inequality, wearing three hats.

---

## Layer

```
layer = floor((surfaceRadius - |pos|) / blockSize)
```

Independent of everything above — the radial axis never interacts with the
horizontal one, which is the recurring gift of the layout in
[doc 03](03-addressing.md). Note `surfaceRadius` here is the *planet reference
radius*, not the terrain height at this direction — see
[doc 08](08-terrain-generation.md).

---

## In one breath

- Cells are **computed, never stored**. The grid is a rule.
- **Nearest face centroid is the containing face**, exactly, for a reason about
  perpendicular bisectors — not as an approximation.
- Barycentric coordinates are **area fractions**, and they need no per-face frame,
  which is exactly why they suit twenty faces with unrelated origins.
- Rounding three coordinates independently breaks their sum; **repair the one
  that moved furthest**. The third coordinate exists to make that possible.
- That rounding gives the *containing cell* is exact on a flat lattice and a
  **working assumption on the sphere** — the one step in this pipeline with no
  script behind it.
- One sign check answers "have I left this face?", "is this inside the triangle?"
  and "is `k` negative?" — they are the same question.
