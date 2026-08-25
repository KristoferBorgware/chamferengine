import type { GpuContext } from "../gpu/GpuContext.js";
import type { Mat4 } from "../../math/Mat4.js";
import type { PlanetAtmosphere } from "../../sky/ATMOSPHERE.js";
import { ATMOSPHERE_SHADER } from "./ATMOSPHERE_SHADER.js";
import { bakeOpticalDepth } from "../../sky/bakeOpticalDepth.js";

/**
 * The matrix, the eye, the sun, the moon, the shape, the coefficients, the
 * march, and how much of the air a surface behind it is seen through.
 */
const AIR_BYTES = 64 + 16 * 7;

/** Texels a side the baked optical-depth table holds. */
const LUT_SIZE = 256;

/**
 * The air, marched over the finished frame -- and everything past it.
 *
 * It owns the two images either side of itself: the world is drawn into
 * {@link AtmospherePass.sceneTarget}, this pass reads that and the depth
 * beside it, and what comes out of {@link AtmospherePass.view} is what the
 * tone curve is applied to. Both are half-float, because the sun disc is
 * brighter than white and has to survive being written down twice on its way
 * out.
 *
 * **The depth is why this is a pass and not a layer.** A layer draws inside
 * the frame's own render pass, where the depth buffer is an attachment and
 * cannot also be read; the air has to know how far away every pixel's
 * surface is, so it runs after that pass ends and reads the depth as a
 * texture. **The pixels with nothing behind them are this pass's too** --
 * the stars, the moon and the sun disc are drawn here, in the same march,
 * rather than by a separate pass filling the screen before the world does.
 *
 * With the air switched off it still runs, and copies -- the sky is still
 * there to look at even with no atmosphere in front of it. That costs one
 * full-screen pass and keeps the frame one shape rather than two.
 */
export class AtmospherePass {
	private readonly ctx: GpuContext;
	private readonly pipeline: GPURenderPipeline;
	private readonly layout: GPUBindGroupLayout;
	private readonly uniform: GPUBuffer;
	private readonly data = new Float32Array(AIR_BYTES / 4);
	private readonly lutSampler: GPUSampler;

	private sceneImage: GPUTexture | null = null;
	private sceneView: GPUTextureView | null = null;
	private litImage: GPUTexture | null = null;
	private litView: GPUTextureView | null = null;
	private lut: GPUTexture;
	private bindGroup: GPUBindGroup | null = null;
	private boundDepth: GPUTextureView | null = null;

	/** What the table was last baked from, so a knob left alone bakes nothing. */
	private bakedFrom: PlanetAtmosphere | null = null;
	private bakedSteps = -1;

	/** Steps the view march takes, and steps the table is baked with. */
	inScatteringPoints = 10;
	opticalDepthPoints = 10;

	/**
	 * How far each pixel's march is offset from its neighbours', as a
	 * fraction of one step.
	 *
	 * **Banding and grain are the same quantity, spent one way or the other.**
	 * Ten integration steps cannot draw a smooth sky, and the error has to
	 * land somewhere: at `0` every pixel samples the same heights and it
	 * lands as bands, at `1` a whole step's worth is spread over neighbouring
	 * pixels as noise. The pattern is what decides how much of that noise can
	 * be seen -- see `ditherAt` in {@link ATMOSPHERE_SHADER}.
	 */
	ditherStrength = 0.55;

	/** Half the angle the sun disc covers, in radians. */
	sunAngularRadius = (0.9 * Math.PI) / 180;

	/** Half the angle the moon disc covers, in radians. */
	moonAngularRadius = (0.6 * Math.PI) / 180;

	constructor(ctx: GpuContext) {
		this.ctx = ctx;
		const { device, sceneFormat: format } = ctx;
		const module = device.createShaderModule({ code: ATMOSPHERE_SHADER });
		this.layout = device.createBindGroupLayout({
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.FRAGMENT,
					buffer: { type: "uniform" },
				},
				{
					binding: 1,
					visibility: GPUShaderStage.FRAGMENT,
					texture: { sampleType: "unfilterable-float" },
				},
				{
					binding: 2,
					visibility: GPUShaderStage.FRAGMENT,
					texture: { sampleType: "depth" },
				},
				{
					binding: 3,
					visibility: GPUShaderStage.FRAGMENT,
					texture: { sampleType: "float" },
				},
				{
					binding: 4,
					visibility: GPUShaderStage.FRAGMENT,
					sampler: { type: "filtering" },
				},
			],
		});
		this.uniform = device.createBuffer({
			size: AIR_BYTES,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		this.pipeline = device.createRenderPipeline({
			layout: device.createPipelineLayout({
				bindGroupLayouts: [this.layout],
			}),
			vertex: { module, entryPoint: "vertexMain" },
			fragment: {
				module,
				entryPoint: "fragmentMain",
				targets: [{ format }],
			},
			primitive: { topology: "triangle-list" },
		});
		// The table's own edge is a real edge -- height 0 and height 1 are the
		// ground and the top of the air, and clamping keeps a ray asking for
		// either from reading the opposite side of the texture.
		this.lutSampler = device.createSampler({
			magFilter: "linear",
			minFilter: "linear",
			addressModeU: "clamp-to-edge",
			addressModeV: "clamp-to-edge",
		});
		this.lut = device.createTexture({
			size: { width: 1, height: 1 },
			format: "r16float",
			usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
		});
	}

	/** Where the world is drawn, matched to the canvas. */
	sceneTarget(width: number, height: number): GPUTextureView {
		this.resize(width, height);
		return this.sceneView!;
	}

	/** What the world looks like through the air, for the tone curve to read. */
	get view(): GPUTextureView {
		return this.litView!;
	}

	/**
	 * Draw the frame again with the air, the stars, the moon and the sun disc
	 * in front of it.
	 *
	 * `depth` is the buffer the world pass just wrote, and it is what tells
	 * each pixel how much air stands between the eye and whatever it is
	 * looking at. `air` being null is a world with no atmosphere, which still
	 * runs the stars and the two discs, only without any scattering over them.
	 */
	resolve(
		encoder: GPUCommandEncoder,
		depth: GPUTextureView,
		eye: readonly [number, number, number],
		sun: readonly [number, number, number],
		moonDirection: readonly [number, number, number],
		inverseViewProj: Mat4,
		air: PlanetAtmosphere | null,
	): void {
		if (!this.sceneView || !this.litView) return;
		if (air) this.ensureBaked(air);
		if (this.boundDepth !== depth) this.rebind(depth);

		this.data.set(inverseViewProj.elements, 0);
		this.data.set([eye[0], eye[1], eye[2], air ? 1 : 0], 16);
		this.data.set([sun[0], sun[1], sun[2], 0], 20);
		this.data.set(
			[
				moonDirection[0],
				moonDirection[1],
				moonDirection[2],
				this.moonAngularRadius,
			],
			24,
		);
		if (air) {
			this.data.set(
				[
					air.planetRadius,
					air.topRadius,
					air.densityFalloff,
					this.sunAngularRadius,
				],
				28,
			);
			this.data.set(
				[
					air.scattering[0],
					air.scattering[1],
					air.scattering[2],
					Math.max(0, air.mieStrength),
				],
				32,
			);
			this.data.set(
				[
					Math.max(2, Math.round(this.inScatteringPoints)),
					Math.min(1, Math.max(0, this.ditherStrength)),
					air.mieDirection,
					Math.max(0, air.intensity),
				],
				36,
			);
			this.data.set([air.aerialPerspective, 0, 0, 0], 40);
		} else {
			this.data.set([0, 0, 0, this.sunAngularRadius], 28);
			this.data.set([1, 0, 0, 0], 40);
		}
		this.ctx.device.queue.writeBuffer(this.uniform, 0, this.data);

		const pass = encoder.beginRenderPass({
			colorAttachments: [
				{
					view: this.litView,
					loadOp: "clear",
					clearValue: { r: 0, g: 0, b: 0, a: 1 },
					storeOp: "store",
				},
			],
		});
		pass.setPipeline(this.pipeline);
		pass.setBindGroup(0, this.bindGroup!);
		pass.draw(3);
		pass.end();
	}

	destroy(): void {
		this.sceneImage?.destroy();
		this.litImage?.destroy();
		this.lut.destroy();
		this.uniform.destroy();
	}

	/**
	 * Rebuild the optical-depth table when the air's own shape moved.
	 *
	 * Baked on the CPU rather than the GPU -- see the module doc on
	 * {@link ATMOSPHERE_SHADER} for why -- and only when the planet's radius,
	 * the air's own top, the falloff or the step count actually changed, since
	 * `resolve` is called every frame and the knobs it reads are not.
	 */
	private ensureBaked(air: PlanetAtmosphere): void {
		const steps = Math.max(1, Math.round(this.opticalDepthPoints));
		if (
			this.bakedFrom &&
			steps === this.bakedSteps &&
			this.bakedFrom.planetRadius === air.planetRadius &&
			this.bakedFrom.topRadius === air.topRadius &&
			this.bakedFrom.densityFalloff === air.densityFalloff
		)
			return;
		this.bakedFrom = air;
		this.bakedSteps = steps;
		const table = bakeOpticalDepth(air, steps, LUT_SIZE);
		this.lut.destroy();
		this.lut = this.ctx.device.createTexture({
			size: { width: table.size, height: table.size },
			format: "r16float",
			usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
		});
		const packed = new Uint16Array(table.data.length);
		for (let i = 0; i < table.data.length; i++)
			packed[i] = float32ToFloat16(table.data[i]!);
		this.ctx.device.queue.writeTexture(
			{ texture: this.lut },
			packed,
			{ bytesPerRow: table.size * 2, rowsPerImage: table.size },
			{ width: table.size, height: table.size },
		);
		this.boundDepth = null;
	}

	private resize(width: number, height: number): void {
		if (
			this.sceneImage &&
			this.sceneImage.width === width &&
			this.sceneImage.height === height
		)
			return;
		const { device, sceneFormat: format } = this.ctx;
		this.sceneImage?.destroy();
		this.litImage?.destroy();
		const usage =
			GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
		this.sceneImage = device.createTexture({
			size: { width, height },
			format,
			usage,
		});
		this.litImage = device.createTexture({
			size: { width, height },
			format,
			usage,
		});
		this.sceneView = this.sceneImage.createView();
		this.litView = this.litImage.createView();
		this.boundDepth = null;
	}

	private rebind(depth: GPUTextureView): void {
		this.boundDepth = depth;
		this.bindGroup = this.ctx.device.createBindGroup({
			layout: this.layout,
			entries: [
				{ binding: 0, resource: { buffer: this.uniform } },
				{ binding: 1, resource: this.sceneView! },
				{ binding: 2, resource: depth },
				{ binding: 3, resource: this.lut.createView() },
				{ binding: 4, resource: this.lutSampler },
			],
		});
	}
}

/**
 * One float32 rounded to the nearest float16, as its 16-bit pattern.
 *
 * `writeTexture` takes raw bytes, and WebGPU has no float32-to-r16float
 * conversion on the upload path -- so the table's own values are rounded
 * here, once, rather than losing precision a second way by routing them
 * through a canvas or a compute shader that has no other reason to exist.
 */
function float32ToFloat16(value: number): number {
	const buffer = new ArrayBuffer(4);
	const asFloat = new Float32Array(buffer);
	const asInt = new Uint32Array(buffer);
	asFloat[0] = value;
	const bits = asInt[0]!;
	const sign = (bits >>> 16) & 0x8000;
	let exponent = ((bits >>> 23) & 0xff) - 127 + 15;
	let mantissa = bits & 0x7fffff;
	if (exponent <= 0) {
		if (exponent < -10) return sign;
		mantissa |= 0x800000;
		const shift = 14 - exponent;
		return sign | (mantissa >>> shift);
	}
	if (exponent >= 31) return sign | 0x7c00;
	return sign | (exponent << 10) | (mantissa >>> 13);
}
