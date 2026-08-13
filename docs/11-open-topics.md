# 11 — Open topics

Identified but **not yet designed**. Each needs its own document before
implementation. Ordered roughly by how much they force changes elsewhere.

---

## ~~Gravity and "up"~~ — designed, see [doc 13](13-gravity-and-orientation.md)

Closed. Three frames rather than one: an axis frame for coordinates, a
transported quaternion for the camera, and a discrete grid frame for directional
machinery. Gravity itself is one `normalize`; the hard half was the horizontal
frame, and there is provably no global one.

The finding that reaches furthest back into the rest of the design: the 720°
appears **twice**, and the two behave oppositely under refinement. The geometric
defect at a pentagon shrinks ~4× per level; the combinatorial deficit is
**60° at every level, forever**. Raising subdivision depth hides pentagons from
walkers and terrain, and does nothing at all for rails, pipes and roads. That
should be read before deciding the pentagon question below.

---

## ~~Meshing~~ — designed, see [doc 14](14-meshing-and-lod.md)

Closed, and the pessimism above was overstated. An unmerged hex surface costs
**2 vertices and 4 triangles per cell** — exactly twice a cube surface, a flat
factor, not a blow-up. What does not transfer is the rectangle-growing half of
greedy meshing; run-length merging down a column is exact and free.

The scheme is: naive mesher, skirts one coarse cell deep at chunk boundaries,
altitude-driven LOD by resampling the terrain function. Cap merging is optional
and bounded to a 37 m patch by curvature rather than by the algorithm.

The reason it lands so cheaply is the horizon from
[doc 13](13-gravity-and-orientation.md): a standing player sees about **21,000
cells**, 84,000 triangles. The 76 m horizon is the greedy mesher.

---

## Floating-point precision

A 1.7 km planet is fine. At Earth scale, float32 positions break down badly far
from the origin.

Standard fix is a **floating origin**: rebase world coordinates around the player
periodically. Worth deciding early, because it touches every system that holds a
position.

---

## Lighting

Flood-fill propagation works, but:

- Each cell has **8 neighbours** (6 around, 2 vertical) instead of 6.
- Sky light arrives along the **radial** direction, not straight down.
- Day/night is a sun direction vector dotted against cell normals — which gives a
  real terminator sweeping the planet for free.

---

## Block rotation

Hexagons have **6 orientations**, not 4. Any directional block — rails, pipes,
conveyors, machines — needs a 6-state rotation field and 6-way logic.

Hex is arguably *better* for these, but no existing recipe or tutorial will
transfer. Budget design time.

---

## Pentagons as a gameplay problem

The twelve pentagons are solved mathematically, not experientially. A player
laying a conveyor line will eventually hit a cell with five sides where their
sixth direction does not exist.

Options:

- Bury them under ocean, as H3 does on Earth
- Make them unbuildable landmarks — shrines, anomalies, world features
- Accept the break and let players route around it

This is a **design decision**, not a technical one, and it should be made
explicitly rather than by default.

[Doc 13](13-gravity-and-orientation.md) quantifies what is actually being
decided. A line entering a pentagon deflects **36.07°** either way — there is no
opposite direction to leave by — and a circuit encircling one returns rotated by
exactly one direction index. Neither shrinks with subdivision depth. Only the
first option removes the problem rather than relocating it. Doc 13 also notes
that the twelve pentagons form **six antipodal pairs**, so one pair can be made
to carry the lat/long poles — which turns two of them into places worth naming.

---

## Player-facing coordinates

`x: 412, y: 68, z: -190` is meaningless on a sphere. Show **latitude, longitude
and altitude**.

Small, but it affects every navigation feature players expect: waypoints, maps,
sharing locations, compasses.

---

## Rivers, erosion, and continents

Covered in [doc 08](08-terrain-generation.md) as the limit of pure noise. The
two-tier coarse-heightmap approach is sketched there but not designed: the
erosion algorithm, river tracing, and plate assignment are all still open.

---

## Multiplayer interest management

The easy one, listed for completeness: "which players care about this chunk
update" is an **ID range comparison**. The addressing scheme does the work. Needs
specifying, not inventing.

---

## Suggested next step

**Floating-point precision**, and the floating origin it implies. It is now the
last item that touches every system holding a position, and both closed
documents lean on it: [doc 13](13-gravity-and-orientation.md) wants orientation
rebased per chunk alongside position, and [doc 14](14-meshing-and-lod.md) wants
meshes built in chunk-local space. Neither can be finished until the rebasing
rule exists.

**Lighting** is the alternative, and it is more self-contained: 8 neighbours,
radial sky light, and a sun direction that gives a real terminator for free.
