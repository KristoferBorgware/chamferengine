# How to take a frame

The client runs in this container and hands back real frames. Chromium draws
WebGPU on a software adapter, the DevTools protocol drives the page, and a
screenshot comes back as PNG that can be read pixel by pixel.

Read this before making a claim about how something looks, and before writing a
probe that measures a mesh instead of a picture.

---

## Four flags, and all four are needed

```
/opt/pw-browsers/chromium-*/chrome-linux/chrome \
  --headless=new --no-sandbox \
  --enable-unsafe-webgpu \
  --enable-features=Vulkan \
  --use-angle=swiftshader \
  --use-vulkan=swiftshader \
  --remote-debugging-port=9222 --window-size=1280,800 about:blank
```

Drop any one of the three WebGPU flags and the page still loads, the readout
still updates, and the canvas holds no picture:

| Flags | Canvas |
|---|---|
| `--enable-unsafe-webgpu --use-angle=swiftshader` | white |
| `--enable-unsafe-webgpu --use-vulkan=swiftshader` | black |
| `--enable-unsafe-webgpu --enable-features=Vulkan` | black |
| `--enable-unsafe-webgpu --enable-features=Vulkan --use-vulkan=swiftshader` | black |
| `--enable-unsafe-webgpu --enable-features=Vulkan --use-angle=swiftshader` | white |
| **all four** | **the world** |

The frame rate says which one you have. A configuration that presents nothing
reports **1,250 fps** and no `gpu` figure, because the frame ends at the swap
chain. A configuration that draws reports **around 100 fps** at 1280 by 800,
with a `gpu` figure of 50 to 80 ms beside it.

## The world is a URL, and every knob is a parameter

`npm run dev` serves the client on port 5173. The landing page is `/`, and the
world itself is `/planet.html`, which takes a seed:

```
http://localhost:5173/planet.html?seed=chamfer
```

Every field of `PlanetKnobs` is a query parameter, read by
`PlanetSettings.fromParams`. That is what makes a comparison possible without
touching the source: `&apron=false` draws the same world with the apron off,
`&seamOverlay=true` paints the joins, `&plain=false` gives the world back its
noise, its water and its sky. Two frames from two URLs attribute an artifact to
the thing that causes it.

## Drive it over the DevTools protocol

Node 22 has a global `WebSocket`, so the whole harness is one file with no
dependencies. Ask the browser for its page target, connect, navigate, wait,
screenshot:

```js
import { writeFileSync } from "node:fs";

const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
	const m = JSON.parse(e.data);
	if (m.id && pending.has(m.id)) pending.get(m.id)(m.result), pending.delete(m.id);
};
const send = (method, params = {}) =>
	new Promise((r) => {
		const n = ++id;
		pending.set(n, r);
		ws.send(JSON.stringify({ id: n, method, params }));
	});

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
	width: 1280, height: 800, deviceScaleFactor: 1, mobile: false,
});
await send("Page.navigate", { url: "http://localhost:5173/planet.html?seed=chamfer" });
await new Promise((r) => setTimeout(r, 45000));

const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync("frame.png", Buffer.from(shot.data, "base64"));
ws.close();
```

Two more calls cover everything else a session needs.
`Runtime.evaluate` with `returnByValue` reads the readout, which is the
`#status` element:

```js
await send("Runtime.evaluate", {
	expression: "document.querySelector('#status')?.innerText ?? ''",
	returnByValue: true,
});
```

`Input.dispatchKeyEvent` moves the player. A key needs a `keyDown` and a
`keyUp` with the same `key`, `code` and `windowsVirtualKeyCode`, and a held key
is the two of them with the wait in between:

```js
const key = (type, k, code, vk) =>
	send("Input.dispatchKeyEvent", { type, key: k, code, windowsVirtualKeyCode: vk });
await key("keyDown", "w", "KeyW", 87);
await new Promise((r) => setTimeout(r, 1200));
await key("keyUp", "w", "KeyW", 87);
```

## Wait for the readout, not for a timer

The readout's third line counts chunks: `148 of 361 chunks drawn, 361 held`.
The first number is what passed the frustum cull this frame and the second is
what is resident, so the two settle at different values and a third of the
resident set is the usual figure for a 65-degree view. `361 building` appears
on the end of the same line while work is outstanding, and its absence is what
says the world has filled in.

Generating a chunk here takes tens of seconds of wall clock across the worker
pool. Forty-five seconds is enough for a standing view at the shipped settings;
a frame taken earlier is a frame of a half-built world, and its horizon is the
edge of what arrived rather than the edge of what the selection asked for.

## The world itself runs in slow motion, so poll the state and never sleep

The frame loop advances the world by `min(0.1, dt)` seconds of world time, and
the software rasterizer delivers frames slowly enough that the clamp binds.
Measured on a depth-11 planet at 800 by 600: the page advanced **0.1 s of world
time per 1.5 s of wall clock**, a fifteenth of real time.

Everything the player does inherits that. A world opens with the camera over
the ground and the fall to the surface is a couple of hundred metres — six
seconds of world time, and **a minute and a half** here. A jump is 1.3 s of
world time and twenty seconds of waiting.

So a sleep long enough to look right is a sleep that lands mid-fall, and the
readout will not tell you: its last line says `walking` for a player who is
still falling, because that word only means *not flying and not swimming*. Poll
something that actually settles — the altitude on line two, held still across
several reads — or hang a hook on `window` for the run and read the player back
by value:

```js
// In the draw loop, for the length of one investigation.
(window as unknown as Record<string, unknown>).__dbg = {
	r: player.position.length(),
	standing: player.standing,
};
```

Then wait on `standing`, not on a clock. Take the hook out again before
committing: it is a probe, not a feature.

## Read the pixels, not the picture

Looking at a frame says something is wrong. Reading it says what.

`Page.captureScreenshot` returns a PNG with one filter byte per scanline, so a
reader inflates the `IDAT` chunks with `node:zlib` and undoes filters 0 to 4
across the rows. Chromium writes color type 6, four bytes a pixel; the tools
here also write color type 2, three bytes a pixel.

Take a column of pixels through the artifact and divide by the ground beside
it. The terrain shader multiplies a vertex color by `0.30 + 0.70 * lambert`,
the mesher multiplies a block's color by `FACE_SHADE` and by
`AMBIENT_OCCLUSION`, and every one of those is a small number that can be
recognised by hand. A band at 0.58 of the ground next to it is a side face with
a corner occluded, not a lighting effect and not a hole.

Two shader edits narrow it further, each one line in `TERRAIN_SHADER`.
Returning `normal * 0.5 + 0.5` shows the normal as a color, which separates
geometry from shading — flat ground comes back one color and each wall of a
hexagon another, and any speckle in it is the normal itself going wrong.
Returning `in.color * 2.0` shows what the mesher wrote, which separates the
mesher from the renderer.

## Two frames and a division

`tools/frame-diff.mjs` takes two PNGs of the same view and reports the spread of
the ratio between them, pixel by pixel. It answers the questions a single frame
cannot: **did this change move light between surfaces, or did it move all of
them together?**

```
node tools/frame-diff.mjs a.png b.png [--skip 0,0,540,200]
```

`--skip` leaves out a box, and it defaults to the one the readout is drawn in,
because that says different things in the two frames. Pixels too dark to carry
a ratio are left out as well.

A ratio of 1.198 with a **0.6%** spread is one number over the whole picture —
every surface moved together, which is what ambient light does. The same view
with a directional sun reads 0.803 with a **58.6%** spread, a fifth percentile
of 0.394 and a ninety-fifth of 1.533: some faces went two and a half times
darker while others went half again brighter.

## A frame here settles what is drawn, never how fast

The adapter is a software rasteriser. Everything about the picture is real: the
geometry, the colors, the depth test, what wins and what leaks. Nothing about
the timing is: the frame rate, the `gpu` figure and the worst-frame reading
belong to SwiftShader on a container's cores, and the numbers this project
quotes for frame cost come from `npm run bench`, which measures generation and
meshing on the CPU, or from a run on real hardware.
