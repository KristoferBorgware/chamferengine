import type { ChunkMesh } from "chamfer/mesh";
import type { ChunkSelection } from "chamfer/generation";
import { Mat4, Vec3 } from "chamfer/math";
import { WorldShape, maxCrustDepth } from "chamfer/world";
import {
	BlockType,
	ChunkAddress,
	ChunkAtlas,
	ChunkColumnSampler,
	TerrainGenerator,
	buildCoarseMap,
	generateChunk,
	seedFromString,
	selectChunks,
} from "chamfer/generation";
import { buildChunkMesh } from "chamfer/mesh";
import { positionToCell } from "chamfer/addressing";
import { NORTH } from "chamfer/addressing";
import { daylight, sunDirection, terminatorSpeed } from "chamfer/light";
import {
	ChunkRenderer,
	NoWebGPUError,
	createGpuContext,
	resizeToDisplay,
} from "chamfer/render";

const RADIUS = 1700;
const DEPTH = 11;
const CHUNK_LEVEL = 6;
const COARSE_LEVEL = 7;
const MAX_ELEVATION = 150;

/**
 * How many times its own width a chunk has to be away before it drops a level.
 *
 * The worst altitude is around 60 m, where near and far chunks are both in
 * view: 321 chunks at 2, 471 at 2.5 and 633 at 3.
 */
const DETAIL = 2;

const MIN_ALTITUDE = 2;
const MAX_ALTITUDE = RADIUS * 3;

/** How deep a chunk's rim hangs, in its own cells. */
const SKIRT_CELLS = 2;

/** How many screenfuls of ground a drag across the whole window travels. */
const DRAG_SCREENS = 2.5;

/**
 * How long a day runs, in seconds.
 *
 * The line between day and night crosses the ground at one circumference a day,
 * which is 1.4 m/s -- a walking pace -- for a day of 2.12 hours. Below that a
 * player outruns the sun. This one is short enough to watch.
 */
const DAY_LENGTH = 240;

/** The light a surface keeps after dark. */
const NIGHT_LIGHT = 0.09;

/** The sky, in daylight and at night. */
const DAY_SKY: readonly [number, number, number] = [0.46, 0.62, 0.82];
const NIGHT_SKY: readonly [number, number, number] = [0.02, 0.03, 0.06];

/** How many chunks are built per frame, so the page keeps drawing while it fills. */
const BUILD_PER_FRAME = 1;

/** The color the view fades toward under water, and over what distance. */
const WATER_FOG: readonly [number, number, number, number] = [
	0.05, 0.16, 0.28, 34,
];

/** Far enough that the fog term leaves the color alone. */
const CLEAR_AIR = 1e9;

const canvas = document.querySelector<HTMLCanvasElement>("#viewport")!;
const status = document.querySelector<HTMLDivElement>("#status")!;

const params = new URLSearchParams(location.search);
const seedText = params.get("seed") ?? "chamfer";

function report(lines: string[]): void {
	status.textContent = lines.join("\n");
}

/** Let the browser paint before a long synchronous stretch. */
function paint(): Promise<void> {
	return new Promise((resolve) => {
		requestAnimationFrame(() => {
			resolve();
		});
	});
}

async function main(): Promise<void> {
	const ctx = await createGpuContext(canvas);
	const renderer = new ChunkRenderer(ctx);

	report([`seed "${seedText}"`, "routing rivers across the planet..."]);
	await paint();

	const seed = seedFromString(seedText);
	const shape = new WorldShape(
		RADIUS,
		DEPTH,
		MAX_ELEVATION,
		maxCrustDepth(DEPTH),
	);
	const map = buildCoarseMap(seed, { level: COARSE_LEVEL });
	const atlas = new ChunkAtlas(DEPTH, CHUNK_LEVEL);

	// One generator per level. A chunk one level coarser samples the terrain at
	// twice the spacing over four times the area, so it holds the same 561 slots
	// and there are four times fewer of them.
	const byLod: TerrainGenerator[] = [];
	for (let lod = 0; lod <= CHUNK_LEVEL; lod++)
		byLod.push(new TerrainGenerator(seed, shape.atLod(lod), map));
	const terrain = byLod[0]!;

	// The camera looks at a point on the surface from a little behind and above
	// it. Both the point and the height are what dragging and scrolling move.
	//
	// The opening view is high ground, found from the coarse map alone: three
	// array reads a chunk against a noise evaluation, which is 27 ms over the
	// whole planet instead of a second.
	let ground = new Vec3(
		atlas.extents[0]!.x,
		atlas.extents[0]!.y,
		atlas.extents[0]!.z,
	);
	let highest = -Infinity;
	for (const extent of atlas.extents) {
		const there = new Vec3(extent.x, extent.y, extent.z);
		const cell = positionToCell(there, shape.n);
		const above =
			map.heightAt(cell.face, cell.i, cell.j, DEPTH) - map.seaLevel;
		if (above > highest) {
			highest = above;
			ground = there;
		}
		if (above > 0.25) break;
	}
	let altitude = 5;
	let behind = 0.02;

	const meshed = new Map<number, ChunkMesh>();
	const queue: ChunkSelection[] = [];

	/**
	 * One number for a chunk at one level.
	 *
	 * A key only names a triangle within its own level, so the level has to
	 * travel with it: the same key at two levels is two different triangles.
	 */
	const idOf = (selection: { chunkLevel: number; key: number }) =>
		selection.chunkLevel * 0x100000 + selection.key;

	/** Choose what should be drawn, and queue what is missing. */
	function refresh(): void {
		const wanted = selectChunks(
			DEPTH,
			CHUNK_LEVEL,
			ground,
			RADIUS + altitude,
			RADIUS,
			DETAIL,
		);
		const keep = new Set(wanted.map(idOf));
		for (const id of [...meshed.keys()])
			if (!keep.has(id)) {
				meshed.delete(id);
				renderer.drop(id);
			}
		queue.length = 0;
		for (const selection of wanted)
			if (!meshed.has(idOf(selection))) queue.push(selection);
	}

	/** Generate and mesh one chunk, at the level it was selected for. */
	function build(selection: ChunkSelection): void {
		const at = shape.atLod(selection.lod);
		const generator = byLod[selection.lod]!;
		const chunk = generateChunk(
			generator,
			ChunkAddress.fromKey(selection.key, selection.chunkLevel),
			selection.chunkLevel,
			at.crustDepth,
		);
		const mesh = buildChunkMesh(
			chunk,
			new ChunkColumnSampler(chunk, generator),
			at,
			seed,
			{ skirtCells: SKIRT_CELLS },
		);
		meshed.set(idOf(selection), mesh);
		renderer.upload({ ...mesh, key: idOf(selection) });
	}

	refresh();

	let dragging = false;
	let lastX = 0;
	let lastY = 0;

	canvas.addEventListener("pointerdown", (e) => {
		dragging = true;
		lastX = e.clientX;
		lastY = e.clientY;
		canvas.setPointerCapture(e.pointerId);
	});
	canvas.addEventListener("pointerup", (e) => {
		dragging = false;
		canvas.releasePointerCapture(e.pointerId);
	});
	canvas.addEventListener("pointermove", (e) => {
		if (!dragging) return;
		// Dragging turns the look-at point around the planet's centre, so the
		// step is an angle. `behind` is how far back the camera sits in the same
		// angle, and the view spans a small multiple of it, so a drag across the
		// window travels about a screenful of ground at any height.
		const perPixel = (behind * DRAG_SCREENS) / viewHeight();
		const east = worldUp(ground).cross(ground).normalize();
		const north = ground.cross(east).normalize();
		ground = ground
			.add(east.scale(-(e.clientX - lastX) * perPixel))
			.add(north.scale((e.clientY - lastY) * perPixel))
			.normalize();
		lastX = e.clientX;
		lastY = e.clientY;
		refresh();
	});
	canvas.addEventListener(
		"wheel",
		(e) => {
			e.preventDefault();
			altitude = Math.max(
				MIN_ALTITUDE,
				Math.min(MAX_ALTITUDE, altitude * (1 + e.deltaY * 0.0015)),
			);
			behind = Math.min(0.5, 0.008 + altitude * 0.0024);
			refresh();
		},
		{ passive: false },
	);

	const started = performance.now();
	const draw = (now: number) => {
		for (let n = 0; n < BUILD_PER_FRAME; n++) {
			const next = queue.shift();
			if (next === undefined) break;
			build(next);
		}

		resizeToDisplay(ctx);

		// Behind and above the look-at point, along the surface.
		const east = worldUp(ground).cross(ground).normalize();
		const north = ground.cross(east).normalize();
		const from = ground
			.add(north.scale(-behind))
			.normalize()
			.scale(RADIUS + altitude);
		const target = ground.scale(RADIUS + altitude * 0.15);

		const eye: [number, number, number] = [from.x, from.y, from.z];
		const view = Mat4.lookAt(
			eye,
			[target.x, target.y, target.z],
			[ground.x, ground.y, ground.z],
		);
		const projection = Mat4.perspective(
			(60 * Math.PI) / 180,
			canvas.width / canvas.height,
			Math.max(0.5, altitude * 0.02),
			RADIUS * 20,
		);

		// The sun turns about the planet's own polar axis, and how lit a place is
		// comes from one dot product against its own up.
		const sun = sunDirection(
			((now - started) / 1000 / DAY_LENGTH) % 1,
			NORTH,
		);
		const day = daylight(ground.x, ground.y, ground.z, sun.x, sun.y, sun.z);

		const submerged = terrain.blockAtPosition(from) === BlockType.WATER;
		renderer.sky = submerged
			? mix(NIGHT_SKY, [0.05, 0.16, 0.28], day)
			: mix(NIGHT_SKY, DAY_SKY, day);
		renderer.render({
			viewProj: projection.multiply(view),
			eye,
			sun: [sun.x, sun.y, sun.z],
			fog: submerged
				? WATER_FOG
				: [WATER_FOG[0], WATER_FOG[1], WATER_FOG[2], CLEAR_AIR],
			daylight: day,
			nightLight: NIGHT_LIGHT,
		});

		report([
			`seed "${seedText}"`,
			`${height(altitude)} up · ${renderer.count} chunks` +
				(queue.length > 0 ? ` · ${queue.length} to build` : ""),
			submerged
				? "under water"
				: `${clock(day)} · drag to travel · scroll for height`,
		]);
		requestAnimationFrame(draw);
	};
	requestAnimationFrame(draw);
}

/**
 * The window's height in the units a pointer event reports.
 *
 * Pointer coordinates are CSS pixels and the canvas is sized in device pixels,
 * so on a display that draws two device pixels per CSS pixel the two differ by
 * a factor of two.
 */
function viewHeight(): number {
	return Math.max(1, canvas.clientHeight);
}

/** An altitude, in whichever unit reads better. */
function height(metres: number): string {
	return metres < 1000
		? `${metres.toFixed(metres < 20 ? 1 : 0)} m`
		: `${(metres / 1000).toFixed(1)} km`;
}

/** Blend two colors. */
function mix(
	a: readonly [number, number, number],
	b: readonly [number, number, number],
	by: number,
): [number, number, number] {
	return [
		a[0] + (b[0] - a[0]) * by,
		a[1] + (b[1] - a[1]) * by,
		a[2] + (b[2] - a[2]) * by,
	];
}

/** What to call the light where the camera is standing. */
function clock(day: number): string {
	if (day > 0.85) return "day";
	if (day > 0.15) return "twilight";
	return "night";
}

/** Any direction that is not parallel to `up`, for building a local frame. */
function worldUp(up: Vec3): Vec3 {
	return Math.abs(up.y) > 0.9 ? new Vec3(1, 0, 0) : new Vec3(0, 1, 0);
}

main().catch((err: unknown) => {
	if (err instanceof NoWebGPUError) report([err.message]);
	else report(["Something went wrong starting the renderer.", String(err)]);
});
