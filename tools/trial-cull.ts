// What culling the selection to the view removes, at a real world's settings.
import { PlanetSettings } from "../packages/client/src/PlanetSettings.js";
import { FLAT_COARSE_LEVEL } from "../packages/client/src/PlanetSettings.js";
import {
	ChunkPeaks,
	buildCoarseMap,
	flatCoarseMap,
	seedFromString,
	selectChunks,
} from "chamfer/generation";
import { Frustum, Mat4, Vec3 } from "chamfer/math";

const QUERY = process.argv[2] ?? "";
const settings = PlanetSettings.fromParams(new URLSearchParams(QUERY));
const RADIUS = settings.radius;
const DEPTH = settings.depth;
const CHUNK_LEVEL = settings.chunkLevel;

const seed = seedFromString(settings.knobs.seed);
const map = settings.coarseMapRuns
	? buildCoarseMap(seed, settings.coarseOptions())
	: flatCoarseMap(seed, FLAT_COARSE_LEVEL);
const shape = settings.shapeFor(map);
const peaks = new ChunkPeaks(map, settings.knobs.blockSize, CHUNK_LEVEL);

console.log(
	`radius ${RADIUS.toFixed(0)} m, depth ${DEPTH}, chunk level ${CHUNK_LEVEL}, detail ${settings.knobs.detail}, relief ${settings.knobs.relief} m`,
);

const FIELD_OF_VIEW = (65 * Math.PI) / 180;

/** A camera standing at `height` over the surface, facing along the ground. */
function look(height: number): {
	eye: Vec3;
	frustum: Frustum;
} {
	const ground = new Vec3(0.3, 0.7, 0.5).normalize();
	const eye = ground.scale(RADIUS + height);
	const east = ground.cross(new Vec3(0, 1, 0)).normalize();
	const target = eye.add(east.scale(200));
	const view = Mat4.lookAt(
		[eye.x, eye.y, eye.z],
		[target.x, target.y, target.z],
		[ground.x, ground.y, ground.z],
	);
	const projection = Mat4.perspective(
		FIELD_OF_VIEW,
		1280 / 800,
		0.2,
		RADIUS * 20,
	);
	return { eye, frustum: new Frustum(projection.multiply(view)) };
}

function count(height: number, slack: number): number {
	const { eye, frustum } = look(height);
	return selectChunks(
		DEPTH,
		CHUNK_LEVEL,
		eye,
		eye.length(),
		RADIUS,
		settings.knobs.detail,
		shape.maxElevation,
		peaks,
		frustum,
	).length;
}

function plain(height: number): number {
	const { eye } = look(height);
	return selectChunks(
		DEPTH,
		CHUNK_LEVEL,
		eye,
		eye.length(),
		RADIUS,
		settings.knobs.detail,
		shape.maxElevation,
		peaks,
	).length;
}

console.log("\nheight   no cull   0 deg   15 deg   25 deg   45 deg");
for (const height of [1.86, 60, 400, 2000]) {
	const base = plain(height);
	const row = [0, 15, 25, 45].map((deg) => {
		const kept = count(height, Math.tan((deg * Math.PI) / 180));
		return `${kept} (${((100 * kept) / base).toFixed(0)}%)`;
	});
	console.log(
		`${height.toString().padStart(6)}   ${base.toString().padStart(7)}   ${row.join("   ")}`,
	);
}

const start = performance.now();
for (let n = 0; n < 20; n++) count(60, Math.tan((25 * Math.PI) / 180));
const culled = (performance.now() - start) / 20;
const start2 = performance.now();
for (let n = 0; n < 20; n++) plain(60);
const open = (performance.now() - start2) / 20;
console.log(
	`\nselectChunks at 60 m: ${open.toFixed(2)} ms uncalled, ${culled.toFixed(2)} ms culled to 25 deg`,
);
