import type { ChunkMesh } from "chamfer/mesh";
import type { ChunkSelection, CoarseMap } from "chamfer/generation";
import type { WorldShape } from "chamfer/world";
import { Frustum, Mat4, Vec3 } from "chamfer/math";
import {
	BLOCK_NAMES,
	BlockType,
	ChunkAddress,
	TerrainGenerator,
	ChunkPeaks,
	addressesOverlap,
	buildCoarseMap,
	chunkCenter,
	flatCoarseMap,
	horizonAngle,
	isBreakable,
	seedFromString,
	selectChunks,
	selectionId,
	selectionOf,
} from "chamfer/generation";
import { WorkerMeshSource } from "chamfer/mesh";
import type { CellRef } from "chamfer/edit";
import {
	DeltaStore,
	STORE_VERSION,
	packBlockState,
	typeOf,
	worldKey,
} from "chamfer/edit";
import type { RayWorld } from "chamfer/addressing";
import { cellCorners, positionToCell, rayWalk } from "chamfer/addressing";
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
	AimRenderer,
	BillboardClouds,
	ChunkRenderer,
	FrameTimer,
	MarkerRenderer,
	NoWebGPUError,
	SEA_COLORS,
	SeaRenderer,
	SkyRenderer,
	createGpuContext,
	resizeToDisplay,
} from "chamfer/render";
import type { SeaLook } from "chamfer/render";
import type { CloudPuffLayer } from "chamfer/sky";
import {
	WIND_AXIS,
	WIND_RATE,
	planetAtmosphere,
	windRotation,
} from "chamfer/sky";
import { MapPanel } from "./MapPanel.js";
import { ParameterPanel } from "./ParameterPanel.js";
import { TouchControls } from "./TouchControls.js";
import { EditDb } from "./EditDb.js";
import { FLAT_COARSE_LEVEL, PlanetSettings } from "./PlanetSettings.js";

const params = new URLSearchParams(location.search);

// A world is what the query string says it is, so a link carries one and the
// panel changes one by reloading. Anything absent falls back on the defaults,
// which are the numbers 0.1.0 shipped.
const settings = PlanetSettings.fromParams(params);
const RADIUS = settings.radius;
const DEPTH = settings.depth;
const CHUNK_LEVEL = settings.chunkLevel;

/**
 * How far from the equator a world may open, in degrees.
 *
 * Wide enough that every seed has land inside it -- the twelve pentagons sit at
 * a latitude of 26.6 degrees and at the two poles, so this band holds ten of
 * them and neither pole.
 */
const SPAWN_LATITUDE = 30;
const seedText = settings.knobs.seed;

/**
 * How many times its own width a chunk has to be away before it drops a level.
 *
 * A live knob, starting at the same figure `selectChunks` defaults to.
 */
let DETAIL = settings.knobs.detail;

/** Whether the selection refuses a chunk the view does not reach. */
let CULL_BUILD = settings.knobs.buildCull;

/**
 * How far past the edge of the view a chunk is still built for, as metres of
 * slack per metre of distance.
 *
 * A tangent rather than the angle itself, because what the selection widens is
 * a sphere's radius: at 25 degrees a chunk 100 m away is kept if it comes
 * within 47 m of the edge of the screen, and one 1 km away within 470 m.
 */
let CULL_SLACK = Math.tan((settings.knobs.cullMargin * Math.PI) / 180);

/**
 * Whether the world is held down to its lattice and nothing else.
 *
 * Read once, here, rather than per frame: everything it pauses is either not
 * constructed at all or answered by a constant, so there is nothing for the
 * frame loop to keep asking.
 */
const PLAIN = settings.knobs.plain;

/** Whether a chunk draws the ring of cells just beyond its rim. */
const APRON = settings.knobs.apron;

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

/** How far a player can reach to break or place a block, in blocks. */
const REACH = 6;

/** The color the outline over the aimed-at cell is drawn in. */
const AIM_COLOR: [number, number, number] = [0.98, 0.86, 0.35];

/**
 * The block types a click may place, which is every solid one a player can put
 * back. Bedrock is not among them: it is the floor of the world.
 */
const PLACEABLE: readonly BlockType[] = [
	BlockType.STONE,
	BlockType.DIRT,
	BlockType.GRASS,
	BlockType.SAND,
	BlockType.SNOW,
];

/** The color the view fades toward under water, and over what distance. */
const WATER_FOG: readonly [number, number, number, number] = [
	0.05, 0.16, 0.28, 34,
];

/** Far enough that the fog term leaves the color alone. */
const CLEAR_AIR = 1e9;

/**
 * How often the status readout is rebuilt, in milliseconds.
 *
 * It is prose for a person, and a person reads a line of it a few times a
 * second at most. Rebuilding it every frame made it the most expensive named
 * thing on the thread that draws.
 */
const REPORT_INTERVAL = 100;

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
/**
 * The settings as they stand right now, which is not the ones the page loaded
 * with.
 *
 * A knob that only changes how the world is drawn takes effect without a
 * rebuild, and the panel hands the whole draft to {@link onLiveKnob} when one
 * moves. Anything the frame reads has to read it from **here**: reading the
 * loaded \`settings\` instead is how a row ends up doing nothing at all in the
 * panel while still working from a query string, which is the hardest kind of
 * dead control to notice.
 */
let current = settings;

let onLiveKnob: (live: PlanetSettings) => void = () => {};

/**
 * What **Live rebuild** does, once there is a world to rebuild.
 *
 * Set once the terrain and the chunk pipeline exist, same as
 * {@link onLiveKnob}; before that a checkbox with nothing to flush is a
 * checkbox that does nothing, which is correct.
 */
let onLiveRebuild: (live: PlanetSettings) => void = () => {};

/**
 * Editor mode.
 *
 * `?panel=1` turns it on, and it carries panes that show and hide on their own
 * heads: the world knobs, and the maps. A pane is open because it is being
 * used, not because the mode is on.
 *
 * The map pane draws the maps while they are still being built and never
 * touches the terrain. **Apply** is what rebuilds the world, and it does that
 * the way every knob used to: by reloading with the settings in the query
 * string, which is the one path that rebuilds the device, the map and every
 * chunk together.
 */
let onPlayerMoved: (up: { x: number; y: number; z: number }) => void = () => {};

/** Stand somewhere, once there is a world to stand in. */
let onGoTo: (at: { x: number; y: number; z: number }) => void = () => {};

/**
 * Everything holding a thread, to be given up when this page goes away.
 *
 * **A page leaving the screen is not a page whose workers have gone.** The
 * browser may keep it whole and frozen so that going back is instant, and a
 * worker held with it keeps its own heap and its own thread for as long as the
 * tab lives. Every rebuild is a fresh load of this page through
 * `location.href`, so a pool that is not given up here is a pool that is still
 * there after the next one starts: a trace of one session carried **48** chunk
 * workers against the 8 this build asks for, and 6 map workers against 1, none
 * of them doing any work and all of them still holding memory.
 */
const teardown: (() => void)[] = [];
window.addEventListener("pagehide", () => {
	for (const give of teardown) give();
	teardown.length = 0;
});

if (params.get("panel") === "1") {
	const maps = new MapPanel(
		settings,
		(chosen) => {
			const wanted = chosen.toParams();
			wanted.set("panel", "1");
			location.href = `${location.pathname}?${wanted.toString()}`;
		},
		(at) => onGoTo(at),
	);
	const panel = new ParameterPanel(
		settings,
		(live) => {
			onLiveKnob(live);
		},
		(draft) => maps.changed(draft),
		(live) => onLiveRebuild(live),
	);
	// The knobs that decide where the land is live under the map they decide,
	// not in a panel on the other side of the screen. The seed goes with them:
	// it is the one word that re-rolls a world, and hunting for a world is
	// done looking at the map. It still seeds the clouds as well as the ground.
	maps.hostKnobs(panel.section("Seed"));
	maps.hostKnobs(panel.section("Terrain"));
	maps.hostKnobs(panel.section("Mountains"));
	maps.hostKnobs(panel.section("Land"));
	maps.hostKnobs(panel.section("Sea"));
	// Erosion changes the map and nothing else, and the map is the picture of
	// what it did, so its rows live under that picture with the rest.
	maps.hostKnobs(panel.section("Erosion"));
	onPlayerMoved = (up) => maps.setPlayer(up);
	teardown.push(() => maps.dispose());
}

async function main(): Promise<void> {
	const ctx = await createGpuContext(canvas);
	const renderer = new ChunkRenderer(ctx);

	report([
		`seed "${seedText}"`,
		settings.coarseMapRuns
			? "routing rivers across the planet..."
			: "the coarse map is off...",
	]);
	await paint();

	const seed = seedFromString(seedText);
	// **Reassignable, all four.** Live rebuild replaces the map and derives
	// everything below from it again; nothing else in this function -- the
	// device, the renderer, the address width -- changes with it, which is
	// the boundary that makes replacing them without a reload safe at all.
	let map = settings.coarseMapRuns
		? buildCoarseMap(seed, settings.coarseOptions())
		: flatCoarseMap(seed, FLAT_COARSE_LEVEL);

	// The crust top is placed at the map's own true peak, not a pre-build
	// guess: a Land setting far from the default shifts sea level a long way,
	// and a guessed crust top too low shears the mountains flat.
	let shape = settings.shapeFor(map);

	// How high the ground reaches under each triangle, so the selection reaches
	// for the ground a chunk actually has rather than for the planet's tallest.
	// The map is the whole of the terrain, so nothing is missing from it and the
	// margin is one block.
	let peaks = new ChunkPeaks(map, settings.knobs.blockSize, CHUNK_LEVEL);

	// The same map, on the GPU, where a fragment walks it toward the sun to
	// find out whether anything stands in the way.
	renderer.shadow.upload(map, shape.seaLevelRadius);

	// Both decks are built on their own worker, off the thread that draws: a
	// deck this size is unaffordable on the main thread, and the field is
	// already a pure function of the seed and the wind angle, so it moves the
	// way chunks moved.
	//
	/**
	 * The two billboard decks a set of knobs describes.
	 *
	 * The high deck's formations are smaller, wider apart and thinner, and it
	 * drifts more slowly, so the two read as two different heights of sky
	 * rather than one pattern drawn twice.
	 */
	function cloudLayers(live: PlanetSettings): CloudPuffLayer[] {
		const k = live.knobs;
		// How much further off the high deck stands. Its puffs are scaled by
		// it, because what a deck reads as from the ground is an angle: a deck
		// twice as far away with puffs the same size draws them half as wide,
		// and shrinking them on top of that -- which is what "a higher deck is
		// finer" would mean -- takes a 45 m puff at 6 km down to 0.43 degrees,
		// narrower than the moon, which reads as grit rather than as cloud.
		// Slightly under the full ratio, so it still reads as the further of
		// the two, and its formations spread less than they grow so it is the
		// denser of the two as well.
		const further = Math.max(1, k.highDeck / Math.max(1, k.lowDeck));
		return [
			{
				radius: shape.crustTopRadius + k.lowDeck,
				windRate: (2 * Math.PI) / 900,
				size: k.cloudPuff,
				spread: k.cloudSpread,
				thickness: k.cloudPuff * 1.1,
			},
			{
				radius: shape.crustTopRadius + k.highDeck,
				windRate: (2 * Math.PI) / 1500,
				size: k.cloudPuff * further * 0.9,
				spread: k.cloudSpread * further * 0.75,
				thickness: k.cloudPuff * further * 0.55,
			},
		];
	}

	// Scattered on the thread that draws rather than on a worker: a whole sky
	// of hexagons is a few tens of milliseconds, which is a knob's worth of
	// wait rather than a frame's.
	const billboardClouds = PLAIN
		? null
		: new BillboardClouds(
				ctx,
				seed,
				settings.knobs.cloudClusters,
				settings.knobs.cloudDensity,
				cloudLayers(settings),
				renderer.cloudShadow,
			);
	if (billboardClouds) {
		billboardClouds.visible = settings.knobs.cloudsDrawn;
		// The clouds are the only moving thing on the planet, so they are the
		// only thing with a shadow the coarse map could never hold.
		renderer.cloudCasters.push(billboardClouds);
	}

	/** What the sea looks like, from the knobs that shape it. */
	function seaLook(live: PlanetSettings): SeaLook {
		const k = live.knobs;
		return {
			waveHeight: k.waveHeight,
			waveScale: k.waveScale,
			waveSpeed: k.waveSpeed,
			chop: k.seaChop,
			foam: k.seaFoam,
			opacity: k.seaOpacity,
			clarity: k.seaClarity,
			glint: k.seaGlint,
			ripple: k.seaRipple,
			grouping: k.seaGrouping,
			// Shallow is the water a look has barely entered, deep is the
			// water it never leaves, and the sky does the horizon. Both come
			// from the engine, because the bench paints the same sea.
			shallow: SEA_COLORS.shallow,
			deep: SEA_COLORS.deep,
		};
	}

	// One shell around the camera rather than a body of blocks. Paused with
	// everything else under the plain planet, which has no sea to draw.
	const sea = PLAIN
		? null
		: new SeaRenderer(
				ctx,
				shape.seaSurfaceRadius,
				DEPTH,
				seaLook(settings),
				renderer.shadow,
				renderer.sunViews,
			);
	if (sea) {
		sea.visible = settings.knobs.seaDrawn;
		sea.wireframe = settings.knobs.seaWireframe;
		teardown.push(() => sea.destroy());
	}

	// The sky is a layer over the terrain pass, and the renderer already treats
	// that layer as optional. Leaving it off is what pauses the atmosphere, the
	// stars and the moon together, without the engine learning what a pause is:
	// with no layer to fill every pixel at the far plane, the clear color the
	// renderer is already given shows through as one flat sky.
	const sky = PLAIN
		? null
		: new SkyRenderer(
				ctx,
				{
					direction: new Vec3(0.2, 0.55, 0.81).normalize(),
					angularRadius: MOON_ANGULAR_RADIUS,
				},
				planetAtmosphere(
					RADIUS,
					settings.knobs.atmosphereTop,
					settings.knobs.zenithDepth,
				),
			);
	// The frozen camera is drawn as an object, after the sky and the clouds so
	// it is never behind either of them. It has nothing to draw until the view
	// is frozen.
	const viewMarker = new MarkerRenderer(ctx);
	// The outline over the cell a click would act on. Last, so it stands over
	// the water as well as the ground: it says where a click goes rather than
	// being a thing that lives in the world.
	const aim = new AimRenderer(ctx);
	renderer.layers = [
		...(sky ? [sky] : []),
		// After the ground, so the water is drawn over the floor it covers,
		// and before the clouds, which are further off than any of it.
		...(sea ? [sea] : []),
		...(billboardClouds ? [billboardClouds] : []),
		viewMarker,
		aim,
	];

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
	let terrain = byLod[0]!;

	// The camera looks at a point on the surface from a little behind and above
	// it. Both the point and the height are what dragging and scrolling move.
	//
	// The opening view is the highest ground **near the equator**, found from
	// the coarse map alone: three array reads a sample against a noise
	// evaluation, which is 27 ms over the whole planet instead of a second.
	//
	// The scan walks triangles at its OWN fixed level, never at the chunk
	// level. It once walked the chunk atlas, whose size follows the Chunk
	// knob at 4x per level: at 8-cell chunks that was 21 million extents
	// built and walked before the first frame -- 73 seconds, spent choosing
	// one spawn point from a map whose cells are 32 m across anyway.
	//
	// Near the equator because a pole is the one place on this planet where
	// the picture lies. An equirectangular map stretches a polar row across
	// its whole width, so a player who starts there cannot find themselves on
	// it; and doc 20 puts an icosahedron vertex at each pole, which is a
	// pentagon and the one cell shape nothing else on the planet has.
	const scanLevel = Math.min(6, CHUNK_LEVEL);
	let ground: Vec3 = new Vec3(0, 0, 1);
	let highest = -Infinity;
	for (let key = 0; key < 20 * 4 ** scanLevel; key++) {
		const extent = chunkCenter(
			ChunkAddress.fromKey(key, scanLevel),
			DEPTH,
			scanLevel,
		);
		const there = new Vec3(extent.x, extent.y, extent.z);
		if (Math.abs(geographicOf(there, 1).latitude) > SPAWN_LATITUDE)
			continue;
		const cell = positionToCell(there, shape.n);
		const above = map.heightAt(cell.face, cell.i, cell.j, DEPTH);
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
		ground.scale(RADIUS + shape.maxElevation),
		ground.cross(new Vec3(0, 1, 0)).normalize(),
		{ walkSpeed: settings.knobs.walkSpeed },
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
			// The grid shell sits at the crust top, wherever the real ground
			// is; standing on the world means standing on what is drawn.
			settings.knobs.gridMode
				? shape.crustTopRadius
				: shape.radiusOfLayer(Math.max(0, surface)),
		);
		player.fall = 0;
		// Level, not aimed down at the ground. On a planet this small the
		// horizon sits 1.34 degrees below level and 159 m away at the 1.86 m
		// the camera stands at, and seeing that drop is part of reading the
		// size of the place.
		player.pitch = 0;
		// The eye rather than a camera trailing behind it, or the player's own
		// height is measured from the wrong point.
		chase = 0;
		flying = true;
		refresh();
	}

	// Right-clicking the ball in the map pane stands the player there. The ball
	// is the only place showing the whole planet at once, so it is the only
	// place somewhere out of sight can be pointed at.
	onGoTo = (at) => land(new Vec3(at.x, at.y, at.z));

	/**
	 * Put the player at a direction, as far over the surface as they are now.
	 *
	 * **Height above the local surface, not the radius.** Somebody looking at
	 * the planet from 2,000 m up wants to arrive still looking at it, and a
	 * radius kept across a teleport would bury them inside the first mountain
	 * taller than the one they left. A standing player keeps standing, because
	 * their height above the ground is already the 1.2 m floor below.
	 */
	function land(direction: Vec3): void {
		const here = positionToCell(player.position, shape.n);
		const from = terrain.columnAt(here.face, here.i, here.j);
		const above =
			player.position.length() -
			Math.max(from.groundRadius, from.waterRadius);

		const cell = positionToCell(direction, shape.n);
		const column = terrain.columnAt(cell.face, cell.i, cell.j);
		player.position = direction
			.normalize()
			.scale(
				Math.max(column.groundRadius, column.waterRadius) +
					Math.max(1.2, above),
			);
		player.heading = direction
			.normalize()
			.cross(new Vec3(0, 1, 0))
			.normalize();
		player.fall = 0;
		refresh();
	}

	/**
	 * The message that hands a chunk worker the map it builds from.
	 *
	 * One function rather than one inline object, because live rebuild sends
	 * this again with a fresh map and the same shape of message: keeping it
	 * one function is what keeps a knob added to the setup message from being
	 * added in one of the two places and not the other.
	 */
	function meshSetup(
		builtMap: CoarseMap,
		builtShape: WorldShape,
		live: PlanetSettings,
	) {
		return {
			kind: "setup" as const,
			map: builtMap.toSnapshot(),
			seaLevelRadius: RADIUS,
			subdivisionDepth: DEPTH,
			maxElevation: builtShape.maxElevation,
			crustDepth: builtShape.crustDepth,
			apron: APRON,
			debugSeams: live.knobs.seamOverlay,
			// The grid: the same selection and the same levels, built as a
			// flat shell of hexagons at the world's highest point.
			grid: live.knobs.gridMode
				? {
						levels: live.knobs.gridLevels,
						cells: live.knobs.gridCells,
						chunks: live.knobs.gridChunks,
						faces: live.knobs.gridFaces,
					}
				: undefined,
			terrain: live.terrainOptions(),
		};
	}

	// Chunks are built on other threads and arrive as geometry. Blocks never
	// cross back: a chunk is 478 KB of them and the thread that draws has no use
	// for any of it, so generating and meshing are one job on the far side.
	let source = new WorkerMeshSource(
		() =>
			new Worker(new URL("./chunkWorker.ts", import.meta.url), {
				type: "module",
			}),
		WORKERS,
		meshSetup(map, shape, settings),
	);
	// The pool is the biggest thing this page holds a thread for: one worker
	// per core, each with the whole terrain generator behind it. Live rebuild
	// replaces it wholesale rather than reconfiguring it in place, because the
	// setup message a worker is given is fixed for its whole life -- the same
	// reason the very first one is built this way.
	teardown.push(() => {
		source.dispose();
	});

	/** What is drawn, what is asked for, and what has come back unuploaded. */
	const drawn = new Set<number>();
	const building = new Map<number, ChunkSelection>();
	const arrived: ChunkMesh[] = [];
	let wantedNow = 0;

	/**
	 * What the last selection asked for, held so an arrival can be checked
	 * against it.
	 *
	 * A mesh that finishes after the player has moved past it is geometry for
	 * ground nobody is looking at, and uploading it costs a buffer and a draw
	 * until the next selection drops it again.
	 */
	let keep = new Set<number>();
	let lastWanted: ChunkSelection[] = [];

	/**
	 * Every address in {@link lastWanted}, decoded once and kept alongside it.
	 *
	 * {@link dropReplaced} runs most frames and checks every retiring chunk
	 * against the whole of `lastWanted`. Unpacking a key walks its path digit
	 * by digit and builds a fresh array; decoding both sides on every pairing
	 * turned that into tens of thousands of decodes a frame during a big
	 * reselection, and the frame cost climbed with the backlog left to drain
	 * -- 91 ms measured on the reported world, on a frame that otherwise costs
	 * under a millisecond. Decoding each address once here, and once per
	 * retiring chunk below, cuts that to a few hundred.
	 */
	let lastWantedAddrs: ChunkAddress[] = [];

	/**
	 * Which entries of {@link lastWanted} stand on each of the twenty faces.
	 *
	 * A face is the first thing two addresses disagree about, so grouping by
	 * it turns {@link dropReplaced}'s scan of the whole selection into a scan
	 * of the twentieth of it that could possibly overlap.
	 */
	let lastWantedOnFace: (number[] | undefined)[] = [];

	/**
	 * Chunks the selection no longer wants but which are still drawn.
	 *
	 * A chunk that leaves the selection is not dropped on the spot: its
	 * replacement at another level is usually still on a worker, and dropping
	 * first opens a hole straight through the planet at every level change,
	 * for as long as the replacement takes to build. A retiring chunk keeps
	 * drawing until every wanted chunk overlapping its triangle has been
	 * uploaded, so the ground under it is never bare.
	 */
	const retiring = new Set<number>();

	/**
	 * Drop every retiring chunk whose ground is drawn again.
	 *
	 * **Ground nothing in the selection covers is kept, not dropped.** With
	 * the view cull on, a chunk leaves the selection the moment it leaves the
	 * screen, and there is then nothing wanted overlapping it -- so a rule of
	 * "drop unless something still needed is missing" would throw away
	 * everything behind the player and hand back a bare horizon the moment
	 * they turned round. A chunk is replaced only when something that covers
	 * its ground has actually been drawn; until then it goes on drawing, and
	 * {@link trimRetired} is what bounds how many may.
	 */
	function dropReplaced(): void {
		for (const id of [...retiring]) {
			const old = selectionOf(id);
			const oldAddress = ChunkAddress.fromKey(old.key, old.chunkLevel);
			// Only the selection standing on the same icosahedron face can
			// cover this chunk's ground, and that is the first thing
			// `addressesOverlap` checks. Asking the face index instead skips
			// nineteen faces of the selection without a call, which matters
			// because this runs on every frame that uploads and the view cull
			// leaves far more chunks retired than it used to.
			const wantedHere = lastWantedOnFace[oldAddress.face];
			if (!wantedHere) continue;
			let covering = 0;
			let ready = true;
			for (const n of wantedHere) {
				const wanted = lastWanted[n]!;
				if (!addressesOverlap(oldAddress, lastWantedAddrs[n]!))
					continue;
				covering++;
				if (!drawn.has(selectionId(wanted.chunkLevel, wanted.key))) {
					ready = false;
					break;
				}
			}
			if (covering > 0 && ready) {
				retiring.delete(id);
				drawn.delete(id);
				renderer.drop(id);
			}
		}
	}

	/**
	 * How much ground may go on being drawn that the selection no longer asks
	 * for, as a multiple of what it does ask for.
	 *
	 * Without the view cull almost nothing retires for long, because the
	 * selection reaches all the way round the player and covers what it drops.
	 * With it on, everything behind the player is retired and kept, and a
	 * flight across the planet would hold every chunk it ever built. This is
	 * the ceiling on that, and what goes first is whatever is furthest from
	 * the camera.
	 */
	const RETIRE_BUDGET = 1;

	/** Give up the furthest retired chunks once too many are being held. */
	function trimRetired(from: Vec3): void {
		const allowed = Math.max(64, lastWanted.length * RETIRE_BUDGET);
		if (retiring.size <= allowed) return;
		const byDistance = [...retiring]
			.map((id) => {
				const at = selectionOf(id);
				const extent = chunkCenter(
					ChunkAddress.fromKey(at.key, at.chunkLevel),
					DEPTH,
					at.chunkLevel,
				);
				const away = new Vec3(extent.x, extent.y, extent.z)
					.scale(RADIUS)
					.sub(from)
					.length();
				return { id, away };
			})
			.sort((a, b) => b.away - a.away);
		for (const { id } of byDistance.slice(0, retiring.size - allowed)) {
			retiring.delete(id);
			drawn.delete(id);
			renderer.drop(id);
		}
	}

	/** Where the camera stood when the selection was last worked out. */
	let selectedAt = player.position;

	/** A camera the selection can be read from, and culled against. */
	interface ViewCamera {
		position: Vec3;
		eyeRadius: number;
		viewProj: Mat4;
		frustum: Frustum;
		eye: Vec3;
		look: Vec3;
	}

	/**
	 * The camera the drawing decisions are read from, when it is not the live
	 * one.
	 *
	 * Two decisions use a camera and neither is the picture: which level each
	 * chunk is drawn at, from the eye's place and height, and which resident
	 * chunks are drawn at all, from the frustum. Holding both at one camera
	 * while the real one keeps moving is the only way to look at either of
	 * them, because a decision made from where you are standing is invisible
	 * from there -- it always looks complete.
	 *
	 * `null` is the ordinary case: every decision reads the live camera.
	 */
	let frozen: ViewCamera | null = null;

	/**
	 * The camera the last frame drew with.
	 *
	 * The selection reads this rather than the player, because they are not in
	 * the same place: the wheel puts the camera up to 60 m behind and above,
	 * and from there the horizon is a long way past the one the eye has at
	 * 1.86 m. Reading the player instead selected for a viewer standing on the
	 * ground while the picture was taken from the air, so a zoomed-out view
	 * showed its own selection's rim.
	 *
	 * One frame stale, which the selection's own throttle makes moot.
	 */
	let viewing: ViewCamera | null = null;

	/**
	 * Where the player was standing, and how, at the moment the view froze.
	 *
	 * Freezing is for flying out of a view and looking at where its edges
	 * fell, so unfreezing has somewhere to go back to: the point of the trip
	 * was the view, not the vantage the trip ended at. Held beside
	 * {@link frozen} because that one is the camera and this is what the
	 * camera is built out of -- a place, a heading, a pitch and how far the
	 * view sits behind the player.
	 */
	let frozenPlayer: {
		position: Vec3;
		heading: Vec3;
		pitch: number;
		chase: number;
		flying: boolean;
	} | null = null;

	/** Set by the knob, read by the next frame, which has a matrix to freeze. */
	let freezeWanted = settings.knobs.freezeView;

	/**
	 * How much sky the camera takes in, top to bottom, in radians.
	 *
	 * Named once because two things read it: the projection every frame, and
	 * the cone that draws a frozen camera's own frustum. Two copies of it
	 * would draw a cone that agreed with the view until somebody moved one.
	 */
	const FIELD_OF_VIEW = (65 * Math.PI) / 180;

	/**
	 * Draw the frozen camera where it stands, at a size it can be found at.
	 *
	 * **The cone keeps its true shape and the box does not.** The cone opens at
	 * the camera's own field of view and reaches its own horizon, so both of
	 * those are measurements and stretching either would be a lie -- what it
	 * encloses is the ground that camera could have drawn. The box carries no
	 * length at all, only a place, so holding it to a fixed fraction of the
	 * viewing distance costs nothing and buys the one thing it is for: a 4 m
	 * box is under a pixel from 2 km up, and a marker nobody can find is not a
	 * marker.
	 *
	 * Rebuilt only when the size has moved enough to see, because the geometry
	 * is remade on the CPU each time it changes.
	 */
	function markMarker(at: {
		readonly eye: Vec3;
		readonly eyeRadius: number;
		readonly look: Vec3;
	}): void {
		const away = player.eye.sub(at.eye).length();
		const size = Math.max(settings.knobs.blockSize * 2, away / 200);
		const drawn = viewMarker.marker;
		if (drawn && Math.abs(size / drawn.size - 1) < 0.05) return;
		viewMarker.marker = {
			position: at.eye,
			direction: at.look,
			size,
			spread: FIELD_OF_VIEW / 2,
			// How far that camera could see: its own horizon, the first of the
			// two terms selectChunks reaches by. 159 m at eye height and
			// 2.9 km from 600 m up, so the cone grows with the altitude the
			// way the selection does.
			reach: RADIUS * horizonAngle(at.eyeRadius, RADIUS),
			// The sphere `reach` was measured against, so a downward-facing
			// edge of the cone is cut where it actually meets the ground
			// rather than running on underground for the rest of its length.
			// The grid's own shell in grid mode, since that -- not sea level
			// -- is what stands under the marker there.
			groundRadius: settings.knobs.gridMode
				? shape.crustTopRadius
				: RADIUS,
		};
	}

	/**
	 * How far the player moves before the selection is worked out again.
	 *
	 * Two blocks. Which level a chunk is drawn at changes over tens of metres,
	 * so this cannot step over a level change. Distance alone assumes a
	 * selection costs about the same every time, which is not true (F-047):
	 * `RESELECT_BUDGET` below is what actually bounds the time it may spend.
	 */
	const RESELECT_DISTANCE = Math.max(1, settings.knobs.blockSize * 2);

	/**
	 * The largest share of a second a movement-triggered reselect may spend.
	 *
	 * A distance threshold on its own assumes `selectChunks` costs about the
	 * same every time it runs. It does not: measured against the real engine,
	 * Full detail at its own maximum on a tall, rough world costs 13 ms and
	 * returns 3,008 chunks, against 2.6 ms and 201 chunks at Full detail 1. A
	 * player crossing `RESELECT_DISTANCE` faster than one call returns turns
	 * "reselect every couple of metres" into "reselect every frame", which
	 * measured 97-102% of the main thread for 1.5 s in a real trace (F-047).
	 * This self-scales to whatever the last call actually cost instead of a
	 * number that goes stale the moment a knob changes what the selection
	 * does: after every `refresh()`, `nextReselectAt` is pushed out so that
	 * the call just made was at most this fraction of the time since the one
	 * before it. Only the movement-triggered call below is held to it --
	 * a teleport, a knob change or unfreezing the view still refreshes at
	 * once, because those are rare and deliberate rather than continuous.
	 */
	const RESELECT_BUDGET = 0.25;

	/** The soonest `performance.now()` at which movement may reselect again. */
	let nextReselectAt = 0;

	/** Which way the camera faced when the selection was last worked out. */
	let selectedLook: Vec3 | null = null;

	/** Choose what should be drawn, and ask for what is missing. */
	function refresh(): void {
		const startedAt = performance.now();
		// The eye, not the feet: a viewer standing on ground at exactly the
		// reference radius still sees to the eye-height horizon, and the feet
		// put the horizon at zero. The peak height reaches the ground that
		// stands above the reference sphere beyond that horizon.
		//
		// The camera rather than the player, so a view pulled back sees to the
		// horizon it actually has. Before either exists -- the first selection
		// runs before the first frame -- the player is all there is.
		const from = frozen ??
			viewing ?? {
				position: player.position,
				eyeRadius: player.eye.length(),
				frustum: null,
				look: null,
			};
		selectedAt = from.position;
		selectedLook = from.look;
		// Everything outside the view is refused before it is asked for, which
		// is where the building goes: a 65-degree view holds about a quarter
		// of the ring the selection would otherwise reach round the player.
		// The margin is what turning turns onto, and the retiring chunks keep
		// the rest on screen until their replacements land.
		const cull = CULL_BUILD ? (from.frustum ?? undefined) : undefined;
		const wanted = selectChunks(
			DEPTH,
			CHUNK_LEVEL,
			from.position,
			from.eyeRadius,
			RADIUS,
			DETAIL,
			shape.maxElevation,
			peaks,
			cull,
			CULL_SLACK,
		);
		wantedNow = wanted.length;
		lastWanted = wanted;
		// The queue outlives a selection, so what was asked for first is not
		// what is nearest now. This is what a freed worker picks from.
		source.reprioritize(wanted);
		// The sea is cut from the same chunks at the same levels, so the water
		// is finer underfoot than at the horizon for exactly the reason the
		// ground is, and neither has an opinion about the other. A triangle
		// whose LOWEST ground stands above sea level holds no water anywhere
		// in it -- which the peak pyramid already knows, so the commonest case
		// inland costs one array read.
		if (sea)
			sea.setChunks(
				wanted.filter(
					(selection) =>
						peaks.troughOf(selection.key, selection.chunkLevel) < 0,
				),
			);
		// Decoded once here rather than inside dropReplaced's own loop, which
		// runs every frame there is a backlog to drain and would otherwise
		// pay this decode again for every retiring chunk it checks.
		lastWantedAddrs = wanted.map((selection) =>
			ChunkAddress.fromKey(selection.key, selection.chunkLevel),
		);
		lastWantedOnFace = [];
		for (let n = 0; n < lastWantedAddrs.length; n++) {
			const face = lastWantedAddrs[n]!.face;
			(lastWantedOnFace[face] ??= []).push(n);
		}
		keep = new Set(
			wanted.map((selection) =>
				selectionId(selection.chunkLevel, selection.key),
			),
		);
		// Chunks that left the selection retire rather than dropping: they
		// keep drawing until their ground is covered again.
		for (const id of [...drawn]) if (!keep.has(id)) retiring.add(id);
		for (const id of [...retiring]) if (keep.has(id)) retiring.delete(id);

		// Work that is no longer wanted is called off rather than left to
		// finish. A queued chunk is dropped outright and one already on a
		// worker is allowed to run out, so the pool spends its time on the
		// ground ahead instead of the ground already crossed.
		for (const [id, selection] of [...building])
			if (!keep.has(id)) {
				building.delete(id);
				source.cancel(selection);
			}

		for (const selection of wanted) {
			const id = selectionId(selection.chunkLevel, selection.key);
			if (drawn.has(id) || building.has(id)) continue;
			building.set(id, selection);
			source
				.request(selection)
				.then((mesh) => {
					arrived.push(mesh);
				})
				.catch(() => {
					// Only if this request is still the one outstanding: a
					// cancelled chunk the player turned back toward has been
					// asked for again by now, and that one is still coming.
					if (building.get(id) === selection) building.delete(id);
				});
		}
		dropReplaced();
		trimRetired(from.position);
		const finishedAt = performance.now();
		nextReselectAt =
			finishedAt + (finishedAt - startedAt) * (1 / RESELECT_BUDGET - 1);
	}

	// ---------------------------------------------------------------------
	// Editing: which cell a click acts on, what it writes, and where that is
	// kept between visits.
	// ---------------------------------------------------------------------

	/**
	 * The name of the world these changes belong to.
	 *
	 * Every knob that decides where a cell is or what block sits there goes
	 * into it, so blocks placed in one world never appear in a differently
	 * shaped one, and setting the knobs back reaches the earlier set again.
	 * The chunk size stays out: it moves no block, so dragging it keeps the
	 * world it was dragged in and the rows are re-cut on the way back in.
	 */
	const editWorld = worldKey({ ...settings.worldShape(), seed: seedText });
	const editDb = new EditDb();
	let edits = new DeltaStore({
		version: STORE_VERSION,
		subdivisionDepth: DEPTH,
		chunkLevel: CHUNK_LEVEL,
		registry: BLOCK_NAMES,
	});

	/** What is at a cell: a change where somebody made one, the terrain otherwise. */
	function blockAt(cell: CellRef): BlockType {
		if (cell.layer < 0 || cell.layer >= shape.crustDepth)
			return BlockType.AIR;
		// The floor of the world, before anything a record could say about it.
		if (cell.layer === shape.crustDepth - 1) return BlockType.BEDROCK;
		const changed = edits.read(cell);
		if (changed !== undefined) return typeOf(changed) as BlockType;
		const column = terrain.columnAt(cell.face, cell.i, cell.j);
		return terrain.blockAt(column, cell.layer);
	}

	/**
	 * What a ray walk asks the world about.
	 *
	 * Nothing here reads a chunk. `terrain` evaluates a column from the seed
	 * and the store answers for the cells somebody has touched, so a walk costs
	 * the same whether the ground it crosses has been meshed or not.
	 */
	const rayWorld: RayWorld = {
		get n() {
			return shape.n;
		},
		radiusOfLayer: (layer) => shape.radiusOfLayer(layer),
		layerOfRadius: (radius) => shape.layerOfRadius(radius),
		solidAt: (cell) => blockAt(cell) !== BlockType.AIR,
	};

	/**
	 * The cell under the crosshair and the one a block would go in.
	 *
	 * You aim at the block you are building on and the new one goes on top of
	 * it, which is one answer wherever on that block the crosshair sits.
	 * Reading whichever face the ray crossed instead flips between two cells
	 * for a pixel of movement near an edge. A column is straight -- the same
	 * face, the same offset, one layer up -- so above is a subtraction.
	 */
	function aiming(
		from: Vec3,
		look: Vec3,
	): { hit: CellRef; place: CellRef | null } | null {
		// The walk starts where the player is, on the line the crosshair marks.
		// The camera stands metres behind and above the eye and can be inside a
		// hill the player is standing in front of; a walk starting there stops
		// on its first cell and reports the ground behind the player's head.
		// Stepping along the ray by that distance first puts the start beside
		// the eye and keeps the line, so the reach is the player's own.
		const behind = from.sub(player.eye).length();
		const walked = rayWalk(
			from.add(look.scale(behind)),
			look,
			rayWorld,
			REACH * shape.blockSize,
		);
		if (!walked) return null;
		const above = { ...walked.cell, layer: walked.cell.layer - 1 };
		const free =
			above.layer >= 0 && blockAt(above) === BlockType.AIR ? above : null;
		return { hit: walked.cell, place: free };
	}

	/** What the crosshair is on, and what each button would do with it. */
	function aimingSays(at: ReturnType<typeof aiming>): string {
		if (!aimedFrom || !aimedLook) return "aiming at nothing";
		if (!at) return "out of reach";
		const name = BLOCK_NAMES[blockAt(at.hit)] ?? "unknown";
		const breaks = isBreakable(blockAt(at.hit));
		return (
			`${name.replace("chamfer:", "")}` +
			(breaks ? "" : " · will not break") +
			(at.place ? " · room above" : " · nothing fits above")
		);
	}

	/** A cell as the outline of its own layer, corners and both radii. */
	function outlineOf(cell: CellRef) {
		return {
			corners: cellCorners(cell.face, shape.n, cell.i, cell.j),
			inner: shape.radiusOfLayer(cell.layer + 1),
			outer: shape.radiusOfLayer(cell.layer),
			color: AIM_COLOR,
		};
	}

	/**
	 * Write a change, and ask again for every chunk that reads the cell.
	 *
	 * A chunk generates the slots on its own rim so the mesher can decide
	 * whether to emit a face there, so a cell on a chunk border is read by two
	 * or three chunks and all of them are rebuilt. The old geometry keeps
	 * drawing until the new mesh arrives, because uploading a chunk replaces
	 * whatever is resident under the same key.
	 */
	function change(cell: CellRef, block: BlockType): void {
		for (const key of edits.write(cell, packBlockState(block))) {
			const id = selectionId(CHUNK_LEVEL, key);
			drawn.delete(id);
			building.delete(id);
		}
		void editDb.save(editWorld, edits);
		refresh();
	}

	/**
	 * Break the block under the crosshair.
	 *
	 * The frame's own walk rather than a fresh one, so what was outlined is
	 * exactly what goes.
	 */
	function pick(): void {
		if (!aimed) return;
		if (!isBreakable(blockAt(aimed.hit))) return;
		change(aimed.hit, BlockType.AIR);
	}

	/** Put a block on top of the one under the crosshair. */
	function place(): void {
		if (!aimed?.place) return;
		const type = PLACEABLE[Math.floor(Math.random() * PLACEABLE.length)]!;
		change(aimed.place, type);
	}

	// The pool asks for a chunk's changes as each job leaves, so a chunk asked
	// for again after a click carries the click.
	const attachDeltas = (): void => {
		source.deltas = (key) => edits.rowOf(key)?.pack();
	};
	attachDeltas();

	// What is on disk, once. A world opened at a different chunk size to the
	// one it was written at is re-cut on the way in.
	void editDb
		.load(editWorld, {
			version: STORE_VERSION,
			subdivisionDepth: DEPTH,
			chunkLevel: CHUNK_LEVEL,
			registry: BLOCK_NAMES,
		})
		.then(({ store, stale }) => {
			if (stale)
				console.warn(
					"stored changes were written against a different block list and were not loaded",
				);
			if (store.count === 0) return;
			edits = store;
			for (const [key] of edits.entries()) {
				const id = selectionId(CHUNK_LEVEL, key);
				drawn.delete(id);
				building.delete(id);
			}
			refresh();
		});

	refresh();

	/**
	 * Replace the map and every chunk built from it, without reloading.
	 *
	 * **Live rebuild reaches the terrain and nothing past it.** The device,
	 * the renderer, the chunk address width, the crust top and the sea and
	 * sky radii that follow from it all stay exactly as they were, because
	 * {@link LIVE_TERRAIN_KNOBS} is the only set of knobs allowed to call
	 * this at all. A Relief large enough to move the sea's own radius still
	 * shows the new ground here and the old sea until the page is actually
	 * rebuilt -- Apply is what makes the two agree again.
	 *
	 * Synchronous and on the thread that draws, same as `buildCoarseMap`
	 * itself: there is no worker standing between a knob and the terrain it
	 * describes here, so a big map and a fast drag can be felt as a stutter.
	 * That is the cost the checkbox names.
	 */
	async function flushTerrain(live: PlanetSettings): Promise<void> {
		if (live.problems().length > 0) return;
		report([`seed "${live.knobs.seed}"`, "rebuilding the terrain..."]);
		// A synchronous rebuild never yields to the browser on its own, so the
		// line above would never actually reach the screen without this.
		await paint();

		const nextSeed = seedFromString(live.knobs.seed);
		map = live.coarseMapRuns
			? buildCoarseMap(nextSeed, live.coarseOptions())
			: flatCoarseMap(nextSeed, FLAT_COARSE_LEVEL);
		shape = live.shapeFor(map);
		peaks = new ChunkPeaks(map, live.knobs.blockSize, CHUNK_LEVEL);
		renderer.shadow.upload(map, shape.seaLevelRadius);
		byLod.length = 0;
		for (let lod = 0; lod <= CHUNK_LEVEL; lod++)
			byLod.push(
				new TerrainGenerator(
					nextSeed,
					shape.atLod(lod),
					map,
					live.terrainOptions(),
				),
			);
		terrain = byLod[0]!;

		// The setup a worker is given is fixed for its life, so a new map
		// means a new pool rather than a message the old one could take.
		source.dispose();
		source = new WorkerMeshSource(
			() =>
				new Worker(new URL("./chunkWorker.ts", import.meta.url), {
					type: "module",
				}),
			WORKERS,
			meshSetup(map, shape, live),
		);

		// Every chunk on screen was built from the map that just left. None of
		// it describes this one, so all of it goes -- back to nothing rather
		// than to whatever the old selection happened to leave drawn, or the
		// new ground would show through a patchwork of the last one until the
		// selection caught up on its own.
		for (const id of drawn) renderer.drop(id);
		drawn.clear();
		for (const id of retiring) renderer.drop(id);
		retiring.clear();
		building.clear();
		arrived.length = 0;
		wantedNow = 0;
		keep = new Set();
		lastWanted = [];
		lastWantedAddrs = [];
		lastWantedOnFace = [];

		refresh();
	}

	/**
	 * Debounced so a dragged slider flushes once it stops rather than once a
	 * frame. `flushTerrain` blocks the thread that draws for as long as
	 * `buildCoarseMap` takes, and a slider fires an `input` event far faster
	 * than that -- the map preview settles a level change the same way, for
	 * the same reason.
	 */
	const LIVE_REBUILD_SETTLE_MS = 350;
	let liveRebuildTimer = 0;
	onLiveRebuild = (live) => {
		clearTimeout(liveRebuildTimer);
		liveRebuildTimer = window.setTimeout(() => {
			void flushTerrain(live);
		}, LIVE_REBUILD_SETTLE_MS);
	};

	// Refilled on a timer, and again whenever a knob moves the decks.

	// Whether the sun and moon are frozen, and where -- as seconds on their own
	// clock, `dayStarted` below. Paused freezes both at that reading; resuming
	// re-anchors `dayStarted` so the clock continues from there rather than
	// jumping to wherever it would have reached while frozen.
	let paused = settings.knobs.paused;
	let cloudsDrawn = settings.knobs.cloudsDrawn;

	// Every knob that decides what a deck is made of, as one string. A live
	// knob hands over the whole draft on every move, so this is what says
	// whether any of the six that matter actually changed.
	let cloudsShapedAs = [
		settings.knobs.lowDeck,
		settings.knobs.highDeck,
		settings.knobs.cloudPuff,
		settings.knobs.cloudClusters,
		settings.knobs.cloudDensity,
		settings.knobs.cloudSpread,
	].join();
	let frozenAt = settings.knobs.timeOfDay * DAY_LENGTH;
	let lastTimeOfDay = settings.knobs.timeOfDay;

	// The bench is already on screen. Hand it what to do with a knob that only
	// changes how the world is drawn; the ones that change what it is reload
	// the page and never reach here.
	onLiveKnob = (live) => {
		current = live;
		DETAIL = live.knobs.detail;
		DAY_LENGTH = live.knobs.dayLength;
		player.setWalkSpeed(live.knobs.walkSpeed);
		CULL_BUILD = live.knobs.buildCull;
		if (sea) {
			sea.visible = live.knobs.seaDrawn;
			sea.wireframe = live.knobs.seaWireframe;
			sea.look = seaLook(live);
		}
		CULL_SLACK = Math.tan((live.knobs.cullMargin * Math.PI) / 180);
		source.nearestFirst = live.knobs.nearestFirst;

		// Freezing waits for the next frame, which has a matrix to hold.
		// Unfreezing is immediate, and puts the player back where they were
		// standing when it froze, facing the way they were facing: the flight
		// out was to look at the frozen view from outside, so ending it
		// somewhere else would leave them lost at whatever vantage the trip
		// happened to finish at. The refresh at the foot of this function then
		// selects for the camera they have been given back.
		freezeWanted = live.knobs.freezeView;
		if (!freezeWanted) {
			frozen = null;
			viewMarker.marker = null;
			if (frozenPlayer) {
				player.position = frozenPlayer.position;
				player.heading = frozenPlayer.heading;
				player.pitch = frozenPlayer.pitch;
				player.fall = 0;
				chase = frozenPlayer.chase;
				flying = frozenPlayer.flying;
				// Whatever the mouse had accumulated on the way out belongs to
				// the vantage being left, not the view being returned to.
				swing = 0;
				tilt = 0;
				frozenPlayer = null;
			}
		}

		// Turning the clouds off empties the buffer, which is what stops the
		// pass -- the renderer draws nothing when it holds no cloud geometry.
		// The wind angle is a pure function of elapsed time -- turned below
		// reads only `now - started` -- so nothing has to keep building while
		// this is off for the next deck to land in the right place: the first
		// rebuild after it goes back on reads the same clock everyone else
		// does and shows the clouds where they would have been anyway.
		if (live.knobs.cloudsDrawn !== cloudsDrawn) {
			cloudsDrawn = live.knobs.cloudsDrawn;
			if (billboardClouds) billboardClouds.visible = cloudsDrawn;
		}

		// What a deck is made of and where it sits are drawing, not terrain, so
		// none of it reloads the world. The billboards are scattered again in
		// place; the volumetric worker is set up with the decks it fills, so
		// moving one replaces the worker and the next tick refills it.
		const cloudShape = [
			live.knobs.lowDeck,
			live.knobs.highDeck,
			live.knobs.cloudPuff,
			live.knobs.cloudClusters,
			live.knobs.cloudDensity,
			live.knobs.cloudSpread,
		].join();
		if (cloudShape !== cloudsShapedAs) {
			cloudsShapedAs = cloudShape;
			if (billboardClouds)
				billboardClouds.rebuild(
					live.knobs.cloudClusters,
					live.knobs.cloudDensity,
					cloudLayers(live),
				);
		}
		if (sky)
			sky.atmosphere = planetAtmosphere(
				RADIUS,
				live.knobs.atmosphereTop,
				live.knobs.zenithDepth,
			);

		const now = performance.now();
		if (live.knobs.timeOfDay !== lastTimeOfDay) {
			// Dragged to a specific time: jump there and freeze.
			lastTimeOfDay = live.knobs.timeOfDay;
			frozenAt = live.knobs.timeOfDay * DAY_LENGTH;
			paused = true;
		} else if (live.knobs.paused && !paused) {
			// Paused without dragging: freeze wherever the clock already was.
			frozenAt = (now - dayStarted) / 1000;
			paused = true;
		} else if (!live.knobs.paused && paused) {
			// Resumed: continue smoothly from the frozen reading.
			dayStarted = now - frozenAt * 1000;
			paused = false;
		}
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

	let swing = 0;
	let tilt = 0;

	// Moving and climbing are held, and a finger holding one of those cannot
	// also be dragging the view, so they are the two things drawn on screen.
	// Looking and zooming are momentary and stay gestures on the world itself.
	const touch = new TouchControls({
		onFly: () => {
			flying = !flying;
		},
		onStand: () => {
			standHere();
		},
	});

	// Every pointer currently down, by its own id. One is a drag to look --
	// mouse or finger, the same path -- and two are a pinch. Tracking them by
	// id rather than with a single flag is what keeps a second finger from
	// overwriting the first one's position and throwing the view about.
	const down = new Map<number, { x: number; y: number }>();
	let pinchFrom = 0;
	let pinchChase = 0;

	/** How far apart the two pointers are. */
	function spread(): number {
		const [a, b] = [...down.values()];
		if (!a || !b) return 0;
		return Math.hypot(a.x - b.x, a.y - b.y);
	}

	/**
	 * Where each pointer went down and which button it was, so a press that
	 * did not move can be told from a drag.
	 *
	 * Dragging looks around, so every press is a candidate for both. A press
	 * that travels further than this many pixels was a look and never becomes
	 * a click.
	 */
	const CLICK_SLOP = 5;
	const pressed = new Map<
		number,
		{ x: number; y: number; button: number; moved: number }
	>();

	canvas.addEventListener("pointerdown", (e) => {
		if (e.pointerType === "touch") touch.reveal();
		canvas.setPointerCapture(e.pointerId);
		down.set(e.pointerId, { x: e.clientX, y: e.clientY });
		pressed.set(e.pointerId, {
			x: e.clientX,
			y: e.clientY,
			button: e.button,
			moved: 0,
		});
		if (down.size === 2) {
			pinchFrom = spread();
			pinchChase = chase;
		}
	});

	// The right button places, so the menu it would otherwise open never does.
	canvas.addEventListener("contextmenu", (e) => e.preventDefault());
	canvas.addEventListener("pointermove", (e) => {
		const press = pressed.get(e.pointerId);
		if (press)
			press.moved += Math.hypot(e.clientX - press.x, e.clientY - press.y);
		const was = down.get(e.pointerId);
		if (!was) return;
		const dx = e.clientX - was.x;
		const dy = e.clientY - was.y;
		was.x = e.clientX;
		was.y = e.clientY;
		if (down.size === 1) {
			// Looking is an angle a pixel, and half a window turns a quarter
			// circle.
			const perPixel = Math.PI / (2 * viewHeight());
			swing -= dx * perPixel;
			tilt -= dy * perPixel;
		} else if (down.size === 2 && pinchFrom > 0) {
			// Fingers apart pulls the camera in, the way a wheel forward does.
			const now = spread();
			if (now > 0)
				chase = Math.max(
					0,
					Math.min(60, (pinchChase * pinchFrom) / now),
				);
		}
	});
	const lift = (e: PointerEvent) => {
		const press = pressed.get(e.pointerId);
		pressed.delete(e.pointerId);
		down.delete(e.pointerId);
		pinchFrom = 0;
		if (!press || press.moved > CLICK_SLOP || down.size > 0) return;
		if (press.button === 0) pick();
		else if (press.button === 2) place();
	};
	canvas.addEventListener("pointerup", lift);
	canvas.addEventListener("pointercancel", lift);
	canvas.addEventListener(
		"wheel",
		(e) => {
			e.preventDefault();
			chase = Math.max(0, Math.min(60, chase + e.deltaY * 0.02));
		},
		{ passive: false },
	);

	/**
	 * Where the aiming ray leaves from and where it points, as the last frame
	 * drew it.
	 *
	 * A click reuses the frame's own ray rather than casting its own, so what
	 * is outlined is exactly what the click acts on.
	 */
	let aimedFrom: Vec3 | null = null;
	let aimedLook: Vec3 | null = null;

	/** What that ray found, walked once a frame. */
	let aimed: { hit: CellRef; place: CellRef | null } | null = null;

	const started = performance.now();

	// A pause freezes the sun and the moon, never the wind, so this is its own
	// clock rather than a reuse of `started` -- reusing it would jump the wind
	// every time the day/night clock re-anchors itself on a resume.
	let dayStarted = started;
	let previous = started;

	/** When the status readout was last rebuilt. */
	let reportedAt = 0;
	const timer = new FrameTimer();
	const draw = (now: number) => {
		timer.begin(now);

		// Meshes that finished on a worker go to the GPU here, a couple a frame,
		// so a burst of arrivals does not turn into one long frame.
		timer.enter("upload", performance.now());
		let uploaded = false;
		for (let n = 0; n < UPLOAD_PER_FRAME; n++) {
			const mesh = arrived.shift();
			if (!mesh) break;
			building.delete(mesh.key);
			// A chunk already on a worker is allowed to finish when it is
			// cancelled, so an arrival can be for ground the player has since
			// left. Dropping it here costs nothing; uploading it costs a
			// buffer and a draw until the next selection notices.
			if (!keep.has(mesh.key)) continue;
			drawn.add(mesh.key);
			renderer.upload(mesh);
			uploaded = true;
		}
		// An upload may be the last thing a retiring chunk was waiting for.
		if (uploaded) dropReplaced();
		timer.leave("upload", performance.now());

		resizeToDisplay(ctx);

		const seconds = Math.min(0.1, (now - previous) / 1000);
		previous = now;
		// Keys and the stick add, so neither has to know the other exists, and
		// a touch laptop can use both at once.
		const reach = (value: number) => Math.max(-1, Math.min(1, value));
		const ahead = reach(
			(held.has("w") || held.has("arrowup") ? 1 : 0) -
				(held.has("s") || held.has("arrowdown") ? 1 : 0) +
				touch.ahead,
		);
		const aside = reach(
			(held.has("d") || held.has("arrowright") ? 1 : 0) -
				(held.has("a") || held.has("arrowleft") ? 1 : 0) +
				touch.aside,
		);
		const lift = reach(
			(held.has(" ") ? 1 : 0) - (held.has("shift") ? 1 : 0) + touch.lift,
		);
		timer.enter("player", performance.now());
		player.step(
			{
				ahead,
				aside,
				turn: swing,
				pitch: tilt,
				lift,
				// The same key that rises while flying jumps while walking.
				// The player answers it only with both feet down, so holding
				// it walks off a ledge rather than climbing the air.
				jump: held.has(" ") || touch.lift > 0,
				flying,
			},
			seconds,
			terrain,
		);
		timer.leave("player", performance.now());
		swing = 0;
		tilt = 0;
		// Distance moved, not a key held. A player also moves without pressing
		// anything -- gravity pulls them down every frame until they land, and
		// a fall off a ridge crosses several levels on the way. Keying off a
		// direction key left all of that unnoticed until the next key press,
		// which read as the world snapping resolution once they landed.
		// The camera's own movement, not the player's, so pulling the view back
		// on the wheel reselects too: it lifts the eye by up to 60 m and takes
		// the horizon with it, and keying off the player left the world drawn
		// for a viewer standing on the ground until they walked two metres.
		//
		// Turning counts as moving when the selection is culled to the view,
		// because then it is the only thing that brings new ground into it.
		// Half the margin, so the ground a turn arrives on was already asked
		// for by the time it is on screen.
		const cameraAt = viewing?.position ?? player.position;
		const turned =
			CULL_BUILD &&
			selectedLook !== null &&
			viewing !== null &&
			viewing.look.dot(selectedLook) <
				Math.cos(Math.max(0.17, CULL_SLACK / 2));
		if (
			!frozen &&
			(cameraAt.sub(selectedAt).length() > RESELECT_DISTANCE || turned) &&
			performance.now() >= nextReselectAt
		)
			refresh();

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

		// The ray the crosshair stands on: from the camera, toward the point
		// the camera is aimed at. The camera sits `chase` metres behind the eye
		// and looks at a point ahead of the eye rather than ahead of itself, so
		// screen centre is this line and not `look` from `player.eye`. In first
		// person the camera is the eye and the two are one line.
		aimedFrom = from;
		aimedLook = target.sub(from).normalize();
		// One walk a frame, read by the outline, the readout and the next
		// click alike, so all three agree about what is being aimed at.
		aimed = frozen ? null : aiming(aimedFrom, aimedLook);
		aim.target = aimed?.place
			? outlineOf(aimed.place)
			: aimed
				? outlineOf(aimed.hit)
				: null;

		const eye: [number, number, number] = [from.x, from.y, from.z];
		const view = Mat4.lookAt(
			eye,
			[target.x, target.y, target.z],
			[up.x, up.y, up.z],
		);
		// The near plane follows the height over the DRAWN surface, never
		// over sea level. On a mountain -- or on the grid shell, which sits
		// at the world's highest point everywhere -- the two differ by the
		// whole of the ground's height, and a near plane a hundredth of the
		// sea-level altitude clipped away the ground under the camera's own
		// feet.
		const standing = positionToCell(player.position, shape.n);
		const under = terrain.columnAt(standing.face, standing.i, standing.j);
		const overGround = Math.max(
			0,
			player.position.length() -
				(current.knobs.gridMode
					? shape.crustTopRadius
					: Math.max(under.groundRadius, under.waterRadius)),
		);
		const projection = Mat4.perspective(
			FIELD_OF_VIEW,
			canvas.width / canvas.height,
			Math.max(0.2, overGround * 0.01),
			RADIUS * 20,
		);

		// The sun turns about the planet's own polar axis, and how lit a place is
		// comes from one dot product against its own up. Paused reads a frozen
		// elapsed time instead of the live clock, and both the sun and the moon
		// below read the same one, so pausing stops them in step.
		// Under the pause the light is held at noon, and noon is a local fact
		// on a sphere: walking 100 m turns a player's own up by 3.37 degrees,
		// so a sun fixed in world directions is a lit hemisphere that can be
		// walked out of rather than a constant. Pointing it along the player's
		// own up puts the sun overhead wherever they stand, and full daylight
		// leaves the terrain shader's night term out of the mix entirely.
		const elapsed = paused ? frozenAt : (now - dayStarted) / 1000;
		const sun = PLAIN
			? up
			: sunDirection((elapsed / DAY_LENGTH) % 1, NORTH);
		// The player's own up, not the place they started. How lit the world is
		// is a local fact on a sphere: this planet is 10,681 m round and takes
		// 2.12 hours to walk, so a player can cross the terminator inside one
		// day. Measuring it anywhere but under their feet holds the whole scene
		// at whatever the light was where they spawned.
		const day = PLAIN ? 1 : daylight(up.x, up.y, up.z, sun.x, sun.y, sun.z);

		// The wind, not the day/night clock: paused freezes the sun, never
		// this, for the same reason the volumetric wind above reads `started`
		// rather than `dayStarted`.
		if (billboardClouds) billboardClouds.time = (now - started) / 1000;

		/**
		 * What the picture is multiplied by, from the light there actually is.
		 *
		 * Flat ground takes the sky's share whenever the sun is up at all, and the
		 * sun's share in proportion to how high it stands -- so the reading runs
		 * from 1 at noon to the sky's share alone at sunrise. Dividing by it and
		 * raising that to **Eye adapts** is an eye opening: at 1 every hour comes
		 * out equally bright and nothing reads as evening, at 0 the picture is
		 * exposed the same however dark it gets.
		 *
		 * The floor is what stops a night with no sun in it asking for all the
		 * exposure there is. At 0.35 a night still comes out under a fifth as
		 * bright as noon, which is dark and readable rather than black.
		 */
		const DARKEST = 0.35;

		function exposureFor(day: number, sunUp: number): number {
			const share = current.knobs.sunShare;
			const lit = day * (1 - share + share * Math.max(0, sunUp));
			return (
				current.knobs.exposure *
				Math.pow(1 / Math.max(DARKEST, lit), current.knobs.eyeAdapts)
			);
		}

		// The moon stands off at a distance rather than being painted on, so
		// walking round the planet shifts it against the stars. Worked out
		// whether or not a sky is drawn, because the ground is lit by it.
		const moonPlace = windRotation(
			new Vec3(0.2, 0.55, 0.81).normalize(),
			NORTH,
			(elapsed / (DAY_LENGTH * 1.35)) * 2 * Math.PI,
		).scale(MOON_DISTANCE);
		const moon = moonPlace.sub(from).normalize();
		if (sky)
			sky.moon = {
				direction: moon,
				angularRadius: MOON_ANGULAR_RADIUS,
			};

		// Under the surface is a radius now, not a block: the sea holds none.
		const submerged =
			from.length() < shape.seaSurfaceRadius ||
			terrain.blockAtPosition(from) === BlockType.WATER;
		// Each half of the answer is switched on its own: the walk reaches the
		// horizon and knows only generated ground, the maps reach a few
		// hundred metres and hold anything that drew itself.
		const dark = PLAIN ? 0 : current.knobs.sunShadow;
		renderer.shadow.setLook(
			current.knobs.mapShadows ? dark : 0,
			current.knobs.shadowReach,
		);
		renderer.cascades.setSize(current.knobs.shadowTexels);
		renderer.cascades.setLook(
			current.knobs.cascadeShadows ? dark : 0,
			current.knobs.cascadeReach,
		);
		// A cloud's shadow is the one the map can never hold: the map is the
		// generated ground and a cloud is neither ground nor generated into
		// it. Its own darkness, because a cloud is translucent and a hill is
		// not, so the two would not read the same at one setting.
		renderer.cloudShadow.setSize(current.knobs.shadowTexels);
		renderer.cloudShadow.setLook(
			PLAIN || !current.knobs.cloudShadows
				? 0
				: current.knobs.cloudShadow,
			current.knobs.cloudShadowReach,
		);
		renderer.sky = submerged
			? mix(NIGHT_SKY, [0.05, 0.16, 0.28], day)
			: mix(NIGHT_SKY, DAY_SKY, day);
		// The sea is world geometry and does not follow anything. What the
		// camera decides is only how far round the planet it can see, which
		// is what "near the horizon" means for the sky the water reflects. A
		// camera at or under the surface has no horizon at all, so this never
		// falls under the arc a standing player already has.
		if (sea) {
			sea.eye = from;
			sea.horizon = Math.max(
				horizonAngle(
					shape.seaSurfaceRadius + 2,
					shape.seaSurfaceRadius,
				),
				horizonAngle(from.length(), shape.seaSurfaceRadius),
			);
			sea.time = (now - started) / 1000;
			sea.sky = renderer.sky;
		}
		const viewProj = projection.multiply(view);
		// What the next selection reads: where the picture was actually taken
		// from, and what it reached. The camera is not the player -- the wheel
		// puts it up to 60 m back -- and from up there the horizon is a long
		// way past the one a standing eye has.
		viewing = {
			position: from,
			eyeRadius: from.length(),
			viewProj,
			frustum: new Frustum(viewProj),
			eye: from,
			look,
		};
		// Frozen with the frame it was asked for on, rather than from a camera
		// rebuilt out of parts: what is held is a view that was on screen.
		if (freezeWanted && !frozen) {
			frozen = viewing;
			// The player as well as the camera, so unfreezing can put them
			// back rather than leaving them wherever they flew to.
			frozenPlayer = {
				position: player.position,
				heading: player.heading,
				pitch: player.pitch,
				chase,
				flying,
			};
			refresh();
		}
		if (frozen) markMarker(frozen);
		if (sky) sky.inverseViewProj = viewProj.inverse();
		timer.enter("draw", performance.now());
		renderer.render({
			viewProj,
			// Absent unless the view is frozen, and then what is drawn is what
			// that camera could see rather than this one.
			cullViewProj: frozen?.viewProj,
			eye,
			sun: [sun.x, sun.y, sun.z],
			fog: submerged
				? WATER_FOG
				: [WATER_FOG[0], WATER_FOG[1], WATER_FOG[2], CLEAR_AIR],
			daylight: day,
			nightLight: NIGHT_LIGHT,
			moon: [moon.x, moon.y, moon.z],
			moonLight: PLAIN ? 0 : current.knobs.moonLight,
			exposure: exposureFor(day, up.dot(sun)),
			sunShare: current.knobs.sunShare,
		});
		timer.leave("draw", performance.now());

		onPlayerMoved(up);
		// The readout is for a person to read, and a person cannot read a
		// hundred of them a second. Rebuilt every frame it was the most
		// expensive named thing on this thread -- 6.25% of it, ahead of the
		// selection and the drawing -- because six template strings, a share
		// code and a geographic conversion end in a `textContent` the page
		// then has to lay out again. Ten a second reads the same and costs a
		// tenth of that.
		if (now - reportedAt >= REPORT_INTERVAL) {
			reportedAt = now;
			const at = geographicOf(player.position, RADIUS);
			const cell = standing;
			report([
				`seed "${seedText}"`,
				`${degrees(at.latitude, "NS")} ${degrees(at.longitude, "EW")} · ${height(at.altitude)}`,
				`${shareCode({ planet: 0, face: cell.face, i: cell.i, j: cell.j, layer: Math.max(0, Math.min(shape.crustDepth - 1, shape.layerOfRadius(player.position.length()))) }, DEPTH)} · ${renderer.drawn} of ${renderer.count} chunks drawn, ${wantedNow} held` +
					(building.size > 0 ? ` · ${building.size} building` : ""),
				`${clock(day)} · ${flying ? "flying" : player.swimming(terrain) ? "swimming" : "walking"}` +
					(submerged ? " · under water" : ""),
				// What a click would do, and how much of this world is a
				// player's rather than the seed's.
				`${aimingSays(aimed)} · ${edits.count} changed`,
				// Where the decisions are being read from, and how far that is from
				// where the picture is being taken. Without the distance a frozen
				// view is a world that has simply stopped responding.
				...(frozen
					? [
							`view frozen · ${height(geographicOf(frozen.position, RADIUS).altitude)} · ` +
								`${height(player.position.sub(frozen.position).length())} from the camera`,
						]
					: []),
				budget(timer, renderer),
				"WASD move · drag look · E eye level · F fly · T next pentagon · G go to",
			]);
		}
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
