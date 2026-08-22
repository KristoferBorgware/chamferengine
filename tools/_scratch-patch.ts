import { CoarseGrid, layeredHeight, metreHeight, seedFromString } from "chamfer/generation";
import { coarsePatchMesh, PATCH_STRIDE } from "chamfer/mesh";
import { positionOf } from "chamfer/coordinates";

const LEVEL = 6;
const grid = new CoarseGrid(LEVEL);
const seed = seedFromString("chamfer");
const field = layeredHeight(grid, seed, { level: LEVEL, cellMetres: 128 });
const h = Float32Array.from(metreHeight(field.raw, { landFraction: 0.65, relief: 600, seaDepth: 130, seaLevel: 0 }));
const raw = Float32Array.from(field.raw);
const at = positionOf({ latitude: 45, longitude: 20, altitude: 0 }, 1);
const patch = coarsePatchMesh(grid, {
	at, cells: 176, radius: 6801.5, exaggeration: 1,
	height: h, raw, layer: field.terrain,
});
let bad = 0, tall = 0, worst = 0;
for (let v = 0; v < patch.vertices.length; v += PATCH_STRIDE) {
	for (let c = 0; c < PATCH_STRIDE; c++) if (!Number.isFinite(patch.vertices[v + c]!)) bad++;
	const y = patch.vertices[v + 1]!;
	if (Math.abs(y) > 2000) { tall++; if (Math.abs(y) > worst) worst = Math.abs(y); }
}
console.log(`${patch.cellCount} cells, ${patch.vertices.length / PATCH_STRIDE} vertices`);
console.log(`non-finite ${bad}, |y| over 2000 m: ${tall}, worst ${worst.toFixed(0)}`);
console.log(`ground ${patch.lowest.toFixed(0)} to ${patch.highest.toFixed(0)} m, span ${patch.span.toFixed(0)} m`);
// how far apart are a cell's own corner heights?
let spread = 0, spreadAt = 0;
for (let t = 0; t < patch.indices.length; t += 3) {
	const ys = [0,1,2].map((k) => patch.vertices[patch.indices[t + k]! * PATCH_STRIDE + 1]!);
	const d = Math.max(...ys) - Math.min(...ys);
	if (d > spread) { spread = d; spreadAt = t; }
}
console.log(`widest single triangle rise: ${spread.toFixed(1)} m at triangle ${spreadAt / 3}`);
