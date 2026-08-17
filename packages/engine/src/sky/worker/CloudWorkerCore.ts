import type { CloudJob, CloudResult, CloudWorkerSetup } from "./CloudJob.js";
import { CloudField } from "../CloudField.js";
import { Vec3 } from "../../math/Vec3.js";
import { buildCloudMesh } from "../buildCloudMesh.js";

interface Deck {
	readonly field: CloudField;
	readonly baseRadius: number;
	readonly shellSpan: number;
	readonly featureSize: number;
}

/**
 * The working half of a cloud worker, with no reference to `Worker`, `self` or
 * `postMessage`.
 *
 * A worker script is then four lines: make one of these on setup, call
 * {@link run} on each job, post what it returns. Everything worth testing runs
 * under plain Node, and the part that needs a browser holds no logic.
 *
 * A field for every deck is built once, at setup, and refilled in place on
 * each job -- the topology is a property of the level and the shell count,
 * neither of which a wind angle changes.
 */
export class CloudWorkerCore {
	private readonly seed: number;
	private readonly decks: readonly Deck[];

	constructor(setup: CloudWorkerSetup) {
		this.seed = setup.seed;
		this.decks = setup.decks.map((deck) => ({
			field: new CloudField(deck.level, deck.shells),
			baseRadius: deck.baseRadius,
			shellSpan: deck.shellSpan,
			featureSize: deck.featureSize,
		}));
	}

	run(job: CloudJob): CloudResult {
		const axis = new Vec3(job.axis[0], job.axis[1], job.axis[2]);
		const vertices: number[] = [];
		const indices: number[] = [];
		let puffs = 0;

		for (const deck of this.decks) {
			deck.field.blow(
				axis,
				job.angle,
				this.seed,
				deck.baseRadius,
				deck.shellSpan,
				deck.featureSize,
			);
			const mesh = buildCloudMesh(
				deck.field,
				deck.baseRadius,
				deck.shellSpan,
			);
			const base = vertices.length / 4;
			for (const value of mesh.vertices) vertices.push(value);
			for (const index of mesh.indices) indices.push(index + base);
			puffs += mesh.puffs;
		}

		return {
			id: job.id,
			vertices: Float32Array.from(vertices),
			indices: Uint32Array.from(indices),
			puffs,
		};
	}

	/** The buffers in a result, for a caller transferring rather than copying. */
	static buffers(result: CloudResult): ArrayBuffer[] {
		return [result.vertices.buffer, result.indices.buffer];
	}
}
