import { EventEmitter } from "stream";
import TypedEmitter from "typed-emitter";
import debug0 from "debug";
import Comlink from "comlink";
import {
	CODE_OK,
	CODE_ERROR,
	ERR_PACKET_UNKNOWN_COMMAND,
	ERR_OFFLINE,
	BROKER_COMMAND_NODE_RELAY,
	NODE_COMMAND_PING,
	NODE_COMMAND_PONG,
	NODE_COMMAND_MODULE_SYNC,
	NODE_COMMAND_MODULE_SYNC_ACK,
	NODE_COMMAND_MODULE_FLASH,
	NODE_COMMAND_MODULE_FLASH_ACK,
	NODE_COMMAND_MODULE_OPTION_GET,
	NODE_COMMAND_MODULE_OPTION_GET_ACK,
	NODE_COMMAND_MODULE_OPTION_SET,
	NODE_COMMAND_MODULE_OPTION_SET_ACK,
	NODE_COMMAND_MODULE_OPTION_DELETE,
	NODE_COMMAND_MODULE_OPTION_DELETE_ACK,
	NODE_COMMAND_MODULE_OPTION_LIST,
	NODE_COMMAND_MODULE_OPTION_LIST_ACK,
	DistributiveOmit, InjectStructPropertyCommand, ModuleInfo, NodeServerPacketDefintion,
	newStructType, newTempBuffer, newBufferReader, newBufferWriter
} from "./logic.shared";
import * as broker from "./broker.server.worker";
const debug = debug0("clamat:node");

const NodePingPacket = newStructType({ // Node -> Server, Server -> Node
	user: "ushort"
});
const NodePongPacket = newStructType({ // Node -> Server, Server -> Node
	user: "ushort"
});
const NodeModuleSyncPacket = newStructType({ // Node -> Server, Server -> Node
	user: "ushort",
	modules: [newStructType({
		name: "string",
		version: "string"
	}), "[]"] as const
});
const NodeModuleSyncAckPacket = newStructType({ // Node -> Server, Server -> Node
	user: "ushort",
	status: "ubyte",
	message: "string",
	modules: [newStructType({
		name: "string",
		version: "string"
	}), "[]"] as const
});
const NodeModuleFlashPacket = newStructType({ // Server -> Node
	user: "ushort",
	sourceCode: "buffer"
});
const NodeModuleFlashAckPacket = newStructType({ // Node -> Server
	user: "ushort",
	status: "ubyte",
	message: "string"
});
// NodeModuleRequestInstall
// NodeModuleRequestUninstall
const NodeModuleOptionGetPacket = newStructType({ // Node -> Server, Server -> Node
	user: "ushort",
	name: "string",
	ids: ["string", "[]"] as const
});
const NodeModuleOptionGetAckPacket = newStructType({ // Node -> Server, Server -> Node
	user: "ushort",
	status: "ubyte",
	message: "string",
	values: ["json", "[]"] as const
});
const NodeModuleOptionSetPacket = newStructType({ // Node -> Server, Server -> Node
	user: "ushort",
	name: "string",
	ids: ["string", "[]"] as const,
	values: ["json", "[]"] as const
});
const NodeModuleOptionSetAckPacket = newStructType({ // Node -> Server, Server -> Node
	user: "ushort",
	status: "ubyte",
	message: "string"
});
const NodeModuleOptionDeletePacket = newStructType({ // Node -> Server, Server -> Node
	user: "ushort",
	name: "string",
	ids: ["string", "[]"] as const
});
const NodeModuleOptionDeleteAckPacket = newStructType({ // Node -> Server, Server -> Node
	user: "ushort",
	status: "ubyte",
	message: "string"
});
const NodeModuleOptionListPacket = newStructType({ // Node -> Server, Server -> Node
	user: "ushort",
	name: "string"
});
const NodeModuleOptionListAckPacket = newStructType({ // Node -> Server, Server -> Node
	user: "ushort",
	status: "ubyte",
	message: "string",
	ids: ["string", "[]"] as const
});
const NodePackets = {
	[NODE_COMMAND_PING]: NodePingPacket as InjectStructPropertyCommand<typeof NodePingPacket, typeof NODE_COMMAND_PING>,
	[NODE_COMMAND_PONG]: NodePongPacket as InjectStructPropertyCommand<typeof NodePongPacket, typeof NODE_COMMAND_PONG>,
	[NODE_COMMAND_MODULE_SYNC]: NodeModuleSyncPacket as InjectStructPropertyCommand<typeof NodeModuleSyncPacket, typeof NODE_COMMAND_MODULE_SYNC>,
	[NODE_COMMAND_MODULE_SYNC_ACK]: NodeModuleSyncAckPacket as InjectStructPropertyCommand<typeof NodeModuleSyncAckPacket, typeof NODE_COMMAND_MODULE_SYNC_ACK>,
	[NODE_COMMAND_MODULE_FLASH]: NodeModuleFlashPacket as InjectStructPropertyCommand<typeof NodeModuleFlashPacket, typeof NODE_COMMAND_MODULE_FLASH>,
	[NODE_COMMAND_MODULE_FLASH_ACK]: NodeModuleFlashAckPacket as InjectStructPropertyCommand<typeof NodeModuleFlashAckPacket, typeof NODE_COMMAND_MODULE_FLASH_ACK>,
	[NODE_COMMAND_MODULE_OPTION_GET]: NodeModuleOptionGetPacket as InjectStructPropertyCommand<typeof NodeModuleOptionGetPacket, typeof NODE_COMMAND_MODULE_OPTION_GET>,
	[NODE_COMMAND_MODULE_OPTION_GET_ACK]: NodeModuleOptionGetAckPacket as InjectStructPropertyCommand<typeof NodeModuleOptionGetAckPacket, typeof NODE_COMMAND_MODULE_OPTION_GET_ACK>,
	[NODE_COMMAND_MODULE_OPTION_SET]: NodeModuleOptionSetPacket as InjectStructPropertyCommand<typeof NodeModuleOptionSetPacket, typeof NODE_COMMAND_MODULE_OPTION_SET>,
	[NODE_COMMAND_MODULE_OPTION_SET_ACK]: NodeModuleOptionSetAckPacket as InjectStructPropertyCommand<typeof NodeModuleOptionSetAckPacket, typeof NODE_COMMAND_MODULE_OPTION_SET_ACK>,
	[NODE_COMMAND_MODULE_OPTION_DELETE]: NodeModuleOptionDeletePacket as InjectStructPropertyCommand<typeof NodeModuleOptionDeletePacket, typeof NODE_COMMAND_MODULE_OPTION_DELETE>,
	[NODE_COMMAND_MODULE_OPTION_DELETE_ACK]: NodeModuleOptionDeleteAckPacket as InjectStructPropertyCommand<typeof NodeModuleOptionDeleteAckPacket, typeof NODE_COMMAND_MODULE_OPTION_DELETE_ACK>,
	[NODE_COMMAND_MODULE_OPTION_LIST]: NodeModuleOptionListPacket as InjectStructPropertyCommand<typeof NodeModuleOptionListPacket, typeof NODE_COMMAND_MODULE_OPTION_LIST>,
	[NODE_COMMAND_MODULE_OPTION_LIST_ACK]: NodeModuleOptionListAckPacket as InjectStructPropertyCommand<typeof NodeModuleOptionListAckPacket, typeof NODE_COMMAND_MODULE_OPTION_LIST_ACK>
};
const NodePacketNames = {
	[NODE_COMMAND_PING]: "NODE_COMMAND_PING",
	[NODE_COMMAND_PONG]: "NODE_COMMAND_PONG",
	[NODE_COMMAND_MODULE_SYNC]: "NODE_COMMAND_MODULE_SYNC",
	[NODE_COMMAND_MODULE_SYNC_ACK]: "NODE_COMMAND_MODULE_SYNC_ACK",
	[NODE_COMMAND_MODULE_FLASH]: "NODE_COMMAND_MODULE_FLASH",
	[NODE_COMMAND_MODULE_FLASH_ACK]: "NODE_COMMAND_MODULE_FLASH_ACK",
	[NODE_COMMAND_MODULE_OPTION_GET]: "NODE_COMMAND_MODULE_OPTION_GET",
	[NODE_COMMAND_MODULE_OPTION_GET_ACK]: "NODE_COMMAND_MODULE_OPTION_GET_ACK",
	[NODE_COMMAND_MODULE_OPTION_SET]: "NODE_COMMAND_MODULE_OPTION_SET",
	[NODE_COMMAND_MODULE_OPTION_SET_ACK]: "NODE_COMMAND_MODULE_OPTION_SET_ACK",
	[NODE_COMMAND_MODULE_OPTION_DELETE]: "NODE_COMMAND_MODULE_OPTION_DELETE",
	[NODE_COMMAND_MODULE_OPTION_DELETE_ACK]: "NODE_COMMAND_MODULE_OPTION_DELETE_ACK",
	[NODE_COMMAND_MODULE_OPTION_LIST]: "NODE_COMMAND_MODULE_OPTION_LIST",
	[NODE_COMMAND_MODULE_OPTION_LIST_ACK]: "NODE_COMMAND_MODULE_OPTION_LIST_ACK"
};
type NodePacketStructs = ReturnType<(typeof NodePackets)[keyof typeof NodePackets]["read"]>;
const getNodeTempBuffer = newTempBuffer();
function decodeNodePacket(buffer: Buffer) {
	const reader = newBufferReader(buffer);
	const command = reader.readUByte() as keyof typeof NodePackets;
	const structType = NodePackets[command];
	if(structType == null)
		throw ERR_PACKET_UNKNOWN_COMMAND;
	const struct = structType.read(reader);
	struct.command = command;
	return struct;
}
function encodeNodePacket(object: NodePacketStructs) {
	const command = object.command;
	const structType = NodePackets[command] as any;
	if(structType == null)
		throw ERR_PACKET_UNKNOWN_COMMAND;
	const buffer = getNodeTempBuffer(1 + structType.length(object));
	const writer = newBufferWriter(buffer);
	writer.writeUByte(command);
	structType.write(object, writer);
	return buffer;
}

type NodeContext = ReturnType<typeof newNodeContext>;
const nodeContexts = new Map<number, NodeContext>();
function newNodeContext(nodeId: number) {
	const context = {} as {
		id: typeof nodeId;
		brokers: typeof brokers;
		readBuffer: typeof readBuffer;
		readLock: typeof readLock;
		readPacket: typeof readPacket;
		writePacket: typeof writePacket;
		userCounter: typeof userCounter;
		waitingMessages: typeof waitingMessages;
		requestResponsePacket: typeof requestResponsePacket;
		syncNodeModules: typeof syncNodeModules;
		doSyncNodeModules: typeof doSyncNodeModules;
		syncNodeModuleOptions: typeof syncNodeModuleOptions;
		getNodeModuleOptions: typeof getNodeModuleOptions;
		setNodeModuleOptions: typeof setNodeModuleOptions;
		deleteNodeModuleOptions: typeof deleteNodeModuleOptions;
		listNodeModuleOptions: typeof listNodeModuleOptions;
	};
	context.id = nodeId;
	const brokers = new Set<number>();
	context.brokers = brokers;

	const readBuffer = [] as NodePacketStructs[];
	let readLock = null as () => void;
	const readPacket = async () => {
		let result: NodePacketStructs;
		while((result = readBuffer.shift()) == null)
			await new Promise(r => context.readLock = readLock = () => r(null));
		return result;
	};
	const writePacket = async (packet: NodePacketStructs) => {
		await broker.sendNodePacket({
			command: BROKER_COMMAND_NODE_RELAY,
			nodeId: nodeId,
			flag: 0,
			message: encodeNodePacket(packet)
		});
	};
	context.readBuffer = readBuffer;
	context.readLock = readLock;
	context.readPacket = readPacket;
	context.writePacket = writePacket;

	type PacketsWithUserId = Extract<NodePacketStructs, { user: number }>;
	let userCounter = 0;
	const waitingMessages = new Map<number, [number, (r: PacketsWithUserId) => void, (e: any) => void]>();
	const requestResponsePacket = async <ACK extends PacketsWithUserId["command"]>(packet: DistributiveOmit<PacketsWithUserId, "user"> & { user?: number }, ackCommand: ACK, timeout: number = 10 * 1000) => {
		type AckPacket = Extract<PacketsWithUserId, { command: ACK }>;
		let user = packet.user;
		if(user == null) {
			if(userCounter >= 2 ** 16)
				userCounter = context.userCounter = 0;
			user = packet.user = userCounter = context.userCounter++;
		}
		let resolve: (r: AckPacket) => void;
		let reject: (e: any) => void;
		const promise = new Promise<AckPacket>((res, rej) => { resolve = res; reject = rej; });
		const timeoutHandle = timeout != null ? setTimeout(() => reject(new Error(`Waiting response packet timed out`)), timeout) : null;
		waitingMessages.set(user, [ackCommand, resolve, reject]);
		await writePacket(packet as any);
		try {
			return await promise;
		} finally {
			if(timeoutHandle != null)
				clearTimeout(timeoutHandle);
			waitingMessages.delete(user);
		}
	};
	context.userCounter = userCounter;
	context.waitingMessages = waitingMessages;
	context.requestResponsePacket = requestResponsePacket;

	const syncNodeModules = async () => {
		if(nodeModuleNegotiator == null)
			throw new Error("Node module negotiator is not available");
		const localModuleInfos = await nodeModuleNegotiator.forNode(nodeId);
		const remoteModuleInfos = (await requestResponsePacket({
			command: NODE_COMMAND_MODULE_SYNC,
			modules: localModuleInfos
		}, NODE_COMMAND_MODULE_SYNC_ACK)).modules;
		await doSyncNodeModules(localModuleInfos, remoteModuleInfos);
	};
	const doSyncNodeModules = async (localModuleInfos: ModuleInfo[], remoteModuleInfos: ModuleInfo[]) => {
		if(nodeModuleNegotiator == null)
			throw new Error("Node module negotiator is not available");
		debug(`Syncing modules at node ${nodeId}`);
		const comparations = await nodeModuleNegotiator.compare(localModuleInfos, remoteModuleInfos);
		const promises = [];
		// for (const comparation of comparations) {
		// 	if (comparation.action == "install" || comparation.action == "replace")
		// 		promises.push(installNodeModule(comparation));
		// 	if (comparation.action == "uninstall")
		// 		promises.push(uninstallNodeModule(comparation.name));
		// }
		await Promise.all(promises);
	};
	const syncNodeModuleOptions = async (moduleName: string) => {
		if(nodeModuleNegotiator == null)
			throw new Error("Node module negotiator is not available");
		const localOptionIds = await nodeModuleNegotiator.listOptions(nodeId, moduleName);
		const localOptions = await nodeModuleNegotiator.getOptions(nodeId, moduleName, localOptionIds);
		const remoteOptionIds = await listNodeModuleOptions(moduleName);
		const deletedKeys = remoteOptionIds.filter(k => !localOptionIds.includes(k));
		if(deletedKeys.length > 0)
			await deleteNodeModuleOptions(moduleName, deletedKeys);
		await setNodeModuleOptions(moduleName, localOptionIds, localOptions);
	};
	const getNodeModuleOptions = async (moduleName: string, ids: string[]) => {
		debug(`Getting module ${moduleName} options ${ids.join()} from node ${nodeId}`);
		const response = await requestResponsePacket({
			command: NODE_COMMAND_MODULE_OPTION_GET,
			name: moduleName,
			ids: ids
		}, NODE_COMMAND_MODULE_OPTION_GET_ACK);
		if(response.status == CODE_OK)
			return response.values;
		if(response.status == CODE_ERROR)
			throw new Error(`Error while getting module options: ${response.message}`);
		throw new Error(`Unknown code while getting module options: ${response.status}`);
	};
	const setNodeModuleOptions = async (moduleName: string, ids: string[], values: any[]) => {
		debug(`Setting module ${moduleName} options ${ids.join()} to node ${nodeId}`);
		const response = await requestResponsePacket({
			command: NODE_COMMAND_MODULE_OPTION_SET,
			name: moduleName,
			ids: ids,
			values: values
		}, NODE_COMMAND_MODULE_OPTION_SET_ACK);
		if(response.status == CODE_OK)
			return;
		if(response.status == CODE_ERROR)
			throw new Error(`Error while getting module options: ${response.message}`);
		throw new Error(`Unknown code while getting module options: ${response.status}`);
	};
	const deleteNodeModuleOptions = async (moduleName: string, ids: string[]) => {
		debug(`Deleting module ${moduleName} options ${ids.join()} from node ${nodeId}`);
		const response = await requestResponsePacket({
			command: NODE_COMMAND_MODULE_OPTION_DELETE,
			name: moduleName,
			ids: ids
		}, NODE_COMMAND_MODULE_OPTION_DELETE_ACK);
		if(response.status == CODE_OK)
			return;
		if(response.status == CODE_ERROR)
			throw new Error(`Error while deleting module options: ${response.message}`);
		throw new Error(`Unknown code while deleting module options: ${response.status}`);
	};
	const listNodeModuleOptions = async (moduleName: string) => {
		debug(`Listing module ${moduleName} options from node ${nodeId}`);
		const response = await requestResponsePacket({
			command: NODE_COMMAND_MODULE_OPTION_LIST,
			name: moduleName
		}, NODE_COMMAND_MODULE_OPTION_LIST_ACK);
		if(response.status == CODE_OK)
			return response.ids;
		if(response.status == CODE_ERROR)
			throw new Error(`Error while listing module options: ${response.message}`);
		throw new Error(`Unknown code while listing module options: ${response.status}`);
	};
	context.syncNodeModules = syncNodeModules;
	context.doSyncNodeModules = doSyncNodeModules;
	context.syncNodeModuleOptions = syncNodeModuleOptions;
	context.getNodeModuleOptions = getNodeModuleOptions;
	context.setNodeModuleOptions = setNodeModuleOptions;
	context.deleteNodeModuleOptions = deleteNodeModuleOptions;
	context.listNodeModuleOptions = listNodeModuleOptions;

	const onNodePacketReceive = (packet: NodePacketStructs) => {
		debug(`Received ${NodePacketNames[packet.command]} packet from node ${nodeId}`);
		if((packet as any).user != null) {
			const user = (packet as any).user;
			const info = waitingMessages.get(user);
			if(info != null && info[0] == packet.command) {
				info[1](packet as any);
				return;
			}
		}
		if(packet.command == NODE_COMMAND_PING) {
			writePacket({
				command: NODE_COMMAND_PONG,
				user: packet.user
			});
			return;
		}
		if(packet.command == NODE_COMMAND_MODULE_SYNC) {
			if(nodeModuleNegotiator == null) {
				writePacket({
					command: NODE_COMMAND_MODULE_SYNC_ACK,
					user: packet.user,
					status: CODE_ERROR,
					message: "Server is not ready yet",
					modules: []
				});
				return;
			}
			nodeModuleNegotiator.forNode(nodeId).then( // no await
				m => {
					writePacket({
						command: NODE_COMMAND_MODULE_SYNC_ACK,
						user: packet.user,
						status: CODE_OK,
						message: "",
						modules: m
					});
					doSyncNodeModules(m, packet.modules);
				},
				e => {
					writePacket({
						command: NODE_COMMAND_MODULE_SYNC_ACK,
						user: packet.user,
						status: CODE_ERROR,
						message: e.stack,
						modules: []
					});
				}
			);
			return;
		}
		if(packet.command == NODE_COMMAND_MODULE_OPTION_GET) {
			if(nodeModuleNegotiator == null) {
				writePacket({
					command: NODE_COMMAND_MODULE_OPTION_GET_ACK,
					user: packet.user,
					status: CODE_ERROR,
					message: "Server is not ready yet",
					values: []
				});
				return;
			}
			nodeModuleNegotiator.getOptions(nodeId, packet.name, packet.ids).then( // no await
				m => {
					writePacket({
						command: NODE_COMMAND_MODULE_OPTION_GET_ACK,
						user: packet.user,
						status: CODE_OK,
						message: "",
						values: m
					});
				},
				e => {
					writePacket({
						command: NODE_COMMAND_MODULE_OPTION_GET_ACK,
						user: packet.user,
						status: CODE_ERROR,
						message: e.stack,
						values: []
					});
				}
			);
			return;
		}
		if(packet.command == NODE_COMMAND_MODULE_OPTION_SET) {
			if(nodeModuleNegotiator == null) {
				writePacket({
					command: NODE_COMMAND_MODULE_OPTION_SET_ACK,
					user: packet.user,
					status: CODE_ERROR,
					message: "Server is not ready yet"
				});
				return;
			}
			nodeModuleNegotiator.setOptions(nodeId, packet.name, packet.ids, packet.values).then( // no await
				() => {
					writePacket({
						command: NODE_COMMAND_MODULE_OPTION_SET_ACK,
						user: packet.user,
						status: CODE_OK,
						message: ""
					});
				},
				e => {
					writePacket({
						command: NODE_COMMAND_MODULE_OPTION_SET_ACK,
						user: packet.user,
						status: CODE_ERROR,
						message: e.stack
					});
				}
			);
			return;
		}
		if(packet.command == NODE_COMMAND_MODULE_OPTION_DELETE) {
			if(nodeModuleNegotiator == null) {
				writePacket({
					command: NODE_COMMAND_MODULE_OPTION_DELETE_ACK,
					user: packet.user,
					status: CODE_ERROR,
					message: "Server is not ready yet"
				});
				return;
			}
			nodeModuleNegotiator.deleteOptions(nodeId, packet.name, packet.ids).then( // no await
				() => {
					writePacket({
						command: NODE_COMMAND_MODULE_OPTION_DELETE_ACK,
						user: packet.user,
						status: CODE_OK,
						message: ""
					});
				},
				e => {
					writePacket({
						command: NODE_COMMAND_MODULE_OPTION_DELETE_ACK,
						user: packet.user,
						status: CODE_ERROR,
						message: e.stack
					});
				}
			);
			return;
		}
		if(packet.command == NODE_COMMAND_MODULE_OPTION_LIST) {
			if(nodeModuleNegotiator == null) {
				writePacket({
					command: NODE_COMMAND_MODULE_OPTION_LIST_ACK,
					user: packet.user,
					status: CODE_ERROR,
					message: "Server is not ready yet",
					ids: []
				});
				return;
			}
			nodeModuleNegotiator.listOptions(nodeId, packet.name).then( // no await
				k => {
					writePacket({
						command: NODE_COMMAND_MODULE_OPTION_LIST_ACK,
						user: packet.user,
						status: CODE_OK,
						message: "",
						ids: k
					});
				},
				e => {
					writePacket({
						command: NODE_COMMAND_MODULE_OPTION_LIST_ACK,
						user: packet.user,
						status: CODE_ERROR,
						message: e.stack,
						ids: []
					});
				}
			);
			return;
		}
		const serverModuleId = packetModules.get(packet.command);
		if(serverModuleId != null) {
			const serverModule = serverModules.get(serverModuleId);
			serverModule.onReceive(nodeId, packet);
			return;
		}
	};
	(async () => {
		while(true) {
			const packet = await readPacket();
			if((packet as any) == ERR_OFFLINE) break;
			onNodePacketReceive(packet);
		}
	})();
	return context;
}
broker.brokerEmitter.on("nodejoin", Comlink.transfer((nodeId, brokerId) => {
	let nodeContext = nodeContexts.get(nodeId);
	if(nodeContext == null) {
		nodeContext = newNodeContext(nodeId);
		nodeContexts.set(nodeId, nodeContext);
	}
	if(!nodeContext.brokers.has(brokerId))
		nodeContext.brokers.add(brokerId);
	if(nodeContext.brokers.size == 1)
		nodeEmitter.emit("join", nodeId);
}));
broker.brokerEmitter.on("nodeleave", Comlink.transfer((nodeId, brokerId) => {
	const nodeContext = nodeContexts.get(nodeId);
	if(nodeContext == null) return;
	if(nodeContext.brokers.has(brokerId))
		nodeContext.brokers.delete(brokerId);
	if(nodeContext.brokers.size == 0) {
		nodeContexts.delete(nodeId);
		nodeEmitter.emit("leave", nodeId);
		nodeContext.readBuffer.push(ERR_OFFLINE as any);
		if(nodeContext.readLock != null) {
			nodeContext.readLock();
			nodeContext.readLock = null;
		}
	}
}));
broker.brokerEmitter.on("nodereceive", Comlink.transfer((nodeId, packet) => {
	const nodeContext = nodeContexts.get(nodeId);
	if(nodeContext == null) {
		debug(`Received packet for ${nodeId}, but the node is not joined`);
		return;
	}
	if(packet.command != BROKER_COMMAND_NODE_RELAY) return;
	const nodePacket = (() => {
		try {
			return decodeNodePacket(packet.message);
		} catch(e) {
			if(e == ERR_PACKET_UNKNOWN_COMMAND) {
				debug(`Received unknown command from node ${nodeId}`);
				return null;
			}
			throw e;
		}
	})();
	if(nodePacket == null)
		return;
	nodeContext.readBuffer.push(nodePacket);
	if(nodeContext.readLock != null) {
		nodeContext.readLock();
		nodeContext.readLock = null;
	}
}));
export const nodeEmitter = new EventEmitter() as TypedEmitter<{
	join: (nodeId: number) => void;
	leave: (nodeId: number) => void;
}>;
let nodeModuleNegotiator: {
	forNode: (nodeId: number) => Promise<ModuleInfo[]>;
	compare: (localModuleInfos: ModuleInfo[], remoteModuleInfos: ModuleInfo[]) => Promise<({ action: "install" | "replace" } & ModuleInfo | { action: "uninstall", name: string })[]>;
	flashBinary: (moduleInfos: ModuleInfo[]) => Promise<Buffer>;
	getOptions: (nodeId: number, name: string, ids: string[]) => Promise<any[]>;
	setOptions: (nodeId: number, name: string, ids: string[], values: any[]) => Promise<void>;
	deleteOptions: (nodeId: number, name: string, ids: string[]) => Promise<void>;
	listOptions: (nodeId: number, name: string) => Promise<string[]>;
};
export async function setNodeModuleNegotiator(negotiator: typeof nodeModuleNegotiator) {
	nodeModuleNegotiator = negotiator;
	const promises = [];
	for(const nodeContext of nodeContexts.values())
		promises.push(nodeContext.syncNodeModules());
	await Promise.all(promises);
}
const __doNode = <A extends Array<any>, R>(cb: (nodeContext: NodeContext, ...args: A) => Promise<R> | R) => {
	return async (nodeId: number, ...args: A) => {
		const nodeContext = nodeContexts.get(nodeId);
		if(nodeContext == null) throw ERR_OFFLINE;
		return await cb(nodeContext, ...args);
	};
};
export const writePacket = __doNode((c, packet: NodePacketStructs) => c.writePacket(packet));
export const syncNodeModules = __doNode(c => c.syncNodeModules());
export const syncNodeModuleOptions = __doNode((c, name: string) => c.syncNodeModuleOptions(name));
export const getNodeModuleOptions = __doNode((c, name: string, ids: string[]) => c.getNodeModuleOptions(name, ids));
export const setNodeModuleOptions = __doNode((c, name: string, ids: string[], values: any[]) => c.setNodeModuleOptions(name, ids, values));
export const deleteNodeModuleOptions = __doNode((c, name: string, ids: string[]) => c.deleteNodeModuleOptions(name, ids));
export const listNodeModuleOptions = __doNode((c, name: string) => c.listNodeModuleOptions(name));

interface ServerModule {
	name: string;
	version: string;
	packetDefinitions: NodeServerPacketDefintion[];
	onReceive: (nodeId: number, packet: any) => void;
}
const serverModules = new Map<string, ServerModule>();
const packetModules = new Map<number, string>();
export async function installServerNodeModule(moduleInfo: ModuleInfo, packetDefinitions: NodeServerPacketDefintion[], onReceive: (packet: any) => void) {
	if(serverModules.get(moduleInfo.name)?.version == moduleInfo.version)
		return;
	for(const packetDefinition of packetDefinitions) {
		if(NodePackets[packetDefinition.command] == null) continue;
		if(packetModules.get(packetDefinition.command) == moduleInfo.name) continue;
		throw new Error(`Error while installing server node module: Conflict packet id ${packetDefinition.name} with ${NodePacketNames[packetDefinition.command]}`);
	}
	if(serverModules.has(moduleInfo.name))
		await uninstallServerNodeModule(moduleInfo.name);
	const serverModule: ServerModule = {
		name: moduleInfo.name,
		version: moduleInfo.version,
		packetDefinitions: packetDefinitions,
		onReceive: onReceive
	};
	serverModules.set(moduleInfo.name, serverModule);
	for(const packetDefinition of packetDefinitions) {
		NodePackets[packetDefinition.command] = newStructType(packetDefinition.properties);
		NodePacketNames[packetDefinition.command] = `(${moduleInfo.name}) ${packetDefinition.name}`;
		packetModules.set(packetDefinition.command, moduleInfo.name);
	}
}
export async function uninstallServerNodeModule(name: string) {
	const serverModule = serverModules.get(name);
	if(serverModule == null) return;
	const packetDefinitions = serverModule.packetDefinitions;
	for(const packetDefinition of packetDefinitions) {
		delete NodePackets[packetDefinition.command];
		delete NodePacketNames[packetDefinition.command];
		packetModules.delete(packetDefinition.command);
	}
	serverModules.delete(name);
}
