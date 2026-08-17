import type { ChunkMesh } from "chamfer/mesh";
import type { ChunkSelection } from "chamfer/generation";
import { Mat4, Vec3 } from "chamfer/math";
import {
	BlockType,
	ChunkAtlas,
	TerrainGenerator,
	buildCoarseMap,
	seedFromString,
	selectChunks,
	selectionId,
} from "chamfer/generation";
import { WorkerMeshSource } from "chamfer/mesh";
import { positionToCell } from "chamfer/addressing";
import { Player } from "chamfer/player";
import {
	geographicOf,
	landmarks,
	positionOf,
	shareCode,
} from "chamfer/coordinates";
import { NORTH } from "chamfer/addressing";
import { daylight, sunDirection, terminatorSpeed } from "chamfer/light";
import {
	ChunkRenderer,
	FrameTimer,
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
import { ParameterPanel } from "./ParameterPanel.js";
import { PlanetSettings } from "./PlanetSettings.js";

const params = new URLSearchParams(location.search);

// A world is what the query string says it is, so a link carries one and the
// panel changes one by reloading. Anything absent falls back on the defaults,
// which are the numbers 0.1.0 shipped.
const settings = PlanetSettings.fromParams(params);
const RADIUS = settings.radius;
const DEPTH = settings.depth;
const CHUNK_LEVEL = settings.chunkLevel;
const MAX_ELEVATION = settings.maxElevation;
const seedText = settings.knobs.seed;

/**
 * How many times its own width a chunk has to be away before it drops a level.
 *
 * The worst altitude is around 60 m, where near and far chunks are both in
 * view: 321 chunks at 2, 471 at 2.5 and 633 at 3.
 */
let DETAIL = settings.knobs.detail;

/** How deep a chunk's rim hangs, in its own cells. */
const SKIRT_CELLS = settings.knobs.skirtCells;

/**
 * How long a day runs, in seconds.
 *
 * The line between day and night crosses the ground at one circumference a day,
 * which is 1.4 m/s -- a walking pace -- for a day of 2.12 hours. Below that a
 * player outruns the sun. This one is short enough to watch.
 */
let DAY_LENGTH = settings.knobs.dayLength;

/** The light a surface keeps after dark. */
const NIGHT_LIGHT = 0.09;

/**
 * The clouds: what level their hexagons come from and how high they sit.
 *
 * Level 5 is a 64 m puff and 10,242 points for the whole sky, against
 * 41,943,042 cells in one surface layer.
 */
const CLOUD_LEVEL = settings.cloudLevel;
let CLOUD_HEIGHT = settings.knobs.lowDeck;

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

/**
 * How many chunks may be in flight at once, and how many workers share them.
 *
 * Building a chunk is longer than a frame at the worked planet's settings, so
 * it happens on other threads and the frame only uploads what came back. One
 * core is left for the thread that draws.
 */
const WORKERS = Math.max(
	1,
	Math.min(8, (navigator.hardwareConcurrency ?? 4) - 1),
);

/** How many finished meshes are uploaded in one frame. */
const UPLOAD_PER_FRAME = 2;

/** The color the view fades toward under water, and over what distance. */
const WATER_FOG: readonly [number, number, number, number] = [
	0.05, 0.16, 0.28, 34,
];

/** Far enough that the fog term leaves the color alone. */
const CLEAR_AIR = 1e9;

const canvas = document.querySelector<HTMLCanvasElement>("#viewport")!;
const status = document.querySelector<HTMLDivElement>("#status")!;

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

/**
 * What a live knob does, once there is a world for it to change.
 *
 * The panel goes up before the device is asked for, so a browser that will not
 * give one still shows the parameters and still lets someone change them and
 * try again. Until the world exists a live knob has nothing to do.
 */
let onLiveKnob: (live: PlanetSettings) => void = () => {};

if (params.get("panel") === "1")
	new ParameterPanel(settings, (live) => {
		onLiveKnob(live);
	});

async function main(): Promise<void> {
	const ctx = await createGpuContext(canvas);
	const renderer = new ChunkRenderer(ctx);

	report([`seed "${seedText}"`, "routing rivers across the planet..."]);
	await paint();

	const seed = seedFromString(seedText);
	const shape = settings.shape();
	const map = buildCoarseMap(seed, settings.coarseOptions());
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
		byLod.push(
			new TerrainGenerator(
				seed,
				shape.atLod(lod),
				map,
				settings.terrainOptions(),
			),
		);
	const terrain = byLod[0]!;

	// The camera looks at a point on the surface from a little behind and above
	// it. Both the point and the height are what dragging and scrolling move.
	//
	// The opening view is high ground, found from the coarse map alone: three
	// array reads a chunk against a noise evaluation, which is 27 ms over the
	// whole planet instead of a second.
	let ground: Vec3 = new Vec3(
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
	const asked = params.get("at");
	if (asked) {
		const [lat, lon] = asked.split(",").map(Number.parseFloat);
		if (lat !== undefined && lon !== undefined && !Number.isNaN(lat))
			ground = positionOf(
				{ latitude: lat, longitude: lon, altitude: 0 },
				1,
			);
	}
	const player = new Player(
		shape,
		ground.scale(RADIUS + MAX_ELEVATION),
		ground.cross(new Vec3(0, 1, 0)).normalize(),
	);
	let flying = true;
	let chase = 6;

	// The twelve pentagons and the two poles, which are two of the twelve.
	const places = landmarks();
	let nextPlace = 0;

	/**
	 * Stand where the camera already is, at the height of someone's eyes.
	 *
	 * A world of one-metre blocks on a 1,700 m planet has nothing in it to
	 * judge scale against from the air. This puts the eye at the one height a
	 * person can read a size from, and points it level, so a hill is a hill
	 * rather than a shape on a map.
	 *
	 * The camera is put there and left there. Nothing walks, nothing falls, and
	 * flight is still on: this is a place to look from, not a way to play.
	 */
	function standHere(): void {
		const direction = player.position.normalize();
		const cell = positionToCell(direction, shape.n);
		const column = terrain.columnAt(cell.face, cell.i, cell.j);
		// The face that is actually drawn, not the radius the height field
		// returned: a surface is the top of a block, so the two differ by up to
		// one block and standing on the second leaves the feet in the air.
		// Whichever of ground and water is higher is the lower layer number.
		const surface = Math.min(column.groundLayer, column.waterLayer);
		player.position = direction.scale(
			shape.radiusOfLayer(Math.max(0, surface)),
		);
		player.fall = 0;
		// Level, not aimed down at the ground. On a planet this small the
		// horizon sits 2.48 degrees below level and 73.7 m away at eye height,
		// and seeing that drop is part of reading the size of the place.
		player.pitch = 0;
		// The eye rather than a camera trailing behind it, or the player's own
		// height is measured from the wrong point.
		chase = 0;
		flying = true;
		refresh();
	}

	/** Put the player on the ground at a direction, clear of it. */
	function land(direction: Vec3): void {
		const cell = positionToCell(direction, shape.n);
		const column = terrain.columnAt(cell.face, cell.i, cell.j);
		player.position = direction
			.normalize()
			.scale(Math.max(column.groundRadius, column.waterRadius) + 1.2);
		player.heading = direction
			.normalize()
			.cross(new Vec3(0, 1, 0))
			.normalize();
		player.fall = 0;
		refresh();
	}

	// Chunks are built on other threads and arrive as geometry. Blocks never
	// cross back: a chunk is 478 KB of them and the thread that draws has no use
	// for any of it, so generating and meshing are one job on the far side.
	const source = new WorkerMeshSource(
		() =>
			new Worker(new URL("./chunkWorker.ts", import.meta.url), {
				type: "module",
			}),
		WORKERS,
		{
			kind: "setup",
			map: map.toSnapshot(),
			seaLevelRadius: RADIUS,
			subdivisionDepth: DEPTH,
			maxElevation: MAX_ELEVATION,
			crustDepth: shape.crustDepth,
			skirtCells: SKIRT_CELLS,
			terrain: settings.terrainOptions(),
		},
	);

	/** What is drawn, what is asked for, and what has come back unuploaded. */
	const drawn = new Set<number>();
	const building = new Set<number>();
	const arrived: ChunkMesh[] = [];
	let wantedNow = 0;

	/** Choose what should be drawn, and ask for what is missing. */
	function refresh(): void {
		const wanted = selectChunks(
			DEPTH,
			CHUNK_LEVEL,
			player.position,
			player.position.length(),
			RADIUS,
			DETAIL,
		);
		wantedNow = wanted.length;
		const keep = new Set(
			wanted.map((selection) =>
				selectionId(selection.chunkLevel, selection.key),
			),
		);
		for (const id of [...drawn])
			if (!keep.has(id)) {
				drawn.delete(id);
				renderer.drop(id);
			}

		for (const selection of wanted) {
			const id = selectionId(selection.chunkLevel, selection.key);
			if (drawn.has(id) || building.has(id)) continue;
			building.add(id);
			source
				.request(selection)
				.then((mesh) => {
					arrived.push(mesh);
				})
				.catch(() => {
					building.delete(id);
				});
		}
	}

	refresh();

	// Refilled on a timer, and again whenever a knob moves the decks.
	let cloudsAt = -CLOUD_INTERVAL * 1000;

	// The bench is already on screen. Hand it what to do with a knob that only
	// changes how the world is drawn; the ones that change what it is reload
	// the page and never reach here.
	onLiveKnob = (live) => {
		DETAIL = live.knobs.detail;
		DAY_LENGTH = live.knobs.dayLength;
		CLOUD_HEIGHT = live.knobs.lowDeck;
		cloudsAt = -Infinity;
		refresh();
	};

	const held = new Set<string>();
	window.addEventListener("keydown", (e) => {
		const key = e.key.toLowerCase();
		held.add(key);
		if (key === "f") flying = !flying;
		if (key === "e") standHere();
		if (key === " ") e.preventDefault();
		if (key === "t") {
			// The twelve are 1,882 m apart on this planet, so each is a short
			// journey from the last and none is in sight of another.
			land(places[nextPlace % places.length]!.direction);
			nextPlace++;
		}
		if (key === "g") {
			const typed = prompt(
				"latitude, longitude, altitude",
				"26.6, 36, 40",
			);
			if (!typed) return;
			const [lat, lon, alt] = typed
				.split(/[,\s]+/)
				.map((part) => Number.parseFloat(part));
			if (
				lat === undefined ||
				lon === undefined ||
				Number.isNaN(lat) ||
				Number.isNaN(lon)
			)
				return;
			const at = positionOf(
				{ latitude: lat, longitude: lon, altitude: 0 },
				RADIUS,
			);
			land(at);
			if (alt !== undefined && !Number.isNaN(alt))
				player.position = player.position
					.normalize()
					.scale(RADIUS + alt);
		}
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
	const timer = new FrameTimer();
	const draw = (now: number) => {
		timer.begin(now);

		// Meshes that finished on a worker go to the GPU here, a couple a frame,
		// so a burst of arrivals does not turn into one long frame.
		timer.enter("upload", performance.now());
		for (let n = 0; n < UPLOAD_PER_FRAME; n++) {
			const mesh = arrived.shift();
			if (!mesh) break;
			building.delete(mesh.key);
			drawn.add(mesh.key);
			renderer.upload(mesh);
		}
		timer.leave("upload", performance.now());

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
		timer.enter("player", performance.now());
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
		timer.leave("player", performance.now());
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
			timer.enter("clouds", performance.now());
			cloudsAt = now;
			const turned = ((now - started) / 1000) * WIND_RATE * 2 * Math.PI;
			clouds.blow(WIND_AXIS, turned, seed);
			const mesh = buildCloudMesh(clouds, RADIUS + CLOUD_HEIGHT);
			sky.setClouds(mesh.vertices, mesh.indices);
			timer.leave("clouds", performance.now());
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
		timer.enter("draw", performance.now());
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
		timer.leave("draw", performance.now());

		const at = geographicOf(player.position, RADIUS);
		const cell = positionToCell(player.position, shape.n);
		report([
			`seed "${seedText}"`,
			`${degrees(at.latitude, "NS")} ${degrees(at.longitude, "EW")} · ${height(at.altitude)}`,
			`${shareCode({ planet: 0, face: cell.face, i: cell.i, j: cell.j, layer: Math.max(0, Math.min(shape.crustDepth - 1, shape.layerOfRadius(player.position.length()))) }, DEPTH)} · ${renderer.drawn} of ${renderer.count} chunks drawn, ${wantedNow} held` +
				(building.size > 0 ? ` · ${building.size} building` : ""),
			`${clock(day)} · ${flying ? "flying" : player.swimming(terrain) ? "swimming" : "walking"}` +
				(submerged ? " · under water" : ""),
			budget(timer, renderer),
			"WASD move · drag look · E eye level · F fly · T next pentagon · G go to",
		]);
		timer.end(performance.now());
		requestAnimationFrame(draw);
	};
	requestAnimationFrame(draw);
}

/**
 * The frame, against the 16.6 ms a 60 Hz display allows.
 *
 * The worst frame in the window is reported beside the middle one, because a
 * mean hides the stutter that ruins a run: sixty good frames and one 40 ms
 * frame average out to fine and do not feel it.
 *
 * The GPU figure is what the adapter says the pass took, which is a different
 * question from how long it took to describe. Adapters that will not answer
 * report nothing rather than a guess.
 */
function budget(timer: FrameTimer, renderer: ChunkRenderer): string {
	const frame = timer.frame();
	const phases = timer
		.byCost()
		.filter((entry) => entry.median >= 0.05)
		.map((entry) => `${entry.phase} ${entry.median.toFixed(1)}`)
		.join(" · ");
	const gpu =
		renderer.clock.readings > 0
			? ` · gpu ${renderer.clock.milliseconds.toFixed(1)}`
			: "";
	return `${frame.rate.toFixed(0)} fps · ${frame.median.toFixed(1)} ms, worst ${frame.worst.toFixed(1)}${gpu}${phases ? ` · ${phases}` : ""}`;
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

/** An angle, the way a coordinate is read out. */
function degrees(value: number, poles: string): string {
	const side = poles[value >= 0 ? 0 : 1]!;
	return `${Math.abs(value).toFixed(2)}\u00b0${side}`;
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
