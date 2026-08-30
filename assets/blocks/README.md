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

## One picture a block type

**A file is named for the block that wears it**, lowercased:
`tundra_ground.png`, `steppe_ground.png`, `pine_leaf.png`, `birch_wood.png`.
Every biome has a ground of its own and every species a wood and a leaf of its
own, so a tundra and a steppe are different pictures rather than one picture in
two colours. 110 files for 79 block types, the extra being the overlays.

**Nothing is tinted.** A file carries its own colours, so what an editor shows
is what the world draws.

The noise only decides what a file *starts* as. Which recipe seeds one is read
off the colour the block was given — a grey is broken rock, a pale blue is
snow, a saturated yellow is sand, a dark green is dense growth — so a beach
starts out sandy and a badlands starts out as fragments. Repaint any of them
into anything.

A block's side is **two** pictures where it is two materials: the body is
`dirt`, the same under every biome, and `<block>_ground_overlay` is the band of
that ground alone, transparent below its own ragged join. Ground with nothing
growing on it — sand, broken rock, snow — has no overlay, because a sand cliff
is sand all the way down.

## Naming

`<name>.png`, lowercase, underscores. **The dot is reserved**: the loader
splits on the first one, so `stone.final.png` is read as a picture of `stone`.

Variants are `<name>.2.png`, `<name>.3.png` — the same block, another picture
of it, picked per cell. A cell here is a hexagon and shows a whole picture, so
one picture a block reads as a grid: measured over a field of grass, the ground
correlates with itself shifted one cell at **0.70**, the cell's own six-fold
turn takes that to **0.08**, and more pictures take it to **0.03**
([`tools/trial-tiles.mjs`](../../tools/trial-tiles.mjs)).

**Variants are what the layer count binds on.** WebGPU guarantees 256 array
layers and 110 pictures fit; four of each is 440 and does not. Give the
variants to the ground a player walks over and leave the rest at one.

## Alpha

Alpha is a **cutout**, not translucency — keep it at 0 or 255. A leaf's darkest
level is a hole rather than a shade, which is what makes a canopy read as
leaves; an overlay is clear below its own join.

## Looking at them

```
node tools/trial-tiles.mjs <out-dir> assets/blocks
```

`tiles.png` is every picture with its name under it, drawn two by two so the
wrap shows, over a checkerboard where it is transparent. An overlay is drawn on
the dirt it drapes over, which is the only place it means anything.
`ground.png` is a patch of the real hexagonal grid at the size a 1080p screen
gives at 5, 12 and 30 m.
