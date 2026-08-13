# 05 — Face adjacency

## The problem

Each of the 20 icosahedron faces has its own local `(i, j)` grid, with an origin
corner chosen independently. Walking off one face and onto another means
re-expressing coordinates in a frame that has no relationship to the one you
came from.

## The table

60 entries — 20 faces × 3 edges — each answering: *if I walk off this edge, where
do I land, and which way is up now?*

```
struct EdgeLink {
    u8 neighbourFace;   // which of the 20 faces is over there
    u8 neighbourEdge;   // which of its 3 edges I arrive on
    u8 reversed;        // whether the shared edge runs the opposite way
}

EdgeLink table[20][3];
```

**180 bytes** at one byte per field.

## Construction

Do not hand-author it. Compute it at startup: for each face, for each of its
three edges (a vertex pair), find the other face containing that same pair, and
record which of its edges it is and whether the pair appears in the same or
reversed order.

```js
const table = F.map((f, fi) => [0,1,2].map(e => {
  const a = f[e], b = f[(e+1) % 3];
  for (let g = 0; g < 20; g++){
    if (g === fi) continue;
    for (let e2 = 0; e2 < 3; e2++){
      const c = F[g][e2], d = F[g][(e2+1) % 3];
      if ((a === c && b === d) || (a === d && b === c))
        return { face: g, edge: e2, reversed: (a === d && b === c) ? 1 : 0 };
    }
  }
}));
```

> **[verified]** `verification/adj.js` builds the real table. All 60 edges match
> with no gaps, and **every entry comes out `reversed`** — the signature of
> consistent outward winding across all 20 faces, which is what you want. Sample
> rows:
>
> ```
> face  edge0            edge1            edge2
>   0 -> f 4 e2 rev  -> f 6 e0 rev  -> f 1 e0 rev
>   1 -> f 0 e2 rev  -> f 5 e0 rev  -> f 2 e0 rev
>   2 -> f 1 e2 rev  -> f 9 e0 rev  -> f 3 e0 rev
>   3 -> f 2 e2 rev  -> f 8 e0 rev  -> f 4 e0 rev
> ```

## Why the relationship is stored rather than computed

It differs for every face and edge. There is no closed-form rule, because the
face vertex ordering is arbitrary — it comes from whatever icosahedron
construction you used. Compute once, store, done.

## Why this matters

**This single table is where all the sphere-ness of the world lives.** Everywhere
else — movement, building, pathfinding, terrain — code just walks a flat hex
grid. Only `neighbour(id, direction)` ever consults it, and only when a step
leaves a face.

Together with the twelve pentagon IDs, it is the complete set of constant data
the sphere requires. A few hundred bytes, fixed at build time, never growing no
matter how deep the subdivision goes.

**Demo:** [`demos/adjacency-table-2d.html`](../demos/adjacency-table-2d.html) —
one face laid flat with its three neighbours folded out, the paper-model view.
Each ringed circle is a triangle's `0,0` origin with its `i` and `j` axes. The
gold dot is a single physical cell on the seam, with its address shown in *both*
frames — the gap between those two numbers is exactly what the table exists to
close. Step through faces to see the relationship change every time.
