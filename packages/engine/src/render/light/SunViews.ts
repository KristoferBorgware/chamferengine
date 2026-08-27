import type { CascadeShadow } from "./CascadeShadow.js";
import type { CloudShadow } from "./CloudShadow.js";
import type { GpuContext } from "../gpu/GpuContext.js";

/**
 * Everything the sun took a picture of, as one bind group.
 *
 * **WebGPU guarantees four bind groups and the world already spends all
 * four**: the frame, the chunk or the sea patch, the coarse height map, and
 * what the sun sees. So a second thing the sun looks at cannot have a group of
 * its own -- it shares this one, and the two of them are held together here
 * rather than each holding half a layout neither can build alone.
 *
 * Six bindings. The first three are the cascades: their matrices, the depth
 * array, and the comparison sampler that reads it. The last three are the
 * clouds: their one matrix, the coverage, and an ordinary filtering sampler,
 * because coverage is a quantity to be blended and not a depth to be compared.
 *
 * Either half may replace its texture when the panel changes how many texels
 * it holds, so each carries a revision and the bind group is rebuilt when
 * either moves.
 */
export class SunViews {
	private readonly ctx: GpuContext;
	private readonly cascades: CascadeShadow;
	private readonly clouds: CloudShadow;

	/** What a pipeline declares as its group 3. */
	readonly layout: GPUBindGroupLayout;

	private group: GPUBindGroup;
	private builtFrom = -1;

	constructor(ctx: GpuContext, cascades: CascadeShadow, clouds: CloudShadow) {
		this.ctx = ctx;
		this.cascades = cascades;
		this.clouds = clouds;
		const fragment = GPUShaderStage.FRAGMENT;
		this.layout = ctx.device.createBindGroupLayout({
			entries: [
				{
					binding: 0,
					visibility: fragment,
					buffer: { type: "uniform" },
				},
				{
					binding: 1,
					visibility: fragment,
					texture: {
						sampleType: "depth",
						viewDimension: "2d-array",
					},
				},
				{
					binding: 2,
					visibility: fragment,
					sampler: { type: "comparison" },
				},
				{
					binding: 3,
					visibility: fragment,
					buffer: { type: "uniform" },
				},
				{
					binding: 4,
					visibility: fragment,
					texture: { sampleType: "float", viewDimension: "2d" },
				},
				{
					binding: 5,
					visibility: fragment,
					sampler: { type: "filtering" },
				},
			],
		});
		this.group = this.build();
	}

	/**
	 * The group to set, rebuilt if either half replaced its texture.
	 *
	 * Asked for once a frame rather than watched, because a texture is only
	 * ever replaced between frames and a comparison of two numbers is cheaper
	 * than anything that would notice sooner.
	 */
	get bindGroup(): GPUBindGroup {
		const stamp = this.cascades.revision * 1000 + this.clouds.revision;
		if (stamp !== this.builtFrom) this.group = this.build();
		return this.group;
	}

	private build(): GPUBindGroup {
		this.builtFrom = this.cascades.revision * 1000 + this.clouds.revision;
		return this.ctx.device.createBindGroup({
			layout: this.layout,
			entries: [
				{
					binding: 0,
					resource: { buffer: this.cascades.uniformBuffer },
				},
				{ binding: 1, resource: this.cascades.arrayView },
				{ binding: 2, resource: this.cascades.sampler },
				{ binding: 3, resource: { buffer: this.clouds.uniformBuffer } },
				{ binding: 4, resource: this.clouds.view },
				{ binding: 5, resource: this.clouds.sampler },
			],
		});
	}
}
