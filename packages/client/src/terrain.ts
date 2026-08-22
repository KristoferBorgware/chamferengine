import type {
	BenchFacts,
	BenchReply,
	BenchSections,
	BenchSheet,
} from "./BenchMessage.js";
import type { PatchLook } from "chamfer/render";
import type { PlanetKnobs } from "./PlanetSettings.js";
import { BenchGraph } from "./BenchGraph.js";
import { GROUND_LINES } from "chamfer/generation";
import { Mat4, Vec3 } from "chamfer/math";
import { PATCH_KNOBS, PlanetSettings } from "./PlanetSettings.js";
import { ParameterPanel } from "./ParameterPanel.js";
import { outlinePatch } from "./outlinePatch.js";
import { paintSheet } from "./paintSheet.js";
import {
	PatchRenderer,
	createGpuContext,
	resizeToDisplay,
} from "chamfer/render";

/**
 * The terrain bench: one patch of a planet, and the knobs that shape it.
 *
 * **Its own page, not a pane over the world.** Choosing terrain numbers is
 * looking at ground, and a world drawn behind the thing being judged is a
 * second picture competing with the first. Nothing here builds a chunk or runs
 * a residency loop: the map is the terrain, so a picture of the map is a
 * picture of the world.
 *
 * **And nothing here builds the map either.** The grid, the noise, the water
 * and the hexagons are all a worker's; this file holds the knobs, the canvas
 * and the camera, and paints what arrives. The patch is drawn cell by cell, one
 * hexagon per map cell, because the lattice is what the world is made of and a
 * square grid of quads is a picture of a different surface.
 *
 * **Every knob is live, and the ones that only choose a picture never leave
 * this thread.** What the worker sends is samples rather than pixels and both
 * control layers rather than one, so a different picture is a repaint and a
 * uniform -- no map, no field, no mesh, and nothing to wait for.
 */

const canvas = document.getElementById("viewport") as HTMLCanvasElement;

/**
 * The knobs that decide what is drawn rather than what is there.
 *
 * A change to one of these is a repaint of the small picture, a uniform on the
 * patch and a redraw of the graph, all on this thread. Everything else -- the
 * world's own rows, and where the patch stands -- goes to the worker.
 */
const VIEW_KNOBS: ReadonlySet<string> = new Set([
	"patchPicture",
	"patchSurface",
	"patchMap",
	"patchAlong",
]);
let settings = PlanetSettings.fromParams(new URLSearchParams(location.search));

/** Which number the shader's picture branch takes. */
const PICTURE_INDEX: Record<string, number> = {
	ground: 0,
	height: 1,
	raw: 2,
	terrain: 3,
	mountain: 3,
	erosion: 0,
};

// ---------------------------------------------------------------------------
// The panel: the world's knobs and the bench's own, with the picture above them
// and the contour graph under them.
// ---------------------------------------------------------------------------

const panel = new ParameterPanel(
	settings,
	(draft) => moved(draft),
	(draft) => moved(draft),
	() => {},
	{ bench: true },
);

const head = document.createElement("div");
head.className = "bench-head";

const back = document.createElement("a");
back.className = "bench-back";
back.textContent = "← The planet";
head.appendChild(back);

const mapCanvas = document.createElement("canvas");
mapCanvas.className = "bench-map";
mapCanvas.style.cursor = "crosshair";
head.appendChild(mapCanvas);
const mapContext = mapCanvas.getContext("2d")!;

const legend = document.createElement("div");
legend.className = "bench-legend";
legend.innerHTML =
	'<span style="background:#2c5f96">sea over sand</span>' +
	'<span style="background:#6b9553">grass</span>' +
	'<span style="background:#a3a3ac">rock</span>' +
	'<span style="background:#f3f6fa">snow</span>';
head.appendChild(legend);

const facts = document.createElement("div");
facts.className = "bench-facts";
head.appendChild(facts);
panel.mount(head);

const profile = document.createElement("details");
profile.className = "bench-profile";
profile.open = true;
const summary = document.createElement("summary");
summary.textContent = "Contour";
profile.appendChild(summary);
const graphCanvas = document.createElement("canvas");
graphCanvas.width = 640;
graphCanvas.height = 300;
profile.appendChild(graphCanvas);
const graphSays = document.createElement("div");
graphSays.className = "bench-says";
profile.appendChild(graphSays);
panel.footer(profile);

const graph = new BenchGraph(graphCanvas, graphSays);

/**
 * Click the planet to stand somewhere on it.
 *
 * **A latitude and a longitude are a place, and two sliders are not.** Finding
 * a range by dragging them is a search with the answer already on screen, so
 * the answer is what you click. The projection is longitude across and latitude
 * down, which inverts to two divisions.
 */
mapCanvas.addEventListener("click", (event) => {
	if (settings.knobs.patchMap !== "planet") return;
	const box = mapCanvas.getBoundingClientRect();
	const across = (event.clientX - box.left) / box.width;
	const down = (event.clientY - box.top) / box.height;
	const range = settings.rangeFor("patchLatitude");
	panel.set({
		patchLatitude: Math.max(
			range.low,
			Math.min(range.high, Math.round((0.5 - down) * 180)),
		),
		patchLongitude: Math.round(across * 360 - 180),
	});
});

/** The world's own parameters, without the ones that only move the bench. */
function planetParams(): string {
	const out = settings.toParams();
	for (const key of PATCH_KNOBS) out.delete(key as string);
	out.set("panel", "1");
	return out.toString();
}
back.href = `./planet.html?${planetParams()}`;

// ---------------------------------------------------------------------------
// The worker, and the one rule for talking to it.
// ---------------------------------------------------------------------------

const worker = new Worker(new URL("./benchWorker.ts", import.meta.url), {
	type: "module",
});

let token = 0;
let busy = false;
let pending = false;
let says = "";

/** What the worker was last asked to build, so a picture is not a request. */
let asked = "";
let facts0: BenchFacts | null = null;
let sections: BenchSections | null = null;
let renderer: PatchRenderer | null = null;
let span = 1;

/** The last sheet of samples for each picture, which every repaint is drawn from. */
let patchSheet: BenchSheet | null = null;
let planetSheet: BenchSheet | null = null;

const look = {
	picture: 0,
	surface: "solid" as PatchLook["surface"],
	layer: "terrain" as PatchLook["layer"],
	rockLine: GROUND_LINES.rock,
	snowLine: GROUND_LINES.snow,
	rawLow: -1,
	rawHigh: 1,
};

/**
 * A knob moved.
 *
 * **A picture is never a build.** Choosing what to look at is a choice made
 * while looking at the last thing, so it happens on this thread and in this
 * frame -- even mid-build, which is when a reader is most likely to be reaching
 * for it.
 *
 * **One build in flight, and the newest values always next.** A slider dragged
 * across its range fires on every step and a map is most of a second, so acting
 * on each one queues them faster than any of them finishes. A change during a
 * build is remembered rather than queued, and the build that lands starts it.
 */
function moved(draft: PlanetSettings): void {
	settings = draft;
	back.href = `./planet.html?${planetParams()}`;
	if (buildKey(draft.knobs) === asked) {
		show();
		return;
	}
	if (busy) {
		pending = true;
		return;
	}
	ask();
}

/**
 * Everything the worker is asked for, as one string.
 *
 * **A curve is an array, and the panel drags the same array the last request
 * was read from.** Two drafts a moment apart hold that one object between them,
 * so comparing knob against knob says a dragged curve did not move and the
 * ground stops following the pointer. Written out by value instead: what the
 * worker was asked for is a string it can be compared against however the
 * panel holds it.
 */
function buildKey(knobs: PlanetKnobs): string {
	const out: Record<string, unknown> = {};
	for (const key of Object.keys(knobs).sort())
		if (!VIEW_KNOBS.has(key))
			out[key] = (knobs as unknown as Record<string, unknown>)[key];
	return JSON.stringify(out);
}

function ask(): void {
	busy = true;
	pending = false;
	says = "";
	asked = buildKey(settings.knobs);
	worker.postMessage({
		kind: "build",
		token: ++token,
		knobs: { ...settings.knobs },
	});
}

worker.onmessage = (event: MessageEvent<BenchReply>) => {
	const reply = event.data;
	if (reply.token !== token) return;
	if (reply.kind === "step") {
		says = `${reply.says} — ${(reply.done * 100).toFixed(0)}%`;
		say();
		return;
	}
	if (reply.kind === "failed") {
		busy = false;
		says = reply.why;
		say();
		return;
	}

	facts0 = reply.facts;
	sections = reply.sections;
	span = Math.max(1, reply.facts.span);
	patchSheet = reply.patch;
	if (reply.planet) planetSheet = reply.planet;
	if (reply.geometry && renderer) {
		renderer.upload({
			vertices: reply.geometry.vertices,
			indices: reply.geometry.indices,
			lines: reply.geometry.lines,
			triangleCount: reply.geometry.triangleCount,
		});
		look.rawLow = reply.geometry.rawLow;
		look.rawHigh = reply.geometry.rawHigh;
	}
	says = "";
	busy = false;
	// **The share the gate is open over is a count, not a number the row
	// holds.** Mountain line is a fraction of the terrain curve's own reach, so
	// the same 0.5 opens the gate over a third of one planet and a fiftieth of
	// another; only a finished map says which.
	panel.note(
		"mountainLine",
		`${(reply.facts.overLine * 100).toFixed(1)}% of the planet is above it`,
	);
	show();
	if (pending) ask();
};

/**
 * Draw everything this thread owns, from what the last build handed over.
 *
 * The small picture, the contour graph, the facts and the patch -- all four
 * from buffers already here, so a knob that only chooses a picture costs one
 * pass over a rectangle of samples and a frame.
 */
function show(): void {
	paint();
	if (sections) graph.draw(sections, settings.knobs.patchAlong);
	say();
	render();
}

/** The small picture: whichever sheet is asked for, in whichever picture. */
function paint(): void {
	const planet = settings.knobs.patchMap === "planet";
	const sheet = planet ? planetSheet : patchSheet;
	if (!sheet) return;
	if (mapCanvas.width !== sheet.width || mapCanvas.height !== sheet.height) {
		mapCanvas.width = sheet.width;
		mapCanvas.height = sheet.height;
	}
	const image = mapContext.createImageData(sheet.width, sheet.height);
	paintSheet(sheet, settings.knobs.patchPicture, image.data);
	if (planet && facts0)
		outlinePatch(image.data, sheet.width, sheet.height, {
			latitude: settings.knobs.patchLatitude,
			longitude: settings.knobs.patchLongitude,
			span: facts0.span,
			radius: settings.radius,
		});
	mapContext.putImageData(image, 0, 0);
}

/** The lines under the picture: what this world is, and what the build is doing. */
function say(): void {
	const k = settings.knobs;
	const f = facts0;
	const report = f?.report ?? null;
	facts.innerHTML =
		`radius <b>${Math.round(settings.radius).toLocaleString("en-US")} m</b> · ` +
		`map level <b>${settings.coarseLevel}</b> · ` +
		`cell <b>${settings.coarseCell.toFixed(1)} m</b><br>` +
		(f
			? `patch <b>${Math.round(f.span).toLocaleString("en-US")} m</b> across, ` +
				`<b>${f.cellsDrawn.toLocaleString("en-US")}</b> cells drawn<br>` +
				`ground <b>${Math.round(f.lowest)}</b> to ` +
				`<b>${Math.round(f.highest)} m</b> · ` +
				`land here <b>${Math.round(f.landShare * 100)}%</b><br>`
			: "") +
		(says
			? `<span class="bench-busy">${says}</span>`
			: f
				? `map of <b>${f.cells.toLocaleString("en-US")}</b> cells in ` +
					`<b>${(f.ms / 1000).toFixed(1)} s</b>`
				: "") +
		// **The whole planet, not this patch.** The material lines are absolute
		// metres and a patch is a place, so a patch can be all snow on a world
		// that is mostly grass. This is the number to tune Relief against.
		(f
			? `<br>planet: <b>${(f.bands[0]! * 100).toFixed(0)}%</b> sea · ` +
				`<b>${(f.bands[1]! * 100).toFixed(0)}%</b> grass · ` +
				`<b>${(f.bands[2]! * 100).toFixed(0)}%</b> rock · ` +
				`<b>${(f.bands[3]! * 100).toFixed(0)}%</b> snow`
			: "") +
		// **True scale, always.** A patch drawn taller than the world builds it
		// is a picture of a planet nobody can walk on, and the number it was
		// there to make visible is this one.
		(f
			? `<br>true scale · relief is <b>${(
					(100 * (f.highest - f.lowest)) /
					Math.max(1, f.span)
				).toFixed(1)}%</b> of the patch`
			: "") +
		(k.seaLevel < 0 && f
			? `<br>sea drained <b>${(-k.seaLevel).toLocaleString("en-US")} m</b> — ` +
				`the tallest point is <b>${Math.round(f.summit).toLocaleString("en-US")} m</b> ` +
				"above the water"
			: "") +
		(report
			? `<br>erosion moved <b>${report.moved.toFixed(2)} m</b> a cell, ` +
				`deepest cut <b>${Math.round(report.deepest)} m</b><br>` +
				`slope median <b>${report.before.median.toFixed(3)}</b> → ` +
				`<b>${report.after.median.toFixed(3)}</b> ` +
				`(x${(report.after.median / Math.max(1e-9, report.before.median)).toFixed(2)}) · ` +
				`99th <b>${report.before.ninetyNine.toFixed(3)}</b> → ` +
				`<b>${report.after.ninetyNine.toFixed(3)}</b><br>` +
				`${report.droplets.toLocaleString("en-US")} droplets in ` +
				`<b>${(report.ms / 1000).toFixed(1)} s</b>` +
				(k.patchPicture === "erosion"
					? ` · picture saturates at <b>${report.scale.toFixed(1)} m</b>`
					: "")
			: "");
}

// ---------------------------------------------------------------------------
// The plane, which is the point of the bench.
// ---------------------------------------------------------------------------

const camera = { yaw: -0.7, pitch: 0.62, distance: 1.6, lift: 0 };

function render(): void {
	if (!renderer) return;
	const k = settings.knobs;
	look.picture = PICTURE_INDEX[k.patchPicture] ?? 0;
	look.surface = k.patchSurface;
	look.layer = k.patchPicture === "mountain" ? "mountain" : "terrain";

	const reach = span * camera.distance;
	const eye = new Vec3(
		Math.sin(camera.yaw) * Math.cos(camera.pitch) * reach,
		Math.sin(camera.pitch) * reach + span * camera.lift,
		Math.cos(camera.yaw) * Math.cos(camera.pitch) * reach,
	);
	const view = Mat4.lookAt([eye.x, eye.y, eye.z], [0, 0, 0], [0, 1, 0]);
	const proj = Mat4.perspective(
		0.9,
		canvas.width / Math.max(1, canvas.height),
		span * 0.005,
		span * 12,
	);
	renderer.draw(proj.multiply(view).elements, look);
}

// ---- turning and zooming ----
let dragging: { x: number; y: number; shift: boolean } | null = null;
canvas.addEventListener("pointerdown", (e) => {
	dragging = { x: e.clientX, y: e.clientY, shift: e.shiftKey };
	canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
	if (!dragging) return;
	const dx = e.clientX - dragging.x;
	const dy = e.clientY - dragging.y;
	dragging.x = e.clientX;
	dragging.y = e.clientY;
	if (dragging.shift) camera.lift += dy * 0.002;
	else {
		camera.yaw -= dx * 0.006;
		camera.pitch = Math.max(0.03, Math.min(1.5, camera.pitch + dy * 0.005));
	}
	render();
});
const stop = (): void => {
	dragging = null;
};
canvas.addEventListener("pointerup", stop);
canvas.addEventListener("pointercancel", stop);
canvas.addEventListener(
	"wheel",
	(e) => {
		e.preventDefault();
		camera.distance = Math.max(
			0.15,
			Math.min(6, camera.distance * Math.exp(e.deltaY * 0.001)),
		);
		render();
	},
	{ passive: false },
);

async function main(): Promise<void> {
	const ctx = await createGpuContext(canvas);
	renderer = new PatchRenderer(ctx);
	window.addEventListener("resize", () => {
		resizeToDisplay(ctx);
		render();
	});
	resizeToDisplay(ctx);
	ask();
}

say();
void main();
