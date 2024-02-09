import { Log, debug, newRequire } from "./next.config.shared.mjs";

const log = debug("build:plugin:withWorker");
const require = newRequire(import.meta.url);

// This plugin depends on RuntimeId, RuntimeConfig

export default function withWorker(nextConfig = {}) {
	log("Initializing plugin...");
	const path = require("path");
	const url = require("url");
	const net = require("net");
	const { fork } = require("child_process");
	const lodash = require("lodash");
	const underscoreQuery = require("underscore-query")(lodash, false);
	const seedrandom = require("seedrandom");
	const { snapshot } = require("process-list");
	const sharedMemory = require("@markusjx/shared_memory");
	const constants = require("next/dist/lib/constants");

	const base = path.dirname(url.fileURLToPath(import.meta.url));
	const COMLINK = path.resolve(path.join(base, "./next.config.withWorker.comlink.js"));
	const LOADER_PARENT = path.resolve(path.join(base, "./next.config.withWorker.loader-parent.js"));
	const LOADER_CHILD = path.resolve(path.join(base, "./next.config.withWorker.loader-child.js"));
	const IPC_SERVER_MANAGEMENT = path.resolve(path.join(base, "./next.config.withWorker.ipc-server-management.js"));
	const IPC_SERVER_PARENT = path.resolve(path.join(base, "./next.config.withWorker.ipc-server-parent.js"));
	const IPC_SERVER_CHILD = path.resolve(path.join(base, "./next.config.withWorker.ipc-server-child.js"));
	const IPC_SERVER_SYNCWORKER = path.resolve(path.join(base, "./next.config.withWorker.ipc-server-syncworker.js"));
	const IPC_CLIENT_MANAGEMENT = path.resolve(path.join(base, "./next.config.withWorker.ipc-client-management.js"));
	const IPC_CLIENT_PARENT = path.resolve(path.join(base, "./next.config.withWorker.ipc-client-parent.js"));
	const IPC_CLIENT_CHILD = path.resolve(path.join(base, "./next.config.withWorker.ipc-client-child.js"));
	const IPC_CLIENT_SERVICEWORKER = path.resolve(path.join(base, "./next.config.withWorker.ipc-client-serviceworker.js"));
	const webpackLoadersQuery = {
		$or: [
			{
				$and: [
					{ $: { $cb() { return lodash.isString(this.loader); } } },
					{ $: { $cb() { return /next-swc-loader/.test(this.loader); } } }
				]
			},
			{
				$and: [
					{ $: { $cb() { return lodash.isArray(this.loader); } } },
					{ $: { $cb() { return this.loader.some(l => /next-swc-loader/.test(l)); } } }
				]
			}
		]
	};
	const webpackUseLoadersQuery = {
		$or: [
			{
				$and: [
					{ $: { $cb() { return lodash.isArray(this.use); } } },
					{ use: { $elemMatch: webpackLoadersQuery } },
					{ $: { $cb() { return this.include != null; } } },
					{ $: { $cb() { return this.exclude != null; } } },
					{ $: { $cb() { return this.issuerLayer == null; } } }
				]
			},
			{
				$and: [
					{ $: { $cb() { return lodash.isPlainObject(this.use); } } },
					{ $: { $cb() { return underscoreQuery([this.use], webpackLoadersQuery).length > 0; } } },
					{ $: { $cb() { return this.include != null; } } },
					{ $: { $cb() { return this.exclude != null; } } },
					{ $: { $cb() { return this.issuerLayer == null; } } }
				]
			}
		]
	};
	const webpackOneOfRulesQuery = {
		oneOf: { $elemMatch: webpackUseLoadersQuery }
	};
	function assertQuery(mock, query, expect) {
		const result = underscoreQuery(mock, query);
		if(result.length > 0 == expect) return;
		throw new Error(`Query does not match. Expecting "${expect}" from test data \`${JSON.stringify(mock)}\``);
	}
	assertQuery([{ oneOf: [{ use: { loader: "next-swc-loader" }, include: [], exclude: () => {} }] }], webpackOneOfRulesQuery, true);
	assertQuery([{ oneOf: [{ use: { loader: ["next-swc-loader"] }, include: [], exclude: () => {} }] }], webpackOneOfRulesQuery, true);
	assertQuery([{ oneOf: [{ use: [{ loader: "next-swc-loader" }], include: [], exclude: () => {} }] }], webpackOneOfRulesQuery, true);
	assertQuery([{ oneOf: [{ use: [{ loader: ["next-swc-loader"] }], include: [], exclude: () => {} }] }], webpackOneOfRulesQuery, true);
	assertQuery([{ oneOf: [{ use: { loader: "next-swc-loader" } }] }], webpackOneOfRulesQuery, false);
	assertQuery([{ oneOf: [{ use: { loader: ["next-swc-loader"] } }] }], webpackOneOfRulesQuery, false);
	assertQuery([{ oneOf: [{ use: [{ loader: "next-swc-loader" }] }] }], webpackOneOfRulesQuery, false);
	assertQuery([{ oneOf: [{ use: [{ loader: ["next-swc-loader"] }] }] }], webpackOneOfRulesQuery, false);

	const ipcServerManagementMemoryId = (() => {
		const random = seedrandom(process.env.RUNTIME_ID);
		const memoryId = `next-worker-memory-${Math.floor(random() * 65535)}`;
		try { global.__next_worker_management_memory__ = new sharedMemory(memoryId, 8192, false, true); } catch(e) { }
		return memoryId;
	})();
	const ipcServerManagementPort = (() => {
		const random = seedrandom(process.env.RUNTIME_ID);
		const port = 16384 + Math.floor(random() * 8000);
		const isManagementOpen = new Promise((resolve, reject) => {
			const timeoutHandle = setTimeout(() => reject(new Error("Timeout")), 5000);
			const server = net.createServer(s => s.destroy());
			server.on("error", () => { server.close(); clearTimeout(timeoutHandle); resolve(false); });
			server.on("listening", () => { server.close(); clearTimeout(timeoutHandle); resolve(true); });
			server.listen(port);
		});
		isManagementOpen.then(v => {
			if(!v) return;
			const child = fork(IPC_SERVER_MANAGEMENT, {
				stdio: "pipe",
				execArgv: ["--openssl-legacy-provider"],
				env: {
					...process.env,
					__NEXT_WORKER_MANAGEMENT_MEMORY_ID__: ipcServerManagementMemoryId,
					__NEXT_WORKER_MANAGEMENT_PORT__: port
				}
			});
			child.stdout.pipe(process.stdout);
			child.stderr.pipe(process.stderr);
			const killChild = async () => {
				const currentProcessList = await snapshot(["pid", "ppid"]);
				const parentToKill = [child.pid];
				while(parentToKill.length > 0) {
					const parentPid = parentToKill.shift();
					try {
						process.kill(parentPid);
						parentToKill.push(...currentProcessList.filter(p => p.ppid == parentPid).map(p => p.pid));
					} catch(e) { }
				}
			};
			process.on("exit", killChild);
			process.on("SIGINT", killChild);
			process.on("SIGUSR1", killChild);
			process.on("SIGUSR2", killChild);
		});
		return port;
	})();

	const serverRuntimeConfig = nextConfig.serverRuntimeConfig;
	if(serverRuntimeConfig == null)
		throw new Error("serverRuntimeConfig must not be null");
	serverRuntimeConfig[Symbol.for("__NEXT_WORKER_MANAGEMENT_MEMORY_ID__")] = ipcServerManagementMemoryId;
	serverRuntimeConfig[Symbol.for("__NEXT_WORKER_MANAGEMENT_PORT__")] = ipcServerManagementPort;
	return {
		experimental: {
			...nextConfig.experimental,
			serverComponentsExternalPackages: [
				...(nextConfig.experimental?.serverComponentsExternalPackages || []),
				"deasync",
				"@markusjx/shared_memory",
				"@markusjx/shared_mutex"
			]
		},
		webpack(config, options) {
			log("Adding resolve loader alias...");
			config.resolveLoader.alias = {
				...config.resolveLoader.alias,
				"next-worker-loader-parent": LOADER_PARENT,
				"next-worker-loader-child": LOADER_CHILD
			};

			log("Adding resolve alias...");
			config.resolve.alias = {
				...config.resolve.alias,
				comlink: COMLINK
			};

			log("Adding entry...");
			const originalEntry = config.entry;
			config.entry = async () => {
				const entry = typeof originalEntry == "function" ? await originalEntry() : originalEntry;
				if(options.isServer) return entry;
				return {
					...entry,
					"ipc-client-serviceworker": {
						dependOn: undefined,
						runtime: false,
						import: IPC_CLIENT_SERVICEWORKER
					},
					"ipc-client-management": {
						dependOn: undefined,
						runtime: false,
						import: IPC_CLIENT_MANAGEMENT
					}
				};
			};

			log("Adding javascript rules...");
			const oneOfRule = underscoreQuery(config.module.rules, webpackOneOfRulesQuery)[0]?.oneOf;
			if(oneOfRule == null)
				Log.error("next-worker: Cannot find javascript rules!");
			else {
				const targetLoader = underscoreQuery(oneOfRule, webpackUseLoadersQuery)[0];
				if(targetLoader == null)
					Log.error("next-worker: Cannot find javascript target loaders!");
				else {
					oneOfRule.unshift({
						test: /\.worker\.(tsx|ts|js|cjs|mjs|jsx)$/,
						include: targetLoader.include,
						exclude: targetLoader.exclude,
						use: [
							{
								loader: "next-worker-loader-parent",
								options: {
									isServer: options.isServer,
									// inline: !options.dev ? "no-fallback" : undefined,
									ipcServerParent: IPC_SERVER_PARENT,
									ipcServerSyncworker: IPC_SERVER_SYNCWORKER,
									ipcClientParent: IPC_CLIENT_PARENT
								}
							},
							{
								loader: "next-worker-loader-child",
								options: {
									isServer: options.isServer,
									ipcServerChild: IPC_SERVER_CHILD,
									ipcServerSyncworker: IPC_SERVER_SYNCWORKER,
									ipcClientChild: IPC_CLIENT_CHILD
								}
							},
							...lodash.castArray(targetLoader.use)
						]
					});
					oneOfRule.unshift({
						issuerLayer: { or: [...constants.WEBPACK_LAYERS.GROUP.server, ...constants.WEBPACK_LAYERS.GROUP.nonClientServerTarget] },
						test: /\.client\.worker\.(tsx|ts|js|cjs|mjs|jsx)$/,
						include: targetLoader.include,
						exclude: targetLoader.exclude,
						loader: "next-invalid-import-error-loader",
						options: { message: `Client worker cannot be imported from Server Component module. It should be only be used from a Client Component.` }
					});
					oneOfRule.unshift({
						issuerLayer: { not: ["", ...constants.WEBPACK_LAYERS.GROUP.server, ...constants.WEBPACK_LAYERS.GROUP.nonClientServerTarget] },
						test: /\.server\.worker\.(tsx|ts|js|cjs|mjs|jsx)$/,
						include: targetLoader.include,
						exclude: targetLoader.exclude,
						loader: "next-invalid-import-error-loader",
						options: { message: `Server worker cannot be imported from Client Component module. It should be only be used from a Server Component.` }
					});
				}
			}

			if(typeof nextConfig.webpack == "function")
				return nextConfig.webpack(config, options);
			return config;
		}
	};
}
