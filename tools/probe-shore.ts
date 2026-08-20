import {
	FLAT_COARSE_LEVEL,
	PlanetSettings,
} from "../packages/client/src/PlanetSettings.js";
import {
	buildCoarseMap,
	flatCoarseMap,
	seedFromString,
} from "chamfer/generation";
import { positionToCell } from "chamfer/addressing";
import { positionOf } from "chamfer/coordinates";
import { Vec3 } from "chamfer/math";

/**
 * The ground under a line of sight, in metres above sea level.
 *
 * The sea is drawn as a surface now, so ground below sea level is bare sea
 * floor rather than a column of water blocks -- which makes a picture of a
 * beach ambiguous, because dry-looking sand at the water's edge can be either
 * side of the line. This says which.
 *
 * `node tools/probe-shore.ts "<query string>" <lat> <long> <bearing degrees>`
 */
const settings = PlanetSettings.fromParams(
	new URLSearchParams(process.argv[2] ?? ""),
);
const seed = seedFromString(settings.knobs.seed);
const map = settings.coarseMapRuns
	? buildCoarseMap(seed, settings.coarseOptions())
	: flatCoarseMap(seed, FLAT_COARSE_LEVEL);
const shape = settings.shapeFor(map);

const latitude = Number(process.argv[3] ?? 0);
const longitude = Number(process.argv[4] ?? 0);
const bearing = ((Number(process.argv[5] ?? 0) * Math.PI) / 180) as number;

const from = positionOf({ latitude, longitude, altitude: 0 }, 1).normalize();
let east = new Vec3(0, 1, 0).cross(from);
east = east.length() < 1e-6 ? new Vec3(1, 0, 0) : east.normalize();
const north = from.cross(east).normalize();
const along = east
	.scale(Math.sin(bearing))
	.add(north.scale(Math.cos(bearing)))
	.normalize();

console.log(
	`sea level radius ${shape.seaLevelRadius.toFixed(3)}, surface ${shape.seaSurfaceRadius.toFixed(3)}, block ${shape.blockSize.toFixed(3)} m`,
);
for (const metres of [0, 5, 10, 20, 40, 80, 160, 320, 640, 1280]) {
	const angle = metres / settings.radius;
	const dir = from
		.scale(Math.cos(angle))
		.add(along.scale(Math.sin(angle)))
		.normalize();
	const cell = positionToCell(dir, shape.n);
	const height = map.heightAt(cell.face, cell.i, cell.j, settings.depth);
	console.log(
		`  ${String(metres).padStart(5)} m out: ground ${height.toFixed(1).padStart(8)} m ${height < 0 ? "(sea floor)" : "(land)"}`,
	);
}
