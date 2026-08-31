// What the cave bench asks the GPU to draw, against the depth it is asked for.
//
//   npx vite-node tools/trial-cave-load.ts
//
// **The mesh is the whole bill, and the shadow pass pays it four times.** The
// bench draws two lights with two cascades each, so the geometry goes down the
// pipe once for the picture and **four** more times for the depth maps -- and
// unlike the landscape bench's surface, a cave patch is a *volume*: every
// passage wall, floor and roof is a face.
//
// These are counts, not timings. The adapter in this container is a software
// rasteriser, so what a frame costs cannot be measured here; what it is asked
// to draw can.
import { CaveWorkerCore } from "../packages/client/src/CaveWorkerCore.js";
import { PlanetSettings } from "../packages/client/src/PlanetSettings.js";

/** How many depth passes a frame records: two lights, two cascades each. */
const SHADOW_PASSES = 4;

// The cave bench's own opening patch: 4 map cells at 5 levels under the map,
// which is 128 m across at one metre a column.
const base = new PlanetSettings({
	plain: false,
	patchCells: 4,
	patchDetail: 5,
}).knobs;

/** The depths the sweep reports at, in metres of cave under the ground. */
const DEPTHS = [28, 50, 100, 150, 200, 300, 400, 512];

console.log(
	`patch ${base.patchCells} map cells across, detail ${base.patchDetail},` +
		` ${base.blockSize} m blocks`,
);
console.log(
	"\n reach   columns  layers      blocks   triangles" +
		"   drawn/frame    mesh",
);
for (const caveDepth of DEPTHS) {
	const core = new CaveWorkerCore();
	let facts: Record<string, number> | null = null;
	for (const step of core.steps({
		kind: "request",
		token: 1,
		knobs: { ...base, caves: true, caveDepth },
	} as never))
		if (step.kind === "ready") facts = step.facts as never;
	if (!facts) continue;
	const columns = facts.cellsDrawn!;
	const layers = Math.round(facts.crust! / base.blockSize);
	const triangles = facts.triangles!;
	console.log(
		`${`${caveDepth} m`.padStart(6)} ${columns
			.toLocaleString("en-US")
			.padStart(9)} ${String(layers).padStart(7)} ${(columns * layers)
			.toLocaleString("en-US")
			.padStart(11)} ${Math.round(triangles)
			.toLocaleString("en-US")
			.padStart(11)} ${Math.round(triangles * (1 + SHADOW_PASSES))
			.toLocaleString("en-US")
			.padStart(13)} ${`${facts.meshMs!.toFixed(0)} ms`.padStart(7)}`,
	);
}
console.log(
	"\nthe walk stops where MAX_CAVE_BLOCKS does, so a reach past that" +
		"\nbuys layers the volume refuses to hold",
);
