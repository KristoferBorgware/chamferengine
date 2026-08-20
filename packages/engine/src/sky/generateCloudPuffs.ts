import type { CloudPuff, CloudPuffLayer } from "./CloudPuff.js";
import { Vec3 } from "../math/Vec3.js";
import { fbm } from "../generation/noise/fbm.js";

const FREQUENCY = 2.4;
const OCTAVES = 4;
const COVERAGE = 0.42;
const FLOOR = 0.02;

/** Radians between one point of a golden-angle spiral and the next. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** A near-uniform spread of `n` directions over the sphere. */
function fibonacciSpherePoint(i: number, n: number): Vec3 {
	const y = n > 1 ? 1 - (i / (n - 1)) * 2 : 0;
	const ringRadius = Math.sqrt(Math.max(0, 1 - y * y));
	const theta = GOLDEN_ANGLE * i;
	return new Vec3(
		Math.cos(theta) * ringRadius,
		y,
		Math.sin(theta) * ringRadius,
	);
}

/** A repeatable value in `[0, 1)` from two whole numbers. */
function hashUnit(a: number, b: number): number {
	let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263);
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Where the billboard clouds sit, before the wind turns them.
 *
 * **A cloud is a formation, never one hexagon.** Candidate formation centres
 * are spread evenly over the sphere and each is asked one {@link fbm} value at
 * the seed -- the same coverage field shape the volumetric clouds sample -- so
 * a formation stands only where that field says cloud is. Every centre that
 * passes then fills a disc around itself with overlapping puffs, which is what
 * makes a mass read as one thing: a lone hexagon every kilometre reads as a
 * speck of debris, and at the shipped planet's 6,800 m radius one puff per
 * accepted direction is exactly that far apart.
 *
 * Puffs fill their disc along a golden-angle spiral rather than at random, so
 * a formation has no clumps and no bald patches, and the count follows the
 * coverage value -- a thin formation is a handful of puffs, a thick one is the
 * whole allowance. Cover tapers from the middle outward and each puff is
 * lifted off its deck's own radius by its own amount, giving a mass a rim that
 * breaks into separate hexagons and a lit top over a grey underside.
 *
 * This is drawing, not terrain: nothing about a billboard cloud is shared
 * between clients, so the sphere spread and the disc fill both use plain
 * trigonometry rather than the integer-only kernel the generator is held to.
 */
export function generateCloudPuffs(
	seed: number,
	clusters: number,
	perCluster: number,
	layers: readonly CloudPuffLayer[],
): CloudPuff[] {
	const puffs: CloudPuff[] = [];
	for (let deck = 0; deck < layers.length; deck++) {
		const layer = layers[deck]!;
		// Each deck reads the field somewhere else, or both decks would put
		// their formations at the same longitudes and the sky would be one
		// pattern drawn twice at two heights.
		const away = deck * 5.3;
		for (let at = 0; at < clusters; at++) {
			const centre = fibonacciSpherePoint(at, clusters);
			const value = fbm(
				centre.x + away,
				centre.y + away,
				centre.z + away,
				FREQUENCY,
				OCTAVES,
				seed,
			);
			const cover = Math.min(
				1,
				Math.max(0, value - (1 - 2 * COVERAGE)) / COVERAGE,
			);
			if (cover <= FLOOR) continue;

			// A frame on the sphere at the formation's own place, for
			// scattering its puffs across the surface rather than through it.
			let right = new Vec3(0, 1, 0).cross(centre);
			if (right.length() < 1e-6) right = new Vec3(1, 0, 0);
			right = right.normalize();
			const ahead = centre.cross(right).normalize();

			// A thin formation is smaller AND holds fewer puffs, and the two
			// have to fall off together or it thins out into specks. A disc
			// grows as the square of its reach, so reach takes the **root** of
			// the coverage while the count takes the coverage itself -- which
			// leaves puffs-per-area the same whatever the coverage, so every
			// formation is equally solid and only its size says how thick the
			// field underneath it was.
			const reach = (layer.spread * Math.sqrt(cover)) / layer.radius;
			const count = Math.max(4, Math.round(perCluster * cover));
			for (let n = 0; n < count; n++) {
				// Square-rooted so the spiral fills the disc evenly instead of
				// crowding its middle, and jittered so a formation's rim is
				// ragged rather than a circle.
				const step = (n + 0.5) / count;
				const out = Math.sqrt(step);
				const around = n * GOLDEN_ANGLE + hashUnit(at + deck * 7919, n);
				const stray = 0.7 + 0.6 * hashUnit(at + deck * 104729, n + 31);
				const across = out * reach * stray;
				const direction = centre
					.add(right.scale(Math.cos(around) * across))
					.add(ahead.scale(Math.sin(around) * across))
					.normalize();

				// Thick through the middle and wispy at the rim, which is
				// where a mass breaks into the separate hexagons it is made of.
				const middle = 1 - out;
				const lift =
					(hashUnit(at + deck * 15485863, n + 977) - 0.5) *
					2 *
					layer.thickness;
				puffs.push({
					direction,
					radius: layer.radius + lift,
					windRate: layer.windRate,
					size:
						layer.size *
						(0.45 +
							0.55 * middle +
							0.35 * hashUnit(at + deck * 32452843, n + 7)),
					cover: cover * (0.4 + 0.6 * middle),
					// Its own height inside the formation, so the tops of a
					// mass are lit and its underside is not.
					shade:
						0.55 +
						0.45 *
							(layer.thickness > 0
								? (lift / layer.thickness + 1) / 2
								: 1),
				});
			}
		}
	}
	return puffs;
}
