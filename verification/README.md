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

**Does not verify:** the step *after* it. Doc 04's pipeline is face → barycentric
→ `hexRound` → path digits, and this script covers only the first arrow. That
`hexRound` returns the containing **cell** is exact on a flat lattice and
unproven on the sphere — see the wanted script at the bottom of this file.

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

## `precision.js` — floating point at planet scale

Seven checks, covering what a float can hold, where the ID → position conversion
loses accuracy, and how much a chunk-local origin buys back.

**Verifies:**

0. **Where "about 7 significant digits" comes from.** 1 sign + 8 exponent + 23
   stored mantissa bits, an implicit leading 1 making the significand 24 bits, and
   `24 × log₁₀2 = 7.22` decimal digits. Predicts each gap from `2^(e−23)` and
   checks it against the measured spacing; derives the binade thresholds from
   `e ≥ 23 + log₂ t` and reaches the same radii the binary search in check 2 finds
   independently.
1. **What a float can resolve.** `float32` position spacing is **122 µm** at the
   doc-06 radius and **500 mm** at Earth radius — two representable positions per
   1 m block — against **0.93 nm** for `float64` at the same radius.
2. **Where the thresholds fall.** Sub-millimetre out to a **16 km** planet, 1 cm
   at 131 km, 1 m at 8,389 km. All powers of two, because spacing is `2^(e−23)`
   and therefore a step function that doubles at each binade.
3. **One-shot and recursive subdivision are different spheres.** Checked two
   ways — by building both lattices and comparing every point, and in closed
   form. They differ by a fixed **38.97 m** (1.3133° at the quarter point of a
   base edge), which does **not** shrink with level, so it grows without bound as
   a fraction of a cell: **39 cells** at level 11. Docs 04 and 09 both require the
   one-shot construction.
4. **ID → position does not accumulate.** Worst error over 20,000 sampled cells
   is flat from depth 4 to depth 23, because the path walk is integer arithmetic
   and the float work is one blend plus one normalise at any depth.
5. **Directions are precision-robust.** `float32` `up` holds **0.005″** across
   five orders of magnitude of radius while position error grows linearly with
   `R`. Normalising divides the magnitude out.
6. **Chunk-local coordinates drop the planet from the budget.** `float32` inside
   a 128 m chunk resolves 15.3 µm — and gives the *identical* figure on an
   Earth-sized world at `D = 23`.
7. **Rebase frequency.** A player at 1.4 m/s crosses a `C = 6` chunk boundary
   every 22.9 s. Re-anchoring is renormalising an integer and an offset.

**Used in:** [doc 15](../docs/15-precision-and-origin.md)

---

## `pentagon.js` — the twelve as a gameplay problem

Puts numbers on a decision that is otherwise a matter of taste: how often a player
meets a pentagon, what each option would cost, and what any of them can actually
achieve.

**Verifies:**

1. **They are common, not remote.** 1,882 m apart on the doc-06 planet, and you
   are never more than **1,109 m** from one, typically **663 m** — on a world you
   can walk around in two hours.
2. **The affected area is tiny.** The defect is one cell; a 50-cell exclusion zone
   around all twelve costs 0.26% of the surface.
3. **Rare to hit, common to meet.** A random great-circle route right around the
   planet lands on a pentagon **0.378%** of the time and passes within fifty cells
   **16.7%** of the time. Closest approach is solved exactly rather than sampled
   along the route, which understates it badly. The rate also confirms the
   antipodal pairing: a great circle is equidistant from `v` and `−v`, so twelve
   pentagons present only **six** independent chances.
4. **Avoidance is always possible.** The best circumnavigating great circle keeps
   **788 cells** of clearance from every pentagon.
5. **Detouring is trivial** — 2–10 m of extra track. The cost was never distance.
6. **The loop slip is topological.** Walking a closed loop at graph distance 1, 2,
   3, 5, 8, 12 and 16 around a pentagon gives **one index every time**. No
   exclusion zone of any size changes it, which is what rules out "keep machinery
   away" as a fix and corrects doc 13's claim about ocean burial.
7. **The twelve as destinations.** A closed tour of all twelve exists along
   icosahedron edges, **22,586 m** — 2.11× around the world, about 4.5 hours of
   walking. And a landmark would have to be **1,793 m** tall to be seen from the
   next one, taller than the planet's radius, so they are **not inter-visible**.
8. **What burial would cost**, measured by sampling rather than the small-cap
   formula, which double-counts once the discs overlap: **1.03%** of the surface
   for a 100 m sea around each, rising to 100% at the 1,109 m covering radius.

**Used in:** [doc 17](../docs/17-pentagons.md)

---

## `light.js` — lighting on a hex sphere

Seven checks, covering what 8 neighbours cost, why sky light is still one
downward pass, and what a sun direction buys for free.

**Verifies:**

1. **Neighbour count.** 6 lateral + up + down, so **8**; exactly **12 cells** in
   the world have 7, at any depth. Light is a scalar, so degree is the only thing
   that changes — holonomy and the direction-index deficit do not apply.
2. **A torch costs 1.5×.** 7,471 cells against a cube world's 4,991 at light
   level 15. Confirmed by BFS on the real level-7 grid, at least 19 cells from any
   pentagon: **721** cells within 15 steps against a closed form of exactly 721.
3. **Pentagons cost nothing.** 601 cells against 721, identical at all twelve —
   which is `1 + 5r(r+1)/2` against `1 + 3r(r+1)`, tending to 5/6. There is one
   sixth less world within reach; nothing is dimmer and no case is needed.
4. **Sky light stays one downward pass**, because invariant 10 makes a column a
   straight line of cells. Light costs **4×** the block data per chunk (35 KB
   against 9 KB), but sky light is monotone down a column, so storing a depth per
   column instead of a value per cell is **32× smaller**.
5. **The terminator is one dot product** against `up`, already computed for
   gravity. Terminator speed by day length, and the anchor: at **2.12 h** — doc
   06's circumnavigation time — it moves at exactly walking pace.
6. **Twilight is an angle, not a distance**, so its duration is a fixed fraction
   of the day and does not depend on planet size at all.
7. **Shadows outrun the horizon.** Below about 6° of sun elevation a 10 m tower's
   shadow is longer than the 76 m visible world, so a shadow scheme never needs
   to reach further than the horizon.

**Used in:** [doc 16](../docs/16-lighting.md)

---

## `hexround.js` — is rounding the same as containment on a sphere?

Doc 04 rounds a barycentric triple to the nearest lattice point and calls the
result the containing cell. On a flat triangular lattice that is a theorem. The
lattice is projected onto a sphere, though, and gnomonic projection preserves
straight lines without preserving equidistance — so this builds the real grid at
levels 2–7, samples random directions, and compares `hexRound` against a
brute-force search for the nearest cell centre on the sphere.

**Verifies:**

1. **They disagree, on about 1% of the sphere.** 3.56% at level 2 falling to a
   plateau near **1%**, not to zero — a face triangle's shape is scale-free, so
   refinement shrinks the cells and the disagreement band together. Depth is not
   a fix. The top three levels are sampling-limited to ±0.1–0.2 points.
2. **Every disagreement is small and local.** The two cells are always
   **edge-adjacent** (worst separation 1.10 spacings), and `hexRound`'s cell is
   at most **0.11 of a spacing** further from the point, mean 0.02. A point goes
   to a neighbour only within about a tenth of a cell of the boundary.
3. **Which makes it a definition, not a defect.** `hexRound` is a pure function
   of position, so it already partitions the sphere — exactly, with no gaps,
   overlaps, or bare corners. Doc 04 adopts that partition as normative, which
   makes both the lookup and doc 09's ray walk exact by construction.

**Used in:** [doc 04](../docs/04-position-lookup.md)

---

## `uniform.js` — how uniform are the cells, really?

Doc 02 claimed 1.3:1 in area and 1.14:1 in spacing from the first draft, with no
script behind either — the only load-bearing constant in the specification that
had none. Both are used: doc 10 divides by maximum spacing to keep its A*
heuristic admissible, and doc 06 sizes blocks from a mean. This measures the real
spread on the one-shot grid.

**Verifies:**

1. **The spread is real and the measurement is sound.** Every cell's area computed
   two independent ways — a third of each incident triangle, and the exact
   spherical area of the dual polygon. They agree to four decimals at every level
   and both sum to exactly 4π.
2. **It is 1.99:1, not 1.3:1.** Hexagon area ratio rises 1.17 → 1.53 → 1.75 →
   1.87 → 1.93 → **1.96** over levels 2–7, and **2.72:1** counting the pentagons.
   It *rises with level and settles*; the documented figure was a level-2 reading,
   and the design runs at level 11.
3. **The limit is a closed form.** One-shot barycentric is the gnomonic projection
   of a flat face triangle, and gnomonic area scales as `cos³` off the face axis,
   so the ratio is `sec³(θᵥ)` for `θᵥ = 37.3774°`, the angular radius of an
   icosahedron face. Predicted **1.992806**, extrapolated from measurement
   **1.992646**. Depth is not a fix — a face triangle is scale-free, the same
   reason `hexround.js` sees a plateau.
4. **The number doc 10 actually needs.** Against doc 06's nominal `K·R/2^L`, mean
   edge settles at **0.9988** (so the `K` formula is right to 0.12%), min at
   **0.744** at a pentagon, and max at **1.0984**. The admissible A* divisor is
   **10% above nominal**; doc 10 had derived 7% from the old figure and was
   therefore inadmissible.

**Used in:** [doc 02](../docs/02-geometry-choice.md)

---

## `taper.js` — cap the crust, or merge layers?

Cells taper as `(R − h)/R` with depth. Doc 06 caps the crust and raised merging
layers only to decline it; doc 11 carried it as "proposed, never designed". This
prices both sides.

**Verifies:**

1. **The threshold has a measured anchor.** The narrowest cell already on the
   surface is 0.744 of nominal (`uniform.js`), so the taper budget is **25.6% of
   the radius** — doc 06's 85% guess was conservative, so nothing built on it was
   wrong.
2. **The crust cap depends on `D` alone.** `maxCrust = (1 − 0.744)·2^D / K`
   layers — the radius cancels, because block size and radius scale together. At
   `D` 11 that is **435 layers** against the **64** the worked planet uses, 6.8× of
   headroom. Beyond `D` 12 the ID's 512-layer field binds first instead.
3. **Merging buys almost nothing.** One merge lifts reach from 25.6% to 62.8% of
   the radius, but the ID addresses only 512 layers and the unmerged cap is
   already 435 — so it buys **77 layers, 18%**, and every merge after it buys zero.
4. **And costs a seam with no rim.** Cell *centres* nest exactly
   (`oneShot(n/2, i, j)` = `oneShot(n, 2i, 2j)`) but cell *areas* do not, so **one
   fine column in four continues through the shell and three in four terminate**.
   All 41,943,042 of the worked planet's columns cross it, against doc 14's LOD
   seam which is 2.70 faces per *rim* column. Plus the four results invariant 10
   pays for, broken at that depth.

**Used in:** [doc 06](../docs/06-world-sizing.md)

---

## `coords.js` — player-facing coordinates

`x, y, z` answers nothing useful on a sphere, so the readout has to be latitude,
longitude and altitude. That raises three questions the design has to settle.

**Verifies:**

1. **The axis has somewhere principled to go.** Run it through an antipodal
   pentagon pair and all twelve pentagons land at four latitudes: **±90°** (the
   two poles) and **±26.565°** (two rings of five). Identical in every world,
   since no seed can move them.
2. **Two decimals name a cell — on a small planet.** A cell covers `blockSize / R`
   radians, so a small world needs *fewer* digits, not more: **0.0337°** per cell
   on the doc-06 planet against **0.0000165°** on an Earth-sized one. Two decimal
   places against five.
3. **But a rounded readout is not an identity.** Over 20,000 random positions,
   rounding to two decimals lands in the same cell **87.5%** of the time, worst
   miss **0.21 cells** — so always you or a neighbour. Three decimals gives 98.8%.
   Show lat/long; send the cell ID.
4. **The exact form is short.** A `D` 11 address is **27 bits** — six characters
   in base 36, eight with the layer — so a lossless "here" needs no decimal point.
5. **Longitude degrades toward the poles**, as expected: 1° is 29.67 m at the
   equator and 0.52 m at 89° on the worked planet.

**Used in:** [doc 20](../docs/20-player-coordinates.md)

---

## `rotation.js` — directional blocks

Rails, pipes and conveyors store a rotation, and here that has to be an index into
a cell's own neighbour ring rather than a direction in the world. Three things
decide whether that is workable.

**Verifies:**

1. **Aiming at one of six is comfortable everywhere.** Over all 40,950 hexagons at
   level 6, the angular gap between neighbouring directions runs **54.00°** to
   **71.53°**, never more than **11.53°** from an even 60°. So the tightest snap
   wedge on the planet is 54° — **±27° of slack** — and no tolerance needs tuning
   per region.
2. **Most builds never meet a pentagon.** The chance a build of radius `r`
   contains one: **0.009%** at 10 cells, **0.219%** at 50, **0.867%** at 100 (a
   200 m factory), rising to 21.5% at 500. Placement is refused there
   ([doc 17](../docs/17-pentagons.md)) and the detour costs 2–10 m.
3. **The loop slip depends on enclosure alone.** Doc 17 measured circuits drawn
   *around* a pentagon. This carries a heading around **off-centre** loops too: a
   loop of radius 3 or 4 slips **1 index** whenever the pentagon is inside it — at
   centre offsets 1 and 2 — and **0** when it is outside, at offsets 5 and 9. Not
   the width, not the centre, only what is inside. That is the measurement that
   makes "topological" more than a word.
4. **Storage costs nothing new.** Six orientations need 3 bits, and
   [doc 03](../docs/03-addressing.md) already reserves 4 beside a 41-bit address —
   4,096 block types, six orientations, one spare bit, no ID layout change.

**Used in:** [doc 19](../docs/19-directional-blocks.md)

---

## `winding.js` — is the middle-child flip a mirror?

Doc 03 called a middle-descended chunk a "mirrored frame" from the first draft.
That word implies handedness changes, which would reach into meshing, normals and
everything chirality-dependent. This checks what the flip actually is.

**Verifies:**

1. **It is a half turn, not a mirror.** The descent negates *both* axes —
   `i → half−i`, `j → half−j` — so the determinant is `(−1)(−1) = +1`. A
   reflection is −1.
2. **The direction index shifts by a uniform +3.** Measured on the real grid, all
   six directions move by the same amount and the ring is still counter-clockwise
   seen from outside. A reflection would send `k → c − k`, reversing the order and
   leaving two directions fixed; nothing is fixed here.
3. **46% of cells are affected** — 15,104 of 33,153 at `D` 8 / `C` 4, agreeing
   with `qr.js` cell for cell. Note the lattice convention: `qr.js` enumerates
   `i + j ≤ n` and this script's geometry section uses `j ≤ i`. Mixing the two
   miscounts the flips, which is worth knowing before trusting either number.
4. **A second flip that is not geometry at all.** Listed in rising index order,
   the three corner children come out outward-facing and the **middle one comes
   out inward** — a property of the vertex listing, not the shape. The two
   patterns doc 14 actually emits are already right: **36 outward, 0 inward** and
   **28 outward, 0 inward** over a whole face. Reusing one pattern for both is
   what turns half a mesh inside out.

**Used in:** [doc 03](../docs/03-addressing.md)

---

## `boundary.js` — which curve is a cell's edge?

Three definitions were in play: what `hexRound` maps to a cell (doc 04), what is
equidistant on the sphere, and the dual polyhedron's centroid corners (doc 14).
Doc 11 carried the disagreement as the last structural gap. This measures what
actually separates the first from the third.

**Verifies:**

1. **The proposed mechanism does not exist.** Doc 11 guessed circumcentre versus
   centroid. An icosahedron face is equilateral and so is every lattice triangle
   inside it — longest ÷ shortest edge = **1.000000000000** — so the two coincide
   **exactly**.
2. **It is the order of two operations.** The lookup averages the flat lattice
   points and then projects; the mesh projected each point and then averaged.
   Projection does not commute with averaging, which is the same distinction that
   produced `precision.js`'s two-different-spheres finding.
3. **And it vanishes with depth.** The gap **halves every level** — 1.82e-2 of a
   spacing at L2 down to 3.08e-4 at L8, ratio 0.500 — reaching **3.85e-5** at
   L11, or **0.038 mm** on the doc-06 planet. Doc 11's "about 0.1 of a cell" was
   out by **2,600×**; that figure belongs to spherical Voronoi (`hexround.js`),
   which plateaus. The disputed sliver is **0.003%** of a cell at L11.
4. **The fix is free.** A corner is a lattice point of the same construction at
   `3n`: `(3i+2, 3j+1)` for an up-triangle, `(3i+1, 3j+2)` for a down-triangle,
   agreeing with the averaged construction to **3e-8 radians**. One blend and one
   normalise from integers, so doc 14's **2 vertices and 4 triangles per cell**
   does not move.
5. **Neither expected failure happened.** **0 reflex corners** over 351 interior
   cells, and **no seam along the 30 face edges** — the per-face construction
   agrees with itself to **2e-8 radians**, because both faces share the edge whose
   midpoint the boundary crosses.
6. **Every cell is an exactly regular hexagon in its face plane** — corner-to-centre
   and edge length identical to twelve decimals. All of doc 02's 1.99:1 area
   spread is projection, none of it irregularity.

**Used in:** [doc 18](../docs/18-cell-boundary.md)

---

## Standard for new claims

If a number appears in `docs/`, it should either be trivially derivable or have a
script here that produces it. Add the script before adding the number.

And the converse, which is how the gap above went unnoticed: **a script
verifying one step of a pipeline does not verify the pipeline.** `lookup.js`
proving step 1 exact made doc 04 read as verified throughout. Say which step a
script covers, and mark the ones nothing covers.

And the one that cost the most: **an old number is not a verified number.**
1.3:1 sat in eight documents for the whole life of the specification, was cited
between them as though doc 02 had established it, and had never been measured at
all. It was out by 50%, and it had already made doc 10's heuristic inadmissible.
Everything with a script attached survived scrutiny; the one thing without a
script did not. When a document cites another document for a constant, check that
the chain ends at a script rather than at a draft.
