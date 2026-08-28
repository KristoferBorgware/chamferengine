// What a worker pays before it can plant anything, and what it gets for it.
//
//   npx vite-node tools/trial-plant-templates.ts
//
// A plant is grown properly once per species per level of detail and stamped
// after that, so every worker builds an identical set from the seed and the
// species -- the same way each one builds its own coarse map. This is the
// setup that buys it: how long, how many, and how much memory.
//
// Wall-clock on a software machine; read the ratios.
import { PlanetSettings } from "../packages/client/src/PlanetSettings.js";
import {
	PLANT_LEVELS,
	PLANT_VARIANTS,
	PlantTemplateStore,
} from "chamfer/generation";
import { plantLayerOf } from "../packages/client/src/PlantDraft.js";

/** Turns of a template that cost nothing: six sixth turns, each mirrored. */
const TURNS = 12;

const settings = new PlanetSettings({ plain: false });
const layers = settings.plantLayers.map(plantLayerOf).filter((one) => one.on);
console.log(
	`depth ${settings.depth}, block ${settings.knobs.blockSize} m, ` +
		`${layers.length} layers: ${layers.map((one) => one.species).join(", ")}`,
);
console.log(
	`${PLANT_VARIANTS} shapes a species, ${TURNS} turns of each — ` +
		`${PLANT_VARIANTS * TURNS} plants a species that never repeat\n`,
);

console.log(
	"level".padEnd(8) +
		"block".padStart(8) +
		"species".padStart(10) +
		"built".padStart(10) +
		"cells".padStart(10) +
		"bytes".padStart(10),
);

let whole = 0;
let bytes = 0;
for (let lod = 0; lod < PLANT_LEVELS; lod++) {
	const level = settings.depth - lod;
	const block = settings.knobs.blockSize * 2 ** lod;
	const store = new PlantTemplateStore(
		settings.seedNumber,
		level,
		block,
		settings.radius,
	);
	for (const layer of layers) {
		const at = performance.now();
		const made = store.forLayer(layer);
		const ms = performance.now() - at;
		whole += ms;
		let cells = 0;
		for (const one of made) cells += one.count;
		// Three `Int16Array`s and a `Uint8Array` a cell.
		const held = cells * 7;
		bytes += held;
		console.log(
			`lod ${lod}`.padEnd(8) +
				`${block} m`.padStart(8) +
				layer.species.padStart(10) +
				`${ms.toFixed(0)} ms`.padStart(10) +
				`${cells.toLocaleString("en-US")}`.padStart(10) +
				`${(held / 1024).toFixed(0)} KB`.padStart(10),
		);
	}
}

console.log(
	`\none worker: ${whole.toFixed(0)} ms and ${(bytes / 1024).toFixed(0)} KB, ` +
		`once, on the first chunk of each level that grows something`,
);
console.log(
	"a pool pays it once per worker and in parallel, each from the seed alone " +
		"-- nothing crosses between them",
);
