import type {
	BenchFacts,
	BenchReply,
	BenchSections,
	BenchSheet,
} from "./BenchMessage.js";
import type { PatchLook } from "chamfer/render";
import type { LayerName, PlanetKnobs } from "./PlanetSettings.js";
import { BenchGraph } from "./BenchGraph.js";
import { BAND_COLORS } from "./paintPatch.js";
import { GROUND_LINES, TERRAIN_DEFAULTS } from "chamfer/generation";
import { columnDepth } from "chamfer/mesh";
import {
	PATCH_FILL_SHARE,
	PATCH_KEY_SHARE,
	PATCH_TOP_SHARE,
	SEA_COLORS,
} from "chamfer/render";
import { Mat4, Vec3 } from "chamfer/math";
import { LAYER_NAMES, LAYER_TITLES, PlanetSettings } from "./PlanetSettings.js";
import { PLAYER_DEFAULTS } from "chamfer/player";
import { ParameterPanel } from "./ParameterPanel.js";
import { outlinePatch } from "./outlinePatch.js";
import type { PatchPicture } from "./PatchLook.js";
import { LAYER_PICTURES } from "./PatchLook.js";
import { paintSheet } from "./paintSheet.js";
import {
	PatchRenderer,
	createGpuContext,
	resizeToDisplay,
} from "chamfer/render";

/**
 * The landscape bench: one patch of a planet, and the four layers that shape it.
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
// **The swatches are the colours the pictures paint with**, taken from the same
// list rather than typed as hex beside them: a legend whose green is a shade
// off the ground's green is a legend that has to be ignored.
legend.innerHTML = [
	// Water over its floor, at the depth the picture calls deep.
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
head.appendChild(legend);

panel.mount(head);

// **What the world came out as, on the other side of the window.** The knobs
// that decide the ground are on the right and what they came to is on the
// left, so reading an answer never means scrolling past the question.
const facts = document.createElement("div");
facts.className = "bench-facts";
panel.section("General")?.appendChild(facts);

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
 * A picture of one layer's own field, in the section where that layer is tuned.
 *
 * **A curve is judged against what it did, and the two have to be in one
 * place.** The bench's own picture select shows one layer at a time over the
 * whole patch, which means dragging a curve, looking away to switch pictures,
 * and looking back; a thumbnail under the curve is the same field, always the
 * one this section decides, and it costs a pass over a rectangle already here.
 */
const layerShots = new Map<LayerName, HTMLCanvasElement>();
for (const layer of LAYER_NAMES) {
	const section = panel.section(LAYER_TITLES[layer]);
	if (!section) continue;
	const shot = document.createElement("canvas");
	shot.className = "bench-layer-shot";
	// **A field at panel width says where its shapes are; at this size it says
	// what they look like.** The narrow octaves of a folded field are a grain
	// in a thumbnail and ridges enlarged, and which of those a curve is being
	// dragged against is the whole question.
	shot.title = "enlarge";
	shot.onclick = () => enlarge(layer);
	// **Straight under the curve it belongs to.** The curve is the whole of
	// what a layer decides and this is what it decided; a picture at the foot
	// of the section is a picture the reader has to scroll away from the curve
	// to see.
	const row = section.querySelector(":scope > .knob.curved");
	if (row) row.after(shot);
	else section.appendChild(shot);
	layerShots.set(layer, shot);
}

/**
 * One layer's picture, filling the window.
 *
 * Its own element rather than a bigger canvas in the panel, because the panel
 * is 280 pixels wide and the whole point of enlarging is to leave that.
 */
const big = document.createElement("div");
big.className = "bench-big";
big.hidden = true;
const bigName = document.createElement("div");
bigName.className = "bench-big-name";
const bigCanvas = document.createElement("canvas");
big.append(bigName, bigCanvas);
big.onclick = () => {
	big.hidden = true;
	bigShown = null;
};
document.body.appendChild(big);
let bigShown: LayerName | null = null;

/** Put one layer's picture on screen, large, until it is clicked away. */
function enlarge(layer: LayerName): void {
	bigShown = layer;
	big.hidden = false;
	bigName.textContent =
		`${LAYER_TITLES[layer]} — the field, ` +
		(sheetFor(LAYER_PICTURES[layer]) === planetSheet
			? "the whole planet"
			: `${Math.round(facts0?.span ?? 0).toLocaleString("en-US")} m of ground`) +
		" · click to close";
	paintBig();
}

/** Redraw the enlarged picture, if one is up. */
function paintBig(): void {
	const sheet = sheetFor(LAYER_PICTURES[bigShown ?? "continent"]);
	if (!bigShown || !sheet || big.hidden) return;
	if (bigCanvas.width !== sheet.width || bigCanvas.height !== sheet.height) {
		bigCanvas.width = sheet.width;
		bigCanvas.height = sheet.height;
	}
	const ctx = bigCanvas.getContext("2d");
	if (!ctx) return;
	const image = ctx.createImageData(sheet.width, sheet.height);
	paintSheet(sheet, LAYER_PICTURES[bigShown], image.data);
	ctx.putImageData(image, 0, 0);
}

/** Repaint every layer thumbnail from the sheet the last build handed over. */
function paintLayers(): void {
	paintBig();
	for (const [layer, shot] of layerShots) {
		const sheet = sheetFor(LAYER_PICTURES[layer]);
		if (!sheet) continue;
		if (shot.width !== sheet.width || shot.height !== sheet.height) {
			shot.width = sheet.width;
			shot.height = sheet.height;
		}
		const ctx = shot.getContext("2d");
		if (!ctx) continue;
		const image = ctx.createImageData(sheet.width, sheet.height);
		paintSheet(sheet, LAYER_PICTURES[layer], image.data);
		ctx.putImageData(image, 0, 0);
	}
}

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

/**
 * Everything the bench is holding, as the query string the planet takes.
 *
 * **Nothing is dropped, including the rows that only move the bench.** Where
 * the patch was standing and which picture was on it are work too, and the way
 * back here is through the planet's own link -- so leaving them out of this one
 * means a walk to the planet and back puts the patch somewhere else. The
 * planet reads them, keeps them, and hands them back; none of them reaches the
 * ground it builds.
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
			groundVertices: reply.geometry.groundVertices,
			waterVertices: reply.geometry.waterVertices,
			bounds: reply.geometry.bounds,
		});
		look.rawLow = reply.geometry.rawLow;
		look.rawHigh = reply.geometry.rawHigh;
		look.low = reply.facts.lowest;
		look.high = reply.facts.highest;
	}
	says = "";
	busy = false;
	// **The land share is a measurement, not a knob.** The coast is where the
	// continentalness curve crosses its own middle, so how much land there is
	// falls out of that curve -- only a finished map says how much.
	panel.note(
		"seaLevel",
		`${(reply.facts.land * 100).toFixed(1)}% of the planet is land`,
	);
	// **The patch is drawn on the block grid, not the map's.** What that costs
	// is columns, and the count is the only honest way to say it: one more
	// level is four times as many of them.
	panel.note(
		"patchDetail",
		`a column is ${reply.facts.columnMetres.toFixed(1)} m — ` +
			`${reply.facts.cellsDrawn.toLocaleString("en-US")} in the patch`,
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
	paintLayers();
	if (sections) graph.draw(sections, settings.knobs.patchAlong);
	say();
	render();
}

/**
 * The sheet every picture on this page is drawn from.
 *
 * **One choice for all of them.** `Map shows` is a question about what is being
 * looked at rather than about the small map alone -- and a layer whose shapes
 * are kilometres wide says nothing over a patch a kilometre across, so a
 * thumbnail of it stuck on the patch is a picture that barely moves whatever
 * the knobs do.
 */
function shown(): BenchSheet | null {
	return settings.knobs.patchMap === "planet" ? planetSheet : patchSheet;
}

/**
 * The sheet one picture is drawn from.
 *
 * **The carve is always the patch, whatever the map is showing.** Its shapes
 * are 120 m and the planet picture is 512 points around a 42,730 m
 * circumference -- one point every 83 m, so a shape is not two points across
 * and neighbouring points are unrelated. What that draws is television static:
 * an honest sampling of the field and a picture of nothing. Over the patch the
 * same shape is forty points across.
 */
function sheetFor(picture: PatchPicture): BenchSheet | null {
	return picture === "carve" ? patchSheet : shown();
}

/** The small picture: whichever sheet is asked for, in whichever picture. */
function paint(): void {
	const sheet = sheetFor(settings.knobs.patchPicture);
	if (!sheet) return;
	const planet = sheet === planetSheet;
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
	const metres = (v: number): string =>
		`${Math.round(v).toLocaleString("en-US")} m`;
	const line = (text: string): string => `<p>${text}</p>`;

	facts.innerHTML =
		(says ? line(`<span class="bench-busy">${says}</span>`) : "") +
		// **The world, in the numbers that describe a place rather than a
		// build.** Radius, depth and the crust say how big it is and how far
		// down it goes; the map cell says how finely the ground is drawn. What
		// is not here is what a knob already says on its own row.
		line(
			`radius <b>${metres(settings.radius)}</b> · ` +
				`depth <b>${settings.depth}</b> · ` +
				`crust <b>${settings.crustDepth.toLocaleString("en-US")}</b> layers`,
		) +
		line(
			`map cell <b>${settings.coarseCell.toFixed(0)} m</b> at level ` +
				`<b>${settings.coarseLevel}</b> · chunk ` +
				`<b>${settings.chunkSpan.toFixed(0)} m</b> · block ` +
				`<b>${k.blockSize} m</b>`,
		) +
		// **What the ground came to, measured, not asked for.** Relief says how
		// tall the tallest point is meant to be; this is where it landed once
		// sea level had been taken off, which is the number a mountain is
		// judged by.
		(f
			? line(
					`tallest ground <b>${metres(f.summit)}</b> over the water · ` +
						`deepest <b>${metres(-f.floor)}</b> under it`,
				) +
				// **The whole planet, not this patch.** The material lines are
				// absolute metres and a patch is a place, so a patch can be all
				// snow on a world that is mostly grass. This is what to tune
				// Relief against.
				line(
					`<b>${(f.bands[0]! * 100).toFixed(0)}%</b> sea · ` +
						`<b>${(f.bands[1]! * 100).toFixed(0)}%</b> grass · ` +
						`<b>${(f.bands[2]! * 100).toFixed(0)}%</b> rock · ` +
						`<b>${(f.bands[3]! * 100).toFixed(0)}%</b> snow`,
				)
			: "") +
		(k.seaLevel < 0
			? line(`sea drained <b>${metres(-k.seaLevel)}</b>`)
			: "") +
		line(
			`horizon at eye height <b>${metres(
				settings.radius *
					Math.acos(
						settings.radius /
							(settings.radius + PLAYER_DEFAULTS.eyeHeight),
					),
			)}</b>`,
		) +
		// The patch is a place on that world, and every number about it is
		// about that place rather than about the planet.
		(f
			? line(
					`patch <b>${metres(f.span)}</b> across · ` +
						`<b>${f.cellsDrawn.toLocaleString("en-US")}</b> columns ` +
						`of <b>${f.columnMetres.toFixed(1)} m</b>` +
						(f.whole ? " — the whole planet" : ""),
				) +
				line(
					`ground <b>${metres(f.lowest)}</b> to <b>${metres(f.highest)}</b> · ` +
						`land <b>${Math.round(f.landShare * 100)}%</b>`,
				) +
				// **Which of the first two is bigger is the whole question about
				// the carve.** Blocks off the top of a column only lower the
				// ground, however many of them there are; a block taken out from
				// under rock is a space, and a space is the only thing a height
				// field could never have drawn.
				(f.dugUnder + f.dugAbove > 0
					? line(
							`carved <b>${f.dugUnder.toLocaleString("en-US")}</b> under rock, ` +
								`<b>${f.dugAbove.toLocaleString("en-US")}</b> off the top` +
								(f.dugDrowned > 0
									? ` · <b>${f.dugDrowned.toLocaleString("en-US")}</b> under the sea`
									: ""),
						) +
						line(
							`<b>${f.stacked.toLocaleString("en-US")}</b> columns hold rock over air, ` +
								`deepest <b>${f.deepest}</b> spans · ` +
								`<b>${f.floating.toLocaleString("en-US")}</b> floating`,
						)
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
	look.layer =
		k.patchPicture === "peaks"
			? "peaks"
			: k.patchPicture === "erosion"
				? "erosion"
				: k.patchPicture === "carve"
					? "carve"
					: "continent";

	const reach = span * camera.distance;
	const eye = new Vec3(
		Math.sin(camera.yaw) * Math.cos(camera.pitch) * reach,
		Math.sin(camera.pitch) * reach + span * camera.lift,
		Math.cos(camera.yaw) * Math.cos(camera.pitch) * reach,
	);
	look.showLights = k.showLights;
	look.light = k.patchLight;
	look.debugShadow =
		new URLSearchParams(location.search).get("shadowDebug") === "1";
	look.keyShadow = k.keyShadow;
	look.fillShadow = k.fillShadow;
	look.keyLight = k.keyLight;
	look.fillLight = k.fillLight;
	look.topLight = k.topLight;
	look.shadowStrength = k.shadowStrength;
	look.shadowStrength = k.shadowStrength;
	look.span = span;
	// **What a block is made of is a depth question as well as an elevation
	// one**, so the shader is told how deep the soil runs and how thick one
	// block is -- the world's own two lengths, in metres.
	look.soilMetres = TERRAIN_DEFAULTS.soilDepth * k.blockSize;
	look.blockMetres = k.blockSize;
	// **The crust the patch drew**, so the fade reads the same however deep
	// the layer's own reach runs.
	look.shadeDepth = Math.max(
		1,
		(facts0?.highest ?? 0) -
			(facts0?.lowest ?? 0) +
			columnDepth(settings.layerFor("carve"), k.blockSize),
	);
	look.shadeAmount = k.patchDepthShade;
	// The near cascade is sized from how far off the viewer is, so its texels
	// tighten with the zoom.
	look.eye = [eye.x, eye.y, eye.z];
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
