import type { Frame } from "../Frame.js";
import type { GpuContext } from "../gpu/GpuContext.js";
import type { Mat4 } from "../../math/Mat4.js";
import type { PassLayer } from "../PassLayer.js";
import type { Vec3 } from "../../math/Vec3.js";
import { SKY_SHADER } from "./SKY_SHADER.js";

/** Where the moon is, how big it looks, and how far off it stands. */
export interface Moon {
	/** Unit direction from the planet's centre. */
	readonly direction: Vec3;

	/** Half the angle it covers, in radians. */
	readonly angularRadius: number;
}

/** The inverse matrix and the moon. */
const SKY_BYTES = 64 + 16;

/**
 * Draws what is behind the air: space, the stars, and the moon.
 *
 * The scattering moved out to {@link AtmospherePass}, which marches it over
 * the finished frame rather than behind it -- so this is the backdrop that
 * pass is marched against, and nothing here fades with the day.
 */
export class SkyRenderer implements PassLayer {
	private readonly ctx: GpuContext;
	private readonly skyPipeline: GPURenderPipeline;
	private readonly uniform: GPUBuffer;
	private readonly bindGroup: GPUBindGroup;
	private readonly data = new Float32Array(SKY_BYTES / 4);

	/** Where the moon sits, and how much sky it takes. */
	moon: Moon;

	/** The inverse of the frame's view-projection, for casting rays per pixel. */
	inverseViewProj: Mat4 | null = null;

	constructor(ctx: GpuContext, moon: Moon) {
		this.ctx = ctx;
		this.moon = moon;
		const { device, sceneFormat: format } = ctx;

		const layout = device.createBindGroupLayout({
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
					buffer: { type: "uniform" },
				},
			],
		});
		this.uniform = device.createBuffer({
			size: SKY_BYTES,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		this.bindGroup = device.createBindGroup({
			layout,
			entries: [{ binding: 0, resource: { buffer: this.uniform } }],
		});

		// The sky shares the frame's bind group, so it reads the same sun and
		// the same fog the terrain does.
		const frameLayout = device.createBindGroupLayout({
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
					buffer: { type: "uniform" },
				},
			],
		});
		const pipelineLayout = device.createPipelineLayout({
			bindGroupLayouts: [frameLayout, layout],
		});

		this.skyPipeline = device.createRenderPipeline({
			layout: pipelineLayout,
			vertex: {
				module: device.createShaderModule({ code: SKY_SHADER }),
				entryPoint: "vertexMain",
			},
			fragment: {
				module: device.createShaderModule({ code: SKY_SHADER }),
				entryPoint: "fragmentMain",
				targets: [{ format }],
			},
			primitive: { topology: "triangle-list" },
			// Fills every pixel at the far plane and writes no depth, so the
			// ground draws over it without a comparison.
			depthStencil: {
				format: "depth32float",
				depthWriteEnabled: false,
				depthCompare: "always",
			},
		});
	}

	before(pass: GPURenderPassEncoder, frame: Frame): void {
		if (!this.inverseViewProj) return;
		this.data.set(this.inverseViewProj.elements, 0);
		this.data.set(
			[
				this.moon.direction.x,
				this.moon.direction.y,
				this.moon.direction.z,
				this.moon.angularRadius,
			],
			16,
		);
		this.ctx.device.queue.writeBuffer(this.uniform, 0, this.data);

		pass.setPipeline(this.skyPipeline);
		pass.setBindGroup(1, this.bindGroup);
		pass.draw(3);
		void frame;
	}
}
