import type { GpuContext } from "../gpu/GpuContext.js";
import { BLOOM_SHADER } from "./BLOOM_SHADER.js";

/** The threshold, the knee, the strength, and the texel size being read. */
const BLOOM_BYTES = 16;

/**
 * How many halvings the chain runs.
 *
 * Each one doubles the reach of the blur and costs a quarter of the last, so
 * the whole chain costs about a third of its first level. Six from a half-size
 * base reaches a blur a sixty-fourth of the screen across, which is what makes
 * a sun spill across a sky rather than fuzz its own rim.
 */
const LEVELS = 6;

/** The smallest level worth rendering, in texels a side. */
const SMALLEST = 8;

/**
 * One draw of the chain: what it reads, what it writes, at what texel size.
 *
 * **Every step owns its own uniform buffer.** `writeBuffer` queues against the
 * queue rather than the encoder, so every write in a frame lands before any of
 * the frame's passes run -- two steps sharing one buffer would both read
 * whichever value was written last, and the whole chain would blur at one
 * level's texel size.
 */
interface Step {
	readonly pipeline: GPURenderPipeline;
	readonly target: GPUTextureView;

	/** Which chain level it reads, or null for the image handed in. */
	readonly source: GPUTextureView | null;

	/** Texels across whatever it reads, which is what sets the tap spacing. */
	readonly texels: number;

	readonly clear: boolean;
	readonly uniform: GPUBuffer;
	readonly group: GPUBindGroup;
}

/**
 * The glare around anything brighter than the picture can hold.
 *
 * The frame is drawn into a floating-point image where the sun sits at a
 * hundred and change and a lit hillside sits near one. A screen holds neither
 * -- it holds white -- so the only thing that separates them is what the
 * bright one does to its surroundings. This is that: the part of the image
 * over a threshold, blurred very wide, added back.
 *
 * It runs between the air and the tone curve, on the same half-float image
 * both of those use, and it **adds into that image in place** rather than
 * owning a third one. So the tone pass reads exactly what it read before and
 * knows nothing about this.
 */
export class BloomPass {
	private readonly ctx: GpuContext;
	private readonly layout: GPUBindGroupLayout;
	private readonly sampler: GPUSampler;
	private readonly data = new Float32Array(BLOOM_BYTES / 4);

	private readonly prefilter: GPURenderPipeline;
	private readonly downsample: GPURenderPipeline;
	private readonly upsample: GPURenderPipeline;
	private readonly composite: GPURenderPipeline;

	private chain: GPUTexture | null = null;
	private steps: Step[] = [];
	private spare: GPUBuffer[] = [];
	private width = 0;
	private height = 0;
	private boundSource: GPUTextureView | null = null;

	/** Whether the glare is drawn at all. */
	enabled = true;

	/** How bright a thing has to be before it spills. */
	threshold = 1;

	/** How much of the blurred result is added back. */
	strength = 0.6;

	/** How soft the shoulder at the threshold is. */
	knee = 0.6;

	constructor(ctx: GpuContext) {
		this.ctx = ctx;
		const { device, sceneFormat: format } = ctx;
		const module = device.createShaderModule({ code: BLOOM_SHADER });
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
					texture: { sampleType: "float" },
				},
				{
					binding: 2,
					visibility: GPUShaderStage.FRAGMENT,
					sampler: { type: "filtering" },
				},
			],
		});
		const layout = device.createPipelineLayout({
			bindGroupLayouts: [this.layout],
		});
		const make = (
			entryPoint: string,
			blend?: GPUBlendState,
		): GPURenderPipeline =>
			device.createRenderPipeline({
				layout,
				vertex: { module, entryPoint: "vertexMain" },
				fragment: {
					module,
					entryPoint,
					targets: [{ format, ...(blend ? { blend } : {}) }],
				},
				primitive: { topology: "triangle-list" },
			});
		// Adding rather than replacing is the whole of the upward pass: each
		// level lays its own blur over the sharper one under it, so what comes
		// out is every radius at once rather than only the widest.
		const add: GPUBlendState = {
			color: { srcFactor: "one", dstFactor: "one", operation: "add" },
			alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
		};
		this.prefilter = make("prefilterMain");
		this.downsample = make("downsampleMain");
		this.upsample = make("upsampleMain", add);
		this.composite = make("compositeMain", add);

		this.sampler = device.createSampler({
			magFilter: "linear",
			minFilter: "linear",
			addressModeU: "clamp-to-edge",
			addressModeV: "clamp-to-edge",
		});
	}

	/**
	 * Blur what is bright in `image` and add the result back into it.
	 *
	 * The image is both read and written, which is legal because no single
	 * pass does both: the first step reads it, every step after reads a level
	 * of the chain, and only the last step writes it again.
	 */
	resolve(
		encoder: GPUCommandEncoder,
		image: GPUTextureView,
		width: number,
		height: number,
	): void {
		if (!this.enabled || this.strength <= 0) return;
		if (width < 4 || height < 4) return;
		this.build(width, height, image);
		if (this.steps.length === 0) return;

		const { device } = this.ctx;
		for (const step of this.steps) {
			this.data[0] = Math.max(0, this.threshold);
			this.data[1] = Math.max(1e-4, this.knee);
			this.data[2] = Math.max(0, this.strength);
			this.data[3] = 1 / Math.max(1, step.texels);
			device.queue.writeBuffer(step.uniform, 0, this.data);

			const pass = encoder.beginRenderPass({
				colorAttachments: [
					{
						view: step.target,
						loadOp: step.clear ? "clear" : "load",
						clearValue: { r: 0, g: 0, b: 0, a: 1 },
						storeOp: "store",
					},
				],
			});
			pass.setPipeline(step.pipeline);
			pass.setBindGroup(0, step.group);
			pass.draw(3);
			pass.end();
		}
	}

	destroy(): void {
		this.chain?.destroy();
		for (const step of this.steps) step.uniform.destroy();
		for (const buffer of this.spare) buffer.destroy();
		this.steps = [];
		this.spare = [];
	}

	private build(width: number, height: number, image: GPUTextureView): void {
		if (
			this.chain &&
			this.width === width &&
			this.height === height &&
			this.boundSource === image
		)
			return;
		this.chain?.destroy();
		for (const step of this.steps) this.spare.push(step.uniform);
		this.steps = [];
		this.width = width;
		this.height = height;
		this.boundSource = image;

		// The chain starts at half the screen: the first halving is where the
		// threshold is applied, so nothing under it is ever carried at full
		// size and the most expensive level is a quarter of the frame.
		const sizes: { width: number; height: number }[] = [];
		let levelWidth = Math.max(1, width >> 1);
		let levelHeight = Math.max(1, height >> 1);
		while (
			sizes.length < LEVELS &&
			levelWidth >= SMALLEST &&
			levelHeight >= SMALLEST
		) {
			sizes.push({ width: levelWidth, height: levelHeight });
			levelWidth = Math.max(1, levelWidth >> 1);
			levelHeight = Math.max(1, levelHeight >> 1);
		}
		if (sizes.length < 1) {
			this.chain = null;
			return;
		}

		const { device, sceneFormat: format } = this.ctx;
		this.chain = device.createTexture({
			size: { width: sizes[0]!.width, height: sizes[0]!.height },
			format,
			mipLevelCount: sizes.length,
			usage:
				GPUTextureUsage.RENDER_ATTACHMENT |
				GPUTextureUsage.TEXTURE_BINDING,
		});
		const views = sizes.map((_, at) =>
			this.chain!.createView({ baseMipLevel: at, mipLevelCount: 1 }),
		);

		const uniform = (): GPUBuffer =>
			this.spare.pop() ??
			device.createBuffer({
				size: BLOOM_BYTES,
				usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
			});
		const add = (step: Omit<Step, "group">): void => {
			this.steps.push({
				...step,
				group: device.createBindGroup({
					layout: this.layout,
					entries: [
						{ binding: 0, resource: { buffer: step.uniform } },
						{ binding: 1, resource: step.source ?? image },
						{ binding: 2, resource: this.sampler },
					],
				}),
			});
		};

		// Down: the whole image into level 0, thresholded, then each level
		// into the next. What a step is told is the size of what it READS.
		add({
			pipeline: this.prefilter,
			target: views[0]!,
			source: null,
			texels: width,
			clear: true,
			uniform: uniform(),
		});
		for (let at = 1; at < sizes.length; at++)
			add({
				pipeline: this.downsample,
				target: views[at]!,
				source: views[at - 1]!,
				texels: sizes[at - 1]!.width,
				clear: true,
				uniform: uniform(),
			});

		// Up: each level added back into the one above it, widest first.
		for (let at = sizes.length - 1; at > 0; at--)
			add({
				pipeline: this.upsample,
				target: views[at - 1]!,
				source: views[at]!,
				texels: sizes[at]!.width,
				clear: false,
				uniform: uniform(),
			});

		// And the whole chain back over the picture it came from.
		add({
			pipeline: this.composite,
			target: image,
			source: views[0]!,
			texels: sizes[0]!.width,
			clear: false,
			uniform: uniform(),
		});
	}
}
