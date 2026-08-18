// v0.2.0 I-1. Two ways to make the editor's 3.4 s feel shorter. Candidate A
// holds each stage's output and recomputes from the first stage a knob reaches.
// Candidate B runs the whole chain and paints each stage as it lands. This
// measures what each gives for a knob at the top of the chain and one near the
// bottom, and checks that a cached rebuild produces the same map as a full one.
//
// The millisecond figures are timings and move run to run. Read the shares.
import { PlanetSettings } from "../packages/client/src/PlanetSettings.js";
import { CoarseGrid } from "../packages/engine/src/generation/coarse/CoarseGrid.js";
import { continentHeight } from "../packages/engine/src/generation/coarse/continentHeight.js";
import { seaLevelFor } from "../packages/engine/src/generation/coarse/seaLevelFor.js";
import { erode } from "../packages/engine/src/generation/coarse/erode.js";
import { fillPits } from "../packages/engine/src/generation/coarse/fillPits.js";
import { routeFlow } from "../packages/engine/src/generation/coarse/routeFlow.js";
import { accumulateFlow } from "../packages/engine/src/generation/coarse/accumulateFlow.js";
import { coarseSlope } from "../packages/engine/src/generation/coarse/coarseSlope.js";
import { seedFromString } from "chamfer/generation";

const settings = new PlanetSettings();
const seed = seedFromString(settings.knobs.seed);
const options = { ...settings.coarseOptions() };
const level = options.level ?? 8;

// The grid depends on the level and on nothing a map knob can change, so it is
// built once and held for every run below.
const t0 = Date.now();
const grid = new CoarseGrid(level);
const gridMs = Date.now() - t0;

/** The chain, as the stages a knob can enter it at. */
const STAGES = ["height", "sea", "erode", "flow", "slope"] as const;
type Stage = (typeof STAGES)[number];

interface Held {
	raw?: Float64Array;   // the height field before erosion
	height?: Float64Array; // after erosion
	sea?: number;
	flow?: Float32Array;
	slope?: Float32Array;
}

/** Run the chain from `from` onward, reusing whatever `held` already has. */
function build(from: Stage, held: Held): { held: Held; ms: Record<string, number> } {
	const ms: Record<string, number> = {};
	const at = STAGES.indexOf(from);
	let t = Date.now();
	if (at <= 0) {
		held.raw = continentHeight(grid, seed, 0.8, 4,
			options.reliefFrequency ?? 6, options.reliefOctaves ?? 5, 0.35);
		ms.height = Date.now() - t;
	}
	t = Date.now();
	if (at <= 1) {
		held.sea = seaLevelFor(held.raw!, options.landFraction ?? 0.3);
		ms.sea = Date.now() - t;
	}
	t = Date.now();
	if (at <= 2) {
		// erosion writes in place, so it starts from a copy of the raw field --
		// which is the reason the raw field is held separately from the eroded one
		held.height = Float64Array.from(held.raw!);
		erode(grid, held.height, held.sea!, 4, 0.004);
		ms.erode = Date.now() - t;
	}
	t = Date.now();
	if (at <= 3) {
		const filled = fillPits(grid, held.height!, held.sea!);
		const down = routeFlow(grid, filled, held.sea!);
		held.flow = Float32Array.from(accumulateFlow(grid, filled, down, held.sea!));
		ms.flow = Date.now() - t;
	}
	t = Date.now();
	if (at <= 4) {
		held.slope = coarseSlope(grid, held.height!);
		ms.slope = Date.now() - t;
	}
	return { held, ms };
}

const total = (ms: Record<string, number>) =>
	Object.values(ms).reduce((s, x) => s + x, 0);

console.log(`level ${level}, ${grid.count.toLocaleString("en-US")} cells`);
console.log(`the grid is ${gridMs} ms and no map knob changes it, so it is held\n`);

const first = build("height", {});
console.log("a knob at the top of the chain -- a landform size, a noise seed");
console.log(`   every stage runs: ${total(first.ms)} ms`);
console.log(`   candidate A saves nothing here, because the chain starts at the top`);
console.log(`   candidate B has a picture after the height field: ${first.ms.height} ms` +
	`  = ${Math.round((100 * first.ms.height!) / total(first.ms))}% of the wait`);

const held: Held = { ...first.held };
const land = build("sea", held);
console.log("\na knob part way down -- how much of the surface is land");
console.log(`   candidate A runs ${Object.keys(land.ms).join(", ")}: ${total(land.ms)} ms` +
	`  against ${total(first.ms)} for a full rebuild`);
console.log(`   candidate B has the height field already drawn, so a picture is already there`);

const held2: Held = { ...first.held };
const erosion = build("erode", held2);
console.log("\na knob near the bottom -- the erosion rate");
console.log(`   candidate A runs ${Object.keys(erosion.ms).join(", ")}: ${total(erosion.ms)} ms` +
	`  = ${Math.round((100 * total(erosion.ms)) / total(first.ms))}% of a full rebuild`);

// Does a cached rebuild agree with a full one? A stale stage is the risk that
// candidate A carries and candidate B does not.
const fresh = build("height", {});
let worst = 0;
for (let c = 0; c < grid.count; c++)
	worst = Math.max(worst, Math.abs(fresh.held.height![c]! - erosion.held.height![c]!));
console.log(`\ncached against full rebuild, worst height difference: ${worst.toExponential(2)}`);
console.log(worst === 0
	? "   Identical. Holding a stage is exact, not an approximation."
	: "   NOT identical -- a held stage is carrying something it should not.");
