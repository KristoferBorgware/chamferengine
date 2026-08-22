import type { CoarseMapOptions } from "./CoarseMapOptions.js";
import type { LayerNoise } from "./layerNoise.js";
import type { LayeredField } from "./layeredHeight.js";
import { COARSE_MAP_DEFAULTS } from "./CoarseMapOptions.js";
import { splineAt } from "./splineAt.js";

/**
 * The surface, from two layers of noise and the curves read off them.
 *
 * Everything in {@link layeredHeight} except the octave stacks: the two curves,
 * the merge rule, the mountain line and the balance between the layers. Held
 * apart because they are dragged, and the stacks are not -- a curve moved on
 * the bench re-runs this pass alone over a field that is already in memory.
 *
 * The arithmetic is the same and in the same order, so a map built through the
 * two halves is bit-for-bit the one built through {@link layeredHeight}.
 */
export function shapeLayers(
	noise: LayerNoise,
	options: CoarseMapOptions = {},
): LayeredField {
	const s = { ...COARSE_MAP_DEFAULTS, ...options };
	const count = noise.terrain.length;

	// Where the terrain curve reaches, so the gate is stated against the curve
	// rather than against an axis the curve may not touch.
	let curveLow = Infinity;
	let curveHigh = -Infinity;
	for (const [, out] of s.terrain.curve) {
		if (out < curveLow) curveLow = out;
		if (out > curveHigh) curveHigh = out;
	}
	const lineHeight = curveLow + s.mountainLine * (curveHigh - curveLow);
	const gateSpan = Math.max(1e-6, curveHigh - lineHeight);

	const raw = new Float64Array(count);
	const terrainOf = new Float32Array(count);
	const mountainOf = new Float32Array(count);
	const gated = s.merge === "gated";
	let aboveLine = 0;
	for (let cell = 0; cell < count; cell++) {
		const terrainRaw = noise.terrain[cell]!;
		const shaped = splineAt(s.terrain.curve, terrainRaw);
		terrainOf[cell] = shaped;
		if (shaped > lineHeight) aboveLine++;
		let mount = 1;
		if (s.mountainLayer && noise.mountain) {
			mount = splineAt(s.mountain.curve, noise.mountain[cell]!);
			mountainOf[cell] = mount;
		} else if (gated) {
			// A layer switched off means the value that removes it: no height
			// under `gated`, full roughness everywhere under `roughen`.
			mount = 0;
		}
		let term;
		if (gated) {
			const over = Math.max(
				0,
				Math.min(1, (shaped - lineHeight) / gateSpan),
			);
			term = mount * (over * over * (3 - 2 * over)) * s.detail;
		} else {
			term = terrainRaw * mount * s.detail;
		}
		raw[cell] = shaped * 2 - 1 + term;
	}
	return {
		raw,
		terrain: terrainOf,
		mountain: mountainOf,
		overLine: aboveLine / Math.max(1, count),
	};
}
