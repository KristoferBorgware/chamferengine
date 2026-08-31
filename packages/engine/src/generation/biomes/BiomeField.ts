import type { BiomeDef } from "./BiomeDef.js";
import type { BiomeSettings } from "./BiomeSettings.js";
import type { BiomeWorld } from "./BiomeWorld.js";
import type { ClimateFit } from "./ClimateFit.js";
import type { LandformGrid } from "./LandformGrid.js";
import type { NoiseSettings } from "../noise/NoiseSettings.js";
import { Vec3 } from "../../math/Vec3.js";
import { BIOME_DEFAULTS } from "./BiomeSettings.js";
import { DEFAULT_LANDFORM_GRID } from "./LandformGrid.js";
import { UNFITTED } from "./ClimateFit.js";
import { allowedBiomes } from "./allowedBiomes.js";
import { biomeOf } from "./biomeOf.js";
import { landformAt } from "./landformAt.js";
import { splineAt } from "../coarse/splineAt.js";
import {
	CONTINENT_SEED_OFFSET,
	EROSION_SEED_OFFSET,
	PEAKS_SEED_OFFSET,
	layerNoiseSettings,
} from "../coarse/layeredHeight.js";
import { octaveNoise } from "../noise/octaveNoise.js";
import { hash3 } from "../noise/hash3.js";
import { CELL_CONSTANT } from "../../world/CELL_CONSTANT.js";
import { frameOf } from "../../coordinates/frameOf.js";
import { latticePosition } from "../../addressing/lattice/latticePosition.js";
import { directionToCell } from "../../addressing/lookup/directionToCell.js";
import { canonicalCell } from "../../addressing/neighbours/canonicalCell.js";
import { neighbour } from "../../addressing/neighbours/neighbour.js";
import { NORTH } from "../../addressing/solid/polarAxis.js";

/**
 * Offsets from the world seed, so every climate field is its own field.
 *
 * The terrain offsets are the map's; these take numbers of their own beside
 * them, and two more salt the region jitter's two axes.
 */
const TEMP_SEED_OFFSET = 449;
const HUM_SEED_OFFSET = 557;
const WARP_T_SEED_OFFSET = 613;
const WARP_H_SEED_OFFSET = 811;
const REGION_A_SEED_OFFSET = 991;
const REGION_B_SEED_OFFSET = 997;

/** How high the ground stands to lose one full unit of temperature, in metres. */
const LAPSE_METRES = 1000;

/**
 * The lattice level the climate fit is measured over: 10,242 cells.
 *
 * Enough land samples that a 2nd percentile is a real reading, and few enough
 * that every construction of a field measures it in milliseconds.
 */
const TALLY_LEVEL = 5;

/** The percentile the fit trims at either end. */
const FIT_TAIL = 0.02;

/**
 * How far a region seed may wander inside its own lattice cell, as a share of
 * the cell.
 *
 * Seeds on a bare lattice draw a honeycomb, and a planet cut into regular
 * hexagons reads as a board game. Jittered by their own address they draw a
 * Voronoi diagram of scattered points, with the same average size and none of
 * the regularity.
 */
const REGION_JITTER = 0.45;

/**
 * How far out the region lookup walks for candidate seeds, in rings of
 * lattice cells.
 *
 * **This is what keeps a region a local question.** A seed sits within
 * `REGION_JITTER` of a cell from its own lattice point, so the nearest one to
 * a place is within two rings of that place's own cell and cannot be further.
 * Two rings is nineteen candidates, known before the walk starts -- a chunk
 * finds its regions from its own address, with no flood fill.
 */
const REGION_RINGS = 2;

/** The finest lattice the region seeds are allowed to sit on. */
const MAX_REGION_LEVEL = 12;

/** One region seed: its place on the sphere, and the climate its whole region takes. */
interface RegionSeed {
	readonly key: number;
	readonly x: number;
	readonly y: number;
	readonly z: number;
	readonly t: number;
	readonly h: number;
}

/**
 * Everything the biome model reads at one place, held mutable so a caller
 * sampling thousands of cells fills one record rather than allocating one
 * per cell.
 *
 * The record splits where the work splits: everything up to `h` is a function
 * of the fields and the knobs, and `landform` and `biome` are the table's
 * answer over it -- so a bench that moves a dot re-resolves held samples
 * without touching a noise stack.
 */
export interface BiomeSample {
	/** Metres above sea level, off the map. */
	metres: number;

	/** The three landform readings: the curves' answers, `0` to `1`. */
	level: number;
	cut: number;
	swing: number;

	/** How many of the shore rule's six points are low land. */
	room: number;

	/** The finished climate, `0` to `1` in the fitted square. */
	t: number;
	h: number;

	/** The push the warp added, `-1` to `1` per axis. */
	pushT: number;
	pushH: number;

	/** The region's key, or `-1` with regions off. */
	region: number;

	/** The landform index, `-1` in the sea. */
	landform: number;

	/** The biome index into the table, `-1` in the sea. */
	biome: number;
}

/** A sample record, zeroed. */
export function makeBiomeSample(): BiomeSample {
	return {
		metres: 0,
		level: 0,
		cut: 0,
		swing: 0,
		room: 0,
		t: 0,
		h: 0,
		pushT: 0,
		pushH: 0,
		region: -1,
		landform: -1,
		biome: -1,
	};
}

/**
 * The biome at any place on a world, as a pure function of the seed and the
 * address.
 *
 * **Two stages: the terrain names the landform, the climate names the type.**
 * The three terrain layers are read through their own curves and cut into a
 * grid that says what kind of place this is -- shore, valley, lowland, slope,
 * plateau or peak -- and the climate square then chooses among the biomes
 * filed under that kind alone. Temperature is latitude, altitude and noise;
 * humidity is distance-from-the-coast and noise; both are stretched onto the
 * range the planet's own land reaches, pushed by a two-field warp so no border
 * is a contour, and read once per region so a biome is a place rather than a
 * wobble.
 *
 * Everything here is chunk-local: noise from the direction in 3D world space,
 * heights off the map, region seeds from a bounded ring walk. Nothing flood
 * fills and nothing reads a neighbour a chunk does not hold.
 */
export class BiomeField {
	readonly world: BiomeWorld;
	readonly biomes: readonly BiomeDef[];
	readonly grid: LandformGrid;
	readonly settings: Required<BiomeSettings>;

	/** The dry belts' own share of the sphere, which is what they give back. */
	private readonly beltMean: number;

	/** Where the climate square starts and stops, measured over the land. */
	readonly fit: ClimateFit;

	/** The lattice level the region seeds sit on, from the span asked for. */
	readonly regionLevel: number;

	/** The biomes each landform may build, as indices into the table. */
	readonly allowed: readonly (readonly number[])[];

	private readonly tempNoise: NoiseSettings;
	private readonly humNoise: NoiseSettings;
	private readonly warpNoise: NoiseSettings;
	private readonly contNoise: NoiseSettings;
	private readonly eroNoise: NoiseSettings;
	private readonly formNoise: NoiseSettings;

	/** Region seeds by cell key, and each home cell's candidate list. */
	private readonly seeds = new Map<number, RegionSeed>();
	private readonly around = new Map<number, RegionSeed[]>();

	constructor(
		world: BiomeWorld,
		biomes: readonly BiomeDef[],
		grid: LandformGrid = DEFAULT_LANDFORM_GRID,
		options: BiomeSettings = {},
	) {
		this.world = world;
		this.biomes = biomes;
		this.grid = grid;
		const s = { ...BIOME_DEFAULTS, ...options };
		this.settings = s;
		this.allowed = allowedBiomes(biomes);

		const stack = (feature: number, octaves: number): NoiseSettings => ({
			frequency: world.radius / Math.max(1, feature),
			octaves: Math.round(octaves),
			persistence: 0.5,
			lacunarity: 2,
			offsetX: 0,
			offsetY: 0,
			ridge: 0,
		});
		this.tempNoise = stack(s.tempFeature, s.tempOctaves);
		this.humNoise = stack(s.humFeature, s.humOctaves);
		this.warpNoise = stack(s.warpFeature, s.warpOctaves);
		this.contNoise = layerNoiseSettings(world.continent, world.radius);
		this.eroNoise = layerNoiseSettings(world.erosion, world.radius);
		// The landform reads the relief field at its own octave count. The
		// terrain's stack runs to a narrow octave because its job is to carve
		// one gully; asking it what kind of place this is at that size asks a
		// per-gully question. Same field, same curve, same seed -- fewer
		// octaves.
		this.formNoise = layerNoiseSettings(
			{ ...world.peaks, octaves: Math.round(s.formDetail) },
			world.radius,
		);
		// The bump's own mean over the sphere, taken exactly. Area is uniform
		// in `away`, so this is the integral of `(1 - d²)²` over the part of
		// the belt that lands inside `[0, 1]`, times the half-width.
		const edge = (at: number): number =>
			at - (2 * at * at * at) / 3 + (at * at * at * at * at) / 5;
		const lo = Math.max(
			-1,
			(0 - s.humBeltAt) / Math.max(1e-9, s.humBeltWidth),
		);
		const hi = Math.min(
			1,
			(1 - s.humBeltAt) / Math.max(1e-9, s.humBeltWidth),
		);
		this.beltMean = hi > lo ? s.humBeltWidth * (edge(hi) - edge(lo)) : 0;
		this.regionLevel = Math.max(
			0,
			Math.min(
				MAX_REGION_LEVEL,
				Math.round(
					Math.log2(
						(CELL_CONSTANT * world.radius) /
							Math.max(1, s.regionSpan),
					),
				),
			),
		);
		this.fit = this.measureFit();
	}

	/** Metres across one region, on average, from the level the span rounded to. */
	get regionMetres(): number {
		return (CELL_CONSTANT * this.world.radius) / 2 ** this.regionLevel;
	}

	/**
	 * Temperature and humidity at one place, each roughly `-1` to `1`, before
	 * the fit.
	 *
	 * Three terms decide temperature and none of them is a biome: latitude is
	 * one dot product against the axis, altitude cools what stands up out of
	 * the ground -- the term that puts snow on a mountain in a warm band --
	 * and noise stops the planet reading as a set of stripes. Humidity is the
	 * continent field, dried inland, plus its own noise, and dried again by
	 * elevation when `humLapse` is set -- the same shape as temperature's
	 * own lapse, so a summit reads colder and drier together rather than
	 * only colder.
	 */
	private climateAt(
		x: number,
		y: number,
		z: number,
		rawContinent: number,
		metres: number,
		out: { t: number; h: number },
	): void {
		const s = this.settings;
		const seed = this.world.seed;
		const away = Math.abs(x * NORTH.x + y * NORTH.y + z * NORTH.z);
		const tempLapse =
			metres > 0 ? (s.tempLapse * metres) / LAPSE_METRES : 0;
		const humLapse = metres > 0 ? (s.humLapse * metres) / LAPSE_METRES : 0;
		out.t =
			s.tempEquator * (1 - 2 * away) +
			s.tempNoise *
				octaveNoise(x, y, z, seed + TEMP_SEED_OFFSET, this.tempNoise) -
			tempLapse;
		out.h =
			-s.humOcean * rawContinent +
			s.humNoise *
				octaveNoise(x, y, z, seed + HUM_SEED_OFFSET, this.humNoise) -
			humLapse +
			this.beltAt(away);
	}

	/**
	 * How much the dry belts move humidity at one latitude, on average zero.
	 *
	 * **A bump, and then its own share taken back off.** The belt is dried by
	 * up to `humBelt` and everywhere else is wetted by what the belt removed,
	 * so the term redistributes moisture instead of removing it -- the belt
	 * gets drier as the knob rises and the rest of the world gets slightly
	 * wetter, which is what the circulation it stands in for does and what
	 * keeps this from doubling as a wetness slider.
	 *
	 * **The bump is `(1 - d²)²` rather than `1 - d²`**, because the plain
	 * parabola meets zero with a slope still on it and that kink draws as a
	 * line of its own across the map at both edges of the belt. Squaring it
	 * brings the slope to zero as well. It is polynomial throughout: a
	 * transcendental here would be read by two clients that have to agree on
	 * the ground to the bit (doc 23).
	 *
	 * **The share taken back is exact rather than sampled**, because area on
	 * a sphere is uniform in `away` -- the sine of the latitude -- so the
	 * bump's mean over the whole planet is its integral over `[0, 1]`, and
	 * `(1 - d²)²` integrates to `16/15` of its half-width. A belt running off
	 * either end of that range is clipped, so the integral is taken over what
	 * is left.
	 */
	private beltAt(away: number): number {
		const s = this.settings;
		if (!s.humBelt) return 0;
		const width = s.humBeltWidth;
		if (width <= 0) return 0;
		const d = (away - s.humBeltAt) / width;
		const under = 1 - d * d;
		const bump = under > 0 ? under * under : 0;
		return s.humBelt * (this.beltMean - bump);
	}

	/** The two-field push, `-1` to `1` per axis. */
	private warpAt(
		x: number,
		y: number,
		z: number,
		out: { t: number; h: number },
	): void {
		const seed = this.world.seed;
		out.t = octaveNoise(x, y, z, seed + WARP_T_SEED_OFFSET, this.warpNoise);
		out.h = octaveNoise(x, y, z, seed + WARP_H_SEED_OFFSET, this.warpNoise);
	}

	/**
	 * A raw climate as a point in the diagram's own square, pushed and
	 * clamped.
	 */
	private squareOf(
		t: number,
		h: number,
		pushT: number,
		pushH: number,
		out: { t: number; h: number },
	): void {
		const s = this.settings;
		const push = s.warp ? s.warpStrength : 0;
		const fit = this.fit ?? UNFITTED;
		out.t = Math.max(
			0,
			Math.min(1, (t - fit.tLo) / fit.tSpan + push * pushT),
		);
		out.h = Math.max(
			0,
			Math.min(1, (h - fit.hLo) / fit.hSpan + push * pushH),
		);
	}

	/**
	 * Where the climate square starts and stops, measured over the planet's
	 * own land.
	 *
	 * Every climate term is a noise stack or a weighted sum of them, and a
	 * stack normalized to its own peak has a standard deviation of about a
	 * quarter of it -- so the raw readings cluster in the middle of the square
	 * and its corners name climates no ground is in. The ends are the land's
	 * 2nd and 98th percentiles, and the outer tails saturating is what makes a
	 * desert a region rather than a rim.
	 */
	private measureFit(): ClimateFit {
		// A span named outright is read as it stands: it is a constant so
		// that one reading names one dot on every world, which is the whole
		// reason a caller supplies one rather than letting this measure.
		if (this.settings.climateFit) return this.settings.climateFit;
		if (!this.settings.fit) return UNFITTED;
		const n = 1 << TALLY_LEVEL;
		const t: number[] = [];
		const h: number[] = [];
		const climate = { t: 0, h: 0 };
		for (let face = 0; face < 20; face++)
			for (let i = 0; i <= n; i++)
				for (let j = 0; i + j <= n; j++) {
					// A cell on a face edge has several names; the owning face
					// counts it once.
					if (canonicalCell(face, n, i, j).face !== face) continue;
					const p = latticePosition(face, n, i, j);
					const metres = this.world.heightAt(p.x, p.y, p.z);
					if (metres <= 0) continue;
					const rawCont = octaveNoise(
						p.x,
						p.y,
						p.z,
						this.world.seed + CONTINENT_SEED_OFFSET,
						this.contNoise,
					);
					this.climateAt(p.x, p.y, p.z, rawCont, metres, climate);
					t.push(climate.t);
					h.push(climate.h);
				}
		if (t.length < 16) return UNFITTED;
		t.sort((a, b) => a - b);
		h.sort((a, b) => a - b);
		const tLo = percentile(t, FIT_TAIL);
		const hLo = percentile(h, FIT_TAIL);
		return {
			tLo,
			hLo,
			tSpan: Math.max(1e-6, percentile(t, 1 - FIT_TAIL) - tLo),
			hSpan: Math.max(1e-6, percentile(h, 1 - FIT_TAIL) - hLo),
			fitted: true,
		};
	}

	/** A region seed's place, jittered off its lattice point. */
	private seedDirection(face: number, i: number, j: number): Vec3 {
		const n = 1 << this.regionLevel;
		const seed = this.world.seed;
		const p = latticePosition(face, n, i, j);
		const f = frameOf(p);
		// The cell's angular width, which is `K / n` at every radius.
		const reach = (REGION_JITTER * CELL_CONSTANT) / n;
		const a =
			(hash3(i, j, face, seed + REGION_A_SEED_OFFSET) * 2 - 1) * reach;
		const b =
			(hash3(j, face, i, seed + REGION_B_SEED_OFFSET) * 2 - 1) * reach;
		return new Vec3(
			p.x + f.east.x * a + f.north.x * b,
			p.y + f.east.y * a + f.north.y * b,
			p.z + f.east.z * a + f.north.z * b,
		).normalize();
	}

	/** One seed, by its lattice cell, with the climate its whole region takes. */
	private heldSeed(face: number, i: number, j: number): RegionSeed {
		const n = 1 << this.regionLevel;
		const key = (face * (n + 1) + i) * (n + 1) + j;
		let at = this.seeds.get(key);
		if (at !== undefined) return at;
		const p = this.seedDirection(face, i, j);
		// The seed's own climate, which is what the whole region takes: one
		// reading, not an average of a region's worth.
		const rawCont = octaveNoise(
			p.x,
			p.y,
			p.z,
			this.world.seed + CONTINENT_SEED_OFFSET,
			this.contNoise,
		);
		const metres = this.world.heightAt(p.x, p.y, p.z);
		const climate = { t: 0, h: 0 };
		const push = { t: 0, h: 0 };
		this.climateAt(p.x, p.y, p.z, rawCont, metres, climate);
		this.warpAt(p.x, p.y, p.z, push);
		const square = { t: 0, h: 0 };
		this.squareOf(climate.t, climate.h, push.t, push.h, square);
		at = { key, x: p.x, y: p.y, z: p.z, t: square.t, h: square.h };
		this.seeds.set(key, at);
		return at;
	}

	/**
	 * The region a direction is in: the nearest seed, warped so the edge is
	 * not a straight line.
	 *
	 * **The region is the unit of climate, and the cell is the unit of
	 * ground.** A biome that changes whenever the temperature wobbles across a
	 * line in the diagram is a biome nobody can name; one that holds over a
	 * whole region and changes at its edge is a place. The landform is still
	 * read per cell -- a mountain inside a region is still a mountain.
	 *
	 * Every point of one lattice cell has the same candidates, so the ring
	 * walk runs once per cell rather than once per point.
	 */
	private regionAt(x: number, y: number, z: number): RegionSeed {
		const s = this.settings;
		const n = 1 << this.regionLevel;
		let px = x;
		let py = y;
		let pz = z;
		if (s.regionWarp > 0) {
			// The edge of a region is bent by the same field that frays a
			// biome border: pushing the question somewhere else before it is
			// asked bends every edge without moving a seed.
			const push = { t: 0, h: 0 };
			this.warpAt(x, y, z, push);
			const f = frameOf(new Vec3(x, y, z));
			const reach = s.regionWarp / this.world.radius;
			px += (f.east.x * push.t + f.north.x * push.h) * reach;
			py += (f.east.y * push.t + f.north.y * push.h) * reach;
			pz += (f.east.z * push.t + f.north.z * push.h) * reach;
			const len = Math.sqrt(px * px + py * py + pz * pz);
			px /= len;
			py /= len;
			pz /= len;
		}
		const found = directionToCell(new Vec3(px, py, pz), n);
		const home = canonicalCell(found.face, n, found.i, found.j);
		const key = (home.face * (n + 1) + home.i) * (n + 1) + home.j;
		let near = this.around.get(key);
		if (near === undefined) {
			const seen = new Set([key]);
			near = [this.heldSeed(home.face, home.i, home.j)];
			let ring = [home];
			for (let r = 0; r < REGION_RINGS; r++) {
				const next = [];
				for (const cell of ring)
					for (let d = 0; d < 6; d++) {
						const nb = neighbour(cell.face, n, cell.i, cell.j, d);
						if (!nb) continue;
						const at = canonicalCell(nb.face, n, nb.i, nb.j);
						const key2 =
							(at.face * (n + 1) + at.i) * (n + 1) + at.j;
						if (seen.has(key2)) continue;
						seen.add(key2);
						near.push(this.heldSeed(at.face, at.i, at.j));
						next.push(at);
					}
				ring = next;
			}
			this.around.set(key, near);
		}
		let best = near[0]!;
		let far = -Infinity;
		for (let c = 0; c < near.length; c++) {
			const at = near[c]!;
			const d = at.x * px + at.y * py + at.z * pz;
			if (d > far) {
				far = d;
				best = at;
			}
		}
		return best;
	}

	/**
	 * How many of the six points one shore-reach out are low land, which is
	 * how much room a beach has.
	 *
	 * **A beach is a strip of low ground, not a cell that happens to be low.**
	 * The height field runs several octaves, so on a steep coast a single cell
	 * lands in the shore band with a hillside on one side and the sea on the
	 * other -- and the coast then draws as a dotted line of isolated pale
	 * cells. Only the shore band asks, so only the shore band reads the six
	 * extra heights.
	 */
	private roomAt(x: number, y: number, z: number, metres: number): number {
		const s = this.settings;
		if (metres > s.shoreHeight || metres <= 0) return 0;
		const f = frameOf(new Vec3(x, y, z));
		const step = s.shoreReach / this.world.radius;
		let room = 0;
		for (let n = 0; n < 6; n++) {
			const a = (n / 6) * Math.PI * 2;
			const u = Math.cos(a) * step;
			const v = Math.sin(a) * step;
			const p = new Vec3(
				x + f.east.x * u + f.north.x * v,
				y + f.east.y * u + f.north.y * v,
				z + f.east.z * u + f.north.z * v,
			).normalize();
			const h = this.world.heightAt(p.x, p.y, p.z);
			if (h > 0 && h <= s.shoreHeight) room++;
		}
		return room;
	}

	/**
	 * Everything the model reads at one place, short of the table.
	 *
	 * Fills the sample's field half -- metres, the three landform readings,
	 * the room, the finished climate and the region -- and leaves `landform`
	 * and `biome` to {@link resolve}, so a caller holding thousands of samples
	 * re-resolves them against an edited table without touching a noise stack.
	 */
	sampleAt(x: number, y: number, z: number, out: BiomeSample): void {
		const seed = this.world.seed;
		const rawCont = octaveNoise(
			x,
			y,
			z,
			seed + CONTINENT_SEED_OFFSET,
			this.contNoise,
		);
		const rawEro = octaveNoise(
			x,
			y,
			z,
			seed + EROSION_SEED_OFFSET,
			this.eroNoise,
		);
		const metres = this.world.heightAt(x, y, z);
		out.metres = metres;
		out.level = splineAt(this.world.continent.curve, rawCont);
		out.cut = splineAt(this.world.erosion.curve, rawEro);
		out.swing = splineAt(
			this.world.peaks.curve,
			octaveNoise(x, y, z, seed + PEAKS_SEED_OFFSET, this.formNoise),
		);
		out.room = this.roomAt(x, y, z, metres);

		const climate = { t: 0, h: 0 };
		this.climateAt(x, y, z, rawCont, metres, climate);
		const push = { t: 0, h: 0 };
		this.warpAt(x, y, z, push);
		out.pushT = push.t;
		out.pushH = push.h;
		const square = { t: 0, h: 0 };
		this.squareOf(climate.t, climate.h, push.t, push.h, square);
		if (this.settings.regions) {
			const region = this.regionAt(x, y, z);
			const pull = this.settings.regionClimate;
			out.t = square.t + (region.t - square.t) * pull;
			out.h = square.h + (region.h - square.h) * pull;
			out.region = region.key;
		} else {
			out.t = square.t;
			out.h = square.h;
			out.region = -1;
		}
	}

	/**
	 * The table's answer over a held sample: the landform, then the biome.
	 *
	 * Split from {@link sampleAt} because it is the only part an edit to the
	 * diagram or the grid changes.
	 */
	resolve(out: BiomeSample): number {
		out.landform = landformAt(
			out.level,
			out.cut,
			out.swing,
			// **A share of the ground this world reaches.** The other three
			// readings are curves' answers and already run `0` to `1`; a
			// height is metres, and metres mean a different thing on a world
			// with a 300 m relief than on one with 900.
			Math.min(1, Math.max(0, out.metres / this.settings.groundTop)),
			out.metres,
			out.room,
			this.settings.shoreHeight,
			this.grid,
		);
		out.biome =
			out.landform < 0
				? -1
				: biomeOf(
						out.t,
						out.h,
						this.allowed[out.landform],
						this.biomes,
					);
		return out.biome;
	}

	/** The biome at a unit direction: a sample and its resolution in one call. */
	readAt(x: number, y: number, z: number, out: BiomeSample): number {
		this.sampleAt(x, y, z, out);
		return this.resolve(out);
	}

	/**
	 * The block the ground's surface is made of at a unit direction, or `-1`
	 * where there is no land for a biome to stand on.
	 */
	blockAt(x: number, y: number, z: number, scratch: BiomeSample): number {
		const biome = this.readAt(x, y, z, scratch);
		return biome < 0 ? -1 : this.biomes[biome]!.block;
	}
}

/** A value at a fraction of a sorted list, nearest-rank. */
function percentile(sorted: readonly number[], at: number): number {
	if (sorted.length === 0) return 0;
	return sorted[
		Math.max(
			0,
			Math.min(sorted.length - 1, Math.round(at * (sorted.length - 1))),
		)
	]!;
}
