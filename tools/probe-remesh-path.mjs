#!/usr/bin/env node
// Which rebuild a knob takes in the real client, and what it costs the thread
// that draws.
//
//   node tools/probe-remesh-path.mjs [--port 9223] [--url ...]
//
// A knob in BAKED_KNOBS needs every chunk meshed again and nothing else; a
// knob in LIVE_TERRAIN_KNOBS needs the coarse map built with it. The two are
// wired separately, and a routing mistake looks like nothing at all from
// outside -- the world still rebuilds, it just spends a second on a map it
// could not move. So this drives the panel and reads which path ran off the
// readout, which is the one place the client says.
//
// Requires `npm run dev` on port 5173. Wall-clock figures are on a software
// adapter and move run to run; the paths do not. What they leave out is the
// map itself: `tools/trial-remesh.ts` measures that, off a browser entirely.
import { globSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
	const at = args.indexOf(name);
	return at < 0 ? fallback : args[at + 1];
};
const port = Number(flag("--port", "9223"));
const url = flag(
	"--url",
	"http://localhost:5173/planet.html?panel=1&seed=chamfer",
);

const { spawn } = await import("node:child_process");
const chrome =
	globSync("/opt/pw-browsers/chromium*/chrome-linux/chrome")[0] ??
	globSync("/opt/pw-browsers/chromium*/chrome-linux64/chrome")[0];
const browser = spawn(
	chrome,
	[
		"--headless=new",
		"--no-sandbox",
		"--enable-unsafe-webgpu",
		"--enable-features=Vulkan",
		"--use-angle=swiftshader",
		"--use-vulkan=swiftshader",
		`--remote-debugging-port=${port}`,
		"--window-size=1280,800",
		"about:blank",
	],
	{ stdio: "ignore" },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pageTarget() {
	for (let tries = 0; tries < 80; tries++) {
		try {
			const list = await (
				await fetch(`http://127.0.0.1:${port}/json/list`)
			).json();
			const page = list.find((t) => t.type === "page");
			if (page) return page;
		} catch {
			// not up yet
		}
		await sleep(250);
	}
	throw new Error("chromium never opened its debugging port");
}

const page = await pageTarget();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (event) => {
	const message = JSON.parse(event.data);
	if (message.id && pending.has(message.id)) {
		pending.get(message.id)(message.result);
		pending.delete(message.id);
	}
};
const send = (method, params = {}) =>
	new Promise((resolve) => {
		const n = ++id;
		pending.set(n, resolve);
		ws.send(JSON.stringify({ id: n, method, params }));
	});
const run = async (expression) =>
	(
		await send("Runtime.evaluate", {
			expression,
			returnByValue: true,
			awaitPromise: true,
		})
	).result?.value;

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
	width: 1280,
	height: 800,
	deviceScaleFactor: 1,
	mobile: false,
});
await send("Page.navigate", { url });

// Wait for the world, not for a timer.
for (let tries = 0; tries < 40; tries++) {
	await sleep(1500);
	const status = await run(
		"document.querySelector('#status')?.innerText ?? ''",
	);
	if (status && !/building/.test(status) && tries > 3) break;
}

// The recorder: the longest gap between two animation frames. A synchronous
// stretch on this thread cannot hide from it.
await run(`
	// A frame on a software adapter is tens of milliseconds even when nothing
	// is wrong, so a gap only counts as a stall past a threshold well over
	// that. The blocked figure is how much time went into stalls in total,
	// which is what a person waits; the worst one is the single longest.
	window.__gaps = { worst: 0, blocked: 0, last: performance.now() };
	(function tick() {
		const now = performance.now();
		const gap = now - window.__gaps.last;
		if (gap > window.__gaps.worst) window.__gaps.worst = gap;
		if (gap > 250) window.__gaps.blocked += gap;
		window.__gaps.last = now;
		requestAnimationFrame(tick);
	})();
	window.__row = (label) => [...document.querySelectorAll('.knob')]
		.find((k) => k.querySelector('label')?.textContent.trim().startsWith(label));
	window.__arm = () => { window.__gaps.worst = 0; window.__gaps.blocked = 0; window.__gaps.last = performance.now(); };
	'ok'
`);

// Live rebuild on, or a knob only marks the Rebuild button dirty.
await run(`
	(() => {
		const box = [...document.querySelectorAll('label')]
			.find((l) => l.textContent.includes('Live rebuild'))?.querySelector('input');
		if (!box) return 'no live rebuild checkbox';
		if (!box.checked) { box.click(); }
		return box.checked ? 'live rebuild on' : 'live rebuild refused';
	})()
`).then((r) => console.log(`   ${r}`));

/** Move one row, then report the worst stall while it settles. */
async function measure(label, how) {
	await sleep(2500);
	await run("window.__arm()");
	const found = await run(`
		(() => {
			const row = window.__row(${JSON.stringify(label)});
			if (!row) return 'no row';
			const input = row.querySelector('input');
			${how}
			return 'moved';
		})()
	`);
	if (found !== "moved") return `${label}: ${found}`;
	// The two paths say which they are on the readout, and the line is
	// transient -- the next refresh writes the ordinary readout over it -- so
	// it is polled across the panel's own 350 ms settle rather than read once.
	let path = "?";
	for (let tries = 0; tries < 60; tries++) {
		await sleep(100);
		const said = await run(
			"document.querySelector('#status')?.innerText ?? ''",
		);
		if (/rebuilding the (terrain|meshes)/.test(said)) {
			path = /terrain/.test(said) ? "terrain path" : "mesh path";
			break;
		}
	}
	await sleep(6000);
	const worst = await run("window.__gaps.worst");
	const blocked = await run("Math.round(window.__gaps.blocked)");
	return `${label.padEnd(14)} ${path.padEnd(13)} worst stall ${Math.round(worst)} ms, blocked ${blocked} ms`;
}

const CLICK = "input.click();";
const DRAG =
	"input.value = String(Number(input.value) + Number(input.step || 1));" +
	"input.dispatchEvent(new Event('input', { bubbles: true }));";

console.log(await measure("Full light", CLICK));
console.log(await measure("Corner shading", CLICK));
console.log(await measure("Relief", DRAG));

ws.close();
browser.kill();
