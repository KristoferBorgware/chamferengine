import type { BlockLightChart } from "../../light/BlockLightChart.js";
import type { GpuContext } from "../gpu/GpuContext.js";
import type { WorldShape } from "../../world/WorldShape.js";
import { BLOCK_LIGHT_RANGE_MAX } from "../../light/BLOCK_LIGHT_RANGE_MAX.js";
import { blockLightSide } from "../../light/blockLightSide.js";
import { faceVertices } from "../../addressing/index.js";

/** Six `vec4f`: three solve rows, the source cell, the chart, and the color. */
const UNIFORM_BYTES = 96;

/**
 * A light source's reach on the GPU: one small volume and where it stands.
 *
 * The volume is a level per cell around the source, `r8unorm`, sampled with a
 * filter so a surface between two cells takes a blend of both rather than a
 * hexagonal edge. It is allocated once at the widest range a light may carry
 * and written whole, so moving the source or changing its range replaces the
 * contents and never the texture -- 42,875 texels, one byte each.
 *
 * The three solve rows turn a direction into barycentric weights on the source
 * face's corners. Cramer's rule against the face's own vertices gives them:
 * the weight on `A` is `dir . (B x C) / det`, and the rows are those three
 * cross products divided by the determinant.
 */
export class BlockLightMap {
	private readonly ctx: GpuContext;
	private readonly data = new Float32Array(UNIFORM_BYTES / 4);

	/** The volume every pipeline reads, and the sampler that reads it. */
	readonly texture: GPUTexture;
	readonly view: GPUTextureView;
	readonly sampler: GPUSampler;
	readonly uniformBuffer: GPUBuffer;

	constructor(ctx: GpuContext) {
		this.ctx = ctx;
		const side = blockLightSide(BLOCK_LIGHT_RANGE_MAX);
		this.texture = ctx.device.createTexture({
			size: [side, side, side],
			dimension: "3d",
			format: "r8unorm",
			usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
		});
		this.view = this.texture.createView();
		this.sampler = ctx.device.createSampler({
			magFilter: "linear",
			minFilter: "linear",
			addressModeU: "clamp-to-edge",
			addressModeV: "clamp-to-edge",
			addressModeW: "clamp-to-edge",
		});
		this.uniformBuffer = ctx.device.createBuffer({
			size: UNIFORM_BYTES,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		this.off();
	}

	/** No light: every surface reads zero from this and no texel is fetched. */
	off(): void {
		this.data[23] = 0;
		this.ctx.device.queue.writeBuffer(this.uniformBuffer, 0, this.data);
	}

	/**
	 * Put a light where `chart` says it stands, with the color and strength
	 * given.
	 *
	 * The chart's own `side` goes into the uniform rather than the texture's,
	 * so a caller filling a narrower cube than the texture holds would read
	 * the wrong entries -- the two are the same number, and this is where they
	 * are required to be.
	 */
	update(
		chart: BlockLightChart,
		shape: WorldShape,
		color: readonly [number, number, number],
		strength: number,
	): void {
		const [a, b, c] = faceVertices(chart.face);
		const det = a.dot(b.cross(c));
		const rows = [b.cross(c), c.cross(a), a.cross(b)];
		for (let row = 0; row < 3; row++) {
			const v = rows[row]!;
			this.data[row * 4] = v.x / det;
			this.data[row * 4 + 1] = v.y / det;
			this.data[row * 4 + 2] = v.z / det;
		}
		this.data[12] = chart.i;
		this.data[13] = chart.j;
		this.data[14] = chart.layer;
		this.data[15] = shape.n;
		this.data[16] = chart.side;
		this.data[17] = shape.blockSize;
		this.data[18] = 0;
		this.data[19] = shape.crustTopRadius;
		this.data.set(color, 20);
		this.data[23] = strength;
		const { device } = this.ctx;
		device.queue.writeBuffer(this.uniformBuffer, 0, this.data);
		device.queue.writeTexture(
			{ texture: this.texture },
			chart.levels,
			{ bytesPerRow: chart.side, rowsPerImage: chart.side },
			[chart.side, chart.side, chart.side],
		);
	}
}
