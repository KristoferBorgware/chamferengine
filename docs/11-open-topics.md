# 11 — Open topics

Identified but **not yet designed**. Each needs its own document before
implementation. Ordered roughly by how much they force changes elsewhere.

---

## Gravity and "up" — highest impact

There is no global up vector. **Up is `normalize(position)`.**

This ripples into:

- **Camera orientation** — use quaternions, not Euler angles. There is no
  well-defined yaw/pitch relative to a fixed world axis.
- **Player controllers** — every movement calculation is relative to a local
  frame that rotates as you walk.
- **Entity physics** — gravity is a vector toward the core, different everywhere.
- **Visual consequence** — two buildings a kilometre apart are visibly tilted
  relative to each other. Players notice this immediately.

Most people underestimate this one. **Design it before writing a controller.**

---

## Meshing

Hex prisms have **8 faces** to a cube's 6. Greedy meshing mostly does not apply:
you cannot merge hexagons into larger rectangles the way you merge cube faces.

Expect meaningfully more vertices per chunk than a cube world, and plan
level-of-detail earlier than you otherwise would.

Open questions: what LOD scheme, at which subdivision levels, and how to stitch
between LOD boundaries without cracks.

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

**Gravity.** It is the one most likely to force changes in the rest of the
design, and every other system inherits its choices.
