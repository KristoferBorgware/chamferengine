import type { GpuContext } from "chamfer/render";

/**
 * The flag namespaces WebGPU puts on the global object.
 *
 * A renderer names them while describing a pipeline, so they have to exist
 * before one is constructed. The values are the ones the specification fixes.
 */
const FLAGS: Record<string, Record<string, number>> = {
	GPUShaderStage: { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 },
	GPUBufferUsage: {
		MAP_READ: 1,
		MAP_WRITE: 2,
		COPY_SRC: 4,
		COPY_DST: 8,
		INDEX: 16,
		VERTEX: 32,
		UNIFORM: 64,
		STORAGE: 128,
		INDIRECT: 256,
		QUERY_RESOLVE: 512,
	},
	GPUTextureUsage: {
		COPY_SRC: 1,
		COPY_DST: 2,
		TEXTURE_BINDING: 4,
		STORAGE_BINDING: 8,
		RENDER_ATTACHMENT: 16,
	},
};

const global = globalThis as unknown as Record<string, unknown>;
for (const [name, values] of Object.entries(FLAGS))
	if (!(name in global)) global[name] = values;

/** One thing a pass was told to do, in the order it was told. */
export interface Command {
	readonly what:
		| "setPipeline"
		| "setBindGroup"
		| "setVertexBuffer"
		| "setIndexBuffer"
		| "draw"
		| "drawIndexed"
		| "end";

	/** The bind group index, for `setBindGroup`. */
	readonly group?: number;

	/** How many bind groups the pipeline set at this point declares. */
	readonly groups?: number;
}

/** A pipeline, remembered only by how many bind groups its layout declares. */
interface FakePipeline {
	readonly groups: number;
}

/**
 * A device that records what it is asked to encode and draws nothing.
 *
 * A renderer cannot be tested against a real adapter under Node, and the part
 * worth testing is not what pixels come out: it is the order commands go in.
 * WebGPU refuses a draw whose pipeline declares a bind group that is not bound,
 * and refusing one command invalidates the whole buffer, so a single missing
 * binding anywhere in a frame draws nothing at all.
 *
 * The recording is kept flat and in order, which is what the rule is stated
 * against.
 */
export class RecordingGpu {
	readonly commands: Command[] = [];

	/** Pipelines by identity, so a recorded draw knows what it needs bound. */
	private readonly pipelines = new Map<object, FakePipeline>();

	private groupsNow = 0;

	get context(): GpuContext {
		const gpu = this;
		const buffer = () => ({ destroy() {} });

		const pass = {
			setPipeline(pipeline: object) {
				const known = gpu.pipelines.get(pipeline);
				gpu.groupsNow = known ? known.groups : 0;
				gpu.commands.push({
					what: "setPipeline",
					groups: gpu.groupsNow,
				});
			},
			setBindGroup(group: number) {
				gpu.commands.push({ what: "setBindGroup", group });
			},
			setVertexBuffer() {
				gpu.commands.push({ what: "setVertexBuffer" });
			},
			setIndexBuffer() {
				gpu.commands.push({ what: "setIndexBuffer" });
			},
			draw() {
				gpu.commands.push({ what: "draw", groups: gpu.groupsNow });
			},
			drawIndexed() {
				gpu.commands.push({
					what: "drawIndexed",
					groups: gpu.groupsNow,
				});
			},
			end() {
				gpu.commands.push({ what: "end" });
			},
		};

		const device = {
			limits: { maxTextureDimension2D: 8192 },
			// No timestamp query: this device reports nothing about the GPU,
			// which is the case a renderer has to draw the same frame under.
			features: new Set<string>(),
			queue: { writeBuffer() {}, submit() {} },
			createShaderModule: () => ({}),
			createBindGroupLayout: () => ({}),
			createPipelineLayout: (descriptor: {
				bindGroupLayouts: unknown[];
			}) => ({ groups: descriptor.bindGroupLayouts.length }),
			createRenderPipeline: (descriptor: {
				layout: { groups: number };
			}) => {
				const pipeline = {};
				gpu.pipelines.set(pipeline, {
					groups: descriptor.layout.groups,
				});
				return pipeline;
			},
			createBuffer: buffer,
			createBindGroup: () => ({}),
			createTexture: () => ({
				width: 0,
				height: 0,
				createView: () => ({}),
				destroy() {},
			}),
			createCommandEncoder: () => ({
				beginRenderPass: () => pass,
				finish: () => ({}),
			}),
		};

		return {
			device,
			context: { getCurrentTexture: () => ({ createView: () => ({}) }) },
			format: "bgra8unorm",
			canvas: { width: 800, height: 600 },
		} as unknown as GpuContext;
	}

	/**
	 * Every draw in the recording, with the groups bound when it was issued.
	 *
	 * A bind group survives a pipeline change here, which is what WebGPU does
	 * when the two layouts match. Every layout in this renderer is one uniform
	 * at binding 0, so they all match.
	 */
	draws(): { groups: number; bound: Set<number> }[] {
		const out: { groups: number; bound: Set<number> }[] = [];
		const bound = new Set<number>();
		for (const command of this.commands) {
			if (command.what === "setBindGroup") bound.add(command.group!);
			if (command.what === "draw" || command.what === "drawIndexed")
				out.push({ groups: command.groups!, bound: new Set(bound) });
		}
		return out;
	}
}
