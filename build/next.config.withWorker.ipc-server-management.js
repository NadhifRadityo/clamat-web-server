const { fork } = require("child_process");
const sharedMemory = require("@markusjx/shared_memory");
const { debug } = require("next/dist/compiled/debug/index.js");
const Comlink = require("./next.config.withWorker.comlink");
const { Sia, newLogger } = require("./next.config.withWorker.ipc-server-shared");
const ipcServerChild = require("./next.config.withWorker.ipc-server-child");

const log = debug("build:plugin:withWorker:ipc-server:management");
const logger = newLogger("worker-management");
const logwait = (...args) => logger.wait(...args);
const logerror = (...args) => logger.error(...args);
const logwarn = (...args) => logger.warn(...args);
const logready = (...args) => logger.ready(...args);
const loginfo = (...args) => logger.info(...args);
const logevent = (...args) => logger.event(...args);
const logtrace = (...args) => logger.trace(...args);

ipcServerChild.initSharedObjects({ syncWorker: null });
const managementMemory = new sharedMemory(process.env.__NEXT_WORKER_MANAGEMENT_MEMORY_ID__, 8192, false, false);
const managementPort = parseInt(process.env.__NEXT_WORKER_MANAGEMENT_PORT__, 10);
const server = ipcServerChild.newInstanceManagement(managementPort);
const workers = new Map();

const sia = new Sia({ size: 8192 - 4 });
const tempBuffer = Buffer.alloc(8192);
function updateMemory() {
	log("Updating management memory");
	const entries = [...workers.values()].map(v => [v.id, v.hash, v.port]);
	const buffer = sia.serialize(entries);
	const length = buffer.length;
	tempBuffer.writeUInt32BE(length, 0);
	buffer.copy(tempBuffer, 4, 0, length);
	managementMemory.write(tempBuffer);
}

let lastNextConfig;
server.expose({
	getWorker: id => {
		return workers.get(id);
	},
	spawnWorker: async (path, id, hash) => {
		const workerName = `${id}-${hash}`;
		let worker = workers.get(id);
		if (worker != null && worker.hash == hash) {
			if (worker.promise != null)
				await worker.promise;
			return worker;
		}
		if (worker != null) {
			log(`Terminating worker ${worker.name}`);
			logwarn(`Terminating worker ${worker.name}`);
			await worker.instance.kill();
		}
		log(`Spawning worker ${workerName}`);
		loginfo(`Spawning worker ${workerName}`);
		const workerData = {
			id: id,
			hash: hash,
			initialNextConfig: lastNextConfig
		};
		const instance = fork(path, {
			env: { ...process.env, __WORKER_DATA__: JSON.stringify(workerData) }
		});
		const waitingMessages = [];
		const onExit = () => {
			const _worker = workers.get(id);
			if (_worker == worker)
				workers.delete(id);
			updateMemory();
			log(`Worker ${workerName} exited`);
			logwarn(`Worker ${workerName} exited`);
			const error = new Error("Worker exited");
			for (let i = waitingMessages.length - 1; i >= 0; i--) {
				const waitingMessage = waitingMessages[i];
				waitingMessage.reject(error);
				waitingMessages.splice(i, 1);
			}
		};
		const onError = error => {
			const _worker = workers.get(id);
			if (_worker == worker)
				workers.delete(id);
			updateMemory();
			log(`Worker ${workerName}, Error: ${error?.stack || error?.message || error}`);
			logerror(`Worker ${workerName}, Error: ${error?.stack || error?.message || error}`);
			instance.kill?.();
			for (let i = waitingMessages.length - 1; i >= 0; i--) {
				const waitingMessage = waitingMessages[i];
				waitingMessage.reject(error);
				waitingMessages.splice(i, 1);
			}
		};
		const onMessage = payload => {
			const { command, id, value } = payload;
			for (let i = waitingMessages.length - 1; i >= 0; i--) {
				const waitingMessage = waitingMessages[i];
				if (command != waitingMessage.command) continue;
				if (id != waitingMessage.id) continue;
				waitingMessage.resolve(value);
				waitingMessages.splice(i, 1);
				return;
			}
		};
		instance.addListener("exit", onExit);
		instance.addListener("error", onError);
		instance.addListener("message", onMessage);
		Comlink.transfer(instance);
		const requestResponseMessage = (command, value) => new Promise((resolve, reject) => {
			const id = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
			waitingMessages.push({
				id: id,
				resolve: resolve,
				reject: reject
			});
			instance.send({
				command: command,
				id: id,
				value: value
			});
		});
		Comlink.transfer(requestResponseMessage);

		const readyPromise = new Promise((resolve, reject) => {
			waitingMessages.push({
				command: "ready",
				resolve: port => {
					worker.port = port;
					log(`Worker ${workerName} ready at port ${port}`);
					logready(`Worker ${workerName} initialized`);
					updateMemory();
					resolve();
				},
				reject: e => reject(e)
			});
		});
		Comlink.transfer(readyPromise);

		worker = {
			id: id,
			hash: hash,
			name: workerName,
			instance: instance,
			promise: readyPromise,
			requestResponseMessage: requestResponseMessage
		};
		workers.set(id, worker);
		updateMemory();
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
		for (const worker of workers.values())
			worker.instance.send(payload);
	}
});
