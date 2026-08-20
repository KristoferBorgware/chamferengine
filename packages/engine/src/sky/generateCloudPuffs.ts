import type { CloudPuff, CloudPuffLayer } from "./CloudPuff.js";
import { Vec3 } from "../math/Vec3.js";
import { fbm } from "../generation/noise/fbm.js";

const FREQUENCY = 2.4;
const OCTAVES = 4;
const COVERAGE = 0.42;
const FLOOR = 0.02;

/** A near-uniform spread of `n` directions over the sphere. */
function fibonacciSpherePoint(i: number, n: number): Vec3 {
	const goldenAngle = Math.PI * (3 - Math.sqrt(5));
	const y = 1 - (i / (n - 1)) * 2;
	const ringRadius = Math.sqrt(Math.max(0, 1 - y * y));
	const theta = goldenAngle * i;
	return new Vec3(
		Math.cos(theta) * ringRadius,
		y,
		Math.sin(theta) * ringRadius,
	);
}

/**
 * Where the billboard clouds sit, before the wind turns them.
 *
 * Candidate directions are spread evenly over the sphere and each is asked
 * one {@link fbm} value at the seed, the same coverage field shape the
 * volumetric clouds sample -- so a puff exists only where that field says
 * cloud is, and the result reads as formations rather than a scatter of
 * loose hexagons. A candidate below the coverage floor is left out entirely
 * rather than drawn at zero size.
 *
 * This is drawing, not terrain: nothing about a billboard cloud is shared
 * between clients, so the sphere spread and the coverage shaping both use
 * plain trigonometry rather than the integer-only kernel `docs/23` requires
 * of anything two clients must agree on.
 */
export function generateCloudPuffs(
	seed: number,
	candidatesPerLayer: number,
	layers: readonly CloudPuffLayer[],
): CloudPuff[] {
	const puffs: CloudPuff[] = [];
	for (const layer of layers)
		for (let n = 0; n < candidatesPerLayer; n++) {
			const direction = fibonacciSpherePoint(n, candidatesPerLayer);
			const value = fbm(
				direction.x,
				direction.y,
				direction.z,
				FREQUENCY,
				OCTAVES,
				seed,
			);
			const cover = Math.max(0, value - (1 - 2 * COVERAGE)) / COVERAGE;
			if (cover <= FLOOR) continue;
			puffs.push({
				direction,
				radius: layer.radius,
				windRate: layer.windRate,
				size: layer.size * (0.6 + 0.4 * Math.min(1, cover)),
				cover,
			});
		}
	return puffs;
}
