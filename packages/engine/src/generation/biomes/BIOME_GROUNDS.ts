import { BIOME_PRESETS } from "./BIOME_PRESETS.js";

/** One sRGB channel as the linear value a vertex color carries. */
function linear(byte: number): number {
	return Math.pow(byte / 255, 2.2);
}

/**
 * The ground color of every biome block, keyed by block number.
 *
 * Written in from the presets rather than typed out beside the other block
 * colors, so a biome's dot on the diagram and the ground it builds are one
 * hex value: a registry shade a few steps off the diagram's is a map that
 * answers a slightly different question than the one asked of it.
 */
export const BIOME_GROUNDS: Readonly<
	Record<number, readonly [number, number, number]>
> = Object.fromEntries(
	Object.values(BIOME_PRESETS)
		.flat()
		.map((biome) => {
			const n = parseInt(biome.hex, 16);
			return [
				biome.block,
				[
					linear((n >> 16) & 255),
					linear((n >> 8) & 255),
					linear(n & 255),
				],
			];
		}),
);
