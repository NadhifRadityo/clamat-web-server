/* eslint-env node, browser, worker, serviceworker */
/// <reference types="node" />
/// <reference lib="dom" />
/// <reference lib="webworker" />
/* global globalThis, Proxy */

const finalizerSymbol = Symbol.for("COMLINK_FINALIZER");
const endpointSymbol = Symbol.for("COMLINK_ENDPOINT");
const getSymbol = Symbol.for("COMLINK_GET");
const setSymbol = Symbol.for("COMLINK_SET");
const applySymbol = Symbol.for("COMLINK_APPLY");
const constructSymbol = Symbol.for("COMLINK_CONSTRUCT");
const createEndpointSymbol = Symbol.for("COMLINK_ENDPOINT_CREATE");
const releaseEndpointSymbol = Symbol.for("COMLINK_ENDPOINT_RELEASE");
const isEndpointClosedSymbol = Symbol.for("COMLINK_ENDPOINT_IS_CLOSED");
const asyncSymbol = Symbol.for("COMLINK_ASYNC");
const syncSymbol = Symbol.for("COMLINK_SYNC");
exports.finalizerSymbol = finalizerSymbol;
exports.endpointSymbol = endpointSymbol;
exports.getSymbol = getSymbol;
exports.setSymbol = setSymbol;
exports.applySymbol = applySymbol;
exports.constructSymbol = constructSymbol;
exports.createEndpointSymbol = createEndpointSymbol;
exports.releaseEndpointSymbol = releaseEndpointSymbol;
exports.isEndpointClosedSymbol = isEndpointClosedSymbol;
exports.asyncSymbol = asyncSymbol;
exports.syncSymbol = syncSymbol;

const TypedArray = Object.getPrototypeOf(Uint8Array);
const sharedObjects = (() => {
	if(global.__next_worker_comlink__ != null)
		return global.__next_worker_comlink__;
	return global.__next_worker_comlink__ = {};
})();

const transferCache = sharedObjects.transferCache || (sharedObjects.transferCache = new WeakSet());
/** @type <T>(t: T) => T */
function transfer(object) {
	if(object == null || (typeof object != "object" && typeof object != "function"))
		return object;
	transferCache.add(object);
	return object;
}
function findTransferable(object, checked = new Set(), transferables = new Set()) {
	if(object == null || (typeof object != "object" && typeof object != "function"))
		return transferables;
	if(checked.has(object))
		return transferables;
	checked.add(object);
	if(transferCache.has(object))
		transferables.add(object);
	const constructor = Object.getPrototypeOf(object)?.constructor;
	switch(constructor) {
		case Array:
		case Set: {
			for(const value of object)
				findTransferable(value, checked, transferables);
			break;
		}
		case Map: {
			for(const [key, value] of object) {
				findTransferable(key, checked, transferables);
				findTransferable(value, checked, transferables);
			}
			break;
		}
		case ArrayBuffer:
		case Buffer:
			break;
		case null:
		case Object:
		default: {
			if(object instanceof TypedArray) break;
			for(const value of Object.values(object))
				findTransferable(value, checked, transferables);
			break;
		}
	}
	return transferables;
}
exports.transferCache = transferCache;
exports.transfer = transfer;
exports.findTransferable = findTransferable;

function exposeEndpoint(object, endpoint) {
	const messageListener = e => {
		if(e == null || e.data == null || e.data.id == null) return;
		const { id, type, path, value, argumentList } = e.data;
		const objectParent = path?.slice(0, -1).reduce((current, key) => Reflect.get(current, key), object);
		const objectKey = path?.at(-1);
		(async () => {
			if(type == "GET")
				return Reflect.get(objectParent, objectKey);
			if(type == "SET")
				return Reflect.set(objectParent, objectKey, value);
			if(type == "APPLY") {
				const objectValue = objectKey != null ? Reflect.get(objectParent, objectKey) : objectParent;
				return Reflect.apply(objectValue, objectParent, argumentList);
			}
			if(type == "CONSTRUCT") {
				const objectValue = objectKey != null ? Reflect.get(objectParent, objectKey) : objectParent;
				const resultValue = Reflect.construct(objectValue, argumentList);
				transfer(resultValue);
				return resultValue;
			}
			if(type == "ENDPOINT") {
				const objectValue = objectKey != null ? Reflect.get(objectParent, objectKey) : objectParent;
				transfer(objectValue);
				return objectValue;
			}
			if(type == "RELEASE") {
				endpoint.close?.();
				endpoint.removeEventListener("message", messageListener);
				endpoint.removeEventListener("close", closeListener);
				object[finalizerSymbol]?.();
				return undefined;
			}
			throw new Error(`Unknown message type ${type}`);
		})()
			.then(returnValue => {
				endpoint.postMessage({
					id: id,
					type: "RETURN",
					value: returnValue
				}, [...findTransferable(returnValue)]);
			})
			.catch(throwValue => {
				endpoint.postMessage({
					id: id,
					type: "THROW",
					value: throwValue
				}, [...findTransferable(throwValue)]);
			});
	};
	const closeListener = () => {
		endpoint.removeEventListener("message", messageListener);
		endpoint.removeEventListener("close", closeListener);
		object[finalizerSymbol]?.();
	};
	endpoint.addEventListener("message", messageListener);
	endpoint.addEventListener("close", closeListener);
	endpoint.start?.();
}
exports.exposeEndpoint = exposeEndpoint;

const proxyCounter = sharedObjects.proxyCounter || (sharedObjects.proxyCounter = new WeakMap());
const proxyFinalizers = sharedObjects.proxyFinalizers || (sharedObjects.proxyFinalizers = new FinalizationRegistry(endpoint => {
	const newCount = (proxyCounter.get(endpoint) || 0) - 1;
	if(newCount > 0) {
		proxyCounter.set(endpoint, newCount);
		return;
	}
	proxyCounter.delete(endpoint);
	if(endpoint.closed) return;
	processMessage(
		requestResponseMessage(endpoint, false, {
			type: "RELEASE"
		}, [...findTransferable(null)]),
		(thrownObject, returnedObject) => {
			if(thrownObject != messageNoop && thrownObject?.message == "Endpoint closed" && endpoint.closed)
				return undefined;
			if(thrownObject != messageNoop) throw thrownObject;
			endpoint.close?.();
			return returnedObject;
		}
	);
}));
function registerProxy(proxy, endpoint) {
	const newCount = (proxyCounter.get(endpoint) || 0) + 1;
	proxyCounter.set(endpoint, newCount);
	proxyFinalizers.register(proxy, endpoint, proxy);
	if(newCount == 1)
		endpoint.start?.();
}

/*
get:
await wrapped.prop; ==> wrapped.{get}prop.{get}then.{apply}(); // promise
wrapped.prop.then(); ==> wrapped.{get}prop.{get}then.{apply}(); // promise
wrapped.prop.[sync]; ==> wrapped.{get}prop.{get}[sync]; // proxy
wrapped.prop.[sync].[get] ==> wrapped.{get}prop.{get}[sync].{get}[get]; // v
wrapped.prop.[async]; ==> wrapped.{get}prop.{get}[async]; // proxy
wrapped.prop.[async].[get] ==> wrapped.{get}prop.{get}[async].{get}[get]; // promise<v>
await wrapped.[sync].prop.[async]; ==> wrapped.{get}[sync].{get}prop.{get}[async].{get}then.{apply}(); // promise; sync is overriden with async

set:
wrapped.prop = v; ==> wrapped.{set}prop = v; (promise)
wrapped.prop.[sync] = v; ==> wrapped.{get}prop.{set}[sync] = v;
wrapped.prop.[sync].[set] = v; ==> wrapped.{get}prop.{get}[sync].{set}[set] = v; // the [set] is a noop. we implement it for consistency
wrapped.prop.[async] = v; ==> wrapped.{get}prop.{set}[async] = v;
wrapped.prop.[async].[set] = v; ==> wrapped.{get}prop.{get}[async].{set}[set] = v;
wrapped.[sync].prop = v; ==> wrapped.{get}[sync].{set}prop = v;

invalid:
wrapped.*.[set|apply|construct|endpoint|release].*; // direct symbols are meant to ensure direct invocation
wrapped.*.[releaseEndpoint].*; // releaseEndpoint must be invoked and directly accessed on first path
wrapped.*.[createEndpoint].*; // createEndpoint must be invoked and accessed on last path

wrapped.[sync].prop.then() => invokes function then() on property prop
wrapped.[async].prop.then() => gets property prop
wrapped.[async].prop.then.[apply]() => invokes function then() on property prop
*/

const messageNoop = Symbol("noop");
function processMessage(message, callback) {
	const cb = m => {
		const { type, value } = m;
		switch(type) {
			case "RETURN":
				return callback(messageNoop, value);
			case "THROW":
				return callback(value, messageNoop);
			default:
				return callback(new Error("Invalid comlink message"), messageNoop);
		}
	};
	if(message instanceof Promise)
		return message.then(m => cb(m)).catch(e => callback(e, messageNoop));
	return cb(message);
}
function wrapEndpoint(endpoint, sync = false, path = []) {
	const throwIfClosed = () => {
		if(!endpoint.closed) return;
		throw new Error("Endpoint closed");
	};
	const proxy = new Proxy(function target() {}, {
		get(_, property) {
			throwIfClosed();
			if(property == getSymbol) {
				return processMessage(
					requestResponseMessage(endpoint, sync, {
						type: "GET",
						path: path
					}, [...findTransferable(null)]),
					(thrownObject, returnedObject) => {
						if(thrownObject != messageNoop) throw thrownObject;
						return returnedObject;
					}
				);
			}
			if(property == setSymbol) throw new Error("Invalid getter property [set]");
			if(path.at(-1) == applySymbol) throw new Error("Invalid getter property [apply]");
			if(path.at(-1) == constructSymbol) throw new Error("Invalid getter property [construct]");
			if(path.at(-1) == createEndpointSymbol) throw new Error("Invalid getter property [createEndpoint]");
			if(path.at(-1) == releaseEndpointSymbol) throw new Error("Invalid getter property [releaseEndpoint]");
			if(path.at(-1) == isEndpointClosedSymbol) throw new Error("Invalid getter property [isEndpointClosed]");
			if(property == releaseEndpointSymbol && path.length > 0) throw new Error("[releaseEndpoint] must be called on first property");
			if(property == isEndpointClosedSymbol && path.length > 0) throw new Error("[isEndpointClosed] must be called on first property");
			if(property == finalizerSymbol) return Reflect.get(_, finalizerSymbol);
			if(property == endpointSymbol) return endpoint;
			if(property == "then" && path.length == 0) return { then: () => proxy };
			let appendPath = true;
			let syncMark = sync;
			if(property == asyncSymbol) {
				appendPath = false;
				syncMark = false;
			}
			if(property == syncSymbol) {
				appendPath = false;
				syncMark = true;
			}
			if(syncMark == sync && !appendPath) return proxy;
			return wrapEndpoint(endpoint, syncMark, appendPath ? [...path, property] : path);
		},
		set(_, property, value) {
			throwIfClosed();
			if(property == setSymbol) {
				return processMessage(
					requestResponseMessage(endpoint, sync, {
						type: "SET",
						path: path,
						value: value
					}, [...findTransferable(value)]),
					(thrownObject, returnedObject) => {
						if(thrownObject != messageNoop) throw thrownObject;
						return returnedObject;
					}
				);
			}
			if(property == getSymbol) throw new Error("Invalid setter property [get]");
			if(property == applySymbol) throw new Error("Invalid setter property [apply]");
			if(property == constructSymbol) throw new Error("Invalid setter property [construct]");
			if(property == createEndpointSymbol) throw new Error("Invalid setter property [createEndpoint]");
			if(property == releaseEndpointSymbol) throw new Error("Invalid setter property [releaseEndpoint]");
			if(property == isEndpointClosedSymbol) throw new Error("Invalid setter property [isEndpointClosed]");
			if(property == finalizerSymbol) return Reflect.set(_, finalizerSymbol, value);
			if(property == endpointSymbol) throw new Error("Invalid setter property [endpoint]");
			let appendPath = true;
			let syncMark = sync;
			if(property == asyncSymbol) {
				appendPath = false;
				syncMark = false;
			}
			if(property == syncSymbol) {
				appendPath = false;
				syncMark = true;
			}
			return processMessage(
				requestResponseMessage(endpoint, syncMark, {
					type: "SET",
					path: appendPath ? [...path, property] : path,
					value: value
				}, [...findTransferable(value)]),
				(thrownObject, returnedObject) => {
					if(thrownObject != messageNoop) throw thrownObject;
					return returnedObject;
				}
			);
		},
		apply(_, __, argumentList) {
			throwIfClosed();
			const property = path.at(-1);
			if(property == applySymbol) {
				return processMessage(
					requestResponseMessage(endpoint, sync, {
						type: "APPLY",
						path: path.slice(0, -1),
						argumentList: argumentList
					}, [...findTransferable(argumentList)]),
					(thrownObject, returnedObject) => {
						if(thrownObject != messageNoop) throw thrownObject;
						return returnedObject;
					}
				);
			}
			if(property == createEndpointSymbol) {
				return processMessage(
					requestResponseMessage(endpoint, sync, {
						type: "ENDPOINT",
						path: path.slice(0, -1)
					}, [...findTransferable(null)]),
					(thrownObject, returnedObject) => {
						if(thrownObject != messageNoop) throw thrownObject;
						return returnedObject;
					}
				);
			}
			if(property == releaseEndpointSymbol) {
				if(path.length > 1)
					throw new Error("[releaseEndpoint] must be called on first property");
				return processMessage(
					requestResponseMessage(endpoint, sync, {
						type: "RELEASE"
					}, [...findTransferable(null)]),
					(thrownObject, returnedObject) => {
						if(thrownObject != messageNoop) throw thrownObject;
						endpoint.close?.();
						return returnedObject;
					}
				);
			}
			if(property == isEndpointClosedSymbol) {
				if(path.length > 1)
					throw new Error("[isEndpointClosed] must be called on first property");
				return endpoint.closed;
			}
			if(property == "then" && !sync) {
				const resolve = argumentList[0];
				const reject = argumentList[1];
				return processMessage(
					requestResponseMessage(endpoint, false, {
						type: "GET",
						path: path.slice(0, -1)
					}, [...findTransferable(null)]),
					(thrownObject, returnedObject) => {
						if(thrownObject != messageNoop) {
							if(reject != null)
								reject(thrownObject);
							else
								throw thrownObject;
						}
						if(resolve != null)
							resolve(returnedObject);
						return returnedObject;
					}
				);
			}
			if(property == getSymbol) throw new Error("Invalid applier property [get]");
			if(property == setSymbol) throw new Error("Invalid applier property [set]");
			if(property == constructSymbol) throw new Error("Invalid applier property [construct]");
			if(property == finalizerSymbol) throw new Error("Invalid applier property [finalizer]");
			if(property == endpointSymbol) throw new Error("Invalid applier property [endpoint]");
			let appendPath = true;
			let syncMark = sync;
			if(property == asyncSymbol) {
				appendPath = false;
				syncMark = false;
			}
			if(property == syncSymbol) {
				appendPath = false;
				syncMark = true;
			}
			return processMessage(
				requestResponseMessage(endpoint, syncMark, {
					type: "APPLY",
					path: appendPath ? path : path.slice(0, -1),
					argumentList: argumentList
				}, [...findTransferable(argumentList)]),
				(thrownObject, returnedObject) => {
					if(thrownObject != messageNoop) throw thrownObject;
					return returnedObject;
				}
			);
		},
		construct(_, argumentList) {
			throwIfClosed();
			const property = path.at(-1);
			if(property == constructSymbol) {
				return processMessage(
					requestResponseMessage(endpoint, sync, {
						type: "CONSTRUCT",
						path: path.slice(0, -1),
						argumentList: argumentList
					}), [...findTransferable(argumentList)],
					(thrownObject, returnedObject) => {
						if(thrownObject != messageNoop) throw thrownObject;
						return wrapEndpoint(returnedObject);
					}
				);
			}
			if(property == getSymbol) throw new Error("Invalid constructor property [get]");
			if(property == setSymbol) throw new Error("Invalid constructor property [set]");
			if(property == applySymbol) throw new Error("Invalid constructor property [apply]");
			if(property == createEndpointSymbol) throw new Error("Invalid constructor property [createEndpoint]");
			if(property == releaseEndpointSymbol) throw new Error("Invalid constructor property [releaseEndpoint]");
			if(property == isEndpointClosedSymbol) throw new Error("Invalid constructor property [isEndpointClosed]");
			if(property == finalizerSymbol) throw new Error("Invalid constructor property [finalizer]");
			if(property == endpointSymbol) throw new Error("Invalid constructor property [endpoint]");
			let appendPath = true;
			let syncMark = sync;
			if(property == asyncSymbol) {
				appendPath = false;
				syncMark = false;
			}
			if(property == syncSymbol) {
				appendPath = false;
				syncMark = true;
			}
			return processMessage(
				requestResponseMessage(endpoint, syncMark, {
					type: "CONSTRUCT",
					path: appendPath ? path : path.slice(0, -1),
					argumentList: argumentList
				}), [...findTransferable(argumentList)],
				(thrownObject, returnedObject) => {
					if(thrownObject != messageNoop) throw thrownObject;
					return wrapEndpoint(returnedObject);
				}
			);
		}
	});
	registerProxy(proxy, endpoint);
	return proxy;
}
exports.wrapEndpoint = wrapEndpoint;

function isProxyClosed(proxy) {
	return proxy[isEndpointClosedSymbol]();
}
exports.isProxyClosed = isProxyClosed;

function requestResponseMessage(endpoint, sync, message, transferables) {
	const id = generateID();
	const endpointClosedError = new Error("Endpoint closed");
	if(sync) {
		if(endpoint.closed) throw endpointClosedError;
		endpoint.start?.();
		return endpoint.postMessageSync({ ...message, id: id }, transferables);
	}
	let messageListener;
	let closeListener;
	return new Promise((resolve, reject) => {
		if(endpoint.closed) {
			reject(endpointClosedError);
			return;
		}
		messageListener = e => {
			if(e == null || e.data == null || e.data.id != id) return;
			resolve(e.data);
		};
		closeListener = () => {
			reject(endpointClosedError);
		};
		endpoint.start?.();
		endpoint.addEventListener("message", messageListener);
		endpoint.addEventListener("close", closeListener);
		endpoint.postMessage({ ...message, id: id }, transferables);
	}).finally(() => {
		endpoint.removeEventListener("message", messageListener);
		endpoint.removeEventListener("close", closeListener);
	});
}
function generateID() {
	return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
}
