// How finely the cliffs layer is sampled down a column, against how fast it
// can actually change.
//
//   npx vite-node tools/trial-carve-sampling.ts
//
// The layer reads its field at the block's own point, and a column's blocks
// stand on one ray -- so walking down a column walks the sample point along a
// straight line in the field. This measures how far that line travels in the
// field's own lattice over the layer's whole reach, and how many blocks are
// evaluated over the same span. The ratio is how many readings each feature of
// the field is asked for.
import { PlanetSettings } from "../packages/client/src/PlanetSettings.js";
import {
	CARVE_SQUASH,
	carveDepth,
	layerNoiseSettings,
} from "chamfer/generation";

const settings = new PlanetSettings({ plain: false });
const radius = settings.radius;
const block = settings.knobs.blockSize;
const layer = settings.layerFor("carve");
const noise = layerNoiseSettings(layer, radius);
const deep = carveDepth(layer);

// The sample point is the unit direction scaled by `1 + up * squash / radius`,
// and the field is read at `point * frequency`. So over `deep` metres of depth
// the point moves this far in the widest octave's own lattice.
const moved = ((deep * CARVE_SQUASH) / radius) * noise.frequency;
const layers = Math.ceil(deep / block);
// Every octave after the first is `lacunarity` times finer, so it sees that
// much more of its own lattice over the same walk.
const finest = moved * noise.lacunarity ** (noise.octaves - 1);

const line = (what: string, value: string): void =>
	console.log(`${what.padEnd(38)}${value.padStart(12)}`);

console.log(
	`cliffs layer: ${layer.metres.toFixed(0)} m shapes, ${noise.octaves} octaves, ` +
		`lacunarity ${noise.lacunarity}, read x${CARVE_SQUASH} down`,
);
line("reach under the ground", `${deep.toFixed(0)} m`);
line("blocks evaluated down one column", `${layers}`);
line("lattice cells the walk crosses", moved.toFixed(2));
line("  at the finest octave", finest.toFixed(2));
line("readings per lattice cell", (layers / moved).toFixed(1));
line("  at the finest octave", (layers / finest).toFixed(1));
console.log(
	`\nA reading costs a whole octave stack. The field cannot hold a feature\n` +
		`narrower than one of its own lattice cells, so anything past a handful\n` +
		`of readings per cell is asking the same question again.`,
);
