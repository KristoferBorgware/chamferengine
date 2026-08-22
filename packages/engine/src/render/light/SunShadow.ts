import type { CoarseMap } from "../../generation/coarse/CoarseMap.js";
import type { GpuContext } from "../gpu/GpuContext.js";
import { FACE_CENTROIDS } from "../../addressing/solid/icosahedron.js";
import { faceVertices } from "../../addressing/solid/faceVertices.js";

/** Twenty faces, and the three basis rows each of them needs. */
const FACES = 20;

/**
 * Placement, the twenty centroids, and the sixty basis rows.
 *
 * Each is a `vec4f` because that is what a uniform array packs to, and the
 * fourth component is unused in all of them.
 */
const SHADOW_BYTES = 16 + FACES * 16 + FACES * 3 * 16;

/** A texture row has to start on a 256-byte boundary, which is 64 texels. */
const ROW_TEXELS = 64;

/**
 * The coarse height map on the GPU, and the twenty transforms that read it.
 *
 * **This is the whole of what a shadow needs.** A shadow ray asks one question
 * over and over -- *how high is the ground at this direction* -- and the coarse
 * map is already the answer everywhere on the planet, at one height per cell.
 * It is small enough to hand to the GPU whole, so a fragment can walk toward
 * the sun and look, and no second pass over the geometry happens at all.
 *
 * What it cannot answer is whether a block shadows the block beside it: a map
 * cell is 32 m at the shipped settings and a block is 1 m. It gives the
 * shadows that carry the shape of a landscape -- a range across the valley
 * under it -- and leaves the metre-scale ones to the corner darkening the
 * mesher already bakes.
 *
 * **One layer per icosahedron face**, each holding that face's triangle of
 * lattice points in the corner of a square. The square wastes just under half
 * of itself, which is 2.6 MB at the shipped map level and buys a read with no
 * indirection: a direction gives a face and two lattice coordinates, and those
 * are the texture coordinates.
 *
 * The row past the triangle's long edge is filled from the face over that
 * edge, so the three points a blend reads are always present and the height
 * runs across the seam without a step. That row is the only one a blend can
 * reach outside the triangle: it asks for `(i+1, j+1)` at most, and the
 * clamping before it holds `i + j` to one less than the edge.
 */
export class SunShadow {
	private readonly ctx: GpuContext;
	private readonly uniform: GPUBuffer;
	private readonly data = new Float32Array(SHADOW_BYTES / 4);

	readonly layout: GPUBindGroupLayout;

	private texture: GPUTexture;
	private view: GPUTextureView;

	bindGroup: GPUBindGroup;

	constructor(ctx: GpuContext) {
		this.ctx = ctx;
		const { device } = ctx;
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
					// Read by coordinate rather than filtered, so the blend is
					// the map's own -- three corners of a triangle, not the
					// four of a square.
					texture: {
						sampleType: "unfilterable-float",
						viewDimension: "2d-array",
					},
				},
			],
		});
		this.uniform = device.createBuffer({
			size: SHADOW_BYTES,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});

		// The twenty transforms never change: they are the icosahedron.
		this.writeSolid();

		// A world with no map yet still has to satisfy the binding, so the
		// texture starts as one texel a face and the strength starts at zero.
		this.texture = this.makeTexture(1, 1);
		this.view = this.texture.createView({ dimension: "2d-array" });
		this.bindGroup = this.makeBindGroup();
	}

	/**
	 * How dark a shadow goes and how far the march looks for one.
	 *
	 * Strength `0` skips the march entirely, which is what the shader tests
	 * before it does anything else.
	 */
	setLook(strength: number, reach: number): void {
		this.data[2] = strength;
		this.data[3] = Math.max(1, reach);
		this.ctx.device.queue.writeBuffer(this.uniform, 0, this.data, 0, 4);
	}

	/**
	 * Hand the map to the GPU, one layer per face.
	 *
	 * `seaRadius` is the radius sea level sits at, because the map is metres
	 * above sea level and a march compares radii.
	 */
	upload(map: CoarseMap, seaRadius: number): void {
		const { device } = this.ctx;
		const n = map.index.n;
		const across = n + 2;
		const stride = Math.ceil(across / ROW_TEXELS) * ROW_TEXELS;

		if (this.texture.width !== stride || this.texture.height !== across) {
			this.texture.destroy();
			this.texture = this.makeTexture(stride, across);
			this.view = this.texture.createView({ dimension: "2d-array" });
			this.bindGroup = this.makeBindGroup();
		}

		const pixels = new Float32Array(stride * across * FACES);
		for (let face = 0; face < FACES; face++) {
			const layer = face * stride * across;
			for (let j = 0; j < across; j++) {
				const row = layer + j * stride;
				for (let i = 0; i < across; i++) {
					if (i + j <= n) {
						pixels[row + i] =
							map.height[map.index.indexOf(face, i, j)]!;
						continue;
					}
					// One step past the long edge, which is as far as a blend
					// reaches. The cell is a real one on the face over that
					// edge; anything past a vertex is not, and reads as sea
					// level, which is the weight-zero corner the map's own
					// lookup returns there.
					if (i + j === n + 1) {
						const cell = map.index.indexNear(face, i, j);
						pixels[row + i] = cell < 0 ? 0 : map.height[cell]!;
					}
				}
			}
		}
		device.queue.writeTexture(
			{ texture: this.texture },
			pixels,
			{ bytesPerRow: stride * 4, rowsPerImage: across },
			{ width: across, height: across, depthOrArrayLayers: FACES },
		);

		this.data[0] = n;
		this.data[1] = seaRadius;
		device.queue.writeBuffer(this.uniform, 0, this.data, 0, 4);
	}

	destroy(): void {
		this.texture.destroy();
		this.uniform.destroy();
	}

	private makeTexture(width: number, height: number): GPUTexture {
		return this.ctx.device.createTexture({
			size: [width, height, FACES],
			format: "r32float",
			usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
		});
	}

	private makeBindGroup(): GPUBindGroup {
		return this.ctx.device.createBindGroup({
			layout: this.layout,
			entries: [
				{ binding: 0, resource: { buffer: this.uniform } },
				{ binding: 1, resource: this.view },
			],
		});
	}

	/**
	 * The centroids and the barycentric solve, written once.
	 *
	 * A direction's face is the centroid it is nearest, which is exact rather
	 * than approximate: the plane halfway between two adjacent centroids holds
	 * the two vertices of the edge they share. Its position inside that face
	 * is Cramer's rule on the face's three vertices, which is three dot
	 * products against fixed rows -- so each face carries the rows rather than
	 * the vertices, and the divide by the determinant is already in them.
	 */
	private writeSolid(): void {
		for (let face = 0; face < FACES; face++) {
			const centroid = FACE_CENTROIDS[face]!;
			const at = 4 + face * 4;
			this.data[at] = centroid.x;
			this.data[at + 1] = centroid.y;
			this.data[at + 2] = centroid.z;

			const [a, b, c] = faceVertices(face);
			const det = a.dot(b.cross(c));
			const rows = [
				b.cross(c).scale(1 / det),
				c.cross(a).scale(1 / det),
				a.cross(b).scale(1 / det),
			];
			for (let row = 0; row < 3; row++) {
				const to = 4 + FACES * 4 + (face * 3 + row) * 4;
				this.data[to] = rows[row]!.x;
				this.data[to + 1] = rows[row]!.y;
				this.data[to + 2] = rows[row]!.z;
			}
		}
		this.ctx.device.queue.writeBuffer(this.uniform, 0, this.data);
	}
}
