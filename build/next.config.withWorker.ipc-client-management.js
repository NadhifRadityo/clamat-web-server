const { debug } = require("next/dist/compiled/debug/index.js");
const Comlink = require("./next.config.withWorker.comlink");
const { Sia, newLogger } = require("./next.config.withWorker.ipc-client-shared");
const ipcClientChild = require("./next.config.withWorker.ipc-client-child");

const log = debug("build:plugin:withWorker:ipc-client:management");
const logger = newLogger("worker-management");
const logwait = (...args) => logger.wait(...args);
const logerror = (...args) => logger.error(...args);
const logwarn = (...args) => logger.warn(...args);
const logready = (...args) => logger.ready(...args);
const loginfo = (...args) => logger.info(...args);
const logevent = (...args) => logger.event(...args);
const logtrace = (...args) => logger.trace(...args);

ipcClientChild.initSharedObjects({});
const server = ipcClientChild.newInstanceManagement();
const workers = new Map();

async function newManagementPortImpl(ipcId) {
	const { port1, port2 } = new MessageChannel();
	port1.ipcId = ipcId;
	port2.ipcId = ipcId;
	server.newClient(port1);
	return port2;
}

let lastNextConfig;
server.expose({
	getWorker: id => {
		return workers.get(id);
	},
	spawnWorker: async (path, id, hash, type) => {
		const workerName = `${id}-${hash}`;
		let worker = workers.get(id);
		if(worker != null && worker.hash == hash) {
			if(worker.promise != null)
				await worker.promise;
			return worker;
		}
		if(worker != null) {
			log(`Terminating worker ${worker.name}`);
			logwarn(`Terminating worker ${worker.name}`);
			await worker.instance.terminate();
		}
		log(`Spawning worker ${workerName}`);
		loginfo(`Spawning worker ${workerName}`);
		const workerData = {
			id: id,
			hash: hash,
			type: type,
			initialNextConfig: lastNextConfig
		};
		const workerDataPayload = new Sia().serialize(workerData).toString("base64");
		/** @type Worker | SharedWorker */
		let instance;
		const waitingMessages = [];
		const onExit = () => {
			const _worker = workers.get(id);
			if(_worker == worker)
				workers.delete(id);
			log(`Worker ${workerName} exited`);
			logwarn(`Worker ${workerName} exited`);
			const error = new Error("Worker exited");
			for(let i = waitingMessages.length - 1; i >= 0; i--) {
				const waitingMessage = waitingMessages[i];
				waitingMessage.reject(error);
				waitingMessages.splice(i, 1);
			}
		};
		const onError = event => {
			const _worker = workers.get(id);
			if(_worker == worker)
				workers.delete(id);
			const error = event.error || event;
			log(`Worker ${workerName}, Error: ${error?.stack || error?.message || error}`);
			logerror(`Worker ${workerName}, Error: ${error?.stack || error?.message || error}`);
			instance.terminate?.();
			for(let i = waitingMessages.length - 1; i >= 0; i--) {
				const waitingMessage = waitingMessages[i];
				waitingMessage.reject(error);
				waitingMessages.splice(i, 1);
			}
		};
		const onMessage = event => {
			const payload = event.data;
			const { command, id, value } = payload;
			for(let i = waitingMessages.length - 1; i >= 0; i--) {
				const waitingMessage = waitingMessages[i];
				if(command != waitingMessage.command) continue;
				if(id != waitingMessage.id) continue;
				waitingMessage.resolve(value);
				waitingMessages.splice(i, 1);
				return;
			}
		};
		if(type == "worker") {
			instance = new Worker(`${path}#${workerDataPayload}`, { name: `Worker ${workerName}` });
			instance.addEventListener("exit", onExit);
			instance.addEventListener("error", onError);
			instance.addEventListener("message", onMessage);
			const originalTerminate = instance.terminate;
			instance.terminate = async function(...args) {
				try {
					return await originalTerminate.call(this, ...args);
				} finally {
					instance.dispatchEvent(new CustomEvent("exit"));
				}
			};
		} else if(type == "shared-worker") {
			instance = new SharedWorker(`${path}#${workerDataPayload}`, { name: `Worker ${workerName}` });
			instance.addEventListener("exit", onExit);
			instance.addEventListener("error", onError);
			instance.port.addEventListener("message", onMessage);
			instance.port.start();
			instance.postMessage = instance.port.postMessage.bind(instance.port);
			const originalTerminate = instance.terminate;
			instance.terminate = async function(...args) {
				try {
					return await originalTerminate.call(this, ...args);
				} finally {
					instance.dispatchEvent(new CustomEvent("exit"));
				}
			};
		} else
			throw new Error(`Invalid worker type: ${type}`);
		Comlink.transfer(instance);
		const requestResponseMessage = (command, value, transferables) => new Promise((resolve, reject) => {
			const id = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
			waitingMessages.push({
				id: id,
				resolve: resolve,
				reject: reject
			});
			instance.postMessage({
				command: command,
				id: id,
				value: value
			}, transferables);
		});
		Comlink.transfer(requestResponseMessage);
		const newPort = async () => {
			const ipcId = Math.random().toString(36).substring(2, 7);
			const port = await requestResponseMessage("newPort", ipcId);
			Comlink.transfer(port);
			return [port, ipcId];
		};
		Comlink.transfer(newPort);

		if(type == "worker") {
			const ipcId = Math.random().toString(36).substring(2, 7);
			const managementPort = await newManagementPortImpl(ipcId);
			instance.postMessage({ command: "setManagementPort", value: [managementPort, ipcId] }, [managementPort]);
		}
		if(type == "shared-worker")
			instance.postMessage({ command: "setManagementPort", value: null });
		const readyPromise = new Promise((resolve, reject) => {
			waitingMessages.push({
				command: "ready",
				resolve: () => {
					log(`Worker ${workerName} ready`);
					logready(`Worker ${workerName} initialized`);
					resolve();
				},
				reject: e => reject(e)
			});
		});
		Comlink.transfer(readyPromise);

		worker = {
			id: id,
			hash: hash,
			type: type,
			name: workerName,
			instance: instance,
			promise: readyPromise,
			requestResponseMessage: requestResponseMessage,
			newPort: newPort
		};
		workers.set(id, worker);
		await readyPromise;
		return worker;
	},
	updateNextConfig: nextConfig => {
		log("Updating next config to all workers");
		lastNextConfig = nextConfig;
		const payload = {
			command: "updateNextConfig",
			value: nextConfig
		};
		for(const worker of workers.values()) {
			// Only update config if the worker scope is current-tab-only.
			// Shared workers are browser-scoped. Their config is configured by their own.
			if(worker.type != "worker") continue;
			worker.instance.postMessage(payload);
		}
	}
});
