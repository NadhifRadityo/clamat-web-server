/* eslint-env browser, worker, serviceworker */
/// <reference lib="dom" />
/// <reference lib="webworker" />
/* global globalThis, Proxy */

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

const kAborted = Symbol("kAborted");
const kReason = Symbol("kReason");
function newAbortSignal(aborted = false, reason = undefined) {
	const signal = new EventTarget();
	Object.setPrototypeOf(signal, AbortSignal.prototype);
	Object.defineProperty(signal, "aborted", {
		get() { return signal[kAborted]; },
		configurable: true,
		enumerable: true
	});
	Object.defineProperty(signal, "reason", {
		get() { return signal[kReason]; },
		configurable: true,
		enumerable: true
	});
	let onAbort;
	Object.defineProperty(signal, "onabort", {
		get() { return onAbort; },
		set(v) {
			if(onAbort != null)
				signal.removeEventListener("abort", onAbort);
			onAbort = v;
			if(onAbort != null)
				signal.addEventListener("abort", onAbort);
		},
		configurable: true,
		enumerable: true
	});
	Object.defineProperty(signal, "throwIfAborted", {
		value: () => {
			if(!signal[kAborted]) return;
			throw signal[kReason];
		},
		writable: true,
		configurable: true,
		enumerable: true
	});
	signal[kAborted] = aborted;
	signal[kReason] = reason;
	return signal;
}
exports.kAborted = kAborted;
exports.kReason = kReason;
exports.newAbortSignal = newAbortSignal;

class PromiseMonitor {
	constructor(promise) {
		this.__state = "pending";
		this.__value = undefined;
		promise.then(
			v => { this.__state = "resolved"; this.__value = v; },
			e => { this.__state = "rejected"; this.__value = e; }
		);
	}
	get state() { return this.__state; }
	get value() { return this.__value; }
}
const PromiseMonitorTag = Symbol.for("PromiseMonitor");
const OriginalPromise = globalThis.Promise;
if(!OriginalPromise[PromiseMonitorTag]) {
	const prototypeFunction = original => function(...args) {
		if(!(this instanceof OverridePromise))
			throw new TypeError(`Method Promise.prototype.${original.name} called on incompatible receiver`);
		return new OverridePromise(original.call(this.__promise, ...args));
	};
	const staticFunction = original => function(...args) {
		return new OverridePromise(original.call(OriginalPromise, ...args));
	};
	const thenFunction = prototypeFunction(OriginalPromise.prototype.then);
	const catchFunction = prototypeFunction(OriginalPromise.prototype.catch);
	const finallyFunction = prototypeFunction(OriginalPromise.prototype.finally);
	// eslint-disable-next-line no-inner-declarations
	function OverridePromise(evaluator) {
		if(!(this instanceof OverridePromise))
			throw new TypeError("Class constructor Promise cannot be invoked without 'new'");
		if(!(evaluator instanceof OriginalPromise))
			this.__promise = new OriginalPromise(evaluator);
		else if(evaluator instanceof OverridePromise)
			return evaluator;
		else
			this.__promise = evaluator;
		this.__monitor = new PromiseMonitor(this.__promise);
		this.then = thenFunction;
		this.catch = catchFunction;
		this.finally = finallyFunction;
		return this;
	}
	OverridePromise.prototype = OriginalPromise.prototype;
	OverridePromise.all = staticFunction(OriginalPromise.all);
	OverridePromise.allSettled = staticFunction(OriginalPromise.allSettled);
	OverridePromise.any = staticFunction(OriginalPromise.any);
	OverridePromise.race = staticFunction(OriginalPromise.race);
	OverridePromise.reject = staticFunction(OriginalPromise.reject);
	OverridePromise.resolve = staticFunction(OriginalPromise.resolve);
	OverridePromise[PromiseMonitorTag] = true;
	globalThis.Promise = OverridePromise;
}
function inspectPromiseMonitor(promise) {
	const monitor = promise.__monitor;
	if(monitor == null || monitor.state == "pending")
		return { state: "pending" };
	return { state: monitor.state, value: monitor.value };
}
exports.inspectPromiseMonitor = inspectPromiseMonitor;

function isInDedicatedWorker() {
	// eslint-disable-next-line no-undef
	return typeof DedicatedWorkerGlobalScope != "undefined" && globalThis instanceof DedicatedWorkerGlobalScope;
}
function isInSharedWorker() {
	// eslint-disable-next-line no-undef
	return typeof SharedWorkerGlobalScope != "undefined" && globalThis instanceof SharedWorkerGlobalScope;
}
function isInServiceWorker() {
	// eslint-disable-next-line no-undef
	return typeof ServiceWorkerGlobalScope != "undefined" && globalThis instanceof ServiceWorkerGlobalScope;
}
function isInIframeWorker() {
	return !isInDedicatedWorker() && !isInSharedWorker() && !isInServiceWorker() &&
		globalThis.parent != null && (globalThis.location.href == "about:blank" || globalThis.location.pathname == "/_next/static/chunks/ipc-client-management.html");
}
function isInWorker() {
	return (
		(typeof WorkerGlobalScope != "undefined" && globalThis instanceof WorkerGlobalScope) ||
		isInDedicatedWorker() || isInSharedWorker() || isInServiceWorker() || isInIframeWorker()
	);
}
exports.isInDedicatedWorker = isInDedicatedWorker;
exports.isInSharedWorker = isInSharedWorker;
exports.isInServiceWorker = isInServiceWorker;
exports.isInIframeWorker = isInIframeWorker;
exports.isInWorker = isInWorker;

function getGlobalDedicatedWorkerAsPort() {
	if(!isInDedicatedWorker())
		throw new Error("Not in a dedicated worker");
	const result = {
		eventTarget: new EventTarget(),
		started: false,
		closed: false,
		__relayEvent: null,
		start() {
			if(this.started) return;
			this.started = true;
			this.__relayEvent = e => this.eventTarget.dispatchEvent(new e.constructor(e.type, e));
			globalThis.addEventListener("message", this.__relayEvent);
			globalThis.addEventListener("messageerror", this.__relayEvent);
			this.eventTarget.dispatchEvent(new StartEvent("start"));
		},
		close() {
			if(!this.started) return;
			if(this.closed) return;
			this.closed = true;
			globalThis.removeEventListener("message", this.__relayEvent);
			globalThis.removeEventListener("messageerror", this.__relayEvent);
			this.__relayEvent = null;
			this.eventTarget.dispatchEvent(new CloseEvent("close"));
		},
		addEventListener(name, listener, options) {
			this.eventTarget.addEventListener(name, listener, options);
		},
		removeEventListener(name, listener, options) {
			this.eventTarget.removeEventListener(name, listener, options);
		},
		postMessage(message, transferables) {
			if(!this.started) throw new Error("Not started");
			if(this.closed) throw new Error("Endpoint closed");
			globalThis.postMessage(message, transferables);
		},
		postMessageSync() {
			throw new Error("Synchronous calls are not supported natively in a worker");
		}
	};
	result.start();
	return result;
}
function getGlobalSharedWorkerAsPort() {
	if(!isInSharedWorker())
		throw new Error("Not in a shared worker");
	const result = {
		eventTarget: new EventTarget(),
		started: false,
		closed: false,
		__relayEvent: null,
		__onConnect: null,
		__connectedPorts: [],
		start() {
			if(this.started) return;
			this.started = true;
			this.__relayEvent = (port, e) => {
				const event = new e.constructor(e.type, e);
				Object.defineProperty(event, "port", {
					value: port,
					writable: false,
					enumerable: true,
					configurable: true
				});
				this.eventTarget.dispatchEvent(event);
			};
			this.__onConnect = e => {
				const port = e.ports[0];
				const mockupPort = {
					addEventListener: port.addEventListener.bind(port),
					removeEventListener: port.removeEventListener.bind(port),
					postMessage: (message, transferables) => {
						if(!this.started) throw new Error("Not started");
						if(this.closed) throw new Error("Endpoint closed");
						port.postMessage(message, transferables);
					},
					postMessageSync: () => {
						throw new Error("Synchronous calls are not supported natively in a worker");
					}
				};
				const __relayEvent = ev => this.__relayEvent(mockupPort, ev);
				this.__connectedPorts.push([port, __relayEvent]);
				port.addEventListener("message", __relayEvent);
				port.addEventListener("messageerror", __relayEvent);
				port.start();
				this.eventTarget.dispatchEvent(new CustomEvent("connect", { detail: port }));
			};
			globalThis.addEventListener("connect", this.__onConnect);
			this.eventTarget.dispatchEvent(new StartEvent("start"));
		},
		close() {
			if(!this.started) return;
			if(this.closed) return;
			this.closed = true;
			globalThis.removeEventListener("connect", this.__onConnect);
			for(const [port, __relayEvent] of this.__connectedPorts.splice(0)) {
				this.eventTarget.dispatchEvent(new CustomEvent("disconnect", { detail: port }));
				port.close();
				port.removeEventListener("message", __relayEvent);
				port.removeEventListener("messageerror", __relayEvent);
			}
			this.__onConnect = null;
			this.__relayEvent = null;
			this.eventTarget.dispatchEvent(new CloseEvent("close"));
		},
		addEventListener(name, listener, options) {
			this.eventTarget.addEventListener(name, listener, options);
		},
		removeEventListener(name, listener, options) {
			this.eventTarget.removeEventListener(name, listener, options);
		},
		postMessage(message, transferables) {
			if(!this.started) throw new Error("Not started");
			if(this.closed) throw new Error("Endpoint closed");
			// Just broadcast it. We don't use this channel that much anyway.
			for(const port of this.__connectedPorts)
				port.postMessage(message, transferables);
		},
		postMessageSync() {
			throw new Error("Synchronous calls are not supported natively in a worker");
		}
	};
	result.start();
	return result;
}
function getGlobalIframeWorkerAsPort() {
	if(!isInIframeWorker())
		throw new Error("Not in an iframe worker");
	const { port1: mainPort, port2 } = new MessageChannel();
	globalThis.parentPort = port2;
	const result = {
		eventTarget: new EventTarget(),
		started: false,
		closed: false,
		__relayEvent: null,
		__onClose: null,
		start() {
			if(this.started) return;
			this.started = true;
			this.__relayEvent = e => this.eventTarget.dispatchEvent(new e.constructor(e.type, e));
			this.__onClose = () => this.close();
			mainPort.addEventListener("message", this.__relayEvent);
			mainPort.addEventListener("messageerror", this.__relayEvent);
			mainPort.addEventListener("close", this.__onClose);
			mainPort.start();
			this.eventTarget.dispatchEvent(new StartEvent("start"));
		},
		close() {
			if(!this.started) return;
			if(this.closed) return;
			this.closed = true;
			mainPort.close();
			mainPort.removeEventListener("message", this.__relayEvent);
			mainPort.removeEventListener("messageerror", this.__relayEvent);
			mainPort.removeEventListener("close", this.__onClose);
			this.__onClose = null;
			this.__relayEvent = null;
			this.eventTarget.dispatchEvent(new CloseEvent("close"));
		},
		addEventListener(name, listener, options) {
			this.eventTarget.addEventListener(name, listener, options);
		},
		removeEventListener(name, listener, options) {
			this.eventTarget.removeEventListener(name, listener, options);
		},
		postMessage(message, transferables) {
			if(!this.started) throw new Error("Not started");
			if(this.closed) throw new Error("Endpoint closed");
			mainPort.postMessage(message, transferables);
		},
		postMessageSync() {
			throw new Error("Synchronous calls are not supported natively in a worker");
		}
	};
	result.start();
	return result;
}
exports.getGlobalDedicatedWorkerAsPort = getGlobalDedicatedWorkerAsPort;
exports.getGlobalSharedWorkerAsPort = getGlobalSharedWorkerAsPort;
exports.getGlobalIframeWorkerAsPort = getGlobalIframeWorkerAsPort;

/** @type <C>(spawnCallback: C) => Awaited<ReturnType<C>> & { exports: ReturnType<typeof Comlink.wrapEndpoint> } */
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
			spawnCallback()
				.then(v => { if(state != "pending") return; state = "resolved"; value = v; deferEndpoint.__onready(); })
				.catch(e => { if(state != "pending") return; state = "rejected"; value = e; deferEndpoint.__onready(); });
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

function socketReader(/** @type MessagePort */ socket) {
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
			outBuffer.set(buffer.slice(readBufferOffset, readBufferOffset + readLength), outBufferOffset + length - remainingLength);
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
		socket.removeEventListener("message", onData);
		socket.removeEventListener("messageerror", onClose);
		socket.removeEventListener("close", onClose);
	};
	const onData = event => {
		readBuffers.push(event.data);
		if(readUnlock != null)
			readUnlock();
	};
	socket.addEventListener("message", onData);
	socket.addEventListener("messageerror", onClose);
	socket.addEventListener("close", onClose);
	socket.start?.();
	return readBytes;
}
function socketWriter(/** @type MessagePort */ socket) {
	let closed = false;
	async function writeBytes(buffer, offset, length) {
		if(offset + length > buffer.length)
			throw new Error("Write offset+length must not exceed buffer length");
		if(closed)
			throw new Error("Socket closed");
		socket.postMessage(buffer.subarray(offset, offset + length));
	}
	const onClose = () => {
		closed = true;
		socket.removeEventListener("messageerror", onClose);
		socket.removeEventListener("close", onClose);
	};
	socket.addEventListener("messageerror", onClose);
	socket.addEventListener("close", onClose);
	socket.start?.();
	return writeBytes;
}
exports.socketReader = socketReader;
exports.socketWriter = socketWriter;
