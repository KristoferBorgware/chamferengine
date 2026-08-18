# Reference

Every measured number in the specification, and the script that produced it.

> **Generated file. Do not edit.** Rebuild with `node tools/make-reference.js`.
>
> Each section below is the actual output of a verification script, run
> fresh. The prose documents explain *why* these numbers matter; this page
> exists so an agent can look one up without reading the argument around it,
> and so the numbers can never drift from the scripts that prove them.

For invariants, naming conventions and the design rules an implementation
must not break, see [`CLAUDE.md`](../CLAUDE.md). For the reasoning, see the
numbered documents.

---

## Index

| Script | Establishes | Used by |
|---|---|---|
| [`adj.js`](../verification/adj.js) | — | [05](05-face-adjacency.md) |
| [`authority.js`](../verification/authority.js) | What the server has to know, and what each thing it does not know costs. node verification/authority.js Doc 29 left one question open and called it the biggest one left about the shape of the system: does the server generate terrain, so it can validate edits and simulate mobs, or does it only store and route and take the client's word? That question is usually argued as a binary -- "an authoritative server has to run the whole generator" -- and the binary is wrong. What the server needs depends entirely on WHICH cheat it wants to refuse, and the answers span four orders of magnitude. This script prices them. It also separates two things that get muddled: a cheat about the WORLD (I broke a block I could not reach) and a cheat about the PLAYER (I now have three iron). They have completely different answers, and only the first one is about terrain. | [30](30-authority-and-cheating.md) |
| [`blockstate.js`](../verification/blockstate.js) | What a block actually IS, as bits. Doc 03 reserves "16 bits of block state, or 12 bits of type plus 4 of rotation"; doc 19 spends 3 of the 4; doc 07 names a palette and a side table; doc 12 defines the delta store as cellID -> block state. Nobody has ever said what those 12 bits mean, how a type gets its number, or what happens when the list of types changes between versions. This sizes all of it -- and kills the obvious answer to the numbering question. | [27](27-block-state.md) |
| [`boundary.js`](../verification/boundary.js) | Which curve is a cell's edge? Three definitions are in play and doc 11 has carried the disagreement as the last structural gap. Doc 04 defines a cell by what hexRound maps to it; doc 14 meshes the dual polyhedron, whose corners are the centroids of subdivided triangles; and "everywhere equidistant on the sphere" is the intuitive reading. This measures what actually separates them, and whether the mesh can be made to draw the lookup's curve for free. | [04](04-position-lookup.md) [18](18-cell-boundary.md) |
| [`calc.js`](../verification/calc.js) | — | [06](06-world-sizing.md) |
| [`check.js`](../verification/check.js) | verify the rhombic triacontahedron construction before putting it in the artifact | [02](02-geometry-choice.md) |
| [`coastline.js`](../verification/coastline.js) | Where does a coastline come from? Today the coarse map sums two tiers of fBm and cuts the result at the percentile that leaves the intended land fraction standing, and a percentile cut through a smooth field draws a smooth curve. This measures how smooth, against two other ways of deciding where the land is: the sample direction warped before the continent lookup, and a land mask grown level by level up the subdivision hierarchy. The measurement that carries the answer is not the shape of one coast but how fast its perimeter grows as the map gets finer. A smooth curve doubles its step count when the cells halve; a ragged one more than doubles, and the excess is what "ragged" means as a number. | [21](21-rivers-and-erosion.md) |
| [`coords.js`](../verification/coords.js) | Player-facing coordinates. "x: 412, y: 68, z: -190" says nothing useful on a sphere, so the readout has to be latitude, longitude and altitude. That raises three questions a design has to answer: where the axis goes, how many decimal places actually name a cell, and whether a rounded readout is precise enough to share. | [20](20-player-coordinates.md) |
| [`determinism.js`](../verification/determinism.js) | Do two machines agree? Doc 15 left this open and doc 22 now leans on it: a client can only regenerate the coarse map instead of downloading it if the noise comes out bit for bit. IEEE 754 specifies some operations exactly and leaves others to the platform's maths library, so the answer depends entirely on which ones each path uses. | [23](23-determinism.md) |
| [`edits.js`](../verification/edits.js) | A player dams a river. The coarse map from doc 21 is computed once at world creation and read only, so it still says the river runs there. Something has to give. Before choosing what, measure how far a single edit actually reaches -- upstream, downstream, and how often an edit touches a river at all. | [24](24-edits-and-global-processes.md) |
| [`frame.js`](../verification/frame.js) | Gravity and orientation: the local frame, its holonomy, and what the grid's 720 degrees does to direction indices. | [13](13-gravity-and-orientation.md) |
| [`hexround.js`](../verification/hexround.js) | Does rounding a barycentric triple actually give the CONTAINING cell? On a flat triangular lattice the Voronoi cell of a lattice point is the hexagon, exactly. The real cells are Voronoi regions ON THE SPHERE of the same lattice radially projected outward, and gnomonic projection preserves straight lines but not equidistance -- so the two Voronoi diagrams need not agree. This measures whether they do. | [04](04-position-lookup.md) [15](15-precision-and-origin.md) |
| [`id.js`](../verification/id.js) | The cell ID as an actual 64-bit word. Doc 03 draws the layout, doc 07 says finding a chunk is "one shift", doc 06 says "chunk size remains tunable after launch: it does not change world data", and doc 22 leans on a contiguous range being a compact patch. Nothing had ever packed the bits and checked those together. Packing them turns up three problems, and they are not compatible with each other -- so this measures the problem rather than announcing a fix. Adding a planet field for multiple worlds is what forced the question. | [03](03-addressing.md) [11](11-open-topics.md) |
| [`interest.js`](../verification/interest.js) | Multiplayer interest management. Doc 11 has always called this the easy one: "which players care about this chunk update is an ID range comparison, and the addressing scheme does the work". A contiguous ID range IS one compact patch of surface (doc 03) -- but the question here is the CONVERSE, and the converse of a true statement is not free. This measures it. | [22](22-multiplayer-interest.md) |
| [`language.js`](../verification/language.js) | Which language and runtime -- the last item on doc 11's Part 1 list, and the only one that still blocked the first line of code. node verification/language.js Doc 23 argued from the IEEE 754 standard that the runtime is bit-identical across machines, and then admitted the argument had never been run: "a real check would run the generator on two genuinely different platforms and compare hashes, which cannot be done from inside one script." It can be done from inside one script, one level down. Instead of two platforms, use SIX LANGUAGES on one machine, each compiling the same kernel through a different compiler, optimiser and runtime. If the pipeline is as pinned as doc 23 claims, they all produce the same bits. If any of them is free to rewrite the arithmetic, that one disagrees -- and which one disagrees is exactly the language decision. The kernel is not a toy. It is noise.js's pinned hash, the quintic fade, trilinear value noise, fBm accumulated low octave first, and doc 04's barycentric blend + normalize -- 20,000 samples, four float64s folded from each, 80,000 doubles hashed into one 64-bit digest. Nothing here needs a network and nothing is installed. Toolchains that are absent are skipped and named, so this script runs anywhere and says what it could not check. | [11](11-open-topics.md) [26](26-implementation-readiness.md) [28](28-language-and-runtime.md) [29](29-what-runs-where.md) |
| [`light.js`](../verification/light.js) | Lighting on a hex sphere: what 8 neighbours cost, why sky light is still one downward pass, and what a sun direction buys for free. | [16](16-lighting.md) |
| [`lod.js`](../verification/lod.js) | A chunk drawn at a coarser level of detail spaces its cells further apart and asks the terrain for a height at each one. The terrain answers with the value at that exact point, which is not the same as the average of the ground the cell covers -- so a coarse chunk does not draw a smoothed version of the fine one, it draws an arbitrary selection from it. This measures what that costs, what two ways of band-limiting the detail term buy, and whether the coarse map has the same problem once the detail term is fixed. | [14](14-meshing-and-lod.md) |
| [`lookup.js`](../verification/lookup.js) | — | [04](04-position-lookup.md) |
| [`mesh.js`](../verification/mesh.js) | Meshing and LOD: what a hex surface actually costs, how far a flat patch may span before the sphere's curvature shows, and whether LOD levels share vertices. | [14](14-meshing-and-lod.md) |
| [`neighbour.js`](../verification/neighbour.js) | neighbour(id, k) -- the function eight documents delegate to and none defines (doc 11, Part 1). Doc 05 proves its 180-byte table complete and has never used it to cross an edge; every other script here builds the whole planet and reads adjacency off a hash map of rounded positions, which is fine for measuring and unavailable to an engine holding one integer. So this builds the function from the table and INTEGER ARITHMETIC ALONE, then checks it against that geometric graph. It also settles the three decisions hiding inside it: where direction index 0 is anchored, how (i, j) re-expresses across a face edge, and what a pentagon returns for k = 5. | [05](05-face-adjacency.md) [11](11-open-topics.md) |
| [`noise.js`](../verification/noise.js) | Which noise function, exactly. Doc 08 fixes WHERE to sample (3D world space) and forbids a sin hash; doc 23 makes the exact choice bit-load-bearing, because a joining client regenerates doc 21's coarse map rather than downloading it. Neither names an algorithm -- and this repository already contains two that disagree, which is doc 11 Part 1's third entry. This pins one, and measures why each part of it is the way it is rather than asserting it. | [08](08-terrain-generation.md) [11](11-open-topics.md) |
| [`order.js`](../verification/order.js) | Can the 4 children of a midpoint-split triangle be visited edge-to-edge? children: T0=(A,ab,ca) T1=(ab,B,bc) T2=(ca,bc,C) T3=(ab,bc,ca) | [03](03-addressing.md) |
| [`pentagon.js`](../verification/pentagon.js) | The twelve pentagons as a GAMEPLAY problem: how often a player meets one, how much of the world would have to change to hide them, and what routing around one actually costs. | [17](17-pentagons.md) |
| [`precision.js`](../verification/precision.js) | Floating-point precision at planet scale: what a float can resolve, where the ID->position conversion loses accuracy, and how much a chunk-local origin buys back. | [15](15-precision-and-origin.md) |
| [`qr.js`](../verification/qr.js) | walk (i,j) at depth D down C levels -> path digits + leftover (q,r) + orientation | [03](03-addressing.md) |
| [`rank.js`](../verification/rank.js) | rank(q, r) -- doc 07 gives a chunk's storage layout as index = rank(q, r) * layerCount + layer and that is the only time rank appears in the specification. It is never defined, and it is not a plain triangular number, because doc 03's border rule (the lowest chunk ID wins) means a chunk owns some of the cells on its own edges and not others. So two questions wear one name: how many cells does a chunk hold, and which slot does a given (q, r) sit in. This answers both, and prices the only real choice between them. | [07](07-data-structures.md) [11](11-open-topics.md) |
| [`rivers.js`](../verification/rivers.js) | Rivers, erosion and continents are the three things fBm cannot make, because all three are GLOBAL: where water goes depends on the whole planet, not on the neighbourhood. Doc 08 sketches a coarse stored map to carry them. This measures whether that works -- how the coarse map is looked up, what flow routing costs on a hex sphere, and how much of the planet ends up river. | [21](21-rivers-and-erosion.md) |
| [`rotation.js`](../verification/rotation.js) | Directional blocks: rails, pipes, conveyors. A rotation here is an index into a cell's neighbour ring, so three questions decide the design. How evenly are those six directions spread, since a player aims at one of them? How often does a build actually run into a pentagon, given placement is refused there? And how often does a closed circuit enclose one, which is the case that does not close. | [19](19-directional-blocks.md) |
| [`s2.js`](../verification/s2.js) | — | [01](01-prior-art.md) |
| [`scale.js`](../verification/scale.js) | — | [06](06-world-sizing.md) |
| [`seam.js`](../verification/seam.js) | What actually happens at a chunk boundary when the two sides are at different LOD and one of them has caves. Doc 14 first said "a skirt one coarse cell deep"; this checks whether that is enough once a rim column has more than one solid span, what does close the remaining holes, and -- since a skirt was tried in the engine and taken out again -- what a skirt costs on the boundaries where it is not needed, which is most of them. | [14](14-meshing-and-lod.md) |
| [`sky.js`](../verification/sky.js) | What is above you, on a planet you can walk around in two hours. node verification/sky.js A skybox, clouds and a moon are the three things this specification has discussed and never written down (doc 11). They look like pure decoration, and on a normal-sized world they are: a cube at infinity, a scrolling texture, a sprite. This planet is 1,700 m across and that changes all three, because the player is the fastest-moving thing in the sky. Everything here is PRESENTATION (doc 29): client-side, never compared between machines, and therefore allowed transcendentals that doc 23 forbids in the generator. That freedom is used, and it is why none of this is expensive. | [32](32-sky-clouds-and-moon.md) |
| [`taper.js`](../verification/taper.js) | Layer merging: buy it or strike it. Doc 06 caps the crust because cells taper as (R-h)/R with depth, and raises merging -- dropping horizontal resolution one level at some depth -- only to decline it. Doc 11 has carried it as "proposed, never designed" ever since. This prices both sides: how deep the taper really lets a crust run, what a merge would buy, and what the interior shell would cost. | [06](06-world-sizing.md) |
| [`uniform.js`](../verification/uniform.js) | How uniform are the cells, really? Doc 02 has claimed 1.3:1 in area and 1.14:1 in spacing since the first draft, with no script behind either. Both are load-bearing: doc 10 divides by the largest spacing to keep its A* heuristic admissible, and doc 06 sizes blocks from a mean. This measures the real spread on the one-shot grid doc 15 pins the design to, and finds the closed form it converges to. | [02](02-geometry-choice.md) [10](10-pathfinding.md) |
| [`volume.js`](../verification/volume.js) | Meshing terrain that is GENERATED, not stored. Doc 08 makes terrain a pure function of position -- a height-field term, optionally plus a density-field term for caves -- and doc 14's cost model quietly assumed the first, on a smooth sphere. This measures relief, caves, and what generation costs. | [08](08-terrain-generation.md) [14](14-meshing-and-lod.md) |
| [`water.js`](../verification/water.js) | Water is a block type: translucent, no collision, written once by the generator (doc 24). Blocks are cheap; TRANSLUCENT blocks are the ones that make renderers difficult, because they cannot be drawn in any order. So the questions are how much water surface there is, and how many layers of it a player ever looks through at once. | [25](25-water.md) |
| [`winding.js`](../verification/winding.js) | The middle child of a triangle split comes out "upside down", and doc 03 has called the frame inside it MIRRORED since the first draft. That word implies a change of handedness, which would reach into meshing, normals and every chirality-dependent thing in the engine. This checks what the flip actually is. | [03](03-addressing.md) [11](11-open-topics.md) |

---

## `adj.js`

Cited by [doc 05](05-face-adjacency.md).

```
face  edge0            edge1            edge2
  0 -> f 4 e2 rev  -> f 6 e0 rev  -> f 1 e0 rev
  1 -> f 0 e2 rev  -> f 5 e0 rev  -> f 2 e0 rev
  2 -> f 1 e2 rev  -> f 9 e0 rev  -> f 3 e0 rev
  3 -> f 2 e2 rev  -> f 8 e0 rev  -> f 4 e0 rev

60 entries · every edge matched: true
all reversed (consistent winding): true
bytes at 3 fields x 1 byte: 180
```

## `authority.js`

What the server has to know, and what each thing it does not know costs. node verification/authority.js Doc 29 left one question open and called it the biggest one left about the shape of the system: does the server generate terrain, so it can validate edits and simulate mobs, or does it only store and route and take the client's word? That question is usually argued as a binary -- "an authoritative server has to run the whole generator" -- and the binary is wrong. What the server needs depends entirely on WHICH cheat it wants to refuse, and the answers span four orders of magnitude. This script prices them. It also separates two things that get muddled: a cheat about the WORLD (I broke a block I could not reach) and a cheat about the PLAYER (I now have three iron). They have completely different answers, and only the first one is about terrain.

Cited by [doc 30](30-authority-and-cheating.md).

```
authority.js -- what the server must know, per cheat, and what it costs

1. what the server can already refuse, holding no terrain at all
   refused by                              needs         how
   reach: the cell is 1 km away            addressing    ID -> position, one distance against the player position
   rate: 400 blocks in one second          nothing       a counter per player
   moving faster than a player can         nothing       positions over time; doc 22 already streams them
   editing a protected pentagon column     addressing    doc 17: is this one of the 12? a property of the address
   a cell ID that does not exist           addressing    decode and range-check
   a block type not in the registry        the save      doc 27: the registry is server-side
   an action a KNOWN cell contradicts      delta store   breaking a cell the store says is already air, or
                                                         placing into one it says is solid

   Seven checks, and the server pays NOTHING NEW for any of them: it already
   has addressing, positions and the delta store.

   TWO THINGS THAT LAST ROW IS NOT. Earlier drafts of this script claimed the
   delta store put "the built world under authority" and called it the place
   where griefing happens. Both were wrong:

     GRIEFING IS NOT CHEATING. Breaking a block someone else placed is a
     legal move. The server cannot tell it from ordinary mining and no
     amount of terrain would help -- that needs land claims or permissions,
     which this specification does not have and this script cannot price.

     WHAT THE DELTA STORE ACTUALLY BUYS IS CONSISTENCY, not authority. It
     knows the CURRENT STATE of every cell a player has changed, so it can
     refuse an action that contradicts it. That catches a desynced client
     and a lazy cheat. It is a modest thing and worth stating modestly.

2. the blind spot costs a POINT QUERY, not a chunk
   one solidity(cell) query: 310 ns, recorded
   (doc 28 measured Rust at 1.14x C and JS at 1.75x, so read this as an
    upper bound -- Rust is about 202 ns)
   this machine, now: 401 ns -- a timing, so it moves run to run

   against generating a whole chunk, which is what "the server runs the
   generator" is usually taken to mean:

     unit                                 evaluations   vs one query
     one edit, one cell                             1         1x
     a chunk, height field only (doc 14)          561       561x
     a chunk, full crust with caves (doc 08)    35,904    35,904x

   and doc 27 measured a player acting on a block about 2x a second:

     players   queries/s   CPU of one core
          10          20      0.0006%
         100         200      0.0062%
        1000        2000      0.0620%
       10000       20000      0.6200%

   SO EDIT VALIDATION IS NOT THE EXPENSIVE THING. A thousand players cost
   a rounding error of one core, because a player is a slow, human-rate
   event source and each event needs ONE cell, not a chunk. "Does the
   server generate?" is not a binary: validating needs a POINT QUERY and
   nothing else -- no chunk, no cache, no mesh, no layers above or below.

   AND HERE IS WHY THE VIRGIN-GROUND QUESTION IS WORTH ASKING AT ALL, which
   earlier drafts of this script asserted and never explained.

   It is not mainly about legality. It is about THE DROP. Doc 08's generator
   returns a MATERIAL -- stone, dirt, grass, water -- not just solid or air.
   Section 4's rule says the client sends intents and the SERVER issues what
   the broken block drops. To do that the server has to know WHAT WAS THERE.

     a cell in the delta store   the server knows the type. Free.
     a virgin cell               the server knows nothing -- so it must
                                 either ask the client, which is exactly the
                                 farming cheat section 4 exists to refuse,
                                 or generate the cell.

   Almost every cell in a world is virgin, so without the point query the
   intents rule only works on ground somebody has already dug. THE POINT
   QUERY IS WHAT MAKES "INTENTS, NEVER OUTCOMES" IMPLEMENTABLE AT ALL.
   That, and not legality, is what the 0.06% is buying.

3. mobs, which is where the cost actually lands
   a mob at 1.4 m/s crosses a cell every 0.71 s
   at 20 Hz that is a cell every 14 ticks -- doc 27's number, and
   the reason entities are held per chunk by containment rather than keyed
   by cell.

   what one mob needs resident, by what it is doing:
     stand still (gravity only)           1 cells   the cell under it
     walk (collision + step up)           7 cells   its own cell and the six neighbours
     path 32 cells ahead (doc 10)     3,169 cells   a hex disc of radius 32: 3r^2+3r+1

   A pathfinding mob touches 3,169 cells, and doc 16's light disc formula
   is the same 3r^2+3r+1 because a hex disc is a hex disc. That is the
   number that decides this, not the edit rate:

     mobs pathing once a second   cells/s        cores, regenerating
                             10        31,690                 0.01
                            100       316,900                 0.06
                           1000     3,169,000                 0.64

   One path is 3,169 cells = 0.64 ms of generation if nothing is cached.
   A hundred mobs pathing once a second is 6% of a core -- 158x what a
   thousand players cost in section 2, from a hundredth of the population.

   A REAL IMPLEMENTATION WOULD NOT RE-GENERATE PER STEP -- it would cache the
   chunk, which is exactly the thing edit validation was able to avoid. So
   the honest statement of the trade is:

     validating edits   -> a point query per edit, no cache, no memory
     simulating mobs    -> generated chunks RESIDENT on the server, plus a
                           tick loop, plus doc 10 pathfinding, plus entity
                           interest which doc 22 lists as open

   A chunk cached as block data is doc 07's 8.8 KB at 2 bits a cell.
   Mobs are what turn the server from a store into a simulator. Edit
   validation, on its own, does not.

4. the cheat that terrain cannot catch, and the rule that does
   Two different claims, which get muddled because both arrive as packets:

     A WORLD claim   "I broke cell X"      -> checkable: sections 1 and 2
     A PLAYER claim  "I now have 3 iron"   -> NOT checkable, at any cost

   The second cannot be validated by generating terrain, by caching chunks,
   or by any amount of server CPU -- because the server has no independent
   way to know what a player is holding. It can only know what it ISSUED.

   So the fix is not a check. It is a rule about what the client is allowed
   to say:

     THE CLIENT SENDS INTENTS, NEVER OUTCOMES.
       "I act on cell X"        yes -- the server validates and applies it
       "I now have 3 iron"      never sent, and never believed

   Under that rule the farming cheat has nowhere to live. The sequence is:
     1. client: I break cell X
     2. server: reach ok, rate ok, not protected  (section 1, free)
     3. server: what was there? delta store, or one point query (section 2)
     4. server: that type drops that item          <- the SERVER decides
     5. server: your inventory is now this         <- the SERVER tells you

   Step 4 is the whole answer, and it costs nothing: doc 27 already puts the
   BLOCK REGISTRY in the save, server-side, so the type -> drop table is
   already where it needs to be. The client never names an item at all.

   This also settles whether the wire needs general RPC. It does not, and
   it must not: an RPC surface is a list of things the client may ask the
   server to do, and the moment one of them takes an outcome as an argument
   the rule above is broken. What crosses the wire is a small closed set:

     client -> server   my position   |   I act on cell X with intent Y
     server -> client   these cells changed   |   your inventory is this
                        |   these entities are here

   Doc 22 already named the first and third of those and said the server
   needs "a player position per client, and nothing else". This adds intents
   and inventory to that list and closes it.

   HONEST LIMIT: none of this stops a cheat that only needs INFORMATION.
   Every client generates the whole planet (doc 29), so every client can
   already see where the ore is without digging. That is not a bug in this
   design, it is what "terrain is generated, not stored" means -- and it is
   true of every seed-based world including Minecraft. An x-ray cheat is
   unpreventable here BY CONSTRUCTION. What is preventable is acting on it
   faster than a player could, which is section 1, row 2.

verdict
   "Does the server generate?" is the wrong question because it has three
   answers, not two, and they differ by four orders of magnitude.

   NO GENERATION -- the server holds addressing and the delta store, which
   doc 29 already gives it. That is enough to refuse every cheat in section
   1: reach, rate, protected cells, malformed IDs, unknown block types, and
   anything about a cell a player has already touched. Free.

   POINT QUERIES -- one solidity(cell) per edit closes the last blind spot,
   virgin ground. At 1,000 players it is a rounding error of one core, and
   it needs no cache and no resident chunks. This is a cheap upgrade and
   the design should assume it.

   RESIDENT CHUNKS -- only mobs need this, and they need it continuously
   rather than per event. That is what turns the server into a simulator,
   and it pulls in doc 10 pathfinding and doc 22's open entity-interest
   question with it. It is a real decision and it is NOT forced by wanting
   an honest server.

   And the resource-farming cheat is in none of those tiers, because it is
   not a claim about the world. THE CLIENT SENDS INTENTS, NEVER OUTCOMES --
   the server reads the block type it just removed and issues the drop
   itself, from the registry doc 27 already puts in the save.
```

## `blockstate.js`

What a block actually IS, as bits. Doc 03 reserves "16 bits of block state, or 12 bits of type plus 4 of rotation"; doc 19 spends 3 of the 4; doc 07 names a palette and a side table; doc 12 defines the delta store as cellID -> block state. Nobody has ever said what those 12 bits mean, how a type gets its number, or what happens when the list of types changes between versions. This sizes all of it -- and kills the obvious answer to the numbering question.

Cited by [doc 27](27-block-state.md).

```
1. what the fields buy
   type     12 bits -> 4,096 block types
   rotation 4 bits -> 16 variants of each
   together 16 bits -> 65,536 distinct block states
   doc 19 uses 3 of the 4 rotation bits for 6 directions, so one bit
   is spare -- doc 19 suggests a flag such as powered or reversed.
   For scale, Minecraft Java: 1,159 block types in the registry, so
   4,096 is 3.5x a full game -- comfortable, not unlimited.
   But it also ships roughly 26,000 block STATES, which is 22.4 per type
   on average -- ABOVE the 16 variants a type gets here. Section 6 prices that.

2. can a type number just be a hash of the block's name?
   4,096 slots. Chance that some two names collide:
     block types   collision chance
              50     25.8%
             100     70.1%
             200     99.2%
             500    100.0%
            1000    100.0%
   Even odds at about 75 types -- long before a real game.
   A collision is not a glitch, it is two different blocks sharing a
   number, so every save containing both is unreadable. Hashing is out.
   Widening the field does not rescue it either:
     16-bit hash, 1,000 types:  99.95% chance of collision
     20-bit hash, 1,000 types:  37.90% chance of collision
     24-bit hash, 1,000 types:   2.93% chance of collision
     32-bit hash, 1,000 types:   0.01% chance of collision
   You would need a 32-bit field to make it merely unlikely, and
   "unlikely" is the wrong standard for something that corrupts a save.

3. the registry: a list of names, and the index is the number
   world file header holds the block names in order. The stored number is
   the position in that list. New blocks APPEND; removed blocks leave a
   tombstone so no number is ever reused.
   types    registry size at ~24 bytes a name
     100       2.3 KB
     500      11.7 KB
    1000      23.4 KB
    4096      96.0 KB
   Even a full registry is under 100 KB -- next to nothing beside a save,
   and it makes the numbering exact instead of probabilistic.
   It also makes the save self-describing: a file from an older build
   still says what its own numbers meant.

4. inside a loaded chunk: palette width against distinct states
   a chunk at D 11 / C 6 is 561 slots x 64 layers = 35,904 cells
   distinct states   bits/cell   chunk size   vs a flat 16-bit field
                 2           1        4.4 KB      6.3%
                 4           2        8.8 KB     12.5%
                 8           3       13.1 KB     18.8%
                16           4       17.5 KB     25.0%
                64           6       26.3 KB     37.5%
               256           8       35.1 KB     50.0%
              4096          12       52.6 KB     75.0%
   flat 16-bit would be 70.1 KB. Doc 07 says most chunks hold
   three or four states, which is 2 bits and 8.8 KB -- 12.5% of flat.
   The palette is per chunk, so a chunk full of one material costs 1 bit
   a cell however many types the world defines.

5. on disk: one edit, and a million of them
   [ address 29 ][ layer 10 ][ block state 16 ] = 55 bits = 9 spare in a 64-bit word
   the planet is NOT in the record: the file already belongs to one planet,
   the same reason doc 07 keeps no cell IDs inside a chunk.
   edits        raw size at 8 bytes each
     1e+3            0.0 MB
     1e+5            0.8 MB
     1e+6            7.6 MB
     1e+7           76.3 MB
   A player who places ten million blocks costs 76 MB before any
   compression, and runs of identical edits compress hard. The delta
   store is the only thing that grows (doc 07) and it grows slowly.
   The 9 spare bits are room to widen block state later without
   changing the record size -- which is what a version field is for.

6. the one real choice: is rotation a FIELD or part of the number?
   (i) FIXED SPLIT -- 12 type + 4 rotation, as doc 03 drew it.
       Reading a rotation is a mask. Doc 19 wants exactly that: rails and
       conveyors read their neighbours' facings constantly.
       Costs: at most 16 variants per type. A block needing more must
       spend extra type slots.
   (ii) FLAT INDEX -- 16 bits is one number into a table of every state.
       Unlimited variants per type. Reading a rotation becomes a lookup in
       a 128 KB table -- cache-resident, but a lookup rather than a mask.

   How many type slots does the fixed split actually burn? A stair-like
   block with 4 facings x 2 halves x 5 join shapes is 40 states:
     40 states / 16 per type = 3 type slots each.
     10 such materials -> 30 of 4,096 slots = 0.7%
     30 such materials -> 90 of 4,096 slots = 2.2%
     60 such materials -> 180 of 4,096 slots = 4.4%
   That example is real and it is FLATTERING. Take the yardstick instead:
     26,000 states over 1,159 types needs at least ceil(states/16) = 1,625 slots,
     and every type needs one, so realistically 1,625-2,784 of 4,096
     = 40%-68% of the type space.
   A flat index would use 26,000 of 65,536 = 40%, so the split's
   waste is what rounding each type up to a multiple of 16 costs.
   So the fixed split is NOT nearly free -- at Minecraft scale it spends
   about half the type space. It still fits, and the deciding argument
   was never the space anyway.
   RECOMMENDATION: the fixed split. It keeps doc 19's rotation a mask,
   which is the one read that happens per block per frame.

verdict
   16 bits of block state: 12 type + 4 rotation, 4,096 types and 16
   variants each. Type numbers come from a REGISTRY stored in the save --
   a list of names, index is the number, append only, never reuse a slot.
   Hashing names into the field is out: it is even odds on a collision by
   75 types, and a collision corrupts every save holding both blocks.
   A loaded chunk still stores a per-chunk palette, so the common case is
   2 bits a cell. One edit is 55 of 64 bits with 9 spare to grow into.

7. the side table, and the word in it that does not belong
   things that do not fit in 16 bits, and what they cost:
     a chest, 27 slots                ~ 108 bytes
     a sign, 4 lines of text          ~ 240 bytes
     a furnace: 3 slots + progress    ~  16 bytes
     a spawner                        ~  32 bytes

   how often a cell has side data, for a heavily built chunk:
     containers   share of the chunk   side table size
             10               0.028%           1.2 KB
            100               0.279%          11.7 KB
           1000               2.785%         117.2 KB
   a chunk is 35,904 cells; a thousand containers in one chunk is
   an absurd build and still costs 117 KB. The side table is not a
   scaling problem, so it should be designed for clarity, not density.

   HOW A BLOCK KNOWS IT HAS SIDE DATA: it does not need a flag bit.
   The TYPE says so -- a chest always has contents, stone never does --
   and the registry already carries a line per type. So no bit is spent,
   and the spare rotation bit stays spare.

   AND ENTITIES DO NOT BELONG IN IT. Doc 07 lists "chests, signs,
   entities, keyed by the same cellID". The first two are attached to a
   cell and stay there. An entity has a POSITION and it MOVES, so keying
   one by cell means rewriting its key every time it walks:
     a mob at 1.4 m/s over 1 m cells changes cell every 0.71 s
     at 30 Hz that is a rekey every 21 frames, per entity, forever
   Entities are a separate list, held per chunk by CONTAINMENT, not a
   map keyed by cell. That is one word out of place in doc 07 and it
   would have become a hash table nobody could keep still.

8. how a cell knows it has side data: four answers, priced
   who asks "does this cell have side data?", and at what rate:
     asker                              per second   why
     the mesher, per cell per rebuild            0   a chest's MODEL is its type; the contents are not drawn
     the renderer, per cell per frame            0   never -- the palette index is the whole draw input
     lighting, ray walk, physics                 0   all read solidity, which is the type
     chunk save / load                           0   iterates the TABLE (1,000 entries), never the 35,904 cells
     a player opening or breaking one            2   human rates, one cell, one probe
   Nothing on the frame path asks. The question is asked about
   2 times a second, by a human, about one cell.

   A  the TYPE says so          registry line per type
   B  a FLAG BIT in block state doc 19's spare rotation bit
   C  ASK THE TABLE             no marker anywhere; probe on demand
   D  a per-chunk BITMAP        one bit per cell, resident

   B costs nothing in width -- the bit is already spare -- but a flag is
   part of the state VALUE, so every type that carries data splits into
   two palette entries. Section 4's typical chunk holds 3-4 states:
     distinct states   palette bits   chunk size   vs 4 states
                   4              2        8.8 KB       100%
                   5              3       13.1 KB       150%
                   6              3       13.1 KB       150%
                   8              3       13.1 KB       150%
                   9              4       17.5 KB       200%
   Three flagged types push 4 distinct states to 7, which crosses a power
   of two: 2 bits a cell becomes 3, and the chunk goes 8.8 KB -> 13.1 KB.
   That is +4.4 KB resident, to shortcut a question asked twice a second.

   D is one bit per cell: 35,904 bits = 4.4 KB per chunk -- and it is
   the same size whether the chunk holds a thousand chests or none:
     entries in the chunk   table   bitmap   bitmap / table
                        0     0.0 KB    4.4 KB           infinite
                        1     0.1 KB    4.4 KB            37.4x
                       10     1.2 KB    4.4 KB             3.7x
                     1000   117.2 KB    4.4 KB             0.0x
   Almost every chunk on a planet has ZERO entries -- nobody has been
   there -- and pays 4.4 KB anyway. Doc 22's player keeps hundreds of
   chunks resident, so D is megabytes of zeroes to shortcut a probe.

   C stores nothing and asks the table. One probe, at human rates. And it
   removes a bug class the other three have to remember not to write:
     place a chest, fill it, break it, put stone there.
     A: check the OLD type, then delete    -- two rules, one order-dependent
     B: clear the flag AND delete the blob -- two writes that can disagree
     D: clear the bit AND delete the blob  -- same, plus a resident bitmap
     C: delete the blob                    -- writing a block clears its
                                              side data. One rule, no cases.
   Under A a stale blob is INVISIBLE: the new type says "no side data", so
   nothing ever reads it, nothing ever frees it, and a chest placed there
   later inherits a dead player's inventory. That is the failure the
   type-gate makes possible and the probe cannot express.

   VERDICT: C. Existence is a property of the CELL, so the table that holds
   the data is the thing that should answer for it. The type keeps a real
   job -- it says what a freshly placed block is BORN with, and what a
   tag MEANS -- but it no longer gates whether an entry may exist. Which
   is what section 7 got wrong: it decided a per-CELL question from a
   per-TYPE fact, and that forbids ever naming a stone block.
   Doc 19's spare rotation bit stays spare either way.
```

## `boundary.js`

Which curve is a cell's edge? Three definitions are in play and doc 11 has carried the disagreement as the last structural gap. Doc 04 defines a cell by what hexRound maps to it; doc 14 meshes the dual polyhedron, whose corners are the centroids of subdivided triangles; and "everywhere equidistant on the sphere" is the intuitive reading. This measures what actually separates them, and whether the mesh can be made to draw the lookup's curve for free.

Cited by [doc 04](04-position-lookup.md), [doc 18](18-cell-boundary.md).

```
1. was it circumcentre versus centroid?
   planar lattice edge lengths, max/min: 1.000000000000
   |circumcentre - centroid| in the face plane: 0.00e+0
   No. An icosahedron face is equilateral and so is the lattice inside it,
   so the two coincide EXACTLY. Doc 11 guessed wrong; the difference is
   somewhere else entirely.

2. average-then-project, against project-then-average
   L    cells      max gap      mean gap    (in cell spacings)   halving?
   2       162   1.817e-2   1.463e-2
   3       642   1.009e-2   7.620e-3        0.5555
   4      2562   4.983e-3   3.842e-3        0.4937
   5     10242   2.477e-3   1.925e-3        0.4970
   6     40962   1.234e-3   9.628e-4        0.4982
   7    163842   6.158e-4   4.815e-4        0.4990
   8    655362   3.076e-4   2.407e-4        0.4996
   The lookup corner averages the FLAT lattice points and then projects.
   The mesh corner projects each point and then averages. That is the
   whole difference, and it HALVES with every level -- unlike every other
   discrepancy in this specification, which plateaus.

3. at the design level, in units a player could notice
   measured at L=8:            3.076e-4 spacings
   halving to L=11:            3.845e-5 spacings
   on the doc-06 planet's 1 m cells: 0.038 mm
   Doc 11 recorded all three definitions as agreeing "to within about 0.1
   of a cell". For these two that is out by a factor of about 2,600.
   The 0.11 figure belongs to a different pair -- hexround.js measured it
   against nearest-centre-ON-THE-SPHERE, and THAT one plateaus.

4. the sliver between the two outlines, as a share of one cell
   L     cell area      sliver
   4   5.7759e-3   4.43e-1% of the cell
   5   1.4565e-3   1.87e-1% of the cell
   6   3.6421e-4   9.39e-2% of the cell
   7   9.1058e-5   4.70e-2% of the cell
   Halving each level, so about 0.003% of a cell at level 11. A click that
   lands there is a click within a twentieth of a millimetre of the edge.

5. the fix: a corner is a lattice point of the same construction at 3n
   worst disagreement over every triangle at L=5: 2.98e-8 rad
   up-triangle   (i,j) -> lattice point (3i+2, 3j+1) at 3n
   down-triangle (i,j) -> lattice point (3i+1, 3j+2) at 3n
   So the exact corner costs one barycentric blend and one normalise from
   integer indices -- the same call that produces a cell centre. Nothing
   about doc 14 gets more expensive, and the corner count does not move.

6. what the lookup cell is, in the face plane
   corner-to-centre: min 0.018970687444  max 0.018970687444
   edge length:      min 0.018970687444  max 0.018970687444
   An EXACTLY regular hexagon. Every cell is, in its own face plane. The
   1.99:1 area spread doc 02 measures is entirely what projection does to
   it, and none of it is irregularity in the polygon.

7. two things that could have gone wrong, and did not
   convexity: 351 interior cells, 0 with a reflex corner
   the 30 face edges: same lattice points from both sides, worst gap 0.00e+0
   boundary crossing computed in each face's own plane, worst gap 2.11e-8 rad
   The per-face construction agrees with itself. There is no seam along the
   30 face edges -- which is where the cost was expected to turn up.

verdict
   The mesh and the lookup already draw the same curve to 0.04 mm at level 11,
   and the remaining difference is one ordering of operations. Take the
   lookup's: average the flat lattice points, then project. It is exact by
   construction, it is the same cost, and it closes the gap rather than
   measuring it.
```

## `calc.js`

Cited by [doc 06](06-world-sizing.md).

```
constant K = 1.20459
R=10000 L=13  exact d=1.470  formula d=1.470
R=6371000 L=10  exact d=7494.579  formula d=7494.579
R=1700 L=11  exact d=1.000  formula d=1.000

target R=1604m  L exact=10.92 -> 11  snapped R=1700m
circumference=10.68km  walk=2.12h  cells=41,943,042
```

## `check.js`

verify the rhombic triacontahedron construction before putting it in the artifact

Cited by [doc 02](02-geometry-choice.md).

```
edges: 30 each with 2 faces: true
max non-planarity (should be ~0): 8.095e-18
diagonal ratio min/max: 1.618034 1.618034  phi = 1.618034
RT defect: 20*(360-3*116.565) + 12*(360-5*63.435) = 720.00
```

## `coastline.js`

Where does a coastline come from? Today the coarse map sums two tiers of fBm and cuts the result at the percentile that leaves the intended land fraction standing, and a percentile cut through a smooth field draws a smooth curve. This measures how smooth, against two other ways of deciding where the land is: the sample direction warped before the continent lookup, and a land mask grown level by level up the subdivision hierarchy. The measurement that carries the answer is not the shape of one coast but how fast its perimeter grows as the map gets finer. A smooth curve doubles its step count when the cells halve; a ragged one more than doubles, and the excess is what "ragged" means as a number.

Cited by [doc 21](21-rivers-and-erosion.md).

```
1. how ragged the coastline is, and how that changes with resolution
   Perimeter of the largest landmass over the square root of its area.
   A round cap holding the same land gives 3.24.

   level              today           warp          grown          plate
   5         11.72   (781)  12.51   (827)  20.44  (1007)  16.79   (993)
   6         12.18  (1623)  14.11  (1865)  27.00  (2655)  22.05  (2807)
   7         13.23  (3523)  15.46  (4087)  36.78  (7239)  24.97  (6373)

   perimeter growth as the cells halve, and the dimension it implies
   today  x2.08 then x2.17   dimension 1.06 then 1.12
    warp  x2.26 then x2.19   dimension 1.17 then 1.13
   grown  x2.64 then x2.73   dimension 1.40 then 1.45
   plate  x2.83 then x2.27   dimension 1.50 then 1.18
   A smooth curve gives exactly x2 and a dimension of 1. Published figures
   for real coasts, quoted and not measured here, run from about 1.05 for
   South Africa through 1.25 for Britain to about 1.52 for Norway.

2. what each one does to the land itself
   at level 7
   today  land 30.0%  largest landmass  27305  islands   45
    warp  land 30.0%  largest landmass  26913  islands   43
   grown  land 30.4%  largest landmass  14910  islands  312
   plate  land 30.0%  largest landmass  25072  islands  136
   Three of the four cut a height field at a percentile, so they land on the
   asked-for fraction exactly. The grown mask has no height field and no
   percentile in it, so `creation` was searched for the value that reaches
   the same fraction, and it arrives near it rather than on it.

3. the distance to the coast, and the height built on it
   every cell reached: -47 cells at the deepest sea to 26 inland
   grown, once the profile and the relief are laid on it:
   ratio 28.61 against 36.78 for the bare mask, islands 193 against 312
   Relief laid over a baseline and re-cut at sea level pulls the thinnest
   filaments back under, so the profile tempers the mask rather than
   inheriting it whole.

4. how long a river gets, which is what the land allows
   today  longest river  172 cells  on a landmass of  27305
    warp  longest river  153 cells  on a landmass of  26913
   grown  longest river   83 cells  on a landmass of  16064
   plate  longest river   94 cells  on a landmass of  25072
   A river cannot be longer than the land it crosses, which is what holds
   the grown field down: its largest landmass is little over half the
   others. The plate field keeps the land and still loses the length, so
   there the limit is the ground rather than the coast -- a range raised
   along every seam cuts the interior into separate basins, and a river
   runs from a ridge to the nearest coast instead of across the continent.

5. whether a preview at a lower level is the map you get
   cells of the level-6 map that the level-8 map disagrees with, of 40962
   today      7  = 0.017%
    warp      4  = 0.010%
   grown    901  = 2.200%
   plate   1528  = 3.730%
   Noise is sampled from a direction, so a cell that exists at both levels
   is handed the same height at both, and only the percentile moves.
   The other two build their features by running a process over the grid,
   and the grid is the thing that changes between the two maps: the grown
   mask reconsiders inherited cells at every level, and a plate range is a
   band a fixed number of cells wide, which cannot be narrower than one
   cell on the coarser map however few metres it is meant to be.

verdict
   The coastline that ships is a smooth curve by the only measurement here
   that does not depend on resolution: its perimeter grows x2.08 then x2.17
   as the cells halve, against x2 for a curve carrying no detail at all.
   That is the smooth end of the real range rather than outside it.

   Warping the direction moves it to x2.26 and x2.19, which is not a change
   anyone would see, at the one amplitude tried.

   The two that build structure both reach a ragged coast and both charge
   for it, in different places. Growing the mask gives up the land fraction
   as a number that can be asked for, and halves the largest landmass.
   Plates keep both -- the fraction is exact and the landmass survives -- and
   lose the rivers a different way, by raising a range along every seam and
   cutting the interior into basins.

   Only the two noise fields preview faithfully. A field built by running a
   process over the grid disagrees with itself across levels by 2 to 4% of
   the surface, because the grid is what the process runs on. A preview of
   one of those has to be built at the level it will be applied at.
```

## `coords.js`

Player-facing coordinates. "x: 412, y: 68, z: -190" says nothing useful on a sphere, so the readout has to be latitude, longitude and altitude. That raises three questions a design has to answer: where the axis goes, how many decimal places actually name a cell, and whether a rounded readout is precise enough to share.

Cited by [doc 20](20-player-coordinates.md).

```
1. choosing the axis: run it through an antipodal pentagon pair
   antipodal pairs among the twelve: 6  0-3 1-2 4-7 5-6 8-11 9-10
   with the axis through that pair, the twelve sit at these latitudes:
       90.000 deg   1 pentagon
       26.565 deg   5 pentagons
      -26.565 deg   5 pentagons
      -90.000 deg   1 pentagon
   Two poles and two rings of five. The same in every world ever generated,
   because the positions are geometry and no seed can move them.
   The ring latitude is atan(1/2) exactly: 26.565 deg.

   (b) do the six pairs differ at all?
     axis 0-3    90.000x1 26.565x5 -26.565x5 -90.000x1
     axis 1-2    90.000x1 26.565x5 -26.565x5 -90.000x1
     axis 4-7    90.000x1 26.565x5 -26.565x5 -90.000x1
     axis 5-6    90.000x1 26.565x5 -26.565x5 -90.000x1
     axis 8-11   90.000x1 26.565x5 -26.565x5 -90.000x1
     axis 9-10   90.000x1 26.565x5 -26.565x5 -90.000x1
   distinct latitude signatures among all six: 1
   They are the same world seen from a different angle. No measurement
   will ever prefer one, so the choice cannot be made on merit -- it can
   only be made once and written down.

   which faces meet each pole, and whether they are a contiguous run:
     0-3    north [0,1,2,3,4]  south [10,11,12,13,14]   BOTH CONTIGUOUS
     1-2    north [1,2,5,9,19]  south [7,11,12,16,17]
     4-7    north [6,10,11,15,16]  south [2,3,8,9,18]
     5-6    north [0,1,5,6,15]  south [8,12,13,17,18]
     8-11   north [9,13,14,18,19]  south [0,4,6,7,16]
     9-10   north [5,10,14,15,19]  south [3,4,7,8,17]
   exactly one pair has both caps contiguous: 0-3
   That is a property of the face LIST, not of the sphere -- but it is the
   only tiebreaker there is, and a weak written reason beats a coin flip.

   (c) where longitude 0 runs -- a separate free choice
   anchoring the prime meridian on v11, the second vertex of face 0
   (the first ring pentagon the face table names after the north pole):
     v 7   lat   26.565 deg   lon -144.000 deg
     v10   lat   26.565 deg   lon  -72.000 deg
     v11   lat   26.565 deg   lon    0.000 deg
     v 5   lat   26.565 deg   lon   72.000 deg
     v 1   lat   26.565 deg   lon  144.000 deg
     v 8   lat  -26.565 deg   lon -180.000 deg
     v 6   lat  -26.565 deg   lon -108.000 deg
     v 2   lat  -26.565 deg   lon  -36.000 deg
     v 4   lat  -26.565 deg   lon   36.000 deg
     v 9   lat  -26.565 deg   lon  108.000 deg
   every ring longitude is an exact multiple of 36 deg: true
   So all twelve pentagons land on round numbers: poles at +/-90, the
   northern five at 0 and +/-72 and +/-144, the southern five offset by 36.
   Costs nothing, and makes doc 17's landmarks nameable and greppable.

2. how fine the readout has to be
   planet            block   1 cell in degrees   decimals to resolve a cell
   doc-06 worked      1.00 m      3.37e-2        2
   10 km              1.47 m      8.43e-3        3
   100 km moon        1.84 m      1.05e-3        3
   Earth-sized        1.83 m      1.65e-5        5
   On the worked planet a cell is 0.0337 deg across, so TWO decimal places
   resolve 0.30 m -- finer than a 1 m cell. Earth needs five. A small planet
   is easier to read, not harder: the same block covers more angle.

3. round-tripping a rounded readout back to a cell
   decimals   lands in the same cell   worst miss
       1          13.6%             2.04 cells
       2          87.5%             0.21 cells
       3          98.8%             0.02 cells
       4          99.9%             0.00 cells
   Two decimals land in the right cell seven times in eight, and the worst
   case is under a cell away -- so it is always you or a neighbour. Fine for
   TELLING someone where you are, useless as an identity. That is the ID.

4. what a degree of longitude is worth, by latitude (R = 1,700 m)
   latitude    1 deg of longitude    cells across
        0 deg      29.67 m          30
    26.57 deg      26.54 m          27
       45 deg      20.98 m          21
       60 deg      14.84 m          15
       80 deg       5.15 m           5
       89 deg       0.52 m           1
   At the two polar pentagons longitude stops meaning anything, which is
   exactly what every player already expects a compass to do at a pole.

5. sharing an exact location
   D=11: address 29 bits -> 6 chars,  +10-bit layer 39 -> 8 chars,  +12-bit planet 51 -> 10 chars
   D=13: address 33 bits -> 7 chars,  +10-bit layer 43 -> 9 chars,  +12-bit planet 55 -> 11 chars
   So an exact, lossless "here" inside one world is EIGHT base-36
   characters, and TEN if the code has to say which planet too.
   Either way a player can read it aloud, and it never needs a
   decimal point.

verdict
   Put the axis through an antipodal pentagon pair: both poles land on
   protected, standable landmarks and the other ten sit on two rings at
   +/-26.57 deg, identically in every world. WHICH pair cannot be decided on
   merit -- all six give the same world rotated -- so decide it by the only
   asymmetry there is and record it: axis through 0-3, north at v0, prime
   meridian through v11. Show latitude and longitude to
   TWO decimals plus altitude in metres -- that resolves 0.30 m on the worked
   planet. Show it, but do not share it: the shareable form is the cell ID,
   which is 39 bits with its layer -- eight base-36 characters, or ten
   if the code names the planet as well.
```

## `determinism.js`

Do two machines agree? Doc 15 left this open and doc 22 now leans on it: a client can only regenerate the coarse map instead of downloading it if the noise comes out bit for bit. IEEE 754 specifies some operations exactly and leaves others to the platform's maths library, so the answer depends entirely on which ones each path uses.

Cited by [doc 23](23-determinism.md).

```
1. which operations each path uses
   IEEE 754 requires + - * / and sqrt to be CORRECTLY ROUNDED, so every
   conforming machine returns the same bits. It says nothing about sin, cos,
   atan2, acos, exp or pow -- those come from the platform maths library and
   differ between them, usually in the last bit or two.

   exact    position -> cell (doc 04)    + - * / compare round    the whole hot path
   exact    ID -> position (doc 15)      + - * / sqrt             one blend, one normalise
   exact    up = normalize(pos)          + - * / sqrt             gravity and all three frames
   exact    value / gradient noise       + - * / integer hash     if written without trig
   exact    ray walk (doc 09)            + - * / compare          a quadratic and comparisons
   PLATFORM  lat / long readout (doc 20)  asin atan2               display only
   PLATFORM  distances, horizon (doc 13)  acos                     display and UI
   PLATFORM  stream power (doc 21)        pow with a real exponent erosion, offline

   So the entire runtime pipeline -- find the cell, place the block, draw it,
   walk the ray -- is built from operations the standard pins down. The
   platform-dependent ones are display, or offline, or both.

2. how near a random position lands to a cell boundary
   400,000 random positions, margin in cell spacings
   within        share            implies
      1e-3     1.72e-2      1 in 5.8e+1
      1e-4     3.04e-3      1 in 3.3e+2
      1e-5     3.80e-4      1 in 2.6e+3
      1e-6     0.00e+0      1 in 4.0e+5
      1e-7     0.00e+0      1 in 4.0e+5
   closest approach seen: 1.21e-6 spacings
   The share falls exactly in step with the threshold, which is what a
   uniform distribution across the cell does -- so it extrapolates.

   one ULP of a unit direction: 2.22e-16 radians
   one cell spacing at D=11:    5.88e-4 radians
   so a last-bit disagreement is 3.8e-13 of a cell,
   and by the table above it changes the answer about once in 2.6e+12 positions.

3. does a last-bit difference amplify through the pipeline?
   worst amplification, measured in cell spacings both sides: 286.20x
   worst absolute displacement: 5.76e-13 of a cell
   against the 1.21e-6 closest approach seen in section 2
   It DOES amplify -- a few hundred times -- and it does not matter. A few
   hundred last bits is still under a millionth of the closest any sampled
   position came to a boundary, so nothing reaches the edge of a cell.

4. where a last-bit difference does NOT stay small
   one independent ULP per cell changed the downhill neighbour of
   0 of 40,962 cells (0.0000%)
   Zero -- so routing is NOT the hair trigger it looks like. Two neighbours
   on a continuous height field are essentially never within a last bit of
   each other, so the comparison has an enormous margin. How enormous:

   perturbation      cells that reroute
         2e-16           0  (0.000%)
         1e-12           0  (0.000%)
          1e-9           0  (0.000%)
          1e-6           0  (0.000%)
          1e-3         971  (2.370%)
   Nothing moves until 1e-3, which is about thirteen orders of magnitude
   above a last-bit disagreement. The danger was never the size of the
   difference -- it is only whether a difference is introduced at all.

5. the exponents erosion needs, and whether they cost determinism
   exponent    written as        deterministic?  why
   m = 0.5     sqrt(x)           yes             IEEE 754 pins sqrt exactly
   m = 1       x                 yes             nothing to compute
   m = 2       x * x             yes             one multiply
   m = 1.5     x * sqrt(x)       yes             a multiply and a sqrt
   m = 0.45    pow(x, 0.45)      NO              the platform maths library decides
   Half-integer exponents are products of sqrt and multiply, both exact.
   An arbitrary real exponent needs pow, and pow is where platforms differ.
   So this is a choice, not a constraint: pick m and n from the exact set
   and the erosion pass is bit-identical everywhere too.

verdict
   The runtime is safe by construction. Position -> cell, ID -> position, up,
   the ray walk and integer-hashed noise use only + - * / sqrt and compares,
   all of which IEEE 754 pins to the bit. Transcendentals appear only where a
   difference cannot matter: the coordinate readout and distances on screen.

   And the fear about flow routing was misplaced. A last-bit difference
   reroutes NOTHING -- routing only starts to move seven orders of magnitude
   higher. The risk was never that differences are amplified; it is only
   whether a difference is introduced at all.

   Which makes it a rule about function calls, not about tolerances: never
   call a transcendental anywhere its result feeds a stored or shared value.
   Choose erosion exponents from {0.5, 1, 1.5, 2}, write noise with an integer
   hash, and the coarse map can be regenerated client-side after all -- so
   doc 22 may have its 2.5 MB back.
```

## `edits.js`

A player dams a river. The coarse map from doc 21 is computed once at world creation and read only, so it still says the river runs there. Something has to give. Before choosing what, measure how far a single edit actually reaches -- upstream, downstream, and how often an edit touches a river at all.

Cited by [doc 24](24-edits-and-global-processes.md).

```
level 7: 163,842 cells, 30% land, one cell 16.0 m across

1. how often an edit lands on flowing water at all
   upstream cells   cells at or above   share of land
            10             9343      19.01%
            50             2717      5.53%
           200              797      1.62%
          1000               37      0.08%
   Most of the land is hillside, not channel. The overwhelming majority of
   what a player builds never meets a river, so whatever this costs, it is
   paid rarely.

2. damming a river takes a wall, not a block
   site carrying 354 upstream cells, wall 2% of the height range tall
   wall spans   cells raised   cells flooded   lake reaches
        1 cells              1               0        0 m
        3 cells              7               1       16 m
        5 cells             19              29      144 m
        7 cells             37              32      128 m
   One block dams nothing -- the water simply goes round it, which is what
   a hex grid with six ways out should do. A wall has to span the channel
   before anything backs up, and once it does the lake is bounded by the
   valley: water rises to the lowest lip and stops.

3. downstream, and the thing a small planet does not give you
   longest flow path on this world: 84 cells = 1344 m
   dam at        held back   deficit after 5 / 20 / 50 steps   reaches the sea?
     74 from sea         31     35%    7%    4%            no
     50 from sea        499     87%   69%   38%            yes
     25 from sea         64     86%   25%   --              yes
      8 from sea        234     93%   --     --              yes
   The deficit is the share of the flow that is missing. It depends entirely
   on WHERE you dam. High up, tributaries below refill the river and the
   deficit fades to a few percent within twenty cells -- the sea never hears
   about it. On a main stem there is nothing below big enough to make up the
   difference, so the loss runs to the coast. One of these has a local
   answer and the other does not, and they are the same edit.

4. if the coarse map could be overridden, what would it cost?
   the whole level-8 map:            655,362 cells, 2.50 MB
   a 100 m pond                          491 coarse cells = 1.9 KB  (0.0749% of the map)
   a 300 m lake                         4418 coarse cells = 17.3 KB  (0.6741% of the map)
   An override layer is small. The question was never storage -- it is what
   happens to everything downstream of the cell you changed.

verdict
   Two different shapes of consequence, and they want different answers.
   UPSTREAM the effect is bounded by terrain: the lake fills to the lowest
   lip and stops, a few hundred metres across even on a main stem. That is
   small enough to simulate locally from the delta store, with no change to
   the coarse map at all.
   DOWNSTREAM it depends where. A headwater dam fades to a few percent within
   twenty cells and the coast never notices. A main-stem dam is felt all the
   way down, because nothing below it is big enough to refill the river.
   So the same player action is local in one place and global in another --
   which is why a single rule cannot cover it, and why the honest answer is
   to bound what the coarse map is allowed to promise.
```

## `frame.js`

Gravity and orientation: the local frame, its holonomy, and what the grid's 720 degrees does to direction indices.

Cited by [doc 13](13-gravity-and-orientation.md).

```
1. parallel transport around a circle of colatitude t (unit sphere)
   (holonomy is an angle mod one full turn, so both are compared mod 360)
   colat   holonomy   solid angle 2pi(1-cos t)   diff
     10deg     5.4692deg         5.4692deg   -8.80e-10
     30deg    48.2309deg        48.2309deg    -6.39e-9
     60deg   180.0000deg       180.0000deg    -1.11e-8
     90deg     0.0000deg       360.0000deg    5.68e-14
    120deg   180.0000deg       540.0000deg     1.11e-8

2. the 720deg, two ways  (cells = vertices of the subdivided icosahedron)
   L   cells  pent  GEOMETRIC defect/pentagon   720/N    total     COMBINATORIAL 6-deg  total
   1      42    12       15.6901deg  17.1429deg   720.000deg            1 unit     720deg
   2     162    12        3.3420deg   4.4444deg   720.000deg            1 unit     720deg
   3     642    12        0.7429deg   1.1215deg   720.000deg            1 unit     720deg
   4    2562    12        0.1740deg   0.2810deg   720.000deg            1 unit     720deg
   5   10242    12        0.0421deg   0.0703deg   720.000deg            1 unit     720deg
   geometric defect shrinks ~4x per level; the combinatorial unit never does.

3. walk the ring of one cell, carrying a direction index (level 4)
   around each of the 12 pentagons: slip = 1 index  (= 60 deg)
   around all 2490 pentagon-free hexagons:  slip = 0 index
   12 pentagons x 60deg = 720deg  -- Gauss-Bonnet, in direction-index units
   pentagon interior angle between adjacent directions: 71.965deg
   so a line entering a pentagon deflects by 36.070deg either way -- straight is not an option

4. antipodal structure of the pentagons
   every icosahedron vertex has its negation as a vertex: true
   -> the 12 pentagons form 6 antipodal pairs: 0-3 1-2 4-7 5-6 8-11 9-10
   so a lat/long axis can be chosen through a pentagon pair: the two
   coordinate poles then land exactly on two of the twelve pentagons.

5. consequences on the doc-06 planet (R = 1700 m, 1 m blocks)
   separation   relative tilt of "up"
         1 m   0.034deg
        10 m   0.337deg
        50 m   1.685deg
       100 m   3.370deg
       500 m   16.852deg
      1000 m   33.703deg
   eye height   horizon distance   (Earth, R = 6371 km)
       1.7 m       76 m            4.7 km
        10 m      184 m            11.3 km
        50 m      407 m            25.2 km
       200 m      787 m            50.5 km
   D=11 C=4: chunk spans 128 cells -> "up" varies 4.314deg across it
   D=11 C=6: chunk spans 32 cells -> "up" varies 1.079deg across it
   D=11 C=8: chunk spans 8 cells -> "up" varies 0.270deg across it
```

## `hexround.js`

Does rounding a barycentric triple actually give the CONTAINING cell? On a flat triangular lattice the Voronoi cell of a lattice point is the hexagon, exactly. The real cells are Voronoi regions ON THE SPHERE of the same lattice radially projected outward, and gnomonic projection preserves straight lines but not equidistance -- so the two Voronoi diagrams need not agree. This measures whether they do.

Cited by [doc 04](04-position-lookup.md), [doc 15](15-precision-and-origin.md).

```
does hexRound return the cell whose centre is nearest on the sphere?
  hexRound finds the nearest lattice point in the FLAT face plane. Whether
  that is also the nearest ON THE SPHERE is the open question from doc 11,
  because gnomonic projection keeps straight lines but not equidistance.

   L   cells   samples   mismatches      rate   worst margin   furthest off
   2     162     40000         1423    3.558%        0.10795       1.043 cells
   3     642     40000          823    2.058%        0.08750       1.084 cells
   4    2562     25000          371    1.484%        0.07123       1.095 cells
   5   10242     15000          171    1.140%        0.07072       1.082 cells
   6   40962     12000          148    1.233%        0.06305       1.083 cells
   7  163842      5000           70    1.400%        0.05138       1.088 cells

  margin       = how much further hexRound's cell is than the true nearest,
                 as a fraction of one cell spacing
  furthest off = distance between the two cells; 1.0 means edge-adjacent

  RESULT: hexRound and nearest-centre-on-the-sphere DISAGREE, and the rate
  settles near 1% instead of falling to zero: 3.56% -> 2.06% -> 1.48% -> 1.14% -> 1.23% -> 1.40%
  (the last three levels are sampling-limited, +/- 0.1 to 0.2 points, so read
  them as a plateau around 1% rather than as a trend)
  It plateaus because a face triangle's shape is scale-free: refining shrinks
  the cells and the disagreement band together, so their ratio holds.

  But every disagreement is small and local:
    - the two cells are always EDGE-ADJACENT (worst separation 1.095 spacings)
    - hexRound's cell is at most 0.1079 of a spacing further away
    - mean overshoot among disagreements is 0.0215 of a spacing
  So a point is only ever handed to a neighbour when it sits within about a
  tenth of a cell of the boundary between them.

  READ THIS THE OTHER WAY UP. hexRound is a pure function of position, so it
  already defines a partition of the sphere: exact, gap-free, overlap-free,
  and edge-adjacent everywhere. It is the radial projection of the PLANAR
  Voronoi diagram. That partition is not wrong -- it is simply a different
  definition of "the cell" from spherical Voronoi, and the two differ by at
  most 0.108 of a cell.

  The design decision is therefore which one is normative, not which one is
  correct. Defining cells as the projected planar Voronoi diagram makes doc 04
  exact by construction and doc 09's straight-line ray walk exact as well.
  Defining them as spherical Voronoi makes both approximate by ~1%. Doc 14
  meshes a third thing again -- the dual polyhedron's corners -- so the
  specification currently implies three boundaries that agree only to ~0.1
  of a cell. Pick one and say so.
```

## `id.js`

The cell ID as an actual 64-bit word. Doc 03 draws the layout, doc 07 says finding a chunk is "one shift", doc 06 says "chunk size remains tunable after launch: it does not change world data", and doc 22 leans on a contiguous range being a compact patch. Nothing had ever packed the bits and checked those together. Packing them turns up three problems, and they are not compatible with each other -- so this measures the problem rather than announcing a fix. Adding a planet field for multiple worlds is what forced the question.

Cited by [doc 03](03-addressing.md), [doc 11](11-open-topics.md).

```
1. does the drawn packing survive a change of chunk level?
   doc 03: [ 5 bits ][ 2 bits x C ][ (D-C) ][ (D-C) ]  face, path, q, r
   and: "moving the chunk boundary does not change the address at all --
   it only moves where the line is drawn through the same number."

   width is 5 + 2D = 17 bits at every C -- that half of the claim holds
   cells whose packed VALUE is the same at every C: 1 of 2145
   e.g. (i,j) = (0,1) at C = 0..6:  28673  28673  28673  28673  28673  28673  28674
   The value moves because path digits are NOT a bit-slice of (i, j): the
   descent picks one of four children per level and the middle child flips
   the frame. Re-cutting at a different C re-encodes the low half.
   Consequence: under this layout the chunk level is baked into every ID
   ever written to disk, and doc 06's "tunable after launch" is false.

2. can the path just go all the way down, so C never appears?
   leftover (q, r) after descending to FULL depth:
     (0,0)  1429 cells
     (0,1)  715 cells
     (1,0)  1 cells
   3 distinct values, so 2 bits are still needed at the bottom.
   The reason is invariant 3, and it is not negotiable: a triangle of side
   1 still has THREE vertices, and a cell IS a vertex. Path digits address
   TRIANGLES. They cannot address a vertex however deep they go.

3. do q and r fit in (D-C) bits each?
    D   C   m = 2^(D-C)   max q   max r   bits needed   doc 03 gives   fits?
    6   0           64      64      64             7              6   NO
    6   2           16      16      16             5              4   NO
    6   4            4       4       4             3              2   NO
    8   2           64      64      64             7              6   NO
    8   6            4       4       4             3              2   NO
   11   6           32      32      32             6              5   NO
   Never. A chunk of side m has lattice coordinates running 0..m INCLUSIVE,
   which is m+1 values and needs (D-C)+1 bits. Same reason as section 2 --
   a triangle of side m carries m+1 vertices along each edge, not m.
   So the address is 5 + 2D + 2 bits, not 5 + 2D. Two bits, everywhere.

4. what the options actually are
   encoding                              addr bits   C-free   chunk lookup            range = patch
   A  store (i, j) directly                     29   yes      NO -- needs the descent  NO
   B  store path + (q, r) at a fixed C          29   NO       yes -- one shift        yes
   C  path to depth D + 2-bit corner            29   yes      yes -- one shift        yes

   A loses the property doc 03 exists for: with (i, j) packed as two plain
   numbers a chunk is not a contiguous range, so doc 22's disk locality
   (5 runs fetch 62% of a region) goes with it.
   B keeps everything except tunability -- C joins blockSize and D as fixed
   at world creation, which is a real but small loss.
   C keeps all three at the SAME bit cost as A, by naming the side-1
   triangle and then which of its corners. The cost is that a vertex is
   shared by up to six such triangles, so encoding needs a canonical pick --
   which is doc 03's "lowest ID wins" applied one level further down, the
   same rule rank.js already proved partitions the sphere exactly.
   C is NOT yet verified. It is the recommendation, not a result.

   whichever wins, the word at D 11 with a 12-bit planet field:
     planet 12 + address 29 + layer 10 = 51 of 64, 13 spare
     4,096 worlds, 41,943,042 cells each

5. option C, built and checked
   D=3:     3,840 (triangle, corner) pairs ->     642 cells   expected     642   exact
         canonical names distinct: 642/642   decode round-trip: 642/642   width 13 bits
   D=4:    15,360 (triangle, corner) pairs ->   2,562 cells   expected   2,562   exact
         canonical names distinct: 2562/2562   decode round-trip: 2562/2562   width 15 bits
   D=5:    61,440 (triangle, corner) pairs ->  10,242 cells   expected  10,242   exact
         canonical names distinct: 10242/10242   decode round-trip: 10242/10242   width 17 bits
   Every cell is named, once, by the smallest of its representations --
   and the count lands on 10*4^D + 2 at every depth, which is the same
   check rank.js used on the border rule this reuses.

6. does truncating a canonical name still give the owning chunk?
   canonical name truncated vs "lowest chunk ID wins", every cell and
   every chunk level: 61,452/61,452 agree
   So the shift and the ownership rule are the same answer -- because the
   chunk prefix sits in the high bits, so the smallest full name carries
   the smallest prefix. Nothing new has to be stored or looked up.

7. how much of the address space actually names a cell?
   field           values   used   share
   face      5 bits      32     20    62.5%   only 20 icosahedron faces exist
   corner    2 bits       4      3    75.0%   a triangle has three corners
   path   2D bits   4^D    4^D   100.0%   every digit combination is a triangle

   and then the canonical rule throws most of what is left away, because
   a vertex is a corner of up to six triangles and only one name survives:

     D    address bits        codes       cells   used
     3             13        8,192         642   7.84%
     5             17      131,072      10,242   7.81%
    11             29  536,870,912  41,943,042   7.81%

   The share tends to 10/128 = 7.8125%, flat in depth:
   62.5% of the face field x 75% of the corner field x 1/6 for the six
   triangles sharing a vertex = 7.8125%.
   That is 3.68 bits spent, against the 1.68 bits the q/r draft spent.
   So doc 03's "31.25% of the code space" belongs to the superseded
   layout. Option C uses 7.81% and costs 2 bits more -- which is exactly
   the 2-bit corner field, arriving as a wider word rather than as a
   cleverer one. Still no lookup tables anywhere, which was the trade.

verdict
   Doc 03 asked for three things at once -- a fixed width, a chunk reachable
   by one shift, and a chunk level that can move after launch -- and the
   layout it drew delivered the width only. Two of the three problems are
   forced by invariant 3: a cell is a VERTEX and path digits name TRIANGLES.

   OPTION C IS TAKEN, AND IT HOLDS. Name the depth-D triangle with D
   quaternary digits, then 2 bits for which of its three corners, and
   canonicalise by lowest packed ID. Every cell is named exactly once at
   depths 3, 4 and 5 -- the counts land on 10*4^D + 2 -- names are distinct,
   they decode back, and truncating one agrees with doc 03's ownership rule
   at every cell and every chunk level. The chunk is still one shift.

   ADDRESS = 5 + 2D + 2 bits.  WORD = [planet 12][address 29][layer 10]
   = 51 of 64 at D 11, 13 spare, 4,096 worlds of 41,943,042 cells.
```

## `interest.js`

Multiplayer interest management. Doc 11 has always called this the easy one: "which players care about this chunk update is an ID range comparison, and the addressing scheme does the work". A contiguous ID range IS one compact patch of surface (doc 03) -- but the question here is the CONVERSE, and the converse of a true statement is not free. This measures it.

Cited by [doc 22](22-multiplayer-interest.md).

```
worked planet: R = 1700 m, D = 11, chunk level C = 6
  81,920 chunks, each about 32 m across

1. how many ID ranges a player's interest region breaks into
   radius      chunks in range   contiguous ID runs   chunks per run
      76 m             41              10.9            3.73
     200 m            289              31.4            9.22
     500 m           1765              80.2           22.00
    1000 m           6884             155.6           44.24
   A contiguous ID range really is one compact patch of surface -- doc 03
   is right about that. But a DISC is not a subtree, so the converse fails:
   a player's region is not one range, it is many.

2. does doc 03's child order reduce the fragmentation?
   naive [0,1,2,3]      650 chunks in   55.7 runs   11.67 chunks per run
   doc 03 [0,3,1,2]     632 chunks in   48.6 runs   12.99 chunks per run
   The ordering barely moves it, and that is expected: order.js showed the
   four children cannot be walked edge-to-edge, so the curve jumps whatever
   order you pick. Fragmentation is a property of the tree, not the walk.

3. the cost of not being clever: one dot product per player per update
   20,000 updates x 200 players = 4.0M tests, single threaded
   comfortably over 100M tests per second  (this run: 182M -- a timing, so it moves run to run)
   A busy server does not produce 20,000 chunk updates a second. The whole
   question is smaller than the machinery doc 11 imagined for it.

4. what the ID ordering is actually good for
   one player at 300 m: 583 chunks in 37 runs
   the 5 largest runs cover 364 of them (62%)
   So a handful of range reads fetches most of what a player needs, and the
   tail is singletons. That is a DISK layout win -- sequential reads -- not
   an interest-test win.

verdict
   Doc 11 called this "specifying, not inventing" and it is, but not for the
   stated reason. A contiguous ID range is one compact patch; a compact patch
   is NOT one contiguous range, and a player's disc breaks into tens to
   hundreds of runs however the children are ordered. The interest test wants
   a dot product per player, which is free. The ID ordering earns its keep on
   DISK, where a few long runs fetch most of a player's region sequentially.
```

## `language.js`

Which language and runtime -- the last item on doc 11's Part 1 list, and the only one that still blocked the first line of code. node verification/language.js Doc 23 argued from the IEEE 754 standard that the runtime is bit-identical across machines, and then admitted the argument had never been run: "a real check would run the generator on two genuinely different platforms and compare hashes, which cannot be done from inside one script." It can be done from inside one script, one level down. Instead of two platforms, use SIX LANGUAGES on one machine, each compiling the same kernel through a different compiler, optimiser and runtime. If the pipeline is as pinned as doc 23 claims, they all produce the same bits. If any of them is free to rewrite the arithmetic, that one disagrees -- and which one disagrees is exactly the language decision. The kernel is not a toy. It is noise.js's pinned hash, the quintic fade, trilinear value noise, fBm accumulated low octave first, and doc 04's barycentric blend + normalize -- 20,000 samples, four float64s folded from each, 80,000 doubles hashed into one 64-bit digest. Nothing here needs a network and nothing is installed. Toolchains that are absent are skipped and named, so this script runs anywhere and says what it could not check.

Cited by [doc 11](11-open-topics.md), [doc 26](26-implementation-readiness.md), [doc 28](28-language-and-runtime.md), [doc 29](29-what-runs-where.md).

```
language.js -- which language and runtime, decided by running the kernel
             in every one of them and comparing the bits

0. what the specification requires of a language, and which doc requires it
   wrapping uint32 arithmetic   doc 08   noise.js pins a hash of 3 wrapping multiplies and 2 xor-shifts
   IEEE 754 + - * / and sqrt    doc 23   position -> cell, ID -> position, gravity and the ray walk are all in that set
   no implicit contraction      doc 23   a*b+c fused into one rounding is a DIFFERENT number
   a fixed reduction order      doc 08   fBm at 4 and 5 octaves differs by 1.4e-17 if the order moves
   float64 that stays float64   doc 15   offsets are float64; an x87 80-bit intermediate would not be
   float32 for GPU-facing data  doc 15   per-vertex, chunk-relative -- 122 um at R 1700
   no GC pause in a frame       doc 14   ~21,000 cells and 84,000 triangles are rebuilt per chunk change
   one binary for two targets   doc 22   the client REGENERATES the coarse map, so it runs the server's code

   The first four are the sharp ones: they are properties of the LANGUAGE
   and its optimiser, not of the code someone writes in it. Sections 1-3
   measure them. The last four are engineering, and section 5 weighs them.

1. the same kernel in six languages and one wasm target: do the bits agree?
   20,000 samples, 80,000 float64s folded into one 64-bit digest

   language     build                          digest             vs JS
   JavaScript   node v22.22.2                  482495611b7ba324   SAME
   C            gcc -O2, baseline ISA          482495611b7ba324   SAME
   Rust         rustc -O, target-cpu=native    482495611b7ba324   SAME
   Java         javac/java, default            482495611b7ba324   SAME
   Go           go build, amd64                482495611b7ba324   SAME
   Python       CPython 3                      482495611b7ba324   SAME

   6 of 6 agree, bit for bit, over the whole pipeline.
   Every one of these has a different compiler, a different optimiser and a
   different runtime, and they land on the same 64 bits. Doc 23 argued this
   from the standard; this is the argument actually run.

   recorded digest  482495611b7ba324   measured on
                    x86-64 Linux, node 22 / gcc 13 / clang 18 / rustc 1.94 / OpenJDK / go 1.24 / CPython 3.11
   this machine     482495611b7ba324   <- SAME. A different machine, the same bits.

2. the one thing that breaks it, and it is not a language
   the SAME C source, the SAME machine -- only the flags move:

   build                                          digest             vs JS
   gcc -O2 -march=x86-64                        482495611b7ba324   SAME
   gcc -O2 -march=haswell                       7e508b42b4ccffc9   DIFFERENT
   gcc -O2 -march=haswell -ffp-contract=off     482495611b7ba324   SAME
   gcc -O3 -flto -ffp-contract=off              482495611b7ba324   SAME
   gcc -Ofast ... -ffp-contract=off             4eca155245ffb1c3   DIFFERENT
   clang -O2 -march=x86-64                      482495611b7ba324   SAME
   clang -O2 -march=haswell                     9ecaa4f71474266b   DIFFERENT
   clang -O2 -march=haswell -ffp-contract=off   482495611b7ba324   SAME

   4 distinct answers from one source file.
   -march=haswell alone changes the result, because it makes FMA available
   and both compilers then fuse "sum += amp*value3(...)" into a single
   rounding. That is a DIFFERENT number, not a more accurate one -- and
   gcc and clang do not even fuse the same way, so they disagree with each
   other as well as with everyone else.

   THIS IS NOT AN EXOTIC BUILD. x86-64 baseline has no FMA, so the plain
   build here happens to be safe. aarch64 has FMA in the BASELINE -- every
   Apple Silicon Mac and every phone -- so on those targets the DEFAULT
   build is the contracting one. An x86 server and an ARM client compiled
   from the same source would generate two different planets.

   And -ffp-contract=off is necessary, not sufficient: -Ofast turns
   -ffast-math back on and re-associates regardless, so the rule has to be
   a prohibition on a family of flags, which no flag can enforce.

2b. C to wasm, and the trap in the escape hatch
   ONE C source file, compiled for the browser and for the machine:

   build                                       digest             vs the rest
   clang --target=wasm32 -O2                 482495611b7ba324   SAME
   clang --target=wasm32 -msimd128 -mrelaxed-simd 482495611b7ba324   SAME
   clang --target=wasm32 -O3 -msimd128 -mrelaxed-simd -ffast-math 827411168053f080   DIFFERENT
   clang -O2 -march=x86-64                   482495611b7ba324   SAME
   clang -O2 -march=native                   9ecaa4f71474266b   DIFFERENT
   clang -O2 -march=native -ffp-contract=off 482495611b7ba324   SAME

   BASELINE WASM HAS NO FMA INSTRUCTION, so a C core compiled for the
   browser CANNOT contract -- it agrees with everyone by construction. The
   same source compiled for the machine it is sitting on DOES contract, and
   disagrees.

   That is the trap, and it is the opposite way round from the intuition.
   The moment a project has BOTH a wasm build and a native build of one C
   core -- a browser client and a native server, which is exactly the
   reason people reach for this -- THE TWO GENERATE DIFFERENT PLANETS,
   unless the flag is set and stays set. On aarch64 the contracting build
   is the default.

   BUT WASM IS NOT UNCONDITIONALLY SAFE, and the rows above show it. What
   wasm cannot do is CONTRACT -- there is no instruction to fuse into. It
   can still be broken by -ffast-math, which RE-ASSOCIATES: a source-level
   transformation that has nothing to do with the instruction set, and it
   breaks the wasm build exactly as it breaks the native one.

   So the rule is TWO rules, not one flag:
     -ffp-contract=off      needed on the NATIVE build only
     never -Ofast/-ffast-math   needed on BOTH
   and only the second is visible in a wasm-only test.

   Relaxed SIMD is a third door and it did NOT open here: -mrelaxed-simd
   left the digest alone, because nothing auto-vectorised this scalar
   code into a relaxed madd. The wasm spec makes those operations
   deliberately non-deterministic, so that is a did-not-reproduce rather
   than a clearance.


   AND WHICH TARGETS DO THIS BY DEFAULT? Ask the code generator. `a*b+c`,
   -O2, counting fused instructions in the assembly:

     target                       default   with -ffp-contract=off
     x86_64-linux-gnu             plain     plain
     aarch64-linux-gnu            FUSES     plain
     x86_64-apple-darwin          plain     plain
     aarch64-apple-darwin         FUSES     plain
     aarch64-pc-windows-msvc      FUSES     plain

   EVERY aarch64 TARGET FUSES BY DEFAULT and every x86-64 one does not.
   Read the two Darwin rows together: the SAME source, the SAME compiler,
   the SAME default flags, on an Intel Mac and an Apple Silicon Mac, is
   two different pieces of arithmetic. This is not cross-platform. It is
   cross-MACHINE inside one platform, and nobody changed anything.

   JavaScript and TypeScript have none of these doors: section 1 measured
   them bit-identical with every other target, and the language
   specification pins the operations with no build step to get wrong.
   STAYING IN THE SCRIPTING LANGUAGE IS THE SAFER OPTION FOR DETERMINISM.

3. sqrt is safe and hypot is not, measured rather than assumed
   the same inputs, 4 runtimes, ONE machine and one libm underneath:

   fn      node              C/glibc           Rust              Java               agree?
   sin     3fe6a09e667f3bcc  3fe6a09e667f3bcc  3fe6a09e667f3bcc  3fe6a09e667f3bcc   yes
   cos     3fe6a09e667f3bcd  3fe6a09e667f3bcd  3fe6a09e667f3bcd  3fe6a09e667f3bcd   yes
   exp     40018bd669471caa  40018bd669471caa  40018bd669471caa  40018bd669471caa   yes
   pow     3fe645f7c63f2c6a  3fe645f7c63f2c6b  3fe645f7c63f2c6b  3fe645f7c63f2c6b   NO -- 1 ULP apart
   hypot   3fd7f254dab9cc3b  3fd7f254dab9cc3b  3fd7f254dab9cc3b  3fd7f254dab9cc3a   NO -- 1 ULP apart
   sqrt    3fd7f254dab9cc3b  3fd7f254dab9cc3b  3fd7f254dab9cc3b  3fd7f254dab9cc3b   yes

   sqrt(x*x+y*y+z*z) agrees, exactly as IEEE 754 requires -- so doc 23 is
   right that normalize is safe, and doc 15's old worry stays withdrawn.

   But hypot() is NOT sqrt(). It is a library routine, not an IEEE
   operation, and it disagrees here by one ULP between runtimes on the
   same machine. So does pow(). NORMALIZE MUST BE WRITTEN THE LONG WAY:
     length = sqrt(x*x + y*y + z*z)     safe, pinned, every platform
     length = hypot(x, y, z)            the obvious call, and wrong here
   This repository's own scripts use Math.hypot in 24 places. They are
   measuring, not specifying, and determinism.js priced one ULP at 3.8e-13
   of a cell -- so no number here moves. The ENGINE may not do it.

   Honest caveat: sin, cos and exp agree across all four here because they
   all sit on one machine's glibc. That is a did-not-reproduce, not a
   clearance -- a Windows or macOS libm is a different implementation, and
   pow already fails on this machine. Doc 23's rule stands unchanged:
   never call a transcendental where the result is stored or shared.

4. so the question is not "which language is deterministic"
   Every candidate measured in section 1 is bit-identical out of the box.
   The determinism requirement, which looked like the deciding constraint,
   eliminates exactly one candidate and only in its default configuration.

   language   bit-identical?                              wrapping u32
   Rust       yes, at every -O and target-cpu=native      wrapping_mul
   C / C++    ONLY with -ffp-contract=off and no -Ofast   unsigned overflow is defined
   Java       yes, strictfp is the default since 17       int wraps
   Go         yes here; the SPEC permits FMA fusion       uint32 wraps
   JS/TS      yes, the spec pins the operations           Math.imul
   Python     yes                                         masking, by hand

   Two entries need their asterisks read out loud.

   C and C++ are the only candidate that MEASURABLY BREAKS, and the repair
   is a build flag that any future -Ofast silently undoes. On aarch64 the
   broken configuration is the DEFAULT one.

   Go matched here, but this machine is amd64 and the Go specification
   EXPLICITLY PERMITS fusing x*y+z into an FMA. On arm64 the Go compiler
   does emit FMADD. This script cannot test that, so Go is a
   did-not-reproduce rather than a clearance -- the same standard applied
   to sin and cos above.

   That leaves the decision to be made on the OTHER four requirements from
   section 0, which is where it should have been made all along:
     no GC pause in a frame       doc 14 rebuilds 84,000 triangles a chunk
     float64 stays float64        doc 15 -- no 80-bit x87 intermediates
     float32 for GPU data         doc 15 -- per-vertex, chunk-relative
     ONE binary for two targets   doc 22 -- the client regenerates the map,
                                  so it runs the server's generator and must
                                  match it to the bit

   The last of those is the sharpest and it has barely been argued. Doc 22
   decided the client would regenerate the coarse map rather than download
   it, and doc 23 made that legal by pinning the arithmetic. But a browser
   client and a native server only agree if they are THE SAME CODE, and
   "compiles to both native and WebAssembly from one source" is a much
   shorter list than "is deterministic".

5. is the garbage collector the discriminator? (wall-clock, read ratios)
   (a) the generator kernel -- 400,000 samples, allocation-free
       measured separately, best of 5, process startup subtracted:
         C   gcc -O2        69 ms   1.00x
         Rust  rustc -O     79 ms   1.14x
         Go  go build       89 ms   1.29x
         Java  OpenJDK     111 ms   1.61x
         JS/TS node 22     121 ms   1.75x
       JavaScript is 1.76x C on the hottest path in the design, and Java
       is 1.60x. Neither is an order of magnitude, and neither allocates,
       so the GC never runs here at all.

   (b) the mesher -- building doc 14's 84,000-triangle buffer, per rebuild
       measured separately, best of 5, process startup subtracted:
         Rust, Vec<f32>            0.18 ms   1.00x
         JS, typed arrays          0.27 ms   1.50x
         JS, one object a vertex   4.13 ms   22.94x

       THE LANGUAGE GAP IS 1.5x. THE LAYOUT GAP IS 15x.
       Choosing the data layout matters roughly an order of magnitude more
       than choosing the language. And the 10x version is the one that
       allocates -- 42,000 objects per rebuild, which IS the GC case.
       The fast version allocates nothing and never collects.

       This machine, now: typed arrays 0.70 ms, one object a vertex
       7.01 ms -- a layout gap of 10x. Both are timings and move run to
       run; the ratio between them is the part that does not.

   SO "IT HAS A GARBAGE COLLECTOR" IS THE WRONG TEST. The right one is
   WHICH LAYOUT YOU GET BY WRITING THE OBVIOUS THING. In Rust the obvious
   thing -- a Vec of a struct -- is already contiguous. In JavaScript the
   obvious thing is an array of objects, and the fast path means hand-packing
   into ArrayBuffers, which is writing C in JavaScript. That is a real
   difference and it is a much smaller one than section 4 implied.

   HONEST CAVEAT: (b) builds a buffer; it does not mesh anything. There is no
   mesher, no physics step and no engine, so nothing here measures the whole
   frame. These two timings narrow the gap between the candidates. They do
   not close it, and they are not a benchmark of the game.

verdict
   RUST, and the reason is not determinism.

   Determinism turned out to be nearly free: six languages, six compilers,
   six runtimes, ONE digest over the whole pipeline. Doc 23 argued the
   runtime is bit-identical across machines and could not run the check;
   this is the check, one level down, and it passes. The only failure in
   the whole experiment is a C build with FMA contraction on -- which is the
   DEFAULT on every ARM target, and which two compilers get wrong in two
   different ways.

   So Rust is chosen on the requirements that were left:
     1. it is the only candidate that is bit-identical with NO BUILD FLAG,
        at every optimisation level, including target-cpu=native and fat
        LTO. The guarantee is in the language rather than the makefile, so
        it cannot be lost by someone adding -Ofast three years from now.
     2. wrapping_mul is spelled out, which is what doc 08's hash needs and
        what C leaves to a rule about signedness.
     3. no garbage collector, which doc 14's per-chunk remesh budget wants.
     4. it compiles to native AND to WebAssembly from one source, so doc
        22's browser client regenerating the coarse map is literally the
        server's code, not a reimplementation to be kept in sync.
     5. wgpu is one GPU story across desktop, and the same one in the
        browser.

   The honest runner-up is JAVA. It is exactly as deterministic, strictfp
   has been the default since 17, and Minecraft is the existence proof that
   the genre ships in it. It loses on the frame budget (a GC pause in a
   remesh) and on target 4 -- there is no good story for one codebase
   running native and in a browser.

   C++ has the highest ceiling and the largest ecosystem and is the only
   candidate this script caught being wrong. That is not a reason to
   forbid it; it is a reason not to pick it when a candidate with the same
   performance class does not need the flag at all.

   WHAT THIS DOES NOT SETTLE: two genuinely different PLATFORMS still have
   not been compared -- everything here ran on one x86-64 Linux box. The
   aarch64 claim in section 2 is read from the instruction set, not
   measured. Running this script on an ARM machine and diffing the digest
   is the one experiment left, and it is now a five-minute job.

   NOT CHECKED ON THIS MACHINE: the wasm32-unknown-unknown target.
   Those rows are missing above rather than assumed.
```

## `light.js`

Lighting on a hex sphere: what 8 neighbours cost, why sky light is still one downward pass, and what a sun direction buys for free.

Cited by [doc 16](16-lighting.md).

```
1. neighbour count, and where the sphere shows through
   lateral neighbours: 2550 cells have 6, 12 cells have 5
   plus up and down, always -- the radial axis never branches
   so a cell has 8 neighbours, and exactly 12 cells in the world have 7.
   A cube voxel has 6. Light is a scalar, so degree is the ONLY thing that
   changes: no direction is carried, so holonomy and the pentagon direction
   deficit from doc 13 do not apply to light at all.

2. one torch at full brightness, in open air
   light level 15, dropping 1 per step
   hex prism grid: 7,471 cells reached
   cube grid:      4,991 cells reached
   ratio: 1.497x  -- the cost of 6 lateral neighbours
   (a hex disk of radius r holds 3r^2+3r+1 cells against 2r^2+2r+1 on squares,
    so the ratio tends to 1.5 as the light range grows)
   BFS on the real level-7 grid, one layer, 19+ cells from any pentagon:
   721 cells within 15 steps; closed form 3r^2+3r+1 = 721 -- exact match

3. a torch standing on a pentagon
   from a hexagon:  721 cells lit   (closed form 1 + 3r(r+1) = 721)
   from a pentagon: 601 cells lit   (closed form 1 + 5r(r+1)/2 = 601)
   identical at all 12 pentagons: true
   ratio 0.8336 at range 15, tending to 5/6 = 0.8333 as range grows

   Read that carefully, because the obvious reading is wrong. The light is
   NOT dimmer at a pentagon and needs no special case. A ring at radius k
   holds 5k cells instead of 6k, so there is simply 1/6 LESS WORLD within
   reach. Every cell that exists gets exactly the light level it should.
   This is Gauss-Bonnet once more: a cone point has less area inside a given
   radius. Compare doc 13, where the same 60deg costs a direction index
   forever -- here it costs nothing at all, because light carries no direction.

4. sky light, and why the sphere does not make it harder
   Sky light travels along -up, which is radial. The tessellation is
   identical at every layer (invariant 10), so a column IS a straight line
   of cells sharing one address. Sky light is therefore exactly as cheap as
   it is in a flat world: one downward pass per column, no face crossing.

   per chunk at D=11 C=6, 64 layers: 561 columns, 35,904 voxels
   light at 1 byte per cell (4 bits sky + 4 block): 35 KB
   block data at 2 bits per cell (doc 07):           9 KB
   light costs 4x the blocks it lights.

   But sky light down a column is MONOTONE -- full until the first solid
   cell, then attenuating. Store the depth it reaches, one byte per column:
   sky light per cell:   18 KB
   sky light per column: 0.5 KB   -- 32x smaller
   That trick needs columns to be straight, which is invariant 10 again.

5. day and night from one dot product
   A cell is lit when dot(sunDirection, up) > 0. up is per-cell and already
   computed for gravity (doc 13), so a real terminator costs one dot product
   per cell and no shadow map at all.

   R = 1700 m, circumference 10681 m
   day length      terminator speed   vs a walking player (1.4 m/s)
     10 min          17.80 m/s   12.7x faster -- dawn overtakes you
     20 min           8.90 m/s   6.4x faster -- dawn overtakes you
     1 hour           2.97 m/s   2.1x faster -- dawn overtakes you
     2.12 h           1.40 m/s   1.0x faster -- dawn overtakes you
    6 hours           0.49 m/s   2.8x slower -- you can outrun it
   24 hours           0.12 m/s   11.3x slower -- you can outrun it

   The terminator moves at exactly walking pace when the day lasts
   2.12 hours -- which is doc 06's circumnavigation time, by construction.
   That is the natural anchor: pick the day length in units of "how long it
   takes to walk around", and you have chosen whether players can chase sunset.

   Twilight, taken as 12deg of sun elevation:
   band width on the ground: 356 m  (3.3% of the circumference)
   duration with a 20 min   day: 40 s
   duration with a 2.12 h   day: 4.2 min
   duration with a 24 hours day: 48.0 min
   Twilight duration is a fixed FRACTION of the day and does not depend on
   the planet's size at all -- it is an angle, not a distance.

6. long shadows meet a short horizon
   Shadow length is h / tan(elevation). On a 1700 m planet the ground horizon
   from a 1.7 m eye is only 76 m (doc 13), so near sunrise a shadow
   runs off the edge of the visible world.

   sun elevation   shadow of a 10 m tower   past the 76 m horizon?
           45deg                     10 m   no
           20deg                     27 m   no
           10deg                     57 m   no
            5deg                    114 m   yes
            2deg                    286 m   yes
            1deg                    573 m   yes
   So a shadow-casting scheme only ever has to reach about 76 m before the
   curvature hides the rest. The small planet bounds the shadow budget the
   same way it bounds the render budget.

7. re-lighting after one block changes
   Worst case is removing a block that was blocking a full-strength light:
   the flood fill can touch every cell within 15 steps, 7,471 of them.
   In practice the fill stops at solid cells, and doc 14 already measured
   that real terrain is mostly solid below the surface.

   light range   cells possibly touched   vs a cube world
             4                      189 1.465x
             8                    1,241 1.490x
            15                    7,471 1.497x
   Shortening the light range is the cheapest lever: cost grows as the cube
   of it. Range 8 costs 83% less than range 15.
```

## `lod.js`

A chunk drawn at a coarser level of detail spaces its cells further apart and asks the terrain for a height at each one. The terrain answers with the value at that exact point, which is not the same as the average of the ground the cell covers -- so a coarse chunk does not draw a smoothed version of the fine one, it draws an arbitrary selection from it. This measures what that costs, what two ways of band-limiting the detail term buy, and whether the coarse map has the same problem once the detail term is fixed.

Cited by [doc 14](14-meshing-and-lod.md).

```
1. which octaves a level of detail can still carry
   4 octaves from a 112 m feature, amplitude 5 m.
   An octave needs two cells across a feature to be drawn at all.

   octave  feature   its share of the 5 m
     0     112 m    2.67 m   gone past LOD 5
     1      56 m    1.33 m   gone past LOD 4
     2      28 m    0.67 m   gone past LOD 3
     3      14 m    0.33 m   gone past LOD 2

   lod  cell   octaves it can carry
     0     1 m   4
     1     2 m   4
     2     4 m   4
     3     8 m   3
     4    16 m   2
     5    32 m   1
     6    64 m   0
     7   128 m   0
     8   256 m   0
   The detail term has nothing left to say past LOD 5, which is where
   section 3 picks the coarse map up.

2. how far the drawn ground moves, in metres
   Against the average of the ground a cell covers, over 190 places on
   one face, each averaged across its own footprint.

   lod   today          drop octaves   roll off
         rms    worst   rms    worst   rms    worst
     1    0.02   0.04    0.02   0.04    0.02   0.04    (190 places)
     2    0.02   0.04    0.02   0.04    0.02   0.04    (190 places)
     3    0.02   0.07    0.12   0.27    0.03   0.09    (190 places)
     4    0.06   0.22    0.29   0.75    0.12   0.41    (190 places)
     5    0.15   0.44    0.53   1.55    0.25   0.77    (190 places)
     6    0.31   1.19    1.02   2.41    0.50   1.50    (190 places)

   the step a player sees when a chunk changes level, rms metres
   lod change   today   drop octaves   roll off
   1 -> 2       0.00    0.00           0.00
   2 -> 3       0.01    0.10           0.01
   3 -> 4       0.04    0.17           0.09
   4 -> 5       0.09    0.24           0.14
   5 -> 6       0.16    0.50           0.24
```

## `lookup.js`

Cited by [doc 04](04-position-lookup.md).

```
argmax-centroid picks the containing face: 200000/200000 correct  (0 mismatches)
```

## `mesh.js`

Meshing and LOD: what a hex surface actually costs, how far a flat patch may span before the sphere's curvature shows, and whether LOD levels share vertices.

Cited by [doc 14](14-meshing-and-lod.md).

```
1. cost of a fully exposed surface, per cell  (caps only, vertices shared)
   L   cells   dual verts (hex corners)   cap triangles   verts/cell  tris/cell
   1      42             80             156        1.905      3.714
   2     162            320             636        1.975      3.926
   3     642           1280            2556        1.994      3.981
   4    2562           5120           10236        1.998      3.995
   5   10242          20480           40956        2.000      3.999
   closed form: dual verts = 2V-4, cap triangles = 4V-12  ->  2 and 4 per cell
   a square grid with every top exposed costs 1 vertex and 2 triangles per cell,
   so an UNMERGED hex surface is exactly 2x a cube one -- not the disaster
   it is usually described as. The gap is entirely about merging.

2. side faces of vertically stacked cells
   max deviation from a single plane over 3 layers: 1.49e-16 (radii)
   they are coplanar -- a run of exposed side faces down a column merges into
   ONE quad, exactly, at no geometric cost. Vertical merging is free.

3. flat-patch sag on a 1,700 m planet with 1 m blocks
   patch span   sag (exact)   s^2/8R   cells across
         8 m      0.0047 m   0.0047 m           8
        16 m      0.0188 m   0.0188 m          16
        32 m      0.0753 m   0.0753 m          32
        37 m      0.1007 m   0.1007 m          37
        64 m      0.3012 m   0.3012 m          64
       128 m      1.2046 m   1.2047 m         128
   sag = 10% of a block  ->  patch may span 37 m
   sag = 25% of a block  ->  patch may span 58 m
   merging is limited by curvature, not by the algorithm. A chunk at C=6
   spans 32 cells, which sits just inside the 10%-of-a-block limit.

4. LOD boundaries: is a coarse hexagon corner also a fine one?
   coarse corners: 1280   fine corners: 5120
   nearest-fine-corner distance: mean 0.72% max 0.97% of coarse cell spacing
   near-coincident but NOT exact: the middle child of a split shares its
   parent triangle's centroid only when the triangle is equilateral, and
   subdivided triangles are not. But the mismatch is under 1% of a cell,
   so the SPHERE contributes almost nothing to an LOD seam. See section 5.

5. LOD seam depth: the same terrain sampled one level apart
   60 m of relief, D = 11, 1 m blocks on a 1700 m planet
   level  spacing   coarse   mean |dh|   max |dh|   covered by a 1-cell skirt?
      11    1.00 m    2.0 m     0.300 m     1.631 m                yes
      10    2.00 m    4.0 m     0.599 m     3.390 m                yes
       9    4.00 m    8.0 m     1.187 m     7.455 m                yes
       8    8.00 m   16.0 m     2.266 m    14.160 m                yes
       7   16.00 m   32.0 m     4.065 m    21.775 m                yes
   every level covered: true
   a skirt one coarse cell deep covers the worst case at every level,
   and costs 2 triangles per boundary cell. Cheaper than stitching, and
   it does not care which level the neighbour chose.

6. visible cells by altitude (R = 1700 m, full depth D = 11)
   altitude   horizon   cells at D=11   cap tris   finest level within 2M tris
      1.7 m      76 m         20,951      0.08M                         11
       10 m     184 m        122,640      0.49M                         11
       50 m     407 m        599,186      2.40M                         10
      200 m     787 m      2,207,529      8.83M                          9
      850 m    1.4 km      6,990,507     27.96M                          9
     1700 m    1.8 km     10,485,761     41.94M                          8
   at eye height the whole visible world is ~21k cells / 84k triangles.
   the near field needs no merging at all; the horizon already did that job.
```

## `neighbour.js`

neighbour(id, k) -- the function eight documents delegate to and none defines (doc 11, Part 1). Doc 05 proves its 180-byte table complete and has never used it to cross an edge; every other script here builds the whole planet and reads adjacency off a hash map of rounded positions, which is fine for measuring and unavailable to an engine holding one integer. So this builds the function from the table and INTEGER ARITHMETIC ALONE, then checks it against that geometric graph. It also settles the three decisions hiding inside it: where direction index 0 is anchored, how (i, j) re-expresses across a face edge, and what a pentagon returns for k = 5.

Cited by [doc 05](05-face-adjacency.md), [doc 11](11-open-topics.md).

```
1. the frame, and where direction index 0 points
   faces wound counter-clockwise seen from outside: 20/20
   so A -> B -> C is CCW on every face, and a direction table written
   in that frame means the same turn everywhere.
   DIR = (1,0) (0,1) (-1,1) (-1,0) (0,-1) (1,-1)
   index 0 is the step from vertex A toward vertex B -- the face's own
   first edge. That is the anchor doc 19 needs, and it is a property of
   the cell's OWN face, so it never depends on how the cell was reached.
   Negating an offset is exactly k -> k+3, which is section 5.

2. crossing a face edge, and whether all 60 round-trip
   (face, edge) pairs actually crossed: 60/60
   steps taken off an edge and back: 900/900 returned to the start
   The step out and the step back are k and k+3, so this also checks that
   the direction table survives the crossing -- the opposite of a direction
   is still its opposite in the neighbour's frame.
   Note the `reversed` field is never read: carrying weights on global
   vertex ids makes the edge orientation carry itself.

3. the pentagon, and what k = 5 returns
   icosahedron vertices whose face rotation closes after 5 steps: 12/12
   distinct ring sizes over the twelve: 5
   So a pentagon has FIVE neighbours and the ring is k = 0..4.
   k = 5 is not a direction that exists -- it is the 60 degrees doc 13
   measures as the combinatorial deficit, and the honest return is that
   the ring is short, never a duplicate or a null in the middle of it.

4. against the graph every other script builds
   D=3  642 cells:  neighbour set matches geometry 642/642  ·  degree-5 cells 12  ·  CCW order matches 630/630
   D=4  2,562 cells:  neighbour set matches geometry 2562/2562  ·  degree-5 cells 12  ·  CCW order matches 2550/2550
   D=5  10,242 cells:  neighbour set matches geometry 10242/10242  ·  degree-5 cells 12  ·  CCW order matches 10230/10230
   Built from the table and integers only, and it agrees with the mesh at
   every cell -- including the twelve, and including the ring's direction.

5. the half turn, seen from inside neighbour()
   15,104 of 33,153 cells (45.6%) sit in a flipped frame
   186,066 steps compared, naive (q,r) index against the real one:
     +0  100,538 cases   (unflipped 100,538, flipped 0)
     +3  85,528 cases   (unflipped 0, flipped 85,528)
   Two values, 0 and 3, and nothing in between -- a rotation, never a
   mirror. Order the ring from (i, j) inside neighbour() and the caller
   never sees it, which is what doc 03 asks for.

verdict
   neighbour(id, k) is buildable from doc 05's table and integer arithmetic
   alone, and it agrees with the geometric graph at every cell of every
   level tested. The three decisions it was hiding:
     index 0   the step from the face's vertex A toward vertex B
     crossing  weights on global vertex ids, reflected: a+g, b+g, -g
               (the table supplies the destination face and nothing else)
     pentagon  the ring is FIVE long. k = 5 does not exist, and the twelve
               are the only cells where that is true.
```

## `noise.js`

Which noise function, exactly. Doc 08 fixes WHERE to sample (3D world space) and forbids a sin hash; doc 23 makes the exact choice bit-load-bearing, because a joining client regenerates doc 21's coarse map rather than downloading it. Neither names an algorithm -- and this repository already contains two that disagree, which is doc 11 Part 1's third entry. This pins one, and measures why each part of it is the way it is rather than asserting it.

Cited by [doc 08](08-terrain-generation.md), [doc 11](11-open-topics.md).

```
1. the two hashes already in this repository
   8,000 lattice points compared
   disagree on 7,857 of them = 98.2%, by up to 2.7e-5
   Both call themselves a value hash. They are different functions.

2. B is lossy at its second multiply, not at its first
   first multiply exact in float64: 64000/64000 of small coordinates
   second multiply loses bits: 4060/4096 of h values = 99.1%
   h is up to 2^32 and the multiplier is 2^30.2, so the product is 2^62 --
   nine bits past what float64 carries. B then takes >>> of that, which in
   JavaScript is a defined truncation of an out-of-range double and in C is
   undefined behaviour. So B is not a hash with a portable definition: it is
   a hash whose low nine bits are whatever one language happens to round to.

3. avalanche -- flip one input bit, how many output bits move?
   A (imul)   mean 0.4986   min 0.125   max 0.813   (ideal 0.5)
   B (float)  mean 0.4989   min 0.125   max 0.875   (ideal 0.5)
   Expected: B throws away nine bits, so B should mix visibly worse.
   Measured: it does not. Both sit within 0.0014 of ideal, and B is the closer of the two.
   So the case against B is NOT that it is a bad hash. Rounding a 2^62
   product still scrambles bits perfectly well. The case against it is
   section 2 alone: it has no definition outside JavaScript. That is
   enough on its own, and it is the whole of the argument.

4. the pinned function, and what it produces
   200,000 directions, 5 octaves at frequency 40:
     range -0.8953 .. 0.8700   mean -0.0013   sd 0.2436
   Bounded in [-1,1] by construction, because dividing by the summed
   amplitude makes the octave count a shape control and not a gain.
   But it does not FILL that range: the standard deviation is 0.244 of
   the amplitude, so "60 m of relief" in doc 14 means a typical swing of
   about 15 m and a full 60 m only where several octaves happen to align.
   Worth knowing before anyone tunes a mountain by eye.

5. quintic against smoothstep, at a lattice plane
   worst jump in curvature across a lattice plane, over 40 planes:
     smoothstep  t^2(3-2t)          7.05
     quintic     6t^5-15t^4+10t^3   0.08
   Smoothstep is smooth in the first derivative and kinked in the second,
   so shading -- which reads the normal's rate of change -- shows a faint
   grid on every integer plane. Quintic removes it for two extra multiplies
   per axis, evaluated once per sample rather than once per octave.

6. accumulation order, and why it has to be written down
   4 octaves: low-first 0.05435375526040007
              high-first 0.05435375526040005   DIFFER by 1.4e-17
   5 octaves: low-first 0.04329875785448625
              high-first 0.04329875785448627   DIFFER by 1.4e-17
   6 octaves: low-first 0.04679853958464157
              high-first 0.04679853958464157   identical
   8 octaves: low-first 0.04894811609451433
              high-first 0.04894811609451433   identical
   Float addition is not associative, so the same octaves summed the other
   way round need not give the same number -- and at two of the four counts
   above they do not, by 1.4e-17. The other two happen to agree, which is
   the trap: an order dependence that shows up only sometimes is one nobody
   finds by testing. Doc 23 is not about tolerances but about whether a
   difference is introduced at all, so pin it: LOW OCTAVE FIRST.

7. what switching the three float-multiply scripts would move
   height at 50,000 directions, 60 m of relief:
     mean |difference| 1.28 m   worst 5.85 m
   This is a DIFFERENT WORLD, not a rounding difference -- the terrain moves
   by metres, because the two hashes disagree on 98% of lattice points and
   the interpolation changed too. So the three scripts still on B publish
   figures about a planet the pinned function does not generate.
   Their conclusions are statistical -- face counts, span counts, seam holes
   over hundreds of thousands of cells -- so none of them turns on which
   world it measured. But they should be switched, and the numbers
   regenerated, before any of them is used to size an engine.

8. what a frequency means once the planet has a size
   Same field, same amplitude (200 m), same frequency (6). Only the planet grows:
   radius     horizon   one feature   features in view    tilt   landform
     1700 m      76 m         283 m             0.27    59.4 m     39.8 m
     3400 m     107 m         567 m             0.19    52.8 m     25.7 m
     6800 m     152 m        1133 m             0.13    43.2 m     15.0 m
    13600 m     215 m        2267 m             0.09    33.2 m      8.2 m
   The horizon goes as the SQUARE ROOT of the radius and a feature goes as
   the radius, so a bigger planet puts less of a landform in view. Amplitude
   does not fix it: it multiplies tilt and landform together and leaves the
   ratio where it was.

   Now hold the planet at 6800 m and ask for a feature SIZE instead:
   feature   frequency    tilt   landform   landform / tilt
     1133 m        6.0    43.3 m     15.0 m              0.35
      567 m       12.0    71.3 m     39.9 m              0.56
      283 m       24.0    90.5 m     84.1 m              0.93
      142 m       47.9    89.1 m    129.1 m              1.45
   The ratio is what a person sees, and only the feature size moves it. So a
   frequency belongs in the world file as METRES, divided by the radius on
   the way in -- the same rule doc 21 states for the coarse map resolution.

verdict
   The noise is pinned: hash3 above (three imul, two xor-shift, /2^32),
   trilinear value noise with the QUINTIC fade, fBm at lacunarity 2 and
   gain 0.5, accumulated low octave first and divided by summed amplitude.
   Octave count and base frequency are per-field tuning and belong in the
   world file beside the seed, because changing either changes the planet.
   Write the frequency there as a FEATURE SIZE IN METRES: a frequency counts
   features per sphere, so the same number grows different hills on every
   planet size (section 8).
   Every operation is int32 or IEEE-754 + - * /, so doc 23's rule holds with
   nothing left to check: no transcendental, and no float multiply past 2^53.
```

## `order.js`

Can the 4 children of a midpoint-split triangle be visited edge-to-edge? children: T0=(A,ab,ca) T1=(ab,B,bc) T2=(ca,bc,C) T3=(ab,bc,ca)

Cited by [doc 03](03-addressing.md).

```
T0 -> T3
T1 -> T3
T2 -> T3
T3 -> T0,T1,T2

best ordering: T0 -> T1 -> T3 -> T2 | adjacent steps: 2 of 3
```

## `pentagon.js`

The twelve pentagons as a GAMEPLAY problem: how often a player meets one, how much of the world would have to change to hide them, and what routing around one actually costs.

Cited by [doc 17](17-pentagons.md).

```
the twelve pentagons, as something a player runs into
(doc 06 planet: R = 1700 m, D = 11, cell spacing 1.000 m,
 circumference 10681 m, ~2.1 h to walk around)

1. where they are
   nearest pentagon-to-pentagon: 63.435deg = 1882 m = 1882 cells
   furthest you can stand from all twelve: 37.377deg = 1109 m
   mean distance to the nearest one: 663 m

   So on this planet you are NEVER more than 1109 m from a pentagon,
   and typically about 663 m. They are not remote curiosities;
   they are roughly as common as villages.

2. how much of the world they touch
   fraction of the surface within k cells of a pentagon:

   k cells   radius      area        one pentagon zone
         1       1 m     0.0001%           3 m^2
         3       3 m     0.0009%          28 m^2
        10      10 m     0.0104%         314 m^2
        50      50 m     0.2594%        7852 m^2
       200     200 m     4.1467%      125495 m^2

   The distortion itself is ONE cell. Even a generous 50-cell exclusion
   zone around each of the twelve costs well under a percent of the world.

3. a rail line, laid straight
   Random great-circle routes, with the closest approach solved exactly
   rather than sampled along the line.

   route length   within 1 cell   within 10 cells   within 50 cells
          100 m          0.005%             0.08%             0.60%
          500 m          0.029%             0.34%             1.93%
         1000 m          0.083%             0.70%             3.56%
         5000 m          0.328%             3.24%            15.91%
        10681 m          0.378%             3.50%            16.66%

   Sanity check on the last row, which also shows the antipodal pairing
   from doc 13 doing something. A full circumnavigation is a whole great
   circle; for a random pole the chance a given vertex lies within 1 m of
   it is sin(1/1700) = 0.059%. But a great circle is EQUIDISTANT from v
   and -v, so the twelve pentagons present only SIX independent chances,
   not twelve: 6 x 0.059% = 0.353%, against the measured value above.
   Twelve would predict twice the observed rate.

   So a rail laid at random right around the planet lands dead on a
   pentagon under 1% of the time -- but passes within 50 cells of one
   about a sixth of the time. Rare to hit, common to meet.

4. the best circumnavigating route
   Searching great circles for the one furthest from all twelve vertices:
   best clearance 26.565deg = 788 m = 788 cells

   So a rail CAN circle the planet and stay 788 cells clear of every pentagon.
   Avoidance is always possible; it is not always convenient.
   (The opposite extreme: because the twelve form 6 antipodal pairs, a great
    circle can also be chosen to pass through TWO of them exactly.)

5. the cost of routing around, versus through
   A line entering a pentagon deflects 36.07deg either way (doc 13): there is
   no opposite direction to leave by. So "through" is not an option for a
   rail that must stay straight. Going around it costs:

   detour radius   extra track   as % of a 1 km line
         1 cells         2.0 m                 0.20%
         2 cells         4.0 m                 0.40%
         5 cells        10.0 m                 1.00%

   Trivial. The cost of a pentagon is not distance -- it is that an
   AUTOMATED system (a rail router, a conveyor, a pipe network) has to
   contain the special case at all. One cell in 42 million, that every
   piece of directional machinery must nevertheless handle correctly.

5b. does an exclusion zone fix the loop problem? (level 6 grid)
   walk a closed loop at graph distance k around one pentagon,
   carrying a direction index the way a rail carries "straight on":

   k    cells in loop   direction slip on return
    1               5                        1 index = 60deg
    2              10                        1 index = 60deg
    3              15                        1 index = 60deg
    5              25                        1 index = 60deg
    8              40                        1 index = 60deg
   12              60                        1 index = 60deg
   16              80                        1 index = 60deg

   The slip is 1 index at EVERY radius. It is topological: it counts the
   pentagons enclosed, not the distance kept from them. So an exclusion
   zone of any size leaves it exactly where it was.

   This narrows what every option below can actually buy. Keeping machinery
   off a pentagon removes the LOCAL problem -- five exits instead of six,
   no straight line through. It does NOT remove the loop problem, because
   a loop drawn anywhere around the pentagon still encircles it.

5c. the twelve as destinations
   each pentagon has 5 nearest neighbours at 1882 m -- the icosahedron graph
   a closed tour visiting all twelve exists: 0->1->5->4->2->3->9->8->6->7->10->11->0
   length 22586 m = 2.11x around the world
   at 1.4 m/s that is 4.5 hours of walking

   Can you see one from the next? Eye horizon is 76 m (doc 13), so a
   tower of height h is visible from 76 m + R*acos(R/(R+h)).
   height   visible from   reaches the next pentagon (1882 m)?
     20 m          335 m   no
     60 m          521 m   no
    150 m          765 m   no
    400 m         1143 m   no
   a landmark would have to be 1793 m tall to be seen from the next one --
   taller than the planet's radius. On a world this small the twelve are NOT
   inter-visible, so travelling between them needs coordinates, not line of
   sight. That is what makes doc 13's "poles on a pentagon pair" worth taking.

6. burying them, as H3 does on Earth
   Force the height field down at the twelve vertices so each sits under
   water. Cost, as a share of the whole surface:

   ocean radius    surface given to water   still walkable
           50 m                    0.26%           99.74%
          100 m                    1.04%           98.96%
          200 m                    4.17%           95.83%
          500 m                   25.81%           74.19%
          941 m                   89.55%           10.45%   <- discs now overlap
         1109 m                  100.00%            0.00%   <- discs now overlap

   1.03% for a 100 m sea around each -- far more than enough to hide a
   one-cell defect. This is the only option that removes the problem
   rather than relocating it, because it removes the MACHINERY, not the
   geometry: no rails get built at the bottom of an ocean.

   But note what it does to the map: twelve seas, 1882 m apart, at
   FIXED positions no seed can move. That is a strong world-design
   statement, not a neutral one -- an archipelago planet by construction.
```

## `precision.js`

Floating-point precision at planet scale: what a float can resolve, where the ID->position conversion loses accuracy, and how much a chunk-local origin buys back.

Cited by [doc 15](15-precision-and-origin.md).

```
0. the arithmetic behind "float32 carries about 7 significant digits"
   layout: 1 sign + 8 exponent + 23 stored mantissa bits.
   an implicit leading 1 makes the significand 24 bits, and
   24 * log10(2) = 7.2247 decimal digits.
   every float is +/- 1.f x 2^e with 1.f in [1,2), so the exponent slides a
   FIXED ladder of rungs along the number line: the count never changes and
   the spacing scales with the magnitude.

        for x in [2^e, 2^(e+1)):   gap = 2^(e-23)

   R              2^e         e    gap = 2^(e-23)   measured
        1700         1024    10      122.070 um   122.070 um
       10000         8192    13      976.563 um   976.563 um
     6371000      4194304    22      500.000 mm   500.000 mm

   at Earth radius: 6371000 lies in [2^22, 2^23) = [4194304, 8388608),
   so the gap is 2^(22-23) = 0.5 m. The neighbouring representable values are
   6370999.5, 6371000, 6371000.5
   Counting digits agrees: 6371000 is 7 digits and lands ON the metres
   column; 6371000.5 would need 8; 7.22 digits is what buys the half.
   So it is not that metres are unrepresentable -- it is that nothing BELOW
   a metre is.

   gap >= t  means  e >= 23 + log2(t), and e is an integer, so every
   threshold crossing snaps to a binade boundary:
      gap >= 1 mm   at e = 14  ->  R = 2^14 = 16,384 m
      gap >= 1 cm   at e = 17  ->  R = 2^17 = 131,072 m
      gap >= 10 cm  at e = 20  ->  R = 2^20 = 1,048,576 m
      gap >= 1 m    at e = 23  ->  R = 2^23 = 8,388,608 m

1. spacing between adjacent representable positions, at distance R from the origin
   (a world position IS that distance from the centre, so this is the resolution
    of every position on the surface of a planet of radius R)

   planet                       R          float32          float64   f32 vs 1 m block
   doc-06 worked example       1700 m   122.070 um         0.000 nm   fine (8192 per block)
   10 km planet               10000 m   976.563 um         0.002 nm   fine (1024 per block)
   100 km moon               100000 m     7.813 mm         0.015 nm   visible jitter (128 per block)
   1000 km dwarf            1000000 m    62.500 mm         0.116 nm   coarse (16 per block)
   Earth                    6371000 m   500.000 mm         0.931 nm   2 positions per block -- no sub-block detail
   Jupiter                 69911000 m      8.000 m        14.901 nm   ONE position per 8 blocks

2. the radius at which float32 position spacing first exceeds a threshold
   threshold        radius            i.e.
    0.1 mm       1.024e+3 m   1 km
      1 mm       1.638e+4 m   16 km
      1 cm       1.311e+5 m   131 km
     10 cm       1.049e+6 m   1049 km
       1 m       8.389e+6 m   8389 km
   Thresholds land on powers of two because the spacing is 2^(e-23) for R in
   [2^e, 2^(e+1)). float32 holds sub-millimetre precision out to a 16 km planet
   and has no sub-block detail left at all by Earth radius.

3. one-shot barycentric vs recursive midpoint subdivision
   docs 02 and 03 describe the sphere as a "recursively subdivided icosahedron";
   docs 04 and 09 require the one-shot lattice (uniform in the face plane).
   These are different point sets. Deviation as a fraction of cell spacing:

   L    cells    spacing (R=1700)   max deviation   as % of spacing
   1       42        1023.90 m        0.000 nm             0.0%
   2      162         511.95 m        38.966 m             7.6%
   3      642         255.98 m        38.966 m            15.2%
   4     2562         127.99 m        38.966 m            30.4%
   5    10242          63.99 m        39.420 m            61.6%
   6    40962          32.00 m        39.420 m           123.2%
   7   163842          16.00 m        39.435 m           246.5%

   closed form for the worst point (the quarter point of a base edge):
   icosahedron edge subtends 63.4349deg; at t = 1/4 the two rules place it at
   14.5454deg (one-shot, equal chord) vs 15.8587deg (recursive, equal arc)
   = 1.3133deg apart = 38.966 m on the doc-06 planet.

   The gap is FIXED IN METRES and does not shrink with level, so as a fraction
   of a cell it GROWS without bound. These are two different tilings, not two
   roundings of one. At level 11 the two spheres disagree by 39 cells.
   Doc 04 (hexRound) and doc 09 (gnomonic straightness) both require one-shot,
   so one-shot is the construction; "recursively subdivided" is loose wording.

4. ID -> position, worst error over 20,000 sampled cells
   The path walk is integer arithmetic, so the only floating-point work is
   one barycentric blend and one normalise, at any depth.

   depth    float64 (R=1700)   float32 (R=1700)   float32 on an Earth-sized world
       4           0.000 nm         155.512 um     582.805 mm
       8           0.000 nm         212.784 um     797.441 mm
      11           0.000 nm         206.328 um     773.244 mm
      13           0.000 nm         211.740 um     793.528 mm
      16           0.000 nm         205.873 um     771.540 mm
      20           0.000 nm         197.832 um     741.403 mm
      23           0.000 nm         192.694 um     722.148 mm
   Error is flat in depth: the path walk is integers, and the float work is
   one blend plus one normalise however deep the world goes. Nothing accumulates.

5. "up" is a direction, and directions are precision-robust
   up = normalize(position). The normalise divides out the magnitude, so the
   ANGLE survives even where the position itself has collapsed.

   planet             float32 position error   float32 "up" error   as a distance on the surface
   doc-06 worked example            36.863 um            3.99e-3"      32.849 um
   10 km planet                 202.922 um            3.99e-3"     193.227 um
   100 km moon                    3.326 mm            4.98e-3"       2.415 mm
   1000 km dwarf                 16.902 mm            4.59e-3"      22.234 mm
   Earth                        101.807 mm            4.59e-3"     141.653 mm
   Jupiter                         2.396 m            6.03e-3"        2.042 m
   Position degrades linearly with R. The direction does not degrade at all.

6. chunk-local coordinates, D = 11, 1 m blocks
   Offsets are bounded by the chunk span, so float32 resolves them finely
   no matter how big the planet is.

   chunk level   cells across   span      float32 resolution inside the chunk
   C =  4            128     128 m      15.259 um
   C =  6             32      32 m       3.815 um
   C =  8              8       8 m     953.674 nm
   C = 10              2       2 m     238.419 nm

   the same, for an Earth-sized world at 1 m blocks (D = 23):
   C = 16            128     128 m      15.259 um
   C = 18             32      32 m       3.815 um
   C = 20              8       8 m     953.674 nm

7. rebase frequency for a player walking at 1.4 m/s
   anchor          span      one crossing every
   cell (D=11)        1 m   0.7 s
   chunk C=8          8 m   5.7 s
   chunk C=6         32 m   22.9 s
   chunk C=4        128 m   1.5 min
   Re-anchoring is renormalising an integer and a small offset: no world shift,
   no traversal of live objects, nothing to schedule.

8. integer vs float64 for the chunk-local offset
   offset lives in a chunk-local frame, so it is bounded by 32 m:
   representation                  resolution        vs a 1 m block
   float64                        7.11e-15 m      1.4e+14 per block
   int32 fixed-point, mm           1.00e-3 m       1.0e+3 per block
   int32 scoped to the chunk       1.49e-8 m       6.7e+7 per block
   int64 scoped to the chunk      6.94e-18 m      1.4e+17 per block
   Every one of them resolves a 1 m block hundreds of millions of times over.
   Precision does not decide this, and the determinism argument that was
   supposed to has already been answered by doc 23.

   What fixed-point would still buy: protection against a BUILD mistake, not
   a hardware one. Doc 23 names the residual risk as compiler contraction --
   fusing a*b + c into an FMA, which is more accurate and therefore different.
   Integers cannot be contracted. But the flag that disables contraction is a
   one-line defence, and fixed-point costs the operation this design leans on
   hardest: there is no integer sqrt, and `normalize` is the most-called
   function in the whole runtime (docs 04, 13, 15).
   DECISION: float64 offsets, and set the contraction flag. Doc 15 closed.

9. the vector between two distant entities, in float32
   separation      float32 spacing there     usable for a 1 m block?
        10 m        9.54e-7 m        yes
        76 m        7.63e-6 m        yes
       400 m        3.05e-5 m        yes
     1,700 m        1.22e-4 m        yes
       10 km        9.77e-4 m        yes
      100 km        7.81e-3 m        yes
     6371 km        5.00e-1 m        NO
   On the doc-06 planet the worst case is the antipode at 1,700 m, where
   float32 still resolves 0.12 mm -- so nothing on that world needs float64
   for an inter-entity vector. It breaks on big planets, not on this one.
   But the rule costs nothing to keep: these vectors are rare and per-entity,
   while the float32 budget exists for per-VERTEX data. Compute them in
   float64 and the answer is right at every planet size.
   ANSWER: nothing needs it in float32; the limit if you tried is ~16 km.

10. a surface radius held in float32, and the layer it names
   radius R                    6800.648485818399 m
   float32 spacing at R        488.281 um
   R through float32           6800.648437500000 m  (48.318 um away)
   layer the surface tops      1 from float64, 2 from float32
   the two differ by           1 layer = 1 m of cliff

   ground sampled anywhere in the crust: 0.020% of columns land on different layers
   ground sitting exactly on a layer boundary: 100% of them do, and a
   flat planet at sea level is that case at every column it has.
   ANSWER: a radius is a world position. Held at float32 it moves by half a
   millimetre at planet scale, and a ceil turns half a millimetre into a
   whole block. The rounding to a layer is where the third tier bites back.
```

## `qr.js`

walk (i,j) at depth D down C levels -> path digits + leftover (q,r) + orientation

Cited by [doc 03](03-addressing.md).

```
round-trip: 33153/33153 exact
leftover q,r range 0..16  (chunk side = 16)
15104 of 33153 points sit in a flipped (middle-child) frame
```

## `rank.js`

rank(q, r) -- doc 07 gives a chunk's storage layout as index = rank(q, r) * layerCount + layer and that is the only time rank appears in the specification. It is never defined, and it is not a plain triangular number, because doc 03's border rule (the lowest chunk ID wins) means a chunk owns some of the cells on its own edges and not others. So two questions wear one name: how many cells does a chunk hold, and which slot does a given (q, r) sit in. This answers both, and prices the only real choice between them.

Cited by [doc 07](07-data-structures.md), [doc 11](11-open-topics.md).

```
1. the chunk triangle, before anyone owns anything
   a chunk at chunk level C on a world of depth D is a triangle of side
   m = 2^(D-C), holding (m+1)(m+2)/2 lattice points.
   D   C    m    points   on the border   interior
   11   4   128      8385      384 =  4.6%      8001
   11   6    32       561       96 = 17.1%       465
   11   8     8        45       24 = 53.3%        21
    6   2    16       153       48 = 31.4%       105
    5   2     8        45       24 = 53.3%        21
   The 561 at D 11 / C 6 is the same number doc 14 counts columns with.
   17.1% of a chunk sits on its own border, which is what the rule below
   is deciding the fate of -- not a rounding error. And note the C = 8
   row: cut the chunk small enough and it is more border than interior,
   which is a reason to keep C well below D quite apart from file count.

2. lowest chunk ID wins -- does it actually partition the planet?
   D=4 C=1 m=8:  2,562 cells owned  ·  N(L) = 2,562  ·  exact partition
   D=5 C=2 m=8:  10,242 cells owned  ·  N(L) = 10,242  ·  exact partition
   D=6 C=2 m=16:  40,962 cells owned  ·  N(L) = 40,962  ·  exact partition
   D=6 C=3 m=8:  40,962 cells owned  ·  N(L) = 40,962  ·  exact partition
   Every cell owned exactly once, on four different cuts. The rule works,
   and this is the first time anything has checked it.

3. what a chunk actually holds, and why it varies
   D=6 C=2, m=16: full triangle 153, interior 105
   owned per chunk: min 105, max 153, mean 128.0, 8 distinct values
   the values: 105 120 135 136 150 151 152 153
   They are exactly interior + e*(m-1) + c, for e owned edges (0..3) and
   c owned corners -- an edge is won or lost whole, because every cell
   along it is shared with the same one neighbour.
   how many chunks hold each count:
      105 cells  80 chunks
      120 cells  77 chunks
      135 cells  19 chunks
      136 cells  67 chunks
      150 cells  4 chunks
      151 cells  53 chunks
      152 cells  18 chunks
      153 cells  2 chunks

4. two ranks, and what the difference costs
   (A) rank the WHOLE triangle and let unowned border slots go unused:
         rank(q, r) = q + r*(2m + 3 - r)/2        0 <= q+r <= m
       one multiply, one shift, no ownership knowledge, and the stride
       (m+1)(m+2)/2 is the same for every chunk on the planet.
   (B) rank only the cells this chunk owns: dense, but the array length
       and the rank function both depend on which of 3 edges and 3
       corners it won -- 64 variants, and a per-chunk header to say which.
   rank(A) checked as a bijection onto 0..(m+1)(m+2)/2-1 at every m above.

   And what (A) wastes needs no extrapolating, because the mean is forced:
   every cell is owned once (section 2), so the mean owned per chunk is
   just N(D) / chunks = (10*4^D + 2) / (20*4^C), which is m^2/2. Subtract
   that from the full triangle and the waste is exactly (3m + 2)/2 slots.
   D   C    m   full   mean owned   wasted   (3m+2)/2   waste
    4   1     8     45         32.0     13.0         13    28.8%
    5   2     8     45         32.0     13.0         13    28.9%
    6   2    16    153        128.0     25.0         25    16.3%
    6   3     8     45         32.0     13.0         13    28.9%
   The closed form matches the measurement at every cut, so the worked
   planet is arithmetic rather than a guess:
     D 11 / C 6, m = 32:  561 slots, 512 owned, 49 wasted = 8.7%
     at doc 07's 2-bit palette and 64 layers that is 8,976 bytes a chunk, of which 784 are never used.

5. recommendation
   Take (A). Two reasons, and neither is the byte count.
   Doc 07 states the layout as index = rank(q,r) * layerCount + layer, one
   sentence with no per-chunk case in it. (A) keeps that sentence true for
   every chunk on the planet; (B) makes it 64 sentences and puts a header
   in front of an array that doc 07 designed to have no header at all.
   And doc 03's rule is about AUTHORITY, not about slots: a border cell has
   exactly one home, so the unowned slot is never written and never read.
   Leave it as the hole it is, and spend nothing to close it.

verdict
   rank(q, r) = q + r*(2m + 3 - r)/2, over the whole triangle, m = 2^(D-C).
   A chunk is (m+1)(m+2)/2 slots -- 561 at D 11 / C 6 -- the same for every
   chunk, of which it OWNS interior + e*(m-1) + c. Lowest chunk ID wins is
   an exact partition of the planet, checked on four cuts. The unowned
   slots are exactly (3m+2)/2 -- 49 of 561, 8.7%, 784 bytes a chunk -- and
   buying them back costs the uniform stride that made the layout worth
   having.
```

## `rivers.js`

Rivers, erosion and continents are the three things fBm cannot make, because all three are GLOBAL: where water goes depends on the whole planet, not on the neighbourhood. Doc 08 sketches a coarse stored map to carry them. This measures whether that works -- how the coarse map is looked up, what flow routing costs on a hex sphere, and how much of the planet ends up river.

Cited by [doc 21](21-rivers-and-erosion.md).

```
1. does a coarse cell sit on a fine cell?
   level 8 point (i,j) against level 11 point (8i, 8j):
   955 sampled, worst separation 0.00e+0
   They are the same points. So the coarse samples ARE fine cells -- the
   ones whose (i, j) are multiples of 8 -- and finding the three
   that surround a fine cell is masking the low bits of (i, j), then using
   the remainder as barycentric weights. No second structure, no search.
   NOTE: it is the (i,j) low bits, not the path digits. Truncating path
   digits gives the containing TRIANGLE, which is a chunk, not a cell.

2. storage, and what one coarse cell covers on the worked planet
   level     cells    at 4 bytes   coarse cell size (R = 1,700 m)
   6      40,962      0.16 MB        32.0 m
   7     163,842      0.63 MB        16.0 m
   8     655,362      2.50 MB         8.0 m
   9   2,621,442     10.00 MB         4.0 m
   10  10,485,762     40.00 MB         2.0 m
   Doc 08 proposes level 8: 2.5 MB, and a coarse cell 8 m across. A river
   channel is therefore about one coarse cell wide before detail is added.

3. routing every cell downhill
   163,842 cells at level 7, 30.0% above sea level
   land cells with nowhere lower to go (pits): 683  = 1.39% of land
   of the 12 pentagons, 0 are pits -- expected 0.2 if they behave like anything else
   A pentagon picks the lowest of five instead of six. That is the entire
   difference: flow routing needs no pentagon case at all.

4. filling the pits so every drop reaches the sea
   cells raised into lakes: 2,369 (4.8% of land)
   largest single raise: 0.1024 of the height range
   cells still with nowhere to go: 0
   The tiny slope added while filling is what makes that last number zero.
   Fill without it and a lake is perfectly flat, so no cell in it has a
   lower neighbour and every river stops dead at the first lake it meets.

5. drainage area, and what counts as a river
   threshold (upstream cells)   cells that qualify   share of land
          20                       3703        7.53%
         100                        563        1.15%
         500                         29        0.06%
        2000                          0        0.00%
   longest continuous flow path: 46 cells = 0.74 km
   the planet is 10.68 km around, so that is 0.07x the circumference

   whole pass: well under a second for 163,842 cells  (this run 1073 ms -- a timing, so it moves run to run)
   At level 8 that is four times the cells and still seconds, once, at world
   creation. This is not a runtime cost.

6. rivers are as long as the continent lets them be
   noise frequency   biggest landmass   longest river
           6.0          6206 cells      31 cells = 0.50 km
           3.0         15352 cells      46 cells = 0.74 km
           1.5         31615 cells      85 cells = 1.36 km
           0.8         33433 cells      86 cells = 1.38 km
   Lower the frequency and the continents grow, and the rivers grow with
   them. A river cannot be longer than the land it crosses, so the three
   problems doc 08 lists are NOT independent: continents decide rivers.
   Plain fBm makes many small blobs, which is why raw noise gives streams
   and never a river system. Fix the continents first.

7. the same planet drawn at three resolutions
   level   cells   spacing   land   longest river   largest catchment   channel
       5   10242    64.0 m  30.0%     19 cells = 1.22 km      141 cells = 0.50 km2   9.08% of land
       6   40962    32.0 m  30.0%     43 cells = 1.38 km      482 cells = 0.43 km2   4.23% of land
       7  163842    16.0 m  30.0%     86 cells = 1.38 km     1900 cells = 0.42 km2   2.10% of land
   Land share and river LENGTH in kilometres hold across all three. What
   moves is the CELL COUNT: the largest catchment quadruples per level
   while the ground it drains does not, so a threshold written in cells
   means a different river on every map. Write it in square metres.
   The share of land inside a fixed catchment HALVES per level, and that
   is not an error: a channel is one coarse cell wide, so a finer map
   draws the same river narrower. Choosing the level IS choosing how wide
   a river is.

verdict
   Flow routing works on the hex sphere with no pentagon case and no face
   case, because it only ever compares a cell against its neighbours. The
   real algorithm is not the routing but the PIT FILLING, without which
   most land drains into a hole instead of the sea. Look the map up by
   masking the low bits of (i, j) and interpolate with the remainder. Ask
   for its resolution in METRES: the level that gives 32 m cells is 8 on a
   1,700 m planet and 10 on a 6,800 m one, and it is the metres that decide
   how wide a river is.
```

## `rotation.js`

Directional blocks: rails, pipes, conveyors. A rotation here is an index into a cell's neighbour ring, so three questions decide the design. How evenly are those six directions spread, since a player aims at one of them? How often does a build actually run into a pentagon, given placement is refused there? And how often does a closed circuit enclose one, which is the case that does not close.

Cited by [doc 19](19-directional-blocks.md).

```
1. angular spread of a cell's six directions
   40950 hexagons at level 6
   gap between neighbouring directions: min 54.00 deg, max 71.53 deg
   worst deviation from an even 60 deg: 11.53 deg
   so aiming within +/-27.0 deg of a direction always picks it.
   A player aims with a mouse. Half of the tightest gap is the tolerance,
   and it never falls below that anywhere on the planet.

2. how often a build of radius r contains a pentagon
   radius (cells)   cells in the disc   chance it holds a pentagon
       10                 331       0.009%
       25                1951       0.056%
       50                7651       0.219%
      100               30301       0.867%
      250              188251       5.386%
      500              751501       21.501%
   On the doc-06 planet a cell is 1 m, so a 100-cell radius is a 200 m
   factory. Under half a percent of those contain a pentagon at all.

3. carrying a heading around a closed loop
   loop centred ON a pentagon:
     radius 2:  10 cells, slip 1 index
     radius 3:  15 cells, slip 1 index
     radius 4:  20 cells, slip 1 index
     radius 5:  25 cells, slip 1 index
   loop centred AWAY from it -- does the slip follow the pentagon or the centre?
     radius 3, centre 1 from the pentagon (encloses it ): slip 1 index
     radius 3, centre 2 from the pentagon (encloses it ): slip 1 index
     radius 3, centre 5 from the pentagon (does not   ): slip 0 index
     radius 3, centre 9 from the pentagon (does not   ): slip 0 index
     radius 4, centre 1 from the pentagon (encloses it ): slip 1 index
     radius 4, centre 2 from the pentagon (encloses it ): slip 1 index
     radius 4, centre 5 from the pentagon (does not   ): slip 0 index
     radius 4, centre 9 from the pentagon (does not   ): slip 0 index
   exhaustively: 427 loops enclose the pentagon, 2135 do not
     enclosing -> slip 1, not enclosing -> slip 0, exceptions: 0
     (175 more run through the pentagon itself, where "straight on"
      is undefined and the number is not the enclosure count)
   The slip tracks whether the pentagon is INSIDE the loop, not where the
   loop is centred or how wide it is. That is what "topological" means here,
   and it is why no exclusion zone fixes it.
   Note the sphere does not make "inside" ambiguous, though it looks like it
   should: a loop cuts the sphere in two, and the far side holds the other
   11 pentagons. Walking it the other way gives 11 indices = 660 deg, which
   is the same rotation as -1. The two answers agree because all twelve
   together are 720 deg, a whole turn twice over.

4. storage
   6 orientations need ceil(log2 6) = 3 bits.
   Doc 03 packs block state as 16 bits beside a 41-bit address:
     12 bits type + 4 bits rotation = 16, leaving one spare rotation bit
   4,096 block types and 6 orientations, with a bit left for a flag such as
   powered or reversed. No change to the ID layout is needed.

verdict
   Six states, three bits, and a snap tolerance that never drops below
   half the tightest gap measured above. Placement is refused on the twelve
   pentagons, which under 0.5% of a 200 m build would ever meet. The one
   thing no decision removes is the loop: a circuit enclosing an odd number
   of pentagons comes back one index over, so recompute a heading from the
   grid at every step and never carry one round a loop.
```

## `s2.js`

Cited by [doc 01](01-prior-art.md).

```
linear     ratio 5.114  total/4pi 1.000000
quadratic  ratio 2.056  total/4pi 1.000000
tangent    ratio 1.406  total/4pi 1.000000
```

## `scale.js`

Cited by [doc 06](06-world-sizing.md).

```
  L       cells   Earth spacing    10km-planet spacing
  0          12       7005.8 km              11.0 km
  1          42       3744.7 km               5.9 km
  2         162       1906.7 km               3.0 km
  3         642        957.8 km               1.5 km
  4       2,562        479.5 km              752.6 m
  5      10,242        239.8 km              376.4 m
  6      40,962        119.9 km              188.2 m
  7     163,842         60.0 km               94.1 m
  8     655,362         30.0 km               47.1 m
  9     2.62e+6         15.0 km               23.5 m
 10     1.05e+7          7.5 km               11.8 m
 11     4.19e+7          3.7 km                5.9 m
 12     1.68e+8          1.9 km                2.9 m
 13     6.71e+8         936.8 m                1.5 m
 14     2.68e+9         468.4 m              73.5 cm
 15    1.07e+10         234.2 m              36.8 cm
 16    4.29e+10         117.1 m              18.4 cm
 17    1.72e+11          58.6 m               9.2 cm
 18    6.87e+11          29.3 m               4.6 cm
 19    2.75e+12          14.6 m               2.3 cm
 20    1.10e+13           7.3 m               1.1 cm

bit budget, 64-bit word [planet 12][face 5][path 2D][corner 2][layer 10]
   -> 17 levels max  (1.72e+11 cells per layer)
   face + path alone would say 29, which pays for neither
   the planet field nor the 2-bit corner that names a vertex.
storage at 1 byte/cell, level 15: 10.7 GB
```

## `seam.js`

What actually happens at a chunk boundary when the two sides are at different LOD and one of them has caves. Doc 14 first said "a skirt one coarse cell deep"; this checks whether that is enough once a rim column has more than one solid span, what does close the remaining holes, and -- since a skirt was tried in the engine and taken out again -- what a skirt costs on the boundaries where it is not needed, which is most of them.

Cited by [doc 14](14-meshing-and-lod.md).

```
A chunk rim where the neighbour is one LOD coarser.
Fine side: full density field (freq 140, strength 26) -- has caves.
Coarse side: height-field term only, resampled one coarse cell away.

  coarse   rim      spans   columns with   cave     holes: own-margin   +skirt   +apron   seam-owned
  cell     columns  /col    >1 span        mouths
     2 m       385   1.132             47     1074              1150     1060     1074            0
     4 m       385   1.132             47     1075              1154     1027     1075            0
     8 m       385   1.132             47     1067              1152      953     1067            0

  own-margin  = each side trusts its own generator past the boundary.
                Neither emits anything, so every disagreement is a hole.
  +skirt      = same, plus a curtain one coarse cell deep from the top
                surface. It closes the surface slit and nothing else.
  +apron      = same, plus each chunk drawing the ring of cells beyond
                its own rim at its own level. Both surfaces then cover
                the strip, so the slit closes with no wall anywhere.
  seam-owned  = the finer chunk emits a face wherever its solidity differs
                from the coarse neighbour's. Zero holes, by construction.

  The apron and the skirt leave the same holes -- every cave mouth, and
  nothing else. They differ in what they cost where nothing is wrong.

Why the skirt alone is not enough:
  coarse cell   2 m: 1060 of 1074 cave mouths (99%) sit deeper than the skirt reaches; deepest is 18 layers below the surface.
  coarse cell   4 m: 1027 of 1075 cave mouths (96%) sit deeper than the skirt reaches; deepest is 18 layers below the surface.
  coarse cell   8 m: 953 of 1067 cave mouths (89%) sit deeper than the skirt reaches; deepest is 18 layers below the surface.
  A skirt hangs DOWN from the top surface. A cave mouth is a HORIZONTAL
  hole in the boundary plane, often far below it. The two do not meet.

Cost of the fine chunk owning the seam:
  1150 boundary faces over 385 rim columns = 2.99 per column,
  plus ONE height-field evaluation per rim column to learn where the
  coarse neighbour put its surface. Both are negligible against the
  1.13 spans and ~12 faces per column the chunk already emits.

Where a skirt hangs a wall it cannot help:
  coarse cell   2 m: 329 of 385 rim columns (85%) have both levels on the same cap,
                   so the skirt there is coplanar with the neighbour's cap.
  coarse cell   4 m: 286 of 385 rim columns (74%) have both levels on the same cap,
                   so the skirt there is coplanar with the neighbour's cap.
  coarse cell   8 m: 190 of 385 rim columns (49%) have both levels on the same cap,
                   so the skirt there is coplanar with the neighbour's cap.
  At a boundary between two chunks of the SAME level -- which is most of
  them -- both ran one generator on one grid, so every rim column agrees
  and every skirt quad is coplanar. The apron hangs no wall at all.
```

## `sky.js`

What is above you, on a planet you can walk around in two hours. node verification/sky.js A skybox, clouds and a moon are the three things this specification has discussed and never written down (doc 11). They look like pure decoration, and on a normal-sized world they are: a cube at infinity, a scrolling texture, a sprite. This planet is 1,700 m across and that changes all three, because the player is the fastest-moving thing in the sky. Everything here is PRESENTATION (doc 29): client-side, never compared between machines, and therefore allowed transcendentals that doc 23 forbids in the generator. That freedom is used, and it is why none of this is expensive.

Cited by [doc 32](32-sky-clouds-and-moon.md).

```
sky.js -- the skybox, clouds and the moon on a 1,700 m planet

1. the sky turns because you walk, not because it moves
   circumference 10681 m, walked at 1.4 m/s

   walk this far   your "up" turns by   which is
          10 m          0.34°   a few paces
         100 m          3.37°   across a clearing
         500 m         16.85°   a short stroll
        2670 m         90.00°   a quarter of the way round
       10681 m        360.00°   all the way round

   Walking 10681 m turns you through a full 360°, so a player who walks
   round the planet sees the ENTIRE celestial sphere pass overhead -- in
   2.12 hours, without waiting for anything.

   THE CONSEQUENCE FOR THE SKYBOX IS THE WHOLE DESIGN: it is fixed in WORLD
   space, not view space. A classic skybox is drawn centred on the camera and
   never rotates, because in a flat world every player shares one "up". Do
   that here and the stars follow you around the planet, which reads as the
   sky being painted on the inside of your helmet.

2. a player outwalks the sun unless the day is short
   day length   terminator speed   a walking player is
        0.50 h           5.93 m/s   4.2x slower
        1.00 h           2.97 m/s   2.1x slower
        2.12 h           1.40 m/s   exactly matched
        6.00 h           0.49 m/s   2.8x FASTER -- outwalks it
       12.00 h           0.25 m/s   5.7x FASTER -- outwalks it
       24.00 h           0.12 m/s   11.3x FASTER -- outwalks it

   Below about 2.12 h of day length the sun outruns the player and
   the sky behaves like a normal game sky. Above it, A PLAYER WALKING WEST
   CAN HOLD THE SUNSET IN PLACE, or walk east into dawn. That is not a bug to
   design around; it is the most legible way this world says it is small,
   and it costs nothing because doc 16 already computes lighting per cell
   from one dot product.

3. wind must have calm points, and only one field earns its shape
   Both candidate fields, evaluated AT the two points the theorem predicts:
     project a world vector   |v| at +axis = 0.0e+0,  at -axis = 0.0e+0
     rigid rotation           |v| at +axis = 0.0e+0,  at -axis = 0.0e+0
   Exactly two calm points each, and there is no way to have fewer: the
   hairy ball theorem is the same one invariant 8 cites for "no global
   north". A wind field tangent to a sphere is zero somewhere.

   How much of the planet is becalmed, by threshold:
     speed below   share of the surface   band within
              5%                  0.13%   2.9° of an axis pole
             10%                  0.50%   5.7° of an axis pole
             25%                  3.18%   14.5° of an axis pole
   At a 10% threshold the doldrums are 0.5% of the sky and sit over the
   poles. A player will not find them by accident.

   AND THE TWO ARE NOT INTERCHANGEABLE. Divergence over 50,000 points --
   how much the field piles air up or thins it out:

     field                      mean |div|      max |div|
     project a world vector         0.9988         1.9999
     rigid rotation                3.3e-12        2.3e-11

   Rigid rotation is DIVERGENCE-FREE to numerical noise -- it is a Killing
   field, it moves the sphere along itself. The projected vector is not: it
   pours air out of one pole and into the other, so a cloud texture advected
   by it stretches at one end and bunches at the other, permanently.

   Speed by latitude falls out right as well:
     latitude   speed / equatorial
        0.000°   1.000
       26.565°   0.894
       45.000°   0.707
       60.000°   0.500
       90.000°   0.000
   Fastest at the equator, calm at the poles -- what a real atmosphere does,
   and what a player expects without being told.

   SO WIND IS ONE AXIS AND ONE RATE. Rotate the cloud sample point about that
   axis by (time x rate) before the noise lookup. No stored vectors, no
   per-cell field, and nothing that violates invariant 8 -- the axis is a
   property of the WORLD, never a heading carried by a cell.

4. clouds borrow the lattice; they are not cells and have no address
   what an address would buy, and why clouds decline it:
     the delta store   keyed by cell ID       doc 07
     the side table    keyed by cell ID       doc 27
     interest routing  by the chunk prefix    doc 22
     an edit message   names a cell ID        doc 30
   Give clouds IDs and all four become POSSIBLE, which is how a cosmetic
   sheet ends up in a save file. A cloud is a lattice point indexed by
   (face, i, j) into a transient buffer -- the way a vertex is indexed,
   not the way a block is.

   lattice spacing at a given level, on the surface and at cloud altitude:

   level   at the surface   at 300 m up   points on the whole sheet
       3        256.0 m       301.1 m          642
       4        128.0 m       150.6 m        2,562
       5         64.0 m        75.3 m       10,242
       6         32.0 m        37.6 m       40,962
       7         16.0 m        18.8 m      163,842

   A cloud does not need metre resolution. LEVEL 5 gives a ~64 m puff and
   10,242 POINTS for the entire sky -- against 41,943,042 cells for the
   surface at D 11. Four thousand times smaller than one layer of the
   world, and ten thousand floats is a buffer rather than a data structure.

   clouds at 150 m are visible out to   765 m  =  5.0% of the sky sheet
   clouds at 300 m are visible out to  1019 m  =  8.7% of the sky sheet
   clouds at 600 m are visible out to  1332 m  = 14.6% of the sky sheet

   An elevated object clears the horizon from much further away than the
   ground does -- doc 14 already uses R*acos(R/(R+h)) for a distant peak.
   So the visible sheet is a few hundred points, not a few thousand, and it
   is a SHEET rather than a volume: no crust, no layers, no chunk, no delta
   store, no collision, and nothing doc 07 has to make room for.

5. the moon: angular size is scale-free, so someone has to choose it
   Scale the real Earth-Moon system down to R = 1700 m (factor 2.67e-4):
     moon radius   463 m
     distance      102.6 km
     angular size  0.52°  <- UNCHANGED, because scaling preserves angles

   That is the finding: a faithfully scaled moon looks EXACTLY like the real
   one, which is half a degree -- about the width of a fingernail at arm's
   length. Every game that wants a moon you notice makes it bigger, and there
   is no physical size that gets you there. SO THE ANGULAR SIZE IS AN ART
   DECISION, and once it is, the moon is a painted disc rather than a place.

   drawn at  0.52° -> sits  102.57 km away, shifts  1.90° as you walk round
   drawn at  2.00° -> sits   26.55 km away, shifts  7.33° as you walk round
   drawn at  5.00° -> sits   10.62 km away, shifts 18.20° as you walk round

   The parallax column is the one that matters and it is easy to miss. On a
   planet you can circle in two hours, WALKING MOVES YOU 3,400 m ACROSS the
   moon's line of sight, so it shifts against the stars by a couple of
   degrees -- several times its own width. Put the moon in the skybox
   texture, at infinity, and that shift is missing; the moon will look
   pinned to the stars in a way players read as cheap without knowing why.
   Draw it as an object at a finite distance and the parallax is free.

6. atmospheric scattering: the one sky feature that does not scale
   Rayleigh optical depth -- how much air the light actually crosses.
   tau below about 0.01 is a black sky; Earth's zenith blue is 0.24.

   world                       scale height   zenith tau   horizon tau
   Earth                           8,500 m        0.241           9.3
   this planet, air scaled too      2.27 m       6.4e-5        2.5e-3

   THE SCALED SKY IS 3748x TOO THIN, and that is not a tuning problem --
   it is four orders of magnitude. Standing on this planet with correctly
   scaled air, the daytime sky is BLACK with stars in it, because there is
   barely any air between you and space.

   Section 5 found the opposite for the moon, and the pair is the point:

     ANGULAR SIZE is scale-free      scale the moon and it looks identical
     OPTICAL DEPTH is not            it is (a property of air) x (a path),
                                     and only the path shrinks

   So the two ends of the sky fail in opposite directions and land in the
   same place: BOTH ARE ART ASSETS. The moon because scaling preserves a
   number that was never dramatic; the sky because scaling destroys it.

   What it would take to get an Earth-like sky here, pick either:
     air 3748x denser than real air, or
     an atmosphere 8,500 m tall on a 1700 m planet -- 5.0x the radius,
     which is a pebble suspended inside a ball of air.
   Neither is a physical planet, so neither is a defensible default.

   AND THE HORIZON GLOW HAS NO GEOMETRY TO WORK WITH EITHER. On Earth the
   sky is bright at the horizon because the grazing path is 329 km of air,
   giving tau 9.3 -- saturated. Here that path is 88 m, and doc 13's
   ground horizon is only 76 m away in any case. There is no long sightline
   to accumulate color along, whatever the air is made of.

   THE RECOMMENDATION IS THEREFORE SPECIFIC: run whichever scattering model
   you like on a FICTIONAL EARTH-SIZED ATMOSPHERE. Preetham, Hosek-Wilkie and
   Bruneton are all parameterised by planet radius and scale height -- feed
   them Earth's, not this planet's. Only the SUN DIRECTION comes from the
   real world, and doc 16 already has it as a world vector.

   That composes correctly with section 1 rather than fighting it: the
   gradient depends on the angle between the view direction and the sun, and
   both are real. So sunsets move when the player walks -- the same 2.12 h
   effect -- on an atmosphere that is entirely invented.

   (Red for contrast: zenith tau 0.042 on Earth against 0.241 for blue.
   That ratio is what makes the sky blue and the sunset red, and it is a
   property of the lambda^-4 law rather than of any planet, so it survives.)

verdict
   All three are cosmetic, all three are PRESENTATION (doc 29) and therefore
   client-only, free to differ between machines, and allowed the
   transcendentals doc 23 forbids in the generator. None of it is expensive.
   What makes them non-trivial is not cost -- it is that a 1,700 m planet
   breaks the assumption every one of the standard techniques rests on:
   that the player does not move far enough to matter.

   SKYBOX: fixed in WORLD space, not view space. Walking rotates you through
   the whole celestial sphere in 2.12 h, and a camera-locked skybox
   turns that into stars glued to your head.

   CLOUDS: the LATTICE is reused, the ADDRESS is not. The construction is
   radius-independent so the hexagons are free; but there is no layer number
   for a cloud -- layers count downward -- and an address is what makes a
   thing storable, so withholding it keeps "never stored" true by
   construction. Level 5 is a 64 m puff and 10,242 points. Wind is ONE AXIS AND ONE
   RATE -- rotate the sample point before the lookup -- because the hairy ball
   theorem forbids a uniform wind and rigid rotation puts the two calm points
   at the poles, where an atmosphere puts them anyway.

   ATMOSPHERE: the ONE sky feature that does not survive scaling. Optical
   depth is a path length through a medium, and only the path shrinks, so
   correctly scaled air is 3,748x too thin and the daytime sky is BLACK.
   Run the scattering model on a FICTIONAL EARTH-SIZED atmosphere and take
   only the sun direction from the real world.

   MOON: a scaled-down real moon is still 0.52 deg, so the size is an art
   decision and the moon is a painted disc. Give it a finite distance anyway:
   walking round the planet shifts it a couple of degrees, and that parallax
   is the cheapest thing in this file.
```

## `taper.js`

Layer merging: buy it or strike it. Doc 06 caps the crust because cells taper as (R-h)/R with depth, and raises merging -- dropping horizontal resolution one level at some depth -- only to decline it. Doc 11 has carried it as "proposed, never designed" ever since. This prices both sides: how deep the taper really lets a crust run, what a merge would buy, and what the interior shell would cost.

Cited by [doc 06](06-world-sizing.md).

```
1. where the taper threshold actually sits
   narrowest surface cell, from uniform.js : 0.744 of nominal
   so the taper budget is                  : 25.6% of the radius
   doc 06's guess was 85% -> 15% of R, which is CONSERVATIVE against this,
   so nothing built on it was wrong -- but it was a judgement, and this is not.

2. max crust in layers = (1-t) * 2^D / K  -- the radius cancels
   D    block @ R=1700   max crust (layers)   as metres @ R=1700   ID layer field
    9       4.000 m              109               435 m   taper binds
   10       2.000 m              218               435 m   taper binds
   11       1.000 m              435               435 m   taper binds
   12       0.500 m              870               435 m   taper binds
   13       0.250 m             1741               435 m   layer field binds (1024)
   14       0.125 m             3482               435 m   layer field binds (1024)
   Same layer count on a 10 km planet and on an Earth-sized one: block size and
   radius scale together, so only D matters. That is worth stating on its own --
   the crust cap is a property of the grid, not of the world you sized.

3. the doc 06 worked planet: 1 m blocks, D 11, R 1700 m
   crust in use          : 64 layers  (cells at the floor are 96.2% of surface width)
   taper cap             : 435 layers
   headroom              : 6.8x deeper than the design uses
   Capping costs this planet nothing at all. It is not a constraint, it is a
   ceiling nobody is near.

4. what merging layers would buy, as a fraction of the radius
   after 0 merge(s): reach 25.6% of R  = 435 m = 435 layers @ 1 m
   after 1 merge(s): reach 62.8% of R  = 1068 m = 1068 layers @ 1 m
   after 2 merge(s): reach 81.4% of R  = 1384 m = 1384 layers @ 1 m
   after 3 merge(s): reach 90.7% of R  = 1542 m = 1542 layers @ 1 m
   But the ID gives the layer 10 bits, which addresses 1024 layers (docs 03, 06).
   Unmerged reach is 435 layers; the field stops at 1024. So the first merge
   buys 589 addressable layers -- 135% more crust -- and every merge after
   it buys nothing at all, because the ID cannot address the result.

5. what the interior shell would cost
   L      fine cells   coarse cells   columns continuing   columns dead-ending
   9    2,621,442        655,362   25.00%                75.00%
   10   10,485,762      2,621,442   25.00%                75.00%
   11   41,943,042     10,485,762   25.00%                75.00%
   Cell CENTRES nest exactly -- oneShot(n/2, i, j) equals oneShot(n, 2i, 2j), so
   every coarse centre is also a fine centre. Cell AREAS do not: a hexagon is not
   a union of four hexagons. So one fine column in four continues through the
   shell and three in four terminate against a cell they only partly overlap.

   Every one of the worked planet's 41,943,042 columns crosses that shell.
   Compare doc 14's LOD seam, which is a rim: 2.70 faces per rim column, and only
   at chunks that border a different level. This seam has no rim -- it is the
   whole planet, at one depth, forever.

6. what the shell breaks (invariant 10: the tessellation is identical at every layer)
   vertical neighbour is layer +/- 1          doc 03  ->  becomes a full doc 04 lookup at the shell
   gravity and the three frames stay cheap    doc 13  ->  frames must be rebuilt across the shell
   vertical face merging is exact (1.5e-16)   doc 14  ->  stacked cells no longer share a radial plane
   sky light stored per column, 32x smaller   doc 16  ->  columns are no longer straight through

verdict
   buys : 589 layers of addressable crust on the worked planet, 135%
   costs: an unrimmed seam across all 41,943,042 columns, and four results
          that four separate documents are built on
   Cap the crust. Strike layer merging.
```

## `uniform.js`

How uniform are the cells, really? Doc 02 has claimed 1.3:1 in area and 1.14:1 in spacing since the first draft, with no script behind either. Both are load-bearing: doc 10 divides by the largest spacing to keep its A* heuristic admissible, and doc 06 sizes blocks from a mean. This measures the real spread on the one-shot grid doc 15 pins the design to, and finds the closed form it converges to.

Cited by [doc 02](02-geometry-choice.md), [doc 10](10-pathfinding.md).

```
1. cell AREA variation, measured two independent ways
   L      cells   sum/4pi   A hex-only   B hex-only   B incl. pentagons
   2        162  1.0000000   1.1625       1.1673       1.8950
   3        642  1.0000000   1.5207       1.5258       2.3261
   4       2562  1.0000000   1.7466       1.7496       2.5404
   5      10242  1.0000000   1.8679       1.8694       2.6428
   6      40962  1.0000000   1.9300       1.9307       2.6922
   7     163842  1.0000000   1.9613       1.9617       2.7164
   the two methods agree to 4 decimals and both close on 4pi, so the spread is
   a property of the grid and not of the measurement.

2. the limit, and why it is a constant
   face angular radius theta_v            = 37.3774 deg
   predicted area ratio   sec^3(theta_v)  = 1.992806
   measured, extrapolated from the series = 1.992646
   predicted linear ratio sec^1.5(theta_v)= 1.411668
   They agree to four decimals. The ratio does NOT shrink with depth -- a face
   triangle is scale-free, the same reason hexround.js sees its disagreement
   plateau. At L=2 the ratio is 1.17 and at L=3 it is 1.53, which is where the
   documented "1.3:1" came from: it is a low-level reading, and the design runs
   at level 11.

3. edge length against doc 06 nominal spacing (unit sphere)
   L      cells   mean/nom   min/nom   max/nom   max:min
   2        162   0.9944    0.8430    1.0837    1.2856
   3        642   0.9977    0.7938    1.0947    1.3790
   4       2562   0.9985    0.7682    1.0975    1.4286
   5      10242   0.9987    0.7554    1.0982    1.4539
   6      40962   0.9988    0.7489    1.0984    1.4666
   7     163842   0.9988    0.7457    1.0984    1.4730
   8     655362   0.9988    0.7441    1.0984    1.4762
   mean/nominal settles at 0.9988, so doc 06's K formula is right to 0.12%.
   max/nominal settles at 1.0984 -- the admissible divisor for doc 10 is
   10% ABOVE NOMINAL, not the 7% that document derived from 1.14:1.
   min/nominal settles at 0.744, at a pentagon, which is the narrowest cell
   that exists anywhere on the surface -- the anchor taper.js uses.

summary
   hexagon area variation          1.99 : 1   (sec^3 theta_v), NOT 1.3 : 1
   including the twelve pentagons  2.74 : 1
   hexagon linear variation        1.41 : 1   (sec^1.5 theta_v), NOT 1.14 : 1
   edge length variation           1.48 : 1   min at a pentagon
   safe A* divisor                 1.10 x nominal
```

## `volume.js`

Meshing terrain that is GENERATED, not stored. Doc 08 makes terrain a pure function of position -- a height-field term, optionally plus a density-field term for caves -- and doc 14's cost model quietly assumed the first, on a smooth sphere. This measures relief, caves, and what generation costs.

Cited by [doc 08](08-terrain-generation.md), [doc 14](14-meshing-and-lod.md).

```
1. how far away can you SEE something, versus where the ground ends
   R = 1700 m, eye 1.7 m. Ground horizon = 76 m.
   peak height   visible from   visible cells within that range   x ground-only
           0 m           76 m                            20,951            1.0x
          10 m          260 m                           244,673           11.7x
          30 m          393 m                           558,028           26.6x
          60 m          521 m                           977,791           46.7x
         120 m          697 m                         1,736,972           82.9x
         300 m        1.02 km                         3,657,222          174.6x
   a 60 m hill is visible from 7x further than flat ground, and the cells
   inside that radius are ~46x the ground-horizon count. Doc 14's 21,000
   is the count for a SMOOTH sphere and is a floor, not a budget.

2. exposed faces per column -- doc 08's HEIGHT FIELD term alone
   surfaceRadius = R(1 + amp*fbm(dir)), one evaluation per column, no caves
   (patch of 765 cells)
   relief   mean |slope|   cap   side faces   side QUADS after merge   tris/column
      0 m         0.000  1.00         0.00                    0.00          4.00
     10 m         0.671  1.00         1.93                    1.63          7.27
     30 m         2.022  1.00         5.80                    2.42          8.84
     60 m         4.038  1.00        11.59                    2.65          9.30
    120 m         8.097  1.00        23.23                    2.76          9.53
   raw side faces explode with relief, but each unbroken run collapses to
   ONE quad, so the triangle count barely moves. Vertical merging is what
   keeps a volume affordable -- without it this table is the cost.

3. adding doc 08's DENSITY FIELD term: (surfaceRadius - |p|) + noise3D*strength
   64 layers under 30 m of relief. Feature size = R/freq, and enclosed
   voids need amplitude/feature > 1 -- otherwise the bias term always wins.
   freq  strength  feature  gradient   cave cells   spans/column   faces/column
     40         0     42.5m      0.00            0          1.000            1.0
     40        26     42.5m      0.31            1          1.001           10.9
    140        26     12.1m      1.07          101          1.132           13.1
    220        26      7.7m      1.68          222          1.290           12.8
    140        40     12.1m      1.65          242          1.316           18.9
   freq 40 carves nothing at all -- gradient 0.31, the bias always wins.
   Only the high-frequency rows make real voids, and those are what drive
   both the face count and the multi-span columns the skirt has to handle.

4. the smallest feature each level can still represent
   level   cell spacing   a 3 m cave   a 10 m canyon   a 40 m valley
      11        1.00 m     survives        survives        survives
      10        2.00 m         GONE        survives        survives
       9        4.00 m         GONE        survives        survives
       8        8.00 m         GONE            GONE        survives
       7       16.00 m         GONE            GONE        survives
       6       32.00 m         GONE            GONE            GONE
   a coarse mesh cannot show a cave narrower than two of its cells, so
   interior geometry must not be LOD-ed at all -- it is culled by being
   enclosed, which is free and exact, rather than simplified.

5. noise evaluations to generate one chunk (D = 11, C = 6, 64 layers)
   LOD   columns   height field   + density, full crust   + density, band only
      -0       561          2,805                  146,421                  74,613
      -1       153            765                   39,933                  20,349
      -2        45            225                   11,745                   5,985
      -3        15             75                    3,915                   1,995
   the density field is 51x the height field over a full crust,
   and 26x when restricted to a band around the surface.
   Each LOD step drops the columns 4x, so it cuts generation as well as
   drawing -- and since a coarse chunk cannot show a cave anyway (section 4),
   far chunks can skip the density term entirely and run height field only.
   That makes a LOD-2 chunk 332x cheaper to generate than a near one.
```

## `water.js`

Water is a block type: translucent, no collision, written once by the generator (doc 24). Blocks are cheap; TRANSLUCENT blocks are the ones that make renderers difficult, because they cannot be drawn in any order. So the questions are how much water surface there is, and how many layers of it a player ever looks through at once.

Cited by [doc 25](25-water.md).

```
level 7: 163,842 columns, 60 m of relief, 1 m blocks
  69.2% of columns hold water, deepest 43 m

1. how much water actually gets drawn
   water cells in the world:      1,589,689
   faces if drawn as a volume:    12,717,512 (8 per prism)
   faces actually drawn:          113,455  = 113,455 tops + 0 sides
   ratio:                         0.89%
   The sea is one skin, not a solid. Every ocean cell below the top one is
   enclosed by other water and emits nothing -- the same rule doc 14 already
   applies to stone, with no extra work for being transparent.
   And note the side count. GENERATED water never has an exposed side: it is
   always held by land at or above its own level, or by more water. A water
   face that stands in open air only exists where a PLAYER built one.

2. the sea surface merges better than anything else
   sea level is a constant radius, so the surface has no relief at all
   doc 14's merge limit is curvature alone: 37 m at 0.1 m of sag
   that is 37 cells across, merged into one quad
   Terrain never merges that far because terrain is not flat. The ocean is,
   everywhere, so the largest surface in the world is also the cheapest.

3. how many water surfaces overlap in one view
   58 separate bodies of water on the planet
   distinct bodies within a standing player's 76 m horizon:
     0 bodies   17.1% of viewpoints
     1 body    82.3% of viewpoints
     2 bodies   0.6% of viewpoints
     3 bodies   0.0% of viewpoints
   worst seen: 3
   Water fills a column from the bottom up, so a view crosses one body once.
   Sorting a handful of surfaces per frame is not a sorting problem -- it is
   a sort of a handful of things.

4. wading in, and getting back out
   4,189 shore columns (wet, with dry land next to them)
   depth at the water's edge:
      1 block   85.3%
      2 blocks  13.9%
      3 blocks  0.7%
   wade in (bottom reachable by a 1.8 m player): 85.3%
   swimming from the first cell:                  14.7%
   you can step out (bank <= 1 m) at 99.9% of shore columns
   bodies of water with at least one exit: 58 of 58
   worst bank anywhere: 1.23 m
   Water deepens gradually because it fills a valley, and a valley has
   sides -- so a shore is a ramp, not a wall, and the wading band exists
   without anyone designing it. Nothing traps a swimmer.
   Note there is no chest-deep: at 1 m blocks a 1.8 m player
   stands in one block of water and swims in two. The transition between
   walking and swimming is ONE cell wide, so it is a threshold rather than
   a gradient, and the mover needs no partial-buoyancy case.
   a player falling at 50 m/s crosses, per frame:
     144 Hz  0.35 m = 0.3 blocks
      60 Hz  0.83 m = 0.8 blocks
      30 Hz  1.67 m = 1.7 blocks  <- skips a cell
      20 Hz  2.50 m = 2.5 blocks  <- skips a cell
   So test the swept segment, not the endpoint. Doc 09 already walks a
   ray cell by cell; entering water is that walk with a different test.

5. what it costs when a player touches it
   remove one water block   -> one delta, 57 bits (doc 03)
   place one water block    -> one delta, and it stays where it was put
   wall across a river      -> as many deltas as blocks placed, and nothing else
   drain a lake by hand     -> one delta per block removed, no propagation
   Because water never moves, an edit to it costs exactly what an edit to
   stone costs. There is no flood fill, no re-route, no cascade, and no
   second system to keep consistent.
   Placement is what breaks the 0-sides result in section 1, and only that:
   GENERATED water has no exposed side, so a player-built one is the only
   kind there is. Same for the one-surface figure in section 3 -- a built
   aquarium in front of a lake is two surfaces, and no measurement of the
   generated world can bound what someone chooses to build.

verdict
   Water as blocks is cheaper than it sounds in every direction that matters.
   Interior faces cull like any other material, so the ocean draws as a skin
   rather than a solid. The surface is at a constant radius, which makes it
   the only genuinely flat thing on the planet and the best merging candidate
   there is. And because water fills columns from the bottom, a player almost
   never looks through more than one surface at a time -- so the transparency
   sorting doc 14 left open is a sort of very few things.
```

## `winding.js`

The middle child of a triangle split comes out "upside down", and doc 03 has called the frame inside it MIRRORED since the first draft. That word implies a change of handedness, which would reach into meshing, normals and every chirality-dependent thing in the engine. This checks what the flip actually is.

Cited by [doc 03](03-addressing.md), [doc 11](11-open-topics.md).

```
1. what the middle-child map actually is
   doc 04 descends into the middle child with  i -> half-i,  j -> half-j
   linear part = diag(-1, -1),  determinant = (-1)(-1) = +1
   A reflection has determinant -1. Negating BOTH axes is a HALF TURN.
   So handedness is preserved and nothing in the world is mirrored.

2. where a naively (q,r)-derived direction really points
   parent frame:      k -> bearing
     k=0    0.0 deg
     k=1   60.2 deg
     k=2  120.3 deg
     k=3  180.0 deg
     k=4  240.4 deg
     k=5  300.4 deg
   middle-child frame reads offset (di,dj) as (-di,-dj):
     naive k=0 really points at k=3   (+3)
     naive k=1 really points at k=4   (+3)
     naive k=2 really points at k=5   (+3)
     naive k=3 really points at k=0   (+3)
     naive k=4 really points at k=1   (+3)
     naive k=5 really points at k=2   (+3)
   every direction shifts by the SAME amount: yes, +3
   A uniform shift is a rotation. A reflection would send k -> c-k, which
   reverses the order and leaves two directions fixed. Nothing is fixed here.
   ring order preserved (still counter-clockwise from outside): true

3. emitting a child by index pattern
   child 0  corner listed in rising index order -> outward
   child 1  corner listed in rising index order -> outward
   child 2  corner listed in rising index order -> outward
   child 3  MIDDLE listed in rising index order -> INWARD
   The middle child comes out inward when its vertices are listed by the
   same rising-index rule as a corner child. That is a property of the
   LISTING, not of the geometry -- swap any two of its vertices and it is
   outward again. It is where a mesher gets a hole, so list deliberately.

4. the two patterns doc 14 emits, over a whole face
   up   (i,j),(i+1,j),(i+1,j+1):  36 outward, 0 inward
   down (i,j),(i+1,j+1),(i,j+1):  28 outward, 0 inward
   Both patterns are already correct -- they are deliberately different, and
   reusing one for both is what turns half a mesh inside out.

5. how much of the world sits in a rotated frame
   D=8, C=4: 15104 of 33153 cells = 45.6% sit in a rotated frame
   (qr.js reports the same 15104 of 33153 from the same descent)
   So a naive direction index is reversed across nearly half the planet,
   and it changes at every chunk border -- which is why the symptom looks
   like rails that reverse when they cross a boundary.

verdict
   The flip is a HALF TURN, not a mirror. Handedness never changes, the
   neighbour ring stays counter-clockwise, and the whole error is a uniform
   +3 on the direction index. Order the ring geometrically inside neighbour()
   and none of it reaches the rest of the engine.
```

---

_37 scripts. Every number above is reproduced by running them._
