import type { StoreHeader } from "chamfer/edit";
import { ChunkDeltas, DeltaStore, STORE_VERSION } from "chamfer/edit";

/** What one world's row holds, as the browser stores it. */
interface StoredWorld {
	world: string;
	header: StoreHeader;
	keys: number[];
	where: Uint32Array[];
	what: Uint16Array[];
}

const DB_NAME = "chamfer";
const STORE = "worlds";
const DB_VERSION = 1;

/**
 * Where a player's changes live between visits.
 *
 * The browser's own database, one record per world, and nothing else: a world
 * lives as long as the browser keeps its storage, which is what makes it the
 * right size of commitment for a build with no server on either side of it.
 *
 * **A world is named by its shape.** Every number that decides where a cell is
 * or what block sits there goes into the name, so blocks placed in one world
 * never appear in a differently shaped one. The chunk size stays out of the
 * name, because it decides how the address is cut for loading and drawing and
 * moves no block -- a store written at eight cells a chunk is re-cut on the way
 * in when the world is opened at sixty-four.
 *
 * Every method resolves to a working answer when the database is unavailable.
 * A browser in a private window, or one with site data turned off, then plays
 * a world it cannot save rather than refusing to open one.
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
			db.transaction(STORE, "readonly").objectStore(STORE).get(world),
		).catch(() => undefined);
		if (!found) return empty;

		// A store written by a build whose block numbers have moved cannot be
		// read as it stands, and reading it anyway turns somebody's wall into
		// another material. Refuse it and say so.
		const known = want.registry;
		const stale =
			found.header.version !== STORE_VERSION ||
			found.header.subdivisionDepth !== want.subdivisionDepth ||
			found.header.registry.length > known.length ||
			found.header.registry.some((name, at) => known[at] !== name);
		if (stale) return { store: new DeltaStore(want), stale: true };

		const rows = new Map<number, ChunkDeltas>();
		found.keys.forEach((key, at) =>
			rows.set(key, ChunkDeltas.unpack(found.where[at]!, found.what[at]!)),
		);
		const store = new DeltaStore(found.header, rows);
		return { store: store.recut(want.chunkLevel), stale: false };
	}

	/** Write a world's changes, replacing whatever was there. */
	async save(world: string, store: DeltaStore): Promise<void> {
		const db = await this.database();
		if (!db) return;
		const keys: number[] = [];
		const where: Uint32Array[] = [];
		const what: Uint16Array[] = [];
		for (const [key, row] of store.entries()) {
			if (row.size === 0) continue;
			const packed = row.pack();
			keys.push(key);
			where.push(packed.where);
			what.push(packed.what);
		}
		const record: StoredWorld = {
			world,
			header: store.header,
			keys,
			where,
			what,
		};
		await request(
			db.transaction(STORE, "readwrite").objectStore(STORE).put(record),
		).catch(() => undefined);
	}

	/** Throw a world's changes away. */
	async clear(world: string): Promise<void> {
		const db = await this.database();
		if (!db) return;
		await request(
			db.transaction(STORE, "readwrite").objectStore(STORE).delete(world),
		).catch(() => undefined);
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
				if (!db.objectStoreNames.contains(STORE))
					db.createObjectStore(STORE, { keyPath: "world" });
			};
			opening.onsuccess = () => resolve(opening.result);
			opening.onerror = () => resolve(null);
			opening.onblocked = () => resolve(null);
		});
		return this.open;
	}
}

/** One request, as a promise. */
function request<T>(from: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		from.onsuccess = () => resolve(from.result);
		from.onerror = () => reject(from.error ?? new Error("request failed"));
	});
}
