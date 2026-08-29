import type { BiomesFacts, BiomesReply } from "./BiomesMessage.js";
import type { PatchLook } from "chamfer/render";
import type { PlanetKnobs } from "./PlanetSettings.js";
import type { BiomeCloudSource, BiomeCounted } from "./BiomePanel.js";
import { GROUND_LINES, TERRAIN_DEFAULTS } from "chamfer/generation";
import {
	PATCH_FILL_SHARE,
	PATCH_KEY_SHARE,
	PATCH_TOP_SHARE,
} from "chamfer/render";
import { Mat4, Vec3 } from "chamfer/math";
import { PlanetSettings } from "./PlanetSettings.js";
import { ParameterPanel } from "./ParameterPanel.js";
import { BiomePanel } from "./BiomePanel.js";
import { biomeTableToText } from "./BiomeDraft.js";
import {
	PatchRenderer,
	createGpuContext,
	resizeToDisplay,
} from "chamfer/render";

/**
 * The biome bench: one patch of a planet, and the names its ground is given.
 *
 * **Two panels, one on each side, because the ground and its naming are
 * different questions.** The left panel is the world the biomes are read over
 * -- the seed, the climate, the landform cut, and where the patch stands. The
 * right is the table itself: the diagram with one dot per biome, the list, and
 * the landform grid. The patch in the middle is drawn in the biomes' own
 * ground blocks, so what a dot is dragged to is what the world builds.
 *
 * **Nothing here builds anything.** The map, the biome field, the patch and
 * the planet's readings are all a worker's; this file holds the knobs, the
 * canvas and the camera, and draws what arrives.
 */

const canvas = document.getElementById("viewport") as HTMLCanvasElement;

/** The knobs that decide what is drawn rather than what is there. */
const VIEW_KNOBS: ReadonlySet<string> = new Set([
	"patchPicture",
	"patchSurface",
	"patchMap",
	"patchAlong",
]);

let settings = PlanetSettings.fromParams(new URLSearchParams(location.search));

// **The world's own biomes, read out of the world.** They travel in the query
// string with every other knob, so a link from any bench opens here on the
// same planet with the same table -- and what the right panel edits is written
// straight back into it.
const table = settings.biomeTable;

// ---------------------------------------------------------------------------
// The left panel: the world, with the head above it.
// ---------------------------------------------------------------------------

const panel = new ParameterPanel(
	settings,
	(draft) => moved(draft),
	(draft) => moved(draft),
	() => {},
	{ bench: true, page: "biomes", side: "left" },
);

const head = document.createElement("div");
head.className = "bench-head";

const back = document.createElement("a");
back.className = "bench-back";
back.textContent = "← The planet";
head.appendChild(back);

panel.mount(head);

const facts = document.createElement("div");
facts.className = "bench-facts";
const recipe = document.createElement("div");
recipe.className = "bench-recipe";
const general = panel.section("General");

// ---------------------------------------------------------------------------
// The right panel: the biomes.
// ---------------------------------------------------------------------------

const biomes = new BiomePanel(table, (settled) => request(settled), {
	cloud: (new URLSearchParams(location.search).get("biomeCloud") ??
		"patch") as BiomeCloudSource,
	counted: (new URLSearchParams(location.search).get("biomeCounted") ??
		"planet") as BiomeCounted,
	onPicture: () => writeUrl(),
	// **The same knob a slider owns**, so the two rows that hold a place
	// agree with wherever a click on a picture just sent the patch.
	onMove: (latitude, longitude) => {
		panel.set({ patchLatitude: latitude, patchLongitude: longitude });
	},
});
biomes.setPush(settings.knobs.biomeWarp ? settings.knobs.warpStrength : 0);

// **The finished map goes with the world, not with the table that reads
// it.** The lab keeps its picture in the world panel's head, above the
// facts a build measured -- what the diagram is being judged against, not
// one more row of the biomes it names.
general?.append(biomes.preview, recipe, facts);

// **Each field's own picture, at the top of the section that tunes it.**
// The lab keeps a picture where the knobs that read it are, so what a row is
// doing to the world never scrolls out of view while the row is turned.
function mountMini(title: string, mini: HTMLElement): void {
	const section = panel.section(title);
	section?.insertBefore(mini, section.children[1] ?? null);
}
const terrainSection = panel.section("The terrain");
if (terrainSection) {
	terrainSection.append(biomes.miniGround);
	const terrainNote = document.createElement("p");
	terrainNote.className = "knob-note";
	terrainNote.textContent =
		"the ground is the input here rather than the subject -- it arrives already tuned through the link, and the landscape bench is where its own knobs live. Climate needs a coastline to measure from and a mountain to be cooled by";
	terrainSection.append(terrainNote);
}
mountMini("The landform", biomes.miniLandform);
mountMini("The regions", biomes.miniRegions);
mountMini("Temperature", biomes.miniTemperature);
mountMini("Humidity", biomes.miniHumidity);
mountMini("Biome noise", biomes.miniPush);

/**
 * Write the world back into the address bar, and into the way out of here.
 *
 * **The table is a knob of the world**, so it is folded into the draft rather
 * than added to the link beside it: the planet page and every other bench read
 * the same string, and the way back carries the biomes with it.
 */
function writeUrl(): void {
	settings = new PlanetSettings({
		...settings.knobs,
		biomes: biomeTableToText(biomes.table),
	});
	panel.carry({ biomes: settings.knobs.biomes });
	const params = settings.toParams();
	if (biomes.cloud !== "patch") params.set("biomeCloud", biomes.cloud);
	if (biomes.counted !== "planet") params.set("biomeCounted", biomes.counted);
	history.replaceState(null, "", `?${params.toString()}`);
	const planetParams = settings.toParams();
	planetParams.set("panel", "1");
	back.href = `./planet.html?${planetParams.toString()}`;
}

// ---------------------------------------------------------------------------
// The worker, and the one rule for talking to it.
// ---------------------------------------------------------------------------

const worker = new Worker(new URL("./biomesWorker.ts", import.meta.url), {
	type: "module",
});

let token = 0;
let busy = false;
let says = "";
let asked = "";
let askedCells = 0;

let facts0: BiomesFacts | null = null;
let renderer: PatchRenderer | null = null;
let span = 1;

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
 * Something moved: a world knob, a dot on the diagram, or the grid.
 *
 * **One build in flight, and the newest values always next.** A change during
 * a build is remembered rather than queued, and the build that lands starts
 * it. A drag asks for half the patch; the settled value builds the width the
 * panel says.
 */
let settleTimer = 0;
let pending = false;
let pendingSettled = false;
function request(settled: boolean): void {
	writeUrl();
	clearTimeout(settleTimer);
	if (!settled) settleTimer = window.setTimeout(() => request(true), 240);
	const cells = widthFor(settled);
	if (buildKey(settings.knobs) === asked && cells === askedCells) {
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
	biomes.setPush(draft.knobs.biomeWarp ? draft.knobs.warpStrength : 0);
	request(false);
}

/** Everything the worker is asked for, as one string. */
function buildKey(knobs: PlanetKnobs): string {
	const out: Record<string, unknown> = {};
	for (const key of Object.keys(knobs).sort())
		if (!VIEW_KNOBS.has(key))
			out[key] = (knobs as unknown as Record<string, unknown>)[key];
	return JSON.stringify(out);
}

/** How wide a patch to ask for: half of it while a hand is still moving. */
function widthFor(settled: boolean): number {
	return settled
		? settings.knobs.patchCells
		: Math.max(8, settings.knobs.patchCells >> 1);
}

function ask(settled: boolean): void {
	busy = true;
	pending = false;
	pendingSettled = false;
	says = "";
	asked = buildKey(settings.knobs);
	askedCells = widthFor(settled);
	worker.postMessage({
		kind: "build",
		token: ++token,
		knobs: { ...settings.knobs },
		cells: askedCells,
	});
}

worker.onmessage = (event: MessageEvent<BiomesReply>) => {
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
		"patchCells",
		`${Math.round(reply.facts.span).toLocaleString("en-US")} m of ground · ` +
			`${reply.facts.cellsDrawn.toLocaleString("en-US")} hexagons of ` +
			`${reply.facts.columnMetres.toFixed(0)} m`,
	);
	panel.note(
		"regionSpan",
		`rounded to the level ${reply.facts.regionLevel} lattice: regions ` +
			`${Math.round(reply.facts.regionMetres).toLocaleString("en-US")} m across`,
	);
	panel.note(
		"biomeFit",
		reply.facts.fit.fitted
			? `temperature spans ${reply.facts.fit.tSpan.toFixed(2)}, ` +
					`humidity ${reply.facts.fit.hSpan.toFixed(2)} of the raw range`
			: "off: the readings go in as they come and bunch in the middle",
	);
	biomes.show(reply.facts, reply.planet, reply.patch);
	show();
	if (pending) ask(pendingSettled);
};

/** Draw everything this thread owns, from what the last build handed over. */
function show(): void {
	say();
	render();
}

/** The readout: what the planet named its ground, and what the patch holds. */
function say(): void {
	const f = facts0;
	const metres = (v: number): string =>
		`${Math.round(v).toLocaleString("en-US")} m`;
	const line = (text: string): string => `<p>${text}</p>`;

	recipe.innerHTML = f
		? `<i class="c">${f.built}</i> of ` +
			`<i class="c">${biomes.table.biomes.length}</i> biomes built · ` +
			`<i class="e">${f.patchBiomes}</i> on the patch · ` +
			`<i class="p">${(f.land * 100).toFixed(1)}%</i> land`
		: "";

	facts.innerHTML =
		(says ? line(`<span class="bench-busy">${says}</span>`) : "") +
		line(
			`radius <b>${metres(settings.radius)}</b> · map cell ` +
				`<b>${settings.coarseCell.toFixed(0)} m</b> at level ` +
				`<b>${settings.coarseLevel}</b>`,
		) +
		(f
			? line(
					`patch <b>${metres(f.span)}</b> across · ` +
						`<b>${f.cellsDrawn.toLocaleString("en-US")}</b> hexagons of ` +
						`<b>${f.columnMetres.toFixed(0)} m</b>`,
				) +
				line(
					`ground <b>${metres(f.lowest)}</b> to <b>${metres(f.highest)}</b> · ` +
						`land <b>${Math.round(f.landShare * 100)}%</b> · ` +
						`<b>${Math.round(f.ms)} ms</b>`,
				)
			: "");
}

// ---------------------------------------------------------------------------
// The patch, which is the point of the bench.
// ---------------------------------------------------------------------------

const camera = { yaw: -0.7, pitch: 0.62, distance: 1.6, lift: 0 };

function render(): void {
	if (!renderer) return;
	const k = settings.knobs;
	// The patch is always the biome map: every ground face carries its
	// biome's own block, so the picture branch stays on the bands and the
	// material is what paints it.
	look.picture = 0;
	look.surface = k.patchSurface;
	const focus = facts0 ? (facts0.lowest + facts0.highest) / 2 : 0;
	const reach = span * camera.distance;
	const eye = new Vec3(
		Math.sin(camera.yaw) * Math.cos(camera.pitch) * reach,
		Math.sin(camera.pitch) * reach + span * camera.lift + focus,
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
	look.soilMetres = TERRAIN_DEFAULTS.soilDepth * k.blockSize;
	look.blockMetres = k.blockSize;
	look.shadeAmount = 0;
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
