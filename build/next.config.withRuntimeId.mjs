import { debug, newRequire } from "./next.config.shared.mjs";

const log = debug("build:plugin:withRuntimeId");
const require = newRequire(import.meta.url);

export default function withRuntimeId(nextConfig = {}) {
	log("Initializing plugin...");
	const path = require("path");
	const url = require("url");
	const { spawn, spawnSync } = require("child_process");

	const base = path.dirname(url.fileURLToPath(import.meta.url));
	const WORKER = path.resolve(path.join(base, "./next.config.withRuntimeId.worker.js"));

	const serverRuntimeConfig = nextConfig.serverRuntimeConfig;
	const publicRuntimeConfig = nextConfig.publicRuntimeConfig;
	if(serverRuntimeConfig == null || serverRuntimeConfig == null)
		throw new Error("serverRuntimeConfig or publicRuntimeConfig must not be null");
	const projectName = publicRuntimeConfig.PROJECT_NAME;

	log(`Getting runtime id from worker`);
	const runtimeId = (() => {
		const port = (() => {
			const spawned = spawnSync(process.execPath, ["-e", 'new Promise(((e,t)=>{const r=require("net").createServer();r.unref(),r.on("error",(e=>t(e))),r.listen((()=>{const{port:t}=r.address();r.close((()=>e(t)))}))})).then((e=>process.stdout.write(`${e}`))).catch((e=>setTimeout((()=>{throw e}))));'], { windowsHide: true, maxBuffer: Infinity });
			if(spawned.error)
				throw new Error(spawned.error);
			if(spawned.status != 0)
				throw new Error(spawned.stderr.toString() || `find port exited with code ${spawned.status}`);
			const response = spawned.stdout.toString("utf-8");
			if(!/^[0-9]+$/.test(response))
				throw new Error(`Invalid port number string returned: "${response}"`);
			return parseInt(response, 10);
		})();
		const child = spawn(process.execPath, [WORKER, port, projectName], { stdio: "inherit", windowsHide: true });
		child.unref();
		const killChild = () => process.kill(child.pid);
		process.on("exit", killChild);
		process.on("SIGINT", killChild);
		process.on("SIGUSR1", killChild);
		process.on("SIGUSR2", killChild);
		(() => {
			const timeout = Date.now() + 10000;
			let error;
			let response;
			while(Date.now() < timeout && (response?.state != "resolved" || response?.value != "pong")) {
				const spawned = spawnSync(process.execPath, ["-e", `const c=require("net").connect(${port},"127.0.0.1",(()=>{c.pipe(process.stdout),c.end(${JSON.stringify("ping\r\n").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029")})}));`], { windowsHide: true, maxBuffer: Infinity });
				if(spawned.error)
					error = spawned.error;
				if(spawned.status != 0)
					error = spawned.stderr.toString() || `wait runtime id exited with code ${spawned.status}`;
				response = (() => { try { return JSON.parse(spawned.stdout.toString("utf-8")); } catch(_) { return null; } })();
			}
			if(response == null || response.state != "resolved" || response?.value != "pong")
				throw new Error(`Too long waiting runtime id worker to start, Error: ${error || response.value}`);
		})();
		return (() => {
			const spawned = spawnSync(process.execPath, ["-e", `const c=require("net").connect(${port},"127.0.0.1",(()=>{c.pipe(process.stdout),c.end(${JSON.stringify("init\r\n").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029")})}));`], { windowsHide: true, maxBuffer: Infinity });
			if(spawned.error)
				throw new Error(spawned.error);
			if(spawned.status != 0)
				throw new Error(spawned.stderr.toString() || `initialize runtime id exited with code ${spawned.status}`);
			const response = (() => { try { return JSON.parse(spawned.stdout.toString("utf-8")); } catch(_) { return null; } })();
			if(response?.state != "resolved")
				throw new Error(`Error while initializing runtime id. Error: ${response?.value}`);
			const [resultId, isOwner] = response.value;
			if(!isOwner) {
				killChild();
				process.off("exit", killChild);
				process.off("SIGINT", killChild);
				process.off("SIGUSR1", killChild);
				process.off("SIGUSR2", killChild);
			}
			return resultId;
		})();
	})();
	serverRuntimeConfig.RUNTIME_ID = runtimeId;
	process.env.RUNTIME_ID = runtimeId;
	log(`Current runtime id ${runtimeId}`);
	return {};
}
