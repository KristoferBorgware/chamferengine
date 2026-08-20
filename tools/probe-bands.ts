import {
	FLAT_COARSE_LEVEL,
	PlanetSettings,
} from "../packages/client/src/PlanetSettings.js";
import {
	BlockType,
	TerrainGenerator,
	buildCoarseMap,
	flatCoarseMap,
	seedFromString,
} from "chamfer/generation";
import { positionToCell } from "chamfer/addressing";
import { positionOf } from "chamfer/coordinates";
import { Vec3 } from "chamfer/math";

/**
 * What the world actually builds on top of a column, against the band the
 * noise lab paints there.
 *
 * The lab bands a patch by metres above sea level. The engine picks a surface
 * material from the same number, so the two should agree -- and where they do
 * not, the lab is teaching something the world does not do.
 *
 * `npx tsx tools/probe-bands.ts [<query string>]`
 */
const settings = PlanetSettings.fromParams(
	new URLSearchParams(process.argv[2] ?? ""),
);
const seed = seedFromString(settings.knobs.seed);
const map = settings.coarseMapRuns
	? buildCoarseMap(seed, settings.coarseOptions())
	: flatCoarseMap(seed, FLAT_COARSE_LEVEL);
const shape = settings.shapeFor(map);
const terrain = new TerrainGenerator(seed, shape, map, settings.terrainOptions());

/** The lab's own rule, copied from demos/noise-lab.html. */
function bandOf(metres: number): number {
	if (metres <= 0) return 0;
	if (metres < 300) return 1;
	if (metres < 400) return 2;
	return 3;
}
const BAND_SAYS = ["water", "grass", "rock", "snow"];

// The lab's default patch, at the same centre and the same spacing.
const centre = positionOf(
	{ latitude: 45, longitude: -175, altitude: 0 },
	1,
).normalize();
let east = new Vec3(0, 1, 0).cross(centre);
east = east.length() < 1e-6 ? new Vec3(1, 0, 0) : east.normalize();
const north = centre.cross(east).normalize();

const N = 176;
const cell = settings.coarseCell;
const half = (N / 2) * cell;
const tally = new Map<string, number>();
let samples = 0;
for (let r = 0; r <= N; r++) {
	for (let q = 0; q <= N; q++) {
		const u = (q * cell - half) / settings.radius;
		const v = (r * cell - half) / settings.radius;
		const a = Math.hypot(u, v);
		let dir: Vec3;
		if (a < 1e-12) dir = centre;
		else {
			const c = Math.cos(a);
			const s = Math.sin(a) / a;
			dir = centre
				.scale(c)
				.add(east.scale(u * s))
				.add(north.scale(v * s))
				.normalize();
		}
		const at = positionToCell(dir, shape.n);
		const column = terrain.columnAt(at.face, at.i, at.j);
		const block = terrain.blockAt(column, column.groundLayer) as number;
		const key = `${BAND_SAYS[bandOf(column.elevation)]} -> ${BlockType[block] ?? block}`;
		tally.set(key, (tally.get(key) ?? 0) + 1);
		samples++;
	}
}

console.log(
	`seed "${settings.knobs.seed}", depth ${settings.depth}, map cell ${cell.toFixed(1)} m, ${samples.toLocaleString()} columns at 45,-175`,
);
const rows = [...tally].sort((a, b) => b[1] - a[1]);
for (const [key, count] of rows)
	console.log(
		`  ${key.padEnd(20)} ${String(count).padStart(6)}  ${((100 * count) / samples).toFixed(1)}%`,
	);
