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

## Standard for new claims

If a number appears in `docs/`, it should either be trivially derivable or have a
script here that produces it. Add the script before adding the number.
