/**
 * How many levels coarser than the finest a leaf still shows its own holes.
 *
 * **Zero: the finest level alone.** A cutout leaf draws a face against another
 * leaf and against its own trunk, which a solid one does not, and that is what
 * makes a canopy geometry all the way through rather than a hollow shell with
 * the sky behind it. The holes it pays for are texels, and a level out is a
 * block twice as wide wearing a picture the same size, twice as far away --
 * so what a hole is worth falls off much faster than what it costs.
 *
 * Measured on the same ground at every level, three patches of forested
 * ground meshed both ways (`tools/trial-cutout-lod.ts`): the holes cost
 * `2.45x` the triangles at a 1 m block, `1.45x` at 2 m, `1.32x` at 4 m and
 * `1.05x` at 32 m -- and the leaves themselves thin out as fast, 21,255 cells
 * at 1 m against 7,227 at 2 m and 252 at 32 m, because the plant pass turns a
 * plant under half a block into the colour of the ground under it.
 *
 * Over a real view -- forest, bare rock and ocean, the chunks a standing
 * player actually holds, built rather than extrapolated
 * (`tools/trial-texture-cost.ts`):
 *
 * | | triangles | | uploaded |
 * |---|---|---|---|
 * | solid leaves | 2,393,834 | `1.00x` | 204.7 MB |
 * | **holes at the finest level** | **3,289,810** | **`1.37x`** | 277.2 MB |
 * | holes at every level | 4,005,324 | `1.67x` | 336.2 MB |
 *
 * So stopping at the finest level is **17.9%** fewer triangles in view than
 * cutting out everywhere, and it keeps **55.6%** of what the holes cost --
 * which is the near canopy, the only one whose holes are wider than a pixel.
 * The picture pays almost nothing: a standing view moves by **0.00 of 255**
 * over 511,707 pixels, and from 280 m up over a forest by **1.00 of 255**
 * (5.9% spread, 5th percentile 0.887), only ever darker.
 *
 * **What a coarse leaf becomes is a solid block wearing the leaf picture**,
 * and that reads as foliage rather than as a checkerboard because the bake
 * bleeds the drawn colour into the texels alpha leaves empty. Nothing else
 * changes: the blocks are in the same cells at every level, and this decides
 * only which faces between them are drawn.
 */
export const CUTOUT_REACH = 0;
