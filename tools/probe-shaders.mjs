#!/usr/bin/env node
// Does every shader the client builds actually compile?
//
//   node tools/probe-shaders.mjs [--url ...] [--port 9291] [--wait ms]
//                                [--presents no]
//
// **A shader that will not compile draws a black window, not an error.** Its
// module is invalid, so every pipeline built from it is invalid, so every
// command buffer that sets one is refused -- and a refused command buffer
// takes the whole frame with it, including the parts that were fine. The
// readout keeps updating over the top, because that is HTML.
//
// The frame rate is what names it from the outside: a configuration that
// presents nothing reports hundreds of frames a second and no `gpu` figure,
// because the frame ends at the swap chain. From the inside it is plainer
// still -- the browser writes the WGSL error, with a line and a column, to
// its own log, which nothing in this repository was reading.
//
// Nothing in the unit tests exercises the WGSL at all: the recording device
// takes any string as a shader and never looks at it. So this is the check,
// and it has to run a real browser to be one.
//
// Every switch that guards a pipeline is turned **on**, because a pipeline
// nobody built is a pipeline nobody checked. Requires `npm run dev`.
import { spawn } from "node:child_process";
import { globSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
	const at = args.indexOf(name);
	return at < 0 ? fallback : args[at + 1];
};
const port = Number(flag("--port", "9291"));
const waitMs = Number(flag("--wait", "30000"));
// **The frame-rate test is a second opinion, and not every page offers one.**
// The world prints a rate and a gpu figure and a page that presents nothing
// gives itself away in both; the landscape bench prints neither, so there the
// browser's own log is the whole of the check -- which is the signal this was
// written for, and the one that names the file, the line and the column.
const presents = flag("--presents", "yes") !== "no";

/**
 * Everything that decides whether a pipeline is built at all.
 *
 * A small world, because this is about what compiles rather than what it
 * looks like, and a small one settles while the check is still running.
 */
const SWITCHES = [
	"seed=chamfer",
	"subdivisionDepth=8",
	"cascadeShadows=true",
	"bloomOn=true",
	"seaDrawn=true",
	"cloudsDrawn=true",
	"atmosphereOn=true",
	"gridMode=false",
].join("&");

const url = flag("--url", `http://localhost:5173/planet.html?${SWITCHES}`);

const chrome =
	globSync("/opt/pw-browsers/chromium*/chrome-linux/chrome")[0] ??
	globSync("/opt/pw-browsers/chromium*/chrome-linux64/chrome")[0];
if (!chrome) throw new Error("no chromium under /opt/pw-browsers");

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

let page;
for (let tries = 0; tries < 80 && !page; tries++) {
	try {
		const list = await (
			await fetch(`http://127.0.0.1:${port}/json/list`)
		).json();
		page = list.find((t) => t.type === "page");
	} catch {
		// The debugging port takes a moment to answer.
	}
	if (!page) await sleep(250);
}
if (!page) throw new Error("chromium never opened its debugging port");

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let id = 0;
const pending = new Map();
const complaints = [];
ws.onmessage = (event) => {
	const message = JSON.parse(event.data);
	// **The browser's own log, not the console.** A WGSL error is written by
	// the GPU implementation rather than by any script, so nothing reaches
	// `console.error` and a harness watching only `Runtime.consoleAPICalled`
	// sees a clean run.
	if (message.method === "Log.entryAdded") {
		const entry = message.params.entry;
		if (entry.level === "error" || entry.level === "warning")
			complaints.push(entry.text);
	}
	if (message.method === "Runtime.exceptionThrown")
		complaints.push(
			message.params.exceptionDetails.exception?.description ??
				message.params.exceptionDetails.text,
		);
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

await send("Log.enable");
await send("Runtime.enable");
await send("Page.enable");
await send("Page.navigate", { url });
await sleep(waitMs);

const readout = (
	await send("Runtime.evaluate", {
		expression: "document.querySelector('#status')?.innerText ?? ''",
		returnByValue: true,
	})
).result?.value;

ws.close();
browser.kill();

// A frame that presents nothing runs absurdly fast and reports no GPU time,
// because it ends at the swap chain. That is the same failure seen from the
// outside, and it catches a refusal this log somehow missed.
const rate = /(\d+) fps/.exec(readout ?? "");
const drawing = /gpu \d/.test(readout ?? "");
const wrong = complaints.filter(
	(text) => !/experimental|Failed to load resource|favicon/i.test(text),
);

if (wrong.length > 0) {
	console.log(`${wrong.length} complaint(s) from the browser:\n`);
	for (const text of wrong) console.log(`${text}\n`);
}
if (presents && !drawing)
	console.log(
		`the frame presented nothing: ${rate ? `${rate[1]} fps` : "no rate"},` +
			` no gpu figure`,
	);
const ok = wrong.length === 0 && (drawing || !presents);
if (ok) {
	console.log(
		presents
			? `every shader compiled, and the frame presents.`
			: `every shader compiled -- the browser had nothing to say.`,
	);
	const said = (readout ?? "").split("\n").slice(0, 2).join(" | ");
	if (said.trim()) console.log(`   ${said}`);
}
process.exit(ok ? 0 : 1);
