import type { PatchField } from "./patchField.js";
import type { PatchLook } from "chamfer/render";
import { BenchGraph } from "./BenchGraph.js";
import { BenchPreview } from "./BenchPreview.js";
import { BenchWorld } from "./BenchWorld.js";
import { GROUND_LINES } from "chamfer/generation";
import { Mat4, Vec3 } from "chamfer/math";
import { PATCH_KNOBS, PlanetSettings } from "./PlanetSettings.js";
import { ParameterPanel } from "./ParameterPanel.js";
import {
	PatchRenderer,
	createGpuContext,
	resizeToDisplay,
} from "chamfer/render";
import { coarsePatchMesh } from "chamfer/mesh";
import { patchField, patchFrame } from "./patchField.js";

/**
 * The terrain bench: one patch of a planet, and the knobs that shape it.
 *
 * **Its own page, not a pane over the world.** Choosing terrain numbers is
 * looking at ground, and a world drawn behind the thing being judged is a
 * second picture competing with the first. Nothing here builds a chunk or runs
 * a residency loop: the map is the terrain, so a picture of the map is a
 * picture of the world.
 *
 * The patch is drawn **cell by cell**, one hexagon per map cell, because the
 * lattice is what the world is made of and a square grid of quads is a picture
 * of a different surface. A corner is where three cells meet and stands at the
 * height of all three, which is the blend the generator reads the map with.
 */

const canvas = document.getElementById("viewport") as HTMLCanvasElement;
let settings = PlanetSettings.fromParams(new URLSearchParams(location.search));

/** Which number the shader's picture branch takes. */
const PICTURE_INDEX: Record<string, number> = {
	ground: 0,
	height: 1,
	raw: 2,
	terrain: 3,
	mountain: 3,
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

/** A knob moved, whichever kind it was. */
function moved(draft: PlanetSettings): void {
	settings = draft;
	back.href = `./planet.html?${planetParams()}`;
	if (building) {
		pending = true;
		return;
	}
	void build();
}

const head = document.createElement("div");
head.className = "bench-head";

const back = document.createElement("a");
back.className = "bench-back";
back.textContent = "← The planet";
head.appendChild(back);

const mapCanvas = document.createElement("canvas");
mapCanvas.className = "bench-map";
head.appendChild(mapCanvas);

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
const preview = new BenchPreview(mapCanvas, (place) => {
	panel.set({
		patchLatitude: Math.round(place.latitude),
		patchLongitude: Math.round(place.longitude),
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
// The map, and the three pictures drawn from it.
// ---------------------------------------------------------------------------

const world = new BenchWorld();
let building = false;
let pending = false;
let field: PatchField | null = null;
let cellsDrawn = 0;
let span = 1;
let meshKey = "";
let renderer: PatchRenderer | null = null;

const look = {
	picture: 0,
	surface: "solid" as PatchLook["surface"],
	contours: true,
	rockLine: GROUND_LINES.rock,
	snowLine: GROUND_LINES.snow,
	rawLow: -1,
	rawHigh: 1,
};

async function build(): Promise<void> {
	building = true;
	do {
		pending = false;
		await world.refresh(settings, draw);
	} while (pending);
	building = false;
}

/** Redraw everything the map now says, and rebuild the patch if it moved. */
function draw(): void {
	const k = settings.knobs;
	if (!world.cells || !world.fit) {
		say();
		return;
	}
	const frame = patchFrame(k.patchLatitude, k.patchLongitude);
	const layer =
		k.patchPicture === "mountain" ? world.mountain : world.terrain;
	field = patchField(
		world.cells,
		{ height: world.height, raw: world.raw, layer, cut: world.delta },
		{
			frame,
			cells: k.patchCells,
			step: settings.coarseCell,
			radius: settings.radius,
		},
	);

	const cutScale = world.report?.scale ?? 1;
	if (k.patchMap === "planet")
		preview.planet(
			world,
			settings,
			frame,
			field.span,
			k.patchPicture,
			k.patchContours,
			cutScale,
		);
	else preview.patch(field, k.patchPicture, k.patchContours, cutScale);
	graph.draw(field, k.patchAlong);

	// The mesh is rebuilt when the ground under it moved or the patch did, and
	// never when only the picture changed: a picture is a uniform.
	const wanted = JSON.stringify([
		world.ms,
		k.patchLatitude,
		k.patchLongitude,
		k.patchCells,
		k.patchLift,
		k.patchPicture === "mountain" ? "mountain" : "terrain",
	]);
	if (wanted !== meshKey && renderer) {
		meshKey = wanted;
		const patch = coarsePatchMesh(world.cells, {
			at: frame.up,
			cells: k.patchCells,
			radius: settings.radius,
			exaggeration: k.patchLift,
			height: world.height,
			raw: world.raw,
			layer,
		});
		renderer.upload(patch);
		cellsDrawn = patch.cellCount;
		look.rawLow = patch.rawLow;
		look.rawHigh = patch.rawHigh;
		span = Math.max(1, patch.span);
	}
	say();
	render();
}

/** The lines under the picture: what this world is, and what the build is doing. */
function say(): void {
	const progress = world.progress;
	const cells = world.cells?.count ?? 0;
	const report = world.report;
	facts.innerHTML =
		`radius <b>${Math.round(settings.radius).toLocaleString("en-US")} m</b> · ` +
		`map level <b>${settings.coarseLevel}</b> · ` +
		`cell <b>${settings.coarseCell.toFixed(1)} m</b><br>` +
		(field
			? `patch <b>${Math.round(field.span).toLocaleString("en-US")} m</b> across, ` +
				`<b>${cellsDrawn.toLocaleString("en-US")}</b> cells drawn<br>` +
				`ground <b>${Math.round(field.lowest)}</b> to ` +
				`<b>${Math.round(field.highest)} m</b> · ` +
				`land here <b>${Math.round(field.landShare * 100)}%</b><br>`
			: "") +
		(progress
			? `<span class="bench-busy">${progress.says} — ` +
				`${(progress.done * 100).toFixed(0)}%</span>`
			: `map of <b>${cells.toLocaleString("en-US")}</b> cells in ` +
				`<b>${(world.ms / 1000).toFixed(1)} s</b>`) +
		// **The whole planet, not this patch.** The material lines are absolute
		// metres and a patch is a place, so a patch can be all snow on a world
		// that is mostly grass. This is the number to tune Relief against.
		`<br>planet: <b>${(world.bands[0]! * 100).toFixed(0)}%</b> sea · ` +
		`<b>${(world.bands[1]! * 100).toFixed(0)}%</b> grass · ` +
		`<b>${(world.bands[2]! * 100).toFixed(0)}%</b> rock · ` +
		`<b>${(world.bands[3]! * 100).toFixed(0)}%</b> snow` +
		(settings.knobs.patchLift === 1
			? field
				? `<br>true scale · relief is <b>${(
						(100 * (field.highest - field.lowest)) /
						Math.max(1, field.span)
					).toFixed(1)}%</b> of the patch`
				: ""
			: `<br><span class="bench-busy">drawn <b>${settings.knobs.patchLift}x</b> ` +
				"taller than the world builds it</span>") +
		(settings.knobs.seaLevel < 0
			? `<br>sea drained <b>${(-settings.knobs.seaLevel).toLocaleString("en-US")} m</b> — ` +
				`the tallest point is <b>${Math.round(world.summit).toLocaleString("en-US")} m</b> ` +
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
				(settings.knobs.patchPicture === "erosion"
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
	look.contours = k.patchContours;

	const reach = span * camera.distance;
	const eye = new Vec3(
		Math.cos(camera.yaw) * Math.cos(camera.pitch) * reach,
		Math.sin(camera.pitch) * reach + span * camera.lift,
		Math.sin(camera.yaw) * Math.cos(camera.pitch) * reach,
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
	void build();
}

void main();
