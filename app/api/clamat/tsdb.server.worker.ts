import path from "path";
import fs from "fs/promises";
import fs0 from "fs";
import debug0 from "debug";
const debug = debug0("clamat:tsdb");

export class StorageItem {
	public directory: string;
	public id: string;
	public options: any;
	public partitions: Map<number, StorageItemPartition>;
	public availablePartitions: number[]; // sorted
	public unloadPartitionHandle: any;
	public __lastAccess = Date.now();
	protected appendPromise: Promise<any>;

	constructor(directory: string, id: string, options: any) {
		this.directory = directory;
		this.id = id;
		this.options = options;
		this.partitions = new Map();
		this.availablePartitions = [];
		this.unloadPartitionHandle = setInterval(() => this._unloadPartitionTask(), 5000);
	}
	destructor() {
		clearInterval(this.unloadPartitionHandle);
		for (const partition of this.partitions.values())
			partition.destructor();
	}

	async sync() {
		debug(`Synchronizing ${this.id}`);
		const matchRegex = new RegExp(`^${this.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-([0-9]+)\.log$`);
		const availablePartitions = (await fs.readdir(this.directory))
			.map(n => parseInt(n.match(matchRegex)?.[1]))
			.filter(t => !isNaN(t))
			.sort((t1, t2) => t1 - t2);
		this.availablePartitions.splice(0, Infinity, ...availablePartitions);
	}
	async *read(fromTime: number, toTime: number) { // fromTime and toTime are inclusive
		const now = Date.now();
		const reversed = fromTime > toTime;
		if (!reversed) {
			const startTime = fromTime;
			const endTime = toTime;
			let index = Math.min(Math.max(this._findPartitionIncludes(startTime), 0), this.availablePartitions.length - 1);
			while (true) {
				const partitionTime = this.availablePartitions[index];
				if (!partitionTime || partitionTime > endTime) break;
				const partition = await this._getLoadedPartition(index);
				partition.__lastAccess = now;
				yield* partition.read(startTime, endTime);
				index++;
			}
		} else {
			const startTime = toTime;
			const endTime = fromTime;
			let index = Math.min(Math.max(this._findPartitionIncludes(endTime), 0), this.availablePartitions.length - 1);
			while (true) {
				const partitionTime = this.availablePartitions[index];
				if (!partitionTime || partitionTime < startTime) break;
				const partition = await this._getLoadedPartition(index);
				partition.__lastAccess = now;
				yield* partition.read(startTime, endTime);
				index--;
			}
		}
	}
	async *_readPartition(fromIndex: number, toIndex: number) { // fromIndex and toIndex are inclusive
		const now = Date.now();
		const reversed = fromIndex > toIndex;
		if (!reversed) {
			const startIndex = Math.max(0, fromIndex);
			const endIndex = Math.min(toIndex, this.availablePartitions.length - 1);
			for (let index = startIndex; index <= endIndex; index++) {
				const partitionTime = this.availablePartitions[index];
				if (!partitionTime) break;
				const partition = await this._getLoadedPartition(index);
				partition.__lastAccess = now;
				yield* partition.read(0, Infinity);
			}
		} else {
			const startIndex = Math.max(0, fromIndex);
			const endIndex = Math.min(toIndex, this.availablePartitions.length - 1);
			for (let index = endIndex - 1; index >= startIndex; index--) {
				const partitionTime = this.availablePartitions[index];
				if (!partitionTime) break;
				const partition = await this._getLoadedPartition(index);
				partition.__lastAccess = now;
				yield* partition.read(Infinity, 0);
			}
		}
	}
	async append(data: any) {
		type Return = { data: any, timestamp: number };
		let resolve: (v: Return) => void;
		let reject: (e: Error) => void;
		const promise = new Promise<Return>((res, rej) => { resolve = res; reject = rej; });
		let appendPromise: Promise<any>;
		if (this.appendPromise != null) {
			appendPromise = this.appendPromise.finally(() => {
				return this.append0(data)
					.then(r => resolve(r))
					.catch(e => reject(e))
					.finally(() => {
						if (this.appendPromise == appendPromise)
							this.appendPromise = null;
					});
			});
		} else {
			appendPromise = this.append0(data)
				.then(r => resolve(r))
				.catch(e => reject(e))
				.finally(() => {
					if (this.appendPromise == appendPromise)
						this.appendPromise = null;
				});
		}
		this.appendPromise = appendPromise;
		return await promise;
	}
	async append0(data: any) {
		const now = Date.now();
		let partition = await this._getLoadedPartition(this.availablePartitions.length - 1);
		if (partition == null ||
			(typeof this.options.maxPartitionLength != "undefined" && partition.length >= this.options.maxPartitionLength) ||
			(typeof this.options.maxPartitionRange != "undefined" && partition.range >= this.options.maxPartitionRange)) {
			partition = this._newPartition();
		}
		partition.__lastAccess = now;
		return await partition.append(data);
	}

	_newPartition() {
		debug(`New partition ${this.id}`);
		const now = Date.now();
		const partition = new StorageItemPartition(this.directory, this.id, Date.now());
		partition.__lastAccess = now;
		this.partitions.set(partition.timestamp, partition);
		this.availablePartitions.push(partition.timestamp);
		return partition;
	}
	_findPartitionIncludes(timestamp: number) {
		if (this.availablePartitions[0] > timestamp) return -1;
		const index = this.availablePartitions.findIndex(t => t >= timestamp);
		if (index == -1) return Infinity;
		const partitionTimestamp = this.availablePartitions[index];
		if (partitionTimestamp == timestamp) return index;
		return index - 1;
	}
	async _getLoadedPartition(index: number) {
		const timestamp = this.availablePartitions[index];
		if (!timestamp) return null;
		let partition = this.partitions.get(timestamp);
		if (partition == null) {
			await this._loadPartitions([index]);
			partition = this.partitions.get(timestamp);
		}
		return partition;
	}
	async _loadPartitions(indices: number[], onParseError: (e: Error) => any = null) {
		debug(`Load partitions ${this.id}[${indices.map(i => this.availablePartitions[i]).join(", ")}]`);
		const now = Date.now();
		const promises = [];
		for (const index of indices) {
			const timestamp = this.availablePartitions[index];
			const partition = new StorageItemPartition(this.directory, this.id, timestamp);
			partition.__lastAccess = now;
			this.partitions.set(timestamp, partition);
			promises.push(partition.sync(onParseError));
		}
		await Promise.all(promises);
	}
	_unloadPartitions(indices: number[]) {
		debug(`Unload partitions ${this.id}[${indices.map(i => this.availablePartitions[i]).join(", ")}]`);
		for (const index of indices) {
			const timestamp = this.availablePartitions[index];
			const partition = this.partitions.get(timestamp);
			this.partitions.delete(timestamp);
			partition.destructor();
		}
	}
	_unloadPartitionTask() {
		const now = Date.now();
		const toUnload = new Set<number>();
		if (typeof this.options.maxPartitionAccessAge != "undefined") {
			for (let i = 0; i < this.availablePartitions.length; i++) {
				const partition = this.partitions.get(this.availablePartitions[i]);
				if (partition == null) continue;
				if (now - partition.__lastAccess < this.options.maxPartitionAccessAge) continue;
				toUnload.add(i);
			}
		}
		if (typeof this.options.maxPartitionAccessRange != "undefined") {
			const unloadBefore = this.availablePartitions.at(-1) - this.options.maxPartitionAccessRange;
			const unloadIndex = this._findPartitionIncludes(unloadBefore) - 1;
			if (unloadIndex != -1 && isFinite(unloadIndex)) {
				for (let i = 0; i < unloadIndex; i++) {
					const partition = this.availablePartitions[i];
					if (!this.partitions.has(partition)) continue;
					toUnload.add(i);
				}
			}
		}
		if (toUnload.size > 0)
			this._unloadPartitions([...toUnload]);
	}
}
export class StorageItemPartition {
	public directory: string;
	public id: string;
	public timestamp: number;
	public path: string;
	public writeStream: fs0.WriteStream;
	public entries: { timestamp: number; data: any }[]; // sorted;
	public __lastAccess = Date.now();

	constructor(directory: string, id: string, timestamp: number) {
		this.directory = directory;
		this.id = id;
		this.timestamp = timestamp;
		this.path = path.join(directory, `${id}-${timestamp}.log`);
		this.writeStream = fs0.createWriteStream(this.path, { flags: "a" });
		this.entries = [];
		if (!fs0.existsSync(this.path))
			fs0.closeSync(fs0.openSync(this.path, "w"));
	}
	destructor() {
		this.writeStream.destroy();
	}

	get length() { return this.entries.length; }
	get range() { return this.entries.length > 0 ? this.entries.at(-1).timestamp - this.timestamp : 0; }

	async sync(onParseError: (e: Error) => any = null) {
		debug(`Synchronizing ${this.id}-${this.timestamp}`);
		const content = await fs.readFile(this.path, "utf-8");
		const parseLine = (l: string) => {
			try {
				return l.trim() != "" ? Object.freeze(JSON.parse(l)) : null;
			} catch (e) {
				if (onParseError == null)
					throw e;
				onParseError(e);
				return null;
			}
		}
		const newEntries = content.split("\n").map(parseLine).filter(e => e != null);
		this.entries.splice(0, Infinity, ...newEntries);
	}
	async *read(fromTime: number, toTime: number) { // fromTime and toTime are inclusive
		const reversed = fromTime > toTime;
		if (!reversed) {
			const startTime = fromTime;
			const endTime = toTime;
			for (let i = 0; i < this.entries.length; i++) {
				const entry = this.entries[i];
				if (entry.timestamp < startTime) continue;
				if (entry.timestamp > endTime) break;
				yield [entry.timestamp, entry.data];
			}
		} else {
			const startTime = toTime;
			const endTime = fromTime;
			for (let i = this.entries.length - 1; i >= 0; i--) {
				const entry = this.entries[i];
				if (entry.timestamp < startTime) break;
				if (entry.timestamp > endTime) continue;
				yield [entry.timestamp, entry.data];
			}
		}
	}
	async append(data: any) {
		const timestamp = Date.now();
		const entry = { timestamp: timestamp, data: data };
		Object.freeze(entry);
		this.entries.push(entry);
		const chunk = Buffer.from(`${JSON.stringify(entry)}\n`, "utf-8");
		let resolve; let reject;
		const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
		this.writeStream.write(chunk, error => error != null ? reject(error) : resolve());
		await promise;
		return entry;
	}
}
interface StorageItemStructureAbstract<T> {
	newStructure(cloneStructure?: T): T | Promise<T>;
	iterateStructure(structure: T, iterator: AsyncGenerator<any, void, any>): any | Promise<any>;
}
export class StorageItemStructure<T> {
	public storage: StorageItem;
	public id: string;
	public options: any;
	public snapshots: Map<number, StorageItemStructureSnapshot<T>>;
	public availableSnapshots: number[];
	public newStructure: StorageItemStructureAbstract<T>["newStructure"];
	public iterateStructure: StorageItemStructureAbstract<T>["iterateStructure"];
	public unloadSnapshotHandle: any;
	public __lastAccess = Date.now();
	protected _storageOldAppend0: StorageItem["append0"];
	protected _liveStructure: T;
	protected _liveStructureLast: number;

	constructor(storage: StorageItem, id: string, { newStructure, iterateStructure }: StorageItemStructureAbstract<T>, options: any) {
		this.storage = storage;
		this.id = id;
		this.options = options;
		this.snapshots = new Map();
		this.availableSnapshots = [];
		this.newStructure = newStructure;
		this.iterateStructure = iterateStructure;
		this.unloadSnapshotHandle = setInterval(() => this._unloadSnapshotTask(), 5000);
		this._attachInspection();
	}
	destructor() {
		this._detachInspection();
		clearInterval(this.unloadSnapshotHandle);
		for (const snapshot of this.snapshots.values())
			snapshot.destructor();
	}

	async sync() {
		debug(`Synchronizing snapshot ${this.id}`);
		const matchRegex = new RegExp(`^${this.storage.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}@${this.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-([0-9]+)\.log$`);
		const availableSnapshots = (await fs.readdir(this.storage.directory))
			.map(n => parseInt(n.match(matchRegex)?.[1]))
			.filter(t => !isNaN(t))
			.sort((t1, t2) => t1 - t2);
		this.availableSnapshots.splice(0, Infinity, ...availableSnapshots);

		const lastTimestamp = this.availableSnapshots.at(-1);
		const lastIndex = this.storage.availablePartitions.indexOf(lastTimestamp);
		const range = this.storage.availablePartitions.length - lastIndex - 1;
		if (range > this.options.captureSnapshotEveryPartition)
			await this._newSnapshot(this.storage.availablePartitions.at(-2));
	}

	_newInspection() {
		return {
			partitionCount: this.storage.availablePartitions.length,
			partitionTimestamp: this.storage.availablePartitions.at(-1),
			partitionLength: this.storage.partitions.get(this.storage.availablePartitions.at(-1))?.length
		};
	}
	_attachInspection() {
		const _storageOldAppend0 = this._storageOldAppend0 = this.storage.append0;
		const onFinally = (inspection) => {
			const currentInspection = this._newInspection();
			if (currentInspection.partitionCount != inspection.partitionCount ||
				currentInspection.partitionTimestamp != inspection.partitionTimestamp ||
				currentInspection.partitionLength != inspection.partitionLength) {
				const promises = [];
				if (this._liveStructure != null)
					promises.push(this._updateLive());
				if (typeof this.options.captureSnapshotEveryPartition != "undefined") {
					const lastTimestamp = this.availableSnapshots.at(-1);
					const lastIndex = this.storage.availablePartitions.indexOf(lastTimestamp);
					const range = this.storage.availablePartitions.length - lastIndex - 1;
					if (range > this.options.captureSnapshotEveryPartition)
						promises.push(this._newSnapshot(inspection.partitionTimestamp));
				}
				if (promises.length > 0)
					return Promise.all(promises);
			}
		}
		this.storage.append0 = function () {
			const inspection = this._newInspection();
			const result = _storageOldAppend0.apply(this, arguments);
			if (result instanceof Promise)
				return result.finally(() => onFinally(inspection));
			else {
				const onFinallyResult = onFinally(inspection);
				if (onFinallyResult instanceof Promise)
					return onFinallyResult.then(() => result);
				return result;
			}
		}
	}
	_detachInspection() {
		this.storage.append0 = this._storageOldAppend0;
	}

	async _updateLive() {
		if (this._liveStructure == null)
			return;
		const now = Date.now();
		const last = this._liveStructureLast;
		this._liveStructureLast = now;
		await this._continueStructure(this._liveStructure, last + 1, now);
	}
	async _initLive() {
		if (this._liveStructure != null)
			return;
		const now = Date.now();
		this._liveStructureLast = now;
		this._liveStructure = await this.getStructure(now);
	}
	get live() {
		if (this._liveStructure == null)
			this._initLive();
		return this._liveStructure;
	}

	_findSnapshotIncludes(timestamp: number) {
		if (this.availableSnapshots[0] > timestamp) return -1;
		const index = this.availableSnapshots.findIndex(t => t >= timestamp);
		if (index == -1) return Infinity;
		const snapshotTimestamp = this.availableSnapshots[index];
		if (snapshotTimestamp == timestamp) return index;
		return index - 1;
	}
	async _continueStructure(structure: any, fromTimestamp: number, toTimestamp: number) {
		const iterator = this.storage.read(fromTimestamp, toTimestamp);
		await this.iterateStructure(structure, iterator);
		return structure;
	}
	async getStructure(toTimestamp: number = Infinity) {
		const now = Date.now();
		const snapshotIndex = Math.min(this._findSnapshotIncludes(toTimestamp), this.availableSnapshots.length - 1);
		if (snapshotIndex == -1) {
			const iterator = this.storage.read(0, toTimestamp);
			const clonedStructure = await this.newStructure();
			await this.iterateStructure(clonedStructure, iterator);
			return clonedStructure;
		}
		const lastSnapshot = await this._getLoadedSnapshot(snapshotIndex);
		lastSnapshot.__lastAccess = now;
		const afterLastSnapshot = await this.storage._getLoadedPartition(this.storage.availablePartitions.indexOf(lastSnapshot.timestamp) + 1);
		const clonedStructure = await this.newStructure(lastSnapshot?.structure);
		const iterator = this.storage.read(afterLastSnapshot?.timestamp || 0, toTimestamp);
		await this.iterateStructure(clonedStructure, iterator);
		return clonedStructure;
	}
	async _newSnapshot(toPartitionTimestamp: number) {
		if (!this.storage.availablePartitions.includes(toPartitionTimestamp))
			throw new Error("Snapshot must be atleast a whole partition");
		const now = Date.now();
		const snapshotIndex = this.availableSnapshots.indexOf(toPartitionTimestamp);
		if (snapshotIndex != -1) {
			const lastSnapshot = await this._getLoadedSnapshot(snapshotIndex - 1);
			const snapshot = await this._getLoadedSnapshot(snapshotIndex);
			if (lastSnapshot != null) lastSnapshot.__lastAccess = now;
			snapshot.__lastAccess = now;
			const lastPartitionIndex = this.storage._findPartitionIncludes(lastSnapshot?.timestamp || 0);
			const partitionIndex = this.storage._findPartitionIncludes(snapshot.timestamp);
			const iterator = this.storage._readPartition(lastPartitionIndex + 1, partitionIndex);
			const clonedStructure = await this.newStructure(lastSnapshot?.structure);
			await this.iterateStructure(clonedStructure, iterator);
			await snapshot.write(clonedStructure);
			return;
		}
		const lastSnapshot = await this._getLoadedSnapshot(this.availableSnapshots.length - 1);
		const snapshot = new StorageItemStructureSnapshot<T>(this.storage.directory, this.storage.id, this.id, toPartitionTimestamp);
		if (lastSnapshot != null) lastSnapshot.__lastAccess = now;
		snapshot.__lastAccess = now;
		const lastPartitionIndex = this.storage._findPartitionIncludes(lastSnapshot?.timestamp || 0);
		const partitionIndex = this.storage._findPartitionIncludes(snapshot.timestamp);
		const iterator = this.storage._readPartition(lastPartitionIndex + 1, partitionIndex);
		const clonedStructure = await this.newStructure(lastSnapshot?.structure);
		await this.iterateStructure(clonedStructure, iterator);
		await snapshot.write(clonedStructure);
		this.snapshots.set(snapshot.timestamp, snapshot);
		this.availableSnapshots.push(snapshot.timestamp);
		return;
	}
	async _getLoadedSnapshot(index: number) {
		const timestamp = this.availableSnapshots[index];
		if (!timestamp) return null;
		let snapshot = this.snapshots.get(timestamp);
		if (snapshot == null) {
			await this._loadSnapshots([index]);
			snapshot = this.snapshots.get(timestamp);
		}
		return snapshot;
	}
	async _loadSnapshots(indices: number[], onParseError: (e: Error) => any = null) {
		debug(`Load snapshots ${this.id}[${indices.map(i => this.availableSnapshots[i]).join(", ")}]`);
		const now = Date.now();
		const promises = [];
		for (const index of indices) {
			const timestamp = this.availableSnapshots[index];
			const snapshot = new StorageItemStructureSnapshot<T>(this.storage.directory, this.storage.id, this.id, timestamp);
			snapshot.__lastAccess = now;
			this.snapshots.set(timestamp, snapshot);
			promises.push(snapshot.sync(onParseError));
		}
		await Promise.all(promises);
	}
	_unloadSnapshots(indices: number[]) {
		debug(`Unload snapshots ${this.id}[${indices.map(i => this.availableSnapshots[i]).join(", ")}]`);
		for (const index of indices) {
			const timestamp = this.availableSnapshots[index];
			const snapshot = this.snapshots.get(timestamp);
			this.snapshots.delete(timestamp);
			snapshot.destructor();
		}
	}
	_unloadSnapshotTask() {
		const now = Date.now();
		const toUnload = new Set<number>();
		if (typeof this.options.maxSnapshotAccessAge != "undefined") {
			for (let i = 0; i < this.availableSnapshots.length; i++) {
				const snapshot = this.snapshots.get(this.availableSnapshots[i]);
				if (snapshot == null) continue;
				if (now - snapshot.__lastAccess < this.options.maxSnapshotAccessAge) continue;
				toUnload.add(i);
			}
		}
		if (typeof this.options.maxSnapshotAccessRange != "undefined") {
			const unloadBefore = this.availableSnapshots.at(-1) - this.options.maxSnapshotAccessRange;
			const unloadIndex = this._findSnapshotIncludes(unloadBefore) - 1;
			if (unloadIndex != -1 && isFinite(unloadIndex)) {
				for (let i = 0; i < unloadIndex; i++) {
					const snapshot = this.availableSnapshots[i];
					if (!this.snapshots.has(snapshot)) continue;
					toUnload.add(i);
				}
			}
		}
		if (toUnload.size > 0)
			this._unloadSnapshots([...toUnload]);
	}
}
export class StorageItemStructureSnapshot<T> {
	public directory: string;
	public storageId: string;
	public id: string;
	public timestamp: number;
	public path: string;
	public structure: T;
	public __lastAccess = Date.now();

	constructor(directory: string, storageId: string, id: string, timestamp: number) {
		this.directory = directory;
		this.storageId = storageId;
		this.id = id;
		this.timestamp = timestamp;
		this.path = path.join(directory, `${storageId}@${id}-${timestamp}.log`);
		this.structure = null;
		if (!fs0.existsSync(this.path))
			fs0.closeSync(fs0.openSync(this.path, "w"));
	}
	destructor() {

	}

	async sync(onParseError: (error: Error) => any = null) {
		const content = await fs.readFile(this.path, "utf-8");
		const parseStructure = (content: any) => {
			try {
				return JSON.parse(content);
			} catch (e) {
				if (onParseError == null)
					throw e;
				onParseError(e);
				return null;
			}
		}
		this.structure = parseStructure(content);
	}
	async write(data: any) {
		this.structure = data;
		await fs.writeFile(this.path, Buffer.from(JSON.stringify(data), "utf-8"));
	}
}
