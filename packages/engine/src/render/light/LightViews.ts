import type { BlockLightMap } from "./BlockLightMap.js";
import type { CascadeShadow } from "./CascadeShadow.js";
import type { CloudShadow } from "./CloudShadow.js";
import type { GpuContext } from "../gpu/GpuContext.js";

/**
 * Everything that lights a surface and is not one number, as one bind group.
 *
 * **WebGPU guarantees four bind groups and the world already spends all
 * four**: the frame, the chunk or the sea patch, the coarse height map, and
 * this. So a second thing a surface has to look up cannot have a group of its
 * own -- they share this one, and they are held together here rather than each
 * holding a part of a layout none of them can build alone.
 *
 * Nine bindings. The first three are the sun's cascades: their matrices, the
 * depth array, and the comparison sampler that reads it. The next three are
 * the clouds: their one matrix, the coverage, and an ordinary filtering
 * sampler, because coverage is a quantity to be blended and not a depth to be
 * compared. The last three are the light standing in the world: where it is,
 * the cube of levels around it, and a filtering sampler.
 *
 * Any of them may replace its texture when the panel changes how many texels
 * it holds, so each carries a revision and the bind group is rebuilt when one
 * moves.
 */
export class LightViews {
	private readonly ctx: GpuContext;
	private readonly cascades: CascadeShadow;
	private readonly clouds: CloudShadow;
	private readonly lamp: BlockLightMap;

	/** What a pipeline declares as its group 2. */
	readonly layout: GPUBindGroupLayout;

	private group: GPUBindGroup;
	private builtFrom = -1;

	constructor(
		ctx: GpuContext,
		cascades: CascadeShadow,
		clouds: CloudShadow,
		lamp: BlockLightMap,
	) {
		this.ctx = ctx;
		this.cascades = cascades;
		this.clouds = clouds;
		this.lamp = lamp;
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
				{
					binding: 6,
					visibility: fragment,
					buffer: { type: "uniform" },
				},
				{
					binding: 7,
					visibility: fragment,
					texture: { sampleType: "float", viewDimension: "3d" },
				},
				{
					binding: 8,
					visibility: fragment,
					sampler: { type: "filtering" },
				},
			],
		});
		this.group = this.build();
	}

	/**
	 * The group to set, rebuilt if any of them replaced its texture.
	 *
	 * Asked for once a frame rather than watched, because a texture is only
	 * ever replaced between frames and a comparison of two numbers is cheaper
	 * than anything that would notice sooner.
	 */
	get bindGroup(): GPUBindGroup {
		if (this.stamp() !== this.builtFrom) this.group = this.build();
		return this.group;
	}

	private stamp(): number {
		return this.cascades.revision * 1000 + this.clouds.revision;
	}

	private build(): GPUBindGroup {
		this.builtFrom = this.stamp();
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
				{ binding: 6, resource: { buffer: this.lamp.uniformBuffer } },
				{ binding: 7, resource: this.lamp.view },
				{ binding: 8, resource: this.lamp.sampler },
			],
		});
	}
}
