import type { ColumnPatch } from "chamfer/mesh";
import type { CoarseGrid } from "chamfer/generation";
import type { PlanetSettings } from "./PlanetSettings.js";
import { AIR, CUT, MAX_CAVE_LAYERS, ROCK, VOID } from "./CaveBlock.js";
import {
	CARVE_LAYER_DEFAULT,
	carveDepth,
	carveIsRock,
	carveSeed,
	caveCeilingAt,
	caveDensity,
	layerNoiseSettings,
	makeBlend,
	octaveNoise,
	readBlend,
} from "chamfer/generation";
import { Vec3 } from "chamfer/math";

/** How many lattice lookups one reading of the cave field costs. */
const CAVE_OCTAVES = 3;

/** How many one reading of the ceiling field costs. */
const MOUTH_OCTAVES = 2;

/** A patch of the world as blocks, and the numbers that came out of building it. */
export interface CaveVolume {
	/** Columns, which is the patch's own cell count. */
	readonly count: number;

	/** Block layers per column, the same for every one of them. */
	readonly layers: number;

	/** One block, in metres. */
	readonly blockMetres: number;

	/**
	 * One byte a block: `count * layers`, **index `0` at the top**.
	 *
	 * Downward, the way the world's own layer index runs, so the first entry a
	 * walk meets is the one under the open sky.
	 */
	readonly kind: Uint8Array;

	/** Per column, the world layer index its entry `0` stands at. */
	readonly topLayer: Int32Array;

	/** Per column, where the map put the ground, in metres above sea level. */
	readonly surface: Float64Array;

	/** Per column, what the four layer curves returned, for the pictures. */
	readonly raw: Float32Array;
	readonly continent: Float32Array;
	readonly erosion: Float32Array;
	readonly peaks: Float32Array;
	readonly carve: Float32Array;

	/** Per column, the metres of rock its caves keep over their roof. */
	readonly ceiling: Float32Array;

	/**
	 * Lattice lookups the walk made.
	 *
	 * Counted rather than reasoned about: both layers pay for the ground over
	 * them as well as for what they cut, and it is the total that is the bill.
	 */
	readonly lookups: number;

	/** How long the walk took, in milliseconds. */
	readonly ms: number;
}

/** The map fields a column walk reads, which the coarse map holds. */
export interface CaveGround {
	readonly height: Float32Array;
	readonly raw: Float32Array;
	readonly continent: Float32Array;
	readonly erosion: Float32Array;
	readonly peaks: Float32Array;
}

/**
 * Every column of the patch walked, block by block, by the engine's own rules.
 *
 * **Every layer is a fresh lookup.** A carve that decided its cave from the
 * ground alone could read once a column and fill the slab underneath; this one
 * cannot, because a passage is free to be at any depth and asking is the only
 * way to find out. That is what a sheet costs and it is the largest number on
 * the readout.
 *
 * The two layers run in the order the generator runs them: the carve decides
 * whether there is a block here at all, and the caves hollow what it left. What
 * each took is kept apart, because a cave number that counted the carve's
 * blocks would be a number about two layers.
 *
 * **The map is read the way the world reads it** -- one blend of the three map
 * samples around each column's direction -- so the ground here is the ground
 * the world would build there rather than a second evaluation of the noise that
 * agrees with it only approximately.
 */
export function caveVolume(
	patch: ColumnPatch,
	grid: CoarseGrid,
	fields: CaveGround,
	settings: PlanetSettings,
): CaveVolume {
	const started = performance.now();
	const terrain = settings.terrainOptions();
	const radius = settings.radius;
	const block = settings.knobs.blockSize;
	const seed = settings.seedNumber;

	// `terrainOptions` always fills it; the type has it optional because the
	// engine's own default stands in for a caller that leaves it out.
	const carve = terrain.carve ?? CARVE_LAYER_DEFAULT;
	const carveNoise = layerNoiseSettings(carve, radius);
	const carveOn = terrain.carveLayer === true;
	const carveReach = carveDepth(carve);
	const carveOctaves = carveNoise.octaves;
	const seedForCarve = carveSeed(seed);

	const cavesOn = terrain.caves === true;
	const caveScale = terrain.caveScale ?? 24;
	const caveThreshold = terrain.caveThreshold ?? 0.12;

	// **Every column is walked the same number of layers**, so the array is
	// rectangular and a block's index is arithmetic. The top of each column's
	// run is its own ground rounded down to a layer boundary, which is the grid
	// the world cuts blocks on -- two neighbouring columns therefore cut theirs
	// on the same planes and a step between them is a block rather than a
	// rounding.
	const layers = Math.max(
		2,
		Math.min(MAX_CAVE_LAYERS, Math.ceil(settings.knobs.caveCrust / block)),
	);

	const count = patch.count;
	const kind = new Uint8Array(count * layers);
	const topLayer = new Int32Array(count);
	const surface = new Float64Array(count);
	const raw = new Float32Array(count);
	const continent = new Float32Array(count);
	const erosion = new Float32Array(count);
	const peaks = new Float32Array(count);
	const carveOf = new Float32Array(count);
	const ceilingOf = new Float32Array(count);

	let caveReads = 0;
	let carveReads = 0;
	let mouthReads = 0;

	const blend = makeBlend();
	for (let c = 0; c < count; c++) {
		// A `Vec3` a column rather than one refilled: it is immutable, and an
		// allocation here is one per column against a walk of hundreds of
		// blocks inside it.
		const dir = new Vec3(
			patch.directions[c * 3]!,
			patch.directions[c * 3 + 1]!,
			patch.directions[c * 3 + 2]!,
		);
		grid.blendInto(dir, blend);
		const ground = readBlend(fields.height, blend);
		surface[c] = ground;
		raw[c] = readBlend(fields.raw, blend);
		continent[c] = readBlend(fields.continent, blend);
		erosion[c] = readBlend(fields.erosion, blend);
		peaks[c] = readBlend(fields.peaks, blend);

		// **The ceiling is a fact about the column**, so it is read once here
		// and every block of the column is under the same amount of rock.
		const ceiling = cavesOn
			? caveCeilingAt(
					dir.x,
					dir.y,
					dir.z,
					radius,
					seed,
					terrain.caveCeiling ?? 6,
					terrain.caveVary ?? 0,
					terrain.caveRare ?? 0.7,
					terrain.caveMouthScale ?? 60,
				)
			: 0;
		ceilingOf[c] = ceiling;
		if (cavesOn && (terrain.caveVary ?? 0) > 0) mouthReads += MOUTH_OCTAVES;

		const top = Math.floor(ground / block);
		topLayer[c] = top;
		const base = c * layers;
		for (let L = 0; L < layers; L++) {
			const layer = top - L;
			const centre = (layer + 0.5) * block;
			if (centre >= ground) {
				kind[base + L] = AIR;
				continue;
			}
			const depthBelow = ground - centre;
			if (carveOn) {
				if (depthBelow < carveReach) carveReads += carveOctaves;
				if (
					!carveIsRock(
						dir.x,
						dir.y,
						dir.z,
						radius,
						ground,
						depthBelow,
						seedForCarve,
						carve,
						carveNoise,
						terrain.carveHold,
					)
				) {
					kind[base + L] = CUT;
					continue;
				}
			}
			if (cavesOn) {
				if (depthBelow >= ceiling) caveReads += CAVE_OCTAVES;
				if (
					caveDensity(
						dir.x,
						dir.y,
						dir.z,
						radius + centre,
						depthBelow,
						seed,
						caveScale,
						caveThreshold,
						ceiling,
					)
				) {
					kind[base + L] = VOID;
					continue;
				}
			}
			kind[base + L] = ROCK;
		}

		// **A picture of a 3D field has to be read somewhere**, and the top of
		// the rock is where a reader can compare it against the shape it cut.
		if (carveOn) {
			const out = 1 + ground / radius;
			carveOf[c] = octaveNoise(
				dir.x * out,
				dir.y * out,
				dir.z * out,
				seedForCarve,
				carveNoise,
			);
		}
	}

	return {
		count,
		layers,
		blockMetres: block,
		kind,
		topLayer,
		surface,
		raw,
		continent,
		erosion,
		peaks,
		carve: carveOf,
		ceiling: ceilingOf,
		lookups: caveReads + carveReads + mouthReads,
		ms: performance.now() - started,
	};
}
