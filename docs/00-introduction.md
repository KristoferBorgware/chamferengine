# 00 — Introduction

## The goal

Build a voxel world in the style of Minecraft, but on a **sphere** rather than a
flat plane. The world should wrap seamlessly in every direction, so that walking
in a straight line eventually returns you to your starting point, in any
direction, with no edge and no discontinuity.

## The constraint that shapes everything

The obvious approach — wrapping a cubic grid onto a sphere — requires distorting
the cubes near the seams. That distortion is the thing this design exists to
avoid. A cube is not a good unit cell for a sphere, and no amount of clever
projection fixes it, only spreads it around.

The reason is topological rather than a matter of engineering effort. Any closed
surface topologically equivalent to a sphere carries exactly **720° of angular
defect** that must be distributed somewhere. You can choose *where* it goes and
*how finely it is divided*, but you cannot make it zero. Every design decision in
this project is a choice about where to put that 720°.

A cube sphere puts 90° into each of 8 corners — concentrated, and visible.
A Goldberg polyhedron (hexagons plus twelve pentagons) spreads it across twelve
points that become individually negligible at scale.

## Design goals

1. **Seamless wrapping.** No edge, no pole, no discontinuity in gameplay.
2. **No distorted cells.** Cells vary in size only mildly and smoothly, never
   with a visible break.
3. **Uniform adjacency.** Every cell has the same number of neighbours, all at
   the same distance, all sharing a full edge. This eliminates an entire class
   of diagonal-movement and corner-cutting bugs.
4. **Exact hierarchy.** A chunk must contain its children exactly, not
   approximately, so that level-of-detail, streaming, and hierarchical
   pathfinding are all sound.
5. **Nothing pregenerated.** A new planet should cost roughly a hundred bytes on
   disk. Terrain comes from a seed; only player modifications are stored.
6. **Addressing is arithmetic.** Finding a cell, its chunk, or its ancestors
   should be shifts and masks, not tree walks or spatial indices.

## Non-goals

- **Matching Minecraft's exact feel.** Hexagons are not cubes. Buildings,
  recipes, and directional blocks all behave differently. This is accepted.
- **Perfectly uniform cell area.** Cells vary roughly 1.3:1 across the sphere.
  Irrelevant for gameplay, but code must not assume uniformity.
- **A general-purpose geospatial library.** Google S2 and Uber H3 already exist
  and are excellent at that job. This is a game world.

## What "cell" means here

A **cell** is one hexagon (or one of the twelve pentagons) at one radial layer —
a hexagonal prism, the equivalent of a Minecraft block. A **chunk** is a
triangular patch of the surface at a chosen subdivision level, spanning all
layers beneath it: the unit that is loaded, generated, meshed, and stored.

## Reading order

The documents are ordered so that each depends only on those before it.
Doc 01 covers the prior art that shaped these choices; doc 02 explains the
geometry; doc 03 onwards is the design proper.

## Demos

Every non-trivial idea in this documentation has a runnable demo. They are
standalone HTML files with no build step — open them directly.

If you are meeting this design for the first time, start with
[`demos/how-it-works.html`](../demos/how-it-works.html) — an illustrated
walkthrough of the construction in ten diagrams, which covers in pictures what
docs 02, 03 and 14 cover in prose.

After that, [`demos/sphere-tiling-shapes.html`](../demos/sphere-tiling-shapes.html),
which shows the geometric options side by side with the curvature defect
colour-coded, and
[`demos/goldberg-voxel-sphere.html`](../demos/goldberg-voxel-sphere.html), which
shows the chosen tiling at increasing resolution.
