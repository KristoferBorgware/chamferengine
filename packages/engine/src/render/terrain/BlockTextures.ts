import type { GpuContext } from "../gpu/GpuContext.js";

/** What a bake writes beside its strips: the layer order and the block table. */
export interface BlockAtlas {
	/** Texels a side, at the finest level. */
	readonly size: number;

	/** Mip levels the bake wrote, one strip apiece. */
	readonly levels: number;

	/** Every picture, in the order the layers are numbered. */
	readonly layers: readonly string[];

	/** Numbers a block holds in {@link table}. */
	readonly slots: number;

	/**
	 * Which layer each block wears, `block * slots + which`.
	 *
	 * `0` is its cap, `1` its side, `2` its underside and `3` the band drawn
	 * over the side, `-1` where there is none.
	 */
	readonly table: readonly number[];
}

/** The slot a face reads, which is the order the bake writes them in. */
export const SLOT_TOP = 0;
export const SLOT_SIDE = 1;
export const SLOT_BOTTOM = 2;
export const SLOT_OVERLAY = 3;

/**
 * Every block picture on the GPU, as one array texture.
 *
 * **An array rather than an atlas.** A layer mips down to one texel with
 * nothing beside it to bleed in, and a wall merged over several layers repeats
 * its picture by asking the sampler rather than by arithmetic in the shader --
 * neither of which an atlas gives without gutters and a manual wrap.
 *
 * Filtered on the way down and **nearest on the way up**: a block seen close is
 * meant to read as texels, which is the whole look, and a block seen far is
 * meant to stop flickering. That pair rules out anisotropy, which a sampler
 * may only have when it filters both ways.
 */
export class BlockTextures {
	readonly atlas: BlockAtlas;
	readonly texture: GPUTexture;
	readonly view: GPUTextureView;
	readonly sampler: GPUSampler;

	/** Which layer each block wears, flat, for the mesher to index. */
	readonly table: Int32Array;

	constructor(
		ctx: GpuContext,
		atlas: BlockAtlas,
		levels: readonly ImageData[],
	) {
		this.atlas = atlas;
		this.table = Int32Array.from(atlas.table);
		const { device } = ctx;
		this.texture = device.createTexture({
			size: [atlas.size, atlas.size, atlas.layers.length],
			dimension: "2d",
			format: "rgba8unorm-srgb",
			mipLevelCount: atlas.levels,
			usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
		});
		// One write a level: the strip a bake wrote is already the byte order
		// an array wants, layer 0's rows and then layer 1's.
		levels.forEach((image, level) => {
			const wide = atlas.size >> level;
			device.queue.writeTexture(
				{ texture: this.texture, mipLevel: level },
				image.data,
				{ bytesPerRow: wide * 4, rowsPerImage: wide },
				[wide, wide, atlas.layers.length],
			);
		});
		this.view = this.texture.createView({ dimension: "2d-array" });
		this.sampler = device.createSampler({
			magFilter: "nearest",
			minFilter: "linear",
			mipmapFilter: "linear",
			// A wall merged down a column runs its picture past 1 in `v`, so
			// the repeat is what makes a three-layer wall three pictures tall.
			addressModeU: "repeat",
			addressModeV: "repeat",
			// **No anisotropy**, because it is only allowed where all three
			// filters are linear and magnifying is nearest here. Blurring a
			// texel to gain it would give up the whole look for a sharper
			// grazing angle.
		});
	}

	/**
	 * Fetch a bake and decode every level.
	 *
	 * Decoded through a canvas rather than uploaded as an image, because
	 * `copyExternalImageToTexture` writes one layer at a time and the strips
	 * are already stacked for a single write.
	 */
	static async load(base: string): Promise<{
		atlas: BlockAtlas;
		levels: ImageData[];
	}> {
		const atlas = (await (
			await fetch(`${base}blocks.json`)
		).json()) as BlockAtlas;
		const levels: ImageData[] = [];
		for (let level = 0; level < atlas.levels; level++) {
			const wide = atlas.size >> level;
			const blob = await (
				await fetch(`${base}blocks-${level}.png`)
			).blob();
			const bitmap = await createImageBitmap(blob);
			const canvas = new OffscreenCanvas(
				wide,
				wide * atlas.layers.length,
			);
			const flat = canvas.getContext("2d", { willReadFrequently: true })!;
			flat.drawImage(bitmap, 0, 0);
			levels.push(
				flat.getImageData(0, 0, wide, wide * atlas.layers.length),
			);
		}
		return { atlas, levels };
	}
}
