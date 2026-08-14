# 10 — Pathfinding

Hex grids are meaningfully better for pathfinding than square ones, and the
hierarchy adds a second, larger win. Both are consequences of choices already
made, collected here.

---

## No diagonals

On a square grid you pick your poison:

- **4-neighbour** gives ugly staircase paths.
- **8-neighbour** gives diagonal moves costing √2 that can illegally squeeze
  between two touching wall corners — through a gap of exactly zero width.

Hexes have neither problem. **Every adjacency is a shared edge, never a bare
corner.** An entire class of corner-cutting bugs simply does not exist — not "is
handled", does not exist.

That property is exact and holds at every cell including the twelve pentagons,
which is why it is stated on its own. The two convenient-but-approximate
companions to it — six neighbours, all the same distance apart — are neither, and
the caveats at the end of this document are where that is paid for.

This is design goal 3 from [doc 00](00-introduction.md) being collected.

**Demo:** [`demos/pathfinding.html`](../demos/pathfinding.html) — the same map on
both grids, with an *Illegal cuts* column. On squares it goes red regularly and
the offending diagonal segments are highlighted. For hexes it is structurally
always zero.

---

## The heuristic

A* needs a fast, admissible estimate of remaining cost.

**Within a face**, cube coordinates give it exactly:

```
distance = (|Δk| + |Δi| + |Δj|) / 2
```

**Across faces**, use the great-circle distance between the two cell centres
divided by cell spacing. Both positions come straight from their IDs by walking
path digits — no lookup.

**Divide by the largest spacing on the sphere, not the nominal one.** The
search is only admissible if the heuristic never overestimates, and the
heuristic here estimates *steps remaining*: dividing an arc by a spacing larger
than the real step turns it into an undercount, which is safe. Divide by the
nominal spacing and every step through a tighter-than-average region — near the
twelve pentagons, where cells run smallest — is overcounted, the heuristic stops
being admissible, and the search quietly returns paths that are not shortest.

> **[verified]** `verification/uniform.js` measures the largest edge on the real
> grid against [doc 06](06-world-sizing.md)'s nominal `K·R/2^L`. It settles at
> **1.0984** by level 8, and the mean settles at 0.9988 — so nominal really is
> the mean, and the largest step is **9.84% above it**.

**The safe divisor is 10% above nominal.** Earlier drafts of this document said
7%, derived from a spacing figure of 1.14:1 that [doc 02](02-geometry-choice.md)
has since measured and corrected to **1.41:1**. A 7% divisor is *not* admissible:
every step through the tightest regions is overcounted, which is exactly the
failure this section warns about, committed by this section.

The cost of being conservative is a slightly weaker heuristic and a few more nodes
expanded. The cost of not being is silently wrong routes, which is much worse and
much harder to notice.

## Pentagons and seams are non-events

A pentagon is a node of degree 5. A face crossing is handled inside
`neighbour()`. **The pathfinder never learns the world is a sphere.**

That is the payoff of putting all the irregularity in one 180-byte table
([doc 05](05-face-adjacency.md)).

---

## Hierarchical search — the real payoff

Raw A* across a planet is hopeless: millions of nodes for a long route.

HPA* fixes this. Precompute which border cells of each chunk connect to which,
path at *chunk* level first, then refine only the chunks along the route. That
needs a sound multi-level abstraction — and the triangle tree already is one,
with **exact containment at every level**.

Truncate IDs to level 4 for the coarse graph, level 6 for the middle. It is the
same structure built for streaming, reused unchanged. **Truncate the ID, search
the coarse graph, refine inside.**

**Demo:** [`demos/pathfinding.html`](../demos/pathfinding.html) — the *Chunks*
toggle darkens cells outside the coarse route; the explored count drops
accordingly.

### Caveat on the demo's simplification

The demo uses **corridor-restricted A***: a chunk is passable if any cell in it is
free, and the fine search is limited to chunks on the coarse route. This can fail
where full A* would succeed, and is not guaranteed to find the shortest route. It
needs a fallback to full search.

Real HPA* fixes this by precomputing actual **entrance-to-entrance connectivity**
per chunk rather than treating a chunk as passable if any cell is free. The
simplification is what makes the demo small, not what makes it correct.

---

## Two honest caveats

- **Six directions still means mild zigzag** on off-axis routes. The fix is
  any-angle pathfinding (Theta*) or string-pulling — and the line-of-sight test
  both need is exactly the ray walk from [doc 09](09-ray-traversal.md). That
  traversal is already the pathfinding smoother.
- **Step costs are not perfectly uniform**, and by more than this document used
  to say. Cells vary **1.99:1** in area across the sphere — **1.41:1** in spacing,
  **1.48:1** counting the pentagons ([doc 02](02-geometry-choice.md)) — and shrink
  with depth. Irrelevant to how gameplay *feels*, but not irrelevant to
  correctness: it is exactly why the cross-face heuristic above must divide by
  maximum spacing, and getting the spread wrong is how that heuristic silently
  stopped being admissible. If true travel times are needed, weight each edge by
  actual centre-to-centre distance.

---

## In one breath

- **Every adjacency is a shared edge**, so corner-cutting bugs do not exist
  rather than being handled. Six-and-equidistant is the approximation; edge-only
  is the guarantee.
- The heuristic is exact within a face and great-circle across faces, both from
  the ID alone — divided by **maximum** spacing, which is **1.10× nominal**, or it
  is not admissible.
- Pentagons are degree-5 nodes and seams live inside `neighbour()` — **the
  pathfinder never learns it is on a sphere**.
- Hierarchical search is free: **truncate the ID** and the coarse graph is
  already there.
