// How deep the cliffs layer still opens anything.
//
//   npx vite-node tools/trial-carve-reach.ts
//
// **Cliffs and overhangs are a surface feature.** They cut into the ground the
// map placed and fade out on the way down; what is under them is the caves'.
// `CARVE_REACH` is what says how far down "on the way down" is, in shape
// widths -- and the density gains a full `1` over it, so a reading has to beat
// `depthBelow / reach` to open anything and past some depth it is refusing
// everything it is asked.
//
// Every block a column is walked costs a noise stack, so a reach set past that
// depth is bought and not used. This counts what share of the blocks at each
// depth the layer opens, over land columns of the shipped world.
import { PlanetSettings } from "../packages/client/src/PlanetSettings.js";
import {
	buildCoarseMap,
	carveDepth,
	carveIsRock,
	carveSeed,
	layerNoiseSettings,
	seedFromString,
} from "chamfer/generation";
import { latticePosition } from "chamfer/addressing";

const settings = new PlanetSettings({ plain: false });
const seed = seedFromString(settings.knobs.seed);
const map = buildCoarseMap(seed, settings.coarseOptions());
const shape = settings.shapeFor(map);
const layer = settings.layerFor("carve");
const noise = layerNoiseSettings(layer, shape.seaLevelRadius);
const carved = carveSeed(seed);
const hold = settings.knobs.carveHold;
const reach = carveDepth(layer);
const block = settings.knobs.blockSize;

/** Land columns spread over one face, which is where the layer does its work. */
const ACROSS = 220;
const depth = shape.subdivisionDepth;
const n = 2 ** depth;

/** The depths the profile is reported at, in metres under the ground. */
const DEPTHS = [5, 10, 20, 30, 50, 80, 120, 200, 300];

/** What one setting of the reach came to. */
function sweep(
	widths: number,
	squash: number,
): {
	opened: number[];
	overhangs: number;
	deep: number;
	columns: number;
} {
	const deep = carveDepth(layer, widths);
	const opened = DEPTHS.map(() => 0);
	let overhangs = 0;
	let columns = 0;
	for (let a = 0; a < ACROSS; a++)
		for (let b = 0; b + a < ACROSS; b++) {
			const i = Math.floor(((a + 0.5) / ACROSS) * n);
			const j = Math.floor(((b + 0.5) / ACROSS) * n);
			const elevation = map.heightAt(0, i, j, depth);
			// The layer holds off at and under the waterline, so a sea column
			// says nothing about how deep it reaches on land.
			if (elevation <= hold) continue;
			columns++;
			const p = latticePosition(0, n, i, j);
			const rock = (below: number): boolean =>
				carveIsRock(
					p.x,
					p.y,
					p.z,
					shape.seaLevelRadius,
					elevation,
					below,
					carved,
					layer,
					noise,
					hold,
					deep,
					squash,
				);
			for (let at = 0; at < DEPTHS.length; at++)
				if (!rock(DEPTHS[at]!)) opened[at]!++;
			// **Rock over air over rock is what the depth term buys, and the
			// count starts at the first rock.** A column whose top blocks are
			// gone and whose lower ones are not is the ground having moved
			// down, which is every column this layer touches -- counting that
			// as an overhang says the layer works at any depth at all.
			let found = false;
			let seenRock = false;
			let gap = false;
			for (let below = block / 2; below < deep; below += block) {
				const solid = rock(below);
				if (!seenRock) {
					seenRock = solid;
					continue;
				}
				if (!solid) gap = true;
				else if (gap) {
					found = true;
					break;
				}
			}
			if (found) overhangs++;
		}
	return {
		opened: opened.map((v) => v / Math.max(1, columns)),
		overhangs: overhangs / Math.max(1, columns),
		deep,
		columns,
	};
}

// **What every share below is a share of.** A measurement whose denominator
// is not on the page is a measurement nobody can check.
const sample = sweep(1, 1).columns;
console.log(
	`the shipped world: a ${layer.metres} m shape, ${block} m blocks,` +
		` cliffs held off ${hold} m above the water`,
);
console.log(
	`${sample.toLocaleString("en-US")} land columns over one face,` +
		` every share below is of those`,
);
for (const squash of [1, 2, 4, 8]) {
	console.log(
		`\nread x${squash} faster down a column than across the ground` +
			`\n reach        depth  ` +
			DEPTHS.map((d) => `${d}m`.padStart(7)).join("") +
			"   overhangs",
	);
	for (const widths of [4, 2, 1, 0.5, 0.25]) {
		const found = sweep(widths, squash);
		console.log(
			`${widths.toFixed(2).padStart(6)} w ${`${found.deep.toFixed(0)} m`.padStart(8)}  ` +
				found.opened
					.map((v) => `${(v * 100).toFixed(1)}%`.padStart(7))
					.join("") +
				`   ${(found.overhangs * 100).toFixed(1)}%`,
		);
	}
}
console.log(
	"\nshare of land columns the layer opens at each depth, and the share" +
		"\nholding rock over air over rock anywhere inside its own reach",
);
