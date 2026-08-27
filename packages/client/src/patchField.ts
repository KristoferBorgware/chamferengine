import type { CoarseIndex } from "chamfer/generation";
import { Vec3 } from "chamfer/math";
import { makeBlend, readBlend } from "chamfer/generation";
import { positionOf } from "chamfer/coordinates";

/** The three axes of a patch: out of the ground, east, and north. */
export interface PatchFrame {
	readonly up: Vec3;
	readonly east: Vec3;
	readonly north: Vec3;
}

/** One patch of the map, sampled onto a square grid. */
export interface PatchField {
	/** Points across, one more than the number of cells. */
	readonly across: number;

	/** Metres between two points, which is one map cell. */
	readonly step: number;

	/** Metres from one side of the patch to the other. */
	readonly span: number;

	/** The ground in metres above sea level. */
	readonly height: Float32Array;

	/** The field before sea level was taken off it. */
	readonly raw: Float32Array;

	/** What each layer's curve returned, so a picture of either costs no rebuild. */
	readonly continent: Float32Array;
	readonly erosion: Float32Array;
	readonly peaks: Float32Array;

	/** Metres erosion moved the ground, zero everywhere when the water is off. */
	readonly cut: Float32Array;

	readonly lowest: number;
	readonly highest: number;
	readonly rawLow: number;
	readonly rawHigh: number;

	/** How much of the patch stands above the water. */
	readonly landShare: number;
}

/**
 * The three axes at a latitude and longitude, in degrees.
 *
 * **The planet's own axis, not the scene's.** Latitude and longitude here run
 * through the two pentagons doc 20 fixes the poles on, so a place read off the
 * bench is the place the world reports and a link carrying one lands where it
 * says. East is taken a degree along rather than from a world vector, because
 * there is no global north to build one from.
 */
export function patchFrame(latitude: number, longitude: number): PatchFrame {
	const at = (lat: number, lon: number): Vec3 =>
		positionOf({ latitude: lat, longitude: lon, altitude: 0 }, 1);
	const up = at(latitude, longitude);
	const along = at(latitude, longitude + 0.01);
	const east = new Vec3(
		along.x - up.x,
		along.y - up.y,
		along.z - up.z,
	).normalize();
	return { up, east, north: up.cross(east).normalize() };
}

/**
 * Read one patch of the map onto a square grid.
 *
 * **The 3D preview is hexagons and this is not, and that is deliberate.** The
 * flat picture and the contour graph both want rows and columns -- a pixel
 * grid, and a section along one -- and a hexagon lattice has neither. This
 * samples the map at the points a square grid puts down, through the same blend
 * the terrain generator reads it with, so both pictures describe the same
 * ground the hexagons do.
 *
 * Metres out from the middle become radians of arc, so the patch keeps its
 * scale right out to the corners rather than stretching the way a flat
 * projection does.
 */
export function patchField(
	index: CoarseIndex,
	fields: {
		readonly height: Float32Array;
		readonly raw: Float32Array;
		readonly continent: Float32Array;
		readonly erosion: Float32Array;
		readonly peaks: Float32Array;
		readonly cut: Float32Array | null;
	},
	options: {
		readonly frame: PatchFrame;
		readonly cells: number;
		readonly step: number;
		readonly radius: number;
	},
): PatchField {
	const { frame, cells, step, radius } = options;
	const across = cells + 1;
	const count = across * across;
	const height = new Float32Array(count);
	const raw = new Float32Array(count);
	const continent = new Float32Array(count);
	const erosion = new Float32Array(count);
	const peaks = new Float32Array(count);
	const cut = new Float32Array(count);
	const half = (cells / 2) * step;
	let lowest = Infinity;
	let highest = -Infinity;
	let rawLow = Infinity;
	let rawHigh = -Infinity;
	let land = 0;

	// One lookup a point, five fields read off it: finding the three cells a
	// direction stands between is a dozen times the work of the three
	// multiplies that follow, and every field here is read at the same place.
	const blend = makeBlend();

	for (let r = 0; r < across; r++) {
		const dy = r * step - half;
		for (let q = 0; q < across; q++) {
			const dx = q * step - half;
			const u = dx / radius;
			const v = dy / radius;
			const a = Math.sqrt(u * u + v * v);
			let dir: Vec3;
			if (a < 1e-12) dir = frame.up;
			else {
				const c = Math.cos(a);
				const s = Math.sin(a) / a;
				dir = new Vec3(
					frame.up.x * c + (frame.east.x * u + frame.north.x * v) * s,
					frame.up.y * c + (frame.east.y * u + frame.north.y * v) * s,
					frame.up.z * c + (frame.east.z * u + frame.north.z * v) * s,
				).normalize();
			}
			const at = r * across + q;
			index.blendInto(dir, blend);
			const metres = readBlend(fields.height, blend);
			height[at] = metres;
			raw[at] = readBlend(fields.raw, blend);
			continent[at] = readBlend(fields.continent, blend);
			erosion[at] = readBlend(fields.erosion, blend);
			peaks[at] = readBlend(fields.peaks, blend);
			if (fields.cut) cut[at] = readBlend(fields.cut, blend);
			if (metres < lowest) lowest = metres;
			if (metres > highest) highest = metres;
			if (raw[at]! < rawLow) rawLow = raw[at]!;
			if (raw[at]! > rawHigh) rawHigh = raw[at]!;
			if (metres > 0) land++;
		}
	}

	return {
		across,
		step,
		span: cells * step,
		height,
		raw,
		continent,
		erosion,
		peaks,
		cut,
		lowest,
		highest,
		rawLow,
		rawHigh,
		landShare: land / count,
	};
}
