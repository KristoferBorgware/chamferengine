# Block textures

One PNG a picture, and `blocks.json` saying which pictures each block type
wears on its cap, its side and its underside.

**These files are hand-owned.** `npm run textures` seeds the ones that are not
there yet out of noise and leaves every file that is, so the loop is: generate
once, paint over whichever ones matter, generate again for anything new.
`--force` is the only thing that overwrites, and it names what it took back.

```
npm run textures                      # write what is missing, 32 texels
npm run textures -- --size 16         # ... at 16 instead
npm run textures -- --variants 4      # ... four pictures of each material
npm run textures -- --force           # take back every file, painted or not
npm run textures -- --list            # what it can draw
```

**Settle the size before painting.** An edit made at 32 does not survive being
regenerated at 16, and nothing here converts between them.

## Nineteen pictures for seventy-nine blocks

| | |
|---|---|
| `stone` `bedrock` `dirt` `sand` `snow` `water` | the plain materials |
| `sandstone` `terracotta` | the rock a biome cuts into, in bands rather than clumps |
| `turf_top` `moss_top` `scrub_top` | ground that grows something, and its `_overlay` band |
| `dune_top` `scree_top` `frost_top` | ground that does not: sand, broken rock, snow |
| `wood` `leaf` | one apiece for thirteen species |

Forty-four of the block types are biome grounds. They differ in colour, which
the registry already holds, and in what the ground is **made of**, which it
does not — so they wear six patterns between them rather than forty-four
pictures.

Which family a biome gets is read off **the colour it was given**, not off its
temperature and humidity: those say what grows, not what the ground is made
of. A beach is sand because it is a beach, and its climate is a warm wet one it
shares with a rainforest. A grey is rock, a pale blue is ice, a saturated
yellow is sand. It is a default — one line in `blocks.json` moves a biome to
another family or gives it a picture of its own.

## What a picture is

A **tinted** one is drawn in grey and read as `tintScale x texel x the block's
own registry colour`, **in linear light**. The grey is half, not white, so the
bright end of a recipe's range is in the file rather than clipped. `tints` in
the manifest records one colour each grey picture is actually read through, so
a tool drawing a preview needs no copy of the registry.

Everything else carries its own colours and is read as it is.

A block's side is **two** pictures where it is two materials: the body is
`dirt`, the same under every biome, and `<family>_overlay` is the band alone,
transparent below its own ragged join. One file tinted whole would paint a
desert's dirt green. Ground that grows nothing has no overlay — a sand cliff
is sand all the way down.

## Several pictures of one material

A cell here is a hexagon and shows a whole picture, so one picture a material
reads as a grid. Measured over a field of grass, the ground correlates with
itself shifted one cell at **0.53**; the cell's own six-fold turn takes that to
**0.08**, and four pictures take it to **0.03**
([`tools/trial-tiles.mjs`](../../tools/trial-tiles.mjs)). Variants past the
first are written `stone.2.png`, `stone.3.png` and are ordinary files -- paint
them, or delete the ones not worth having.

## Looking at them

```
node tools/trial-tiles.mjs <out-dir> assets/blocks
```

Draws every picture twice, as the file holds it and as the world reads it, and
a patch of the real hexagonal grid at the size a 1080p screen gives at 5, 12
and 30 m.
