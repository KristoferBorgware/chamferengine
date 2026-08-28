/**
 * What the bench's shadow map is actually fitted to.
 *
 * The fit is done on the GPU side, where nothing can be printed. This runs the
 * same arithmetic on the same box the mesh reports and says what one texel is
 * worth, which is the number the world pass pushes its sample by.
 */
const SIZE = 2048;

// The shipped patch, as `columnPatchMesh` reports it: about 1,100 m across and
// a few hundred metres of crust hanging under it.
const box = {
	low: [-552, -320, -552] as [number, number, number],
	high: [552, 450, 552] as [number, number, number],
};
const key: [number, number, number] = [-0.62, 0.37, 0.16];

const len = Math.hypot(...key);
const to = key.map((c) => c / len) as [number, number, number];
const up: [number, number, number] =
	Math.abs(to[1]) > 0.999 ? [1, 0, 0] : [0, 1, 0];
const rx = [
	up[1] * to[2] - up[2] * to[1],
	up[2] * to[0] - up[0] * to[2],
	up[0] * to[1] - up[1] * to[0],
];
const rl = Math.hypot(rx[0]!, rx[1]!, rx[2]!);
const ax = rx.map((c) => c / rl) as [number, number, number];
const ay: [number, number, number] = [
	to[1] * ax[2] - to[2] * ax[1],
	to[2] * ax[0] - to[0] * ax[2],
	to[0] * ax[1] - to[1] * ax[0],
];

let loU = Infinity, hiU = -Infinity, loV = Infinity, hiV = -Infinity;
let loW = Infinity, hiW = -Infinity;
for (let corner = 0; corner < 8; corner++) {
	const px = (corner & 1 ? box.high : box.low)[0]!;
	const py = (corner & 2 ? box.high : box.low)[1]!;
	const pz = (corner & 4 ? box.high : box.low)[2]!;
	const u = px * ax[0] + py * ax[1] + pz * ax[2];
	const v = px * ay[0] + py * ay[1] + pz * ay[2];
	const w = px * to[0] + py * to[1] + pz * to[2];
	loU = Math.min(loU, u); hiU = Math.max(hiU, u);
	loV = Math.min(loV, v); hiV = Math.max(hiV, v);
	loW = Math.min(loW, w); hiW = Math.max(hiW, w);
}
const half = Math.max(hiU - loU, hiV - loV) / 2;
const deep = hiW - loW;
const diagonal =
	Math.hypot(
		box.high[0] - box.low[0],
		box.high[1] - box.low[1],
		box.high[2] - box.low[2],
	) / 2;
console.log(`box ${box.high[0] - box.low[0]} x ${box.high[1] - box.low[1]} x ${box.high[2] - box.low[2]} m`);
console.log(`tight fit: half ${half.toFixed(0)} m across, ${deep.toFixed(0)} m deep`);
console.log(`by the diagonal it would be: half ${diagonal.toFixed(0)} m`);
console.log(`one texel is ${((half * 2) / SIZE).toFixed(3)} m on the ground`);
console.log(`the normal offset pushes a sample ${(((half * 2) / SIZE) * 1.5).toFixed(3)} m`);
console.log(`a 1 m step at this key casts ${(1 / Math.tan(Math.asin(to[1]))).toFixed(2)} m`);
