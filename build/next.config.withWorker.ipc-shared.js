/* eslint-env node, browser, worker, serviceworker */
/// <reference types="node" />
/// <reference lib="dom" />
/// <reference lib="webworker" />
/* global globalThis */

/* eslint-disable camelcase */
/* eslint-disable no-param-reassign */

const Log = require("next/dist/build/output/log.js");
const utfz = require("utfz-lib");
const TypedArray = Object.getPrototypeOf(Uint8Array);
const TypedArrayInherits = [
	Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array,
	Int32Array, Uint32Array, Float32Array, Float64Array, BigInt64Array, BigUint64Array
];

const OriginalMessageChannel = globalThis.MessageChannel;
function MessageChannel() {
	if(!(this instanceof MessageChannel))
		return new MessageChannel();
	const { port1, port2 } = this.__message_channel__ = new OriginalMessageChannel();
	MessageChannel.overridePortMethods(port1);
	MessageChannel.overridePortMethods(port2);
	port1.start();
	port2.start();
	port1.__channel__ = this;
	port1.__sibling__ = port2;
	port2.__channel__ = this;
	port2.__sibling__ = port1;
	return { port1, port2 };
}
MessageChannel.overridePortMethods = port => {
	const originalStart = port.start.bind(port);
	const originalClose = port.close.bind(port);
	Object.defineProperty(port, "started", {
		value: false,
		writable: false,
		enumerable: true,
		configurable: true
	});
	Object.defineProperty(port, "closed", {
		value: false,
		writable: false,
		enumerable: true,
		configurable: true
	});
	port.start = () => {
		if(port.started) return;
		Object.defineProperty(port, "started", {
			value: true,
			writable: false,
			enumerable: true,
			configurable: true
		});
		port.dispatchEvent(new (globalThis.StartEvent || StartEvent)("start"));
		port.addEventListener("messageerror", () => port.close());
		originalStart();
	};
	port.close = () => {
		if(!port.started) return;
		if(port.closed) return;
		Object.defineProperty(port, "closed", {
			value: true,
			writable: false,
			enumerable: true,
			configurable: true
		});
		port.dispatchEvent(new (globalThis.CloseEvent || CloseEvent)("close"));
		originalClose();
	};
};
exports.MessageChannel = MessageChannel;

const OriginalEventTarget = globalThis.EventTarget;
class EventTarget extends OriginalEventTarget {
	constructor() {
		super();
		this.__registries = new Map();
	}
	addEventListener(type, callback, options) {
		let registry = this.__registries.get(type);
		if(registry == null) {
			registry = [];
			this.__registries.set(type, registry);
		}
		const index = registry.findIndex(([c]) => c == callback);
		if(index != -1) registry[index][1] = options;
		else registry.push([callback, options]);
		return super.addEventListener(type, callback, options);
	}
	removeEventListener(type, callback, options) {
		const registry = this.__registries.get(type);
		const index = registry == null ? -1 : registry.findIndex(([c]) => c == callback);
		if(index != -1) {
			registry.splice(index, 1);
			if(registry.length == 0)
				this.__registries.delete(type);
		}
		return super.removeEventListener(type, callback, options);
	}
	getEventListeners(type) {
		if(type == null)
			return [...this.__registries.values()].map(r => r.map(([c]) => c)).flat();
		const registry = this.__registries.get(type);
		if(registry == null) return [];
		return registry.map(([c]) => c);
	}
	hasEventListener(type, callback) {
		if(typeof type == "function") {
			callback = type;
			type = null;
		}
		if(type == null)
			return [...this.__registries.values()].some(r => r.some(([c]) => c == callback));
		const registry = this.__registries.get(type);
		if(registry == null) return false;
		return registry.some(([c]) => c == callback);
	}
}
exports.EventTarget = EventTarget;

class StartEvent extends Event {
	constructor(type, eventInitDict = undefined) {
		eventInitDict = {
			...eventInitDict
		};
		super(type, eventInitDict);
	}
}
exports.StartEvent = StartEvent;

class CloseEvent extends Event {
	constructor(type, eventInitDict = undefined) {
		eventInitDict = {
			...eventInitDict
		};
		super(type, eventInitDict);
	}
}
exports.CloseEvent = CloseEvent;

class MessageEvent extends Event {
	constructor(type, eventInitDict = undefined) {
		eventInitDict = {
			data: undefined,
			...eventInitDict
		};
		super(type, eventInitDict);
		Object.defineProperty(this, "data", {
			value: eventInitDict.data,
			writable: false,
			enumerable: true,
			configurable: true
		});
	}
}
exports.MessageEvent = MessageEvent;

class PayloadIncomingEvent extends Event {
	constructor(type, eventInitDict = undefined) {
		eventInitDict = {
			cancelable: true,
			data: undefined,
			...eventInitDict
		};
		super(type, eventInitDict);
		Object.defineProperty(this, "data", {
			value: eventInitDict.data,
			writable: false,
			enumerable: true,
			configurable: true
		});
	}
}
exports.PayloadIncomingEvent = PayloadIncomingEvent;

class PayloadOutgoingEvent extends Event {
	constructor(type, eventInitDict = undefined) {
		eventInitDict = {
			cancelable: true,
			data: undefined,
			...eventInitDict
		};
		super(type, eventInitDict);
		Object.defineProperty(this, "data", {
			value: eventInitDict.data,
			writable: false,
			enumerable: true,
			configurable: true
		});
	}
}
exports.PayloadOutgoingEvent = PayloadOutgoingEvent;

class ReleasedEvent extends Event {
	constructor(type, eventInitDict = undefined) {
		eventInitDict = {
			heldValue: undefined,
			...eventInitDict
		};
		super(type, eventInitDict);
		Object.defineProperty(this, "heldValue", {
			value: eventInitDict.heldValue,
			writable: false,
			enumerable: true,
			configurable: true
		});
	}
}
function newFinalizationRegistry() {
	const eventTarget = new EventTarget();
	const finalizationRegistry = new FinalizationRegistry(heldValue => {
		eventTarget.dispatchEvent(new ReleasedEvent("released", { heldValue: heldValue }));
	});
	finalizationRegistry.addEventListener = eventTarget.addEventListener.bind(eventTarget);
	finalizationRegistry.removeEventListener = eventTarget.removeEventListener.bind(eventTarget);
	finalizationRegistry.dispatchEvent = eventTarget.dispatchEvent.bind(eventTarget);
	return finalizationRegistry;
}
exports.ReleasedEvent = ReleasedEvent;
exports.newFinalizationRegistry = newFinalizationRegistry;

function formatBytes(bytes, decimals = 2) {
	bytes = parseFloat(bytes) || 0;
	const sizes = ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"];
	const i = Math.max(0, Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(1024))));
	return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(decimals))}${sizes[i]}`;
}
exports.formatBytes = formatBytes;

function newLogger(name, extend = null) {
	if(extend != null)
		name = `${extend.name}-${name}`;
	return {
		name: name,
		wait: (...args) => Log.wait(name, ...args),
		error: (...args) => Log.error(name, ...args),
		warn: (...args) => Log.warn(name, ...args),
		ready: (...args) => Log.ready(name, ...args),
		info: (...args) => Log.info(name, ...args),
		event: (...args) => Log.event(name, ...args),
		trace: (...args) => Log.trace(name, ...args)
	};
}
exports.newLogger = newLogger;

function newTempBuffer() {
	let tempBufferRef = new WeakRef(Buffer.alloc(1024));
	return function getTempBuffer(size) {
		let tempBuffer = tempBufferRef.deref();
		if(tempBuffer == null || tempBuffer.length < size) {
			tempBuffer = Buffer.alloc(size);
			tempBufferRef = new WeakRef(tempBuffer);
		}
		return tempBuffer;
	};
}
exports.newTempBuffer = newTempBuffer;

function bufferEndpoint(endpoint) {
	let intercept = false;
	const events = [];
	const payloadIncomingListener = e => {
		if(!intercept) return;
		e.preventDefault();
		e.stopPropagation();
		events.push(e);
	};
	const closeListener = () => {
		endpoint.removeEventListener("payloadincoming", payloadIncomingListener);
		endpoint.removeEventListener("close", closeListener);
		events.splice(0);
	};
	endpoint.addEventListener("payloadincoming", payloadIncomingListener);
	endpoint.addEventListener("close", closeListener);
	endpoint.start?.();
	return value => {
		if(value) {
			intercept = true;
			return;
		}
		intercept = false;
		let event;
		while((event = events.pop()) != null)
			endpoint.eventTarget.dispatchEvent(new event.constructor(event.type, event));
	};
}
exports.bufferEndpoint = bufferEndpoint;

const IPC_TYPES = {
	get: 0,
	set: 1,
	apply: 2,
	construct: 3,
	enpoint: 4,
	release: 5,
	return: 6,
	throw: 7,
	port: 8,
	portClose: 9
};
const IPC_BUILTIN_CONSTRUCTORS = context => [
	{
		code: 10,
		canHandle: item => item instanceof MessagePort && (context.currentTransferables != null ? context.currentTransferables.includes(item) : false),
		args: item => context.transferMessagePort(item, true),
		build: arg => context.transferMessagePort(arg, false)
	},
	{
		code: 11,
		canHandle: item => item instanceof AbortSignal && (context.currentTransferables != null ? context.currentTransferables.includes(item) : false),
		args: item => context.transferAbortSignal(item, true),
		build: arg => context.transferAbortSignal(arg, false)
	},
	{
		code: 12,
		canHandle: item => item instanceof Promise && (context.currentTransferables != null ? context.currentTransferables.includes(item) : false),
		args: item => context.transferPromise(item, true),
		build: arg => context.transferPromise(arg, false)
	},
	{
		code: 13,
		canHandle: item => (context.currentTransferables != null ? context.currentTransferables.includes(item) : false),
		args: item => context.transferObject(item, true),
		build: arg => context.transferObject(arg, false)
	},
	{
		// Default to null if a value is not serializable
		code: 0,
		canHandle: () => true,
		args: () => null,
		build: () => null
	}
];

function decompressComlinkMessage(packet) {
	const [id, type] = packet.splice(0, 2);
	const message = { id: id };
	switch(type) {
		case IPC_TYPES.get: {
			message.type = "GET";
			message.path = packet;
			break;
		}
		case IPC_TYPES.set: {
			message.type = "SET";
			const pathLength = packet.splice(0, 1)[0];
			if(pathLength >= 0) {
				message.path = packet.splice(0, pathLength);
				message.value = packet;
			} else {
				message.path = packet.slice(0, -1);
				message.value = packet[packet.length - 1];
			}
			break;
		}
		case IPC_TYPES.apply: {
			message.type = "APPLY";
			const pathLength = packet.splice(0, 1)[0];
			message.path = packet.splice(0, pathLength);
			message.argumentList = packet;
			break;
		}
		case IPC_TYPES.construct: {
			message.type = "CONSTRUCT";
			const pathLength = packet.splice(0, 1)[0];
			message.path = packet.splice(0, pathLength);
			message.argumentList = packet;
			break;
		}
		case IPC_TYPES.enpoint: {
			message.type = "ENDPOINT";
			message.path = packet;
			break;
		}
		case IPC_TYPES.release: {
			message.type = "RELEASE";
			break;
		}
		case IPC_TYPES.return: {
			message.type = "RETURN";
			const valueType = packet.splice(0, 1)[0];
			if(valueType == 0)
				message.value = packet;
			else
				message.value = packet[0];
			break;
		}
		case IPC_TYPES.throw: {
			message.type = "THROW";
			message.value = packet[0];
			break;
		}
		case IPC_TYPES.port: {
			message.type = "PORT";
			message.portId = packet[0];
			const valueType = packet.splice(0, 2)[1];
			if(valueType == 0)
				message.value = packet;
			else
				message.value = packet[0];
			break;
		}
		case IPC_TYPES.portClose: {
			message.type = "PORT_CLOSE";
			message.portId = packet[0];
			break;
		}
		default:
			throw new Error(`Unknown payload type id ${type}`);
	}
	return message;
}
function compressComlinkMessage(packet) {
	const message = [];
	const id = packet.id;
	const type = packet.type;
	message.push(id);
	switch(type) {
		case "GET": {
			message.push(IPC_TYPES.get);
			message.push(...packet.path);
			break;
		}
		case "SET": {
			message.push(IPC_TYPES.set);
			if(packet.value instanceof Array) {
				message.push(packet.path.length);
				message.push(...packet.path);
				message.push(...packet.value);
			} else {
				message.push(-1);
				message.push(...packet.path);
				message.push(packet.value);
			}
			break;
		}
		case "APPLY": {
			message.push(IPC_TYPES.apply);
			message.push(packet.path.length);
			message.push(...packet.path);
			message.push(...packet.argumentList);
			break;
		}
		case "CONSTRUCT": {
			message.push(IPC_TYPES.construct);
			message.push(packet.path.length);
			message.push(...packet.path);
			message.push(...packet.argumentList);
			break;
		}
		case "ENDPOINT": {
			message.push(IPC_TYPES.enpoint);
			message.push(...packet.path);
			break;
		}
		case "RELEASE": {
			message.push(IPC_TYPES.release);
			break;
		}
		case "RETURN": {
			message.push(IPC_TYPES.return);
			if(packet.value instanceof Array) {
				message.push(0);
				message.push(...packet.value);
			} else {
				message.push(1);
				message.push(packet.value);
			}
			break;
		}
		case "THROW": {
			message.push(IPC_TYPES.throw);
			message.push(packet.value);
			break;
		}
		case "PORT": {
			message.push(IPC_TYPES.port);
			message.push(packet.portId);
			if(packet.value instanceof Array) {
				message.push(0);
				message.push(...packet.value);
			} else {
				message.push(1);
				message.push(packet.value);
			}
			break;
		}
		case "PORT_CLOSE": {
			message.push(IPC_TYPES.portClose);
			message.push(packet.portId);
			break;
		}
		default:
			throw new Error(`Unknown payload type ${type}`);
	}
	return message;
}
exports.decompressComlinkMessage = decompressComlinkMessage;
exports.compressComlinkMessage = compressComlinkMessage;

function newReader(context) {
	const desia = new DeSia({
		constructors: [...SIA_BUILTIN_CONSTRUCTORS, ...IPC_BUILTIN_CONSTRUCTORS(context)]
	});
	function readPacket(buffer) {
		return desia.deserialize(buffer);
	}
	readPacket.desia = desia;
	return readPacket;
}
function newWriter(context) {
	const sia = new Sia({
		constructors: [...SIA_BUILTIN_CONSTRUCTORS, ...IPC_BUILTIN_CONSTRUCTORS(context)]
	});
	function writePacket(packet, transferables) {
		const oldTransferrable = context.currentTransferables;
		context.currentTransferables = transferables;
		try {
			return sia.serialize(packet);
		} finally {
			context.currentTransferables = oldTransferrable;
		}
	}
	writePacket.sia = sia;
	return writePacket;
}
exports.newReader = newReader;
exports.newWriter = newWriter;

const SIA_TYPES = {
	null: 0,
	undefined: 1,
	uint8: 2,
	uint16: 3,
	uint32: 4,
	uint64: 5,
	uint128: 6,
	uintn: 7,
	int8: 8,
	int16: 9,
	int32: 10,
	int64: 11,
	int128: 12,
	intn: 13,
	float8: 14, // Not Implemented
	float16: 15, // Not Implemented
	float32: 16,
	float64: 17,
	float128: 18, // Not Implemented
	floatn: 19, // Not Implemented
	record: 20,
	refValue: 58,
	ref8: 21,
	ref16: 22,
	ref32: 23,
	ref64: 24,
	ref128: 25,
	refn: 26,
	utfz: 27,
	string8: 28,
	string16: 29,
	string32: 30,
	string64: 31,
	string128: 32,
	stringn: 33, // Not Implemented
	bin8: 34,
	bin16: 35,
	bin32: 36,
	bin64: 37,
	bin128: 38,
	binn: 39,
	true: 40,
	false: 41,
	date: 42,
	date64: 43,
	constructor8: 44,
	constructor16: 45,
	constructor32: 46,
	array8: 47,
	array16: 48,
	array32: 49,
	array64: 50,
	array128: 51,
	arrayn: 52,
	objectStart: 53,
	objectEnd: 54,
	setStart: 55,
	setEnd: 56,
	mapStart: 57,
	mapEnd: 58
};
const SIA_BUILTIN_CONSTRUCTORS = [
	// Code 0 is a special type, its purpose is to catch-all
	// non-serializable value and replace it with desired value.
	{
		code: 1,
		canHandle: item => item instanceof RegExp,
		args: item => [item.source, item.flags],
		build: ([source, flags]) => new RegExp(source, flags)
	},
	{
		code: 2,
		canHandle: item => item instanceof Error,
		args: item => [item.name, item.message, item.stack],
		build: ([name, message, stack]) => Object.assign(new Error(message), { name, message, stack })
	},
	{
		code: 3,
		canHandle: (item, constructor) => item instanceof TypedArray && TypedArrayInherits.includes(constructor),
		args: item => [TypedArrayInherits.indexOf(Object.getPrototypeOf(item)?.constructor), Buffer.from(item.buffer.slice(item.byteOffset, item.byteOffset + item.byteLength))],
		build: ([type, buffer]) => new TypedArrayInherits[type](buffer)
	},
	{
		code: 4,
		canHandle: item => item instanceof DataView,
		args: item => Buffer.from(item.buffer.slice(item.byteOffset, item.byteOffset + item.byteLength)),
		build: buffer => new DataView(buffer)
	},
	{
		code: 5,
		canHandle: item => item instanceof ArrayBuffer,
		args: item => Buffer.from(item),
		build: buffer => (new Uint8Array(buffer)).buffer
	}
];

class Sia {
	constructor({ size = 33554432, constructors = SIA_BUILTIN_CONSTRUCTORS } = {}) {
		this.offset = 0;
		this.buffer = Buffer.alloc(size);
		this.constructors = constructors;
		this.refs = new Map();
		this.refCount = 0;
	}
	reset() {
		this.offset = 0;
		this.refs.clear();
		this.refCount = 0;
	}
	writeUInt8(number) {
		this.buffer[this.offset] = number;
		this.offset += 1;
	}
	writeUInt16(number) {
		this.buffer[this.offset] = number & 0xff;
		this.buffer[this.offset + 1] = number >> 8;
		this.offset += 2;
	}
	writeUInt32(number) {
		this.buffer.writeUInt32LE(number, this.offset);
		this.offset += 4;
	}
	writeUInt64(number) {
		this.buffer.writeBigUInt64LE(number, this.offset);
		this.offset += 8;
	}
	writeUInt128(number) {
		this.buffer.writeBigUInt64LE(number & 0xffffffffffffffffn);
		this.buffer.writeBigUInt64LE((number >> 64n) & 0xffffffffffffffffn);
		this.offset += 16;
	}
	writeUIntN(number) {
		const bytes = [];
		while(number != 0) {
			bytes.push(Number(number & 0xffn));
			number >>= 8n;
		}
		this.writeUInt8(bytes.length);
		for(const byte of bytes)
			this.writeUInt8(byte);
	}
	writeInt8(number) {
		this.buffer.writeInt8(number, this.offset);
		this.offset += 1;
	}
	writeInt16(number) {
		this.buffer.writeInt16LE(number, this.offset);
		this.offset += 2;
	}
	writeInt32(number) {
		this.buffer.writeInt32LE(number, this.offset);
		this.offset += 4;
	}
	writeInt64(number) {
		this.buffer.writeBigInt64LE(number, this.offset);
		this.offset += 8;
	}
	writeInt128(number) {
		this.writeUInt128(number);
	}
	writeIntN(number) {
		this.writeUIntN(number);
	}
	writeFloat32(number) {
		this.buffer.writeFloatLE(number, this.offset);
		this.offset += 4;
	}
	writeFloat64(number) {
		this.buffer.writeDoubleLE(number, this.offset);
		this.offset += 8;
	}
	writeString(str, offset) {
		return this.buffer.write(str, offset, "utf8");
	}
	writeInteger(number) {
		if(number >= 0) {
			if(number <= 0xff) {
				this.writeUInt8(SIA_TYPES.uint8);
				this.writeUInt8(number);
			} else if(number <= 0xffff) {
				this.writeUInt8(SIA_TYPES.uint16);
				this.writeUInt16(number);
			} else if(number <= 0xffffffff) {
				this.writeUInt8(SIA_TYPES.uint32);
				this.writeUInt32(number);
			} else
				this.writeFloat(number);
		} else {
			if(number >= -0x80) {
				this.writeUInt8(SIA_TYPES.int8);
				this.writeInt8(number);
			} else if(number >= -0x8000) {
				this.writeUInt8(SIA_TYPES.int16);
				this.writeInt16(number);
			} else if(number >= -0x80000000) {
				this.writeUInt8(SIA_TYPES.int32);
				this.writeInt32(number);
			} else
				this.writeFloat(number);
		}
	}
	writeBigInt(number) {
		if(number >= 0n) {
			if(number <= 0xffffffffffffffffn) {
				this.writeUInt8(SIA_TYPES.uint64);
				this.writeUInt64(number);
			} else if(number <= 0xffffffffffffffffffffffffffffffffn) {
				this.writeUInt8(SIA_TYPES.uint128);
				this.writeUInt128(number);
			} else {
				this.writeUInt8(SIA_TYPES.uintn);
				this.writeUIntN(number);
			}
		} else {
			if(number >= -0x8000000000000000n) {
				this.writeUInt8(SIA_TYPES.int64);
				this.writeInt64(number);
			} else if(number >= -0x80000000000000000000000000000000n) {
				this.writeUInt8(SIA_TYPES.int128);
				this.writeInt128(number);
			} else {
				this.writeUInt8(SIA_TYPES.intn);
				this.writeIntN(number);
			}
		}
	}
	writeFloat(number) {
		if(isNaN(number) || !isFinite(number) || number == Math.fround(number)) {
			this.writeUInt8(SIA_TYPES.float32);
			this.writeFloat32(number);
		} else {
			this.writeUInt8(SIA_TYPES.float64);
			this.writeFloat64(number);
		}
	}
	writeRef(ref) {
		if(ref <= 0xff) {
			this.writeUInt8(SIA_TYPES.ref8);
			this.writeUInt8(ref);
		} else if(ref <= 0xffff) {
			this.writeUInt8(SIA_TYPES.ref16);
			this.writeUInt16(ref);
		} else if(ref <= 0xffffffff) {
			this.writeUInt8(SIA_TYPES.ref32);
			this.writeUInt32(ref);
		} else if(ref <= 0xffffffffffffffffn) {
			this.writeUInt8(SIA_TYPES.ref64);
			this.writeUInt64(ref);
		} else if(ref <= 0xffffffffffffffffffffffffffffffffn) {
			this.writeUInt8(SIA_TYPES.ref128);
			this.writeUInt128(ref);
		} else {
			this.writeUInt8(SIA_TYPES.refn);
			this.writeUIntN(ref);
		}
	}
	serializeItem(item) {
		const type = typeof item;
		switch(type) {
			case "undefined": {
				this.writeUInt8(SIA_TYPES.undefined);
				return;
			}
			case "boolean": {
				const bool = item;
				this.writeUInt8(bool ? SIA_TYPES.true : SIA_TYPES.false);
				return;
			}
			case "number": {
				const number = item;
				if(Number.isInteger(number))
					this.writeInteger(number);
				else this.writeFloat(number);
				return;
			}
			case "bigint": {
				const number = item;
				this.writeBigInt(number);
				return;
			}
			case "string": {
				const string = item;
				const ref = this.refs.get(string);
				if(ref != null) { this.writeRef(ref); return; }
				this.refs.set(string, this.refCount++);
				const length = string.length;
				if(length < 60) {
					this.writeUInt8(SIA_TYPES.utfz);
					const byteLength = utfz.pack(string, length, this.buffer, this.offset + 1);
					this.writeUInt8(byteLength);
					this.offset += byteLength;
					return;
				}
				const maxBytes = length * 3;
				if(maxBytes <= 0xff) {
					this.writeUInt8(SIA_TYPES.string8);
					const byteLength = this.writeString(string, this.offset + 1);
					this.writeUInt8(byteLength);
					this.offset += byteLength;
				} else if(maxBytes <= 0xffff) {
					this.writeUInt8(SIA_TYPES.string16);
					const byteLength = this.writeString(string, this.offset + 2);
					this.writeUInt16(byteLength);
					this.offset += byteLength;
				} else if(maxBytes <= 0xffffffff) {
					this.writeUInt8(SIA_TYPES.string32);
					const byteLength = this.writeString(string, this.offset + 4);
					this.writeUInt32(byteLength);
					this.offset += byteLength;
				} else if(maxBytes <= 0xffffffffffffffffn) {
					this.writeUInt8(SIA_TYPES.string64);
					const byteLength = this.writeString(string, this.offset + 8);
					this.writeUInt64(byteLength);
					this.offset += byteLength;
				} else if(maxBytes <= 0xffffffffffffffffffffffffffffffffn) {
					this.writeUInt8(SIA_TYPES.string128);
					const byteLength = this.writeString(string, this.offset + 16);
					this.writeUInt128(byteLength);
					this.offset += byteLength;
				} else
					throw new Error(`String size ${maxBytes} is too big`);
				return;
			}
			case "function":
			case "symbol":
			case "object": {
				if(item === null) {
					this.writeUInt8(SIA_TYPES.null);
					return;
				}
				const constructor = Object.getPrototypeOf(item)?.constructor;
				const isConstructorBuiltin =
					constructor == null || constructor == Object || constructor == Array ||
					constructor == Set || constructor == Map || constructor == Buffer ||
					constructor == Date;
				for(const entry of this.constructors) {
					if(!entry.canHandle(item, constructor)) continue;
					if(entry.code == 0 && isConstructorBuiltin) continue;
					const ref = this.refs.get(item);
					if(ref != null) { this.writeRef(ref); return; }
					this.refs.set(item, this.refCount++);
					const code = entry.code;
					const args = entry.args(item);
					if(code <= 0xff) {
						this.writeUInt8(SIA_TYPES.constructor8);
						this.writeUInt8(code);
					} else if(code <= 0xffff) {
						this.writeUInt8(SIA_TYPES.constructor16);
						this.writeUInt16(code);
					} else if(code <= 0xffffffff) {
						this.writeUInt8(SIA_TYPES.constructor32);
						this.writeUInt32(code);
					} else
						throw new Error(`Code ${code} too big for a constructor`);
					this.serializeItem(args);
					return;
				}
				switch(constructor) {
					case null:
					case Object: {
						const object = item;
						const ref = this.refs.get(object);
						if(ref != null) { this.writeRef(ref); return; }
						this.refs.set(object, this.refCount++);
						this.writeUInt8(SIA_TYPES.objectStart);
						for(const key in object) {
							this.serializeItem(key);
							this.serializeItem(object[key]);
						}
						this.writeUInt8(SIA_TYPES.objectEnd);
						return;
					}
					case Array: {
						const array = item;
						const ref = this.refs.get(array);
						if(ref != null) { this.writeRef(ref); return; }
						this.refs.set(array, this.refCount++);
						const length = array.length;
						if(length <= 0xff) {
							this.writeUInt8(SIA_TYPES.array8);
							this.writeUInt8(length);
						} else if(length <= 0xffff) {
							this.writeUInt8(SIA_TYPES.array16);
							this.writeUInt16(length);
						} else if(length <= 0xffffffff) {
							this.writeUInt8(SIA_TYPES.array32);
							this.writeUInt32(length);
						} else if(length <= 0xffffffffffffffffn) {
							this.writeUInt8(SIA_TYPES.array64);
							this.writeUInt64(length);
						} else if(length <= 0xffffffffffffffffffffffffffffffffn) {
							this.writeUInt8(SIA_TYPES.array128);
							this.writeUInt128(length);
						} else {
							this.writeUInt8(SIA_TYPES.arrayn);
							this.writeUIntN(length);
						}
						for(const member of array)
							this.serializeItem(member);
						return;
					}
					case Set: {
						const set = item;
						const ref = this.refs.get(set);
						if(ref != null) { this.writeRef(ref); return; }
						this.refs.set(set, this.refCount++);
						this.writeUInt8(SIA_TYPES.setStart);
						for(const member of set)
							this.serializeItem(member);
						this.writeUInt8(SIA_TYPES.setEnd);
						return;
					}
					case Map: {
						const map = item;
						const ref = this.refs.get(map);
						if(ref != null) { this.writeRef(ref); return; }
						this.refs.set(map, this.refCount++);
						this.writeUInt8(SIA_TYPES.mapStart);
						for(const [key, value] of map) {
							this.serializeItem(key);
							this.serializeItem(value);
						}
						this.writeUInt8(SIA_TYPES.mapEnd);
						return;
					}
					case Buffer: {
						const buffer = item;
						const ref = this.refs.get(buffer);
						if(ref != null) { this.writeRef(ref); return; }
						this.refs.set(buffer, this.refCount++);
						const length = buffer.length;
						if(buffer.length <= 0xff) {
							this.writeUInt8(SIA_TYPES.bin8);
							this.writeUInt8(length);
							buffer.copy(this.buffer, this.offset);
							this.offset += length;
						} else if(buffer.length <= 0xffff) {
							this.writeUInt8(SIA_TYPES.bin16);
							this.writeUInt16(length);
							buffer.copy(this.buffer, this.offset);
							this.offset += length;
						} else if(buffer.length <= 0xffffffff) {
							this.writeUInt8(SIA_TYPES.bin32);
							this.writeUInt32(length);
							buffer.copy(this.buffer, this.offset);
							this.offset += length;
						} else if(buffer.length <= 0xffffffffffffffffn) {
							this.writeUInt8(SIA_TYPES.bin64);
							this.writeUInt64(length);
							buffer.copy(this.buffer, this.offset);
							this.offset += length;
						} else if(buffer.length <= 0xffffffffffffffffffffffffffffffffn) {
							this.writeUInt8(SIA_TYPES.bin128);
							this.writeUInt128(length);
							buffer.copy(this.buffer, this.offset);
							this.offset += length;
						} else {
							this.writeUInt8(SIA_TYPES.binn);
							this.writeUIntN(length);
							buffer.copy(this.buffer, this.offset);
							this.offset += length;
						}
						return;
					}
					case Date: {
						const date = item;
						const timestamp = date.valueOf();
						if(timestamp <= 0xffffffff) {
							this.writeUInt8(SIA_TYPES.date);
							this.writeUInt32(timestamp);
						} else if(timestamp <= 0xffffffffffffffffn) {
							this.writeUInt8(SIA_TYPES.date64);
							this.writeUInt64(timestamp);
						} else
							throw new Error(`Date ${timestamp} is too big to serialize`);
						return;
					}
					default: {
						throw new Error(`Serialization of item ${item.toString()} is not supported`);
					}
				}
			}
		}
	}
	serialize(data) {
		this.data = data;
		try {
			this.serializeItem(this.data);
			return this.buffer.subarray(0, this.offset);
		} finally {
			this.reset();
			this.data = null;
		}
	}
}

class DeSia {
	constructor({ constructors = SIA_BUILTIN_CONSTRUCTORS, refSize = 256 * 1000 } = {}) {
		this.constructors = new Array(256);
		for(const item of constructors)
			this.constructors[item.code] = item;
		this.offset = 0;
		this.refs = new Array(refSize);
		this.refCount = 0;
	}
	reset() {
		this.offset = 0;
		this.refs.splice(0);
		this.refCount = 0;
	}
	readUInt8() {
		return this.buffer[this.offset++];
	}
	readUInt16() {
		return this.buffer[this.offset++] + (this.buffer[this.offset++] << 8);
	}
	readUInt32() {
		const number = this.buffer.readUInt32LE(this.offset);
		this.offset += 4;
		return number;
	}
	readUInt64() {
		const number = this.buffer.readBigUInt64LE(this.offset);
		this.offset += 8;
		return number;
	}
	readUInt128() {
		const lowerNumber = this.buffer.readBigUInt64LE(this.offset);
		this.offset += 8;
		const upperNumber = this.buffer.readBigUInt64LE(this.offset);
		this.offset += 8;
		return (upperNumber << 64n) | lowerNumber;
	}
	readUIntN() {
		const length = this.readUInt8();
		let number = 0n;
		for(let i = 0; i < length; i++)
			number = (number << 8n) | BigInt(this.readUInt8());
		return number;
	}
	readInt8() {
		return this.buffer.readInt8(this.offset++);
	}
	readInt16() {
		const number = this.buffer.readInt16LE(this.offset);
		this.offset += 2;
		return number;
	}
	readInt32() {
		const number = this.buffer.readInt32LE(this.offset);
		this.offset += 4;
		return number;
	}
	readInt64() {
		const number = this.buffer.readBigInt64LE(this.offset);
		this.offset += 8;
		return number;
	}
	readInt128() {
		return this.readUInt128();
	}
	readIntN() {
		return this.readUIntN();
	}
	readFloat32() {
		const number = this.buffer.readFloatLE(this.offset);
		this.offset += 4;
		return number;
	}
	readFloat64() {
		const number = this.buffer.readDoubleLE(this.offset);
		this.offset += 8;
		return number;
	}
	readString(length) {
		const str = this.buffer.toString("utf8", this.offset, this.offset + length);
		this.offset += length;
		return str;
	}
	deserializeBlock() {
		const blockType = this.readUInt8();
		switch(blockType) {
			case SIA_TYPES.undefined:
				return undefined;
			case SIA_TYPES.false:
				return false;
			case SIA_TYPES.true:
				return true;
			case SIA_TYPES.uint8:
				return this.readUInt8();
			case SIA_TYPES.uint16:
				return this.readUInt16();
			case SIA_TYPES.uint32:
				return this.readUInt32();
			case SIA_TYPES.uint64:
				return this.readUInt64();
			case SIA_TYPES.uint128:
				return this.readUInt128();
			case SIA_TYPES.uintn:
				return this.readUIntN();
			case SIA_TYPES.int8:
				return this.readInt8();
			case SIA_TYPES.int16:
				return this.readInt16();
			case SIA_TYPES.int32:
				return this.readInt32();
			case SIA_TYPES.int64:
				return this.readInt64();
			case SIA_TYPES.int128:
				return this.readInt128();
			case SIA_TYPES.intn:
				return this.readIntN();
			case SIA_TYPES.float32:
				return this.readFloat32();
			case SIA_TYPES.float64:
				return this.readFloat64();
			case SIA_TYPES.ref8: {
				const ref = this.readUInt8();
				return this.refs[ref];
			}
			case SIA_TYPES.ref16: {
				const ref = this.readUInt16();
				return this.refs[ref];
			}
			case SIA_TYPES.ref32: {
				const ref = this.readUInt32();
				return this.refs[ref];
			}
			case SIA_TYPES.ref64: {
				const ref = this.readUInt64();
				return this.refs[ref];
			}
			case SIA_TYPES.ref128: {
				const ref = this.readUInt128();
				return this.refs[ref];
			}
			case SIA_TYPES.refn: {
				const ref = this.readUIntN();
				return this.refs[ref];
			}
			case SIA_TYPES.utfz: {
				const length = this.readUInt8();
				const string = utfz.unpack(this.buffer, length, this.offset);
				this.refs[this.refCount++] = string;
				this.offset += length;
				return string;
			}
			case SIA_TYPES.string8: {
				const length = this.readUInt8();
				const string = this.readString(length);
				this.refs[this.refCount++] = string;
				return string;
			}
			case SIA_TYPES.string16: {
				const length = this.readUInt16();
				const string = this.readString(length);
				this.refs[this.refCount++] = string;
				return string;
			}
			case SIA_TYPES.string32: {
				const length = this.readUInt32();
				const string = this.readString(length);
				this.refs[this.refCount++] = string;
				return string;
			}
			case SIA_TYPES.string64: {
				const length = this.readUInt64();
				const string = this.readString(length);
				this.refs[this.refCount++] = string;
				return string;
			}
			case SIA_TYPES.string128: {
				const length = this.readUInt128();
				const string = this.readString(length);
				this.refs[this.refCount++] = string;
				return string;
			}
			case SIA_TYPES.null:
				return null;
			case SIA_TYPES.objectStart: {
				const object = {};
				this.refs[this.refCount++] = object;
				let curr = this.buffer[this.offset];
				while(curr != SIA_TYPES.objectEnd) {
					object[this.deserializeBlock()] = this.deserializeBlock();
					curr = this.buffer[this.offset];
				}
				this.offset++;
				return object;
			}
			case SIA_TYPES.array8: {
				const length = this.readUInt8();
				const array = new Array(length);
				this.refs[this.refCount++] = array;
				for(let i = 0; i < length; i++)
					array[i] = this.deserializeBlock();
				return array;
			}
			case SIA_TYPES.array16: {
				const length = this.readUInt16();
				const array = new Array(length);
				this.refs[this.refCount++] = array;
				for(let i = 0; i < length; i++)
					array[i] = this.deserializeBlock();
				return array;
			}
			case SIA_TYPES.array32: {
				const length = this.readUInt32();
				const array = new Array(length);
				this.refs[this.refCount++] = array;
				for(let i = 0; i < length; i++)
					array[i] = this.deserializeBlock();
				return array;
			}
			case SIA_TYPES.array64: {
				const length = this.readUInt64();
				const array = new Array(length);
				this.refs[this.refCount++] = array;
				for(let i = 0n; i < length; i++)
					array[i] = this.deserializeBlock();
				return array;
			}
			case SIA_TYPES.array128: {
				const length = this.readUInt128();
				const array = new Array(length);
				this.refs[this.refCount++] = array;
				for(let i = 0n; i < length; i++)
					array[i] = this.deserializeBlock();
				return array;
			}
			case SIA_TYPES.arrayn: {
				const length = this.readUIntN();
				const array = new Array(length);
				this.refs[this.refCount++] = array;
				for(let i = 0n; i < length; i++)
					array[i] = this.deserializeBlock();
				return array;
			}
			case SIA_TYPES.setStart: {
				const set = new Set();
				this.refs[this.refCount++] = set;
				let curr = this.buffer[this.offset];
				while(curr != SIA_TYPES.setEnd) {
					set.add(this.deserializeBlock());
					curr = this.buffer[this.offset];
				}
				this.offset++;
				return set;
			}
			case SIA_TYPES.mapStart: {
				const map = new Map();
				this.refs[this.refCount++] = map;
				let curr = this.buffer[this.offset];
				while(curr != SIA_TYPES.mapEnd) {
					map.set(this.deserializeBlock(), this.deserializeBlock());
					curr = this.buffer[this.offset];
				}
				this.offset++;
				return map;
			}
			case SIA_TYPES.bin8: {
				const length = this.readUInt8();
				const buffer = Buffer.allocUnsafeSlow(length);
				this.refs[this.refCount++] = buffer;
				this.buffer.copy(buffer, 0, this.offset, this.offset + length);
				this.offset += length;
				return buffer;
			}
			case SIA_TYPES.bin16: {
				const length = this.readUInt16();
				const buffer = Buffer.allocUnsafeSlow(length);
				this.refs[this.refCount++] = buffer;
				this.buffer.copy(buffer, 0, this.offset, this.offset + length);
				this.offset += length;
				return buffer;
			}
			case SIA_TYPES.bin32: {
				const length = this.readUInt32();
				const buffer = Buffer.allocUnsafeSlow(length);
				this.refs[this.refCount++] = buffer;
				this.buffer.copy(buffer, 0, this.offset, this.offset + length);
				this.offset += length;
				return buffer;
			}
			case SIA_TYPES.bin64: {
				const length = this.readUInt64();
				const buffer = Buffer.allocUnsafeSlow(length);
				this.refs[this.refCount++] = buffer;
				this.buffer.copy(buffer, 0, this.offset, this.offset + length);
				this.offset += length;
				return buffer;
			}
			case SIA_TYPES.bin128: {
				const length = this.readUInt128();
				const buffer = Buffer.allocUnsafeSlow(length);
				this.refs[this.refCount++] = buffer;
				this.buffer.copy(buffer, 0, this.offset, this.offset + length);
				this.offset += length;
				return buffer;
			}
			case SIA_TYPES.binn: {
				const length = this.readUIntN();
				const buffer = Buffer.allocUnsafeSlow(length);
				this.refs[this.refCount++] = buffer;
				this.buffer.copy(buffer, 0, this.offset, this.offset + length);
				this.offset += length;
				return buffer;
			}
			case SIA_TYPES.date:
				return new Date(this.readUInt32());
			case SIA_TYPES.date64:
				return new Date(this.readUInt64());
			case SIA_TYPES.constructor8: {
				const refId = this.refCount++;
				const code = this.readUInt8();
				const args = this.deserializeBlock();
				const constructor = this.constructors[code];
				if(!constructor)
					throw new Error(`Constructor ${code} is unknown`);
				const item = constructor.build(args);
				this.refs[refId] = item;
				return item;
			}
			case SIA_TYPES.constructor16: {
				const refId = this.refCount++;
				const code = this.readUInt16();
				const args = this.deserializeBlock();
				const constructor = this.constructors[code];
				if(!constructor)
					throw new Error(`Constructor ${code} is unknown`);
				const item = constructor.build(args);
				this.refs[refId] = item;
				return item;
			}
			case SIA_TYPES.constructor32: {
				const refId = this.refCount++;
				const code = this.readUInt32();
				const args = this.deserializeBlock();
				const constructor = this.constructors[code];
				if(!constructor)
					throw new Error(`Constructor ${code} is unknown`);
				const item = constructor.build(args);
				this.refs[refId] = item;
				return item;
			}
			default:
				throw new Error(`Unsupported type: ${blockType}`);
		}
	}
	deserialize(buffer) {
		this.buffer = buffer;
		try {
			return this.deserializeBlock();
		} finally {
			this.reset();
			this.buffer = null;
		}
	}
}
exports.SIA_TYPES = SIA_TYPES;
exports.SIA_BUILTIN_CONSTRUCTORS = SIA_BUILTIN_CONSTRUCTORS;
exports.Sia = Sia;
exports.DeSia = DeSia;
