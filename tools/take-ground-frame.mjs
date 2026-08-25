#!/usr/bin/env node
// Take a frame from EYE LEVEL rather than from the opening fly-cam.
//
//   node tools/take-ground-frame.mjs <url> <out.png> [--wait ms] [--pitch n]
//
// The world opens with the camera a kilometre up, which is the wrong place to
// judge a sky from: the air is a couple of kilometres deep, so the opening
// view is most of the way out of it. This presses E for eye level, lets the
// ground settle, and can tilt the view up toward the horizon before shooting.
import { spawn } from "node:child_process";
import { writeFileSync, globSync } from "node:fs";

const args = process.argv.slice(2);
const url = args[0] ?? "http://localhost:5173/planet.html";
const out = args[1] ?? "frame.png";
const flag = (name, fallback) => {
	const at = args.indexOf(name);
	return at < 0 ? fallback : args[at + 1];
};
const settleMs = Number(flag("--wait", "45000"));
const port = Number(flag("--port", "9224"));

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

async function pageTarget() {
	for (let attempt = 0; attempt < 60; attempt++) {
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
const logs = [];
ws.onmessage = (event) => {
	const message = JSON.parse(event.data);
	if (message.method === "Runtime.exceptionThrown")
		logs.push(`EXCEPTION ${message.params.exceptionDetails.text}`);
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
	width: 1280,
	height: 800,
	deviceScaleFactor: 1,
	mobile: false,
});
await send("Page.navigate", { url });

const text = async (selector) =>
	(
		await send("Runtime.evaluate", {
			expression: `document.querySelector(${JSON.stringify(selector)})?.innerText ?? ''`,
			returnByValue: true,
		})
	).result?.value ?? "";

// Wait for the world to stop building before standing on it.
const until = Date.now() + settleMs;
let last = "";
while (Date.now() < until) {
	await sleep(1500);
	last = await text("#status");
	if (last && !/building/.test(last) && Date.now() > until - settleMs + 8000)
		break;
}

// E drops the camera to eye level, where the sky is actually looked at.
const key = (type, k, code, vk) =>
	send("Input.dispatchKeyEvent", {
		type,
		key: k,
		code,
		windowsVirtualKeyCode: vk,
	});
await key("keyDown", "e", "KeyE", 69);
await sleep(80);
await key("keyUp", "e", "KeyE", 69);
await sleep(2500);

// Tilt toward the horizon: the sky is above the crosshair, and the opening
// view looks down at the ground.
const pitch = Number(flag("--pitch", "-220"));
const yaw = Number(flag("--yaw", "0"));
if (pitch !== 0 || yaw !== 0) {
	await send("Input.dispatchMouseEvent", {
		type: "mousePressed",
		x: 640,
		y: 400,
		button: "left",
		clickCount: 1,
	});
	await send("Input.dispatchMouseEvent", {
		type: "mouseReleased",
		x: 640,
		y: 400,
		button: "left",
		clickCount: 1,
	});
	await sleep(400);
	await send("Input.dispatchMouseEvent", {
		type: "mouseMoved",
		x: 640 + yaw,
		y: 400 + pitch,
		button: "none",
	});
	await sleep(1200);
}
await sleep(3000);

last = await text("#status");
const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(out, Buffer.from(shot.data, "base64"));
console.log(`${out}`);
if (last)
	console.log(
		last
			.split("\n")
			.map((l) => `   ${l}`)
			.join("\n"),
	);
for (const line of logs.slice(0, 10)) console.log(`   log: ${line}`);
ws.close();
browser.kill();
