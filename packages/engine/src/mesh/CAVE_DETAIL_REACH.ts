/**
 * How many levels coarser than the finest the caves are still carved.
 *
 * **The generator is never told the level** (doc 14, F-032) -- a coarse chunk
 * must hold the heights the fine one holds, or ground moves whenever a chunk
 * changes level. That rule is about heights. Whether the cave pass runs at all
 * is a different question with a different owner: the mesh worker, the one
 * place that knows a chunk's level, hands its coarse generators options with
 * `caves` off -- the same seat `CUTOUT_REACH` gates the leaf holes from.
 *
 * **A coarse cell is wider than a passage, so what a far chunk buys with the
 * walk is not caves.** At the shipped knobs a passage is about ten metres
 * across; a chunk two levels out draws four-metre cells and a passage is two
 * ragged cells there, and the ground over it is unchanged either way -- the
 * sheet hollows below the surface and only a mouth ever shows. What the walk
 * costs is real at every level, because it is one field reading a block down
 * the whole reach (`tools/trial-cave-lod.ts`, the same land generated and
 * meshed at every level, caves to 200 m):
 *
 * | lod | block | generation | triangles |
 * |---|---|---|---|
 * | 0 | 1 m | `2.56x` | `15.1x` |
 * | 2 | 4 m | `2.05x` | `7.9x` |
 * | 5 | 32 m | `2.04x` | `2.9x` |
 *
 * The generation ratio holds near `2x` at every level -- the walk is
 * per-column and columns thin with level, so the share never falls -- and the
 * triangle ratio is the deep sheet meshed in full, sealed pockets included
 * (F-146). Over the 358 chunks a standing player holds, three quarters are
 * coarser than the finest level: gating them takes roughly a quarter off the
 * view's whole generation bill and about two thirds off the extra triangles
 * deep caves put in it, and the chunks it strips are exactly the ones whose
 * cells could not show a passage.
 *
 * **One: the finest two levels.** The finest alone was measured too and the
 * picture pays for it -- a mouth or a pocked cliff face a few hundred metres
 * off sits in a lod-1 chunk, and losing those pulls the visible seam of the
 * gate right up to the player. At lod 1 a cell is two metres and a passage is
 * still four or five cells; from lod 2 out it is two cells or fewer, which is
 * noise wearing a cave's cost. Blocks are in the same cells at every level
 * either way -- this decides only whether the sheet is carved out of them.
 */
export const CAVE_DETAIL_REACH = 1;
