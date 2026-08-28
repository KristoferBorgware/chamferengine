// Inside the plant pass: how much is the skeleton, and how much is the stamp?
//
//   npx vite-node tools/trial-plant-split.ts
//
// A plant is built in two halves. `growPlant` walks the trunk and its branches
// and returns a list of rods and a list of leaf clusters -- arithmetic, no
// lattice. `growStand` then rasterises that list into cells, which is where
// every address lookup lives. A cache of pre-built trees can only skip the
// first half unless it caches the cells themselves, so which half carries the
// cost decides what such a cache has to hold.
import { PLANT_SPECIES } from "../packages/engine/src/generation/plants/PLANT_SPECIES.js";
import { PlanetSettings } from "../packages/client/src/PlanetSettings.js";
import { Vec3 } from "chamfer/math";
import { emptySkeleton } from "../packages/engine/src/generation/plants/PlantSkeleton.js";
import { growPlant } from "../packages/engine/src/generation/plants/growPlant.js";
import { plantFrame } from "../packages/engine/src/generation/plants/PlantFrame.js";

const settings = new PlanetSettings({ plain: false });
const RADIUS = settings.radius;
const BLOCK = settings.knobs.blockSize;
const RUNS = 400;

console.log(
	`radius ${RADIUS.toFixed(0)} m, block ${BLOCK} m — ` +
		`${RUNS} plants of each species`,
);
console.log(
	"\n" +
		"species".padEnd(12) +
		"skeleton".padStart(11) +
		"rods".padStart(9) +
		"clusters".padStart(10) +
		"lookups".padStart(10) +
		"lookup ms".padStart(12),
);

// Measured on this machine: one `directionToCell` and the `canonicalCell`
// beside it, which is what a rod step and a cluster centre each cost before
// anything is written.
const LOOKUP_US = 0.702;

for (const name of ["Pine", "Oak"]) {
	const shape = PLANT_SPECIES[name]!;
	const skeleton = emptySkeleton();
	let rods = 0;
	let clusters = 0;
	// Warm up, then the best of three sweeps.
	let least = Infinity;
	for (let pass = 0; pass < 4; pass++) {
		const at = performance.now();
		for (let r = 0; r < RUNS; r++) {
			const up = new Vec3(
				Math.cos(r * 0.017),
				Math.sin(r * 0.011),
				Math.sin(r * 0.023),
			).normalize();
			skeleton.rods.length = 0;
			skeleton.clusters.length = 0;
			growPlant(
				[up.x * RADIUS, up.y * RADIUS, up.z * RADIUS],
				plantFrame(up.x, up.y, up.z),
				shape,
				1,
				12345 + r,
				BLOCK,
				skeleton,
			);
			rods = skeleton.rods.length / 8;
			clusters = skeleton.clusters.length / 4;
		}
		const ms = performance.now() - at;
		if (pass > 0) least = Math.min(least, ms);
	}
	// **Counted, not guessed.** A rod is walked in steps of four tenths of a
	// block and every step asks which column it landed in, plus the one at its
	// start; a cluster asks once for its centre.
	let lookups = clusters;
	for (let r = 0; r + 8 <= skeleton.rods.length; r += 8) {
		const dx = skeleton.rods[r + 3]! - skeleton.rods[r]!;
		const dy = skeleton.rods[r + 4]! - skeleton.rods[r + 1]!;
		const dz = skeleton.rods[r + 5]! - skeleton.rods[r + 2]!;
		const run = Math.sqrt(dx * dx + dy * dy + dz * dz);
		lookups += Math.max(1, Math.ceil(run / (BLOCK * 0.4))) + 1;
	}
	console.log(
		name.padEnd(12) +
			`${(least / RUNS).toFixed(3)} ms`.padStart(11) +
			`${rods}`.padStart(9) +
			`${clusters}`.padStart(10) +
			`${lookups.toLocaleString("en-US")}`.padStart(10) +
			`${((lookups * LOOKUP_US) / 1000).toFixed(2)} ms`.padStart(12),
	);
}
