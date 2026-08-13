# 06 — World sizing

## The problem

Decide block size, planet radius, and subdivision level. They are not
independent.

## Terminology warning

**"Depth" means two unrelated things.** Always qualify:

- **Subdivision depth** (`D`) — purely *horizontal*. How many times triangles are
  split, which sets how fine the hex grid is across the surface. Nothing to do
  with the core. `D` 13 versus 14 means smaller hexagons, not a deeper world.
- **Crust depth** — the *radial* one. How many layers run toward the core.

## The relationship

```
blockSize  ≈  K · radius / 2^level        where K = sqrt(8π / (10√3)) = 1.20459
cells      =  10 · 4^level + 2
```

Derivation: cell area `A = 4πR² / N`; for a hexagon with centre-to-centre spacing
`d`, area is `(√3/2)d²`, so `d = sqrt(2A/√3)`.

> **[verified]** `verification/calc.js` checks the closed form against exact
> cell-area maths at three radii: agreement to three decimals.

## Which knob is rigid

**Block size is rigid.** It is what the player feels: how tall a door is, how
thick a wall is, how many blocks a tree costs. Change it later and every
building, recipe, and terrain generator breaks. Decide it first and freeze it.

**Radius is elastic**, because the level is an integer. Rounding to the nearest
level shifts things by up to ~40%. **Let the radius absorb that, never the block
size.** Snap the radius to whatever the rounded level gives.

**Do not pick radius directly — pick travel time.** That is the number players
experience; radius is just its unit conversion.

## Worked example

```
1 m blocks, ~2 hours to circumnavigate on foot at 1.4 m/s
  → circumference 10.08 km  → target radius 1,604 m
  → level = log2(1.20459 × 1604 / 1) = 10.92  → round to 11
  → snapped radius = 1 × 2^11 / 1.20459 = 1,700 m
  → circumference 10.68 km, walk time 2.12 h
  → 41,943,042 surface cells
```

> **[verified]** `verification/calc.js` reproduces this example exactly.

## Scale reference

| Level | Cells | Block size on a 10 km planet |
|---|---|---|
| 10 | 10.5M | 11.8 m |
| 12 | 168M | 2.9 m |
| 13 | 671M | 1.5 m |
| 14 | 2.7B | 74 cm |

Level 13–14 lands at roughly Minecraft block scale on a 10 km planet.

**Sanity check:** to match Minecraft's actual playable area you would need a
planet radius around **17,000 km** — larger than Earth. A 10 km planet is a
*small* world.

**Tool:** [`demos/planet-size-calculator.html`](../demos/planet-size-calculator.html)
— block size and travel time in; level, snapped radius, cell count, total voxels
and rounding penalty out. Drag the time slider slowly to watch the level tick
over and the rounding penalty swing.

## The quadrupling

**Each level up doubles the radius but quadruples the cell count.** That is where
generation time and save-file growth live. Know which side of a level boundary
you are on before committing.

If the game has vehicles or flight, *that* speed decides world size, not walking
speed — the same trip duration at 15 m/s pushes you several levels up.

---

## Depth

The surface count is only half the story. Total voxels = `surface cells × layers`.

At the worked example above with a 64-block crust: 42M surface cells becomes
**2.7 billion voxels**. That multiplier sizes your storage and generation budget.

### Taper

Layers shrink toward the core. At depth `h` on a planet of radius `R`, cell
spacing scales by `(R − h) / R`.

- 64 blocks into a 1,700 m planet → cells at the crust floor are **96%** of
  surface width. Imperceptible.
- Below roughly **85%**, blocks visibly narrow as you dig. At that point either
  cap the crust or merge layers — drop the horizontal resolution by one level at
  a chosen depth, which reintroduces seams but only horizontally, at layer
  boundaries you control.
- If crust depth exceeds the radius, cells collapse to nothing before the bottom.

The calculator reports the taper live.

---

## Two things the numbers assume

- **Cell area is not perfectly uniform.** Goldberg hexagons vary about **1.3:1**
  across the sphere, so block size is an average. Cells near the twelve pentagons
  run slightly smaller.
- **Hexagons are not cubes.** Block size is measured flat-to-flat. A hexagon that
  wide covers **0.87×** the footprint of a square block of the same size, and is
  **1.15×** wider corner-to-corner. Everything is about 13% smaller than the same
  number would suggest in Minecraft.

---

## Bit and storage ceilings

Three separate ceilings on how deep you can go:

- **Bits** — 5 for the face plus 2 per level means **29 levels** in a 64-bit ID.
  Not the binding constraint.
- **Storage** — level 15 at one byte per cell is ~11 GB. This is what actually
  stops you.
- **Nothing, if you generate on demand.** A cell's terrain comes from a noise
  function of its position, so nothing exists until a player visits. Only
  modified cells are written. Under that model the level you pick costs nothing
  up front — it is a coordinate system, not an allocation.
