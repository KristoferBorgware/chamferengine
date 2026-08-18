#!/usr/bin/env node
// Take a frame of the client, from this container, on a software adapter.
//
//   node tools/take-frame.mjs <url> <out.png> [--wait ms] [--read selector]
//
// Chromium is launched with the four flags that make it present, driven over
// the DevTools protocol, and asked for a screenshot once the world has stopped
// building. Nothing here says anything about how fast a frame is: the adapter
// is a software rasteriser, so a frame settles what is drawn and never its
// cost.
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { globSync } from "node:fs";

const args = process.argv.slice(2);
const url = args[0] ?? "http://localhost:5173/planet.html";
const out = args[1] ?? "frame.png";
const flag = (name, fallback) => {
	const at = args.indexOf(name);
	return at < 0 ? fallback : args[at + 1];
};
const settleMs = Number(flag("--wait", "45000"));
const read = flag("--read", "#status");
const port = Number(flag("--port", "9222"));

const chrome =
	globSync("/opt/pw-browsers/chromium*/chrome-linux/chrome")[0] ??
	globSync("/opt/pw-browsers/chromium*/chrome-linux64/chrome")[0];
if (!chrome) throw new Error("no chromium under /opt/pw-browsers");

// All four are needed. Dropping any one of the three WebGPU flags leaves a page
// that loads and updates its readout over a canvas with no picture in it.
const browser = spawn(chrome, [
	"--headless=new",
	"--no-sandbox",
	"--enable-unsafe-webgpu",
	"--enable-features=Vulkan",
	"--use-angle=swiftshader",
	"--use-vulkan=swiftshader",
	`--remote-debugging-port=${port}`,
	"--window-size=1280,800",
	"about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The debugging port takes a moment to answer. */
async function pageTarget() {
	for (let tries = 0; tries < 60; tries++) {
		try {
			const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
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
const logs = [];
ws.onmessage = (event) => {
	const message = JSON.parse(event.data);
	if (message.method === "Runtime.consoleAPICalled")
		logs.push(message.params.args.map((a) => a.value ?? a.description ?? "").join(" "));
	if (message.method === "Runtime.exceptionThrown")
		logs.push(`EXCEPTION ${message.params.exceptionDetails.text} ${message.params.exceptionDetails.exception?.description ?? ""}`);
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

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
	width: 1280, height: 800, deviceScaleFactor: 1, mobile: false,
});
await send("Page.navigate", { url });

const text = async (selector) =>
	(await send("Runtime.evaluate", {
		expression: `document.querySelector(${JSON.stringify(selector)})?.innerText ?? ''`,
		returnByValue: true,
	})).result?.value ?? "";

// Wait for the readout to stop saying it is still building, rather than for a
// timer. A frame taken early is a frame of a half-built world.
const until = Date.now() + settleMs;
let last = "";
while (Date.now() < until) {
	await sleep(1500);
	last = await text(read);
	if (last && !/building/.test(last) && Date.now() > until - settleMs + 8000) break;
}

const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(out, Buffer.from(shot.data, "base64"));
console.log(`${out}`);
if (last) console.log(last.split("\n").map((l) => `   ${l}`).join("\n"));
for (const line of logs.slice(0, 20)) console.log(`   log: ${line}`);
ws.close();
browser.kill();
