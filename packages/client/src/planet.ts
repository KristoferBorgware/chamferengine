import type { ChunkMesh, MeshRetune } from "chamfer/mesh";
import type { ChunkSelection, CoarseMap } from "chamfer/generation";
import type { WorldShape } from "chamfer/world";
import { Frustum, Mat4, Vec3, type Box } from "chamfer/math";
import {
	BLOCK_NAMES,
	BlockType,
	ChunkAddress,
	SPECKLE,
	TerrainGenerator,
	ChunkPeaks,
	addressesOverlap,
	buildCoarseMap,
	chunkCenter,
	coarseChunkKey,
	flatCoarseMap,
	horizonAngle,
	isBreakable,
	seedFromString,
	selectChunks,
	selectionId,
	selectionOf,
} from "chamfer/generation";
import { WorkerMeshSource } from "chamfer/mesh";
import type { BoundsBox } from "chamfer/render";
import type { CellRef } from "chamfer/edit";
import {
	DeltaStore,
	STORE_VERSION,
	cellSlot,
	chunkReaders,
	packBlockState,
	typeOf,
	worldKey,
} from "chamfer/edit";
import type { RayWorld } from "chamfer/addressing";
import {
	cellCorners,
	latticeCell,
	positionToCell,
	rayWalk,
} from "chamfer/addressing";
import { Player } from "chamfer/player";
import { clickIntent } from "./clickIntent.js";
import { worldBlocks } from "./worldBlocks.js";
import {
	geographicOf,
	landmarks,
	positionOf,
	shareCode,
} from "chamfer/coordinates";
import { NORTH } from "chamfer/addressing";
import {
	BLOCK_LIGHT_RANGE_MAX,
	blockLightSide,
	daylight,
	fillBlockLight,
	solarNoonTime,
	sunDirection,
	terminatorSpeed,
} from "chamfer/light";
import {
	AimRenderer,
	BillboardClouds,
	BoundsRenderer,
	ChunkRenderer,
	FrameTimer,
	MarkerRenderer,
	PlayerRenderer,
	NoWebGPUError,
	SEA_COLORS,
	SeaRenderer,
	createGpuContext,
	resizeToDisplay,
} from "chamfer/render";
import type { SeaLook } from "chamfer/render";
import type { CloudPuffLayer, PlanetAtmosphere } from "chamfer/sky";
import {
	WIND_AXIS,
	WIND_RATE,
	planetAtmosphere,
	windRotation,
} from "chamfer/sky";
import { MapPreview } from "./MapPreview.js";
import { BlockTextures } from "chamfer/render";
import { ParameterPanel } from "./ParameterPanel.js";
import { PlantCellStore } from "./PlantCellStore.js";
import { plantLayerOf } from "./PlantDraft.js";
import { TouchControls } from "./TouchControls.js";
import { EditDb } from "./EditDb.js";
import type { PlanetKnobs } from "./PlanetSettings.js";
import type { PlayerBody } from "chamfer/render";
import { FLAT_COARSE_LEVEL, PlanetSettings } from "./PlanetSettings.js";
import { behindPlayer } from "./behindPlayer.js";
import { biomeFieldFor } from "./biomeFieldFor.js";

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
let CULL_MARGIN = (settings.knobs.cullMargin * Math.PI) / 180;

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

/** Half the angle the sun disc covers, in radians. */
const SUN_ANGULAR_RADIUS = (0.9 * Math.PI) / 180;

/** A planet's own air, from the knobs the panel exposes for it. */
function airFor(live: PlanetSettings): PlanetAtmosphere {
	const k = live.knobs;
	return planetAtmosphere(RADIUS, {
		wavelengths: [k.wavelengthRed, k.wavelengthGreen, k.wavelengthBlue],
		scatteringStrength: k.scatteringStrength,
		densityFalloff: k.densityFalloff,
		atmosphereScale: k.atmosphereScale,
		intensity: k.skyIntensity,
		mieStrength: k.mieStrength,
		mieDirection: k.mieDirection,
		aerialPerspective: k.aerialPerspective,
	});
}

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

/** How often the culling volumes are gathered again, in milliseconds. */
const BOUNDS_INTERVAL = 250;

/**
 * How many culling volumes are drawn, nearest first.
 *
 * Three rings each, so this is 38,400 line vertices. Every ball a selection and
 * a renderer hold between them is some thousands, which is most of a planet of
 * rings seen edge on -- unreadable, and over a second a frame to draw.
 */
const BOUNDS_LIMIT = 400;

/** The color the outline over the aimed-at cell is drawn in. */
const AIM_COLOR: [number, number, number] = [0.98, 0.86, 0.35];

/**
 * The two culling volumes, in colors that stay apart when both are on.
 *
 * The selection's ball is the one tested before a chunk is asked for; the
 * patch's is the ball its built geometry fits inside, tested before it is
 * drawn. Which of the two is refusing a chunk is the usual question, so they
 * are never the same color.
 */
const SELECT_BOUND_COLOR: [number, number, number] = [0.35, 0.75, 1];
const PATCH_BOUND_COLOR: [number, number, number] = [1, 0.45, 0.65];

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
const readout = document.querySelector<HTMLDivElement>("#readout")!;
const crosshair = document.querySelector<HTMLDivElement>("#crosshair")!;

// **Shut, and one mark wide.** The readout is six lines of numbers standing
// over the view, and the world is what the window is for -- so it opens on a
// click and starts closed. The button is outside the canvas, and the canvas is
// the only thing that asks for the pointer, so this stays clickable in exactly
// the states the parameter panel does.
const readoutOpen = document.querySelector<HTMLButtonElement>("#readout-open")!;
readoutOpen.onclick = () => {
	const open = readout.classList.toggle("open");
	readoutOpen.setAttribute("aria-expanded", String(open));
};

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
let onLiveRebuild: (live: PlanetSettings, terrain: boolean) => void = () => {};

/**
 * Editor mode.
 *
 * `?panel=1` turns it on, and it is one panel: every knob, and a fold at the
 * top holding the planet as a picture. **The map pane is gone** -- it stood
 * down the other side of the screen carrying its own copy of the terrain rows,
 * its own picture per step of the map build, and its own button to commit a
 * world, which is three ways of saying it was a second place to do what the
 * panel does. What it had that nothing else does is the picture, and that is
 * what was kept.
 *
 * The picture is built on its own worker and never touches the terrain.
 * **Rebuild** is what builds a world, by reloading with the settings in the
 * query string -- the one path that rebuilds the device, the map and every
 * chunk together.
 */
let onPlayerMoved: (up: { x: number; y: number; z: number }) => void = () => {};

/** Stand somewhere, once there is a world to stand in. */
let onGoTo: (at: { x: number; y: number; z: number }) => void = () => {};

/**
 * Move some of the panel's own knobs, as if their rows had been dragged.
 *
 * The panel is built inside its own `if (params.get("panel") === "1")`
 * block and is not in scope where a world is played in, so this is the one
 * door back into it -- **Noon where you land** sets the clock through here
 * the same way dragging **Time of day** would, rather than reaching past the
 * panel to move `frozenAt` and `paused` on its behalf.
 */
let onPanelSet: (values: Partial<PlanetKnobs>) => void = () => {};

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

/**
 * Whether this page has been given up, so the frame loop stops asking for one.
 *
 * **A torn-down world is still a world the browser will ask to draw.** Leaving
 * the page runs every hand-back above -- the sea's buffers, the worker pools,
 * the GPU context -- and the frame already queued lands afterwards, writing its
 * uniforms into buffers that have been destroyed and submitting a command
 * buffer that names them. The browser reports one warning per buffer per frame
 * and then stops reporting at all, which is how a page walked away from spills
 * hundreds of lines about buffers "used in submit while destroyed".
 *
 * Read at the top of the loop rather than at the bottom, so the frame in flight
 * when the page hides is the last one drawn.
 */
let given = false;

/**
 * Hand back every thread and every byte this page holds.
 *
 * **Called before a rebuild navigates, not only when the browser says the page
 * is going.** A page the browser freezes for the back button is a page that
 * gives nothing up, and `Rebuild` reaches the next world through
 * `location.href` -- an ordinary navigation, which the browser is free to
 * freeze the old page for. Whichever it decides, the world is already gone by
 * the time it decides it.
 */
function giveUp(): void {
	if (given) return;
	given = true;
	for (const give of teardown) give();
	teardown.length = 0;
}

window.addEventListener("pagehide", (event) => {
	// **A page frozen for the back button is coming back with everything it
	// had.** `pagehide` fires for both, and giving the world up on the frozen
	// one is what makes walking to a bench and pressing back land on a page
	// whose every GPU buffer has been destroyed: it draws nothing, and the
	// browser reports one warning per buffer per frame until it stops
	// reporting at all. Only a page that is really going gives anything up,
	// which is what the pool leak above is about -- a rebuild goes through
	// `location.href` and is never persisted.
	if (event.persisted) return;
	giveUp();
});
window.addEventListener("pageshow", (event) => {
	// **And if one comes back anyway, it is built again rather than resumed.**
	// A world that has been given up cannot be picked up: the belt to the
	// braces above, because which pages a browser keeps is its own decision.
	if (event.persisted && given) location.reload();
});

if (params.get("panel") === "1") {
	// The panel is built first because the picture stands inside it, and the
	// picture is told about a knob by the panel: neither can be made without
	// the other, so one of them is named before it exists.
	let maps: MapPreview | null = null;
	const panel = new ParameterPanel(
		settings,
		(live) => {
			onLiveKnob(live);
		},
		(draft) => maps?.changed(draft),
		(live, terrain) => onLiveRebuild(live, terrain),
		{ onGiveUp: giveUp },
	);
	onPanelSet = (values) => panel.set(values);
	// **The picture of the planet lives in the panel, in a fold of its own.**
	// It was a pane down the other side of the screen with its own copy of the
	// terrain rows and its own button to commit them -- a second place to do
	// what the panel already does. What it is worth keeping for is the one
	// thing the world itself cannot show from the ground: where the land is.
	// **The readout goes into the panel with everything else.** A box of
	// numbers over the top-left corner of the view stands on the ground it is
	// describing; the panel is where what the world is doing belongs, beside
	// the knobs that change it. The corner button goes with it: a fold in the
	// panel is the same question already answered, and two ways to open one
	// readout is one too many. Without the panel the button is what opens it.
	const readoutSection = panel.section("Readout");
	if (readoutSection) {
		readoutSection.appendChild(status);
		readout.remove();
	}
	maps = new MapPreview(
		settings,
		panel.section("Map") ?? document.body,
		(at) => onGoTo(at),
	);
	const preview = maps;
	onPlayerMoved = (up) => preview.setPlayer(up);
	teardown.push(() => preview.dispose());
}

/**
 * The block pictures, once they have been fetched, or `null` until then.
 *
 * **The world draws without them.** Every vertex carries a layer of `-1` while
 * this is null and the mesh is the untextured one, so a slow fetch is a world
 * that starts flat and gains its pictures rather than a world that waits.
 */
let blockTextures: BlockTextures | null = null;

async function main(): Promise<void> {
	const ctx = await createGpuContext(canvas);
	const renderer = new ChunkRenderer(ctx);
	// **The chunks are the biggest thing this page holds, and they are not on
	// this side of the wire.** A worker's heap goes when its thread does, but
	// a chunk's vertices are GPU memory the browser keeps for as long as
	// anything can still name them -- and nothing here named them at all until
	// now, so a page walked away from carried its whole world with it. Half a
	// gigabyte on the traced session, still held while the next world
	// allocated its own.
	teardown.push(() => {
		renderer.clear();
		ctx.device.destroy();
	});
	try {
		const baked = await BlockTextures.load(
			`${import.meta.env.BASE_URL}blocks/`,
		);
		blockTextures = new BlockTextures(ctx, baked.atlas, baked.levels);
		renderer.setBlockTextures(blockTextures);
	} catch (whatever) {
		// A world with no pictures is the world this engine drew before there
		// were any, which is worth having over a page that does not open.
		console.warn("no block pictures loaded", whatever);
	}

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
		// The clouds are the only moving thing on the planet, so they get a
		// shadow of their own rather than sharing the cascades' depth buffers.
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
				renderer.lightViews,
			);
	if (sea) {
		sea.visible = settings.knobs.seaDrawn;
		sea.wireframe = settings.knobs.seaWireframe;
		teardown.push(() => sea.destroy());
	}

	// The air, the stars, the sun disc and the moon disc are all one pass now
	// -- the renderer's own atmosphere march, not a layer -- so pausing them
	// under the plain planet is pausing what feeds it rather than a layer
	// standing in front of the ground.
	renderer.air =
		PLAIN || !settings.knobs.atmosphereOn ? null : airFor(settings);
	renderer.atmosphere.sunAngularRadius = SUN_ANGULAR_RADIUS;
	renderer.atmosphere.moonAngularRadius = MOON_ANGULAR_RADIUS;
	// The frozen camera is drawn as an object, after the sky and the clouds so
	// it is never behind either of them. It has nothing to draw until the view
	// is frozen.
	const viewMarker = new MarkerRenderer(ctx);
	// The outline over the cell a click would act on. Last, so it stands over
	// the water as well as the ground: it says where a click goes rather than
	// being a thing that lives in the world.
	const aim = new AimRenderer(ctx);
	// The player themselves, once the camera trails far enough back to see
	// one. Nothing to draw in first person, which is where a world opens.
	const playerBody = new PlayerRenderer(ctx);
	// The volumes the culling tests against, drawn only when asked for.
	const bounds = new BoundsRenderer(ctx);
	renderer.layers = [
		// **A player is a thing in the world, so it goes in with the world.**
		// Before the sea, which is translucent and writes depth: drawn after
		// it, a player standing in the shallows would be cut off at the
		// waterline rather than seen through it, the way the sea floor under
		// them already is.
		playerBody,
		// After the ground, so the water is drawn over the floor it covers,
		// and before the clouds, which are further off than any of it.
		...(sea ? [sea] : []),
		...(billboardClouds ? [billboardClouds] : []),
		viewMarker,
		aim,
		bounds,
	];

	// One generator per level. A chunk one level coarser samples the terrain at
	// twice the spacing over four times the area, so it holds the same 561 slots
	// and there are four times fewer of them.
	//
	// **One biome field for all of them.** The main thread's own generators
	// need to name the same ground a worker's chunks do, and a biome is a
	// place rather than a mesh resolution -- built once here, the way it is
	// built once per worker.
	let biomeField = biomeFieldFor(seed, shape, map, settings);
	const byLod: TerrainGenerator[] = [];
	for (let lod = 0; lod <= CHUNK_LEVEL; lod++)
		byLod.push(
			new TerrainGenerator(
				seed,
				shape.atLod(lod),
				map,
				settings.terrainOptions(),
				biomeField,
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
		{
			walkSpeed: settings.knobs.walkSpeed,
			flySpeed: settings.knobs.flySpeed,
		},
	);
	let flying = true;
	// **A world opens at the eye.** Third person is a thing to ask for with
	// the wheel, not the view somebody is given: the camera behind the
	// shoulder is for looking at the player, and there is nothing to look at
	// until someone goes and finds it.
	let chase = 0;

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
		player.position = direction.scale(
			// The grid shell sits at the crust top, wherever the real ground
			// is; standing on the world means standing on what is drawn.
			//
			// `standingRadius` reads the blocks rather than the height field:
			// a surface is the top of a block, so the field's radius differs
			// from the face that is drawn by up to one block, and the field
			// knows nothing about a tower somebody built here or a pit they
			// dug.
			current.knobs.gridMode
				? shape.crustTopRadius
				: standingRadius(direction),
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

	// Clicking the flat map or the ball in the map pane stands the player
	// there -- the flat picture shows the whole planet at once and the ball
	// shows its shape, so between them nowhere is out of reach.
	onGoTo = (at) => {
		const direction = new Vec3(at.x, at.y, at.z);
		land(direction);
		// **Always noon where you land.** The clock is set the same way
		// dragging Time of day would set it -- through the panel, which is
		// what keeps the slider and the sky agreeing about what time it now
		// is -- so a teleport always arrives somewhere lit.
		onPanelSet({
			timeOfDay: solarNoonTime(direction.normalize(), NORTH),
			paused: true,
		});
	};

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
		const above =
			player.position.length() - standingRadius(player.position);
		player.position = direction
			.normalize()
			.scale(standingRadius(direction) + Math.max(1.2, above));
		player.heading = direction
			.normalize()
			.cross(new Vec3(0, 1, 0))
			.normalize();
		player.fall = 0;
		refresh();
	}

	/**
	 * Land wherever the crosshair is pointing, from anywhere in flight.
	 *
	 * **Not the arm's reach.** {@link PlanetKnobs.reach} bounds how far a
	 * block can be broken or placed from; someone flying over a mountain and
	 * aiming at its foot is routinely further from it than that. The walk
	 * here is given as far as the ray could possibly meet the planet from
	 * where the player's eye already is, so aiming past the horizon still
	 * lands on the ground the crosshair is actually over.
	 */
	function landAtCursor(): void {
		if (!aimedFrom || !aimedLook) return;
		const walked = rayWalk(
			aimedFrom,
			aimedLook,
			rayWorld,
			player.eye.length() + shape.crustTopRadius,
		);
		if (!walked) return;
		land(aimedFrom.add(aimedLook.scale(walked.distance)));
		flying = false;
	}

	/**
	 * Put the player on the ground directly under their own feet.
	 *
	 * **Precisely, not the 1.2 m clearance {@link land} leaves.** That
	 * clearance is for a teleport that cannot be sure how close the target
	 * already is -- across the map, over a mountain -- and expects gravity or
	 * a further step to close the gap. Straight down is not that: the column
	 * is already known, so the feet go exactly onto {@link standingRadius}
	 * and nothing about how the player is standing changes.
	 */
	function dropToGround(): void {
		const direction = player.position.normalize();
		player.position = direction.scale(standingRadius(direction));
		player.fall = 0;
		refresh();
	}

	/**
	 * The radius of the top of whatever a player would stand on, under a
	 * direction.
	 *
	 * **The seed's surface is not the world's.** A teleport that reads the
	 * generator lands 1.2 m over the ground as it was generated, which is
	 * inside a tower somebody built there and well above the floor of a pit
	 * somebody dug. The generator gives the starting point and {@link blockAt}
	 * corrects it: up while there is still something solid overhead, down while
	 * there is nothing underfoot.
	 */
	function standingRadius(direction: Vec3): number {
		const cell = positionToCell(direction, shape.n);
		const column = terrain.columnAt(cell.face, cell.i, cell.j);
		const surface = Math.max(column.groundRadius, column.waterRadius);
		const floor = shape.crustDepth - 1;
		let layer = Math.max(0, Math.min(floor, shape.layerOfSurface(surface)));
		const solid = (at: number): boolean =>
			at >= 0 &&
			at <= floor &&
			blockAt({ ...cell, layer: at }) !== BlockType.AIR;
		if (solid(layer)) while (layer > 0 && solid(layer - 1)) layer--;
		else while (layer < floor && !solid(layer)) layer++;
		return shape.radiusOfLayer(layer);
	}

	/**
	 * The message that hands a chunk worker the map it builds from.
	 *
	 * One function rather than one inline object, because live rebuild sends
	 * this again with a fresh map and the same shape of message: keeping it
	 * one function is what keeps a knob added to the setup message from being
	 * added in one of the two places and not the other.
	 */
	/**
	 * The switches the mesher bakes into a vertex colour, read off a draft.
	 *
	 * These are the whole of what {@link BAKED_KNOBS} reaches. They move no
	 * block -- the terrain is a function of a face and a lattice offset and
	 * never sees one of them -- so a pool already holding the map can be told
	 * these three and keep everything else it has built.
	 *
	 * **Full light is not among them.** How much sky a cell stands under
	 * arrives at the shader as a number of its own rather than as a factor in
	 * the vertex colour, so taking it away is a switch the frame carries and
	 * costs no chunk a rebuild.
	 */
	function meshRetune(live: PlanetSettings): MeshRetune {
		return {
			kind: "retune",
			// Zero is off, and off is the flat colour the registry names.
			speckle: live.knobs.speckle ? SPECKLE : 0,
			ambientOcclusion: live.knobs.ambientOcclusion,
			skyExposure: live.knobs.skyExposure,
			cutoutLeaves: live.knobs.cutoutLeaves,
		};
	}

	function meshSetup(
		builtMap: CoarseMap,
		builtShape: WorldShape,
		live: PlanetSettings,
	) {
		return {
			// The four re-mesh switches, taken from the one place that spells
			// them out, so a setup and a retune can never disagree about what
			// the same draft means. First, so `kind` below overrides theirs.
			...meshRetune(live),
			kind: "setup" as const,
			map: builtMap.toSnapshot(),
			seaLevelRadius: RADIUS,
			subdivisionDepth: DEPTH,
			maxElevation: builtShape.maxElevation,
			crustDepth: builtShape.crustDepth,
			apron: APRON,
			debugSeams: live.knobs.seamOverlay,
			// **Which picture each block wears.** Absent until the bake has
			// been fetched, and then a chunk is meshed with a layer of `-1` on
			// every vertex and drawn in the registry's own colours.
			textureLayers: blockTextures?.table,
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
			// **The world's own forest, out of the world's own link.** Which
			// kinds of plant it grows is part of the definition a link
			// carries, the same way its relief is -- the vegetation bench is
			// where that is chosen and this is where it is grown.
			plants: live.knobs.vegetation
				? live.plantLayers.map(plantLayerOf)
				: [],
			// **The world's own ground names, the same way.** A plain planet
			// has no coarse map for a landform to read, so it has no biomes
			// either.
			biomes: live.coarseMapRuns
				? {
						biomes: live.biomeTable.biomes,
						grid: live.biomeTable.grid,
						settings: live.biomeOptions(),
						continent: live.layerFor("continent"),
						erosion: live.layerFor("erosion"),
						peaks: live.layerFor("peaks"),
					}
				: undefined,
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

	/** The boxes the last selection tested, for the diagnostic view to draw. */
	let selectionBoxes: Box[] = [];

	/** What is drawn, what is asked for, and what has come back unuploaded. */
	const drawn = new Set<number>();
	const building = new Map<number, ChunkSelection>();
	const arrived: ChunkMesh[] = [];

	/**
	 * The plant blocks of every chunk drawn at full detail.
	 *
	 * **A plant is a block like any other**, so collision, the ray walk and
	 * what a player is standing in all have to see it -- and none of them can
	 * re-derive it from the address the way they re-derive terrain. The cells
	 * come back with the mesh that drew them and are kept here for as long as
	 * that mesh is.
	 */
	let plantCells = new PlantCellStore(DEPTH, CHUNK_LEVEL, shape.crustDepth);
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
				forget(id);
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

	/** Let go of a chunk's plants when its mesh goes. */
	function forget(id: number): void {
		const at = selectionOf(id);
		if (at.chunkLevel === CHUNK_LEVEL) plantCells.drop(at.key);
	}

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
			forget(id);
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

	/** The body last handed over, so a player standing still is not rebuilt. */
	let bodyAt: PlayerBody | null = null;

	/**
	 * Draw the player, once the camera is far enough back to see one.
	 *
	 * **The test is where the camera ended up, not how far back it was
	 * asked to go.** `behindPlayer` gives the offset up whenever the ground is
	 * in the way, so a player backed into a corner has the camera at their own
	 * eye however far the wheel was turned -- and a capsule drawn there is the
	 * inside of its own head filling the screen.
	 */
	function markPlayer(from: Vec3): void {
		if (from.sub(player.eye).length() <= player.radius) {
			playerBody.body = null;
			bodyAt = null;
			return;
		}
		// A step too small to move a pixel of it is not worth rebuilding a
		// thousand vertices for, and this runs once a frame.
		if (
			bodyAt &&
			bodyAt.position.sub(player.position).length() < 1e-3 &&
			bodyAt.heading.dot(player.heading) > 1 - 1e-9
		)
			return;
		bodyAt = {
			position: player.position,
			heading: player.heading,
			height: player.height,
			radius: player.radius,
		};
		playerBody.body = bodyAt;
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
		// The boxes the walk tested, kept so a frame can draw them. Held rather
		// than recomputed: the selection runs on movement and the frame runs
		// always, and re-walking the hierarchy to draw a diagnostic would cost
		// more than the diagnostic.
		selectionBoxes = wanted.flatMap((selection) =>
			selection.bound ? [selection.bound] : [],
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
	// One answer to "what is here", for the aiming walk, the outline, a click
	// and the player's own collision alike. All three are passed as functions
	// because all three are replaced: the store when a saved world finishes
	// loading, the generator and the shape whenever a terrain knob rebuilds
	// the world.
	const { blockAt, probe } = worldBlocks(
		() => terrain,
		() => shape,
		() => edits,
		() => plantCells,
	);

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
	 * The colour of the light the player carries: a warm white, the colour a
	 * flame throws rather than the colour of the sky.
	 */
	const TORCH_COLOR: [number, number, number] = [1.0, 0.82, 0.56];

	/**
	 * What the carried light was last filled for, so it is filled again only
	 * when something it depends on moves.
	 *
	 * A step to the next cell, a turn of either knob, and any change to the
	 * blocks -- a broken wall lets the light through and the fill is what has
	 * to notice.
	 */
	let litFor = "";

	/**
	 * Flood the carried light out from the cell the player's eye is in.
	 *
	 * The fill walks the air cell by cell, losing a step of brightness at each
	 * and stopping at rock, and lands in a cube of levels named by how far
	 * each cell is from the source along the source's own face coordinates.
	 * A coordinate that leaves the face still names exactly one cell, so a
	 * light near a face edge reaches over it without a case for it.
	 *
	 * The blocks are read through `blockAt`, so a passage somebody dug is open
	 * to the light on the frame they dug it.
	 */
	function carryLight(cell: CellRef): void {
		const knobs = current.knobs;
		const range =
			PLAIN || !knobs.torchOn
				? 0
				: Math.min(BLOCK_LIGHT_RANGE_MAX, Math.round(knobs.torchRange));
		const stamp =
			`${cell.face}/${cell.i}/${cell.j}/${cell.layer}/${range}` +
			`/${knobs.torchStrength}/${edits.count}/${shape.n}`;
		if (stamp === litFor) return;
		litFor = stamp;
		if (range < 1 || knobs.torchStrength <= 0) {
			renderer.blockLight.off();
			return;
		}
		const chart = fillBlockLight(
			cell.face,
			cell.i,
			cell.j,
			cell.layer,
			range,
			blockLightSide(BLOCK_LIGHT_RANGE_MAX),
			(face, i, j, layer) => {
				const at = latticeCell(face, shape.n, i, j);
				const block = blockAt({ ...at, layer });
				// Water passes light and stops nothing walking through it, so
				// only rock and the blocks a player stacks hold it back.
				return block !== BlockType.AIR && block !== BlockType.WATER;
			},
		);
		renderer.blockLight.update(
			chart,
			shape,
			TORCH_COLOR,
			knobs.torchStrength,
		);
	}

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
		// **The reach is an arm, so the ray is the player's own** -- from the
		// eye, along the way they face. The camera takes no part: it stands
		// metres behind and above, so a ray through the middle of the screen
		// passes four metres over the player's head and needs twelve to come
		// down to ground an arm reaches in six. The crosshair is moved to where
		// this ray lands instead of being pinned to the middle of the screen.
		// Read from the live draft rather than the settings the page loaded
		// with, so the row moves the arm as it is dragged.
		const walked = rayWalk(
			from,
			look,
			rayWorld,
			current.knobs.reach * shape.blockSize,
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
		const owner = cellSlot(cell, DEPTH, CHUNK_LEVEL).chunkKey;
		for (const key of edits.write(cell, packBlockState(block))) {
			dropChunk(key);
			// Every chunk that reads the cell, not just the one that stores
			// it: a chunk's apron draws the ring past its own rim, so a shaft
			// dug just across the boundary is geometry this chunk puts on the
			// screen and its cull volume has to hold.
			liftReaders(key);
		}
		// One chunk written, because only one chunk's records changed.
		void editDb.save(editWorld, edits, owner);
		refresh();
	}

	/**
	 * Forget everything drawn or being built for a chunk whose records moved.
	 *
	 * **At every level, not just the finest.** The chunk showing this ground is
	 * whichever level the selection picked for it, and its key is a different
	 * number at each -- so dropping the finest id alone leaves a coarse chunk
	 * drawing the ground as it was, which reads as the change appearing only
	 * once you walk close enough.
	 *
	 * **And a job already on a worker carries the store as it was when it left**,
	 * so it is told as well. Without that, a block broken while its own chunk
	 * was in flight came back drawn from before the break, and the chunk was
	 * marked built, so nothing ever asked again.
	 */
	function dropChunk(key: number): void {
		for (let level = CHUNK_LEVEL; level >= 0; level--) {
			const at = coarseChunkKey(key, CHUNK_LEVEL, level);
			const id = selectionId(level, at);
			drawn.delete(id);
			building.delete(id);
			source.invalidate(level, at);
		}
	}

	/**
	 * Tell the selection how high a chunk's ground reaches now.
	 *
	 * `ChunkPeaks` is built from the coarse map, which is a picture of the
	 * generated world and holds no placed block. The selection reads it to
	 * decide whether a triangle pokes back over the horizon and how big a ball
	 * to test against the view, so a tower standing out of the top of the ball
	 * built for its hillside is culled along with the hillside.
	 */
	function liftPeaks(chunkKey: number): void {
		const reach = edits.reachOf(chunkKey);
		if (!reach) return;
		peaks.raise(
			chunkKey,
			CHUNK_LEVEL,
			shape.radiusOfLayer(reach.top) - RADIUS,
			shape.radiusOfLayer(reach.bottom + 1) - RADIUS,
		);
	}

	/**
	 * Widen the ground credited to every chunk that will draw a change, at
	 * every level one of them might be drawn at.
	 *
	 * `liftPeaks` widens a triangle and its own ancestors, which covers the
	 * chunks named in the fine lattice. A coarse chunk is chosen by a different
	 * rule -- its ring is computed in the lattice it is drawn at, which reaches
	 * further -- so a coarse chunk can be handed a row for ground its own
	 * pyramid entry knows nothing about, and be culled against a wedge bounded
	 * by generated ground while holding a tower.
	 */
	function liftReaders(key: number): void {
		liftPeaks(key);
		for (let level = CHUNK_LEVEL - 1; level >= 0; level--)
			for (const reader of chunkReaders(
				coarseChunkKey(key, CHUNK_LEVEL, level),
				DEPTH - (CHUNK_LEVEL - level),
				level,
			)) {
				const reach = edits.reachOf(key);
				if (!reach) continue;
				peaks.raise(
					reader,
					level,
					shape.radiusOfLayer(reach.top) - RADIUS,
					shape.radiusOfLayer(reach.bottom + 1) - RADIUS,
				);
			}
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
	// for again after a click carries the click. **By key and level**: the same
	// ground has a different key at every chunk level and the store is filed at
	// the finest, so a coarse chunk asking with its own key alone gets nothing
	// and the change disappears as soon as the player is far enough away for
	// its chunk to drop a level.
	const attachDeltas = (): void => {
		source.deltas = (key, chunkLevel) =>
			edits.rowsUnder(key, chunkLevel).map((row) => ({
				chunkKey: row.chunkKey,
				...row.deltas.pack(),
			}));
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
			// A store opened at a different chunk size arrives re-cut, so its
			// rows are written back under the cut they are now filed by.
			if (store.header.chunkLevel !== CHUNK_LEVEL)
				void editDb.saveAll(editWorld, edits);
			// The first jobs went out against an empty store while this was
			// still loading, so every chunk a saved edit touches is holding or
			// building a picture of the world before anybody played in it.
			for (const key of edits.touched()) {
				liftReaders(key);
				dropChunk(key);
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
	 * {@link REMESH_KNOBS} is the only set of knobs allowed to call this at
	 * all. A Relief large enough to move the sea's own radius still
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
		biomeField = biomeFieldFor(nextSeed, shape, map, live);
		byLod.length = 0;
		for (let lod = 0; lod <= CHUNK_LEVEL; lod++)
			byLod.push(
				new TerrainGenerator(
					nextSeed,
					shape.atLod(lod),
					map,
					live.terrainOptions(),
					biomeField,
				),
			);
		terrain = byLod[0]!;
		// The crust top moves with `maxElevation`, so every layer boundary
		// moves with it. A player holding the shape the world had before the
		// knob falls through ground that is no longer where it was.
		player.shape = shape;

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
		// **A new pool is a new hook.** The pool asks for a chunk's changes as
		// each job leaves, and a fresh one has no hook at all -- so without
		// this every chunk built after a terrain knob moved carried no record
		// of anything anybody had done, and the whole world's edits vanished
		// until the page was reloaded.
		attachDeltas();

		dropEveryChunk();
	}

	/**
	 * Build every chunk again, keeping the map and everything made from it.
	 *
	 * **What {@link BAKED_KNOBS} changes is a number multiplied into a vertex
	 * colour**, so every chunk on screen is wrong and nothing else is. The
	 * map, the shape, the peaks and the per-level generators are all still
	 * pictures of this world, because the terrain reads a face and a lattice
	 * offset and has never been told about any of these switches.
	 *
	 * So the pool is **retuned rather than replaced**. Measured on the
	 * shipped world, what `flushTerrain` spends before a single chunk is
	 * meshed is 1,144 ms of coarse map and 127 ms of peak pyramid, and not
	 * one input to either of them is a function of these knobs. A fresh pool
	 * would also structured-clone the map's five typed arrays once per
	 * worker, which is the same map arriving again.
	 *
	 * Not `async`, and that is the difference a person feels: there is no
	 * long synchronous stretch to yield the thread before, so nothing has to
	 * be painted first and the switch takes effect on the next frame the
	 * chunks come back on.
	 */
	function flushMeshes(live: PlanetSettings): void {
		if (live.problems().length > 0) return;
		// **The readout must not claim a terrain rebuild here.** Nothing
		// about the ground moved, and a status line saying it did is how the
		// two paths become impossible to tell apart from outside.
		report([`seed "${live.knobs.seed}"`, "rebuilding the meshes..."]);
		source.retune(meshRetune(live));
		dropEveryChunk();
	}

	/**
	 * Throw away every chunk drawn, drawing or waiting, and ask again.
	 *
	 * Back to nothing rather than to whatever the last selection happened to
	 * leave on screen: the new ground would otherwise show through a
	 * patchwork of the old until the selection caught up on its own.
	 */
	function dropEveryChunk(): void {
		// **Everything the renderer holds, not everything this file knows
		// about.** A chunk an edit invalidated leaves `drawn` without leaving
		// the GPU -- it keeps drawing until its replacement lands, which is
		// the point -- so a rebuild that walked these two sets alone left
		// whatever was between them resident forever.
		renderer.clear();
		drawn.clear();
		retiring.clear();
		plantCells.forget();
		building.clear();
		arrived.length = 0;
		wantedNow = 0;
		keep = new Set();
		lastWanted = [];
		lastWantedAddrs = [];
		lastWantedOnFace = [];

		// The peak pyramid is a picture of the generated world and holds
		// nothing anybody placed. Without this a tower is culled with the
		// hillside it stands on the moment a knob moves, exactly as it was
		// before it was ever told about.
		for (const key of edits.touched()) liftReaders(key);

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

	// **The stronger of the two wins across a settle.** The panel reports each
	// key as it moves; this owns the window, so it is what has to remember
	// that a knob moving the ground was in it. A terrain knob followed by
	// three baked ones still needs the map -- the reverse does not need it at
	// all.
	let liveRebuildGround = false;
	onLiveRebuild = (live, terrain) => {
		liveRebuildGround ||= terrain;
		clearTimeout(liveRebuildTimer);
		liveRebuildTimer = window.setTimeout(() => {
			const ground = liveRebuildGround;
			liveRebuildGround = false;
			if (ground) void flushTerrain(live);
			else flushMeshes(live);
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
		player.setFlySpeed(live.knobs.flySpeed);
		CULL_BUILD = live.knobs.buildCull;
		if (sea) {
			sea.visible = live.knobs.seaDrawn;
			sea.wireframe = live.knobs.seaWireframe;
			sea.look = seaLook(live);
		}
		CULL_MARGIN = (live.knobs.cullMargin * Math.PI) / 180;
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
		if (!PLAIN)
			renderer.air = live.knobs.atmosphereOn ? airFor(live) : null;

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
		// **E means two different things, and neither changes what E already
		// means.** Flying, there is no ground under the feet worth dropping
		// to, so it lands wherever the crosshair is pointing and switches to
		// walking. Walking, there is nowhere else to send the player, so it
		// drops them straight onto the ground already under their feet and
		// leaves them walking.
		if (key === "e") (flying ? landAtCursor : dropToGround)();
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
	 * This is the **unlocked** path: with the pointer captured a click is
	 * unambiguous, and here every press is a candidate for both a look and a
	 * click. A press that travels further than this many pixels was a look and
	 * never becomes a click.
	 */
	const CLICK_SLOP = 5;
	const pressed = new Map<
		number,
		{ x: number; y: number; button: number; moved: number }
	>();

	/**
	 * Whether the mouse is captured by the canvas.
	 *
	 * **Free look, rather than a button held down.** Looking around is what a
	 * player does constantly and clicking is what they do occasionally, so the
	 * one that costs nothing should be the constant one. Holding a button to
	 * turn also makes every press ambiguous -- the same gesture starts a look
	 * and breaks a block, and only how far it travelled tells them apart --
	 * which is a rule the player has to know and a block broken by accident
	 * whenever a small drag falls under the threshold.
	 *
	 * Captured, the two are different actions: the mouse turns the view and a
	 * press is a press. It also takes the cursor off the canvas, which is the
	 * other half of the same thing -- an arrow sitting over the world points at
	 * a cell the crosshair is not aiming at.
	 *
	 * **Touch never captures**, so a finger keeps the drag path below, and so
	 * does a browser that refuses. `Escape` gives the cursor back, which is how
	 * the parameter panel is reached.
	 */
	const looking = (): boolean => document.pointerLockElement === canvas;

	/**
	 * When the last request was refused, and how long the drag stands in.
	 *
	 * Refusal is usually **temporary**: a browser will not re-capture within
	 * about a second of letting go, so a player who presses `Escape` and clicks
	 * straight back in is refused once. Latching that permanently would leave
	 * them dragging for the rest of the session, so it lapses and the next
	 * click tries again.
	 */
	const DENIED_FOR = 3000;
	let deniedAt = -Infinity;

	/**
	 * Ask for the mouse, and note it if the answer is no.
	 *
	 * **Refusal arrives two ways and both have to be caught.** The older shape
	 * fires `pointerlockerror` on the document; the newer one returns a promise
	 * and rejects it, which is silent unless it is caught -- and left uncaught
	 * it is an unhandled rejection in the console *and* a fallback that never
	 * arms, so a browser that refuses gets a canvas where clicking does nothing
	 * at all: no look, and no block broken either.
	 */
	const askForMouse = (): void => {
		const asked = canvas.requestPointerLock() as unknown;
		if (asked instanceof Promise)
			asked.catch(() => {
				deniedAt = performance.now();
			});
	};

	document.addEventListener("pointerlockerror", () => {
		deniedAt = performance.now();
	});
	document.addEventListener("pointerlockchange", () => {
		if (looking()) {
			deniedAt = -Infinity;
			// Whatever was mid-gesture belongs to the unlocked path and would
			// otherwise turn the view once more on the next move.
			down.clear();
			pressed.clear();
		}
		// Captured, the browser takes the cursor off the canvas itself. Let go
		// and it comes back, which is what makes the parameter panel reachable
		// and says which mode this is without a word of text.
	});

	canvas.addEventListener("pointerdown", (e) => {
		if (e.pointerType === "touch") touch.reveal();
		const intent = clickIntent({
			pointerType: e.pointerType,
			captured: looking(),
			canCapture: performance.now() - deniedAt > DENIED_FOR,
		});
		if (intent.capture) askForMouse();
		if (intent.act) {
			// No slop test: this press is a press, and the capture it may also
			// be asking for does not make it any less of one.
			if (e.button === 0) pick();
			else if (e.button === 2) place();
		}
		if (!intent.drag) return;
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
		if (looking()) {
			// Captured, so the pointer has no position on the page and the
			// movement is all there is. Same angle a pixel as the drag, so
			// nothing about how far a turn feels changes with the mode.
			const perPixel = Math.PI / (2 * viewHeight());
			swing -= e.movementX * perPixel;
			tilt -= e.movementY * perPixel;
			return;
		}
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
	/** When the culling volumes were last gathered, and how many there were. */
	let boundsAt = -Infinity;
	let boundsHeld = 0;

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
		// **A page that has been given up draws nothing.** Every buffer this
		// frame would write to has been destroyed, and the browser reports one
		// warning per buffer for it.
		if (given) return;
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
			// **Only a chunk at the world's own cut answers a collision.** A
			// coarse one names a different triangle and holds a different
			// lattice, and nobody stands near enough to one to touch it.
			const at = selectionOf(mesh.key);
			if (at.chunkLevel === CHUNK_LEVEL)
				plantCells.put(at.key, mesh.plants);
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
			probe,
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
				Math.cos(Math.max(0.17, CULL_MARGIN / 2));
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
		const from = behindPlayer(player.eye, look, up, chase, rayWorld);
		markPlayer(from);
		const target = player.eye.add(look.scale(50));

		// The ray a click acts along is the player's own. Where it lands on
		// screen is where the crosshair goes, computed once the projection
		// below is built.
		aimedFrom = player.eye;
		aimedLook = look;
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
		// The eye rather than the feet: a carried light is at the height it is
		// looked from, and in a passage one block tall that is the difference
		// between lighting the floor and lighting the room.
		carryLight({
			...standing,
			layer: shape.layerOfRadius(player.eye.length()),
		});
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

		// **The two culling volumes, the nearest few hundred, gathered a few
		// times a second.**
		//
		// A selection is hundreds of chunks and the renderer holds thousands,
		// so all of them at once is three rings over some thousands of balls --
		// 320,000 line vertices, which cost over a second a frame to draw and
		// are unreadable anyway, being most of a planet of rings seen edge on.
		// What answers the question is the ones near the camera and the ones
		// just outside the view, so the list is cut to the nearest by distance
		// and the readout says when it was cut.
		//
		// Gathered on a clock rather than every frame, and the same array is
		// handed back in between for the renderer to skip on. The clock is
		// checked against the frame's own time, so a frame slower than the
		// interval still gathers once and not twice.
		if (current.knobs.selectBounds || current.knobs.patchBounds) {
			if (now - boundsAt >= BOUNDS_INTERVAL) {
				boundsAt = now;
				const near: { box: BoundsBox; away: number }[] = [];
				const add = (
					box: Box,
					color: [number, number, number],
				): void => {
					const dx = box.center[0] - from.x;
					const dy = box.center[1] - from.y;
					const dz = box.center[2] - from.z;
					near.push({
						box: { ...box, color },
						away: dx * dx + dy * dy + dz * dz,
					});
				};
				if (current.knobs.selectBounds)
					for (const box of selectionBoxes)
						add(box, SELECT_BOUND_COLOR);
				if (current.knobs.patchBounds)
					for (const box of renderer.bounds())
						add(box, PATCH_BOUND_COLOR);
				boundsHeld = near.length;
				near.sort((a, b) => a.away - b.away);
				near.length = Math.min(near.length, BOUNDS_LIMIT);
				bounds.boxes = near.map((one) => one.box);
			}
		} else if (bounds.boxes.length > 0) bounds.boxes = [];

		// **The crosshair stands where the arm points, not in the middle of the
		// screen.** With the camera pulled back the two are different lines,
		// and a mark pinned to the middle points at ground several metres past
		// anything a player can touch. Projecting the far end of the reach puts
		// it on the cell the click acts on, and leaves it in the middle in
		// first person, where the camera is the eye.
		{
			const end = player.eye.add(
				look.scale(current.knobs.reach * shape.blockSize),
			);
			const m = projection.multiply(view).elements;
			let cx = 0;
			let cy = 0;
			let cw = 0;
			for (let r = 0; r < 4; r++) {
				const v = [end.x, end.y, end.z, 1];
				let sum = 0;
				for (let k = 0; k < 4; k++) sum += m[k * 4 + r]! * v[k]!;
				if (r === 0) cx = sum;
				else if (r === 1) cy = sum;
				else if (r === 3) cw = sum;
			}
			if (cw > 0) {
				crosshair.style.display = "";
				crosshair.style.left = `${((cx / cw) * 0.5 + 0.5) * 100}%`;
				crosshair.style.top = `${(0.5 - (cy / cw) * 0.5) * 100}%`;
			} else crosshair.style.display = "none";
		}

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

		// The moon stands off at a distance rather than being painted on, so
		// walking round the planet shifts it against the stars.
		const moonPlace = windRotation(
			new Vec3(0.2, 0.55, 0.81).normalize(),
			NORTH,
			(elapsed / (DAY_LENGTH * 1.35)) * 2 * Math.PI,
		).scale(MOON_DISTANCE);
		const moon = moonPlace.sub(from).normalize();

		// Under the surface is a radius now, not a block: the sea holds none.
		const submerged =
			from.length() < shape.seaSurfaceRadius ||
			probe.blockAtPosition(from) === BlockType.WATER;
		// The only shadow left is the sun's own depth buffers: sharp enough to
		// shadow one block by the next, and the only one of the two the map
		// walk used to share that can hold a thing nobody generated. A shadow
		// takes away the direct sun entirely, which is what a face already
		// turned away from it gets from the sky alone.
		renderer.cascades.setSize(current.knobs.shadowTexels);
		renderer.cascades.setLook(
			PLAIN || !current.knobs.cascadeShadows ? 0 : 1,
			current.knobs.cascadeReach,
		);
		renderer.atmosphere.inScatteringPoints =
			current.knobs.inScatteringPoints;
		renderer.atmosphere.opticalDepthPoints =
			current.knobs.opticalDepthPoints;
		renderer.atmosphere.ditherStrength = current.knobs.skyDither;
		renderer.bloom.enabled = current.knobs.bloomOn;
		renderer.bloom.threshold = current.knobs.bloomThreshold;
		renderer.bloom.strength = current.knobs.bloomStrength;
		renderer.superSample = current.knobs.superSample;
		renderer.cloudShadow.setSize(current.knobs.shadowTexels);
		// Where the cloud shadow box is centred. Nothing set this while the
		// coarse map was on the GPU and the renderer could read sea level off
		// it directly; with the map gone the client is the only thing that
		// still knows, and left at zero the box centres on the planet's own
		// centre and spends half of itself under the ground.
		renderer.groundRadius = shape.seaLevelRadius;
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
		// **The margin beyond the edge of the screen is an angle on the
		// frustum, not metres on every chunk.** What is kept is ground a turn
		// could bring on screen, which is a widening of the four side planes
		// and of nothing else; adding the same reach to each chunk's own test
		// volume grew it 8.2 times in radius and 512 times in volume, and
		// pushed it at the near and far planes as well.
		//
		// The vertical angle is widened enough that the horizontal one grows by
		// the margin too. The aspect ratio turns a vertical widening into a
		// smaller horizontal one, so taking the vertical figure alone would
		// keep less to the sides than the knob asks for -- and the sides are
		// where turning brings ground on.
		const halfUp = FIELD_OF_VIEW / 2;
		const aspect = canvas.width / canvas.height;
		const halfAcross = Math.atan(Math.tan(halfUp) * aspect);
		const wideUp = Math.max(
			halfUp + CULL_MARGIN,
			Math.atan(
				Math.tan(Math.min(1.5, halfAcross + CULL_MARGIN)) / aspect,
			),
		);
		const cullViewProj = Mat4.perspective(
			Math.min(3.0, 2 * wideUp),
			aspect,
			Math.max(0.2, overGround * 0.01),
			RADIUS * 20,
		).multiply(view);
		// What the next selection reads: where the picture was actually taken
		// from, and what it reached. The camera is not the player -- the wheel
		// puts it up to 60 m back -- and from up there the horizon is a long
		// way past the one a standing eye has.
		viewing = {
			position: from,
			eyeRadius: from.length(),
			viewProj,
			frustum: new Frustum(cullViewProj),
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
			sunLight: current.knobs.sunStrength,
			skyShading: current.knobs.skyShading,
			skyLight: current.knobs.skyStrength,
			fullbright: current.knobs.fullbright ? 1 : 0,
			moonLight: PLAIN ? 0 : current.knobs.moonLight,
			exposure: current.knobs.exposure,
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
				`${clock(day)} · ${flying ? "flying" : player.swimming(probe) ? "swimming" : "walking"}` +
					(submerged ? " · under water" : ""),
				// What a click would do, and how much of this world is a
				// player's rather than the seed's.
				`${aimingSays(aimed)} · ${edits.count} changed`,
				...(bounds.boxes.length > 0
					? [
							`${bounds.boxes.length} of ${boundsHeld} bounds drawn, nearest first`,
						]
					: []),
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
				(looking()
					? "WASD move · mouse look · click break · right click place · Esc cursor"
					: "WASD move · click the world to look around") +
					` · E ${flying ? "land here" : "drop to ground"}` +
					" · F fly · T next pentagon · G go to",
			]);
		}
		timer.end(performance.now());
		if (!given) requestAnimationFrame(draw);
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
