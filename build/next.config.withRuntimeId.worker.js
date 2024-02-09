const os = require("os");
const fs = require("fs");
const net = require("net");
const path = require("path");
const { debug } = require("next/dist/compiled/debug/index.js");
const sharedMutex = require("@markusjx/shared_mutex");
const { snapshot } = require("process-list");
const seedrandom = require("seedrandom");

const log = debug("build:plugin:withRuntimeId:worker");
const port = parseInt(process.argv[2], 10);
const projectName = process.argv[3];

const server = net.createServer({ allowHalfOpen: true }, socket => {
	const respond = data => {
		if(socket.closed) return;
		socket.end(JSON.stringify(data));
		cleanup();
	};
	let buffer = "";
	const onData = data => {
		buffer += data.toString("utf-8");
		if(!/\r\n/.test(buffer)) return;
		processPayload(buffer.trim());
	};
	const onError = error => {
		respond({ state: "rejected", value: error });
	};
	const onClose = () => {
		cleanup();
	};
	const cleanup = () => {
		socket.off("data", onData);
		socket.off("error", onError);
		socket.off("close", onClose);
	};
	socket.on("data", onData);
	socket.on("error", onError);
	socket.on("close", onClose);
	const processPayload = payload => {
		(async () => {
			if(payload == "ping")
				return "pong";
			if(payload == "init") {
				server.close();
				process.stdin.resume();
				return await init();
			}
			throw new Error("Invalid command");
		})()
			.then(v => respond({ state: "resolved", value: v }))
			.catch(e => respond({ state: "rejected", value: e }));
	};
});
server.listen(port);

async function init() {
	const tempDir = path.join(os.tmpdir(), `runtime-id-${projectName}`);
	if(!fs.existsSync(tempDir))
		fs.mkdirSync(tempDir, { recursive: true });
	const currentPid = process.pid;
	const currentProcessList = await snapshot(["pid", "ppid", "path"]);
	const currentProcess = currentProcessList.find(p => p.pid == currentPid);
	const ppidIncludesPid = (ppid, pid) => {
		for(const process of currentProcessList) {
			if(process.ppid != ppid) continue;
			if(process.pid == pid) return true;
			if(ppidIncludesPid(process.pid, pid)) return true;
		}
		return false;
	};
	let runtimeCounter = 0;
	let mutex;
	while(true) {
		log(`Checking runtime counter ${runtimeCounter}`);
		mutex = new sharedMutex.shared_mutex(`runtime-id-${runtimeCounter}`);
		if(mutex.try_lock()) break; mutex = null;
		const pidFile = path.join(tempDir, `${runtimeCounter}`);
		if(!fs.existsSync(pidFile)) continue;
		const remotePid = parseInt(fs.readFileSync(pidFile, "ascii"), 10);
		log(`Checking if pid ${remotePid} includes child pid ${currentPid}`);
		if(ppidIncludesPid(remotePid, currentPid)) break;
		runtimeCounter++;
	}
	if(mutex != null) {
		let parentProcess = currentProcessList.find(p => p.pid == currentProcess.ppid);
		while(parentProcess.path == currentProcess.path) {
			const newParentProcess = currentProcessList.find(p => p.pid == parentProcess.ppid);
			if(newParentProcess.path != currentProcess.path) break;
			parentProcess = newParentProcess;
		}
		const parentPid = parentProcess.pid;
		log(`Writing pid ${parentPid} as owner of runtime counter ${runtimeCounter}`);
		const pidFile = path.join(tempDir, `${runtimeCounter}`);
		fs.writeFileSync(pidFile, parentPid.toString(), "ascii");
		process.on("exit", () => {
			log("Releasing mutex");
			fs.unlinkSync(pidFile);
			mutex.unlock();
		});
	}
	log(`Acquired runtime counter ${runtimeCounter}`);
	const random = seedrandom(`runtime-id-${runtimeCounter}`);
	const runtimeId = "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c => (c ^ Math.floor(random() * 256) & 15 >> c / 4).toString(16));
	return [runtimeId, mutex != null];
}
