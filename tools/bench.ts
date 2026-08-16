import { WorldShape, maxCrustDepth } from "chamfer/world";
import {
	ChunkAddress,
	ChunkColumnSampler,
	TerrainGenerator,
	buildCoarseMap,
	generateChunk,
	seedFromString,
	selectChunks,
	selectionId,
} from "chamfer/generation";
import { buildChunkMesh } from "chamfer/mesh";
import { positionToCell } from "chamfer/addressing";
import { positionOf } from "chamfer/coordinates";
import { Frustum, Mat4, Vec3 } from "chamfer/math";

/**
 * What every reference scene costs to build, at the worked planet's settings.
 *
 * This is the half of a frame that runs on a CPU: choosing chunks, evaluating
 * terrain, and turning it into triangles. The other half is the draw, which
 * needs an adapter and is read off the client's own budget line.
 *
 * The client builds chunks on workers, so nothing here is a frame time. What it
 * measures is throughput — how long a view takes to fill, and how much a worker
 * spends on one chunk.
 */

const RADIUS = 1700;
const DEPTH = 11;
const CHUNK_LEVEL = 6;
const COARSE_LEVEL = 7;
const MAX_ELEVATION = 150;
const DETAIL = 2;
const SKIRT_CELLS = 2;

/** How many workers the client asks for on a machine with this many cores. */
const WORKERS = 7;

/** The view the client sets up: field of view, aspect, and how far it reaches. */
const FIELD_OF_VIEW = (65 * Math.PI) / 180;
const ASPECT = 1920 / 1080;

const seed = seedFromString("chamfer");
const shape = new WorldShape(
	RADIUS,
	DEPTH,
	MAX_ELEVATION,
	maxCrustDepth(DEPTH),
);

const worldStart = performance.now();
const map = buildCoarseMap(seed, { level: COARSE_LEVEL });
const worldMs = performance.now() - worldStart;

const byLod: TerrainGenerator[] = [];
for (let lod = 0; lod <= CHUNK_LEVEL; lod++)
	byLod.push(new TerrainGenerator(seed, shape.atLod(lod), map));

/** Where the ground is under a direction, so a camera can stand on it. */
function groundAt(direction: Vec3): number {
	const cell = positionToCell(direction, shape.n);
	const column = byLod[0]!.columnAt(cell.face, cell.i, cell.j);
	return Math.max(column.groundRadius, column.waterRadius);
}

/** A direction over dry land with the relief a scene asks for. */
function findGround(wanted: "flat" | "hill" | "shore" | "pentagon"): Vec3 {
	if (wanted === "pentagon") return new Vec3(0, 0, 1).normalize();
	let best: Vec3 | null = null;
	let bestScore = -Infinity;
	for (let n = 0; n < 400; n++) {
		const latitude = ((n * 37) % 140) - 70;
		const longitude = ((n * 111) % 360) - 180;
		const direction = positionOf({ latitude, longitude, altitude: 0 }, 1);
		const cell = positionToCell(direction, shape.n);
		const column = byLod[0]!.columnAt(cell.face, cell.i, cell.j);
		const height = column.groundRadius - RADIUS;
		const wet = column.waterRadius > column.groundRadius;
		const score =
			wanted === "flat"
				? wet
					? -Infinity
					: -Math.abs(height - 5)
				: wanted === "hill"
					? wet
						? -Infinity
						: height
					: wet
						? -Math.abs(column.waterRadius - column.groundRadius)
						: -Infinity;
		if (score > bestScore) {
			bestScore = score;
			best = direction;
		}
	}
	return best ?? positionOf({ latitude: 0, longitude: 0, altitude: 0 }, 1);
}

interface Scene {
	readonly name: string;
	readonly tests: string;
	readonly at: Vec3;
}

const flat = findGround("flat");
const hill = findGround("hill");
const shore = findGround("shore");
const pentagon = findGround("pentagon");

const scenes: Scene[] = [
	{
		name: "eye height, flat ground",
		tests: "the floor case",
		at: flat.scale(groundAt(flat) + 1.7),
	},
	{
		name: "eye height, relief",
		tests: "real terrain",
		at: hill.scale(groundAt(hill) + 1.7),
	},
	{
		name: "standing at the shore",
		tests: "the translucent pass",
		at: shore.scale(groundAt(shore) + 1.7),
	},
	{
		name: "under water",
		tests: "the camera inside a water cell",
		at: shore.scale(groundAt(shore) - 0.5),
	},
	{
		name: "standing on a pentagon",
		tests: "the degree-5 path",
		at: pentagon.scale(groundAt(pentagon) + 1.7),
	},
	{
		name: "sixty metres up",
		tests: "near and far in one view",
		at: hill.scale(RADIUS + 60),
	},
	{
		name: "orbit",
		tests: "LOD at its coarsest",
		at: hill.scale(RADIUS * 3),
	},
];

interface Measured {
	readonly scene: Scene;
	readonly chunks: number;
	readonly cells: number;
	readonly triangles: number;
	readonly water: number;
	readonly vertices: number;
	readonly megabytes: number;
	readonly drawnChunks: number;
	readonly drawnTriangles: number;
	readonly selectMs: number;
	readonly buildMs: number;
	readonly worstChunkMs: number;
	readonly byLod: Map<number, number>;
}

function measure(scene: Scene): Measured {
	const at = scene.at;
	const selectStart = performance.now();
	const wanted = selectChunks(
		DEPTH,
		CHUNK_LEVEL,
		at,
		at.length(),
		RADIUS,
		DETAIL,
	);
	const selectMs = performance.now() - selectStart;

	let cells = 0;
	let triangles = 0;
	let water = 0;
	let vertices = 0;
	let bytes = 0;
	let buildMs = 0;
	let worstChunkMs = 0;
	let drawnChunks = 0;
	let drawnTriangles = 0;
	const counts = new Map<number, number>();

	// What a frame draws is the part of the held disc the camera is pointed
	// at. The rest stays resident because turning is instant and building is
	// not, so it is held and skipped rather than dropped.
	const up = at.normalize();
	const ahead = Math.abs(up.y) > 0.9 ? new Vec3(1, 0, 0) : new Vec3(0, 1, 0);
	const along = ahead.sub(up.scale(ahead.dot(up))).normalize();
	// Looking at the ground fifty metres along it. From eye height that is a
	// view down the slope ahead; from orbit it is a view of the planet.
	const target = up
		.add(along.scale(50 / RADIUS))
		.normalize()
		.scale(RADIUS);
	const view = new Frustum(
		Mat4.perspective(FIELD_OF_VIEW, ASPECT, 0.2, RADIUS * 20).multiply(
			Mat4.lookAt(
				[at.x, at.y, at.z],
				[target.x, target.y, target.z],
				[up.x, up.y, up.z],
			),
		),
	);

	for (const chosen of wanted) {
		const lodShape = shape.atLod(chosen.lod);
		const terrain = byLod[chosen.lod]!;
		const start = performance.now();
		const chunk = generateChunk(
			terrain,
			ChunkAddress.fromKey(chosen.key, chosen.chunkLevel),
			chosen.chunkLevel,
			lodShape.crustDepth,
		);
		const mesh = buildChunkMesh(
			chunk,
			new ChunkColumnSampler(chunk, terrain),
			lodShape,
			seed,
			{ skirtCells: SKIRT_CELLS },
		);
		const took = performance.now() - start;
		buildMs += took;
		if (took > worstChunkMs) worstChunkMs = took;
		cells += mesh.tally.cells;
		triangles += mesh.opaque.triangleCount + mesh.translucent.triangleCount;
		water += mesh.translucent.triangleCount;
		vertices +=
			(mesh.opaque.vertices.length + mesh.translucent.vertices.length) / 6;
		bytes +=
			mesh.opaque.vertices.byteLength +
			mesh.opaque.indices.byteLength +
			mesh.translucent.vertices.byteLength +
			mesh.translucent.indices.byteLength;
		if (
			view.holds(
				mesh.center[0],
				mesh.center[1],
				mesh.center[2],
				mesh.radius,
			)
		) {
			drawnChunks++;
			drawnTriangles +=
				mesh.opaque.triangleCount + mesh.translucent.triangleCount;
		}
		counts.set(chosen.lod, (counts.get(chosen.lod) ?? 0) + 1);
		// The renderer keys by level and key together, and this is the check
		// that no two chosen chunks collide on that key.
		selectionId(chosen.chunkLevel, chosen.key);
	}

	return {
		scene,
		chunks: wanted.length,
		cells,
		triangles,
		water,
		vertices,
		megabytes: bytes / 1048576,
		drawnChunks,
		drawnTriangles,
		selectMs,
		buildMs,
		worstChunkMs,
		byLod: counts,
	};
}

function thousands(value: number): string {
	return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

console.log(`chamfer bench — radius ${RADIUS} m, depth ${DEPTH}, chunk level ${CHUNK_LEVEL}`);
console.log(
	`block ${shape.blockSize.toFixed(4)} m · crust ${shape.crustDepth} layers · coarse level ${COARSE_LEVEL}`,
);
console.log(`world creation: ${worldMs.toFixed(0)} ms for the coarse map\n`);

const measured = scenes.map(measure);

console.log(
	"scene".padEnd(26) +
		"chunks".padStart(7) +
		"cells".padStart(9) +
		"tris".padStart(10) +
		"drawn".padStart(10) +
		"MB".padStart(7) +
		"build".padStart(9) +
		"worst".padStart(8),
);
for (const row of measured)
	console.log(
		row.scene.name.padEnd(26) +
			thousands(row.chunks).padStart(7) +
			thousands(row.cells).padStart(9) +
			thousands(row.triangles).padStart(10) +
			thousands(row.drawnTriangles).padStart(10) +
			row.megabytes.toFixed(1).padStart(7) +
			`${row.buildMs.toFixed(0)} ms`.padStart(9) +
			`${row.worstChunkMs.toFixed(1)}`.padStart(8),
	);

console.log("\nper scene");
for (const row of measured) {
	const levels = [...row.byLod.entries()]
		.sort((a, b) => a[0] - b[0])
		.map(([lod, count]) => `${count}@lod${lod}`)
		.join(" ");
	const perCell = row.cells > 0 ? row.triangles / row.cells : 0;
	console.log(
		`${row.scene.name} — ${row.scene.tests}\n` +
			`  ${levels}\n` +
			`  ${row.drawnChunks} of ${row.chunks} chunks in view — ${thousands(row.drawnTriangles)} triangles a frame, ${thousands(row.water)} of them water\n` +
			`  ${perCell.toFixed(2)} triangles a cell, ${(row.vertices / Math.max(1, row.cells)).toFixed(2)} vertices a cell\n` +
			`  select ${row.selectMs.toFixed(2)} ms · build ${row.buildMs.toFixed(0)} ms · ` +
			`${(row.buildMs / Math.max(1, row.chunks)).toFixed(2)} ms a chunk · ` +
			`${(row.buildMs / WORKERS / 1000).toFixed(2)} s to fill on ${WORKERS} workers`,
	);
}

// Flying at speed, and the terminator crossing, are both about churn rather
// than about one view: what matters is how many chunks change when the camera
// moves, because that is what a worker has to keep up with.
console.log("\nchurn");
const churnFrom = hill.scale(groundAt(hill) + 20);
const before = new Set(
	selectChunks(DEPTH, CHUNK_LEVEL, churnFrom, churnFrom.length(), RADIUS, DETAIL).map(
		(chosen) => selectionId(chosen.chunkLevel, chosen.key),
	),
);
for (const metres of [10, 50, 200]) {
	// Fly along the ground by a fixed distance and count what is new.
	const east = churnFrom
		.cross(new Vec3(0, 1, 0))
		.normalize()
		.scale(metres);
	const moved = churnFrom.add(east).normalize().scale(churnFrom.length());
	const after = selectChunks(
		DEPTH,
		CHUNK_LEVEL,
		moved,
		moved.length(),
		RADIUS,
		DETAIL,
	);
	let fresh = 0;
	for (const chosen of after)
		if (!before.has(selectionId(chosen.chunkLevel, chosen.key))) fresh++;
	console.log(
		`  ${metres} m along the ground: ${fresh} of ${after.length} chunks are new`,
	);
}
