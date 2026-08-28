import type { BenchSheet } from "./BenchMessage.js";
import type {
	CaveCells,
	CaveFacts,
	CavePlanSheet,
	CaveReply,
} from "./CaveMessage.js";
import type { PatchLook } from "chamfer/render";
import type { PlanetKnobs } from "./PlanetSettings.js";
import { GROUND_LINES, TERRAIN_DEFAULTS } from "chamfer/generation";
import {
	PATCH_FILL_SHARE,
	PATCH_KEY_SHARE,
	PATCH_TOP_SHARE,
	PatchRenderer,
	createGpuContext,
	resizeToDisplay,
} from "chamfer/render";
import { Mat4, Vec3 } from "chamfer/math";
import { ParameterPanel } from "./ParameterPanel.js";
import { PlanetSettings } from "./PlanetSettings.js";
import { BAND_COLORS } from "./paintPatch.js";
import { SEA_COLORS } from "chamfer/render";
import { drawCavePlan } from "./drawCavePlan.js";
import { outlinePatch } from "./outlinePatch.js";
import { paintSheet } from "./paintSheet.js";

/**
 * The cave bench: one patch of a planet, opened up, and the rule that hollowed
 * it.
 *
 * **Its own page, because a cave is judged from inside it.** The landscape
 * bench draws a surface seen from outside; here the thing being looked at is a
 * hole, so the patch is a block of ground with a corner taken off and the view
 * goes into it -- and **Draw · the caves** turns the world inside out and draws
 * the void as the solid, which is the only view that shows the shape of a
 * network from outside it.
 *
 * **The plan is on the right, over the knobs that decide it.** A sheet has no
 * plan of its own -- the zero set of a field in space is a set of surfaces, so
 * what it carves six metres down is a different picture from what it carves
 * twenty metres down -- so the picture is one named slice, and it sits fixed
 * above the rows while they scroll.
 *
 * **Nothing here walks a column.** The map, the volume, the measurements and
 * the mesh are all the worker's; this file holds the knobs, the canvas, the
 * camera and the plan, and paints what arrives.
 */

const canvas = document.getElementById("viewport") as HTMLCanvasElement;

/**
 * The knobs that decide what is drawn rather than what is there.
 *
 * A change to one of these is a repaint of the plan, a uniform on the patch, or
 * both -- all on this thread and in this frame. Everything else moves a block,
 * a mesh or a slice of the field, and goes to the worker.
 */
const VIEW_KNOBS: ReadonlySet<string> = new Set([
	"patchPicture",
	"patchSurface",
	"patchLight",
	"patchMap",
	"patchAlong",
	"showLights",
	"keyShadow",
	"fillShadow",
	"keyLight",
	"fillLight",
	"topLight",
	"shadowStrength",
	"cavePlan",
	"caveLattice",
]);

/**
 * What this page opens on, where that is not what the planet opens on.
 *
 * **A bench of the cave rule opens on a world with caves in it**, or its first
 * act is finding the switch. The other three follow from what a cave is:
 *
 * - **The patch is drawn at the block grid**, five levels under a 32 m map,
 *   because a passage is measured in cells and a cell here has to be a block.
 *   At eight metres a column the shipped 24 m passage is three cells across and
 *   every count about width says the same thing.
 * - **A few map cells across, not thirty.** The lab this bench is a bench of
 *   measured a patch `95 m` on a side; four map cells at one metre a column is
 *   `128 m`, at the same column count the landscape bench opens with.
 * - **A place where the ceiling comes down.** A mouth is where the ground
 *   allows one *and* the sheet happens to be there, and at the shipped rarity
 *   the first of those is `0.170%` of the planet -- so most places have no way
 *   into their own caves and a bench that opened on one would look broken. This
 *   is a place on the default seed where it does.
 *
 * **The cliffs layer is left on.** It takes blocks out of a column too, and
 * some overlap between the two is the point rather than a confusion: they cut
 * one planet, and the cliffs layer's density gains a full `1` over its own
 * reach so it has stopped altogether well above where a cave runs. What each of
 * them took is counted apart, so no number on the readout is a number about two
 * layers.
 *
 * A link that names any of them wins, and one written from here carries all
 * five -- so a world handed over is the world that was looked at.
 */
const OPENS_ON: Partial<Record<keyof PlanetKnobs, string>> = {
	caves: "true",
	patchCells: "4",
	patchDetail: "5",
	patchLatitude: "47",
	patchLongitude: "-41",
};

const params = new URLSearchParams(location.search);
for (const [key, value] of Object.entries(OPENS_ON))
	if (!params.has(key)) params.set(key, value);
let settings = PlanetSettings.fromParams(params);

/** Which number the shader's picture branch takes. */
const PICTURE_INDEX: Record<string, number> = {
	ground: 0,
	height: 1,
	raw: 2,
	continent: 3,
	erosion: 3,
	peaks: 3,
	carve: 3,
};

// ---------------------------------------------------------------------------
// The panel: the caves on the right under their own plan, the world on the left.
// ---------------------------------------------------------------------------

const panel = new ParameterPanel(
	settings,
	(draft) => moved(draft),
	(draft) => moved(draft),
	() => {},
	{ bench: true, page: "cave" },
);

const head = document.createElement("div");
head.className = "bench-head cave-head";

const back = document.createElement("a");
back.className = "bench-back";
back.textContent = "← The planet";
head.appendChild(back);

const title = document.createElement("h1");
title.className = "cave-title";
title.textContent = "Cave bench";
head.appendChild(title);

const sub = document.createElement("p");
sub.className = "cave-sub";
sub.innerHTML =
	"The engine's own cave carve on a patch of hexagon columns: a band around " +
	"zero of a field in space, which is a <b>sheet</b>, with a ceiling that " +
	"dips so it has a way to the surface.";
head.appendChild(sub);

const planCanvas = document.createElement("canvas");
planCanvas.className = "cave-plan";
planCanvas.width = 600;
planCanvas.height = 600;
head.appendChild(planCanvas);
const scratch = document.createElement("canvas");

const planSays = document.createElement("p");
planSays.className = "cave-plan-says";
planSays.textContent = "—";
head.appendChild(planSays);

const facts = document.createElement("div");
facts.className = "bench-facts cave-facts";
head.appendChild(facts);

panel.mount(head, "right");

// ---------------------------------------------------------------------------
// The small map, on the left: where this patch is standing, and what else there
// is to stand on.
// ---------------------------------------------------------------------------

// **Both benches are benches of one world, so the way to somewhere else is the
// same on both.** A latitude and a longitude are a place and two sliders are
// not: finding a range by dragging them is a search with the answer already on
// screen, so the answer is what you click.
const left = document.createElement("div");
left.className = "bench-head";

const mapCanvas = document.createElement("canvas");
mapCanvas.className = "bench-map";
left.appendChild(mapCanvas);
const mapContext = mapCanvas.getContext("2d")!;

/** One linear colour part of the way to another. */
function mixed(
	from: readonly number[],
	to: readonly number[],
	by: number,
): number[] {
	return [0, 1, 2].map((ch) => from[ch]! + (to[ch]! - from[ch]!) * by);
}

/** A linear colour as the hex a stylesheet takes, through the screen's curve. */
function screenColor(color: readonly number[]): string {
	const byte = (v: number): string =>
		Math.round(255 * Math.pow(Math.max(0, Math.min(1, v)), 1 / 2.2))
			.toString(16)
			.padStart(2, "0");
	return `#${byte(color[0]!)}${byte(color[1]!)}${byte(color[2]!)}`;
}

const legend = document.createElement("div");
legend.className = "bench-legend";
// **The swatches are the colours the pictures paint with**, taken from the same
// list rather than typed as hex beside them.
legend.innerHTML = [
	[mixed(BAND_COLORS[0]!, SEA_COLORS.deep, 0.85), "sea over sand"],
	[BAND_COLORS[1]!, "grass"],
	[BAND_COLORS[2]!, "rock"],
	[BAND_COLORS[3]!, "snow"],
]
	.map(
		([color, name]) =>
			`<span style="background:${screenColor(color as number[])}">${name}</span>`,
	)
	.join("");
left.appendChild(legend);

// **What the world came out as, under the map it came out on.** The rows that
// decide the caves are on the right under the plan they draw; what the world
// itself is stays on the left, so reading an answer never means scrolling past
// a question.
const world = document.createElement("div");
world.className = "bench-facts";
left.appendChild(world);

panel.mount(left, "left");

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

const note = document.createElement("p");
note.className = "cave-note";
note.textContent =
	"Cut across and Cut along take the far corner off the block so the " +
	"passages can be looked into. Draw · the caves turns the world inside out " +
	"and draws the void as the solid, which is the only view that shows a " +
	"network from outside it.";
panel.footer(note);

/**
 * Everything the bench is holding, as the query string the planet takes.
 *
 * Nothing is dropped, including the rows that only move the bench: where the
 * patch was standing, how much of it was cut away and which picture was on it
 * are work too, and the way back here is through the planet's own link.
 */
function planetParams(): string {
	const out = settings.toParams();
	out.set("panel", "1");
	return out.toString();
}
back.href = `./planet.html?${planetParams()}`;

// ---------------------------------------------------------------------------
// The worker, and the one rule for talking to it.
// ---------------------------------------------------------------------------

const worker = new Worker(new URL("./caveWorker.ts", import.meta.url), {
	type: "module",
});

let token = 0;
let busy = false;
let pending = false;
let says = "";
let asked = "";
let facts0: CaveFacts | null = null;
let renderer: PatchRenderer | null = null;
let span = 1;
let plan: CavePlanSheet | null = null;
let cells: CaveCells | null = null;

/** The last sheet of samples for each picture, which every repaint is drawn from. */
let patchSheet: BenchSheet | null = null;
let planetSheet: BenchSheet | null = null;

/**
 * The middle of the block the mesh actually fills, in its own frame.
 *
 * **A patch is drawn in metres above sea level, and a cave patch is small.**
 * The landscape bench looks at the origin and gets away with it because its
 * span is a kilometre and the ground is somewhere inside that; here the span is
 * a hundred metres and ground two hundred metres up is a hundred metres off
 * screen -- an empty window, on a page whose whole subject is what is inside
 * the block. The mesh reports the box it fills, so the camera is aimed at the
 * middle of that.
 */
let middle: [number, number, number] = [0, 0, 0];

const look = {
	picture: 0,
	surface: "solid" as PatchLook["surface"],
	layer: "continent" as PatchLook["layer"],
	rockLine: GROUND_LINES.rock,
	snowLine: GROUND_LINES.snow,
	soilMetres: 0,
	blockMetres: 1,
	shadeDepth: 1,
	shadeAmount: 0,
	rawLow: -1,
	rawHigh: 1,
	low: 0,
	high: 1,
	showLights: false,
	span: 1,
	light: 1,
	keyShadow: true,
	fillShadow: false,
	keyLight: PATCH_KEY_SHARE,
	fillLight: PATCH_FILL_SHARE,
	topLight: PATCH_TOP_SHARE,
	shadowStrength: 1,
	debugShadow: false,
	eye: [0, 1, 1] as [number, number, number],
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
 * across its range fires on every step and a walk of every block in the patch
 * is most of a second, so acting on each one queues them faster than any of
 * them finishes. A change during a build is remembered rather than queued, and
 * the build that lands starts it.
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
 * A curve is an array, and the panel drags the same array the last request was
 * read from -- so comparing knob against knob says a dragged curve did not
 * move and the ground stops following the pointer. Written out by value
 * instead.
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

worker.onmessage = (event: MessageEvent<CaveReply>) => {
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
	span = Math.max(1, reply.facts.span);
	if (reply.plan) plan = reply.plan;
	if (reply.cells) cells = reply.cells;
	if (reply.patch) patchSheet = reply.patch;
	if (reply.planet) planetSheet = reply.planet;
	if (reply.geometry && renderer) {
		renderer.upload({
			vertices: reply.geometry.vertices,
			indices: null,
			lines: reply.geometry.lines,
			triangleCount: reply.geometry.triangleCount,
			groundVertices: reply.geometry.groundVertices,
			waterVertices: reply.geometry.waterVertices,
			bounds: reply.geometry.bounds,
		});
		look.rawLow = reply.geometry.rawLow;
		look.rawHigh = reply.geometry.rawHigh;
		look.low = reply.facts.lowest;
		look.high = reply.facts.highest;
		const box = reply.geometry.bounds;
		middle = [
			(box.low[0] + box.high[0]) / 2,
			// **A third of the way down rather than the middle**: the caves are
			// nearer the top of the crust and the bottom is rock nobody is
			// looking at.
			box.high[1] - (box.high[1] - box.low[1]) / 3,
			(box.low[2] + box.high[2]) / 2,
		];
	}
	says = "";
	busy = false;
	// **The land share is a measurement, not a knob.** The coast is where the
	// continentalness curve crosses its own middle, so only a finished map says
	// how much land there is.
	panel.note(
		"seaLevel",
		`${(reply.facts.land * 100).toFixed(1)}% of the planet is land`,
	);
	panel.note(
		"patchDetail",
		`a column is ${reply.facts.columnMetres.toFixed(1)} m — ` +
			`${reply.facts.cellsDrawn.toLocaleString("en-US")} in the patch`,
	);
	// **A crust in metres is a count of blocks**, and the count is what a walk
	// costs: one field reading a block, once a column.
	panel.note(
		"caveCrust",
		`${Math.round(reply.facts.crust / settings.knobs.blockSize)} layers`,
	);
	show();
	if (pending) ask();
};

/** Draw everything this thread owns, from what the last build handed over. */
function show(): void {
	paintMap();
	paintPlan();
	say();
	render();
}

/**
 * The small map: whichever sheet is asked for, in whichever picture.
 *
 * **The carve is always the patch, whatever the map is showing.** Its shapes
 * are 120 m and the planet picture is 512 points around a 42,730 m
 * circumference, so a shape is not two points across and neighbouring points
 * are unrelated -- an honest sampling of the field and a picture of nothing.
 */
function paintMap(): void {
	const shown =
		settings.knobs.patchMap === "planet" ? planetSheet : patchSheet;
	const sheet = settings.knobs.patchPicture === "carve" ? patchSheet : shown;
	if (!sheet) return;
	if (mapCanvas.width !== sheet.width || mapCanvas.height !== sheet.height) {
		mapCanvas.width = sheet.width;
		mapCanvas.height = sheet.height;
	}
	const image = mapContext.createImageData(sheet.width, sheet.height);
	paintSheet(sheet, settings.knobs.patchPicture, image.data);
	// Where the patch is standing, on the picture of the whole world -- so a
	// click has something to aim at and a walk has somewhere to have gone.
	if (sheet === planetSheet && facts0)
		outlinePatch(image.data, sheet.width, sheet.height, {
			latitude: settings.knobs.patchLatitude,
			longitude: settings.knobs.patchLongitude,
			span: facts0.span,
			radius: settings.radius,
		});
	mapContext.putImageData(image, 0, 0);
}

/** The plan above the knobs, in whichever picture is asked for. */
function paintPlan(): void {
	if (!plan || !cells) return;
	const said = drawCavePlan(
		planCanvas,
		scratch,
		plan,
		cells,
		settings.knobs.cavePlan,
		settings.knobs.caveLattice,
		settings.knobs.caveThreshold,
	);
	planSays.textContent =
		`${Math.round(said.across).toLocaleString("en-US")} m across · ` +
		`one slice, ${settings.knobs.caveSlice} m down` +
		` · ${said.segments.toLocaleString("en-US")} square segments` +
		(settings.knobs.caveLattice
			? ` · ${said.latticeSegments.toLocaleString("en-US")} lattice segments`
			: "");
}

/** A part of a whole as a percentage, the way the readout writes one. */
function percent(part: number, whole: number): string {
	return whole ? `${((100 * part) / whole).toFixed(1)}%` : "0%";
}

/**
 * The readout: what the caves came to, and what the world under them is.
 *
 * **A cave you cannot walk down is a texture, not a cave**, so the lines are
 * about reach -- how much of the patch a passage touches, how many separate
 * systems it breaks into, how wide the narrowest way through one is -- and the
 * last of them is what any of it cost.
 */
function say(): void {
	const f = facts0;
	const line = (text: string, warn = false): string =>
		`<p${warn ? ' class="bench-warm"' : ""}>${text}</p>`;
	const count = (v: number): string => v.toLocaleString("en-US");

	facts.innerHTML =
		(says ? line(`<span class="bench-busy">${says}</span>`) : "") +
		(f
			? line(
					`<b>${count(Math.round(f.span))} m</b> of ground, ` +
						`<b>${count(Math.round(f.crust))} m</b> of crust, ` +
						`${count(f.cellsDrawn)} columns of ` +
						`<b>${f.columnMetres.toFixed(1)} m</b>`,
				) +
				line(
					`passage in <b>${percent(f.caveColumns, f.cellsDrawn)}</b> of ` +
						`columns · ${count(f.caveCells)} cave blocks`,
				) +
				line(
					`narrowest way through, median <b>${f.medianWidth} ` +
						`cell${f.medianWidth === 1 ? "" : "s"}</b> · ` +
						`${percent(Math.round(f.thinShare * f.caveColumns), f.caveColumns)} ` +
						`of it one cell`,
					f.medianWidth < 2,
				) +
				line(
					`separate systems <b>${count(f.systems)}</b> · largest holds ` +
						`<b>${percent(f.largest, f.caveCells)}</b> · half the void ` +
						`is in the biggest <b>${count(f.half)}</b>`,
				) +
				line(
					`mouths at the surface <b>${count(f.mouths)}</b> · columns with ` +
						`more than one span <b>${percent(f.multiSpan, f.cellsDrawn)}</b>`,
					f.mouths === 0,
				) +
				line(
					`faces per column <b>${(f.faces / Math.max(1, f.cellsDrawn)).toFixed(1)}</b> ` +
						`against <b>${(f.facesBare / Math.max(1, f.cellsDrawn)).toFixed(1)}</b> ` +
						`with no caves — <b>×${(f.faces / Math.max(1, f.facesBare)).toFixed(2)}</b>`,
				) +
				line(
					`${count(Math.round(f.triangles))} triangles · ` +
						`<b>${f.lookups.toFixed(1)}</b> lattice lookups a column · ` +
						`map ${f.mapMs.toFixed(0)} ms · walk ${f.walkMs.toFixed(0)} ms · ` +
						`mesh ${f.meshMs.toFixed(0)} ms`,
				)
			: "");

	// The world under the caves, on the other side of the window.
	const metres = (v: number): string =>
		`${Math.round(v).toLocaleString("en-US")} m`;
	world.innerHTML = f
		? line(
				`radius <b>${metres(settings.radius)}</b> · depth ` +
					`<b>${settings.depth}</b> · block <b>${settings.knobs.blockSize} m</b>`,
			) +
			line(
				`map cell <b>${settings.coarseCell.toFixed(0)} m</b> at level ` +
					`<b>${settings.coarseLevel}</b> · ${count(f.cells)} cells`,
			) +
			line(
				`ground <b>${metres(f.lowest)}</b> to <b>${metres(f.highest)}</b>` +
					(f.whole ? " — the whole planet" : ""),
			) +
			line(
				`tallest ground <b>${metres(f.summit)}</b> over the water · ` +
					`deepest <b>${metres(-f.floor)}</b> under it`,
			) +
			line(
				`<b>${(f.bands[0]! * 100).toFixed(0)}%</b> sea · ` +
					`<b>${(f.bands[1]! * 100).toFixed(0)}%</b> grass · ` +
					`<b>${(f.bands[2]! * 100).toFixed(0)}%</b> rock · ` +
					`<b>${(f.bands[3]! * 100).toFixed(0)}%</b> snow`,
			)
		: "";
}

// ---------------------------------------------------------------------------
// The volume, which is the point of the bench.
// ---------------------------------------------------------------------------

// **Into the cut, not down onto the ground.** The corner comes off the far side
// of the block, so the eye starts round from it and low enough to see the faces
// the cut opened.
const camera = { yaw: 0.9, pitch: 0.38, distance: 1.25, lift: 0 };

function render(): void {
	if (!renderer) return;
	const k = settings.knobs;
	look.picture = PICTURE_INDEX[k.patchPicture] ?? 0;
	look.surface = k.patchSurface;
	look.layer =
		k.patchPicture === "peaks"
			? "peaks"
			: k.patchPicture === "erosion"
				? "erosion"
				: k.patchPicture === "carve"
					? "carve"
					: "continent";

	// A fifth wider than the patch itself, so the block stands in the window
	// with room round it rather than filling it corner to corner.
	const reach = span * 1.2 * camera.distance;
	const eye = new Vec3(
		Math.sin(camera.yaw) * Math.cos(camera.pitch) * reach,
		Math.sin(camera.pitch) * reach + span * camera.lift,
		Math.cos(camera.yaw) * Math.cos(camera.pitch) * reach,
	);
	look.showLights = k.showLights;
	look.light = k.patchLight;
	look.keyShadow = k.keyShadow;
	look.fillShadow = k.fillShadow;
	look.keyLight = k.keyLight;
	look.fillLight = k.fillLight;
	look.topLight = k.topLight;
	look.shadowStrength = k.shadowStrength;
	look.span = span;
	// **What a block is made of is a depth question as well as an elevation
	// one**, so the shader is told how deep the soil runs and how thick one
	// block is -- the world's own two lengths, in metres.
	look.soilMetres = TERRAIN_DEFAULTS.soilDepth * k.blockSize;
	look.blockMetres = k.blockSize;
	look.shadeDepth = facts0 ? facts0.crust : 1;
	look.shadeAmount = k.patchDepthShade;
	const from: [number, number, number] = [
		middle[0] + eye.x,
		middle[1] + eye.y,
		middle[2] + eye.z,
	];
	// **How far off the eye is, not where it is.** The renderer sizes its near
	// shadow cascade from the length of this, and a patch two hundred metres
	// above sea level would otherwise report an eye two hundred metres further
	// away than it is and fit the cascade to a box that size.
	look.eye = [eye.x, eye.y, eye.z];
	const view = Mat4.lookAt(from, middle, [0, 1, 0]);
	const proj = Mat4.perspective(
		0.9,
		canvas.width / Math.max(1, canvas.height),
		span * 0.004,
		span * 14,
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
	if (dragging.shift)
		camera.lift = Math.max(-2, Math.min(2, camera.lift + dy * 0.004));
	else {
		camera.yaw -= dx * 0.006;
		// **Below the horizon as well as above it.** A cave is looked into from
		// underneath as often as from over the top, and a pitch floored at zero
		// is a view that can never get under the lid.
		camera.pitch = Math.max(-1.4, Math.min(1.4, camera.pitch + dy * 0.005));
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
