/* eslint-env node */
/// <reference types="node" />
/* global globalThis, Proxy */

/* eslint-disable camelcase */
/* eslint-disable no-param-reassign */
/* eslint-disable no-await-in-loop */

const sharedMutex = require("@markusjx/shared_mutex");
const deasync0 = require("deasync");
const Comlink = require("./next.config.withWorker.comlink");
const {
	MessageChannel,
	EventTarget,
	StartEvent,
	CloseEvent,
	MessageEvent,
	PayloadIncomingEvent,
	PayloadOutgoingEvent,
	ReleasedEvent,
	newFinalizationRegistry,
	formatBytes,
	newLogger,
	newTempBuffer,
	bufferEndpoint,
	decompressComlinkMessage,
	compressComlinkMessage,
	newReader,
	newWriter,
	SIA_TYPES,
	SIA_BUILTIN_CONSTRUCTORS,
	Sia,
	DeSia
} = require("./next.config.withWorker.ipc-shared");

exports.MessageChannel = MessageChannel;
exports.EventTarget = EventTarget;
exports.StartEvent = StartEvent;
exports.CloseEvent = CloseEvent;
exports.MessageEvent = MessageEvent;
exports.PayloadIncomingEvent = PayloadIncomingEvent;
exports.PayloadOutgoingEvent = PayloadOutgoingEvent;
exports.ReleasedEvent = ReleasedEvent;
exports.newFinalizationRegistry = newFinalizationRegistry;
exports.formatBytes = formatBytes;
exports.newLogger = newLogger;
exports.newTempBuffer = newTempBuffer;
exports.bufferEndpoint = bufferEndpoint;
exports.decompressComlinkMessage = decompressComlinkMessage;
exports.compressComlinkMessage = compressComlinkMessage;
exports.newReader = newReader;
exports.newWriter = newWriter;
exports.SIA_TYPES = SIA_TYPES;
exports.SIA_BUILTIN_CONSTRUCTORS = SIA_BUILTIN_CONSTRUCTORS;
exports.Sia = Sia;
exports.DeSia = DeSia;

const [kAborted, kReason] = (() => {
	const keys = Reflect.ownKeys((new AbortController()).signal);
	return [
		keys.find(s => s.description == "kAborted"),
		keys.find(s => s.description == "kReason")
	];
})();
function newAbortSignal(aborted = false, reason = undefined) {
	const signal = new EventTarget();
	Object.setPrototypeOf(signal, AbortSignal.prototype);
	signal[kAborted] = aborted;
	signal[kReason] = reason;
	return signal;
}
exports.kAborted = kAborted;
exports.kReason = kReason;
exports.newAbortSignal = newAbortSignal;

function deasync(promise, timeout = Infinity) {
	const start = Date.now();
	let state = "pending";
	let value = null;
	if(typeof promise == "function") {
		try {
			promise(
				v => { if(state != "pending") return; state = "resolved"; value = v; },
				e => { if(state != "pending") return; state = "rejected"; value = e; }
			);
		} catch(e) {
			state = "rejected"; value = e;
		}
	} else if(promise instanceof Promise) {
		promise.then(
			v => { if(state != "pending") return; state = "resolved"; value = v; },
			e => { if(state != "pending") return; state = "rejected"; value = e; }
		);
	} else
		throw new Error(`Invalid PromiseLike object ${promise}`);
	if(state == "pending" && timeout > 0) {
		if(isFinite(timeout))
			deasync0.loopWhile(() => state == "pending" && Date.now() - start < timeout);
		else
			deasync0.loopWhile(() => state == "pending");
	}
	if(state == "pending") throw new Error("Timed out waiting promise");
	if(state == "resolved") return value;
	if(state == "rejected") throw value;
	throw new Error(`Unexpected state: ${state}`);
}
exports.deasync = deasync;

const promiseInspectionPending = Symbol("promise pending");
function inspectPromiseTick(promise) {
	let state = "pending";
	let value = null;
	Promise.race([promise, promiseInspectionPending]).then(
		v => { state = "resolved"; value = v; },
		e => { state = "rejected"; value = e; }
	);
	process._tickCallback();
	if(state == "pending" || (state == "resolved" && value == promiseInspectionPending))
		return { state: "pending" };
	return { state: state, value: value };
}
exports.inspectPromiseTick = inspectPromiseTick;

/** @type <C>(spawnCallback: C) => ReturnType<C> & { exports: ReturnType<typeof Comlink.wrapEndpoint> } */
function respawnComlinkProxy(spawnCallback) {
	const instanceProxyTarget = function target() {};
	const instanceProxy = new Proxy(instanceProxyTarget, {
		ownKeys(_) {
			if(state == "resolved") return ["exports", ...Reflect.ownKeys(value)];
			deferEndpoint.__stack.push(["__ownKeys"]);
			return ["exports", ...Reflect.ownKeys(instanceProxyTarget)];
		},
		has(_, property) {
			if(state == "resolved") return Reflect.has(value, property);
			deferEndpoint.__stack.push(["__has", property]);
			return Reflect.has(instanceProxyTarget, property);
		},
		get(_, property) {
			if(property == "exports") return comlinkProxy;
			if(state == "resolved") return Reflect.get(value, property);
			deferEndpoint.__stack.push(["__get", property]);
			return Reflect.get(instanceProxyTarget, property);
		},
		set(_, property, propertyValue) {
			if(property == "exports") throw new Error("Cannot set property 'exports'");
			if(state == "resolved") return Reflect.set(value, property, propertyValue);
			deferEndpoint.__stack.push(["__set", property, propertyValue]);
			return Reflect.set(instanceProxyTarget, property, propertyValue);
		},
		deleteProperty(_, property) {
			if(property == "exports") throw new Error("Cannot delete property 'exports'");
			if(state == "resolved") return Reflect.deleteProperty(value, property);
			deferEndpoint.__stack.push(["__deleteProperty", property]);
			return Reflect.deleteProperty(instanceProxyTarget, property);
		}
	});
	let state = "pending";
	let value = null;
	const tryRespawn = () => {
		state = "pending";
		value = null;
		deferEndpoint.__reset();
		try {
			const result = spawnCallback();
			state = "resolved"; value = result;
			deferEndpoint.__onready();
		} catch(e) {
			state = "rejected"; value = e;
			deferEndpoint.__onready();
		}
	};
	let respawnHandle = null;
	const scheduleRespawn = () => {
		// Don't respawn if on production build. Lost connection is unresolvable issue.
		// This function's job is to provide support for error handling if for some reason
		// the worker can't be initialized.
		//
		// Consider if we initialize something and requires to transfer an object. If
		// the connection is lost, then we can't reinitialize because it will cause
		// side effects. Also, we depend on the fact that the socket is a loopback connection.
		// So lost, connection is not really a thing.
		if(process.env.NODE_ENV == "production")
			return;
		// We want to automatically respawn the worker, but if we immediately respawn the worker
		// when there's an error, the error won't propagate. Also, if we don't schedule the respawn
		// and if there is a problem in worker initialization, that condition will respawn the worker
		// indefinitely. We set a timeout as a "respawn-worker-when-idle" kind of thing.
		if(respawnHandle != null)
			clearTimeout(respawnHandle);
		respawnHandle = setTimeout(() => {
			respawnHandle = null;
			tryRespawn();
		}, 5000);
	};
	const deferEndpoint = {
		__stack: [],
		__start() {
			this.__stack.push(["start"]);
			if(this.started) return;
			this.started = true;
		},
		__close() {
			this.__stack.push(["close"]);
			if(!this.started) return;
			if(this.closed) return;
			this.closed = true;
		},
		__addEventListener(name, listener, options) {
			this.__stack.push(["addEventListener", name, listener, options]);
		},
		__removeEventListener(name, listener, options) {
			this.__stack.push(["removeEventListener", name, listener, options]);
		},
		__postMessage(message, transferables) {
			this.__stack.push(["postMessage", message, transferables]);
		},
		__postMessageSync() {
			throw new Error("Worker is not ready, please wait a bit for synchronous call");
		},
		__reset() {
			if(state != "pending")
				throw new Error("Invalid state");
			this.start = this.__start;
			this.close = this.__close;
			this.addEventListener = this.__addEventListener;
			this.removeEventListener = this.__removeEventListener;
			this.postMessage = this.__postMessage;
			this.postMessageSync = this.__postMessageSync;
			Object.defineProperty(this, "started", {
				value: false,
				writable: true,
				configurable: true,
				enumerable: true
			});
			Object.defineProperty(this, "closed", {
				value: false,
				writable: true,
				configurable: true,
				enumerable: true
			});
		},
		__onready() {
			if(state == "pending")
				throw new Error("Invalid state");
			if(state == "rejected") {
				const error = value;
				const eventTarget = new EventTarget();
				for(const [name, ...args] of this.__stack) {
					if(name == "addEventListener" || name == "removeEventListener") {
						eventTarget[name](...args);
						continue;
					}
					if(name == "postMessage") {
						const [message] = args;
						const id = message?.id;
						const type = message?.type;
						if(id == null) continue;
						let payload;
						if(type == "RELEASED") payload = { id: id, type: "RETURN", value: undefined };
						else payload = { id: id, type: "THROW", value: error };
						eventTarget.dispatchEvent(new global.MessageEvent("message", { data: payload }));
						continue;
					}
				}
				const scheduleRespawnFn = (cb = () => { throw true; }) => {
					if(process.env.NODE_ENV == "production") {
						return (...args) => {
							try { return cb(...args); }
							catch(v) { if(v == true) throw error; throw v; }
						};
					}
					return (...args) => {
						scheduleRespawn();
						try { return cb(...args); }
						catch(v) { if(v == true) throw error; throw v; }
					};
				};
				this.start = scheduleRespawnFn();
				this.close = scheduleRespawnFn();
				this.addEventListener = scheduleRespawnFn();
				this.removeEventListener = scheduleRespawnFn((type, callback) => {
					if(!eventTarget.hasEventListener(type, callback))
						throw true;
					return eventTarget.removeEventListener(type, callback);
				});
				this.postMessage = scheduleRespawnFn();
				this.postMessageSync = scheduleRespawnFn();
				Object.defineProperty(this, "started", {
					value: true,
					writable: false,
					configurable: true,
					enumerable: true
				});
				Object.defineProperty(this, "closed", {
					value: false, // Let this handles exception
					writable: false,
					configurable: true,
					enumerable: true
				});
				for(let i = this.__stack.length - 1; i >= 0; i--) {
					const [name] = this.__stack[i];
					if(
						name == "start" || name == "__ownKeys" || name == "__has" ||
						name == "__get" || name == "__set" || name == "__deleteProperty"
					)
						continue;
					this.__stack.splice(i, 1);
				}
				return;
			}
			const endpoint = value.context.ipcEndpoint;
			for(const [name, ...args] of this.__stack) {
				if(
					name == "start" || name == "close" ||
					name == "addEventListener" || name == "removeEventListener" ||
					name == "postMessage"
				) {
					endpoint[name](...args);
					continue;
				}
				if(name == "__ownKeys") {
					Reflect.ownKeys(value);
					continue;
				}
				if(name == "__has") {
					Reflect.has(value, args[0]);
					continue;
				}
				if(name == "__get") {
					Reflect.get(value, args[0]);
					continue;
				}
				if(name == "__set") {
					Reflect.set(value, args[0], args[1]);
					continue;
				}
				if(name == "__deleteProperty") {
					Reflect.deleteProperty(value, args[0]);
					continue;
				}
			}
			const scheduleRespawnIfClosed = fn => {
				if(process.env.NODE_ENV == "production")
					return fn.bind(endpoint);
				return (...args) => {
					try {
						return fn.call(endpoint, ...args);
					} finally {
						if(endpoint.closed)
							scheduleRespawn();
					}
				};
			};
			this.start = scheduleRespawnIfClosed(endpoint.start);
			this.close = scheduleRespawnIfClosed(endpoint.close);
			this.addEventListener = scheduleRespawnIfClosed(endpoint.addEventListener);
			this.removeEventListener = scheduleRespawnIfClosed(endpoint.removeEventListener);
			this.postMessage = scheduleRespawnIfClosed(endpoint.postMessage);
			this.postMessageSync = scheduleRespawnIfClosed(endpoint.postMessageSync);
			Object.defineProperty(this, "started", {
				get: scheduleRespawnIfClosed(() => endpoint.started),
				set: scheduleRespawnIfClosed(v => endpoint.started = v),
				configurable: true,
				enumerable: true
			});
			Object.defineProperty(this, "closed", {
				get: scheduleRespawnIfClosed(() => endpoint.closed),
				set: scheduleRespawnIfClosed(v => endpoint.closed = v),
				configurable: true,
				enumerable: true
			});
			// Allow Object.keys to behave as normally
			Object.defineProperties(instanceProxyTarget, Object.getOwnPropertyDescriptors(value));
			this.__stack.splice(0);
		}
	};
	deferEndpoint.__reset();
	const comlinkProxy = Comlink.wrapEndpoint(new Proxy(deferEndpoint, {
		ownKeys(_) {
			return [...new Set([
				...Reflect.ownKeys(deferEndpoint),
				...Reflect.ownKeys(state == "resolved" ? value.context.ipcEndpoint : {})
			])];
		},
		has(_, property) {
			if(Reflect.has(deferEndpoint, property))
				return true;
			if(state == "resolved" && Reflect.has(value.context.ipcEndpoint, property))
				return true;
			return false;
		},
		get(_, property) {
			if(state != "resolved" || Reflect.has(deferEndpoint, property))
				return Reflect.get(deferEndpoint, property);
			return Reflect.get(value.context.ipcEndpoint, property);
		},
		set(_, property, value) {
			return Reflect.set(deferEndpoint, property, value);
		},
		deleteProperty(_, property) {
			if(state != "resolved" || Reflect.has(deferEndpoint, property))
				return Reflect.deleteProperty(deferEndpoint, property);
			return Reflect.deleteProperty(value.context.ipcEndpoint, property);
		}
	}));
	tryRespawn();
	return instanceProxy;
}
exports.respawnComlinkProxy = respawnComlinkProxy;

function socketReader(socket) {
	const getReadTempBuffer = newTempBuffer();
	const readBuffers = [];
	let readBufferOffset = 0;
	let closed = false;
	let readUnlock = null;
	async function readBytes(length, outBuffer = getReadTempBuffer(length), outBufferOffset = 0) {
		if(outBufferOffset + length > outBuffer.length)
			throw new Error("Read offset+length must not exceed outBuffer length");
		if(closed)
			throw new Error("Socket closed");
		let remainingLength = length;
		while(remainingLength > 0) {
			let buffer;
			while((buffer = readBuffers[0]) == null && !closed)
				await new Promise(resolve => readUnlock = resolve);
			if(closed)
				throw new Error("Socket closed");
			const availableLength = buffer.length - readBufferOffset;
			const readLength = Math.min(remainingLength, availableLength);
			buffer.copy(outBuffer, outBufferOffset + length - remainingLength, readBufferOffset, readBufferOffset + readLength);
			remainingLength -= readLength;
			readBufferOffset += readLength;
			if(readBufferOffset >= buffer.length) {
				readBuffers.splice(0, 1);
				readBufferOffset = 0;
			}
		}
		return outBuffer;
	}
	const onClose = () => {
		readBuffers.splice(0);
		readBufferOffset = 0;
		closed = true;
		if(readUnlock != null)
			readUnlock();
		socket.off("data", onData);
		socket.off("error", onClose);
		socket.off("close", onClose);
	};
	const onData = buffer => {
		readBuffers.push(buffer);
		if(readUnlock != null)
			readUnlock();
	};
	socket.on("data", onData);
	socket.on("error", onClose);
	socket.on("close", onClose);
	return readBytes;
}
function socketWriter(socket) {
	const writeBufferPacks0 = [];
	let closed = false;
	function getWriteBufferPack(lengthIndex) {
		let writeBufferPacks = writeBufferPacks0[lengthIndex];
		if(writeBufferPacks == null)
			writeBufferPacks = writeBufferPacks0[lengthIndex] = [];
		if(writeBufferPacks.hasFree) {
			for(let i = writeBufferPacks.length - 1; i >= 0; i--) {
				const writeBufferPackRef = writeBufferPacks[i];
				const writeBufferPack = writeBufferPackRef.deref();
				if(writeBufferPack == null) {
					writeBufferPacks.splice(i, 1);
					continue;
				}
				if(writeBufferPack[1]) continue;
				writeBufferPack[1] = true;
				writeBufferPacks.splice(i, 1);
				writeBufferPacks.unshift(writeBufferPackRef);
				return writeBufferPack;
			}
		}
		writeBufferPacks.hasFree = false;
		const writeBufferPack = [Buffer.alloc(Math.pow(4, lengthIndex)), true];
		writeBufferPack[0].__pack__ = writeBufferPack;
		writeBufferPack[0].__free__ = () => {
			writeBufferPack[1] = false;
			writeBufferPacks.hasFree = true;
		};
		writeBufferPacks.unshift(new WeakRef(writeBufferPack));
		return writeBufferPack;
	}
	async function writeBytes(buffer, offset, length) {
		if(offset + length > buffer.length)
			throw new Error("Write offset+length must not exceed buffer length");
		if(closed)
			throw new Error("Socket closed");
		const startIndex = Math.floor(Math.log(length) / Math.log(4));
		const promises = [];
		for(let i = startIndex; i >= 0; i--) {
			const writeBufferLength = Math.pow(4, i);
			while(Math.floor(length / writeBufferLength) >= 1) {
				if(closed)
					throw new Error("Socket closed");
				const writeBufferPack = getWriteBufferPack(i);
				const writeBuffer = writeBufferPack[0];
				let onFinish; promises.push(new Promise(res => onFinish = res));
				buffer.copy(writeBuffer, 0, offset, offset + writeBufferLength);
				socket.write(writeBuffer, null, () => { onFinish(); writeBuffer.__free__(); });
				offset += writeBufferLength;
				length -= writeBufferLength;
			}
			if(length <= 0)
				return;
		}
		await Promise.all(promises);
	}
	const onClose = () => {
		closed = true;
		socket.off("error", onClose);
		socket.off("close", onClose);
	};
	socket.on("error", onClose);
	socket.on("close", onClose);
	return writeBytes;
}
exports.socketReader = socketReader;
exports.socketWriter = socketWriter;

class ImprovedSharedMutex {
	constructor(id) {
		this.mutex = new sharedMutex.shared_mutex(id);
		this.destroyed = false;
		this.locked = false;
		this.cleanup = () => { this.destroy(); };
	}
	__addExitHook() {
		process.addListener("exit", this.cleanup);
		process.addListener("SIGINT", this.cleanup);
		process.addListener("SIGUSR1", this.cleanup);
		process.addListener("SIGUSR2", this.cleanup);
	}
	__removeExitHook() {
		process.removeListener("exit", this.cleanup);
		process.removeListener("SIGINT", this.cleanup);
		process.removeListener("SIGUSR1", this.cleanup);
		process.removeListener("SIGUSR2", this.cleanup);
	}
	lock_blocking() {
		if(this.destroyed) throw new Error("Destroyed");
		this.mutex.lock_blocking();
		this.locked = true;
		this.__addExitHook();
	}
	async lock(signal) {
		let acquired = false;
		do {
			if(this.destroyed) throw new Error("Destroyed");
			signal?.throwIfAborted();
			acquired = this.mutex.try_lock();
			if(!acquired)
				await new Promise(res => setTimeout(res, 100));
		} while(!acquired);
		this.locked = true;
		this.__addExitHook();
	}
	try_lock() {
		if(this.destroyed) throw new Error("Destroyed");
		const result = this.mutex.try_lock();
		if(result) {
			this.locked = true;
			this.__addExitHook();
		}
		return result;
	}
	unlock() {
		if(this.destroyed) throw new Error("Destroyed");
		if(!this.locked) return;
		this.locked = false;
		this.__removeExitHook();
		this.mutex.unlock();
	}
	destroy() {
		if(this.destroyed) return;
		this.unlock();
		this.destroyed = true;
		this.mutex.destroy();
	}
}
exports.ImprovedSharedMutex = ImprovedSharedMutex;
