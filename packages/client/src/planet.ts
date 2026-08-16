import type { ChunkMesh } from "chamfer/mesh";
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
	residentChunks,
	seedFromString,
} from "chamfer/generation";
import { buildChunkMesh } from "chamfer/mesh";
import { positionToCell } from "chamfer/addressing";
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
 * How many chunks are held at once, and how high the camera may go.
 *
 * The horizon grows fast: 72 chunks at eye height, 260 at 8 m up, 1,127 at
 * 40 m and 2,120 at 80 m. A chunk takes 14 ms to build, so the ceiling is
 * where the horizon still fits in the budget rather than an arbitrary number.
 * Height above that needs distant chunks at a coarser level, which is what LOD
 * buys and what Project 10 adds.
 */
const CHUNK_BUDGET = 340;
const MIN_ALTITUDE = 2;
const MAX_ALTITUDE = 10;

/** How many chunks are built per frame, so the page keeps drawing while it fills. */
const MESH_PER_FRAME = 1;

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
	const terrain = new TerrainGenerator(seed, shape, map);
	const atlas = new ChunkAtlas(DEPTH, CHUNK_LEVEL);

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
	const queue: number[] = [];

	/** Choose what should be resident, and queue what is missing. */
	function refresh(): void {
		const eyeRadius = RADIUS + altitude;
		const wanted = residentChunks(
			atlas,
			ground,
			eyeRadius,
			RADIUS,
			CHUNK_BUDGET,
		);
		const keep = new Set(wanted);
		for (const key of [...meshed.keys()])
			if (!keep.has(key)) {
				meshed.delete(key);
				renderer.drop(key);
			}
		queue.length = 0;
		for (const key of wanted) if (!meshed.has(key)) queue.push(key);
	}

	/** Generate and mesh one chunk. */
	function build(key: number): void {
		const chunk = generateChunk(
			terrain,
			ChunkAddress.fromKey(key, CHUNK_LEVEL),
			CHUNK_LEVEL,
			shape.crustDepth,
		);
		const mesh = buildChunkMesh(
			chunk,
			new ChunkColumnSampler(chunk, terrain),
			shape,
			seed,
		);
		meshed.set(key, mesh);
		renderer.upload(mesh);
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
		// Turning the look-at point moves it across the surface. The step scales
		// with altitude, so the ground travels at about the same speed on screen
		// whatever height the camera is at.
		const step = (0.00002 * altitude + 0.00004) * 1.5;
		const east = worldUp(ground).cross(ground).normalize();
		const north = ground.cross(east).normalize();
		ground = ground
			.add(east.scale(-(e.clientX - lastX) * step * RADIUS))
			.add(north.scale((e.clientY - lastY) * step * RADIUS))
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
				Math.min(MAX_ALTITUDE, altitude * (1 + e.deltaY * 0.001)),
			);
			behind = 0.008 + altitude * 0.0024;
			refresh();
		},
		{ passive: false },
	);

	const draw = () => {
		for (let n = 0; n < MESH_PER_FRAME; n++) {
			const key = queue.shift();
			if (key === undefined) break;
			build(key);
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
			0.5,
			RADIUS * 8,
		);

		const submerged = terrain.blockAtPosition(from) === BlockType.WATER;
		renderer.sky = submerged ? [0.05, 0.16, 0.28] : [0.46, 0.62, 0.82];
		renderer.render({
			viewProj: projection.multiply(view),
			eye,
			sun: SUN,
			fog: submerged
				? WATER_FOG
				: [WATER_FOG[0], WATER_FOG[1], WATER_FOG[2], CLEAR_AIR],
		});

		report([
			`seed "${seedText}"`,
			`${altitude.toFixed(1)} m up · ${renderer.count} chunks` +
				(queue.length > 0 ? ` · ${queue.length} to build` : ""),
			submerged ? "under water" : "drag to travel · scroll for height",
			altitude >= MAX_ALTITUDE
				? `${MAX_ALTITUDE} m is the ceiling until LOD lands`
				: "",
		]);
		requestAnimationFrame(draw);
	};
	requestAnimationFrame(draw);
}

/** A fixed sun, until Project 12 turns it. */
const SUN: readonly [number, number, number] = ((): [
	number,
	number,
	number,
] => {
	const v = new Vec3(0.45, 0.75, 0.5).normalize();
	return [v.x, v.y, v.z];
})();

/** Any direction that is not parallel to `up`, for building a local frame. */
function worldUp(up: Vec3): Vec3 {
	return Math.abs(up.y) > 0.9 ? new Vec3(1, 0, 0) : new Vec3(0, 1, 0);
}

main().catch((err: unknown) => {
	if (err instanceof NoWebGPUError) report([err.message]);
	else report(["Something went wrong starting the renderer.", String(err)]);
});
