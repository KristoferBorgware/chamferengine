import type { CavePlanSheet } from "./CaveMessage.js";
import type { CaveCellPlan } from "./caveCellsOf.js";
import type { CoarseGrid } from "chamfer/generation";
import type { ColumnPatch } from "chamfer/mesh";
import type { PlanetSettings } from "./PlanetSettings.js";
import {
	caveCeilingAt,
	caveField,
	makeBlend,
	readBlend,
} from "chamfer/generation";
import { Vec3 } from "chamfer/math";
import { columnFrame } from "chamfer/mesh";

/** How many field samples across the plan image is contoured on. */
export const PLAN_SAMPLES = 200;

/**
 * The cave field over the patch, at one depth under the ground.
 *
 * **A sheet has no plan of its own.** The zero set of a field in space is a set
 * of surfaces, so a plan of it is a slice -- what it carves six metres down is a
 * different picture from what it carves twenty metres down, and the panel names
 * which.
 *
 * **The raster is a picture and never a world.** Nothing here decides which
 * block is which: it is the field read on a square grid, which is what marching
 * squares is meant for and what the hexagons drawn over it are compared
 * against.
 *
 * The band is the whole gate in one number: the threshold where this column's
 * own ceiling lets a cave through at this depth, and zero where it does not --
 * so a dip in the ceiling reads on the plan as ground where the passage simply
 * is not.
 */
export function cavePlanField(
	patch: ColumnPatch,
	cells: CaveCellPlan,
	grid: CoarseGrid,
	height: Float32Array,
	settings: PlanetSettings,
): CavePlanSheet {
	const frame = columnFrame(patch.centre);
	const radius = settings.radius;
	const seed = settings.seedNumber;
	const terrain = settings.terrainOptions();
	const slice = settings.knobs.caveSlice;
	const scale = terrain.caveScale ?? 24;
	const threshold = terrain.caveThreshold ?? 0.12;
	const across = PLAN_SAMPLES;
	const value = new Float32Array(across * across);
	const band = new Float32Array(across * across);

	// One square over the rectangle the cells fill, so the raster and the
	// hexagons are pictures of the same ground and can be laid over one another.
	const wide = cells.high[0] - cells.low[0];
	const tall = cells.high[1] - cells.low[1];
	const blend = makeBlend();

	for (let r = 0; r < across; r++) {
		const north = cells.low[1] + (r / (across - 1)) * tall;
		for (let q = 0; q < across; q++) {
			const east = cells.low[0] + (q / (across - 1)) * wide;
			// Metres out from the middle become radians of arc, so the picture
			// keeps its scale out to the corners rather than stretching the way
			// a flat projection does.
			const u = east / radius;
			const v = north / radius;
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
			grid.blendInto(dir, blend);
			const ground = readBlend(height, blend);
			const at = r * across + q;
			// **The field the world is carved from**, read at the radius that
			// block stands at -- the same call the walk makes, so the picture
			// cannot drift from the blocks.
			value[at] = caveField(
				dir.x,
				dir.y,
				dir.z,
				radius + ground - slice,
				seed,
				scale,
			);
			const ceiling = caveCeilingAt(
				dir.x,
				dir.y,
				dir.z,
				radius,
				seed,
				terrain.caveCeiling ?? 6,
				terrain.caveVary ?? 0,
				terrain.caveRare ?? 0.7,
				terrain.caveMouthScale ?? 60,
			);
			band[at] = slice >= ceiling ? threshold : 0;
		}
	}

	return { across, span: Math.max(wide, tall), value, band };
}
