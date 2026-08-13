# 13 — Gravity and orientation

## The problem

There is no global up vector. **Up is `normalize(position)`.**

Every system that quietly assumed a fixed world axis — camera, controller,
physics, block rotation, the minimap — has to be rebuilt against a frame that
turns as the player walks. [Doc 11](11-open-topics.md) flagged this as the
highest-impact open topic. This document closes it.

---

## The fact that makes it tractable

**The radial axis is free.** From [doc 03](03-addressing.md): vertical
neighbours are the same address with layer ±1. No face crossing, no adjacency
table, no pentagon case, ever.

So gravity itself — the thing everyone worries about — is the easy half. It is
one `normalize`. What is genuinely hard is the *horizontal* frame: deciding what
"north" means when the sphere refuses to give you one.

Keep those two apart. Almost every mistake in spherical worlds comes from
solving them with the same mechanism.

---

## Gravity proper

```
up      = normalize(position)
gravity = -g0 * up
```

Constant magnitude, varying direction. That is the whole model, and it is
correct for anything happening in the crust.

The textbook refinement — inside a uniform sphere, `|g| ∝ r`, falling linearly
to zero at the core — only matters if players can reach the core. On the
[doc 06](06-world-sizing.md) worked example (R = 1,700 m) a 64-block crust
bottoms out at `1 − 64/1700` = **96.2%** of surface gravity. Below the threshold
of noticing.

**Recommendation:** constant magnitude. Add the linear falloff only when, and
if, the world lets players dig to the centre — at which point it becomes a
feature rather than a correction.

---

## Why there is no global "north"

Not an engineering shortfall. A theorem.

The **hairy ball theorem** says every continuous tangent vector field on a
sphere vanishes at some point. Poincaré–Hopf sharpens it: the indices of the
zeros must sum to the Euler characteristic, χ = 2.

That is the *same* 720° from [doc 02](02-geometry-choice.md), wearing different
clothes — 4π steradians is χ · 2π. The impossibility of a global compass and the
necessity of twelve pentagons are one fact stated twice. You cannot dodge either,
and any design that appears to has simply hidden the singularity somewhere it has
not looked yet.

So do not look for *the* frame. There are three, they are good at different jobs,
and the discipline is never to convert between them casually.

| | Definition | Stateless | Singular | Continuous | Use it for |
|---|---|---|---|---|---|
| **Axis frame** | `east = normalize(cross(N, up))` | yes | at 2 poles | yes | lat/long, maps, sun position |
| **Transported frame** | quaternion carried and updated | no | nowhere | yes | camera, player controller |
| **Grid frame** | direction index into the cell's neighbour ring | yes | nowhere | **no** | blocks, rails, meshing, pathfinding |

The grid frame escapes the hairy ball theorem by not being a continuous field at
all. It is a per-cell discrete label, and the theorem has nothing to say about
those. That is not a loophole — it is the reason directional machinery should
live on the grid and never on a vector.

---

## The frame the player carries

Hold orientation as a **quaternion** and update it by the *swing* rotation: the
minimal, twist-free rotation carrying the old up to the new up.

```js
function stepFrame(q, oldUp, newUp){        // call once per move, not per frame
  const axis = cross(oldUp, newUp), s = length(axis);
  if (s < 1e-12) return q;                  // no change in up: leave heading alone
  return mul(quatFromAxisAngle(axis / s, atan2(s, dot(oldUp, newUp))), q);
}
```

**Never re-derive the player's heading from a reference axis.** Recomputing
`cross(N, up)` each frame looks equivalent and is not: it injects the axis
frame's twist into the camera, which reads as the world rolling underfoot and
snapping hard near the poles. Update incrementally, and the axis is never
consulted.

Euler angles are unusable here for the ordinary reason — yaw and pitch are
defined against a fixed axis that does not exist — and gimbal lock arrives as a
routine occurrence rather than an edge case, because "straight up" changes
continuously as you walk.

### Holonomy is real, and it is not a bug

Walk a closed loop and your carried heading comes back **rotated**, by exactly
the solid angle the loop encloses.

> **[verified]** `verification/frame.js` transports a tangent vector around
> circles of colatitude 10° to 120° in 200,000 steps and compares the accumulated
> rotation against `2π(1 − cos θ)`. Agreement to 1e-8 degrees or better at every
> radius. (Holonomy is an angle mod one full turn, so the comparison is mod 360°.)

Scaled to the worked-example planet, `rotation = enclosedArea / R²`:

| Loop | Enclosed area | Heading rotation |
|---|---|---|
| Around a 100 m city block | 10,000 m² | 0.20° |
| Around a 1 km² region | 1,000,000 m² | 19.8° |
| One octant of the planet | ⅛ sphere | 90° |
| The equator | ½ sphere | 360° ≡ 0° |

The design rule follows directly: **the transported frame is a camera state, not
a coordinate.** It is re-anchored by player input every frame, so its drift never
accumulates anywhere that matters. Persist it — as a saved facing, a waypoint
bearing, a rail direction — and you have stored a number whose meaning depends on
the path taken to reach it.

---

## The frame the machinery uses

A direction is an **index into the cell's neighbour ring**, ordered
counter-clockwise as seen from *outside* the sphere: `0…5` on a hexagon, `0…4` on
a pentagon. `neighbour(id, k)` from [doc 07](07-data-structures.md) already
returns exactly this.

**Order the ring geometrically, not by `(q, r)` sign.** Roughly 46% of chunks sit
in a mirrored frame ([doc 03](03-addressing.md)), and a direction index derived
from local coordinates inherits that mirror — every rail, conveyor and hopper in
those chunks would be handed reversed. Ordering by outward-facing CCW absorbs the
flip inside `neighbour()`, which is where the rest of the design already keeps
its sphere-ness.

### What the pentagons cost, exactly

Carry a direction index around the ring of one cell and see whether it comes back
unchanged.

> **[verified]** `verification/frame.js` builds the real level-4 grid (2,562
> cells) and walks the ring of every cell whose neighbours are all hexagons.
> Around all 2,490 pentagon-free hexagons the index slips by **0**. Around each of
> the 12 pentagons it slips by **exactly 1 index = 60°**. 12 × 60° = **720°**.

That is Gauss–Bonnet expressed in direction-index units, and it is the sharpest
available statement of what the twelve pentagons cost gameplay:

- **A loop enclosing no pentagon closes perfectly.** A conveyor or rail circuit
  returns to its start pointing the way it left.
- **A loop encircling a pentagon comes back rotated one direction.** Not
  approximately — one full index.
- **A straight line cannot pass through a pentagon.** Measured interior angle
  between adjacent directions is **71.965°**, so the two least-bad exits both
  deflect by **36.07°**. There is no opposite direction to leave by.

### Refinement does not help, and this is the important part

> **[verified]** Same script, levels 1–5. The *geometric* defect at a pentagon
> falls roughly 4× per level — 15.69° → 3.34° → 0.74° → 0.17° → 0.042° — tracking
> the shrinking cell area, and settling at about 60% of the `720/N` sphere
> average because pentagon cells are smaller than average. The *combinatorial* deficit is
> 1 index at every level, forever. Both sum to 720.000°.

So the 720° shows up twice, and the two behave oppositely:

| | Felt by | Behaviour under refinement |
|---|---|---|
| Geometric defect | walking players, terrain, camera | vanishes locally, ~4× per level |
| Combinatorial deficit | rails, pipes, roads, grid logic | **never shrinks** — 60° at every level |

Raising the subdivision depth is a real fix for the first and no fix at all for
the second. **You can make pentagons too small for a player to see and still not
small enough for a conveyor to ignore.** Anyone choosing between the options in
[doc 11](11-open-topics.md#pentagons-as-a-gameplay-problem) should decide with
that in front of them: burying the pentagons under ocean is the only listed
option that actually removes the problem, because it removes the machinery rather
than the geometry.

---

## Player-facing coordinates

Latitude, longitude and altitude — the axis frame, with its two singular poles.
That is acceptable, because a compass failing at the pole is behaviour every
player already expects.

But the axis is a free choice, and there is a better one available:

> **[verified]** `verification/frame.js` — the icosahedron is centrally
> symmetric, so its 12 vertices form 6 antipodal pairs. The twelve pentagons
> therefore also form 6 antipodal pairs.

**Run the lat/long axis through one of those pairs.** The two coordinate poles
then land exactly on two pentagons, so the frame's singularity and the grid's
singularity are the same two places. One class of weirdness to model, to explain,
and to decorate — instead of two unrelated ones that players discover separately
and have to be told are unconnected.

The remaining ten pentagons stay scattered, but their coordinate behaviour is
unremarkable; only the polar two are visible in the coordinate readout.

---

## What a small planet actually looks like

This is the part that surprises people, and it belongs here because it is a
direct consequence of `up = normalize(position)`.

> **[verified]** `verification/frame.js`, `horizon = R · acos(R / (R + h))`.

| Eye height | Horizon on a 1,700 m planet | Horizon on Earth |
|---|---|---|
| 1.7 m | **76 m** | 4.7 km |
| 10 m | 184 m | 11.3 km |
| 50 m | 407 m | 25.2 km |
| 200 m | 787 m | 50.5 km |

A standing player sees **76 metres**. Three consequences, all of them useful:

- **Render distance is bounded by geometry, not by taste.** Ground-level
  occlusion is free and total; chunks beyond the horizon cannot be seen at all.
  The near-field LOD budget is far smaller than a flat world's.
- **LOD must be driven by altitude, not distance.** Climbing 50 m multiplies
  visible area by 28×. A view-distance slider is the wrong control; the correct
  one is a function of `|position| − surfaceRadius`.
- **The planet reveals itself by climbing.** Free, and worth designing toward
  rather than around.

And the tilt from [doc 11](11-open-topics.md), quantified — two structures `s`
apart are tilted `s / R` relative to each other:

| Separation | Relative tilt |
|---|---|
| 10 m | 0.34° |
| 50 m | 1.69° |
| 100 m | 3.37° |
| 500 m | 16.85° |

**A flat, grid-aligned build cannot exceed roughly 50 m** before the tilt is
obvious. Past that, either accept visible faceting between districts, or build on
the sphere and accept that "straight" means great circle. Worth telling players
once, plainly, rather than letting them discover it by building a long wall.

---

## Chunk-local up

Meshing, lighting and LOD all want a single up per chunk. Whether they can have
one depends entirely on where the chunk level is cut.

> **[verified]** `verification/frame.js`, D = 11 on the 1,700 m planet.

| Chunk level | Chunk spans | `up` varies across it |
|---|---|---|
| C = 4 | 128 cells | 4.31° |
| C = 6 | 32 cells | 1.08° |
| C = 8 | 8 cells | 0.27° |

**Recommendation:** compute up per *cell* for anything the player sees — it is
one `normalize` and it is never wrong. Reserve chunk-local up for coarse LOD
shells, where 1° of error is below the resolution being drawn anyway.

This pairs naturally with the floating-origin work still open in
[doc 11](11-open-topics.md): if positions are already being rebased per chunk,
rebase orientation at the same time and in the same place. One transform, one
place to get right.

---

## What this forces elsewhere

- **Camera** — quaternion state, swing-updated. No Euler angles anywhere.
- **Controller** — movement is a direction in the local tangent plane, then
  re-projected to the sphere. `moveForward` is a rotation about the axis
  `cross(up, forward)`, not a translation.
- **Entity physics** — gravity is a per-entity vector. No shared constant.
- **Block rotation** — 6 states, indexed into the neighbour ring, geometric CCW
  ordering. Never derived from `(q, r)`.
- **Lighting** — sky light travels along `-up`, which is per-cell. The sun is a
  direction dotted against cell normals, which gives a real terminator sweeping
  the planet at no extra cost ([doc 11](11-open-topics.md)).
- **Rails, pipes, conveyors** — grid frame only. Must handle a 36° deflection at
  pentagons, or refuse to be placed on one.
- **Minimap and waypoints** — axis frame, poles on a pentagon pair.

---

## Still open

- **Can players reach the core?** Decides whether the linear `|g| ∝ r` interior
  model is needed, and what happens to orientation as `up` becomes undefined at
  `r = 0`.
- **Which frame do vehicles use?** A rail-bound cart is grid-frame. A free-flying
  craft is transported-frame. Anything that switches between them needs a defined
  handover.
- **Is there an in-world "north" landmark?** If the poles sit on two pentagons,
  those two cells are the obvious candidates — which turns a mathematical
  artefact into a place, and feeds directly into the pentagon gameplay decision.

**Demo:** [`demos/local-frame.html`](../demos/local-frame.html) — drag a walker
across the planet and watch the three frames disagree: the axis frame spinning as
it passes a pole, the transported frame returning from a closed loop rotated by
the enclosed area, and the horizon circle shrinking to 76 m at ground level.
