/**
 * One patch of the world as blocks, one byte each.
 *
 * **Four kinds and not two.** Air and cave are both empty, and they are kept
 * apart because the two views draw opposite halves of the world and because a
 * cave that has broken through to the sky is a mouth worth counting. What the
 * cliffs-and-overhangs layer took is a third thing again: it is also empty, it
 * is also under the ground the map drew, and it is not a cave -- charging its
 * blocks to the caves would make every cave number a number about two layers.
 */
export const AIR = 0;
export const ROCK = 1;
export const VOID = 2;
export const CUT = 3;

/**
 * The most block layers a column is ever walked.
 *
 * A passage may be at any depth, so the walk is one field reading a block and
 * there is no fill to fall back on -- which is what makes the depth a knob
 * rather than the world's own crust. This is the ceiling on that knob however
 * small the blocks get.
 */
export const MAX_CAVE_LAYERS = 512;

/**
 * The most blocks a patch is ever walked and drawn, columns times layers.
 *
 * **This is a budget for the picture, and it bounds no knob.** How deep the
 * planet's caves run is `caveDepth`, a world knob `TerrainGenerator` reads;
 * how deep this bench can afford to draw is a separate question. Tying the
 * slider's own end to this number made the second answer overwrite the first
 * -- open the bench on a finely cut patch and the world you carried in came
 * back with `8 m` caves in it, because the settle order let a view budget win
 * against the planet. The walk now takes as many layers as this allows, the
 * readout says how deep it got and what to move, and the knob keeps the range
 * the world gives it.
 *
 * **Two sliders multiply, and neither of them alone is the bill.** How wide the
 * patch is, how finely it is cut and how far the caves reach are three knobs
 * over one number, and a reader who moves them one at a time never sees the
 * product. One step of **Block detail** is four times the columns, so it spends
 * the budget four times faster than anything else on the page.
 *
 * **Measured at the bench's own opening patch** of `12,481` columns
 * (`tools/trial-cave-load.ts`), against the reach asked for:
 *
 * | reach | blocks | triangles | mesh |
 * |---|---|---|---|
 * | `28 m` | 349,468 | 114,574 | `179 ms` |
 * | `100 m` | 1,248,100 | 391,716 | `670 ms` |
 * | **`200 m`** | **2,496,200** | **708,356** | **`1,370 ms`** |
 * | `300 m` | 3,744,300 | 1,047,094 | `3,390 ms` |
 * | `512 m` | 6,390,272 | 1,753,920 | `5,029 ms` |
 *
 * A triangle is three vertices of {@link PATCH_STRIDE} floats, so `180` bytes,
 * and the buffer doubles as it grows: `512 m` is `315 MB` of mesh and `630 MB`
 * while it is growing, which is the page that ran out of memory. `200 m` is
 * `127 MB`, a second and a bit to build, and deep enough that a passage reads
 * as a passage rather than as a pit -- so the budget is that row.
 *
 * **The frame is no longer what binds.** The mesh is drawn five times over,
 * once for the picture and four more for the shadow maps, and those are
 * recorded when something they read moves rather than once a frame
 * (`PatchRenderer`). What is left is this one-off build.
 *
 * The cap is real rather than advisory: the walk takes as many layers as the
 * product allows and the readout says how deep it went, so a slider asking for
 * more than this gets less and says so.
 */
export const MAX_CAVE_BLOCKS = 2_500_000;
