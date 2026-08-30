import type { VegetationFacts, VegetationReply } from "./VegetationMessage.js";
import type { BenchSheet } from "./BenchMessage.js";
import type { PatchLook } from "chamfer/render";
import type { PlanetKnobs } from "./PlanetSettings.js";
import type { PlantPicture } from "./paintPlantSheet.js";
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
import { PlanetSettings } from "./PlanetSettings.js";
import { PLAYER_DEFAULTS } from "chamfer/player";
import { ParameterPanel } from "./ParameterPanel.js";
import { PlantPanel } from "./PlantPanel.js";
import { plantLayersToText } from "./PlantDraft.js";
import { outlinePatch } from "./outlinePatch.js";
import { paintSheet } from "./paintSheet.js";
import {
	PatchRenderer,
	createGpuContext,
	resizeToDisplay,
} from "chamfer/render";

/**
 * The vegetation bench: one patch of a planet, and everything growing on it.
 *
 * **Two panels, one on each side, because a plant and the ground it stands on
 * are different questions.** The left panel is the world the plants are planted
 * in -- the seed, the terrain layers, how finely the ground is drawn, where on
 * the planet the patch stands, and the readout that says what grew. The right
 * is the plants themselves: one card per species, each with its own field, its
 * own curve and its own trunk, branches and leaves.
 *
 * **Nothing here builds anything.** The map, the patch, the plants and the mesh
 * are all a worker's; this file holds the knobs, the canvas and the camera, and
 * draws what arrives.
 */

const canvas = document.getElementById("viewport") as HTMLCanvasElement;

/**
 * The knobs that decide what is drawn rather than what is there.
 *
 * `patchMap` is not among them: the layer pictures are read over whichever
 * rectangle is shown, so switching it is a pass over the fields rather than a
 * uniform. Everything it does not touch is kept, so that pass is the whole of
 * what it costs.
 */
const VIEW_KNOBS: ReadonlySet<string> = new Set([
	"patchPicture",
	"patchSurface",
	"patchAlong",
]);

let settings = PlanetSettings.fromParams(new URLSearchParams(location.search));

// **The world's own plants, read out of the world.** They travel in the query
// string with every other knob, so a link from any bench opens here on the same
// planet with the same forest -- and what this panel edits is written straight
// back into it.
const layers = settings.plantLayers;

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
// The left panel: the world, with the picture above it.
// ---------------------------------------------------------------------------

const panel = new ParameterPanel(
	settings,
	(draft) => moved(draft),
	(draft) => moved(draft),
	() => {},
	{ bench: true, page: "vegetation", side: "left" },
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
head.appendChild(legend);

panel.mount(head);

const facts = document.createElement("div");
facts.className = "bench-facts";
const recipe = document.createElement("div");
recipe.className = "bench-recipe";
const general = panel.section("General");
general?.append(recipe, facts);

// ---------------------------------------------------------------------------
// The right panel: the plants.
// ---------------------------------------------------------------------------

/**
 * The one switch that is about the plants and is not about one of them.
 *
 * **Collision is not a second system.** A plant is blocks, so what a player
 * walks into is the block test the world already runs; this says whether a leaf
 * counts, and the readout says what that comes to.
 */
const collide = document.createElement("div");
collide.className = "knob check";
const collideBox = document.createElement("input");
collideBox.type = "checkbox";
collideBox.checked = settings.knobs.leavesCollide;
const collideLabel = document.createElement("label");
collideLabel.textContent = "Leaves are solid";
const collideNote = document.createElement("p");
collideNote.className = "knob-note";
collide.append(collideBox, collideLabel, collideNote);
collideBox.oninput = () => {
	settings = new PlanetSettings({
		...settings.knobs,
		leavesCollide: collideBox.checked,
	});
	request(true);
};

const plants = new PlantPanel(layers, (settled) => changed(settled), {
	picture: (new URLSearchParams(location.search).get("layerPicture") ??
		"noise") as PlantPicture,
	extras: collide,
	onPicture: () => writeUrl(),
});

// ---------------------------------------------------------------------------
// Standing somewhere on the planet.
// ---------------------------------------------------------------------------

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
 * Write the world back into the address bar, and into the way out of here.
 *
 * **The layers are a knob of the world**, so they are folded into the draft
 * rather than added to the link beside it: the planet page and every other
 * bench read the same string, and the way back carries the forest with it.
 */
function writeUrl(): void {
	settings = new PlanetSettings({
		...settings.knobs,
		plants: plantLayersToText(plants.layers),
	});
	// The panel writes the link and holds its own copy of the draft, so what
	// this page decided about the plants has to reach it.
	panel.carry({ plants: settings.knobs.plants });
	const params = settings.toParams();
	if (plants.picture !== "noise") params.set("layerPicture", plants.picture);
	history.replaceState(null, "", `?${params.toString()}`);
	const planetParams = settings.toParams();
	planetParams.set("panel", "1");
	back.href = `./planet.html?${planetParams.toString()}`;
}

// ---------------------------------------------------------------------------
// The worker, and the one rule for talking to it.
// ---------------------------------------------------------------------------

const worker = new Worker(new URL("./vegetationWorker.ts", import.meta.url), {
	type: "module",
});

let token = 0;
let busy = false;
let says = "";
let asked = "";
let askedBlocks = 0;

let facts0: VegetationFacts | null = null;
let renderer: PatchRenderer | null = null;
let span = 1;
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
 * Something moved: a world knob, a plant knob, or a curve being dragged.
 *
 * **A picture is never a build.** Choosing what to look at is a choice made
 * while looking at the last thing, so it happens on this thread and in this
 * frame -- even mid-build, which is when a reader is most likely to reach for
 * it.
 *
 * **One build in flight, and the newest values always next.** A slider dragged
 * across its range fires on every step and a stand is seconds, so acting on
 * each one queues them faster than any of them finishes. A change during a
 * build is remembered rather than queued, and the build that lands starts it.
 *
 * **A drag asks for half the patch and a settled value asks for all of it.**
 * The ground follows the pointer at a quarter of the columns, and the width
 * the panel says is what gets built once the hand stops -- which is why the
 * settle timer is what upgrades a draft and nothing else does. Anything that
 * is not a drag -- a layer added, a species picked, a switch turned -- arrives
 * settled.
 */
let settleTimer = 0;
let pending = false;
let pendingSettled = false;
function request(settled: boolean): void {
	writeUrl();
	clearTimeout(settleTimer);
	if (!settled) settleTimer = window.setTimeout(() => request(true), 240);
	const blocks = widthFor(settled);
	if (buildKey(settings.knobs) === asked && blocks === askedBlocks) {
		show();
		return;
	}
	if (busy) {
		pending = true;
		pendingSettled = pendingSettled || settled;
		return;
	}
	ask(settled);
}

/** A world knob moved, which is the same question with a new draft. */
function moved(draft: PlanetSettings): void {
	settings = draft;
	collideBox.checked = draft.knobs.leavesCollide;
	request(false);
}

/** A plant knob moved. */
function changed(settled: boolean): void {
	request(settled);
}

/**
 * Everything the worker is asked for, as one string.
 *
 * **A curve is an array, and the panel drags the same array the last request
 * was read from**, so comparing object against object says a dragged curve did
 * not move. Written out by value instead.
 */
function buildKey(knobs: PlanetKnobs): string {
	const out: Record<string, unknown> = {};
	for (const key of Object.keys(knobs).sort())
		if (!VIEW_KNOBS.has(key))
			out[key] = (knobs as unknown as Record<string, unknown>)[key];
	return JSON.stringify([out, plants.layers]);
}

/** How wide a patch to ask for: half of it while a hand is still moving. */
function widthFor(settled: boolean): number {
	return settled
		? settings.knobs.patchBlocks
		: Math.max(24, settings.knobs.patchBlocks >> 1);
}

function ask(settled: boolean): void {
	busy = true;
	pending = false;
	pendingSettled = false;
	says = "";
	asked = buildKey(settings.knobs);
	askedBlocks = widthFor(settled);
	worker.postMessage({
		kind: "build",
		token: ++token,
		knobs: { ...settings.knobs },
		layers: plants.layers,
		blocks: askedBlocks,
	});
}

worker.onmessage = (event: MessageEvent<VegetationReply>) => {
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
	patchSheet = reply.patch;
	if (reply.planet) planetSheet = reply.planet;
	if (reply.geometry && renderer) {
		renderer.upload({
			vertices: reply.geometry.vertices,
			indices: null,
			lines: reply.geometry.lines,
			triangleCount: reply.geometry.groundVertices / 3,
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
	panel.note(
		"seaLevel",
		`${(reply.facts.land * 100).toFixed(1)}% of the planet is land`,
	);
	panel.note(
		"patchBlocks",
		`${Math.round(reply.facts.span).toLocaleString("en-US")} m of ground · ` +
			`${reply.facts.cellsDrawn.toLocaleString("en-US")} hexagons`,
	);
	panel.note(
		"patchLod",
		`blocks ${reply.facts.columnMetres.toFixed(1)} m · ` +
			`${reply.facts.cellsDrawn.toLocaleString("en-US")} hexagons over ` +
			`${reply.facts.roots.toLocaleString("en-US")} planting cells — the ` +
			"ground gets cheaper with the level and the roots do not",
	);
	collideNote.innerHTML =
		`<b>${(100 * reply.facts.walkable).toFixed(1)}%</b> of the ground can ` +
		"be walked onto — the rest is blocked at knee height";
	plants.show({
		sheets: reply.sheets,
		tallies: reply.tallies,
		metres: reply.shot.noise,
		grown: new Map(reply.facts.grown.map((one) => [one.id, one.count])),
		presentBiomes: reply.facts.presentBiomes,
	});
	show();
	if (pending) ask(pendingSettled);
};

/** Draw everything this thread owns, from what the last build handed over. */
function show(): void {
	paint();
	say();
	render();
}

function shown(): BenchSheet | null {
	return settings.knobs.patchMap === "planet" ? planetSheet : patchSheet;
}

/** The small picture: whichever sheet is asked for, in whichever picture. */
function paint(): void {
	const sheet = shown();
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

/** The lines under the picture: what grew, and what the build is doing. */
function say(): void {
	const f = facts0;
	const metres = (v: number): string =>
		`${Math.round(v).toLocaleString("en-US")} m`;
	const line = (text: string): string => `<p>${text}</p>`;

	// **What the ground grew, first, because that is what this page is for.**
	recipe.innerHTML = f
		? `<i class="c">${f.plants.toLocaleString("en-US")}</i> plants · ` +
			`<i class="c">${f.wood.toLocaleString("en-US")}</i> wood + ` +
			`<i class="e">${f.leaf.toLocaleString("en-US")}</i> leaf cells · ` +
			`<i class="p">${f.pieces.toLocaleString("en-US")}</i> pieces, ` +
			`<i class="p">${(100 * f.rooted).toFixed(1)}%</i> rooted`
		: "";

	facts.innerHTML =
		(says ? line(`<span class="bench-busy">${says}</span>`) : "") +
		line(
			`radius <b>${metres(settings.radius)}</b> · ` +
				`depth <b>${settings.depth}</b> · ` +
				`block <b>${settings.knobs.blockSize} m</b>`,
		) +
		line(
			`map cell <b>${settings.coarseCell.toFixed(0)} m</b> at level ` +
				`<b>${settings.coarseLevel}</b> · patch level ` +
				`<b>${settings.plantLevel}</b>`,
		) +
		(f
			? line(
					`patch <b>${metres(f.span)}</b> across · ` +
						`<b>${f.cellsDrawn.toLocaleString("en-US")}</b> hexagons of ` +
						`<b>${f.columnMetres.toFixed(2)} m</b>`,
				) +
				line(
					`ground <b>${metres(f.lowest)}</b> to <b>${metres(f.highest)}</b> · ` +
						`land <b>${Math.round(f.landShare * 100)}%</b>`,
				) +
				line(
					`tallest plant <b>${f.tallest.toFixed(1)} m</b>, shortest ` +
						`<b>${f.shortest.toFixed(1)} m</b> · widest reach ` +
						`<b>${f.widest.toFixed(1)} m</b>`,
				) +
				line(
					`<b>${f.chunks.toLocaleString("en-US")}</b> chunks · ` +
						`<b>${f.rootsTested.toLocaleString("en-US")}</b> roots offered, ` +
						`<b>${f.rootsOwned.toLocaleString("en-US")}</b> owned`,
				) +
				line(
					`<b>${(100 * f.walkable).toFixed(1)}%</b> of the land can be ` +
						`walked onto · <b>${Math.round(f.ms)} ms</b>`,
				) +
				line(
					`<b>${(f.bands[0]! * 100).toFixed(0)}%</b> sea · ` +
						`<b>${(f.bands[1]! * 100).toFixed(0)}%</b> grass · ` +
						`<b>${(f.bands[2]! * 100).toFixed(0)}%</b> rock · ` +
						`<b>${(f.bands[3]! * 100).toFixed(0)}%</b> snow`,
				) +
				line(
					`horizon at eye height <b>${metres(
						settings.radius *
							Math.acos(
								settings.radius /
									(settings.radius +
										PLAYER_DEFAULTS.eyeHeight),
							),
					)}</b>`,
				)
			: "");
}

// ---------------------------------------------------------------------------
// The patch, which is the point of the bench.
// ---------------------------------------------------------------------------

/**
 * Where the eye starts.
 *
 * **Low and close, because a plant is what is being judged.** The landscape
 * bench frames a hillside and stands well back from it; here the tallest thing
 * on the ground is twenty metres, so the opening view is one a person could
 * stand in and still holds the whole patch.
 */
const camera = { yaw: -0.7, pitch: 0.45, distance: 1.5, lift: 0 };

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

	// **The eye looks at the ground, not at sea level.** A patch is laid out
	// with its heights measured from the water, so a plateau two hundred metres
	// up puts the frame's own origin that far underground -- and a camera aimed
	// there is a camera inside the hill. The middle of what this patch actually
	// reached is what it circles instead, so a stand reads the same wherever on
	// the planet it stands.
	const focus = facts0 ? (facts0.lowest + facts0.highest) / 2 : 0;
	const reach = span * camera.distance;
	const eye = new Vec3(
		Math.sin(camera.yaw) * Math.cos(camera.pitch) * reach,
		Math.sin(camera.pitch) * reach + span * camera.lift + focus,
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
	look.span = span;
	// **What ground is made of is a depth question as well as an elevation
	// one**, so the shader is told how deep the soil runs and how thick one
	// block is -- the world's own two lengths, in metres.
	look.soilMetres = TERRAIN_DEFAULTS.soilDepth * k.blockSize;
	look.blockMetres = k.blockSize;
	look.shadeDepth = Math.max(
		1,
		columnDepth(settings.layerFor("carve"), k.blockSize),
	);
	look.shadeAmount = k.patchDepthShade;
	look.eye = [eye.x, eye.y, eye.z];
	const view = Mat4.lookAt([eye.x, eye.y, eye.z], [0, focus, 0], [0, 1, 0]);
	const proj = Mat4.perspective(
		0.9,
		canvas.width / Math.max(1, canvas.height),
		span * 0.002,
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
		camera.pitch = Math.max(-0.2, Math.min(1.5, camera.pitch + dy * 0.005));
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
			0.05,
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
	ask(true);
}

writeUrl();
say();
void main();
