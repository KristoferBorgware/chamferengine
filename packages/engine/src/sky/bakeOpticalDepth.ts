import type { PlanetAtmosphere } from "./ATMOSPHERE.js";

/** A square texture of optical depth, angle across and height up. */
export interface OpticalDepthLUT {
	readonly size: number;
	readonly data: Float32Array;
}

/** How far the epsilon nudges a sample off the exact surface or exact top. */
const EPS = 1e-3;

/** Where a ray in the plane meets a circle of the given radius. */
function circleHit(
	radius: number,
	ox: number,
	oy: number,
	dx: number,
	dy: number,
): number {
	const b = ox * dx + oy * dy;
	const c = ox * ox + oy * oy - radius * radius;
	const d = b * b - c;
	if (d < 0) return 0;
	const s = Math.sqrt(d);
	const far = -b + s;
	if (far < 0) return 0;
	const near = Math.max(0, -b - s);
	return far - near;
}

/** The density this planet's air has at a height, as a fraction of the top. */
function densityAt(height01: number, falloff: number): number {
	const h = Math.max(0, Math.min(1, height01));
	return Math.exp(-h * falloff) * (1 - h);
}

/**
 * How much air stands between a point and the edge of the atmosphere, for
 * every height and every angle a ray could leave at, baked once.
 *
 * **This is Sebastian Lague's `AtmosphereTexture.compute`, moved to the CPU.**
 * His kernel bakes the same table on the GPU because Unity dispatches a
 * compute shader as readily as it draws a triangle; this engine has no compute
 * pipeline anywhere yet, and one texture, rebaked only when the atmosphere's
 * own shape changes rather than every frame, does not need one either -- a
 * 256×256 table at ten integration steps a texel is under a million `exp`
 * calls, sub-millisecond in JS.
 *
 * **Baked in the planet's own metres, not a unit sphere.** Lague's compute
 * kernel bakes with `planetRadius = 1`, and the runtime shader then samples
 * that table with real-world heights and adds no rescaling anywhere in
 * between -- so his baked value is short by a factor of the body's actual
 * radius, silently, and whatever looks right in the editor is quietly
 * absorbing the error into `scatteringStrength`. Baking directly against
 * {@link PlanetAtmosphere.planetRadius} and {@link PlanetAtmosphere.topRadius}
 * makes the table's own units the ones it is read back in, so there is
 * nothing left for a knob to secretly compensate for.
 *
 * A texel's two axes: `u` is the cosine of the angle between "straight up"
 * from the sample point and the ray's own direction, laid out linearly from
 * `1` at `u=0` to `-1` at `u=1`; `v` is how far up through the air the sample
 * point itself stands, `0` at the surface to `1` at the top. Every ray a
 * texel could be asked about starts on the line straight above the origin at
 * that height and leaves at that angle -- which is enough, because nothing
 * here cares which way "up" points in the world, only how far a ray travels
 * before the air runs out and how much density it crosses on the way.
 */
export function bakeOpticalDepth(
	air: PlanetAtmosphere,
	steps: number,
	size: number,
): OpticalDepthLUT {
	const data = new Float32Array(size * size);
	const shellHeight = air.topRadius - air.planetRadius;
	for (let row = 0; row < size; row++) {
		const height01 = row / (size - 1);
		const originY = air.planetRadius + height01 * shellHeight;
		for (let col = 0; col < size; col++) {
			const u = col / (size - 1);
			const cosAngle = 1 - 2 * u;
			const sinAngle = Math.sqrt(Math.max(0, 1 - cosAngle * cosAngle));
			const through = circleHit(
				air.topRadius,
				0,
				originY,
				sinAngle,
				cosAngle,
			);
			const length = Math.max(0, through - 2 * EPS);
			const step = length / steps;
			const startX = sinAngle * EPS;
			const startY = originY + cosAngle * EPS;
			let sum = 0;
			for (let s = 0; s < steps; s++) {
				const at = step * (s + 0.5);
				const sampleX = startX + sinAngle * at;
				const sampleY = startY + cosAngle * at;
				const r = Math.hypot(sampleX, sampleY) - air.planetRadius;
				sum += densityAt(r / shellHeight, air.densityFalloff) * step;
			}
			data[row * size + col] = sum;
		}
	}
	return { size, data };
}
