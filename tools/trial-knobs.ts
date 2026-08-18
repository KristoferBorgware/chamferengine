// v0.2.0 I-3. Twenty-six knobs at one prominence. Candidate B says cut the ones
// that do nothing, which is a claim about the output rather than about taste,
// so this measures it: sweep each knob across its whole range and count how
// much of the world it moves.
//
// Land or sea per cell is the blunt measure and the right one -- a knob that
// cannot move a coastline anywhere in its range is not deciding what a planet
// is. The map is built at level 6 for speed; the shares are what to read.
import { PlanetSettings, KNOB_RANGES } from "../packages/client/src/PlanetSettings.js";
import type { PlanetKnobs } from "../packages/client/src/PlanetSettings.js";
import { buildCoarseMap } from "chamfer/generation";

const LEVEL = 6;

/** The land-or-sea state of every cell, at a fixed level. */
function maskOf(knobs: Partial<PlanetKnobs>): Uint8Array {
	const settings = new PlanetSettings({ plain: false, ...knobs });
	const map = buildCoarseMap(settings.seedNumber, {
		...settings.coarseOptions(),
		level: LEVEL,
	});
	const mask = new Uint8Array(map.count);
	for (let cell = 0; cell < map.count; cell++)
		mask[cell] = map.height[cell]! > map.seaLevel ? 1 : 0;
	return mask;
}

const differ = (a: Uint8Array, b: Uint8Array) => {
	let n = 0;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
	return (100 * n) / a.length;
};

const base = maskOf({});
console.log(`level ${LEVEL}, ${base.length.toLocaleString("en-US")} cells`);
console.log("how much of the surface changes land or sea across a knob's range\n");

/** Which knobs could reach the coarse map at all, and which plainly cannot. */
const SWEPT: (keyof PlanetKnobs)[] = [
	"radius", "blockSize", "coarseSpacing", "reliefFeature", "landFraction",
	"heightScale", "detailAmplitude", "detailFeature", "crustMetres",
	"chunkCells", "detail",
];

const levelOf = (knobs: Partial<PlanetKnobs>) =>
	new PlanetSettings({ plain: false, ...knobs }).coarseLevel;

const rows: {
	knob: string; low: number; high: number; worst: number; levels: string;
}[] = [];
for (const knob of SWEPT) {
	const range = KNOB_RANGES[knob]!;
	const at = (v: number) => ({ [knob]: v }) as Partial<PlanetKnobs>;
	const low = differ(base, maskOf(at(range.low)));
	const high = differ(base, maskOf(at(range.high)));
	// The sweep holds the map's level fixed so two masks can be compared cell
	// for cell. A knob whose only road to the map is that level therefore reads
	// as nothing here, and this column is what says so.
	const levels = `${levelOf(at(range.low))}-${levelOf(at(range.high))}`;
	rows.push({ knob, low, high, worst: Math.max(low, high), levels });
}
rows.sort((a, b) => b.worst - a.worst);
for (const row of rows)
	console.log(
		`   ${row.knob.padEnd(16)} lowest ${row.low.toFixed(1).padStart(5)}%` +
			`   highest ${row.high.toFixed(1).padStart(5)}%` +
			`   map level ${row.levels}${row.levels === `${levelOf({})}-${levelOf({})}` ? "" : "  <- moves the resolution"}`,
	);

console.log(`\n   the default asks for map level ${levelOf({})}`);
console.log("\nA knob under about a percent has not moved a coastline anywhere in");
console.log("its range. That is not the same as doing nothing -- it may still");
console.log("decide how tall the ground is, how finely it is drawn, or how much");
console.log("of it is held -- but it is not deciding where the land is.");
