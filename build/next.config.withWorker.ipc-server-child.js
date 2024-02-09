/* eslint-env node */
/// <reference types="node" />
/* global globalThis */

exports.initSharedObjects = initSharedObjects;
exports.newInstanceManagement = newInstanceManagement;
exports.newInstance = newInstance;
exports.newServer = newServer;

const net = require("net");
const { EventEmitter } = require("events");
const { execFileSync } = require("child_process");
const processModule = require('process')
const { debug } = require("next/dist/compiled/debug/index.js");
const { setConfig } = require("next/config");
const sharedMemory = require("@markusjx/shared_memory");
const Comlink = require("./next.config.withWorker.comlink");
const {
	newReader,
	newWriter,
	socketReader,
	socketWriter,
	newTempBuffer,
	bufferEndpoint,
	deasync,
	inspectPromiseTick,
	MessageChannel: MessageChannelImpl,
	EventTarget: EventTargetImpl,
	MessageEvent: MessageEventImpl,
	StartEvent: StartEventImpl,
	CloseEvent: CloseEventImpl,
	PayloadIncomingEvent: PayloadIncomingEventImpl,
	PayloadOutgoingEvent: PayloadOutgoingEventImpl,
	newAbortSignal,
	kAborted,
	kReason,
	newFinalizationRegistry,
	compressComlinkMessage,
	decompressComlinkMessage,
	formatBytes,
	newLogger
} = require("./next.config.withWorker.ipc-server-shared.js");

const unexposedSymbol = Symbol("NEXT_WORKER_UNEXPOSED");
const sharedObjects = (() => {
	if (global.__next_worker_shared__ != null)
		return global.__next_worker_shared__;
	return global.__next_worker_shared__ = {};
})();
const log = (...args) => sharedObjects.log(...args);
const logwait = (...args) => sharedObjects.logger.wait(...args);
const logerror = (...args) => sharedObjects.logger.error(...args);
const logwarn = (...args) => sharedObjects.logger.warn(...args);
const logready = (...args) => sharedObjects.logger.ready(...args);
const loginfo = (...args) => sharedObjects.logger.info(...args);
const logevent = (...args) => sharedObjects.logger.event(...args);
const logtrace = (...args) => sharedObjects.logger.trace(...args);

function initSharedObjects({ syncWorkerPath }) {
	if (!sharedObjects.childInitialized) {
		sharedObjects.childInitialized = true;
		sharedObjects.syncWorkerPath = syncWorkerPath;
		sharedObjects.attachExceptionHook = () => {
			// This is important to check. If the process is dangling and stdout/stderr is detached,
			// any logging will throw an error. But, since we catch the global error and relog it, this
			// will make an infinite recursion and will pegs your CPUs indefinitely.
			const checkEPIPE = error => {
				if (!error.message.includes("EPIPE")) return;
				process.exit(1);
			};
			process.on("uncaughtException", error => {
				checkEPIPE(error);
				log(`Uncaught exception, Error: ${error.stack || error.message || error}`);
				logerror(`Uncaught exception, Error: ${error.stack || error.message || error}`);
			});
			process.on("unhandledRejection", reason => {
				checkEPIPE(reason);
				log(`Unhandled rejection, Error: ${reason.stack || reason.message || reason}`);
				logerror(`Unhandled rejection, Error: ${reason.stack || reason.message || reason}`);
			});
		};
	}
}

function newInstanceManagement(managementPort) {
	const id = "management";
	const hash = "management";
	sharedObjects.log = debug("build:plugin:withWorker:ipc-server:management");
	sharedObjects.logger = newLogger("worker-management");
	log(`Initializing management`);
	const server = newServer(managementPort, id, hash);
	const oldExpose = server.expose.bind(server);
	server.expose = async object => {
		const port = await oldExpose(object);
		sharedObjects.attachExceptionHook();
		log(`Listening on port ${port}`);
		return port;
	};
	return server;
}

function newInstance() {
	const workerData = JSON.parse(process.env.__WORKER_DATA__);
	const id = workerData.id;
	const hash = workerData.hash;
	sharedObjects.log = debug(`build:plugin:withWorker:ipc-server:child:${id}-${hash}`);
	sharedObjects.logger = newLogger(`worker-${id}-${hash}`);
	log(`Initializing worker`);
	setConfig(workerData.initialNextConfig);
	const server = newServer(0, id, hash);
	processModule.addListener("message", payload => {
		const { command, value } = payload;
		switch (command) {
			case "updateNextConfig": {
				log(`Updating next config`);
				setConfig(value);
				break;
			}
		}
	});
	const oldExpose = server.expose.bind(server);
	server.expose = async object => {
		const port = await oldExpose(object);
		sharedObjects.attachExceptionHook();
		processModule.send({ command: "ready", value: port });
		return port;
	};
	return server;
}

function newServer(workerPort, workerId, workerHash) {
	let exposedObject = unexposedSymbol;
	const ipcContexts = [];
	const transferMessagePorts = new Map(); // Map<number, WeakRef<MessagePort>>
	const finalizerTransferMessagePort = newFinalizationRegistry();
	const finalizerTransferObject = newFinalizationRegistry();
	finalizerTransferMessagePort.addEventListener("released", e => log(`Released port id ${e.heldValue}`));
	// Hold a strong reference to an object, so the object doesn't get garbage collected whilst it still being in use.
	const heldObjects = new Map(); // Map<any, number>;
	const pushHeldObject = object => {
		const counter = heldObjects.get(object) || 0;
		const newCounter = counter + 1;
		heldObjects.set(object, newCounter);
		return newCounter;
	};
	const popHeldObject = object => {
		if (!heldObjects.has(object)) return -1;
		const counter = heldObjects.get(object) || 0;
		const newCounter = counter - 1;
		if (newCounter != 0)
			heldObjects.set(object, newCounter);
		else
			heldObjects.delete(object);
		return newCounter;
	};
	// Meta is held by a strong reference, thus meta must not hold a strong reference to underlying object.
	const metaObjects = new Map(); // Map<WeakRef<any>, meta>
	const finalizerMetaObject = newFinalizationRegistry();
	finalizerMetaObject.addEventListener("released", e => {
		const meta = e.heldValue;
		const objectRef = meta.__metaObjectRef__;
		const stringValue = meta.__metaStringValue__;
		metaObjects.delete(objectRef);
		log(`Released meta object ${stringValue}`);
	});
	const getMetaObject = objectTarget => {
		for (const [objectRef, meta] of metaObjects) {
			const object = objectRef.deref();
			if (object != objectTarget) continue;
			return meta;
		}
		const meta = {};
		const objectRef = meta.__metaObjectRef__ = new WeakRef(objectTarget);
		const stringValue = meta.__metaStringValue__ = Math.random().toString(36).substring(2, 7);
		metaObjects.set(objectRef, meta);
		finalizerMetaObject.register(objectTarget, meta, meta);
		log(`Creating new meta object ${stringValue}`);
		return meta;
	};
	const deleteMetaObject = targetMeta => {
		const result = finalizerMetaObject.unregister(targetMeta);
		if (!result) {
			const stringValue = targetMeta.__metaStringValue__;
			log(`Released meta object ${stringValue}, and already cleaned`);
			return false;
		}
		for (const [objectRef, meta] of metaObjects) {
			if (meta != targetMeta) continue;
			const stringValue = meta.__metaStringValue__;
			log(`Released meta object ${stringValue}`);
			metaObjects.delete(objectRef);
			break;
		}
		return true;
	};
	const ipcServer = net.createServer(socket => {
		const context = {};
		context.socket = socket;
		context.ipcId = socket.remotePort;
		const _log = context._log = (...args) => log(`[${context.ipcId || "pending"}]`, ...args);
		const localTransferMessagePorts = context.localTransferMessagePorts = new Set(); // Set<number> -> reference to transferMessagePorts
		const borrowTransferMessagePorts = context.borrowTransferMessagePorts = new Set(); // Set<number> -> reference to transferMessagePorts
		const MessageChannel = context.MessageChannel = MessageChannelImpl;
		const EventTarget = context.EventTarget = EventTargetImpl;
		const MessageEvent = context.MessageEvent = global.MessageEvent || MessageEventImpl;
		const StartEvent = context.StartEvent = global.StartEvent || StartEventImpl;
		const CloseEvent = context.CloseEvent = global.CloseEvent || CloseEventImpl;
		const PayloadIncomingEvent = PayloadIncomingEventImpl;
		const PayloadOutgoingEvent = PayloadOutgoingEventImpl;
		const getTempBuffer = context.getTempBuffer = newTempBuffer();

		ipcContexts.push(context);
		socket.addListener("close", () => {
			const index = ipcContexts.indexOf(context);
			if (index == -1) return;
			ipcContexts.splice(index, 1);
		});

		const metrics = context.metrics = { messagesSent: 0, messagesReceived: 0, syncMessagesCall: 0, bytesSent: 0, bytesReceived: 0 };
		const readBytes = context.readBytes = socketReader(socket);
		const writeBytes = context.writeBytes = socketWriter(socket);
		const readPacket = context.readPacket = newReader(context);
		const writePacket = context.writePacket = newWriter(context);
		const readPayload = context.readPayload = async () => {
			const length = (await readBytes(4)).readUInt32BE();
			const buffer = (await readBytes(length)).subarray(0, length);
			metrics.messagesReceived++;
			metrics.bytesReceived += buffer.length + 4;
			return decompressComlinkMessage(readPacket(buffer));
		};
		const writePayload = context.writePayload = async (payload, transferables) => {
			const buffer = writePacket(compressComlinkMessage(payload), transferables);
			const tempBuffer = getTempBuffer(buffer.length + 4);
			tempBuffer.writeUInt32BE(buffer.length);
			buffer.copy(tempBuffer, 4, 0, buffer.length);
			metrics.messagesSent++;
			metrics.bytesSent += buffer.length + 4;
			await writeBytes(tempBuffer, 0, buffer.length + 4);
		};

		// Synchronous call must not transfer objects. As the sender is being blocked, and can't receive the message.
		// Regarding performance, this method is much memory consuming and spawning a child process is a very slow.
		// But, this method is pretty reliable. This method is being used by spawning a worker initially.
		let childProcessCallSharedBuffer = null;
		const childProcessGetCallSharedBuffer = length => {
			const buffer = childProcessCallSharedBuffer;
			if (buffer != null && buffer.size >= length) return buffer;
			childProcessCallSharedBuffer = new sharedMemory(`${workerId}-${workerHash}-callBuffer-${Math.floor(Math.random() * 65535)}`, length, false, true);
			return childProcessCallSharedBuffer;
		};
		const childProcessCallSync = buffer => {
			const callBuffer = childProcessGetCallSharedBuffer(buffer.length);
			callBuffer.write(buffer);
			try {
				return execFileSync(process.execPath, [sharedObjects.syncWorkerPath], {
					windowsHide: true,
					maxBuffer: Infinity,
					input: JSON.stringify({
						workerPort: workerPort,
						bufferId: callBuffer.id,
						bufferLength: buffer.length
					}),
					env: { ...process.env },
					shell: false,
					stdio: "pipe"
				});
			} catch (e) {
				if (e.stderr != null)
					throw new Error(e.stderr.toString());
				throw e;
			}
		};
		context.callPayloadChildProcess = (payload, transferables) => {
			if (transferables != null && transferables.length > 0)
				throw new Error("Cannot pass transferables in child process strategy");
			const sendBuffer = writePacket(compressComlinkMessage(payload), transferables);
			const tempBuffer = getTempBuffer(sendBuffer.length + 4);
			tempBuffer.writeUInt32BE(sendBuffer.length);
			sendBuffer.copy(tempBuffer, 4, 0, sendBuffer.length);
			metrics.syncMessagesCall++;
			metrics.messagesSent++;
			metrics.bytesSent += sendBuffer.length + 4;
			const resultBuffer = childProcessCallSync(tempBuffer.subarray(0, sendBuffer.length + 4));
			const receiveLength = resultBuffer.readUInt32BE();
			const receiveBuffer = resultBuffer.subarray(4, receiveLength + 4);
			metrics.messagesReceived++;
			metrics.bytesReceived += receiveBuffer.length + 4;
			return decompressComlinkMessage(readPacket(receiveBuffer));
		};

		// Synchronous call cannot be executed in async context. If you want it to run in async context,
		// wrap the call in `process.nextTick` or `setImmediate` or `setTimeout` or `setInterval`. But at
		// this point, there's no difference than using asynchronous call instead.
		// Broken example: (async () => { await somePromise; callPayload(); })(); => Doesn't work
		// Correct example: (async () => { await somePromise; await new Promise(r => process.nextTick(() => r(callPayload()))); })();
		// Note: This will mean that in order to call synchronously, no async context in current function
		// and parent caller function either.
		context.callPayloadDeasync = (payload, transferables) => {
			const id = payload.id;
			const endpointClosedError = new Error("Endpoint closed");
			return deasync((resolve, reject) => {
				const cleanup = () => {
					ipcEndpoint.removeEventListener("message", messageListener);
					ipcEndpoint.removeEventListener("close", closeListener);
				};
				const messageListener = e => {
					if (e == null || e.data == null || e.data.id != id) return;
					cleanup();
					resolve(e.data);
				};
				const closeListener = () => {
					cleanup();
					reject(endpointClosedError);
				};
				try {
					metrics.syncMessagesCall++;
					ipcEndpoint.addEventListener("message", messageListener);
					ipcEndpoint.addEventListener("close", closeListener);
					writePayload(payload, transferables);
				} catch (e) {
					cleanup();
					reject(e);
				}
			});
		};

		// We set deasync as the preferred synchronous strategy, because it is more performant.
		let callPayload = context.callPayload = context.callPayloadDeasync;
		context.changeCallPayloadStrategy = strategy => {
			if (strategy == "childProcess") {
				callPayload = context.callPayload = context.callPayloadChildProcess;
				return;
			}
			if (strategy == "deasync") {
				callPayload = context.callPayload = context.callPayloadDeasync;
				return;
			}
			throw new Error(`Invalid strategy: ${strategy}`);
		};

		context.addCustomConstructorSerializer = ({ code, canHandle, args, build }) => {
			if (code != 0 && code < 100)
				throw new Error("Custom constructor serializer must have a code less than 100");
			const doAdd = siadesia => {
				if (siadesia == null) return;
				const constructors = siadesia.constructors;
				const index = constructors.findIndex(c => c.code == code);
				if (index != -1) constructors.splice(index, 1);
				constructors.push({
					code: code,
					canHandle: canHandle,
					args: args,
					build: build
				});
			};
			doAdd(context.readPacket.desia);
			doAdd(context.writePacket.sia);
		};
		context.removeCustomConstructorSerializer = code => {
			if (code != 0 && code < 100)
				throw new Error("Custom constructor serializer must have a code less than 100");
			const doRemove = siadesia => {
				if (siadesia == null) return;
				const constructors = siadesia.constructors;
				const index = constructors.findIndex(c => c.code == code);
				if (index == -1) return;
				constructors.splice(index, 1);
			};
			doRemove(context.readPacket.desia);
			doRemove(context.writePacket.sia);
		};

		const ipcEndpoint = context.ipcEndpoint = {
			eventTarget: new EventTarget(),
			started: false,
			closed: false,
			context: context,
			lastMetricsDebug: Date.now(),
			metricsDebugHandle: null,
			start() {
				if (this.started) return;
				this.started = true;
				this.metricsDebugHandle = setInterval(() => {
					const now = Date.now();
					const elapsed = now - this.lastMetricsDebug;
					this.lastMetricsDebug = now;
					const { messagesSent, messagesReceived, bytesSent, bytesReceived, syncMessagesCall } = metrics;
					if (messagesSent == 0 && messagesReceived == 0 && bytesSent == 0 && bytesReceived == 0 && syncMessagesCall == 0) return;
					const messageSentRate = messagesSent / elapsed * 1000;
					const messagesReceivedRate = messagesReceived / elapsed * 1000;
					const bytesSentRate = bytesSent / elapsed * 1000;
					const bytesReceivedRate = bytesReceived / elapsed * 1000;
					_log(`Metrics ` +
						`⬆(${messagesSent}p, ${messageSentRate.toFixed(2)}p/s, ${formatBytes(bytesSent)}, ${formatBytes(bytesSentRate)}/s), ` +
						`⬇(${messagesReceived}p, ${messagesReceivedRate.toFixed(2)}p/s, ${formatBytes(bytesReceived)}, ${formatBytes(bytesReceivedRate)}/s), ` +
						`🔁${syncMessagesCall}`);
					metrics.messagesSent = 0;
					metrics.messagesReceived = 0;
					metrics.bytesSent = 0;
					metrics.bytesReceived = 0;
					metrics.syncMessagesCall = 0;
				}, 5000);
				this.eventTarget.dispatchEvent(new StartEvent("start"));
				_log(`Endpoint started`);
			},
			close() {
				if (!this.started) return;
				if (this.closed) return;
				this.closed = true;
				clearInterval(this.metricsDebugHandle);
				this.metricsDebugHandle = null;
				_log(`Endpoint closed`);
				for (const portId of localTransferMessagePorts) {
					const port = transferMessagePorts.get(portId)?.deref();
					if (port == null) continue;
					_log(`Port ${portId} is forcefully stopped`);
					port.close();
				}
				this.eventTarget.dispatchEvent(new CloseEvent("close"));
				localTransferMessagePorts.clear();
				borrowTransferMessagePorts.clear();
			},
			addEventListener(name, listener, options) {
				this.eventTarget.addEventListener(name, listener, options);
			},
			removeEventListener(name, listener, options) {
				this.eventTarget.removeEventListener(name, listener, options);
			},
			postMessage(message, transferables) {
				if (!this.started) throw new Error("Not started");
				if (this.closed) throw new Error("Endpoint closed");
				const event = new PayloadOutgoingEvent("payloadoutgoing", { data: { message, transferables }, sync: false });
				if (this.eventTarget.dispatchEvent(event))
					setImmediate(() => writePayload(message, transferables));
			},
			postMessageSync(message, transferables) {
				if (!this.started) throw new Error("Not started");
				if (this.closed) throw new Error("Endpoint closed");
				const event = new PayloadOutgoingEvent("payloadoutgoing", { data: { message, transferables }, sync: true });
				if (this.eventTarget.dispatchEvent(event))
					return callPayload(message, transferables);
				return event.respondWith;
			}
		};
		ipcEndpoint.addEventListener("close", () => {
			socket.destroy();
		});
		socket.on("close", () => {
			ipcEndpoint.close();
		});

		if (exposedObject == unexposedSymbol)
			throw new Error("Incoming client but worker is not fully initialized yet");
		if (!(exposedObject instanceof Promise))
			Comlink.exposeEndpoint(exposedObject, ipcEndpoint);
		else {
			const intercept = bufferEndpoint(ipcEndpoint);
			intercept(true);
			exposedObject
				.then(v => { Comlink.exposeEndpoint(v, ipcEndpoint); intercept(false); })
				.catch(() => intercept(false));
		}
		ipcEndpoint.addEventListener("payloadincoming", e => {
			const payload = e.data;
			if (payload.type == "PORT") {
				const port = transferMessagePorts.get(payload.portId)?.deref();
				if (port == null) return;
				if (port.__sibling__ == null) port.postMessage(payload.value);
				else port.__sibling__.dispatchEvent(new MessageEvent("message", { data: payload.value }));
				return;
			}
			if (payload.type == "PORT_CLOSE") {
				const port = transferMessagePorts.get(payload.portId)?.deref();
				if (port == null) return;
				_log(`Close event port id ${payload.portId}`);
				if (heldObjects.has(port) && popHeldObject(port) > 0) return;
				port.close();
				return;
			}
			ipcEndpoint.eventTarget.dispatchEvent(new MessageEvent("message", { data: payload }));
		});
		(async () => {
			while (!socket.closed) {
				const payload = await readPayload();
				ipcEndpoint.eventTarget.dispatchEvent(new PayloadIncomingEvent("payloadincoming", { data: payload }));
			}
		})().catch(e => {
			if (e.message == "Socket closed")
				return;
			throw e;
		});

		context.transferMessagePort = (transfer, serialize) => {
			const onMessage = (message, transferables, portId) => {
				ipcEndpoint.postMessage({ type: "PORT", portId: portId, value: message }, transferables);
			};
			const onMessageSync = (message, transferables, portId) => {
				const result = ipcEndpoint.postMessageSync({ type: "PORT", portId: portId, value: message }, transferables);
				if (result.type != "PORT" || result.portId != portId)
					throw new Error("Unexpected port sync message");
				return result.value;
			};
			let onReleased;
			let unregisterObject;
			const onClose = portId => {
				_log(`Closing port id ${portId}`);
				transferMessagePorts.delete(portId);
				localTransferMessagePorts.delete(portId);
				finalizerTransferMessagePort.unregister(unregisterObject);
				finalizerTransferMessagePort.removeEventListener("released", onReleased);
				if (!ipcEndpoint.closed)
					ipcEndpoint.postMessage({ type: "PORT_CLOSE", portId: portId });
			};
			const patchClose = port => {
				if (port == null) return;
				const originalClose = port.close;
				port.closed = false;
				port.close = () => {
					if (port.closed) return;
					port.closed = true;
					originalClose.call(port);
					// port.dispatchEvent(new CloseEvent("close"));
					// Nodejs spec already handles close event
				};
			};
			const initPort = (portId, port) => {
				_log(`Initializing port id ${portId}`);
				transferMessagePorts.set(portId, new WeakRef(port));
				localTransferMessagePorts.add(portId);
				onReleased = e => {
					if (e.heldValue != portId) return;
					finalizerTransferMessagePort.removeEventListener("released", onReleased);
					onClose(portId);
				};
				finalizerTransferMessagePort.addEventListener("released", onReleased);
				patchClose(port);
				patchClose(port.__sibling__);
				port.start();
				port.__sibling__?.start();
				let onMessagePort;
				let portClosed = false;
				const onClosePort = () => {
					if (portClosed) return;
					portClosed = true;
					port.removeEventListener("close", onClosePort);
					port.removeEventListener("message", onMessagePort);
					port.__sibling__?.removeEventListener("close", onClosePort);
					port.close();
					port.__sibling__?.close();
					onClose(portId);
				};
				port.addEventListener("close", onClosePort);
				port.__sibling__?.addEventListener("close", onClosePort);
				if (port.__sibling__ == null)
					port.addEventListener("message", onMessagePort = e => onMessage(e.data, [...Comlink.findTransferable(e.data)], portId));
				else {
					port.__sibling__.postMessage = (e, t) => onMessage(e, t, portId);
					port.__sibling__.postMessageSync = (e, t) => onMessageSync(e, t, portId);
				}
			};
			if (serialize && transfer instanceof MessagePort) {
				for (const [portId, portRef] of transferMessagePorts.entries()) {
					const port = portRef.deref();
					if (port != transfer) continue;
					if (!localTransferMessagePorts.has(portId) && !borrowTransferMessagePorts.has(portId)) {
						borrowTransferMessagePorts.add(portId);
						const onReleased = e => {
							if (e.heldValue != portId) return;
							onClose();
						};
						const onClose = () => {
							borrowTransferMessagePorts.delete(portId);
							finalizerTransferMessagePort.removeEventListener("released", onReleased);
							port.removeEventListener("close", onClose);
							if (!ipcEndpoint.closed)
								ipcEndpoint.postMessage({ type: "PORT_CLOSE", portId: portId });
						};
						finalizerTransferMessagePort.addEventListener("released", onReleased);
						port.addEventListener("close", onClose);
						pushHeldObject(port);
					}
					return portId;
				}
				const port = transfer;
				const meta = getMetaObject(port);
				if (meta.messagePortId == null)
					meta.messagePortId = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
				const portId = meta.messagePortId;
				unregisterObject = meta.unregisterMessagePort = { _: Symbol(`message-port-${portId}`) };
				initPort(portId, port);
				const onReleased = e => {
					if (e.heldValue != portId) return;
					onClose();
				};
				const onClose = () => {
					deleteMetaObject(meta);
					finalizerTransferMessagePort.removeEventListener("released", onReleased);
					port.removeEventListener("close", onClose);
				};
				finalizerTransferMessagePort.addEventListener("released", onReleased);
				finalizerTransferMessagePort.register(port, portId, unregisterObject);
				port.addEventListener("close", onClose);
				pushHeldObject(port);
				return portId;
			}
			if (!serialize && typeof transfer == "number") {
				for (const [portId, portRef] of transferMessagePorts.entries()) {
					if (portId != transfer) continue;
					const port = portRef.deref();
					if (port == null) break;
					if (port.__transferred__)
						return port.__sibling__;
					return port;
				}
				const portId = transfer;
				const messageChannel = new MessageChannel();
				const meta = getMetaObject(messageChannel.port2);
				const { port1, port2 } = messageChannel;
				meta.messagePortChannel = new WeakRef(messageChannel); // recursive reference
				unregisterObject = meta.unregisterMessagePort = { _: Symbol(`message-port-${portId}`) };
				port1.__transferred__ = true;
				initPort(portId, port1);
				const onReleased = e => {
					if (e.heldValue != portId) return;
					onClose();
				};
				const onClose = () => {
					deleteMetaObject(meta);
					finalizerTransferMessagePort.removeEventListener("released", onReleased);
					port2.removeEventListener("close", onClose);
					port1.close();
				};
				finalizerTransferMessagePort.addEventListener("released", onReleased);
				finalizerTransferMessagePort.register(port2, portId, unregisterObject);
				port2.addEventListener("close", onClose);
				{
					const noopListenerTarget = new EventEmitter();
					const originalAddEventListener = port2.addEventListener;
					const originalRemoveEventListener = port2.removeEventListener;
					port2.addEventListener = function addEventListener(type, callback, options) {
						const previousEventsLength = noopListenerTarget.eventNames().length;
						try {
							noopListenerTarget.addListener(type, callback);
							return originalAddEventListener.call(this, type, callback, options);
						} finally {
							const currentEventsLength = noopListenerTarget.eventNames().length;
							if (previousEventsLength == 0 && currentEventsLength == 1)
								pushHeldObject(port2);
						}
					};
					port2.removeEventListener = function removeEventListener(type, callback, options) {
						const previousEventsLength = noopListenerTarget.eventNames().length;
						try {
							noopListenerTarget.removeListener(type, callback);
							return originalRemoveEventListener.call(this, type, callback, options);
						} finally {
							const currentEventsLength = noopListenerTarget.eventNames().length;
							if (previousEventsLength == 1 && currentEventsLength == 0)
								popHeldObject(port2);
						}
					};
				}
				return port2;
			}
			throw new Error("Invalid transfer message port arguments");
		};
		context.transferAbortSignal = (transfer, serialize) => {
			if (serialize && transfer instanceof AbortSignal) {
				const abortSignal = transfer;
				if (abortSignal.aborted)
					return [abortSignal.aborted, abortSignal.reason];
				// Fasttrack: Use already exists abortSignalId if the abortSignal was deserialized before.
				for (const [_, metaTarget] of metaObjects) {
					const abortSignalTarget = metaTarget.abortSignalProxy?.deref();
					if (abortSignalTarget != abortSignal) continue;
					// As we send borrowed transferred abortSignal, we don't necessarily need to hold the reference
					return metaTarget.abortSignalId;
				}
				const meta = getMetaObject(abortSignal);
				if (meta.abortSignalMessageChannel == null) {
					const { port2: port } = meta.abortSignalMessageChannel = new MessageChannel();
					const onClose = () => {
						port.removeEventListener("close", onClose);
						abortSignal.removeEventListener("abort", onAbort);
					};
					const onAbort = () => {
						port.removeEventListener("close", onClose);
						abortSignal.removeEventListener("abort", onAbort);
						_log(`Sending exception to abort signal ${abortSignalId} port`);
						if (!abortSignal.aborted)
							throw new Error(`Expecting aborted to be true`);
						port.postMessage([abortSignal.aborted, abortSignal.reason]);
						port.close();
					};
					port.addEventListener("close", onClose);
					abortSignal.addEventListener("abort", onAbort);
				}
				const { port1: port } = meta.abortSignalMessageChannel;
				const abortSignalId = context.transferMessagePort(port, true);
				if (meta.abortSignalMemory == null) {
					const memory = meta.abortSignalMemory = new sharedMemory(`${workerId}-${workerHash}-abortSignal-${abortSignalId}`, 4096, false, true);
					const onAbort = () => {
						abortSignal.removeEventListener("abort", onAbort);
						_log(`Sending exception to abort signal ${abortSignalId} memory`);
						const reasonObject = abortSignal.reason;
						const sendBuffer = writePacket(reasonObject, Comlink.findTransferable(reasonObject));
						const tempBuffer = getTempBuffer(sendBuffer.length + 4);
						tempBuffer.writeUInt32BE(sendBuffer.length);
						sendBuffer.copy(tempBuffer, 4, 0, sendBuffer.length);
						memory.write(tempBuffer.subarray(0, Math.min(sendBuffer.length + 4, memory.size)));
					};
					abortSignal.addEventListener("abort", onAbort);
				}
				if (!heldObjects.has(abortSignal)) {
					pushHeldObject(abortSignal);
					const unregisterAbortSignal = meta.unregisterAbortSignal = { _: Symbol(`abort-signal-${abortSignalId}`) };
					const onReleased = e => {
						if (e.heldValue != abortSignalId) return;
						port.close();
					};
					const onClose = () => {
						popHeldObject(abortSignal);
						deleteMetaObject(meta);
						finalizerTransferObject.removeEventListener("released", onReleased);
						finalizerTransferObject.unregister(unregisterAbortSignal);
						port.removeEventListener("close", onClose);
					};
					finalizerTransferObject.addEventListener("released", onReleased);
					finalizerTransferObject.register(abortSignal, abortSignalId, unregisterAbortSignal);
					port.addEventListener("close", onClose);
				}
				return abortSignalId;
			}
			if (!serialize && transfer instanceof Array) {
				const [aborted, reason] = transfer;
				if (!aborted)
					throw new Error(`Expecting aborted to be true`);
				const abortSignal = newAbortSignal(aborted, reason);
				return abortSignal;
			}
			if (!serialize && typeof transfer == "number") {
				const abortSignalId = transfer;
				const port = context.transferMessagePort(abortSignalId, false);
				// Fasttrack: Use already exists abortSignalProxy if the abortSignal was serialized before.
				for (const [objectTarget, metaTarget] of metaObjects) {
					const portTarget = metaTarget.abortSignalMessageChannel?.port1;
					if (portTarget != port) continue;
					const abortSignal = objectTarget.deref();
					if (abortSignal != null) return abortSignal;
					break;
				}
				const meta = getMetaObject(port);
				let abortSignal = meta.abortSignalProxy?.deref();
				if (abortSignal == null) {
					abortSignal = newAbortSignal();
					meta.abortSignalProxy = new WeakRef(abortSignal); // Allow abortSignal to be freed when not required
					meta.abortSignalPort = port; // Hold a strong reference to port, so that port will not be freed unless our proxy is freed
					meta.abortSignalId = abortSignalId;
					const count = meta.abortSignalCount = (meta.abortSignalCount || 0) + 1;
					const unregisterAbortSignal = meta.unregisterAbortSignal = { _: Symbol(`abort-signal-${abortSignalId}`) };
					const memory = meta.abortSignalMemory = new sharedMemory(`${workerId}-${workerHash}-abortSignal-${abortSignalId}`, 4096, false, false);
					const fetchMemory = meta.abortSignalFetchMemory = () => {
						const buffer = memory.readBuffer();
						const length = buffer.readUInt32BE(0);
						if (length == 0) return null;
						if (length < memory.size - 4) {
							_log(`Received exception from abort signal ${abortSignalId} memory`);
							return abortSignal[kReason] = readPacket(buffer.subarray(4, 4 + length));
						}
						_log(`Received overflowed exception from abort signal ${abortSignalId} memory`);
						return abortSignal[kReason] = new DOMException(
							"This operation was aborted. But the error message is way too big for synchronous call. Wait a bit for full message.",
							"AbortError"
						);
					};
					Object.defineProperty(abortSignal, "aborted", {
						get() {
							if (abortSignal[kAborted]) return true;
							return fetchMemory() != null;
						},
						enumerable: true,
						configurable: true
					});
					Object.defineProperty(abortSignal, "reason", {
						get() {
							if (abortSignal[kReason] != null) return abortSignal[kReason];
							return fetchMemory();
						},
						enumerable: true,
						configurable: true
					});
					const onReleased = e => {
						if (e.heldValue != abortSignalId) return;
						const abortSignalReleased = meta.abortSignalProxy?.deref() == null;
						if (abortSignalReleased) { port.close(); return; }
						if (meta.abortSignalCount == count) return;
						// The abortSignal was temporarily unreferenced and cleaned. But FinalizationRegistry callback is not
						// invoked yet. Don't close the port as it's still being in use. Cleanup the old callbacks.
						_log(`Abort signal ${abortSignalId} was temporarily unreferenced and cleaned`);
						finalizerTransferObject.removeEventListener("released", onReleased);
						finalizerTransferObject.unregister(unregisterAbortSignal);
						port.removeEventListener("message", onMessage);
						port.removeEventListener("close", onClose);
					};
					const onMessage = e => {
						_log(`Received exception from abort signal ${abortSignalId} port`);
						const [aborted, reason] = e.data;
						if (!aborted)
							throw new Error(`Expecting aborted to be true`);
						abortSignal[kAborted] = aborted;
						abortSignal[kReason] = reason;
						abortSignal.dispatchEvent(new Event("abort"));
						port.close();
					};
					const onClose = () => {
						deleteMetaObject(meta);
						finalizerTransferObject.removeEventListener("released", onReleased);
						finalizerTransferObject.unregister(unregisterAbortSignal);
						port.removeEventListener("message", onMessage);
						port.removeEventListener("close", onClose);
					};
					finalizerTransferObject.addEventListener("released", onReleased);
					finalizerTransferObject.register(abortSignal, abortSignalId, unregisterAbortSignal);
					port.addEventListener("message", onMessage);
					port.addEventListener("close", onClose);
					{
						const noopListenerTarget = new EventEmitter();
						const originalAddEventListener = abortSignal.addEventListener;
						const originalRemoveEventListener = abortSignal.removeEventListener;
						abortSignal.addEventListener = function addEventListener(type, callback, options) {
							const previousEventsLength = noopListenerTarget.eventNames().length;
							try {
								noopListenerTarget.addListener(type, callback);
								return originalAddEventListener.call(this, type, callback, options);
							} finally {
								const currentEventsLength = noopListenerTarget.eventNames().length;
								if (previousEventsLength == 0 && currentEventsLength == 1)
									pushHeldObject(abortSignal);
							}
						};
						abortSignal.removeEventListener = function removeEventListener(type, callback, options) {
							const previousEventsLength = noopListenerTarget.eventNames().length;
							try {
								noopListenerTarget.removeListener(type, callback);
								return originalRemoveEventListener.call(this, type, callback, options);
							} finally {
								const currentEventsLength = noopListenerTarget.eventNames().length;
								if (previousEventsLength == 1 && currentEventsLength == 0)
									popHeldObject(abortSignal);
							}
						};
						let onabort = null;
						Object.defineProperty(abortSignal, "onabort", {
							get() {
								return onabort;
							},
							set(value) {
								const oldValue = onabort;
								onabort = value;
								if (value != null)
									abortSignal.addEventListener("abort", value);
								if (oldValue != null)
									abortSignal.removeEventListener("abort", oldValue);
							},
							enumerable: true,
							configurable: true
						});
					}
				}
				return abortSignal;
			}
			throw new Error("Invalid transfer abort signal arguments");
		};
		context.transferPromise = (transfer, serialize) => {
			if (serialize && transfer instanceof Promise) {
				const promise = transfer;
				const promiseDetails = inspectPromiseTick(promise);
				promise.catch(() => { }); // Prevent unhandledRejection
				if (promiseDetails.state == "resolved")
					return [1, promiseDetails.value];
				if (promiseDetails.state == "rejected")
					return [2, promiseDetails.value];
				// Fasttrack: Use already exists promiseId if the promise was deserialized before.
				for (const [_, metaTarget] of metaObjects) {
					const promiseTarget = metaTarget.promiseProxy?.deref();
					if (promiseTarget != promise) continue;
					// As we send borrowed transferred promise, we don't necessarily need to hold the reference
					return metaTarget.promiseId;
				}
				const meta = getMetaObject(promise);
				if (meta.promiseMessageChannel == null) {
					const { port2: port } = meta.promiseMessageChannel = new MessageChannel();
					let ignore = false;
					const onClose = () => {
						port.removeEventListener("close", onClose);
						if (ignore) return;
						ignore = true;
					};
					const onResolve = value => {
						if (ignore) return;
						port.removeEventListener("close", onClose);
						ignore = true;
						_log(`Sending resolved value to promise ${promiseId} port`);
						port.postMessage([1, value]);
						port.close();
					};
					const onReject = value => {
						if (ignore) return;
						port.removeEventListener("close", onClose);
						ignore = true;
						_log(`Sending rejected value to promise ${promiseId} port`);
						port.postMessage([2, value]);
						port.close();
					};
					port.addEventListener("close", onClose);
					promise.then(onResolve, onReject);
				}
				const { port1: port } = meta.promiseMessageChannel;
				const promiseId = context.transferMessagePort(port, true);
				if (!heldObjects.has(promise)) {
					pushHeldObject(promise);
					const unregisterPromise = meta.unregisterPromise = { _: Symbol(`promise-${promiseId}`) };
					const onReleased = e => {
						if (e.heldValue != promiseId) return;
						port.close();
					};
					const onClose = () => {
						popHeldObject(promise);
						deleteMetaObject(meta);
						finalizerTransferObject.removeEventListener("released", onReleased);
						finalizerTransferObject.unregister(unregisterPromise);
						port.removeEventListener("close", onClose);
					};
					finalizerTransferObject.addEventListener("released", onReleased);
					finalizerTransferObject.register(promise, promiseId, unregisterPromise);
					port.addEventListener("close", onClose);
				}
				return promiseId;
			}
			if (!serialize && transfer instanceof Array) {
				const [state, value] = transfer;
				if (state == 1)
					return Promise.resolve(value);
				if (state == 2)
					return Promise.reject(value);
				throw new Error(`Unknown promise state "${state}" with value "${value}"`);
			}
			if (!serialize && typeof transfer == "number") {
				const promiseId = transfer;
				const port = context.transferMessagePort(promiseId, false);
				// Fasttrack: Use already exists promiseProxy if the promise was serialized before.
				for (const [objectTarget, metaTarget] of metaObjects) {
					const portTarget = metaTarget.promiseMessageChannel?.port1;
					if (portTarget != port) continue;
					const promise = objectTarget.deref();
					if (promise != null) return promise;
					break;
				}
				const meta = getMetaObject(port);
				let promise = meta.promiseProxy?.deref();
				if (promise == null) {
					let resolve; let reject;
					promise = new Promise((res, rej) => { resolve = res; reject = rej; });
					promise.__resolve = resolve;
					promise.__reject = reject;
					meta.promiseProxy = new WeakRef(promise); // Allow promise to be freed when not required
					meta.promisePort = port; // Hold a strong reference to port, so that port will not be freed unless our proxy is freed
					meta.promiseId = promiseId;
					const count = meta.promiseCount = (meta.promiseCount || 0) + 1;
					const unregisterPromise = meta.unregisterPromise = { _: Symbol(`promise-${promiseId}`) };
					const onReleased = e => {
						if (e.heldValue != promiseId) return;
						const promiseReleased = meta.promiseProxy?.deref() == null;
						if (promiseReleased) { port.close(); return; }
						if (meta.promiseCount == count) return;
						// The promise was temporarily unreferenced and cleaned. But FinalizationRegistry callback is not
						// invoked yet. Don't close the port as it's still being in use. Cleanup the old callbacks.
						_log(`Promise ${promiseId} was temporarily unreferenced and cleaned`);
						finalizerTransferObject.removeEventListener("released", onReleased);
						finalizerTransferObject.unregister(unregisterPromise);
						port.removeEventListener("message", onMessage);
						port.removeEventListener("close", onClose);
					};
					const onMessage = e => {
						_log(`Received value from promise ${promiseId} port`);
						const [state, value] = e.data;
						if (state == 1)
							resolve(value);
						else if (state == 2)
							reject(value);
						else
							throw new Error(`Unknown promise state "${state}" with value "${value}"`);
						port.close();
					};
					const onClose = () => {
						deleteMetaObject(meta);
						finalizerTransferObject.removeEventListener("released", onReleased);
						finalizerTransferObject.unregister(unregisterPromise);
						port.removeEventListener("message", onMessage);
						port.removeEventListener("close", onClose);
					};
					finalizerTransferObject.addEventListener("released", onReleased);
					finalizerTransferObject.register(promise, promiseId, unregisterPromise);
					port.addEventListener("message", onMessage);
					port.addEventListener("close", onClose);
					{
						let held = false;
						const originalThen = promise.then;
						const originalCatch = promise.catch;
						const originalFinally = promise.finally;
						promise.then = function then(onResolved, onRejected) {
							if (!held) { held = true; pushHeldObject(promise); }
							return originalThen.call(this, onResolved, onRejected);
						};
						promise.catch = function (onRejected) {
							if (!held) { held = true; pushHeldObject(promise); }
							return originalCatch.call(this, onRejected);
						};
						promise.finally = function (onFinally) {
							if (!held) { held = true; pushHeldObject(promise); }
							return originalFinally.call(this, onFinally);
						};
					}
				}
				return promise;
			}
			throw new Error("Invalid transfer promise arguments");
		};
		context.transferObject = (transfer, serialize) => {
			if (serialize && (typeof transfer == "object" || typeof transfer == "function")) {
				const object = transfer;
				// Fasttrack: Use already exists objectId if the object was deserialized before.
				for (const [_, metaTarget] of metaObjects) {
					const objectTarget = metaTarget.objectProxy?.deref();
					if (objectTarget != object) continue;
					// As we send borrowed transferred object, we don't necessarily need to hold the reference
					return metaTarget.objectId;
				}
				const meta = getMetaObject(object);
				if (meta.objectMessageChannel == null) {
					const { port2: port } = meta.objectMessageChannel = new MessageChannel();
					Comlink.exposeEndpoint(object, port);
				}
				const { port1: port } = meta.objectMessageChannel;
				const objectId = context.transferMessagePort(port, true);
				if (!heldObjects.has(object)) {
					pushHeldObject(object);
					const unregisterObject = meta.unregisterObject = { _: Symbol(`object-${objectId}`) };
					const onReleased = e => {
						if (e.heldValue != objectId) return;
						port.close();
					};
					const onClose = () => {
						popHeldObject(object);
						deleteMetaObject(meta);
						finalizerTransferObject.removeEventListener("released", onReleased);
						finalizerTransferObject.unregister(unregisterObject);
						port.removeEventListener("close", onClose);
					};
					finalizerTransferObject.addEventListener("released", onReleased);
					finalizerTransferObject.register(object, objectId, unregisterObject);
					port.addEventListener("close", onClose);
					{
						const port2 = meta.objectMessageChannel.port2;
						const originalPostMessage = port2.postMessage.bind(port2);
						const originalPostMessageSync = port2.postMessageSync.bind(port2);
						const originalDispatchEvent = port2.dispatchEvent.bind(port2);
						port2.postMessage = (message, transferables) => originalPostMessage(compressComlinkMessage(message), transferables);
						port2.postMessageSync = (message, transferables) => decompressComlinkMessage(originalPostMessageSync(compressComlinkMessage(message), transferables));
						port2.dispatchEvent = e => {
							if (e.type == "message") {
								Object.defineProperty(e, "data", {
									value: decompressComlinkMessage(e.data),
									writable: false,
									enumerable: true,
									configurable: true
								});
							}
							return originalDispatchEvent(e);
						};
					}
					{
						// Don't capture meta, because we listen and don't intend to unlisten.
						const port2 = meta.objectMessageChannel.port2;
						port2.addEventListener("message", e => {
							const message = e.data;
							if (message.type == "RELEASE")
								_log(`Comlink released object ${objectId}`);
						});
					}
				}
				return objectId;
			}
			if (!serialize && typeof transfer == "number") {
				const objectId = transfer;
				const port = context.transferMessagePort(objectId, false);
				// Fasttrack: Use already exists objectProxy if the object was serialized before.
				for (const [objectTarget, metaTarget] of metaObjects) {
					const portTarget = metaTarget.objectMessageChannel?.port1;
					if (portTarget != port) continue;
					const object = objectTarget.deref();
					if (object != null) return object;
					break;
				}
				const meta = getMetaObject(port);
				let object = meta.objectProxy?.deref();
				if (object == null) {
					port.context = context; // Reference back to allow full control
					object = Comlink.wrapEndpoint(port);
					meta.objectProxy = new WeakRef(object); // Allow object to be freed when not required
					meta.objectPort = port; // Hold a strong reference to port, so that port will not be freed unless our proxy is freed
					meta.objectId = objectId;
					const count = meta.objectCount = (meta.objectCount || 0) + 1;
					const unregisterObject = meta.unregisterObject = { _: Symbol(`object-${objectId}`) };
					const onReleased = e => {
						if (e.heldValue != objectId) return;
						const objectReleased = meta.objectProxy?.deref() == null;
						if (objectReleased) { port.close(); return; }
						if (meta.objectCount == count) return;
						// The object was temporarily unreferenced and cleaned. But FinalizationRegistry callback is not
						// invoked yet. Don't close the port as it's still being in use. Cleanup the old callbacks.
						_log(`Object ${objectId} was temporarily unreferenced and cleaned`);
						finalizerTransferObject.removeEventListener("released", onReleased);
						finalizerTransferObject.unregister(unregisterObject);
						port.removeEventListener("close", onClose);
					};
					const onClose = () => {
						deleteMetaObject(meta);
						finalizerTransferObject.removeEventListener("released", onReleased);
						finalizerTransferObject.unregister(unregisterObject);
						port.removeEventListener("close", onClose);
					};
					finalizerTransferObject.addEventListener("released", onReleased);
					finalizerTransferObject.register(object, objectId, unregisterObject);
					port.addEventListener("close", onClose);
					if (count == 1) {
						const originalPostMessage = port.postMessage.bind(port);
						const originalPostMessageSync = port.postMessageSync.bind(port);
						const originalDispatchEvent = port.dispatchEvent.bind(port);
						port.postMessage = (message, transferables) => originalPostMessage(compressComlinkMessage(message), transferables);
						port.postMessageSync = (message, transferables) => decompressComlinkMessage(originalPostMessageSync(compressComlinkMessage(message), transferables));
						port.dispatchEvent = e => {
							if (e.type == "message") {
								Object.defineProperty(e, "data", {
									value: decompressComlinkMessage(e.data),
									writable: false,
									enumerable: true,
									configurable: true
								});
							}
							return originalDispatchEvent(e);
						};
					}
					if (count == 1) {
						// Don't capture meta, because we override the function and don't intend to revert it back
						const inspectMessage = original => {
							return (message, transferables) => {
								if (message.type == "RELEASE")
									_log(`Comlink releasing object ${objectId}`);
								return original(message, transferables);
							};
						};
						if (port.postMessage != null)
							port.postMessage = inspectMessage(port.postMessage.bind(port));
						if (port.postMessageSync != null)
							port.postMessageSync = inspectMessage(port.postMessageSync.bind(port));
						port.addEventListener("message", inspectMessage(() => { }));
						if (port.__sibling__ != null) {
							if (port.__sibling__.postMessage != null)
								port.__sibling__.postMessage = inspectMessage(port.__sibling__.postMessage.bind(port));
							if (port.__sibling__.postMessageSync != null)
								port.__sibling__.postMessageSync = inspectMessage(port.__sibling__.postMessageSync.bind(port));
							port.__sibling__.addEventListener("message", inspectMessage(() => { }));
						}
					}
					// If you attach listener or callback to a transferred object, you must hold the object strong.
				}
				return object;
			}
			throw new Error("Invalid transfer object arguments");
		};
	});

	let portResolve;
	let portReject;
	const portPromise = new Promise((res, rej) => {
		portResolve = res;
		portReject = rej;
	});
	ipcServer.on("listening", () => portResolve(ipcServer.address().port));
	ipcServer.on("error", e => portReject(e));
	ipcServer.listen(workerPort);
	return {
		id: workerId,
		hash: workerHash,
		server: ipcServer,
		contexts: ipcContexts,
		expose: async object => {
			if (exposedObject != unexposedSymbol)
				throw new Error("Already exposed an endpoint");
			exposedObject = object;
			try {
				exposedObject = await exposedObject;
				return await portPromise;
			} catch (e) {
				exposedObject = unexposedSymbol;
				throw e;
			}
		}
	};
}
