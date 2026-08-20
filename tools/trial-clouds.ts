import { PlanetSettings } from "../packages/client/src/PlanetSettings.js";
import { generateCloudPuffs } from "chamfer/sky";
import { buildPuffMesh } from "chamfer/render";

const settings = new PlanetSettings({ cloudStyle: "billboards" });
const k = settings.knobs;
const top = settings.radius;
const layers = [
	{
		radius: top + k.lowDeck,
		windRate: (2 * Math.PI) / 900,
		size: k.cloudPuff,
		spread: k.cloudSpread,
		thickness: k.cloudPuff * 1.1,
	},
	{
		radius: top + k.highDeck,
		windRate: (2 * Math.PI) / 1500,
		size: k.cloudPuff * 0.7,
		spread: k.cloudSpread * 0.7,
		thickness: k.cloudPuff * 0.6,
	},
];

console.log(
	`radius ${top.toFixed(0)} m, clusters ${k.cloudClusters}, density ${k.cloudDensity}, spread ${k.cloudSpread} m, puff ${k.cloudPuff} m`,
);

const start = performance.now();
const puffs = generateCloudPuffs(0, k.cloudClusters, k.cloudDensity, layers);
const generated = performance.now();
const mesh = buildPuffMesh(puffs);
const built = performance.now();

console.log(`puffs: ${puffs.length}`);
console.log(
	`generate ${(generated - start).toFixed(1)} ms, mesh ${(built - generated).toFixed(1)} ms`,
);
console.log(
	`vertices ${mesh.vertices.length / 10}, triangles ${mesh.indices.length / 3}, buffers ${((mesh.vertices.byteLength + mesh.indices.byteLength) / 1024 / 1024).toFixed(2)} MB`,
);

// How much sky one formation actually covers, against how far apart they sit.
const area = 4 * Math.PI * layers[0]!.radius ** 2;
const formations = puffs.filter(
	(p) => p.windRate === layers[0]!.windRate,
).length;
console.log(
	`low deck: ${formations} puffs, one per ${(area / formations / 1e6).toFixed(3)} km^2, puff is ${((Math.PI * (k.cloudPuff / 2) ** 2) / 1e6).toFixed(4)} km^2`,
);
