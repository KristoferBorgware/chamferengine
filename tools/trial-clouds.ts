import { PlanetSettings } from "../packages/client/src/PlanetSettings.js";
import { generateCloudPuffs } from "chamfer/sky";
import { buildPuffMesh } from "chamfer/render";

const settings = PlanetSettings.fromParams(
	new URLSearchParams(process.argv[2] ?? "cloudStyle=billboards"),
);
const k = settings.knobs;
const top = settings.radius;
const further = Math.max(1, k.highDeck / Math.max(1, k.lowDeck));
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
		size: k.cloudPuff * further * 0.9,
		spread: k.cloudSpread * further * 0.75,
		thickness: k.cloudPuff * further * 0.55,
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

// What the per-formation grouping gives the renderer to cull with.
import { Vec3 as V } from "chamfer/math";
const grouped = new Map<number, typeof puffs>();
for (const puff of puffs) {
	const list = grouped.get(puff.formation) ?? [];
	list.push(puff);
	grouped.set(puff.formation, list);
}
console.log(`\nformations: ${grouped.size}, puffs each: ${(puffs.length / grouped.size).toFixed(1)} average`);
let widest = 0;
let total = 0;
for (const list of grouped.values()) {
	let x = 0, y = 0, z = 0;
	for (const p of list) {
		x += p.direction.x * p.radius;
		y += p.direction.y * p.radius;
		z += p.direction.z * p.radius;
	}
	const mid = new V(x / list.length, y / list.length, z / list.length);
	let bound = 0;
	for (const p of list) {
		const away = new V(p.direction.x * p.radius, p.direction.y * p.radius, p.direction.z * p.radius)
			.sub(mid).length();
		bound = Math.max(bound, away + p.size);
	}
	widest = Math.max(widest, bound);
	total += bound;
}
console.log(`formation bound: ${(total / grouped.size).toFixed(0)} m average, ${widest.toFixed(0)} m widest`);

// How wide each deck's puffs read from a player standing on the ground.
for (let d = 0; d < layers.length; d++) {
	const layer = layers[d]!;
	const overhead = layer.radius - top;
	const across = 2 * Math.atan(layer.size / 2 / overhead) * (180 / Math.PI);
	console.log(
		`deck ${d}: ${overhead.toFixed(0)} m up, ${layer.size.toFixed(0)} m puffs read ${across.toFixed(2)} deg, formations ${(2 * layer.spread).toFixed(0)} m across`,
	);
}
