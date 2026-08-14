# 24 — Player edits and global processes

## The problem

A player builds a wall across a river.

Everything about the design says that should work. Blocks are player-owned: the
delta store records every divergence from the generated world and wins over it
([doc 08](08-terrain-generation.md)). Put a block anywhere and it stays.

But the river is not blocks. It comes from the coarse map in
[doc 21](21-rivers-and-erosion.md) — computed once at world creation, stored, and
**read only**. That map still says the river runs through the wall, and it will
say so forever.

So the two halves of the persistence model disagree, and this is the only place
they do. Everything else a player can touch is local: mine a block, place a block,
light a torch. Water is the first thing where the consequence of an edit is not
where the edit is.

Before choosing what to do, it is worth knowing how far a single wall actually
reaches.

---

## First: one block dams nothing

The obvious mental model — a player drops a block in the river and the water stops
— does not survive contact with the grid.

> **[verified]** `verification/edits.js`, section 2. A site carrying 354 upstream
> cells, walled to 2% of the world's height range:
>
> | Wall spans | Cells raised | Cells flooded | Lake reaches |
> |---|---|---|---|
> | 1 cell | 1 | **0** | 0 m |
> | 3 cells | 7 | 1 | 16 m |
> | 5 cells | 19 | **29** | 144 m |
> | 7 cells | 37 | 32 | 128 m |

![Two hex fields, each with a river running down them: on the left a single blocked cell that the river simply routes around, on the right a wall spanning the valley with the river backed up behind it](figures/water-goes-round.svg)

*A cell has six ways out, so blocking one leaves five. The water goes round, and
nothing backs up at all. Damming a river means building a wall that spans the
channel — which is what damming a river means in real life too.*

That is worth knowing before designing anything, because it changes who is
affected. Not "any player who places a block near water" but "a player who
deliberately built a structure across a valley". **The case is rarer than it
sounds**, and rarer still because most of the land is not river:

> **[verified]** Same script, section 1. Cells carrying at least 200 upstream
> cells are **1.62% of land**; at least 1,000, **0.08%**.

---

## Then: the two directions are not alike

Once a wall does span the channel, the consequences run two ways — and only one of
them is bounded.

![A river with a wall across it: behind the wall a lake filling the valley and stopping at its rim, and below the wall the channel running on with tributaries joining it](figures/two-shapes-of-consequence.svg)

*Upstream, the water rises until it finds the lowest way out of the valley and
stops. That limit comes from the terrain and has nothing to do with how big the
river was. Downstream, every cell below the wall has lost its water, and nothing
in the geometry says where that stops.*

**Upstream is bounded by terrain.** The lake fills to the lowest lip and stops —
29 cells and 144 m in the measurement above. That is a patch, and a patch is
something a local simulation can own.

**Downstream is bounded by nothing obvious.** Every cell below has lost the flow
the wall is holding back. Whether that matters depends entirely on what joins the
river below the wall, which is why the measurement is the interesting part.

---

## Where you dam decides whether the change is local

This is the result the document turns on, and it is not what I expected before
measuring it.

> **[verified]** `verification/edits.js`, section 3. The longest flow path on this
> world is 84 cells — 1,344 m. "Deficit" is the share of the flow still missing.
>
> | Dam position | Held back | After 5 | After 20 | After 50 | Reaches the sea? |
> |---|---|---|---|---|---|
> | 74 cells from the sea | 31 | 35% | 7% | **4%** | **no** |
> | 50 from the sea | 499 | 87% | 69% | 38% | yes |
> | 25 from the sea | 64 | 86% | 25% | — | yes |
> | 8 from the sea | 234 | 93% | — | — | yes |

![Two curves of remaining deficit against distance downstream: one dropping steeply to near zero within twenty cells, the other still well above a third at fifty](figures/deficit-fades.svg)

*Dam a headwater and the tributaries below refill the river — the loss is down to
4% within twenty cells and the coast never hears about it. Dam a main stem and
there is nothing below big enough to make up the difference, so it runs all the
way down.*

**The same wall is a local change in one place and a global one in another.**
That is why no single rule covers it, and it is the thing to design around rather
than legislate away.

---

## The decision: the coarse map stays read-only

**The coarse map is never modified by a player edit.** It keeps the status the
seed has — an input, computed once, identical for everyone, and the thing a client
regenerates rather than downloads ([doc 23](23-determinism.md)).

Three reasons, and the third is the one that settles it.

**It would break determinism's payoff.** [Doc 23](23-determinism.md) closed by
showing a client can regenerate the 2.5 MB coarse map exactly instead of
downloading it. That holds only while the map is a pure function of the seed. Make
it writable and every client must be sent the diffs, and the map becomes a second
save file to version, merge and repair.

**The write is cheap and the consequence is not.** An override layer is small — a
100 m pond is **1.9 KB**, 0.07% of the map. Storage was never the obstacle. The
obstacle is that changing one coarse cell invalidates the drainage of everything
downstream of it, and re-running the global pass on every dam is not a runtime
operation ([doc 21](21-rivers-and-erosion.md) measures it in seconds).

**And a partial recompute has no natural boundary.** The table above is the
argument: sometimes the affected region is twenty cells and sometimes it is the
whole river. You cannot pick a radius, because the right radius depends on the
topology of the network above and below the edit.

---

## What happens instead: bound what the map promises

If the map cannot change, the fix is to be precise about what it was ever claiming.

**The coarse map says where water would flow across generated terrain.** It does
not say where water *is*. Those were the same thing only while nobody had edited
anything.

So split the two:

- **The channel is generated**, from the coarse map, exactly as
  [doc 21](21-rivers-and-erosion.md) describes. It is terrain: a valley with a
  river-shaped floor. A wall built across it is a wall across a valley, and the
  valley does not care.
- **The water is a local simulation**, seeded by the channel and bounded by the
  delta store. Where a player has changed nothing, it fills the channel the coarse
  map carved and costs nothing to compute. Where a player has built, it does what
  water does.

That gives the honest answer to the dam. **Upstream fills**, because the lake is
bounded by terrain and a local simulation can find its rim — 29 cells in the
measurement. **Downstream keeps flowing**, because the coarse map still says a
channel is there and the simulation has no way to know the difference is
permanent.

Which is wrong, and worth saying plainly rather than dressing up: a dammed river
in this design still has water below the dam. What the player gets is a lake, not
a dry riverbed.

---

## Why that is the right wrongness

The alternative is a global recompute per edit, and the trade is not close.

| | Coarse map read-only | Writable map |
|---|---|---|
| Client regenerates the map | **yes** ([doc 23](23-determinism.md)) | no — must be sent and merged |
| Cost per dam | a local flood fill | a planet-wide re-route |
| Bounded work | **yes** | no natural radius |
| Dam holds back water upstream | **yes** | yes |
| Riverbed below runs dry | no | yes |

One row is wrong on the left. Five are wrong on the right, and one of them —
"no natural radius" — is not a performance problem but a design one: there is no
correct answer to *how much* to recompute.

And the wrong row is the least visible failure available. A player who dams a
river sees the lake they built. The riverbed a kilometre downstream, which they
are not looking at and which
[doc 13](13-gravity-and-orientation.md)'s 76 m horizon guarantees they cannot see
from the dam, still has water in it.

---

## The general rule

Rivers are the first case, not the only one. The same shape appears wherever a
global precomputed fact meets a local edit, so it is worth stating once:

> **A precomputed global map is a statement about the generated world, never about
> the current one.** Player edits are recorded in the delta store and interpreted
> on top of it. The map is never rewritten.

Two more cases it already covers:

- **Erosion.** A player who flattens a mountain does not get the valleys re-cut
  below it. The coarse heights still describe the mountain that was generated;
  the delta store says the blocks are gone. Nothing needs to reconcile them.
- **Continents and plates.** Terrain-scale structure is generated, and no amount
  of digging moves a plate boundary. Nobody expects otherwise, which is a useful
  check that the rule matches intuition in the easy cases before being applied to
  the hard one.

---

## What this forces elsewhere

- **[Doc 21](21-rivers-and-erosion.md)** gains a boundary on what it promises: the
  coarse map is where water would flow across generated terrain, and its
  read-only status is now a decision rather than an accident of implementation.
- **[Doc 08](08-terrain-generation.md)**'s delta store is unchanged, and is
  confirmed as the only writable terrain in the design.
- **[Doc 23](23-determinism.md)**'s regenerate-don't-send conclusion survives,
  because it depends on the map staying a pure function of the seed.
- **Water needs a local simulation** with a bounded region, which is new work this
  document creates rather than removes.
- **[Doc 22](22-multiplayer-interest.md)** is unaffected: a lake forming is a
  batch of ordinary block deltas, and travels the way every other edit does.

---

## Still open

- **The water simulation itself.** This document decides where the boundary
  between global and local sits, and does not design what runs inside it. How far
  water spreads, how fast, and what stops it are all undecided.
- **How the lake is stored.** A 29-cell lake is 29 block deltas, which is nothing.
  A player who floods a whole valley writes thousands. Whether that is fine or
  wants a compressed "region is water to level h" delta is unmeasured.
- **Whether players should be told.** A dammed river that still flows downstream
  is a visible inconsistency to anyone who walks down it. Saying nothing risks
  the same thing doc 19 worried about — players inventing worse explanations.
- **Erosion from player structures.** Nothing here erodes because of a wall. Real
  water would cut round it eventually, and the design has no mechanism for terrain
  changing after world creation.
- **The one-block finding may not survive a fluid simulation.** Section 2 measures
  the *coarse map's* routing, which routes around a single blocked cell. A local
  water simulation at block resolution might behave differently, and nothing here
  measures that.

---

## In one breath

- The delta store is local and writable; the coarse map is global and read-only.
  **A dammed river is the one place they disagree.**
- **One block dams nothing** — a cell has six ways out and the water goes round.
  A wall must span the channel: 1 cell floods **0**, 5 cells floods **29**.
- **Upstream is bounded by terrain** — the lake rises to the lowest lip and stops,
  144 m in the measurement. **Downstream is bounded by nothing.**
- **Where you dam decides whether the change is local at all.** A headwater dam is
  down to a **4%** deficit within twenty cells; a main-stem dam is felt to the
  coast. Same wall, different answer.
- **The coarse map stays read-only.** It is a statement about the **generated**
  world, not the current one — which keeps it a pure function of the seed, so
  [doc 23](23-determinism.md)'s client can still regenerate it.
- The cost is that a dammed river **still has water below the dam**. That is
  wrong, it is the least visible wrongness available, and the alternative has no
  natural radius to recompute within.
