# Reference

Every measured number in the specification, and the script that produced it.

> **Generated file. Do not edit.** Rebuild with `node tools/make-reference.js`.
>
> Each section below is the actual output of a verification script, run
> fresh. The prose documents explain *why* these numbers matter; this page
> exists so an agent can look one up without reading the argument around it,
> and so the numbers can never drift from the scripts that prove them.

For invariants, naming conventions and the design rules an implementation
must not break, see [`CLAUDE.md`](../CLAUDE.md). For the reasoning, see the
numbered documents.

---

## Index

| Script | Establishes | Used by |
|---|---|---|
| [`adj.js`](../verification/adj.js) | — | [05](05-face-adjacency.md) |
| [`calc.js`](../verification/calc.js) | — | [06](06-world-sizing.md) |
| [`check.js`](../verification/check.js) | verify the rhombic triacontahedron construction before putting it in the artifact | [02](02-geometry-choice.md) |
| [`frame.js`](../verification/frame.js) | Gravity and orientation: the local frame, its holonomy, and what the grid's 720 degrees does to direction indices. | [13](13-gravity-and-orientation.md) |
| [`hexround.js`](../verification/hexround.js) | Does rounding a barycentric triple actually give the CONTAINING cell? On a flat triangular lattice the Voronoi cell of a lattice point is the hexagon, exactly. The real cells are Voronoi regions ON THE SPHERE of the same lattice radially projected outward, and gnomonic projection preserves straight lines but not equidistance -- so the two Voronoi diagrams need not agree. This measures whether they do. | [04](04-position-lookup.md) |
| [`light.js`](../verification/light.js) | Lighting on a hex sphere: what 8 neighbours cost, why sky light is still one downward pass, and what a sun direction buys for free. | [16](16-lighting.md) |
| [`lookup.js`](../verification/lookup.js) | — | [04](04-position-lookup.md) |
| [`mesh.js`](../verification/mesh.js) | Meshing and LOD: what a hex surface actually costs, how far a flat patch may span before the sphere's curvature shows, and whether LOD levels share vertices. | [14](14-meshing-and-lod.md) |
| [`order.js`](../verification/order.js) | Can the 4 children of a midpoint-split triangle be visited edge-to-edge? children: T0=(A,ab,ca) T1=(ab,B,bc) T2=(ca,bc,C) T3=(ab,bc,ca) | [03](03-addressing.md) |
| [`precision.js`](../verification/precision.js) | Floating-point precision at planet scale: what a float can resolve, where the ID->position conversion loses accuracy, and how much a chunk-local origin buys back. | [15](15-precision-and-origin.md) |
| [`qr.js`](../verification/qr.js) | walk (i,j) at depth D down C levels -> path digits + leftover (q,r) + orientation | [03](03-addressing.md) |
| [`s2.js`](../verification/s2.js) | — | [01](01-prior-art.md) |
| [`scale.js`](../verification/scale.js) | — | [06](06-world-sizing.md) |
| [`seam.js`](../verification/seam.js) | What actually happens at a chunk boundary when the two sides are at different LOD and one of them has caves. Doc 14 said "a skirt one coarse cell deep"; this checks whether that is enough once a rim column has more than one solid span, and what does close the remaining holes. | [14](14-meshing-and-lod.md) |
| [`volume.js`](../verification/volume.js) | Meshing terrain that is GENERATED, not stored. Doc 08 makes terrain a pure function of position -- a height-field term, optionally plus a density-field term for caves -- and doc 14's cost model quietly assumed the first, on a smooth sphere. This measures relief, caves, and what generation costs. | [08](08-terrain-generation.md) [14](14-meshing-and-lod.md) |

---

## `adj.js`

Cited by [doc 05](05-face-adjacency.md).

```
face  edge0            edge1            edge2
  0 -> f 4 e2 rev  -> f 6 e0 rev  -> f 1 e0 rev
  1 -> f 0 e2 rev  -> f 5 e0 rev  -> f 2 e0 rev
  2 -> f 1 e2 rev  -> f 9 e0 rev  -> f 3 e0 rev
  3 -> f 2 e2 rev  -> f 8 e0 rev  -> f 4 e0 rev

60 entries · every edge matched: true
all reversed (consistent winding): true
bytes at 3 fields x 1 byte: 180
```

## `calc.js`

Cited by [doc 06](06-world-sizing.md).

```
constant K = 1.20459
R=10000 L=13  exact d=1.470  formula d=1.470
R=6371000 L=10  exact d=7494.579  formula d=7494.579
R=1700 L=11  exact d=1.000  formula d=1.000

target R=1604m  L exact=10.92 -> 11  snapped R=1700m
circumference=10.68km  walk=2.12h  cells=41,943,042
```

## `check.js`

verify the rhombic triacontahedron construction before putting it in the artifact

Cited by [doc 02](02-geometry-choice.md).

```
edges: 30 each with 2 faces: true
max non-planarity (should be ~0): 8.095e-18
diagonal ratio min/max: 1.618034 1.618034  phi = 1.618034
RT defect: 20*(360-3*116.565) + 12*(360-5*63.435) = 720.00
```

## `frame.js`

Gravity and orientation: the local frame, its holonomy, and what the grid's 720 degrees does to direction indices.

Cited by [doc 13](13-gravity-and-orientation.md).

```
1. parallel transport around a circle of colatitude t (unit sphere)
   (holonomy is an angle mod one full turn, so both are compared mod 360)
   colat   holonomy   solid angle 2pi(1-cos t)   diff
     10deg     5.4692deg         5.4692deg   -8.80e-10
     30deg    48.2309deg        48.2309deg    -6.39e-9
     60deg   180.0000deg       180.0000deg    -1.11e-8
     90deg     0.0000deg       360.0000deg    5.68e-14
    120deg   180.0000deg       540.0000deg     1.11e-8

2. the 720deg, two ways  (cells = vertices of the subdivided icosahedron)
   L   cells  pent  GEOMETRIC defect/pentagon   720/N    total     COMBINATORIAL 6-deg  total
   1      42    12       15.6901deg  17.1429deg   720.000deg            1 unit     720deg
   2     162    12        3.3420deg   4.4444deg   720.000deg            1 unit     720deg
   3     642    12        0.7429deg   1.1215deg   720.000deg            1 unit     720deg
   4    2562    12        0.1740deg   0.2810deg   720.000deg            1 unit     720deg
   5   10242    12        0.0421deg   0.0703deg   720.000deg            1 unit     720deg
   geometric defect shrinks ~4x per level; the combinatorial unit never does.

3. walk the ring of one cell, carrying a direction index (level 4)
   around each of the 12 pentagons: slip = 1 index  (= 60 deg)
   around all 2490 pentagon-free hexagons:  slip = 0 index
   12 pentagons x 60deg = 720deg  -- Gauss-Bonnet, in direction-index units
   pentagon interior angle between adjacent directions: 71.965deg
   so a line entering a pentagon deflects by 36.070deg either way -- straight is not an option

4. antipodal structure of the pentagons
   every icosahedron vertex has its negation as a vertex: true
   -> the 12 pentagons form 6 antipodal pairs: 0-3 1-2 4-7 5-6 8-11 9-10
   so a lat/long axis can be chosen through a pentagon pair: the two
   coordinate poles then land exactly on two of the twelve pentagons.

5. consequences on the doc-06 planet (R = 1700 m, 1 m blocks)
   separation   relative tilt of "up"
         1 m   0.034deg
        10 m   0.337deg
        50 m   1.685deg
       100 m   3.370deg
       500 m   16.852deg
      1000 m   33.703deg
   eye height   horizon distance   (Earth, R = 6371 km)
       1.7 m       76 m            4.7 km
        10 m      184 m            11.3 km
        50 m      407 m            25.2 km
       200 m      787 m            50.5 km
   D=11 C=4: chunk spans 128 cells -> "up" varies 4.314deg across it
   D=11 C=6: chunk spans 32 cells -> "up" varies 1.079deg across it
   D=11 C=8: chunk spans 8 cells -> "up" varies 0.270deg across it
```

## `hexround.js`

Does rounding a barycentric triple actually give the CONTAINING cell? On a flat triangular lattice the Voronoi cell of a lattice point is the hexagon, exactly. The real cells are Voronoi regions ON THE SPHERE of the same lattice radially projected outward, and gnomonic projection preserves straight lines but not equidistance -- so the two Voronoi diagrams need not agree. This measures whether they do.

Cited by [doc 04](04-position-lookup.md).

```
does hexRound return the cell whose centre is nearest on the sphere?
  hexRound finds the nearest lattice point in the FLAT face plane. Whether
  that is also the nearest ON THE SPHERE is the open question from doc 11,
  because gnomonic projection keeps straight lines but not equidistance.

   L   cells   samples   mismatches      rate   worst margin   furthest off
   2     162     40000         1423    3.558%        0.10795       1.043 cells
   3     642     40000          823    2.058%        0.08750       1.084 cells
   4    2562     25000          371    1.484%        0.07123       1.095 cells
   5   10242     15000          171    1.140%        0.07072       1.082 cells
   6   40962     12000          148    1.233%        0.06305       1.083 cells
   7  163842      5000           70    1.400%        0.05138       1.088 cells

  margin       = how much further hexRound's cell is than the true nearest,
                 as a fraction of one cell spacing
  furthest off = distance between the two cells; 1.0 means edge-adjacent

  RESULT: hexRound and nearest-centre-on-the-sphere DISAGREE, and the rate
  settles near 1% instead of falling to zero: 3.56% -> 2.06% -> 1.48% -> 1.14% -> 1.23% -> 1.40%
  (the last three levels are sampling-limited, +/- 0.1 to 0.2 points, so read
  them as a plateau around 1% rather than as a trend)
  It plateaus because a face triangle's shape is scale-free: refining shrinks
  the cells and the disagreement band together, so their ratio holds.

  But every disagreement is small and local:
    - the two cells are always EDGE-ADJACENT (worst separation 1.095 spacings)
    - hexRound's cell is at most 0.1079 of a spacing further away
    - mean overshoot among disagreements is 0.0215 of a spacing
  So a point is only ever handed to a neighbour when it sits within about a
  tenth of a cell of the boundary between them.

  READ THIS THE OTHER WAY UP. hexRound is a pure function of position, so it
  already defines a partition of the sphere: exact, gap-free, overlap-free,
  and edge-adjacent everywhere. It is the radial projection of the PLANAR
  Voronoi diagram. That partition is not wrong -- it is simply a different
  definition of "the cell" from spherical Voronoi, and the two differ by at
  most 0.108 of a cell.

  The design decision is therefore which one is normative, not which one is
  correct. Defining cells as the projected planar Voronoi diagram makes doc 04
  exact by construction and doc 09's straight-line ray walk exact as well.
  Defining them as spherical Voronoi makes both approximate by ~1%. Doc 14
  meshes a third thing again -- the dual polyhedron's corners -- so the
  specification currently implies three boundaries that agree only to ~0.1
  of a cell. Pick one and say so.
```

## `light.js`

Lighting on a hex sphere: what 8 neighbours cost, why sky light is still one downward pass, and what a sun direction buys for free.

Cited by [doc 16](16-lighting.md).

```
1. neighbour count, and where the sphere shows through
   lateral neighbours: 2550 cells have 6, 12 cells have 5
   plus up and down, always -- the radial axis never branches
   so a cell has 8 neighbours, and exactly 12 cells in the world have 7.
   A cube voxel has 6. Light is a scalar, so degree is the ONLY thing that
   changes: no direction is carried, so holonomy and the pentagon direction
   deficit from doc 13 do not apply to light at all.

2. one torch at full brightness, in open air
   light level 15, dropping 1 per step
   hex prism grid: 7,471 cells reached
   cube grid:      4,991 cells reached
   ratio: 1.497x  -- the cost of 6 lateral neighbours
   (a hex disk of radius r holds 3r^2+3r+1 cells against 2r^2+2r+1 on squares,
    so the ratio tends to 1.5 as the light range grows)
   BFS on the real level-7 grid, one layer, 19+ cells from any pentagon:
   721 cells within 15 steps; closed form 3r^2+3r+1 = 721 -- exact match

3. a torch standing on a pentagon
   from a hexagon:  721 cells lit   (closed form 1 + 3r(r+1) = 721)
   from a pentagon: 601 cells lit   (closed form 1 + 5r(r+1)/2 = 601)
   identical at all 12 pentagons: true
   ratio 0.8336 at range 15, tending to 5/6 = 0.8333 as range grows

   Read that carefully, because the obvious reading is wrong. The light is
   NOT dimmer at a pentagon and needs no special case. A ring at radius k
   holds 5k cells instead of 6k, so there is simply 1/6 LESS WORLD within
   reach. Every cell that exists gets exactly the light level it should.
   This is Gauss-Bonnet once more: a cone point has less area inside a given
   radius. Compare doc 13, where the same 60deg costs a direction index
   forever -- here it costs nothing at all, because light carries no direction.

4. sky light, and why the sphere does not make it harder
   Sky light travels along -up, which is radial. The tessellation is
   identical at every layer (invariant 10), so a column IS a straight line
   of cells sharing one address. Sky light is therefore exactly as cheap as
   it is in a flat world: one downward pass per column, no face crossing.

   per chunk at D=11 C=6, 64 layers: 561 columns, 35,904 voxels
   light at 1 byte per cell (4 bits sky + 4 block): 35 KB
   block data at 2 bits per cell (doc 07):           9 KB
   light costs 4x the blocks it lights.

   But sky light down a column is MONOTONE -- full until the first solid
   cell, then attenuating. Store the depth it reaches, one byte per column:
   sky light per cell:   18 KB
   sky light per column: 0.5 KB   -- 32x smaller
   That trick needs columns to be straight, which is invariant 10 again.

5. day and night from one dot product
   A cell is lit when dot(sunDirection, up) > 0. up is per-cell and already
   computed for gravity (doc 13), so a real terminator costs one dot product
   per cell and no shadow map at all.

   R = 1700 m, circumference 10681 m
   day length      terminator speed   vs a walking player (1.4 m/s)
     10 min          17.80 m/s   12.7x faster -- dawn overtakes you
     20 min           8.90 m/s   6.4x faster -- dawn overtakes you
     1 hour           2.97 m/s   2.1x faster -- dawn overtakes you
     2.12 h           1.40 m/s   1.0x faster -- dawn overtakes you
    6 hours           0.49 m/s   2.8x slower -- you can outrun it
   24 hours           0.12 m/s   11.3x slower -- you can outrun it

   The terminator moves at exactly walking pace when the day lasts
   2.12 hours -- which is doc 06's circumnavigation time, by construction.
   That is the natural anchor: pick the day length in units of "how long it
   takes to walk around", and you have chosen whether players can chase sunset.

   Twilight, taken as 12deg of sun elevation:
   band width on the ground: 356 m  (3.3% of the circumference)
   duration with a 20 min   day: 40 s
   duration with a 2.12 h   day: 4.2 min
   duration with a 24 hours day: 48.0 min
   Twilight duration is a fixed FRACTION of the day and does not depend on
   the planet's size at all -- it is an angle, not a distance.

6. long shadows meet a short horizon
   Shadow length is h / tan(elevation). On a 1700 m planet the ground horizon
   from a 1.7 m eye is only 76 m (doc 13), so near sunrise a shadow
   runs off the edge of the visible world.

   sun elevation   shadow of a 10 m tower   past the 76 m horizon?
           45deg                     10 m   no
           20deg                     27 m   no
           10deg                     57 m   no
            5deg                    114 m   yes
            2deg                    286 m   yes
            1deg                    573 m   yes
   So a shadow-casting scheme only ever has to reach about 76 m before the
   curvature hides the rest. The small planet bounds the shadow budget the
   same way it bounds the render budget.

7. re-lighting after one block changes
   Worst case is removing a block that was blocking a full-strength light:
   the flood fill can touch every cell within 15 steps, 7,471 of them.
   In practice the fill stops at solid cells, and doc 14 already measured
   that real terrain is mostly solid below the surface.

   light range   cells possibly touched   vs a cube world
             4                      189 1.465x
             8                    1,241 1.490x
            15                    7,471 1.497x
   Shortening the light range is the cheapest lever: cost grows as the cube
   of it. Range 8 costs 83% less than range 15.
```

## `lookup.js`

Cited by [doc 04](04-position-lookup.md).

```
argmax-centroid picks the containing face: 200000/200000 correct  (0 mismatches)
```

## `mesh.js`

Meshing and LOD: what a hex surface actually costs, how far a flat patch may span before the sphere's curvature shows, and whether LOD levels share vertices.

Cited by [doc 14](14-meshing-and-lod.md).

```
1. cost of a fully exposed surface, per cell  (caps only, vertices shared)
   L   cells   dual verts (hex corners)   cap triangles   verts/cell  tris/cell
   1      42             80             156        1.905      3.714
   2     162            320             636        1.975      3.926
   3     642           1280            2556        1.994      3.981
   4    2562           5120           10236        1.998      3.995
   5   10242          20480           40956        2.000      3.999
   closed form: dual verts = 2V-4, cap triangles = 4V-12  ->  2 and 4 per cell
   a square grid with every top exposed costs 1 vertex and 2 triangles per cell,
   so an UNMERGED hex surface is exactly 2x a cube one -- not the disaster
   it is usually described as. The gap is entirely about merging.

2. side faces of vertically stacked cells
   max deviation from a single plane over 3 layers: 1.49e-16 (radii)
   they are coplanar -- a run of exposed side faces down a column merges into
   ONE quad, exactly, at no geometric cost. Vertical merging is free.

3. flat-patch sag on a 1,700 m planet with 1 m blocks
   patch span   sag (exact)   s^2/8R   cells across
         8 m      0.0047 m   0.0047 m           8
        16 m      0.0188 m   0.0188 m          16
        32 m      0.0753 m   0.0753 m          32
        37 m      0.1007 m   0.1007 m          37
        64 m      0.3012 m   0.3012 m          64
       128 m      1.2046 m   1.2047 m         128
   sag = 10% of a block  ->  patch may span 37 m
   sag = 25% of a block  ->  patch may span 58 m
   merging is limited by curvature, not by the algorithm. A chunk at C=6
   spans 32 cells, which sits just inside the 10%-of-a-block limit.

4. LOD boundaries: is a coarse hexagon corner also a fine one?
   coarse corners: 1280   fine corners: 5120
   nearest-fine-corner distance: mean 0.72% max 0.97% of coarse cell spacing
   near-coincident but NOT exact: the middle child of a split shares its
   parent triangle's centroid only when the triangle is equilateral, and
   subdivided triangles are not. But the mismatch is under 1% of a cell,
   so the SPHERE contributes almost nothing to an LOD seam. See section 5.

5. LOD seam depth: the same terrain sampled one level apart
   60 m of relief, D = 11, 1 m blocks on a 1700 m planet
   level  spacing   coarse   mean |dh|   max |dh|   covered by a 1-cell skirt?
      11    1.00 m    2.0 m     0.263 m     1.517 m                yes
      10    2.00 m    4.0 m     0.525 m     3.197 m                yes
       9    4.00 m    8.0 m     1.041 m     6.760 m                yes
       8    8.00 m   16.0 m     1.998 m    12.840 m                yes
       7   16.00 m   32.0 m     3.600 m    19.894 m                yes
   every level covered: true
   a skirt one coarse cell deep covers the worst case at every level,
   and costs 2 triangles per boundary cell. Cheaper than stitching, and
   it does not care which level the neighbour chose.

6. visible cells by altitude (R = 1700 m, full depth D = 11)
   altitude   horizon   cells at D=11   cap tris   finest level within 2M tris
      1.7 m      76 m         20,951      0.08M                         11
       10 m     184 m        122,640      0.49M                         11
       50 m     407 m        599,186      2.40M                         10
      200 m     787 m      2,207,529      8.83M                          9
      850 m    1.4 km      6,990,507     27.96M                          9
     1700 m    1.8 km     10,485,761     41.94M                          8
   at eye height the whole visible world is ~21k cells / 84k triangles.
   the near field needs no merging at all; the horizon already did that job.
```

## `order.js`

Can the 4 children of a midpoint-split triangle be visited edge-to-edge? children: T0=(A,ab,ca) T1=(ab,B,bc) T2=(ca,bc,C) T3=(ab,bc,ca)

Cited by [doc 03](03-addressing.md).

```
T0 -> T3
T1 -> T3
T2 -> T3
T3 -> T0,T1,T2

best ordering: T0 -> T1 -> T3 -> T2 | adjacent steps: 2 of 3
```

## `precision.js`

Floating-point precision at planet scale: what a float can resolve, where the ID->position conversion loses accuracy, and how much a chunk-local origin buys back.

Cited by [doc 15](15-precision-and-origin.md).

```
0. the arithmetic behind "float32 carries about 7 significant digits"
   layout: 1 sign + 8 exponent + 23 stored mantissa bits.
   an implicit leading 1 makes the significand 24 bits, and
   24 * log10(2) = 7.2247 decimal digits.
   every float is +/- 1.f x 2^e with 1.f in [1,2), so the exponent slides a
   FIXED ladder of rungs along the number line: the count never changes and
   the spacing scales with the magnitude.

        for x in [2^e, 2^(e+1)):   gap = 2^(e-23)

   R              2^e         e    gap = 2^(e-23)   measured
        1700         1024    10      122.070 um   122.070 um
       10000         8192    13      976.563 um   976.563 um
     6371000      4194304    22      500.000 mm   500.000 mm

   at Earth radius: 6371000 lies in [2^22, 2^23) = [4194304, 8388608),
   so the gap is 2^(22-23) = 0.5 m. The neighbouring representable values are
   6370999.5, 6371000, 6371000.5
   Counting digits agrees: 6371000 is 7 digits and lands ON the metres
   column; 6371000.5 would need 8; 7.22 digits is what buys the half.
   So it is not that metres are unrepresentable -- it is that nothing BELOW
   a metre is.

   gap >= t  means  e >= 23 + log2(t), and e is an integer, so every
   threshold crossing snaps to a binade boundary:
      gap >= 1 mm   at e = 14  ->  R = 2^14 = 16,384 m
      gap >= 1 cm   at e = 17  ->  R = 2^17 = 131,072 m
      gap >= 10 cm  at e = 20  ->  R = 2^20 = 1,048,576 m
      gap >= 1 m    at e = 23  ->  R = 2^23 = 8,388,608 m

1. spacing between adjacent representable positions, at distance R from the origin
   (a world position IS that distance from the centre, so this is the resolution
    of every position on the surface of a planet of radius R)

   planet                       R          float32          float64   f32 vs 1 m block
   doc-06 worked example       1700 m   122.070 um         0.000 nm   fine (8192 per block)
   10 km planet               10000 m   976.563 um         0.002 nm   fine (1024 per block)
   100 km moon               100000 m     7.813 mm         0.015 nm   visible jitter (128 per block)
   1000 km dwarf            1000000 m    62.500 mm         0.116 nm   coarse (16 per block)
   Earth                    6371000 m   500.000 mm         0.931 nm   2 positions per block -- no sub-block detail
   Jupiter                 69911000 m      8.000 m        14.901 nm   ONE position per 8 blocks

2. the radius at which float32 position spacing first exceeds a threshold
   threshold        radius            i.e.
    0.1 mm       1.024e+3 m   1 km
      1 mm       1.638e+4 m   16 km
      1 cm       1.311e+5 m   131 km
     10 cm       1.049e+6 m   1049 km
       1 m       8.389e+6 m   8389 km
   Thresholds land on powers of two because the spacing is 2^(e-23) for R in
   [2^e, 2^(e+1)). float32 holds sub-millimetre precision out to a 16 km planet
   and has no sub-block detail left at all by Earth radius.

3. one-shot barycentric vs recursive midpoint subdivision
   docs 02 and 03 describe the sphere as a "recursively subdivided icosahedron";
   docs 04 and 09 require the one-shot lattice (uniform in the face plane).
   These are different point sets. Deviation as a fraction of cell spacing:

   L    cells    spacing (R=1700)   max deviation   as % of spacing
   1       42        1023.90 m        0.000 nm             0.0%
   2      162         511.95 m        38.966 m             7.6%
   3      642         255.98 m        38.966 m            15.2%
   4     2562         127.99 m        38.966 m            30.4%
   5    10242          63.99 m        39.420 m            61.6%
   6    40962          32.00 m        39.420 m           123.2%
   7   163842          16.00 m        39.435 m           246.5%

   closed form for the worst point (the quarter point of a base edge):
   icosahedron edge subtends 63.4349deg; at t = 1/4 the two rules place it at
   14.5454deg (one-shot, equal chord) vs 15.8587deg (recursive, equal arc)
   = 1.3133deg apart = 38.966 m on the doc-06 planet.

   The gap is FIXED IN METRES and does not shrink with level, so as a fraction
   of a cell it GROWS without bound. These are two different tilings, not two
   roundings of one. At level 11 the two spheres disagree by 39 cells.
   Doc 04 (hexRound) and doc 09 (gnomonic straightness) both require one-shot,
   so one-shot is the construction; "recursively subdivided" is loose wording.

4. ID -> position, worst error over 20,000 sampled cells
   The path walk is integer arithmetic, so the only floating-point work is
   one barycentric blend and one normalise, at any depth.

   depth    float64 (R=1700)   float32 (R=1700)   float32 on an Earth-sized world
       4           0.000 nm         155.512 um     582.805 mm
       8           0.000 nm         212.784 um     797.441 mm
      11           0.000 nm         206.328 um     773.244 mm
      13           0.000 nm         211.740 um     793.528 mm
      16           0.000 nm         205.873 um     771.540 mm
      20           0.000 nm         197.832 um     741.403 mm
      23           0.000 nm         192.694 um     722.148 mm
   Error is flat in depth: the path walk is integers, and the float work is
   one blend plus one normalise however deep the world goes. Nothing accumulates.

5. "up" is a direction, and directions are precision-robust
   up = normalize(position). The normalise divides out the magnitude, so the
   ANGLE survives even where the position itself has collapsed.

   planet             float32 position error   float32 "up" error   as a distance on the surface
   doc-06 worked example            36.863 um            3.99e-3"      32.849 um
   10 km planet                 202.922 um            3.99e-3"     193.227 um
   100 km moon                    3.326 mm            4.98e-3"       2.415 mm
   1000 km dwarf                 16.902 mm            4.59e-3"      22.234 mm
   Earth                        101.807 mm            4.59e-3"     141.653 mm
   Jupiter                         2.396 m            6.03e-3"        2.042 m
   Position degrades linearly with R. The direction does not degrade at all.

6. chunk-local coordinates, D = 11, 1 m blocks
   Offsets are bounded by the chunk span, so float32 resolves them finely
   no matter how big the planet is.

   chunk level   cells across   span      float32 resolution inside the chunk
   C =  4            128     128 m      15.259 um
   C =  6             32      32 m       3.815 um
   C =  8              8       8 m     953.674 nm
   C = 10              2       2 m     238.419 nm

   the same, for an Earth-sized world at 1 m blocks (D = 23):
   C = 16            128     128 m      15.259 um
   C = 18             32      32 m       3.815 um
   C = 20              8       8 m     953.674 nm

7. rebase frequency for a player walking at 1.4 m/s
   anchor          span      one crossing every
   cell (D=11)        1 m   0.7 s
   chunk C=8          8 m   5.7 s
   chunk C=6         32 m   22.9 s
   chunk C=4        128 m   1.5 min
   Re-anchoring is renormalising an integer and a small offset: no world shift,
   no traversal of live objects, nothing to schedule.
```

## `qr.js`

walk (i,j) at depth D down C levels -> path digits + leftover (q,r) + orientation

Cited by [doc 03](03-addressing.md).

```
round-trip: 33153/33153 exact
leftover q,r range 0..16  (chunk side = 16)
15104 of 33153 points sit in a flipped (middle-child) frame
```

## `s2.js`

Cited by [doc 01](01-prior-art.md).

```
linear     ratio 5.114  total/4pi 1.000000
quadratic  ratio 2.056  total/4pi 1.000000
tangent    ratio 1.406  total/4pi 1.000000
```

## `scale.js`

Cited by [doc 06](06-world-sizing.md).

```
  L       cells   Earth spacing    10km-planet spacing
  0          12       7005.8 km              11.0 km
  1          42       3744.7 km               5.9 km
  2         162       1906.7 km               3.0 km
  3         642        957.8 km               1.5 km
  4       2,562        479.5 km              752.6 m
  5      10,242        239.8 km              376.4 m
  6      40,962        119.9 km              188.2 m
  7     163,842         60.0 km               94.1 m
  8     655,362         30.0 km               47.1 m
  9     2.62e+6         15.0 km               23.5 m
 10     1.05e+7          7.5 km               11.8 m
 11     4.19e+7          3.7 km                5.9 m
 12     1.68e+8          1.9 km                2.9 m
 13     6.71e+8         936.8 m                1.5 m
 14     2.68e+9         468.4 m              73.5 cm
 15    1.07e+10         234.2 m              36.8 cm
 16    4.29e+10         117.1 m              18.4 cm
 17    1.72e+11          58.6 m               9.2 cm
 18    6.87e+11          29.3 m               4.6 cm
 19    2.75e+12          14.6 m               2.3 cm
 20    1.10e+13           7.3 m               1.1 cm

bit budget, 64-bit id: 5 bits face + 2 bits/level -> 29 levels max
storage at 1 byte/cell, level 15: 10.7 GB
```

## `seam.js`

What actually happens at a chunk boundary when the two sides are at different LOD and one of them has caves. Doc 14 said "a skirt one coarse cell deep"; this checks whether that is enough once a rim column has more than one solid span, and what does close the remaining holes.

Cited by [doc 14](14-meshing-and-lod.md).

```
A chunk rim where the neighbour is one LOD coarser.
Fine side: full density field (freq 140, strength 26) -- has caves.
Coarse side: height-field term only, resampled one coarse cell away.

  coarse   rim      spans   columns with   cave     holes: own-margin   +skirt   seam-owned
  cell     columns  /col    >1 span        mouths
     2 m       385   1.086             31      969              1041      961            0
     4 m       385   1.086             31      973              1048      938            0
     8 m       385   1.086             31      969              1050      891            0

  own-margin  = each side trusts its own generator past the boundary.
                Neither emits anything, so every disagreement is a hole.
  +skirt      = same, plus a curtain one coarse cell deep from the top
                surface. It closes the surface slit and nothing else.
  seam-owned  = the finer chunk emits a face wherever its solidity differs
                from the coarse neighbour's. Zero holes, by construction.

Why the skirt alone is not enough:
  coarse cell   2 m: 961 of 969 cave mouths (99%) sit deeper than the skirt reaches; deepest is 15 layers below the surface.
  coarse cell   4 m: 938 of 973 cave mouths (96%) sit deeper than the skirt reaches; deepest is 15 layers below the surface.
  coarse cell   8 m: 891 of 969 cave mouths (92%) sit deeper than the skirt reaches; deepest is 15 layers below the surface.
  A skirt hangs DOWN from the top surface. A cave mouth is a HORIZONTAL
  hole in the boundary plane, often far below it. The two do not meet.

Cost of the fine chunk owning the seam:
  1041 boundary faces over 385 rim columns = 2.70 per column,
  plus ONE height-field evaluation per rim column to learn where the
  coarse neighbour put its surface. Both are negligible against the
  1.09 spans and ~12 faces per column the chunk already emits.
```

## `volume.js`

Meshing terrain that is GENERATED, not stored. Doc 08 makes terrain a pure function of position -- a height-field term, optionally plus a density-field term for caves -- and doc 14's cost model quietly assumed the first, on a smooth sphere. This measures relief, caves, and what generation costs.

Cited by [doc 08](08-terrain-generation.md), [doc 14](14-meshing-and-lod.md).

```
1. how far away can you SEE something, versus where the ground ends
   R = 1700 m, eye 1.7 m. Ground horizon = 76 m.
   peak height   visible from   visible cells within that range   x ground-only
           0 m           76 m                            20,951            1.0x
          10 m          260 m                           244,673           11.7x
          30 m          393 m                           558,028           26.6x
          60 m          521 m                           977,791           46.7x
         120 m          697 m                         1,736,972           82.9x
         300 m        1.02 km                         3,657,222          174.6x
   a 60 m hill is visible from 7x further than flat ground, and the cells
   inside that radius are ~46x the ground-horizon count. Doc 14's 21,000
   is the count for a SMOOTH sphere and is a floor, not a budget.

2. exposed faces per column -- doc 08's HEIGHT FIELD term alone
   surfaceRadius = R(1 + amp*fbm(dir)), one evaluation per column, no caves
   (patch of 765 cells)
   relief   mean |slope|   cap   side faces   side QUADS after merge   tris/column
      0 m         0.000  1.00         0.00                    0.00          4.00
     10 m         0.607  1.00         1.74                    1.55          7.11
     30 m         1.801  1.00         5.17                    2.36          8.71
     60 m         3.587  1.00        10.29                    2.62          9.25
    120 m         7.175  1.00        20.59                    2.74          9.48
   raw side faces explode with relief, but each unbroken run collapses to
   ONE quad, so the triangle count barely moves. Vertical merging is what
   keeps a volume affordable -- without it this table is the cost.

3. adding doc 08's DENSITY FIELD term: (surfaceRadius - |p|) + noise3D*strength
   64 layers under 30 m of relief. Feature size = R/freq, and enclosed
   voids need amplitude/feature > 1 -- otherwise the bias term always wins.
   freq  strength  feature  gradient   cave cells   spans/column   faces/column
     40         0     42.5m      0.00            0          1.000            1.0
     40        26     42.5m      0.31            0          1.000           10.1
    140        26     12.1m      1.07           64          1.084           12.0
    220        26      7.7m      1.68          186          1.243           11.6
    140        40     12.1m      1.65          185          1.242           17.5
   freq 40 carves nothing at all -- gradient 0.31, the bias always wins.
   Only the high-frequency rows make real voids, and those are what drive
   both the face count and the multi-span columns the skirt has to handle.

4. the smallest feature each level can still represent
   level   cell spacing   a 3 m cave   a 10 m canyon   a 40 m valley
      11        1.00 m     survives        survives        survives
      10        2.00 m         GONE        survives        survives
       9        4.00 m         GONE        survives        survives
       8        8.00 m         GONE            GONE        survives
       7       16.00 m         GONE            GONE        survives
       6       32.00 m         GONE            GONE            GONE
   a coarse mesh cannot show a cave narrower than two of its cells, so
   interior geometry must not be LOD-ed at all -- it is culled by being
   enclosed, which is free and exact, rather than simplified.

5. noise evaluations to generate one chunk (D = 11, C = 6, 64 layers)
   LOD   columns   height field   + density, full crust   + density, band only
      -0       561          2,805                  146,421                  74,613
      -1       153            765                   39,933                  20,349
      -2        45            225                   11,745                   5,985
      -3        15             75                    3,915                   1,995
   the density field is 51x the height field over a full crust,
   and 26x when restricted to a band around the surface.
   Each LOD step drops the columns 4x, so it cuts generation as well as
   drawing -- and since a coarse chunk cannot show a cave anyway (section 4),
   far chunks can skip the density term entirely and run height field only.
   That makes a LOD-2 chunk 332x cheaper to generate than a near one.
```

---

_15 scripts. Every number above is reproduced by running them._
