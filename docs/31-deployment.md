# 31 — Deployment

> **This document is a plan, not a decision.** Everything in
> [doc 30](30-authority-and-cheating.md) and earlier is settled and measured.
> This is the intended shape of the hosting, written down so it can be argued
> with. **V1 runs entirely on one machine** and needs none of it. Nothing later
> in the specification depends on any choice here.

## The problem

The game has to run somewhere, and the cheapest wrong answer is a database.

---

## V1 is local, and that is the whole plan

**V1: the browser, the filesystem, and nothing else.**

- **The client** is TypeScript in the browser ([doc 28](28-language-and-runtime.md)),
  rendering with **WebGPU**.
- **The server** is [doc 30](30-authority-and-cheating.md)'s decision: a point of
  storage only. It holds the delta store, routes edits, validates nothing.
- **Storage is the filesystem**, and the "server" is a local process — or the same
  process, since [doc 29](29-what-runs-where.md) notes single player is the whole
  diagram with the network replaced by a function call.

That is enough to play, and it defers every question below. The rest of this page
is what happens when other people need to join.

---

## The delta store does not need a database

Worth settling before choosing one, because it changes the answer.

[Doc 07](07-data-structures.md) makes the **chunk** the load/store unit, and
[doc 22](22-multiplayer-interest.md) shows a contiguous ID range is one compact
patch. So the store is:

```
chunk ID  →  the deltas inside that chunk
```

One key, one blob, one `get`, one `put`. **No query engine, no secondary indexes,
no joins.** And it is small: doc 07 prices ten million player edits at **76 MB**
before compression. The whole delta store of a well-played world fits in memory
on the smallest machine anyone rents.

That rules out a document database on shape rather than on price. A document store
is for querying documents, and nothing here queries anything.

**DynamoDB is the fit**: the key is an integer, access is by exact key or by
range, and it bills per request rather than per hour. **S3** is the alternative for
the same access pattern at lower cost and higher latency, which suits cold chunks
nobody has visited this month.

---

## The connection layer, and the one number to watch

The intended shape is **API Gateway WebSocket → Lambda → DynamoDB**, with S3 for
anything large. Clients connect through API Gateway; an edit arrives as a message,
Lambda writes it and fans it out to the connections doc 22's interest test selects.

**This fits V1's server better than it would fit most game servers**, and the
reason is [doc 30](30-authority-and-cheating.md)'s scope decision: a
storage-and-route server has **no tick loop and no simulation state**, which is
the thing serverless is bad at. Receive, store, fan out. That is a Lambda.

### The cost is in the fan-out, not the storage

Storage is 76 MB and requests are pennies. The number that grows is **messages**,
because interest management *is* fan-out:

```
messages/second  ≈  players × edits per player per second × interested recipients
```

API Gateway WebSocket bills per message. A hundred players building actively, each
edit reaching ten neighbours, is a few hundred dollars a month in messages alone —
where one small always-on container does the same fan-out for nothing.

**So instrument the message count from the first day.** It is the number that says
when to move, and it is not the number anyone watches by default.

### Which makes the migration trigger already known

The honest answer to *"start serverless and move to a box later?"* is **yes**, and
the reason is not that serverless is better. It is that:

- **The easy direction is serverless → box.** Lambda forces connection and player
  state into an external store; a box can read that same store on the first day and
  move it into memory whenever it likes. Starting on a box and moving *to* Lambda
  means extracting state that has quietly spread through the code.
- **The trigger is already scoped.** Doc 30 puts server-side simulation — mobs, a
  tick loop, resident chunks — in **V2**. That is exactly the workload Lambda
  cannot hold. **The move to a box and the arrival of V2 simulation are the same
  event**, so this is not an unknown future decision.
- **Scale to zero is worth real money to a world nobody is playing**, which
  describes most worlds most of the time.

The insurance is one interface, written on the first day:

```
onMessage(playerId, message)      how a message arrives
send(playerId, message)           how one leaves
```

Everything above those two functions is the game. Everything below is either a
Lambda handler and `postToConnection`, or a `ws` server and a socket. **Swapping
the transport should not touch a line of game code.**

---

## The client, and why there is no Vulkan in this plan

**WebGPU, and only WebGPU.** It is the browser's graphics API, and it is *already*
the abstraction over Vulkan, Metal and D3D12 — Chrome's implementation compiles to
them, and Firefox's is `wgpu`, the same library a native Rust engine would use.

So a native desktop client is **not** a second renderer. It is the same TypeScript
in a wrapper — Tauri, which uses the system webview, or Electron, which brings its
own Chromium and is larger but consistent everywhere. **Writing Vulkan and D3D12
backends by hand would be re-implementing what WebGPU exists to provide**, and it
is probably the largest avoidable cost available to this project.

**Honest caveat:** WebGPU's availability is still moving. It shipped in
Chrome/Edge first, then Safari, then Firefox, and Linux has been the slowest.
Check the current state rather than trusting this paragraph — it is the one claim
here with a shelf life.

---

## Still open

- **Everything above.** This is a sketch, and none of it is measured. The message
  cost is an order-of-magnitude estimate from published pricing, not a bill.
- **Latency and prediction.** API Gateway plus Lambda plus a DynamoDB round trip
  is not fast. [Doc 30](30-authority-and-cheating.md) already lists client-side
  prediction and rollback as open, and this makes it load-bearing rather than
  optional.
- **How chunks are batched into DynamoDB items.** One item per chunk is the
  obvious answer and nobody has checked it against the 400 KB item limit or
  against how deltas actually clump.
- **Authentication.** Not mentioned anywhere in this specification, and it is the
  first thing a real deployment needs.
- **Whether S3 or DynamoDB owns cold chunks**, and what moves one to the other.

---

## In one breath

- **V1 is local**: browser, WebGPU, filesystem. None of the rest is needed to play.
- **The delta store is a blob keyed by chunk ID** — one `get`, one `put`, no query
  engine — and the whole of a well-played world is **76 MB**. That rules out a
  document database on shape, not price. **DynamoDB**, with S3 for cold chunks.
- **API Gateway WebSocket into Lambda fits**, unusually — because doc 30 scoped
  the server to storage, so there is no tick loop for serverless to be bad at.
- **The cost is fan-out, not storage.** Interest management *is* fan-out; measure
  messages per second from day one, because that is the number that says move.
- **Serverless first, box later, and the trigger is already known**: it is the
  same event as V2 simulation. Keep `onMessage` and `send` behind an interface and
  the swap touches no game code.
- **WebGPU only.** It is already the abstraction over Vulkan, Metal and D3D12; a
  native client is the same TypeScript in Tauri or Electron, not a second renderer.
