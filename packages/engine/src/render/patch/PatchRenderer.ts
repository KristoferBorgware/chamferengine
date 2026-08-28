import type { GpuContext } from "../gpu/GpuContext.js";
import type { PatchGeometry } from "../../mesh/PatchGeometry.js";
import { PATCH_SHADER, PLANT_COLORS } from "./PATCH_SHADER.js";
import { PATCH_STRIDE } from "../../mesh/PatchGeometry.js";
import type { ShadowBox } from "./PatchShadow.js";
import { PatchShadow } from "./PatchShadow.js";
import { PATCH_KEY, patchFill } from "./PATCH_LIGHTS.js";

/** How the patch is drawn, beyond where the camera is. */
export interface PatchLook {
	/** Which picture: ground, height, raw, or one control layer. */
	readonly picture: number;

	/** Whether the surface, the cell rims, or both are drawn. */
	readonly surface: "solid" | "wire" | "both";

	/**
	 * Whether to draw a ball where each light shines from.
	 *
	 * **They are directions, not places**, so a ball is drawn on a dome around
	 * the patch: what it says is which way the light comes from and how strong
	 * it is, and moving the camera never moves it nearer or further. Its size
	 * is its share of the light.
	 */
	readonly showLights: boolean;

	/** Metres across the patch, which is what the light dome is sized from. */
	readonly span: number;

	/**
	 * Whether the key and the fill cast a shadow.
	 *
	 * Only those two: the one overhead and the one at the camera have none,
	 * because between them they are what keeps every face readable, and a face
	 * they could not reach is a face nothing says anything about.
	 */
	readonly keyShadow: boolean;
	readonly fillShadow: boolean;

	/** Which control layer a picture of one layer draws. */
	readonly layer: "continent" | "erosion" | "peaks" | "carve";

	/** The two elevations that cut land into three materials, in metres. */
	readonly rockLine: number;
	readonly snowLine: number;

	/**
	 * How deep the soil runs and how thick one block is, both in metres.
	 *
	 * **What a block is made of is a depth question as well as an elevation
	 * one.** The world covers rock with a few blocks of soil, one of which is
	 * grass or snow, and shows bare stone under that -- so a patch drawn as
	 * columns and painted from the height above the sea alone comes out the
	 * colour of the meadow on top of it all the way to the floor of the crust.
	 * Both at zero is a patch with no crust under it, which paints exactly as
	 * it did before either existed.
	 */
	readonly soilMetres: number;
	readonly blockMetres: number;

	/**
	 * How far the depth fade runs, in metres, and how dark it gets.
	 *
	 * **A stand-in for the sky exposure this mesh does not bake.** The world
	 * writes how much sky every face takes from the ground around it; a column
	 * patch writes the corner's own occlusion alone, which says what stands
	 * beside a face and nothing about what is over it -- so without this a
	 * chamber forty blocks down is lit exactly like the meadow, and a picture
	 * of a cave has no depth in it. `0` for the flat colour to the bit.
	 */
	readonly shadeDepth: number;
	readonly shadeAmount: number;

	/** What the field reached in this patch, which Raw is drawn against. */
	readonly rawLow: number;
	readonly rawHigh: number;

	/**
	 * The ground this patch reached in metres, which Height is drawn against.
	 *
	 * **A fixed scale in metres is a picture that is white wherever the world
	 * is tall.** Height used to run a `-400 m` to `400 m` ramp whatever stood
	 * there, so on the shipped world -- which reaches `1,100 m` -- everything
	 * above the rock line was one flat white and the picture said nothing about
	 * the shape of it. It reads the patch's own range now, the way Raw already
	 * did.
	 */
	readonly low: number;
	readonly high: number;

	/**
	 * How bright the picture is, as one multiplier before the curve.
	 *
	 * **A preview cannot be brighter than what it is made of.** Grass is 0.44
	 * of green, so a cap of it lit perfectly still comes out at 176 of 255 and
	 * no arrangement of lights makes this picture bright. This is the one thing
	 * that does.
	 */
	readonly light: number;

	/**
	 * How much of the light each of the three carries: key, fill, overhead.
	 *
	 * **How dark a shadow can be is this and nothing else.** A shadow takes one
	 * light away, so the deepest it can go is that light's share of the total --
	 * with the overhead at 1.35 against the key's 1, the key is a fifth of a lit
	 * face and no shadow of it takes more than a fifth. That is why there is no
	 * darkness knob: the balance already is one.
	 */
	readonly keyLight: number;
	readonly fillLight: number;
	readonly topLight: number;

	/**
	 * How much of its light a shadow takes. `1` is all of it.
	 *
	 * **Not a darkness in metres.** A shadow removes a light, so how dark it
	 * looks depends on what share that light had -- this is only how much of it
	 * goes, and the shares above decide the rest. Past `1` it goes on taking
	 * from the other lights too, which is no longer a light being blocked and
	 * is what a rig balanced for a readable preview needs before a shadow
	 * reads at all.
	 */
	readonly shadowStrength: number;

	/**
	 * Paint the key's shadow factor itself, white to black, instead of the
	 * picture.
	 *
	 * **A shadow that misbehaves cannot be judged through the lighting.** The
	 * factor reaches the eye multiplied by the light's share, the face's own
	 * angle and the exposure, so acne reads as texture and a misplaced map
	 * reads as nothing at all -- this is how the checkerboard the maps shipped
	 * with was found. Reached from the page by the \`shadowDebug=1\` query
	 * parameter alone: it is a diagnostic, not a picture anybody composes.
	 */
	readonly debugShadow?: boolean;

	/**
	 * The color of everything standing on the ground, wood then leaf per layer.
	 *
	 * **In the order the stand was grown in**, because a face carries the index
	 * rather than the color. Taken with the mesh rather than read off a panel:
	 * a layer may have been deleted between the build and the frame, and the
	 * faces it left behind still have to be drawn as what grew them.
	 */
	readonly plantColors: readonly (readonly [number, number, number])[];

	/**
	 * Where the camera is, which is what the near cascade is sized from.
	 *
	 * Not a light: the rig is four directions and none of them stands
	 * anywhere. This is how far off the viewer is, so the tight map tightens
	 * with the zoom.
	 */
	readonly eye: readonly [number, number, number];
}

/**
 * What one upload carries.
 *
 * The vertices every time, the indices only when the patch moved: a
 * {@link PatchGeometry} satisfies this, and so does a fill of a layout that is
 * being kept. Nothing for the indices means the ones already uploaded still
 * describe this mesh.
 */
export interface PatchUpload {
	readonly vertices: Float32Array<ArrayBuffer>;
	readonly indices: Uint32Array<ArrayBuffer> | null;
	readonly lines: Uint32Array<ArrayBuffer> | null;
	readonly triangleCount: number;

	/**
	 * How many vertices the ground drew, on a mesh that is not indexed.
	 *
	 * **A column mesh shares no vertex, so there is nothing for an index to
	 * name.** Every face of it is flat and carries its own plane as its normal,
	 * where a surface patch shares one vertex round a cell -- so the two are
	 * drawn the same way and buffered differently. When this is set the draw is
	 * a plain `draw`, and the sea's own run follows the ground's.
	 */
	readonly groundVertices?: number;

	/**
	 * The box the mesh fills, which is what a shadow map is fitted to.
	 *
	 * A patch's width says nothing about how far its crust runs down, and the
	 * lip hanging off the rim is geometry that casts.
	 */
	readonly bounds?: {
		readonly low: readonly [number, number, number];
		readonly high: readonly [number, number, number];
	};

	/** How many the sea drew, blended after every opaque one. */
	readonly waterVertices?: number;
}

/**
 * A matrix, the light, the mode, the numbers the pictures read, the two
 * matrices the shadows are read from, and how the light is shared out.
 */
const VIEW_BYTES =
	64 +
	16 +
	16 +
	16 +
	16 +
	64 * 4 +
	16 +
	16 +
	16 +
	16 * 4 +
	16 +
	16 * PLANT_COLORS;

/**
 * Where the two crust lengths and the depth fade sit, in floats.
 *
 * **Before the plant palette, which is the one array**: anything after it
 * would move with the plant count rather than sitting at an offset of its own.
 */
const CRUST_AT = 124;

/** Where the plant palette starts, one `vec4f` an entry. */
const PLANTS_AT = CRUST_AT + 4;

/**
 * How many maps a light is cut into.
 *
 * **Two, and the near one is sized from the camera.** One map over the whole
 * patch is 0.657 m a texel and a step of terracing casts 1.73 m, so the shadow
 * lived inside the bias and the blur; a second map that tightens as the viewer
 * zooms puts several texels across a block wherever they are looking.
 */
const CASCADES = 2;

/**
 * How much of the camera's own reach the near cascade covers.
 *
 * Wide enough that its edge is off the screen at any ordinary angle, tight
 * enough that the texels are worth having.
 */
const NEAR_REACH = 0.4;

/**
 * Draws one patch of the surface, cell by cell.
 *
 * A bench rather than a world: one mesh, one uniform, no chunks and no
 * residency. The mesh is uploaded when the ground changes and the pictures are
 * a uniform, so switching between them costs a frame rather than a rebuild.
 */
export class PatchRenderer {
	private readonly ctx: GpuContext;
	private readonly solidPipeline: GPURenderPipeline;
	private readonly linePipeline: GPURenderPipeline;
	private readonly seaPipeline: GPURenderPipeline;
	private readonly shadow: PatchShadow;
	private readonly shadowGroup: GPUBindGroup;
	/**
	 * Two of everything the shader reads, because the rims are drawn in the
	 * same pass as the surface and differ by one number.
	 *
	 * A uniform cannot be rewritten between two draws of one pass: a queued
	 * write lands before the whole submission runs, so the second value would
	 * reach the first draw as well. Two buffers is the shape that says "these
	 * are two draws" rather than one buffer that pretends to change.
	 */
	private readonly uniform: GPUBuffer;
	private readonly rimUniform: GPUBuffer;
	private readonly seaUniform: GPUBuffer;
	private readonly lampUniform: GPUBuffer;
	private readonly bindGroup: GPUBindGroup;
	private readonly rimBindGroup: GPUBindGroup;
	private readonly seaBindGroup: GPUBindGroup;
	private readonly lampBindGroup: GPUBindGroup;
	private readonly data = new Float32Array(VIEW_BYTES / 4);

	private vertices: GPUBuffer | null = null;
	private indices: GPUBuffer | null = null;
	private lines: GPUBuffer | null = null;
	private lamps: GPUBuffer | null = null;
	private lampVertices = 0;
	private lampSpanKey = "";
	private triangleCount = 0;
	private lineCount = 0;
	private groundVertices = 0;
	private bounds: ShadowBox = { low: [-1, -1, -1], high: [1, 1, 1] };
	private waterVertices = 0;
	private depth: GPUTexture | null = null;

	/** What the frame clears to where no ground covers it. */
	background: readonly [number, number, number] = [0.027, 0.039, 0.055];

	constructor(ctx: GpuContext) {
		this.ctx = ctx;
		const { device, format } = ctx;
		const module = device.createShaderModule({ code: PATCH_SHADER });
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
			size: VIEW_BYTES,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		this.bindGroup = device.createBindGroup({
			layout,
			entries: [{ binding: 0, resource: { buffer: this.uniform } }],
		});
		this.rimUniform = device.createBuffer({
			size: VIEW_BYTES,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		this.rimBindGroup = device.createBindGroup({
			layout,
			entries: [{ binding: 0, resource: { buffer: this.rimUniform } }],
		});
		this.seaUniform = device.createBuffer({
			size: VIEW_BYTES,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		this.seaBindGroup = device.createBindGroup({
			layout,
			entries: [{ binding: 0, resource: { buffer: this.seaUniform } }],
		});
		this.lampUniform = device.createBuffer({
			size: VIEW_BYTES,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		this.lampBindGroup = device.createBindGroup({
			layout,
			entries: [{ binding: 0, resource: { buffer: this.lampUniform } }],
		});

		const buffers: GPUVertexBufferLayout[] = [
			{
				arrayStride: PATCH_STRIDE * 4,
				attributes: [
					{ shaderLocation: 0, offset: 0, format: "float32x3" },
					{ shaderLocation: 1, offset: 12, format: "float32x3" },
					{ shaderLocation: 2, offset: 24, format: "float32" },
					{ shaderLocation: 3, offset: 28, format: "float32" },
					{ shaderLocation: 4, offset: 32, format: "float32" },
					{ shaderLocation: 5, offset: 36, format: "float32" },
					{ shaderLocation: 6, offset: 40, format: "float32" },
					{ shaderLocation: 7, offset: 44, format: "float32" },
					{ shaderLocation: 8, offset: 48, format: "float32" },
					{ shaderLocation: 9, offset: 52, format: "float32" },
					{ shaderLocation: 10, offset: 56, format: "float32" },
				],
			},
		];
		// **The shadows live in their own group**, because a texture and a
		// sampler cannot go in a uniform buffer and every pipeline here shares
		// one layout -- so the maps are bound once and read by whichever draw
		// asks for them.
		this.shadow = new PatchShadow(ctx, 2, CASCADES);
		const shadowLayout = device.createBindGroupLayout({
			entries: [
				...[0, 1, 2, 3].map((binding) => ({
					binding,
					visibility: GPUShaderStage.FRAGMENT,
					texture: { sampleType: "depth" as const },
				})),
				{
					binding: 4,
					visibility: GPUShaderStage.FRAGMENT,
					sampler: { type: "comparison" as const },
				},
			],
		});
		this.shadowGroup = device.createBindGroup({
			layout: shadowLayout,
			entries: [
				...[0, 1, 2, 3].map((binding) => ({
					binding,
					resource: this.shadow.view(binding),
				})),
				{
					binding: 4,
					// **Linear, and the filtering is of comparisons.** The
					// hardware blends the four yes-or-nos around the tap, so
					// each of the nine taps is already soft -- with nearest,
					// every tap is a coin and a marginal surface renders as a
					// checkerboard of them, which is the acne this had.
					resource: device.createSampler({
						compare: "less",
						magFilter: "linear",
						minFilter: "linear",
					}),
				},
			],
		});
		const pipelineLayout = device.createPipelineLayout({
			bindGroupLayouts: [layout, shadowLayout],
		});
		const make = (
			topology: GPUPrimitiveTopology,
			sea = false,
		): GPURenderPipeline =>
			device.createRenderPipeline({
				layout: pipelineLayout,
				vertex: { module, entryPoint: "vertexMain", buffers },
				fragment: {
					module,
					entryPoint: "fragmentMain",
					targets: [
						sea
							? {
									format,
									blend: {
										color: {
											srcFactor: "src-alpha",
											dstFactor: "one-minus-src-alpha",
										},
										alpha: {
											srcFactor: "one",
											dstFactor: "one-minus-src-alpha",
										},
									},
								}
							: { format },
					],
				},
				// **No culling.** A preview is turned over and looked at from
				// under, and a patch seen from below is a legitimate way to read
				// what the ground does.
				primitive: { topology, cullMode: "none" },
				depthStencil: {
					format: "depth32float",
					// **The sea tests depth and does not write it.** Two water
					// faces on one pixel -- a sheet and the curtain hung off the
					// rim under it -- would otherwise blend one over the other
					// and draw a dark band round every coast.
					depthWriteEnabled: !sea,
					depthCompare: "less",
				},
			});
		this.solidPipeline = make("triangle-list");
		this.linePipeline = make("line-list");
		this.seaPipeline = make("triangle-list", true);
	}

	/** Put a freshly built patch on the GPU, dropping whatever was there. */
	upload(patch: PatchUpload): void {
		const { device } = this.ctx;
		this.vertices?.destroy();
		this.vertices = null;
		this.triangleCount = patch.triangleCount;
		this.groundVertices = patch.groundVertices ?? 0;
		if (patch.bounds) this.bounds = patch.bounds;
		this.waterVertices = patch.waterVertices ?? 0;
		// **Indices only when the patch moved.** A patch whose ground changed
		// draws the same triangles between the same vertices -- the shape of a
		// patch is where it stands, not what stands on it -- so the index
		// buffers are left alone and only the vertices are written again.
		if (patch.indices) {
			this.indices?.destroy();
			this.indices = null;
			if (patch.indices.length > 0) {
				this.indices = device.createBuffer({
					size: patch.indices.byteLength,
					usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
				});
				device.queue.writeBuffer(this.indices, 0, patch.indices);
			}
		}
		if (patch.lines) {
			this.lines?.destroy();
			this.lines = null;
			this.lineCount = patch.lines.length;
			if (patch.lines.length > 0) {
				this.lines = device.createBuffer({
					size: patch.lines.byteLength,
					usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
				});
				device.queue.writeBuffer(this.lines, 0, patch.lines);
			}
		}
		if (patch.vertices.length === 0) return;

		this.vertices = device.createBuffer({
			size: patch.vertices.byteLength,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		});
		device.queue.writeBuffer(this.vertices, 0, patch.vertices);
	}

	/**
	 * The lights, as balls on a dome around the patch.
	 *
	 * Rebuilt only when the patch changes size, which
	 * is what `span` says. Every ball is a
	 * subdivided octahedron -- eight triangles refined twice, which is 128
	 * faces and round enough at this size -- written straight out with the
	 * marker's colour on the channels the fragment reads for it.
	 */
	private buildLamps(span: number, look: PatchLook): void {
		const { device } = this.ctx;
		// Direction, colour and share, in the order the shader weighs them, and
		// every direction and every share read from the one place they live --
		// a ball that has drifted from its own light is read as the truth.
		const lamps: [number[], number[], number][] = [
			[[...PATCH_KEY], [1, 0.86, 0.55], look.keyLight],
			[patchFill(), [0.4, 0.55, 0.85], look.fillLight],
			[[0, 1, 0], [1, 1, 0.95], look.topLight],
		];
		const out: number[] = [];
		// One octant of an octahedron, refined; the eight sign flips give the
		// ball, and a flip that reverses handedness swaps two corners back.
		const facet = (
			a: number[],
			b: number[],
			c: number[],
			depth: number,
			at: number[],
			size: number,
			tint: number[],
		): void => {
			if (depth > 0) {
				const mid = (p: number[], q: number[]): number[] => {
					const m = [p[0]! + q[0]!, p[1]! + q[1]!, p[2]! + q[2]!];
					const l = Math.hypot(m[0]!, m[1]!, m[2]!) || 1;
					return [m[0]! / l, m[1]! / l, m[2]! / l];
				};
				const ab = mid(a, b);
				const bc = mid(b, c);
				const ca = mid(c, a);
				facet(a, ab, ca, depth - 1, at, size, tint);
				facet(ab, b, bc, depth - 1, at, size, tint);
				facet(ca, bc, c, depth - 1, at, size, tint);
				facet(ab, bc, ca, depth - 1, at, size, tint);
				return;
			}
			for (const p of [a, b, c]) {
				out.push(
					at[0]! + p[0]! * size,
					at[1]! + p[1]! * size,
					at[2]! + p[2]! * size,
					p[0]!,
					p[1]!,
					p[2]!,
					// The marker's blue rides on metres, red on raw and green on
					// the layer -- three channels the fragment already has.
					tint[2]!,
					tint[0]!,
					tint[1]!,
					0,
					0,
					0,
					1,
					// The ground's own material, so a lamp never indexes the
					// plant palette.
					0,
				);
			}
		};
		for (const [dir, tint, share] of lamps) {
			const len = Math.hypot(dir[0]!, dir[1]!, dir[2]!) || 1;
			const reach = span * 0.62;
			const at = [
				(dir[0]! / len) * reach,
				(dir[1]! / len) * reach,
				(dir[2]! / len) * reach,
			];
			// **The size is the share of the light**, so the picture says which
			// one is doing the work as well as where it stands.
			const size = span * 0.012 * (0.55 + share);
			for (const sx of [1, -1])
				for (const sy of [1, -1])
					for (const sz of [1, -1]) {
						const a = [sx, 0, 0];
						const b = [0, sy, 0];
						const c = [0, 0, sz];
						// An odd number of flips turns the winding over.
						const flip = sx * sy * sz < 0;
						facet(a, flip ? c : b, flip ? b : c, 2, at, size, tint);
					}
		}
		this.lamps?.destroy();
		this.lampVertices = out.length / PATCH_STRIDE;
		const data = Float32Array.from(out);
		this.lamps = device.createBuffer({
			size: data.byteLength,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		});
		device.queue.writeBuffer(this.lamps, 0, data);
	}

	/** Draw the patch through one view matrix. */
	draw(viewProj: Float32Array, look: PatchLook): void {
		const { device, context, canvas } = this.ctx;
		if (
			!this.depth ||
			this.depth.width !== canvas.width ||
			this.depth.height !== canvas.height
		) {
			this.depth?.destroy();
			this.depth = device.createTexture({
				size: [canvas.width, canvas.height],
				format: "depth32float",
				usage: GPUTextureUsage.RENDER_ATTACHMENT,
			});
		}

		this.data.set(viewProj, 0);
		// The key, fixed, so the same setting looks the same whenever it is
		// looked at. See `PATCH_LIGHTS.ts` for where it stands and why.
		this.data.set([PATCH_KEY[0], PATCH_KEY[1], PATCH_KEY[2], 0], 16);
		this.data.set(
			[
				look.picture,
				0,
				look.layer === "carve"
					? 3
					: look.layer === "peaks"
						? 2
						: look.layer === "erosion"
							? 1
							: 0,
				0,
			],
			20,
		);
		this.data.set([look.low, look.high, look.light, 0], 28);
		this.data.set(
			[
				look.soilMetres,
				look.blockMetres,
				look.shadeDepth,
				look.shadeAmount,
			],
			CRUST_AT,
		);
		this.data.set(
			[look.rockLine, look.snowLine, look.rawLow, look.rawHigh],
			24,
		);
		// **The depth passes come first, in the same command buffer.** What they
		// record is what the world pass then reads, so a frame that drew the
		// world first would shade it against the shadow of the frame before --
		// which on a turning camera is a shadow that lags one frame behind
		// everything casting it.
		const encoder = device.createCommandEncoder();
		const casting: [number, readonly number[], boolean][] = [
			[0, PATCH_KEY, look.keyShadow],
			[1, patchFill(), look.fillShadow],
		];
		// **The near cascade is a box around what the camera is looking at**,
		// which on this bench is always the middle of the patch -- so its size
		// follows the zoom and its texels follow the eye. Clamped to the patch,
		// because a box larger than the thing in it buys nothing.
		const eyeReach = Math.hypot(look.eye[0], look.eye[1], look.eye[2]);
		const near = Math.min(look.span, Math.max(1, eyeReach * NEAR_REACH));
		const boxes: ShadowBox[] = [
			{
				low: [-near / 2, this.bounds.low[1], -near / 2],
				high: [near / 2, this.bounds.high[1], near / 2],
			},
			this.bounds,
		];
		for (const [light, direction, on] of casting) {
			for (let cascade = 0; cascade < CASCADES; cascade++) {
				const slot = light * CASCADES + cascade;
				// **A map nobody recorded is cleared to the far plane**, which
				// every comparison passes -- so a switch that is off reads as no
				// shadow rather than as everything in shadow.
				if (!on || !this.vertices || this.groundVertices === 0)
					continue;
				this.shadow.record(
					encoder,
					slot,
					[direction[0]!, direction[1]!, direction[2]!],
					boxes[cascade]!,
					this.vertices,
					this.groundVertices,
				);
			}
		}
		for (let slot = 0; slot < 2 * CASCADES; slot++)
			this.data.set(this.shadow.matrices[slot]!, 32 + slot * 16);
		this.data.set(
			[
				look.keyShadow ? 1 : 0,
				look.fillShadow ? 1 : 0,
				this.shadow.texel,
				look.debugShadow ? 1 : 0,
			],
			96,
		);
		this.data.set([look.keyLight, look.fillLight, look.topLight, 0], 100);
		this.data.set([look.shadowStrength, 0, 0, 0], 104);
		this.data.set(this.shadow.fit, 108);
		// **Wood then leaf per layer, and the rest left dark.** A face carries
		// the index into this, so an entry nothing indexes is never read.
		for (let n = 0; n < PLANT_COLORS; n++) {
			const tint = look.plantColors[n] ?? [0, 0, 0];
			this.data.set([tint[0], tint[1], tint[2], 1], PLANTS_AT + n * 4);
		}

		device.queue.writeBuffer(this.uniform, 0, this.data);
		this.data[21] = 1;
		device.queue.writeBuffer(this.rimUniform, 0, this.data);
		this.data[21] = 0;
		this.data[23] = 1;
		device.queue.writeBuffer(this.seaUniform, 0, this.data);
		this.data[23] = 0;
		if (look.showLights) {
			const turned = `${look.span}/${look.keyLight}/${look.fillLight}/${look.topLight}`;
			if (turned !== this.lampSpanKey) {
				this.lampSpanKey = turned;
				this.buildLamps(Math.max(1, look.span), look);
			}
			this.data[21] = 2;
			device.queue.writeBuffer(this.lampUniform, 0, this.data);
			this.data[21] = 0;
		}

		const pass = encoder.beginRenderPass({
			colorAttachments: [
				{
					view: context.getCurrentTexture().createView(),
					clearValue: {
						r: this.background[0],
						g: this.background[1],
						b: this.background[2],
						a: 1,
					},
					loadOp: "clear",
					storeOp: "store",
				},
			],
			depthStencilAttachment: {
				view: this.depth.createView(),
				depthClearValue: 1,
				depthLoadOp: "clear",
				depthStoreOp: "store",
			},
		});
		if (this.vertices && (this.indices || this.groundVertices > 0)) {
			pass.setBindGroup(0, this.bindGroup);
			pass.setBindGroup(1, this.shadowGroup);
			pass.setVertexBuffer(0, this.vertices);
			if (look.surface !== "wire") {
				pass.setPipeline(this.solidPipeline);
				if (this.groundVertices > 0) {
					pass.draw(this.groundVertices);
				} else if (this.indices) {
					pass.setIndexBuffer(this.indices, "uint32");
					pass.drawIndexed(this.triangleCount * 3);
				}
			}
			if (look.surface !== "solid" && this.lines) {
				// **The rims are drawn through their own buffer, not through a
				// second write to this one.** A queued write lands before the
				// whole submission runs, so writing the mode bit here would
				// reach the surface draw above as well and paint the whole patch
				// flat blue. That is what `rimUniform` is for, and binding it is
				// the half that was missing.
				pass.setBindGroup(0, this.rimBindGroup);
				pass.setPipeline(this.linePipeline);
				pass.setIndexBuffer(this.lines, "uint32");
				pass.drawIndexed(this.lineCount);
			}
			// **The water last, and through its own uniform.** It is blended,
			// so every opaque triangle has to be behind it in the depth buffer
			// before it is drawn; and a uniform cannot be rewritten between two
			// draws of one pass, because a queued write lands before the whole
			// submission runs.
			if (look.surface !== "wire" && this.waterVertices > 0) {
				pass.setBindGroup(0, this.seaBindGroup);
				pass.setPipeline(this.seaPipeline);
				pass.draw(this.waterVertices, 1, this.groundVertices);
			}
		}
		if (look.showLights && this.lamps && this.lampVertices > 0) {
			pass.setBindGroup(0, this.lampBindGroup);
			pass.setBindGroup(1, this.shadowGroup);
			pass.setPipeline(this.solidPipeline);
			pass.setVertexBuffer(0, this.lamps);
			pass.draw(this.lampVertices);
		}
		pass.end();
		device.queue.submit([encoder.finish()]);
	}

	dispose(): void {
		this.vertices?.destroy();
		this.indices?.destroy();
		this.lines?.destroy();
		this.depth?.destroy();
		this.uniform.destroy();
		this.rimUniform.destroy();
		this.seaUniform.destroy();
		this.lampUniform.destroy();
		this.shadow.dispose();
		this.lamps?.destroy();
	}
}
