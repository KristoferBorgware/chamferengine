/**
 * One biome: a name, a color, a point in the climate square, the landform it
 * may stand on, and the block its ground is made of.
 *
 * Nothing here decides a height: the terrain names the landform first, and the
 * diagram partitions the square by nearest dot among the biomes that landform
 * allows -- so every climate has exactly one answer on every kind of ground,
 * and a desert filed under the lowlands cannot appear on a summit however hot
 * and dry the summit is.
 */
export interface BiomeDef {
	readonly name: string;

	/** The biome's color as sRGB hex, six digits, no `#`. */
	readonly hex: string;

	/** Temperature, `0` cold to `1` hot, in the fitted square. */
	readonly t: number;

	/** Humidity, `0` dry to `1` wet, in the fitted square. */
	readonly h: number;

	/** A key from `LANDFORMS`, or `ANY_LANDFORM` for every kind of ground. */
	readonly landform: string;

	/**
	 * The block the biome's surface is made of.
	 *
	 * One type per biome, so a save, a picture and a shader all say which
	 * biome built a cell by reading the block alone. A biome defined at run
	 * time carries the block of the definition it was copied from, because
	 * the registry is append-only and written at build time.
	 */
	readonly block: number;

	/**
	 * The block a column of this biome cuts into below its surface, or
	 * absent for the elevation bands' own dirt.
	 *
	 * **Only where the ground under a biome is not generic dirt.** A mesa's
	 * red rock and a dune's own sandstone are still the ground a moment after
	 * the top layer, and a biome whose surface names one of those is not
	 * telling the truth about what a player digs into if the layer under it
	 * is silently something else. Read once a column, the same read that
	 * named the surface -- not a second lookup.
	 */
	readonly underlay?: number;
}
