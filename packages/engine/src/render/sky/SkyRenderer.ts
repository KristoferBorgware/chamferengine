import type { Frame } from "../Frame.js";
import type { GpuContext } from "../gpu/GpuContext.js";
import type { Mat4 } from "../../math/Mat4.js";
import type { PassLayer } from "../PassLayer.js";
import type { Vec3 } from "../../math/Vec3.js";
import type { PlanetAtmosphere } from "../../sky/ATMOSPHERE.js";
import { SKY_SHADER } from "./SKY_SHADER.js";

/** Where the moon is, how big it looks, and how far off it stands. */
export interface Moon {
	/** Unit direction from the planet's centre. */
	readonly direction: Vec3;

	/** Half the angle it covers, in radians. */
	readonly angularRadius: number;
}

/** The inverse matrix, the moon, and the three vectors the atmosphere needs. */
const SKY_BYTES = 64 + 16 + 16 + 16 + 16;

/**
 * Draws the sky behind everything else.
 *
 * The atmosphere is the planet's own, built by {@link planetAtmosphere} from a
 * height and a wanted zenith depth. The camera's real position goes straight
 * in as the ray origin -- there is no height to lift and no factor to lift it
 * by. The sun's direction is the only thing still taken from the world as-is.
 */
export class SkyRenderer implements PassLayer {
	private readonly ctx: GpuContext;
	private readonly skyPipeline: GPURenderPipeline;
	private readonly uniform: GPUBuffer;
	private readonly bindGroup: GPUBindGroup;
	private readonly data = new Float32Array(SKY_BYTES / 4);

	/** The planet's own air, in its own metres. */
	atmosphere: PlanetAtmosphere;

	/** Where the moon sits, and how much sky it takes. */
	moon: Moon;

	/** The inverse of the frame's view-projection, for casting rays per pixel. */
	inverseViewProj: Mat4 | null = null;

	constructor(ctx: GpuContext, moon: Moon, atmosphere: PlanetAtmosphere) {
		this.ctx = ctx;
		this.moon = moon;
		this.atmosphere = atmosphere;
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
				format: "depth24plus",
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
		const air = this.atmosphere;
		this.data.set(
			[
				air.planetRadius,
				air.topRadius,
				air.rayleighScaleHeight,
				air.mieScaleHeight,
			],
			20,
		);
		this.data.set(
			[air.rayleigh[0], air.rayleigh[1], air.rayleigh[2], air.mie],
			24,
		);
		this.data.set([air.mieDirection, 0, 0, 0], 28);
		this.ctx.device.queue.writeBuffer(this.uniform, 0, this.data);

		pass.setPipeline(this.skyPipeline);
		pass.setBindGroup(1, this.bindGroup);
		pass.draw(3);
		void frame;
	}
}
