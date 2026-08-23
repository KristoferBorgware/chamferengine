import type { StoreHeader } from "chamfer/edit";
import { ChunkDeltas, DeltaStore, STORE_VERSION } from "chamfer/edit";

/** One chunk's changes, as the browser stores them. */
interface StoredChunk {
	world: string;
	chunkKey: number;
	where: Uint32Array;
	what: Uint16Array;
}

/** What a world says about itself, in a record of its own. */
interface StoredWorld {
	world: string;
	header: StoreHeader;
}

const DB_NAME = "chamfer";
const CHUNKS = "chunks";
const WORLDS = "worlds";
const DB_VERSION = 2;

/**
 * Where a player's changes live between visits.
 *
 * The browser's own database, and nothing else: a world lives as long as the
 * browser keeps its storage, which is the right size of commitment for a build
 * with no server on either side of it.
 *
 * **One record per chunk, keyed by the world and the chunk together.** A click
 * writes the one chunk it changed, so what a save costs follows the change
 * rather than the size of the world -- a record is six bytes, and a world
 * somebody has built in all evening would otherwise be rewritten whole on every
 * click. Opening a world reads the range of keys under its name. This is the
 * shape a hosted store wants as well: a chunk key to a blob, one read and one
 * write.
 *
 * **A world is named by its shape.** Every number that decides where a cell is
 * or what block sits there goes into the name, so blocks placed in one world
 * never appear in a differently shaped one. The chunk size stays out, because
 * it decides how the address is cut for loading and drawing and moves no block
 * -- a store written at eight cells a chunk is re-cut on the way in when the
 * world is opened at sixty-four.
 *
 * Every method resolves to a working answer when the database is unavailable.
 * A browser in a private window, or one with site data turned off, then plays a
 * world it cannot save rather than refusing to open one.
 */
export class EditDb {
	private open: Promise<IDBDatabase | null> | null = null;

	/** Read a world's changes, re-cut to the chunk level it is being opened at. */
	async load(
		world: string,
		want: StoreHeader,
	): Promise<{ store: DeltaStore; stale: boolean }> {
		const db = await this.database();
		const empty = { store: new DeltaStore(want), stale: false };
		if (!db) return empty;

		const found = await request<StoredWorld | undefined>(
			db.transaction(WORLDS, "readonly").objectStore(WORLDS).get(world),
		).catch(() => undefined);
		if (!found) return empty;

		// A store written by a build whose block numbers have moved cannot be
		// read as it stands, and reading it anyway turns somebody's wall into
		// another material. Refuse it and say so.
		const known = want.registry;
		const header = found.header;
		if (
			header.version !== STORE_VERSION ||
			header.subdivisionDepth !== want.subdivisionDepth ||
			header.registry.length > known.length ||
			header.registry.some((name, at) => known[at] !== name)
		)
			return { store: new DeltaStore(want), stale: true };

		const chunks = await request<StoredChunk[]>(
			db
				.transaction(CHUNKS, "readonly")
				.objectStore(CHUNKS)
				.getAll(range(world)),
		).catch(() => [] as StoredChunk[]);

		const rows = new Map<number, ChunkDeltas>();
		for (const chunk of chunks)
			rows.set(
				chunk.chunkKey,
				ChunkDeltas.unpack(chunk.where, chunk.what),
			);
		const store = new DeltaStore(header, rows);
		return { store: store.recut(want.chunkLevel), stale: false };
	}

	/** Write one chunk's changes, and the world's header alongside them. */
	async save(
		world: string,
		store: DeltaStore,
		chunkKey: number,
	): Promise<void> {
		const db = await this.database();
		if (!db) return;
		const row = store.rowOf(chunkKey);
		const deal = db.transaction([CHUNKS, WORLDS], "readwrite");
		const chunks = deal.objectStore(CHUNKS);
		if (!row || row.size === 0) chunks.delete([world, chunkKey]);
		else {
			const packed = row.pack();
			const record: StoredChunk = {
				world,
				chunkKey,
				where: packed.where,
				what: packed.what,
			};
			chunks.put(record);
		}
		deal.objectStore(WORLDS).put({ world, header: store.header });
		await settled(deal).catch(() => undefined);
	}

	/** Write every chunk, for a store that arrived whole rather than a click at a time. */
	async saveAll(world: string, store: DeltaStore): Promise<void> {
		const db = await this.database();
		if (!db) return;
		const deal = db.transaction([CHUNKS, WORLDS], "readwrite");
		const chunks = deal.objectStore(CHUNKS);
		for (const [chunkKey, row] of store.entries()) {
			if (row.size === 0) continue;
			const packed = row.pack();
			chunks.put({
				world,
				chunkKey,
				where: packed.where,
				what: packed.what,
			});
		}
		deal.objectStore(WORLDS).put({ world, header: store.header });
		await settled(deal).catch(() => undefined);
	}

	/** Throw a world's changes away. */
	async clear(world: string): Promise<void> {
		const db = await this.database();
		if (!db) return;
		const deal = db.transaction([CHUNKS, WORLDS], "readwrite");
		deal.objectStore(CHUNKS).delete(range(world));
		deal.objectStore(WORLDS).delete(world);
		await settled(deal).catch(() => undefined);
	}

	private database(): Promise<IDBDatabase | null> {
		if (this.open) return this.open;
		this.open = new Promise((resolve) => {
			if (typeof indexedDB === "undefined") return resolve(null);
			let opening: IDBOpenDBRequest;
			try {
				opening = indexedDB.open(DB_NAME, DB_VERSION);
			} catch {
				return resolve(null);
			}
			opening.onupgradeneeded = () => {
				const db = opening.result;
				// The first version held one record per world. Its rows are
				// dropped rather than converted: this storage is the browser's
				// and holds a few minutes of building.
				if (db.objectStoreNames.contains(WORLDS))
					db.deleteObjectStore(WORLDS);
				if (db.objectStoreNames.contains(CHUNKS))
					db.deleteObjectStore(CHUNKS);
				db.createObjectStore(WORLDS, { keyPath: "world" });
				db.createObjectStore(CHUNKS, {
					keyPath: ["world", "chunkKey"],
				});
			};
			opening.onsuccess = () => resolve(opening.result);
			opening.onerror = () => resolve(null);
			opening.onblocked = () => resolve(null);
		});
		return this.open;
	}
}

/** Every chunk key under one world's name. */
function range(world: string): IDBKeyRange {
	return IDBKeyRange.bound([world, -Infinity], [world, Infinity]);
}

/** One request, as a promise. */
function request<T>(from: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		from.onsuccess = () => resolve(from.result);
		from.onerror = () => reject(from.error ?? new Error("request failed"));
	});
}

/** One transaction, as a promise. */
function settled(deal: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		deal.oncomplete = () => resolve();
		deal.onerror = () => reject(deal.error ?? new Error("write failed"));
		deal.onabort = () => reject(deal.error ?? new Error("write aborted"));
	});
}
