# 20 — Player-facing coordinates

## The problem

A player presses the key that shows their position and reads `x: 412, y: 68,
z: -190`.

In a flat world those three numbers answer real questions. Which way is north?
Increasing `z`. How far is home? Subtract and measure. Am I above ground? Compare
`y` to the surface. The origin is somewhere sensible, the axes point somewhere
consistent, and the numbers are useful.

On a planet, all three of those break at once.

![A sphere with x and y axes drawn from its centre and a player marked on the surface, with the questions a player would ask listed beside it](figures/xyz-says-nothing.svg)

*The origin is the planet's centre, which is a place no player will ever stand.
The axes point at nothing the player can see. And "up" is different for every
person on the planet, so `y` does not mean height for anybody.*

So the readout has to be **latitude, longitude and altitude** instead. That much
is obvious. What is not obvious — and is what this document decides — is where the
axis goes, how many digits to print, and what a player should send someone else
when they want to be found.

---

## Where the axis goes

Latitude and longitude need an axis, and any axis will do mathematically. That
makes it a free choice, and there is a much better one available than an arbitrary
direction.

[Doc 13](13-gravity-and-orientation.md) found that the twelve pentagons form six
antipodal pairs — for every pentagon there is another exactly opposite it. And
[doc 17](17-pentagons.md) made all twelve protected, standable landmarks.

**Run the axis through one of those pairs.**

> **[verified]** `verification/coords.js`. With the axis through an antipodal
> pentagon pair, all twelve pentagons land at just four latitudes:
>
> | Latitude | Pentagons |
> |---|---|
> | +90.000° | 1 — the north pole |
> | +26.565° | 5 |
> | −26.565° | 5 |
> | −90.000° | 1 — the south pole |

![A globe with its axis marked, a pentagon at each pole, and the other ten arranged on two rings at plus and minus 26.57 degrees](figures/pentagon-poles.svg)

*Two poles and two rings of five. Because pentagon positions are fixed by geometry
and no seed can move them, this is the map of **every** world the game will ever
generate — which makes it something players can learn once and use forever.*

Three things fall out, and none of them cost anything:

- **The poles are places.** A player can walk to 90° north and stand on it. It is
  a protected pentagon, so it will still be there, unmined, in a multiplayer world
  a year later.
- **One singularity, not two.** The coordinate system fails at the poles, and so
  does the grid. Putting them in the same two spots means one piece of strangeness
  to explain instead of two unrelated ones players discover separately.
- **A compass failing at the pole is expected behaviour.** Every player already
  knows this from the real world. It is the one place a spherical world's
  weirdness matches intuition.

---

## How many digits to print

This is the number that decides whether the readout is usable, and the answer is
better than it would be on Earth.

A cell covers `blockSize / R` radians, so **the smaller the planet, the more angle
one block covers** — and the fewer digits you need to name it. That is backwards
from the intuition that a small world is fiddly.

> **[verified]** `verification/coords.js`, section 2.
>
> | Planet | Block | One cell, in degrees | Decimals to resolve a cell |
> |---|---|---|---|
> | doc-06 worked, R 1,700 m | 1.00 m | 0.0337° | **2** |
> | 10 km | 1.47 m | 0.00843° | 3 |
> | 100 km moon | 1.84 m | 0.00105° | 3 |
> | Earth-sized | 1.83 m | 0.0000165° | 5 |

![A single hexagonal cell with a faint 0.01-degree grid over it, showing about three grid steps across the cell](figures/two-decimals.svg)

*At two decimal places one step is 0.30 m, so three steps fit across a 1 m cell.
The same block on Earth would need five decimals — the small planet is the easy
case.*

**Show latitude and longitude to two decimal places, plus altitude in metres.**

```
lat  41.02°   lon -78.55°   alt 63 m
```

Short enough to read at a glance, and fine enough to tell one cell from the next.

### Altitude means height above the reference radius

Not height above the terrain, and not the layer index.
[Doc 06](06-world-sizing.md)'s `surfaceRadius` is a fixed number for the planet,
so `altitude = |position| − surfaceRadius` is stable, comparable between players,
and negative underground. That last part is what a player wants when they are in a
cave: **−40 m** reads as "forty metres below sea level", which is a sentence
people already understand.

The layer index from [doc 03](03-addressing.md) is the engine's number, counted
downward from the crust top. Do not show it. It moves if the crust depth ever
changes, and it means nothing to a player.

---

## Longitude gets cheap near the poles, as it always does

> **[verified]** `verification/coords.js`, section 4. What one degree of longitude
> is worth on the worked planet:
>
> | Latitude | 1° of longitude | Cells across |
> |---|---|---|
> | 0° | 29.67 m | 30 |
> | 26.57° | 26.54 m | 27 |
> | 45° | 20.98 m | 21 |
> | 60° | 14.84 m | 15 |
> | 80° | 5.15 m | 5 |
> | 89° | 0.52 m | 1 |

By 89° a whole degree of longitude is one cell wide, and at the pole itself it
means nothing at all. This is not a defect and needs no handling — it is the axis
frame's singularity from [doc 13](13-gravity-and-orientation.md), arriving exactly
where the player expects it and on a landmark they can see.

---

## What to show, and what to send

Here is the part worth separating, because the obvious answer is wrong.

A player who wants a friend to find them reads their coordinates aloud. Two
decimals is enough to *describe* where they are — but is it enough to *identify*
the cell they are standing in?

> **[verified]** `verification/coords.js`, section 3. Twenty thousand random
> positions, converted to latitude and longitude, rounded, and converted back:
>
> | Decimals | Lands in the same cell | Worst miss |
> |---|---|---|
> | 1 | 13.6% | 2.04 cells |
> | 2 | **87.5%** | **0.21 cells** |
> | 3 | 98.8% | 0.02 cells |
> | 4 | 99.9% | 0.00 cells |

Two decimals lands in the right cell seven times in eight, and the worst case is a
fifth of a cell away — so it is always you or the cell next door. **Good enough to
be found by. Not good enough to be an identity.**

And an identity is already available, exactly, for free:

> **[verified]** Same script, section 5. A cell address at `D` 11 is **27 bits**,
> which is **six characters in base 36** — eight with the layer included. At
> `D` 13 it is 31 bits and still six characters.

So the rule is:

- **Show** latitude, longitude and altitude. It is what a human reads.
- **Send** the cell ID as a short code. It is exact, it is integer
  ([doc 15](15-precision-and-origin.md)), it never needs a decimal point, and it
  cannot drift.

A waypoint, a shared location, a map pin and a `/tp` command should all carry the
ID. The lat/long readout is a display format, in the same way the transported
frame in [doc 13](13-gravity-and-orientation.md) is camera state — useful to look
at, never the thing you store.

---

## Distance and bearing between two points

Both are one-liners on a sphere, and both are exact.

```
distance = R · acos(dot(dirA, dirB))          great circle, along the ground
bearing  = angle of dirB in A's axis frame     which way to set off
```

The distance is the real walking distance, which a flat world's Pythagoras never
gives you once the world curves. And the bearing is a **starting** direction, not
a constant heading — walk a great circle and your compass reading changes
continuously, which is holonomy from [doc 13](13-gravity-and-orientation.md)
showing up in the navigation UI.

**So a waypoint arrow must be recomputed every frame**, from the player's current
position. Caching a bearing has the same failure mode as caching a heading: it is
a number whose meaning depended on where you were standing when you took it.

---

## What this forces elsewhere

- **The HUD** shows `lat`, `lon` to two decimals and `alt` in metres, all three
  computed from the position each frame. No storage.
- **Waypoints and shared locations** store a cell ID, never a coordinate string.
- **The map** uses the axis frame, with the poles on the chosen pentagon pair.
- **The compass** is the axis frame's east vector
  ([doc 13](13-gravity-and-orientation.md)), and it is allowed to spin at the
  poles.
- **Terrain generation** is untouched. It samples 3D world position
  ([doc 08](08-terrain-generation.md)) and never sees latitude, which is what
  keeps the poles from becoming visible seams in the ground.
- **The chosen pentagon pair becomes a constant** beside the twelve pentagon IDs
  in [doc 07](07-data-structures.md)'s table.

---

## Still open

- **Which of the six pairs.** Any of them works and the choice is arbitrary, but it
  should be written down once and never changed, because it fixes where the
  equator falls in every world.
- **Whether to show a grid reference instead.** Two decimals of latitude is
  precise but not memorable; a short alphanumeric code derived from the cell ID
  might be friendlier for speaking aloud. This document commits to the ID as the
  transport format and leaves its presentation open.
- **What altitude means over deep terrain.** Height above the reference radius is
  stable and comparable, but a player standing on a 120 m mountain reads 120 m
  while feeling like they are at ground level. A second "height above ground"
  number may be worth showing, and costs one height-field evaluation.
- **Naming the poles and the other ten.** Doc 17 leaves what the twelve pentagons
  *are* open; two of them are now the most navigationally significant points on
  the planet, which sharpens that question rather than answering it.

---

## In one breath

- `x, y, z` answers no question a player actually asks on a sphere. Show
  **latitude, longitude and altitude**.
- **Run the axis through an antipodal pentagon pair.** Both poles land on
  protected, standable landmarks, the coordinate singularity and the grid
  singularity coincide, and the other ten pentagons sit on two rings at
  **±26.57°** — the same in every world.
- **Two decimal places** name a cell on the worked planet, because one cell is
  **0.0337°** across. A small planet needs fewer digits than Earth, not more.
- **Altitude is height above the reference radius**, so it goes negative
  underground. Never show the layer index.
- Two decimals lands in the right cell **87.5%** of the time and never more than
  **0.21 cells** out — so **show** lat/long, and **send** the cell ID, which is
  **six base-36 characters** and exact.
- A bearing is a **starting** direction and changes as you walk. Recompute the
  waypoint arrow every frame; never store one.
