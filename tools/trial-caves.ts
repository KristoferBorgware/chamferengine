// What a cave costs a chunk, and what it cost before it had a floor.
//
//   npx vite-node tools/trial-caves.ts
//
// The cave field is read once a **block**, because a passage is free to be at
// any depth and nothing about the ground says where one is. Every other term
// stops somewhere -- the soil is four blocks, the carve gains a full `1` over
// its own reach -- so `fillColumn` evaluates down to the deepest of them and
// fills the crust below with stone.
//
// With no floor of its own, a cave made that deepest term the bottom of the
// world: every column evaluated to the last layer, on a crust that is over a
// thousand of them. This is the bill that took, against the same world with
// caves off and against the bounded rule that ships.
//
// Wall-clock, and it moves run to run. Read the ratios.
import { PlanetSettings } from "../packages/client/src/PlanetSettings.js";
import {
	ChunkAddress,
	TerrainGenerator,
	buildCoarseMap,
	generateChunk,
	seedFromString,
} from "chamfer/generation";

const settings = new PlanetSettings({ plain: false });
const seed = seedFromString(settings.knobs.seed);
const map = buildCoarseMap(seed, settings.coarseOptions());
const shape = settings.shapeFor(map);
const layers = shape.crustDepth;

/** Chunks over one face, enough that the ground under them varies. */
const CHUNKS = 6;

function timed(
	carveLayer: boolean,
	caves: boolean,
	depth: number,
): { ms: number; air: number } {
	const terrain = new TerrainGenerator(seed, shape, map, {
		...settings.terrainOptions(),
		carveLayer,
		caves,
		caveDepth: depth,
	});
	const blocks = new Uint16Array(layers);
	// One build before the clock starts, so the first chunk's own warm-up is
	// not what is being timed.
	generateChunk(
		terrain,
		ChunkAddress.fromKey(0, settings.chunkLevel),
		settings.chunkLevel,
		layers,
	);
	let air = 0;
	const at = performance.now();
	for (let n = 0; n < CHUNKS; n++) {
		const chunk = generateChunk(
			terrain,
			ChunkAddress.fromKey(n, settings.chunkLevel),
			settings.chunkLevel,
			layers,
		);
		for (const v of chunk.blocks) if (v === 0) air++;
	}
	void blocks;
	return { ms: (performance.now() - at) / CHUNKS, air: air / CHUNKS };
}

const deep = layers * settings.knobs.blockSize;
const line = (what: string, ms: number, air: number) =>
	`${what.padEnd(26)} ${ms.toFixed(1).padStart(8)} ms   ${Math.round(air)
		.toLocaleString("en-US")
		.padStart(9)} air`;

console.log(
	`the shipped world, depth ${settings.depth}, ${layers} layers of crust,` +
		` chunks at level ${settings.chunkLevel}`,
);
// **With the cliffs layer off is where the caves' own bill shows.** That layer
// reaches one of its own shape widths down -- 120 layers on this world -- so
// with it on the fill is already walking part of what an unbounded cave would
// ask for, and the caves look cheaper than they are because something else is
// paying for the first hundred metres.
for (const carve of [false, true]) {
	const off = timed(carve, false, 0);
	const bounded = timed(carve, true, settings.knobs.caveDepth);
	const unbounded = timed(carve, true, deep);
	console.log(`\ncliffs and overhangs ${carve ? "on" : "off"}`);
	console.log(line("  caves off", off.ms, off.air));
	console.log(
		line(`  caves to ${settings.knobs.caveDepth} m`, bounded.ms, bounded.air),
	);
	console.log(line("  caves to the crust floor", unbounded.ms, unbounded.air));
	console.log(
		`  bounded costs x${(bounded.ms / off.ms).toFixed(2)} of caves off;` +
			` unbounded costs x${(unbounded.ms / off.ms).toFixed(2)}` +
			` -- x${(unbounded.ms / bounded.ms).toFixed(2)} of what ships`,
	);
}
