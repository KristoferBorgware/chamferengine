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
 * Measured over a standing player's whole selection at the shipped detail
 * (`tools/trial-cutout-lod.ts`), 301 chunks, three patches of forested ground
 * meshed at every level both ways:
 *
 * | | triangles | | holes kept |
 * |---|---|---|---|
 * | solid leaves | 12,484,664 | `1.000x` | 0% |
 * | **holes at the finest level** | **19,184,104** | **`1.537x`** | **70.2%** |
 * | holes one level out too | 20,531,536 | `1.645x` | 84.3% |
 * | holes at every level | 22,025,996 | `1.764x` | 100% |
 *
 * The finest level is `30.6%` of the chunks and holds `70.2%` of what the
 * holes cost, because it is where the leaves are: a level out the plant pass
 * has already turned two thirds of them into the colour of the ground under
 * them. So stopping here is **12.9%** off the whole selection's geometry for
 * the holes on chunks sixty metres away and further, where a hole is about
 * four pixels wide.
 *
 * **What a coarse leaf becomes is a solid block wearing the leaf picture**,
 * and that reads as foliage rather than as a checkerboard because the bake
 * bleeds the drawn colour into the texels alpha leaves empty. Nothing else
 * changes: the blocks are in the same cells at every level, and this decides
 * only which faces between them are drawn.
 */
export const CUTOUT_REACH = 0;
