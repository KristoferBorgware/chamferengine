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

## What a picture is

A **tinted** one is drawn in grey and read as `tintScale x texel x the block's
own registry colour`. Forty-four biome grounds and thirteen tree species share
four pictures between them this way: they differ in colour and not in pattern,
and the colour is already written down once in the registry. The grey is half,
not white, so the bright end of a recipe's range is in the file rather than
clipped.

Everything else carries its own colours and is read as it is.

A block's side is **two** pictures where it is two materials: `ground_side` is
the dirt body, the same under every biome, and `ground_overlay` is the grass
band alone, transparent below its own ragged join. One file tinted whole would
paint a desert's dirt green.

## Several pictures of one material

A cell here is a hexagon and shows a whole picture, so one picture a material
reads as a grid. Measured over a field of grass, the ground correlates with
itself shifted one cell at **0.63**; the cell's own six-fold turn takes that to
**0.12**, and four pictures take it to **0.03**
([`tools/trial-tiles.mjs`](../../tools/trial-tiles.mjs)). Variants past the
first are written `stone.2.png`, `stone.3.png` and are ordinary files -- paint
them, or delete the ones not worth having.

## Looking at them

```
node tools/trial-tiles.mjs <out-dir> assets/blocks
```

Draws every picture magnified, and a patch of the real hexagonal grid at the
size a 1080p screen gives at 5, 12 and 30 m.
