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
| [`lookup.js`](../verification/lookup.js) | — | [04](04-position-lookup.md) |
| [`mesh.js`](../verification/mesh.js) | Meshing and LOD: what a hex surface actually costs, how far a flat patch may span before the sphere's curvature shows, and whether LOD levels share vertices. | [14](14-meshing-and-lod.md) |
| [`order.js`](../verification/order.js) | Can the 4 children of a midpoint-split triangle be visited edge-to-edge? children: T0=(A,ab,ca) T1=(ab,B,bc) T2=(ca,bc,C) T3=(ab,bc,ca) | [03](03-addressing.md) |
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

_12 scripts. Every number above is reproduced by running them._
