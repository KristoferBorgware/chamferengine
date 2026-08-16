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
import { Player } from "chamfer/player";
import { NORTH } from "chamfer/addressing";
import { daylight, sunDirection, terminatorSpeed } from "chamfer/light";
import {
	ChunkRenderer,
	NoWebGPUError,
	SkyRenderer,
	createGpuContext,
	resizeToDisplay,
} from "chamfer/render";
import {
	CloudField,
	WIND_AXIS,
	WIND_RATE,
	buildCloudMesh,
	windRotation,
} from "chamfer/sky";

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

/** How deep a chunk's rim hangs, in its own cells. */
const SKIRT_CELLS = 2;

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

/**
 * The clouds: what level their hexagons come from and how high they sit.
 *
 * Level 5 is a 64 m puff and 10,242 points for the whole sky, against
 * 41,943,042 cells in one surface layer.
 */
const CLOUD_LEVEL = 5;
const CLOUD_HEIGHT = 220;

/** How often the cloud buffer is thrown away and refilled, in seconds. */
const CLOUD_INTERVAL = 0.7;

/**
 * The moon, as an angle and a distance.
 *
 * Its size is an art decision -- a faithfully scaled real moon is still 0.518
 * degrees, because scaling preserves angles. Its distance is not: at this one,
 * walking to the far side of the planet shifts it 1.90 degrees against the
 * stars, which is why it is placed rather than painted into the sky.
 */
const MOON_ANGULAR_RADIUS = (0.6 * Math.PI) / 180;
const MOON_DISTANCE = 102_000;

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
	const clouds = new CloudField(CLOUD_LEVEL);
	const sky = new SkyRenderer(ctx, {
		direction: new Vec3(0.2, 0.55, 0.81).normalize(),
		angularRadius: MOON_ANGULAR_RADIUS,
	});
	sky.surfaceRadius = RADIUS;
	renderer.layer = sky;

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
	// The player carries a heading along the ground rather than measuring one
	// against a fixed axis. There is no fixed axis to measure against: a
	// continuous field of directions over a whole sphere has to stop somewhere,
	// and a frame built from a reference direction spins where that happens.
	const player = new Player(
		shape,
		ground.scale(RADIUS + MAX_ELEVATION),
		ground.cross(new Vec3(0, 1, 0)).normalize(),
	);
	let flying = true;
	let chase = 6;

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
			player.position,
			player.position.length(),
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

	const held = new Set<string>();
	window.addEventListener("keydown", (e) => {
		const key = e.key.toLowerCase();
		held.add(key);
		if (key === "f") flying = !flying;
		if (key === " ") e.preventDefault();
	});
	window.addEventListener("keyup", (e) => {
		held.delete(e.key.toLowerCase());
	});

	let dragging = false;
	let lastX = 0;
	let lastY = 0;
	let swing = 0;
	let tilt = 0;

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
		// Looking is an angle a pixel, and half a window turns a quarter circle.
		const perPixel = Math.PI / (2 * viewHeight());
		swing -= (e.clientX - lastX) * perPixel;
		tilt -= (e.clientY - lastY) * perPixel;
		lastX = e.clientX;
		lastY = e.clientY;
	});
	canvas.addEventListener(
		"wheel",
		(e) => {
			e.preventDefault();
			chase = Math.max(0, Math.min(60, chase + e.deltaY * 0.02));
		},
		{ passive: false },
	);

	const started = performance.now();
	let previous = started;
	let cloudsAt = -CLOUD_INTERVAL * 1000;
	const draw = (now: number) => {
		for (let n = 0; n < BUILD_PER_FRAME; n++) {
			const next = queue.shift();
			if (next === undefined) break;
			build(next);
		}

		resizeToDisplay(ctx);

		const seconds = Math.min(0.1, (now - previous) / 1000);
		previous = now;
		const ahead =
			(held.has("w") || held.has("arrowup") ? 1 : 0) -
			(held.has("s") || held.has("arrowdown") ? 1 : 0);
		const aside =
			(held.has("d") || held.has("arrowright") ? 1 : 0) -
			(held.has("a") || held.has("arrowleft") ? 1 : 0);
		const lift = (held.has(" ") ? 1 : 0) - (held.has("shift") ? 1 : 0);
		player.step(
			{
				ahead,
				aside,
				turn: swing,
				pitch: tilt,
				lift,
				flying,
			},
			seconds,
			terrain,
		);
		swing = 0;
		tilt = 0;
		if (ahead !== 0 || aside !== 0 || lift !== 0) refresh();

		// Behind the player, along the ground they are standing on.
		const up = player.up;
		const look = player.heading
			.scale(Math.cos(player.pitch))
			.add(up.scale(Math.sin(player.pitch)))
			.normalize();
		const from =
			chase < 0.5
				? player.eye
				: player.eye.sub(look.scale(chase)).add(up.scale(chase * 0.35));
		const target = player.eye.add(look.scale(50));

		const eye: [number, number, number] = [from.x, from.y, from.z];
		const view = Mat4.lookAt(
			eye,
			[target.x, target.y, target.z],
			[up.x, up.y, up.z],
		);
		const projection = Mat4.perspective(
			(65 * Math.PI) / 180,
			canvas.width / canvas.height,
			Math.max(0.2, player.altitude * 0.01),
			RADIUS * 20,
		);

		// The sun turns about the planet's own polar axis, and how lit a place is
		// comes from one dot product against its own up.
		const sun = sunDirection(
			((now - started) / 1000 / DAY_LENGTH) % 1,
			NORTH,
		);
		const day = daylight(ground.x, ground.y, ground.z, sun.x, sun.y, sun.z);

		// The clouds are thrown away and refilled as the wind turns. There is no
		// address to update in place, because a cloud has none.
		if (now - cloudsAt > CLOUD_INTERVAL * 1000) {
			cloudsAt = now;
			const turned = ((now - started) / 1000) * WIND_RATE * 2 * Math.PI;
			clouds.blow(WIND_AXIS, turned, seed);
			const mesh = buildCloudMesh(clouds, RADIUS + CLOUD_HEIGHT);
			sky.setClouds(mesh.vertices, mesh.indices);
		}

		// The moon stands off at a distance rather than being painted on, so
		// walking round the planet shifts it against the stars.
		const moonPlace = windRotation(
			new Vec3(0.2, 0.55, 0.81).normalize(),
			NORTH,
			((now - started) / 1000 / (DAY_LENGTH * 1.35)) * 2 * Math.PI,
		).scale(MOON_DISTANCE);
		sky.moon = {
			direction: moonPlace.sub(from).normalize(),
			angularRadius: MOON_ANGULAR_RADIUS,
		};

		const submerged = terrain.blockAtPosition(from) === BlockType.WATER;
		renderer.sky = submerged
			? mix(NIGHT_SKY, [0.05, 0.16, 0.28], day)
			: mix(NIGHT_SKY, DAY_SKY, day);
		const viewProj = projection.multiply(view);
		sky.inverseViewProj = viewProj.inverse();
		renderer.render({
			viewProj,
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
			`${height(player.altitude)} · ${renderer.count} chunks` +
				(queue.length > 0 ? ` · ${queue.length} to build` : ""),
			`${clock(day)} · ${flying ? "flying" : player.swimming(terrain) ? "swimming" : "walking"}` +
				(submerged ? " · under water" : ""),
			"WASD to move · drag to look · F to fly · space and shift for height",
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

main().catch((err: unknown) => {
	if (err instanceof NoWebGPUError) report([err.message]);
	else report(["Something went wrong starting the renderer.", String(err)]);
});
