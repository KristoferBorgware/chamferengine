# Verification

Plain Node scripts, no dependencies. Every non-obvious mathematical claim in
`docs/` was checked with one of these before being written down. Claims marked
**[verified]** in the documentation correspond to a script here.

```bash
node verification/<script>.js
```

---

## `check.js` — rhombic triacontahedron

Constructs the solid from the icosahedron: for each of the 30 edges, a rhombus
formed by the edge's two vertices plus the two adjacent face centroids, scaled so
both diagonals share a midpoint.

**Verifies:** all 30 faces planar (max non-planarity 8e-18), diagonal ratio
exactly φ = 1.618034 on every face, angular defect sums to 720.00°.

**Used in:** [doc 02](../docs/02-geometry-choice.md)

---

## `s2.js` — S2 projection area ratios

Implements the linear, quadratic and tangent projections and measures cell areas
directly with l'Huilier's formula.

**Verifies:** ratios of 5.114 / 2.056 / 1.406 at 128×128 per face, converging on
the documented 5.20 / 2.08 / 1.41. Total solid angle sums to exactly 4π in all
three cases.

**Used in:** [doc 01](../docs/01-prior-art.md)

---

## `lookup.js` — face containment

Compares `argmax` over face centroids against a true barycentric containment test.

**Verifies:** 200,000 / 200,000 random directions agree. Nearest face centroid
**is** the containing face, exactly.

**Used in:** [doc 04](../docs/04-position-lookup.md)

---

## `qr.js` — address round-trip

Splits `(i, j)` into path digits plus `(q, r)` and rejoins it, for every lattice
point at depth 8 with chunk level 4.

**Verifies:** 33,153 / 33,153 exact round-trips. Reports that 15,104 points —
about 46% — sit in a flipped (middle-child) frame.

**Used in:** [doc 03](../docs/03-addressing.md)

---

## `adj.js` — face adjacency table

Builds the real 20 × 3 table by matching shared vertex pairs.

**Verifies:** all 60 edges matched, no gaps, every entry `reversed` — the
signature of consistent outward winding. 180 bytes at 3 fields × 1 byte.

**Used in:** [doc 05](../docs/05-face-adjacency.md)

---

## `order.js` — traversal order

Enumerates the child adjacency graph of a 4-way midpoint triangle split and brute
forces every ordering.

**Verifies:** the graph is a star (middle adjacent to all three corners, corners
adjacent to none of each other), so no Hamiltonian path exists. Best achievable
is **2 of 3** steps edge-adjacent. This is why no continuous space-filling curve
is used.

**Used in:** [doc 03](../docs/03-addressing.md)

---

## `calc.js` — sizing formula

Checks the closed form `blockSize = K · radius / 2^level` against exact
cell-area mathematics, and reproduces the worked example from the docs.

**Verifies:** `K = 1.20459`; agreement to three decimals at three radii; the
worked example (1 m blocks, 2 h walk → level 11, 1,700 m radius, 41,943,042
cells).

**Used in:** [doc 06](../docs/06-world-sizing.md)

---

## `scale.js` — level reference table

Prints cell counts and block sizes per subdivision level for an Earth-sized and a
10 km planet, plus bit-budget and storage figures.

**Used in:** [doc 06](../docs/06-world-sizing.md)

---

## `frame.js` — gravity and orientation

Five checks, covering the local frame and where the 720° lands in it.

**Verifies:**

1. **Holonomy = enclosed area.** Parallel-transports a tangent vector around
   circles of colatitude 10°–120° in 200,000 steps; the accumulated rotation
   matches `2π(1 − cos θ)` to better than 1e-8 degrees at every radius.
2. **The 720°, two ways.** Builds the real grid at levels 1–5. The *geometric*
   defect at a pentagon shrinks ~4× per level (15.69° → 0.042°); the
   *combinatorial* deficit `6 − degree` is **1 index at every level**. Both total
   720.000°.
3. **Direction-index transport.** Walks the neighbour ring of every cell whose
   neighbours are all hexagons at level 4: slip is **0** around all 2,490
   pentagon-free hexagons and **exactly 1 index (60°)** around each of the 12
   pentagons. Measures the pentagon interior angle at 71.965°, so a line entering
   one deflects **36.07°** either way.
4. **Antipodal pentagons.** The icosahedron is centrally symmetric, so the twelve
   pentagons form **6 antipodal pairs** — a lat/long axis can be run through one,
   putting both coordinate poles on pentagons.
5. **Planet-scale consequences.** Tilt `s/R` between two builds, horizon
   `R·acos(R/(R+h))` (**76 m** for a standing player on the doc-06 planet, against
   4.7 km on Earth), and how far `up` swings across a chunk at each chunk level.

**Used in:** [doc 13](../docs/13-gravity-and-orientation.md)

---

## `mesh.js` — meshing and LOD

Six checks, covering what a hex surface costs and where LOD actually breaks.

**Verifies:**

1. **Mesh cost.** A fully exposed hex surface converges on exactly **2 vertices
   and 4 triangles per cell** — `2V − 4` dual vertices and `4V − 12` fan
   triangles. An unmerged square grid costs 1 and 2, so hexes are a flat 2×.
2. **Vertical merging is exact.** The side faces of stacked cells lie in one
   radial plane to **1.5e-16** radii, so a run down a column collapses to a
   single quad at no geometric cost.
3. **Flat-patch sag.** Merging drops vertices that were following the sphere;
   the patch sags by `s²/8R`. On the doc-06 planet a tenth of a block of sag
   allows a **37 m** patch, a quarter allows 58 m.
4. **LOD geometry barely matters.** Coarse hexagon corners land within
   **0.72% mean, 0.97% max** of a fine corner, as a fraction of cell spacing.
5. **LOD seams are terrain, not geometry.** The same terrain sampled one level
   apart differs by up to 1.5 m at level 11 with 60 m of relief, and a skirt one
   coarse cell deep covers the worst case at every level tested.
6. **What is on screen.** Visible cells by altitude, and the finest level that
   fits a 2M-triangle budget: full detail at eye height, dropping about one level
   per doubling of altitude above 50 m.

**Used in:** [doc 14](../docs/14-meshing-and-lod.md)

---

## `volume.js` — terrain as a generated volume

`mesh.js` costs a flat surface on a smooth sphere. This costs the real thing:
relief, caves, and the noise generator behind them.

**Verifies:**

1. **Relief extends the horizon.** A 60 m hill is visible from **521 m**, not the
   76 m ground horizon — 47× the cells. The 21,000-cell figure is a floor.
2. **Relief barely moves the triangle count.** Raw side faces climb 20× from flat
   to 120 m of relief, but each unbroken run merges to one quad, so triangles go
   only **4.00 → 9.48 per cell** and then saturate.
3. **The density term's cost is mostly not caves.** At low frequency it
   multiplies faces **10×** while carving **zero** enclosed voids — that is
   surface roughening. Enclosed voids need noise gradient > 1 (the bias grows
   1 per metre of depth) and add only ~20% more, but they are what produces
   multi-span columns: 8–24% of them.
4. **Coarse levels cannot hold small features.** A 3 m cave is gone by level 10,
   a 10 m canyon by level 8. Interior geometry must be culled, never simplified.
5. **Generation cost by generator and level.** The density term is **51×** the
   height term over a full crust, **26×** restricted to a band. Running height
   field only on far chunks makes a LOD-2 chunk **~330× cheaper** to generate.

**Used in:** [doc 14](../docs/14-meshing-and-lod.md)

---

## `seam.js` — chunk boundaries with caves on one side

Builds a real rim — full density field on the fine side, height-field term one
level coarser on the other — and scores what each boundary policy leaves open.

**Verifies:**

1. **Trusting your own generator past the rim leaves 1,041 holes** over 385 rim
   columns. Neither side emits the wall, because each believes the terrain simply
   continues.
2. **A skirt closes the surface slit and almost nothing else.** All 72
   surface-slit layers, but only **8 of 969 cave mouths** — at a 2 m coarse cell
   **99% sit deeper than the skirt reaches**, the deepest 15 layers down. A skirt
   hangs downward; a cave mouth is a horizontal hole. More skirts do not help.
3. **Seam ownership leaves zero holes.** The finer chunk emits a face wherever
   its solidity differs from the coarse neighbour's, in both directions, for
   **2.70 boundary faces per rim column** plus one height-field evaluation per
   column. At equal levels the rule costs nothing, since there is nothing to
   disagree about.

**Used in:** [doc 14](../docs/14-meshing-and-lod.md)

---

## Standard for new claims

If a number appears in `docs/`, it should either be trivially derivable or have a
script here that produces it. Add the script before adding the number.
