import { writeFileSync } from "node:fs";
import { buildCoarseMap, seedFromString } from "chamfer/generation";
import { positionOf } from "chamfer/coordinates";
import { positionToCell } from "chamfer/addressing";
import { PlanetSettings } from "../packages/client/src/PlanetSettings.js";
import { encodePng } from "./png.js";
const W = 560,
	H = 380,
	SPAN = 22,
	LAT = 30,
	LON = 60;
for (const ridge of [0, 0.6]) {
	const s = new PlanetSettings({
		ridge,
		relief: 700,
		crustMetres: 1024,
	} as never);
	const map = buildCoarseMap(seedFromString("chamfer"), s.coarseOptions());
	const n = 1 << map.level;
	const R = s.radius,
		mPerDeg = (R * Math.PI) / 180;
	const at = (la: number, lo: number) => {
		const c = positionToCell(
			positionOf({ latitude: la, longitude: lo, altitude: 0 }, 1),
			n,
		);
		return map.height[map.index.indexOf(c.face, c.i, c.j)] ?? 0;
	};
	const d = SPAN / W;
	const rgba = new Uint8ClampedArray(W * H * 4);
	for (let y = 0; y < H; y++)
		for (let x = 0; x < W; x++) {
			const la = LAT + ((SPAN * H) / W) * (0.5 - (y + 0.5) / H);
			const lo = LON + SPAN * ((x + 0.5) / W - 0.5);
			const h = at(la, lo);
			const gx =
				(at(la, lo + d) - at(la, lo - d)) /
				(2 * d * mPerDeg * Math.cos((la * Math.PI) / 180));
			const gy = (at(la + d, lo) - at(la - d, lo)) / (2 * d * mPerDeg);
			const l = Math.max(
				0.1,
				Math.min(1, 0.52 + 1.9 * (-0.7071 * gx + 0.7071 * gy)),
			);
			const p = (y * W + x) * 4;
			if (h <= 0) {
				rgba[p] = 30;
				rgba[p + 1] = 54;
				rgba[p + 2] = 96;
			} else {
				const t = Math.min(1, h / 700);
				rgba[p] = 255 * l * (0.4 + 0.55 * t);
				rgba[p + 1] = 255 * l * (0.52 + 0.42 * t);
				rgba[p + 2] = 255 * l * (0.34 + 0.6 * t);
			}
			rgba[p + 3] = 255;
		}
	writeFileSync(`.scratch/s-${ridge}.png`, encodePng(W, H, rgba));
}
console.log(
	"ok, patch",
	((SPAN * 6801 * Math.PI) / 180 / 1000).toFixed(1),
	"km across",
);
