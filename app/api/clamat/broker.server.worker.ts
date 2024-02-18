import * as net from "net";
import { EventEmitter } from "stream";
import TypedEmitter from "typed-emitter";
import debug0 from "debug";
import {
	CODE_OK,
	CODE_ERROR,
	ERR_PACKET_UNKNOWN_COMMAND,
	ERR_OFFLINE,
	BROKER_COMMAND_IDENTIFY,
	BROKER_COMMAND_IDENTIFY_ACK,
	BROKER_COMMAND_PING,
	BROKER_COMMAND_PONG,
	BROKER_COMMAND_MODULE_SYNC,
	BROKER_COMMAND_MODULE_SYNC_ACK,
	BROKER_COMMAND_MODULE_INSTALL,
	BROKER_COMMAND_MODULE_INSTALL_ACK,
	BROKER_COMMAND_MODULE_UNINSTALL,
	BROKER_COMMAND_MODULE_UNINSTALL_ACK,
	BROKER_COMMAND_MODULE_OPTION_GET,
	BROKER_COMMAND_MODULE_OPTION_GET_ACK,
	BROKER_COMMAND_MODULE_OPTION_SET,
	BROKER_COMMAND_MODULE_OPTION_SET_ACK,
	BROKER_COMMAND_MODULE_OPTION_DELETE,
	BROKER_COMMAND_MODULE_OPTION_DELETE_ACK,
	BROKER_COMMAND_MODULE_OPTION_LIST,
	BROKER_COMMAND_MODULE_OPTION_LIST_ACK,
	BROKER_COMMAND_NODE_JOIN,
	BROKER_COMMAND_NODE_LEAVE,
	BROKER_COMMAND_NODE_RELAY,
	DistributiveOmit, InjectStructPropertyCommand, ModuleInfo, NodeBrokerPacketDefintion, BrokerServerPacketDefintion,
	newStructType, newTempBuffer, newBufferReader, newBufferWriter, socketReader, socketWriter
} from "./logic.shared";
const debug = debug0("clamat:broker");

const BrokerIdentifyPacket = newStructType({ // Broker -> Server
	brokerId: "ushort"
});
const BrokerIdentifyAckPacket = newStructType({}); // Server -> Broker
const BrokerPingPacket = newStructType({ // Broker -> Server, Server -> Broker
	user: "ushort"
});
const BrokerPongPacket = newStructType({ // Broker -> Server, Server -> Broker
	user: "ushort"
});
const BrokerModuleSyncPacket = newStructType({ // Broker -> Server, Server -> Broker
	user: "ushort",
	modules: [newStructType({
		name: "string",
		version: "string"
	}), "[]"] as const
});
const BrokerModuleSyncAckPacket = newStructType({ // Broker -> Server, Server -> Broker
	user: "ushort",
	status: "ubyte",
	message: "string",
	modules: [newStructType({
		name: "string",
		version: "string"
	}), "[]"] as const
});
const BrokerModuleInstallPacket = newStructType({ // Server -> Broker
	user: "ushort",
	name: "string",
	version: "string",
	nodeBrokerPacketDefinitions: "json",
	brokerServerPacketDefinitions: "json",
	sourceCode: "string"
});
const BrokerModuleInstallAckPacket = newStructType({ // Broker -> Server
	user: "ushort",
	status: "ubyte",
	message: "string"
});
const BrokerModuleUninstallPacket = newStructType({ // Server -> Broker
	user: "ushort",
	name: "string"
});
const BrokerModuleUninstallAckPacket = newStructType({ // Broker -> Server
	user: "ushort",
	status: "ubyte",
	message: "string"
});
// BrokerModuleRequestInstall
// BrokerModuleRequestUninstall
const BrokerModuleOptionGetPacket = newStructType({ // Broker -> Server, Server -> Broker
	user: "ushort",
	name: "string",
	ids: ["string", "[]"] as const
});
const BrokerModuleOptionGetAckPacket = newStructType({ // Broker -> Server, Server -> Broker
	user: "ushort",
	status: "ubyte",
	message: "string",
	values: ["json", "[]"] as const
});
const BrokerModuleOptionSetPacket = newStructType({ // Broker -> Server, Server -> Broker
	user: "ushort",
	name: "string",
	ids: ["string", "[]"] as const,
	values: ["json", "[]"] as const
});
const BrokerModuleOptionSetAckPacket = newStructType({ // Broker -> Server, Server -> Broker
	user: "ushort",
	status: "ubyte",
	message: "string"
});
const BrokerModuleOptionDeletePacket = newStructType({ // Broker -> Server, Server -> Broker
	user: "ushort",
	name: "string",
	ids: ["string", "[]"] as const
});
const BrokerModuleOptionDeleteAckPacket = newStructType({ // Broker -> Server, Server -> Broker
	user: "ushort",
	status: "ubyte",
	message: "string"
});
const BrokerModuleOptionListPacket = newStructType({ // Broker -> Server, Server -> Broker
	user: "ushort",
	name: "string"
});
const BrokerModuleOptionListAckPacket = newStructType({ // Broker -> Server, Server -> Broker
	user: "ushort",
	status: "ubyte",
	message: "string",
	ids: ["string", "[]"] as const
});
const BrokerNodeJoinPacket = newStructType({ // Broker -> Server
	nodeId: "ushort"
});
const BrokerNodeLeavePacket = newStructType({ // Broker -> Server
	nodeId: "ushort"
});
const BrokerNodeRelayPacket = newStructType({ // Broker -> Server, Server -> Broker
	nodeId: "ushort",
	packetId: "ushort",
	flag: "ushort",
	message: "buffer"
});
const BrokerPackets = {
	[BROKER_COMMAND_IDENTIFY]: BrokerIdentifyPacket as InjectStructPropertyCommand<typeof BrokerIdentifyPacket, typeof BROKER_COMMAND_IDENTIFY>,
	[BROKER_COMMAND_IDENTIFY_ACK]: BrokerIdentifyAckPacket as InjectStructPropertyCommand<typeof BrokerIdentifyAckPacket, typeof BROKER_COMMAND_IDENTIFY_ACK>,
	[BROKER_COMMAND_PING]: BrokerPingPacket as InjectStructPropertyCommand<typeof BrokerPingPacket, typeof BROKER_COMMAND_PING>,
	[BROKER_COMMAND_PONG]: BrokerPongPacket as InjectStructPropertyCommand<typeof BrokerPongPacket, typeof BROKER_COMMAND_PONG>,
	[BROKER_COMMAND_MODULE_SYNC]: BrokerModuleSyncPacket as InjectStructPropertyCommand<typeof BrokerModuleSyncPacket, typeof BROKER_COMMAND_MODULE_SYNC>,
	[BROKER_COMMAND_MODULE_SYNC_ACK]: BrokerModuleSyncAckPacket as InjectStructPropertyCommand<typeof BrokerModuleSyncAckPacket, typeof BROKER_COMMAND_MODULE_SYNC_ACK>,
	[BROKER_COMMAND_MODULE_INSTALL]: BrokerModuleInstallPacket as InjectStructPropertyCommand<typeof BrokerModuleInstallPacket, typeof BROKER_COMMAND_MODULE_INSTALL>,
	[BROKER_COMMAND_MODULE_INSTALL_ACK]: BrokerModuleInstallAckPacket as InjectStructPropertyCommand<typeof BrokerModuleInstallAckPacket, typeof BROKER_COMMAND_MODULE_INSTALL_ACK>,
	[BROKER_COMMAND_MODULE_UNINSTALL]: BrokerModuleUninstallPacket as InjectStructPropertyCommand<typeof BrokerModuleUninstallPacket, typeof BROKER_COMMAND_MODULE_UNINSTALL>,
	[BROKER_COMMAND_MODULE_UNINSTALL_ACK]: BrokerModuleUninstallAckPacket as InjectStructPropertyCommand<typeof BrokerModuleUninstallAckPacket, typeof BROKER_COMMAND_MODULE_UNINSTALL_ACK>,
	[BROKER_COMMAND_MODULE_OPTION_GET]: BrokerModuleOptionGetPacket as InjectStructPropertyCommand<typeof BrokerModuleOptionGetPacket, typeof BROKER_COMMAND_MODULE_OPTION_GET>,
	[BROKER_COMMAND_MODULE_OPTION_GET_ACK]: BrokerModuleOptionGetAckPacket as InjectStructPropertyCommand<typeof BrokerModuleOptionGetAckPacket, typeof BROKER_COMMAND_MODULE_OPTION_GET_ACK>,
	[BROKER_COMMAND_MODULE_OPTION_SET]: BrokerModuleOptionSetPacket as InjectStructPropertyCommand<typeof BrokerModuleOptionSetPacket, typeof BROKER_COMMAND_MODULE_OPTION_SET>,
	[BROKER_COMMAND_MODULE_OPTION_SET_ACK]: BrokerModuleOptionSetAckPacket as InjectStructPropertyCommand<typeof BrokerModuleOptionSetAckPacket, typeof BROKER_COMMAND_MODULE_OPTION_SET_ACK>,
	[BROKER_COMMAND_MODULE_OPTION_DELETE]: BrokerModuleOptionDeletePacket as InjectStructPropertyCommand<typeof BrokerModuleOptionDeletePacket, typeof BROKER_COMMAND_MODULE_OPTION_DELETE>,
	[BROKER_COMMAND_MODULE_OPTION_DELETE_ACK]: BrokerModuleOptionDeleteAckPacket as InjectStructPropertyCommand<typeof BrokerModuleOptionDeleteAckPacket, typeof BROKER_COMMAND_MODULE_OPTION_DELETE_ACK>,
	[BROKER_COMMAND_MODULE_OPTION_LIST]: BrokerModuleOptionListPacket as InjectStructPropertyCommand<typeof BrokerModuleOptionListPacket, typeof BROKER_COMMAND_MODULE_OPTION_LIST>,
	[BROKER_COMMAND_MODULE_OPTION_LIST_ACK]: BrokerModuleOptionListAckPacket as InjectStructPropertyCommand<typeof BrokerModuleOptionListAckPacket, typeof BROKER_COMMAND_MODULE_OPTION_LIST_ACK>,
	[BROKER_COMMAND_NODE_JOIN]: BrokerNodeJoinPacket as InjectStructPropertyCommand<typeof BrokerNodeJoinPacket, typeof BROKER_COMMAND_NODE_JOIN>,
	[BROKER_COMMAND_NODE_LEAVE]: BrokerNodeLeavePacket as InjectStructPropertyCommand<typeof BrokerNodeLeavePacket, typeof BROKER_COMMAND_NODE_LEAVE>,
	[BROKER_COMMAND_NODE_RELAY]: BrokerNodeRelayPacket as InjectStructPropertyCommand<typeof BrokerNodeRelayPacket, typeof BROKER_COMMAND_NODE_RELAY>
};
const BrokerPacketNames = {
	[BROKER_COMMAND_IDENTIFY]: "BROKER_COMMAND_IDENTIFY",
	[BROKER_COMMAND_IDENTIFY_ACK]: "BROKER_COMMAND_IDENTIFY_ACK",
	[BROKER_COMMAND_PING]: "BROKER_COMMAND_PING",
	[BROKER_COMMAND_PONG]: "BROKER_COMMAND_PONG",
	[BROKER_COMMAND_MODULE_SYNC]: "BROKER_COMMAND_MODULE_SYNC",
	[BROKER_COMMAND_MODULE_SYNC_ACK]: "BROKER_COMMAND_MODULE_SYNC_ACK",
	[BROKER_COMMAND_MODULE_INSTALL]: "BROKER_COMMAND_MODULE_INSTALL",
	[BROKER_COMMAND_MODULE_INSTALL_ACK]: "BROKER_COMMAND_MODULE_INSTALL_ACK",
	[BROKER_COMMAND_MODULE_UNINSTALL]: "BROKER_COMMAND_MODULE_UNINSTALL",
	[BROKER_COMMAND_MODULE_UNINSTALL_ACK]: "BROKER_COMMAND_MODULE_UNINSTALL_ACK",
	[BROKER_COMMAND_MODULE_OPTION_GET]: "BROKER_COMMAND_MODULE_OPTION_GET",
	[BROKER_COMMAND_MODULE_OPTION_GET_ACK]: "BROKER_COMMAND_MODULE_OPTION_GET_ACK",
	[BROKER_COMMAND_MODULE_OPTION_SET]: "BROKER_COMMAND_MODULE_OPTION_SET",
	[BROKER_COMMAND_MODULE_OPTION_SET_ACK]: "BROKER_COMMAND_MODULE_OPTION_SET_ACK",
	[BROKER_COMMAND_MODULE_OPTION_DELETE]: "BROKER_COMMAND_MODULE_OPTION_DELETE",
	[BROKER_COMMAND_MODULE_OPTION_DELETE_ACK]: "BROKER_COMMAND_MODULE_OPTION_DELETE_ACK",
	[BROKER_COMMAND_MODULE_OPTION_LIST]: "BROKER_COMMAND_MODULE_OPTION_KEYS",
	[BROKER_COMMAND_MODULE_OPTION_LIST_ACK]: "BROKER_COMMAND_MODULE_OPTION_KEYS_ACK",
	[BROKER_COMMAND_NODE_JOIN]: "BROKER_COMMAND_NODE_JOIN",
	[BROKER_COMMAND_NODE_LEAVE]: "BROKER_COMMAND_NODE_LEAVE",
	[BROKER_COMMAND_NODE_RELAY]: "BROKER_COMMAND_NODE_RELAY"
};
type BrokerPacketStructs = ReturnType<(typeof BrokerPackets)[keyof typeof BrokerPackets]["read"]>;
const getBrokerTempBuffer = newTempBuffer();
function decodeBrokerPacket(buffer: Buffer) {
	const reader = newBufferReader(buffer);
	const command = reader.readUByte() as keyof typeof BrokerPackets;
	const structType = BrokerPackets[command];
	if(structType == null)
		throw ERR_PACKET_UNKNOWN_COMMAND;
	const struct = structType.read(reader);
	struct.command = command;
	return struct;
}
function encodeBrokerPacket(object: BrokerPacketStructs) {
	const command = object.command;
	const structType = BrokerPackets[command] as any;
	if(structType == null)
		throw ERR_PACKET_UNKNOWN_COMMAND;
	const buffer = getBrokerTempBuffer(1 + structType.length(object));
	const writer = newBufferWriter(buffer);
	writer.writeUByte(command);
	structType.write(object, writer);
	return buffer;
}

function newDecouplerMachine(size: number, window: number, center: number | null = null) {
	const received = new Set<number>();
	const ratio = 0.8;
	const floorMod = (a: number, n: number) => a - n * Math.floor(a / n);
	const distanceMod = (a: number, b: number, n: number) => Math.min(Math.abs(a - b), n - Math.abs(a - b));
	let lastPruneCenter = null;
	return (sequenceId: number) => {
		if(center == null)
			center = sequenceId;
		const withinLeftBound = floorMod(center - window, size) <= sequenceId;
		const withinRightBound = sequenceId < floorMod(center + window, size);
		if(!withinLeftBound || withinRightBound)
			return false;
		if(center > size - window / 4 && sequenceId < window / 2) {
			center = ratio * center + (1 - ratio) * (sequenceId + size);
			if(center >= size + window / 4)
				center = floorMod(center, size);
		} else if(center < window / 4 && sequenceId > size - window / 2) {
			center = ratio * center + (1 - ratio) * (sequenceId - size);
			if(center <= -window / 4)
				center = floorMod(center, size);
		} else
			center = ratio * center + (1 - ratio) * sequenceId;
		if(lastPruneCenter == null)
			lastPruneCenter = center;
		if(distanceMod(lastPruneCenter, center, size) >= window / 4) {
			lastPruneCenter = center;
			const leftBound = floorMod(center - window, size);
			const rightBound = floorMod(center + window, size);
			[...received]
				.filter(i => leftBound <= i && i < rightBound)
				.forEach(i => received.delete(i));
		}
		if(received.has(sequenceId))
			return false;
		received.add(sequenceId);
		return true;
	};
}

type BrokerContext = ReturnType<typeof newBrokerContext>;
const brokerContexts = [] as BrokerContext[];
function newBrokerContext(socket: net.Socket) {
	const context = {} as {
		socket: typeof socket;
		socketAddress: typeof socketAddress;
		name: typeof name;
		getTempBuffer: typeof getTempBuffer;
		readBytes: typeof readBytes;
		writeBytes: typeof writeBytes;
		readPacket: typeof readPacket;
		writePacket: typeof writePacket;
		userCounter: typeof userCounter;
		waitingMessages: typeof waitingMessages;
		requestResponsePacket: typeof requestResponsePacket;
		identity: typeof identity;
		nodeHandles: typeof nodeHandles;
		assertIdentity: typeof assertIdentity;
		syncBrokerModules: typeof syncBrokerModules;
		doSyncBrokerModules: typeof doSyncBrokerModules;
		installBrokerModule: typeof installBrokerModule;
		uninstallBrokerModule: typeof uninstallBrokerModule;
		syncBrokerModuleOptions: typeof syncBrokerModuleOptions;
		getBrokerModuleOptions: typeof getBrokerModuleOptions;
		setBrokerModuleOptions: typeof setBrokerModuleOptions;
		deleteBrokerModuleOptions: typeof deleteBrokerModuleOptions;
		listBrokerModuleOptions: typeof listBrokerModuleOptions;
	};
	context.socket = socket;
	const socketAddress = socket.address() as net.AddressInfo;
	const name = () => (identity != null ? `${identity.brokerId}` : `${socketAddress.address}:${socketAddress.port}`);
	context.socketAddress = socketAddress;
	context.name = name;

	const getTempBuffer = newTempBuffer();
	const readBytes = socketReader(socket);
	const writeBytes = socketWriter(socket);
	const readPacket = async () => {
		const length = (await readBytes(4)).readUInt32BE();
		const buffer = (await readBytes(length)).subarray(0, length);
		return decodeBrokerPacket(buffer);
	};
	const writePacket = async (packet: BrokerPacketStructs) => {
		const buffer = encodeBrokerPacket(packet);
		const tempBuffer = getTempBuffer(buffer.length + 4);
		tempBuffer.writeUInt32BE(buffer.length);
		buffer.copy(tempBuffer, 4, 0, buffer.length);
		await writeBytes(tempBuffer, 0, buffer.length + 4);
	};
	context.getTempBuffer = getTempBuffer;
	context.readBytes = readBytes;
	context.writeBytes = writeBytes;
	context.readPacket = readPacket;
	context.writePacket = writePacket;

	type PacketsWithUserId = Extract<BrokerPacketStructs, { user: number }>;
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

	debug(`Connected to broker ${name()}`);
	socket.addListener("close", () => {
		debug(`Disconnected from broker ${name()}`);
	});
	let identity = null as { brokerId: number };
	const nodeHandles = new Set<number>();
	const assertIdentity = () => { if(identity != null) return; throw new Error("Broker is not identified yet"); };
	context.identity = identity;
	context.nodeHandles = nodeHandles;
	context.assertIdentity = assertIdentity;

	const syncBrokerModules = async () => {
		assertIdentity();
		if(brokerModuleNegotiator == null)
			throw new Error("Broker module negotiator is not available");
		const localModuleInfos = await brokerModuleNegotiator.forBroker(identity.brokerId);
		const remoteModuleInfos = (await requestResponsePacket({
			command: BROKER_COMMAND_MODULE_SYNC,
			modules: localModuleInfos
		}, BROKER_COMMAND_MODULE_SYNC_ACK)).modules;
		await doSyncBrokerModules(localModuleInfos, remoteModuleInfos);
	};
	const doSyncBrokerModules = async (localModuleInfos: ModuleInfo[], remoteModuleInfos: ModuleInfo[]) => {
		assertIdentity();
		if(brokerModuleNegotiator == null)
			throw new Error("Broker module negotiator is not available");
		debug(`Syncing modules at broker ${name()}`);
		const comparations = await brokerModuleNegotiator.compare(localModuleInfos, remoteModuleInfos);
		const promises = [];
		for(const comparation of comparations) {
			if(comparation.action == "install" || comparation.action == "replace")
				promises.push(installBrokerModule(comparation));
			if(comparation.action == "uninstall")
				promises.push(uninstallBrokerModule(comparation.name));
		}
		await Promise.all(promises);
	};
	const installBrokerModule = async (moduleInfo: ModuleInfo) => {
		assertIdentity();
		if(brokerModuleNegotiator == null)
			throw new Error("Broker module negotiator is not available");
		debug(`Installing module ${moduleInfo.name}@${moduleInfo.version} to broker ${name()}`);
		const moduleDetail = await brokerModuleNegotiator.detail(moduleInfo);
		await syncBrokerModuleOptions(moduleInfo.name);
		const response = await requestResponsePacket({
			command: BROKER_COMMAND_MODULE_INSTALL,
			name: moduleInfo.name,
			version: moduleInfo.version,
			nodeBrokerPacketDefinitions: moduleDetail.nodeBrokerPacketDefinitions,
			brokerServerPacketDefinitions: moduleDetail.brokerServerPacketDefinitions,
			sourceCode: moduleDetail.sourceCode
		}, BROKER_COMMAND_MODULE_INSTALL_ACK);
		if(response.status == CODE_OK)
			return;
		if(response.status == CODE_ERROR)
			throw new Error(`Error while installing module: ${response.message}`);
		throw new Error(`Unknown code while installing module: ${response.status}`);
	};
	const uninstallBrokerModule = async (moduleName: string) => {
		assertIdentity();
		if(brokerModuleNegotiator == null)
			throw new Error("Broker module negotiator is not available");
		debug(`Uninstalling module ${moduleName} from broker ${name()}`);
		const response = await requestResponsePacket({
			command: BROKER_COMMAND_MODULE_UNINSTALL,
			name: moduleName
		}, BROKER_COMMAND_MODULE_UNINSTALL_ACK);
		if(response.status == CODE_OK)
			return;
		if(response.status == CODE_ERROR)
			throw new Error(`Error while uninstalling module: ${response.message}`);
		throw new Error(`Unknown code while uninstalling module: ${response.status}`);
	};
	const syncBrokerModuleOptions = async (moduleName: string) => {
		assertIdentity();
		if(brokerModuleNegotiator == null)
			throw new Error("Broker module negotiator is not available");
		const localOptionIds = await brokerModuleNegotiator.listOptions(identity.brokerId, moduleName);
		const localOptions = await brokerModuleNegotiator.getOptions(identity.brokerId, moduleName, localOptionIds);
		const remoteOptionIds = await listBrokerModuleOptions(moduleName);
		const deletedKeys = remoteOptionIds.filter(k => !localOptionIds.includes(k));
		if(deletedKeys.length > 0)
			await deleteBrokerModuleOptions(moduleName, deletedKeys);
		await setBrokerModuleOptions(moduleName, localOptionIds, localOptions);
	};
	const getBrokerModuleOptions = async (moduleName: string, ids: string[]) => {
		assertIdentity();
		debug(`Getting module ${moduleName} options ${ids.join()} from broker ${name()}`);
		const response = await requestResponsePacket({
			command: BROKER_COMMAND_MODULE_OPTION_GET,
			name: moduleName,
			ids: ids
		}, BROKER_COMMAND_MODULE_OPTION_GET_ACK);
		if(response.status == CODE_OK)
			return response.values;
		if(response.status == CODE_ERROR)
			throw new Error(`Error while getting module options: ${response.message}`);
		throw new Error(`Unknown code while getting module options: ${response.status}`);
	};
	const setBrokerModuleOptions = async (moduleName: string, ids: string[], values: any[]) => {
		assertIdentity();
		debug(`Setting module ${moduleName} options ${ids.join()} to broker ${name()}`);
		const response = await requestResponsePacket({
			command: BROKER_COMMAND_MODULE_OPTION_SET,
			name: moduleName,
			ids: ids,
			values: values
		}, BROKER_COMMAND_MODULE_OPTION_SET_ACK);
		if(response.status == CODE_OK)
			return;
		if(response.status == CODE_ERROR)
			throw new Error(`Error while getting module options: ${response.message}`);
		throw new Error(`Unknown code while getting module options: ${response.status}`);
	};
	const deleteBrokerModuleOptions = async (moduleName: string, ids: string[]) => {
		assertIdentity();
		debug(`Deleting module ${moduleName} options ${ids.join()} from broker ${name()}`);
		const response = await requestResponsePacket({
			command: BROKER_COMMAND_MODULE_OPTION_DELETE,
			name: moduleName,
			ids: ids
		}, BROKER_COMMAND_MODULE_OPTION_DELETE_ACK);
		if(response.status == CODE_OK)
			return;
		if(response.status == CODE_ERROR)
			throw new Error(`Error while deleting module options: ${response.message}`);
		throw new Error(`Unknown code while deleting module options: ${response.status}`);
	};
	const listBrokerModuleOptions = async (moduleName: string) => {
		assertIdentity();
		debug(`Listing module ${moduleName} options from broker ${name()}`);
		const response = await requestResponsePacket({
			command: BROKER_COMMAND_MODULE_OPTION_LIST,
			name: moduleName
		}, BROKER_COMMAND_MODULE_OPTION_LIST_ACK);
		if(response.status == CODE_OK)
			return response.ids;
		if(response.status == CODE_ERROR)
			throw new Error(`Error while listing module options: ${response.message}`);
		throw new Error(`Unknown code while listing module options: ${response.status}`);
	};
	context.syncBrokerModules = syncBrokerModules;
	context.doSyncBrokerModules = doSyncBrokerModules;
	context.installBrokerModule = installBrokerModule;
	context.uninstallBrokerModule = uninstallBrokerModule;
	context.syncBrokerModuleOptions = syncBrokerModuleOptions;
	context.getBrokerModuleOptions = getBrokerModuleOptions;
	context.setBrokerModuleOptions = setBrokerModuleOptions;
	context.deleteBrokerModuleOptions = deleteBrokerModuleOptions;
	context.listBrokerModuleOptions = listBrokerModuleOptions;

	const onBrokerPacketReceive = (packet: BrokerPacketStructs) => {
		debug(`Received ${BrokerPacketNames[packet.command]} packet from broker ${name()}`);
		if((packet as any).user != null) {
			const user = (packet as any).user;
			const info = waitingMessages.get(user);
			if(info != null && info[0] == packet.command) {
				info[1](packet as any);
				return;
			}
		}
		if(packet.command == BROKER_COMMAND_IDENTIFY) {
			if(identity != null) {
				debug(`Broker ${name()} sent multiple identify command`);
				return;
			}
			debug(`Broker ${socketAddress.address}:${socketAddress.port} is identified as ${packet.brokerId}`);
			identity = context.identity = {
				brokerId: packet.brokerId
			};
			brokerEmitter.emit("join", packet.brokerId);
			writePacket({ command: BROKER_COMMAND_IDENTIFY_ACK });
			if(brokerModuleNegotiator != null)
				syncBrokerModules();
			return;
		}
		if(packet.command == BROKER_COMMAND_PING) {
			writePacket({
				command: BROKER_COMMAND_PONG,
				user: packet.user
			});
			return;
		}
		if(identity == null) {
			const serverModuleId = packetModules.get(packet.command);
			if(serverModuleId != null) {
				const serverModule = serverModules.get(serverModuleId);
				serverModule.onReceive(null, packet);
				return;
			}
			return;
		}
		if(packet.command == BROKER_COMMAND_MODULE_SYNC) {
			if(brokerModuleNegotiator == null) {
				writePacket({
					command: BROKER_COMMAND_MODULE_SYNC_ACK,
					user: packet.user,
					status: CODE_ERROR,
					message: "Server is not ready yet",
					modules: []
				});
				return;
			}
			brokerModuleNegotiator.forBroker(identity.brokerId).then( // no await
				m => {
					writePacket({
						command: BROKER_COMMAND_MODULE_SYNC_ACK,
						user: packet.user,
						status: CODE_OK,
						message: "",
						modules: m
					});
					doSyncBrokerModules(m, packet.modules);
				},
				e => {
					writePacket({
						command: BROKER_COMMAND_MODULE_SYNC_ACK,
						user: packet.user,
						status: CODE_ERROR,
						message: e.stack,
						modules: []
					});
				}
			);
			return;
		}
		if(packet.command == BROKER_COMMAND_MODULE_OPTION_GET) {
			if(brokerModuleNegotiator == null) {
				writePacket({
					command: BROKER_COMMAND_MODULE_OPTION_GET_ACK,
					user: packet.user,
					status: CODE_ERROR,
					message: "Server is not ready yet",
					values: []
				});
				return;
			}
			brokerModuleNegotiator.getOptions(identity.brokerId, packet.name, packet.ids).then( // no await
				m => {
					writePacket({
						command: BROKER_COMMAND_MODULE_OPTION_GET_ACK,
						user: packet.user,
						status: CODE_OK,
						message: "",
						values: m
					});
				},
				e => {
					writePacket({
						command: BROKER_COMMAND_MODULE_OPTION_GET_ACK,
						user: packet.user,
						status: CODE_ERROR,
						message: e.stack,
						values: []
					});
				}
			);
			return;
		}
		if(packet.command == BROKER_COMMAND_MODULE_OPTION_SET) {
			if(brokerModuleNegotiator == null) {
				writePacket({
					command: BROKER_COMMAND_MODULE_OPTION_SET_ACK,
					user: packet.user,
					status: CODE_ERROR,
					message: "Server is not ready yet"
				});
				return;
			}
			brokerModuleNegotiator.setOptions(identity.brokerId, packet.name, packet.ids, packet.values).then( // no await
				() => {
					writePacket({
						command: BROKER_COMMAND_MODULE_OPTION_SET_ACK,
						user: packet.user,
						status: CODE_OK,
						message: ""
					});
				},
				e => {
					writePacket({
						command: BROKER_COMMAND_MODULE_OPTION_SET_ACK,
						user: packet.user,
						status: CODE_ERROR,
						message: e.stack
					});
				}
			);
			return;
		}
		if(packet.command == BROKER_COMMAND_MODULE_OPTION_DELETE) {
			if(brokerModuleNegotiator == null) {
				writePacket({
					command: BROKER_COMMAND_MODULE_OPTION_DELETE_ACK,
					user: packet.user,
					status: CODE_ERROR,
					message: "Server is not ready yet"
				});
				return;
			}
			brokerModuleNegotiator.deleteOptions(identity.brokerId, packet.name, packet.ids).then( // no await
				() => {
					writePacket({
						command: BROKER_COMMAND_MODULE_OPTION_DELETE_ACK,
						user: packet.user,
						status: CODE_OK,
						message: ""
					});
				},
				e => {
					writePacket({
						command: BROKER_COMMAND_MODULE_OPTION_DELETE_ACK,
						user: packet.user,
						status: CODE_ERROR,
						message: e.stack
					});
				}
			);
			return;
		}
		if(packet.command == BROKER_COMMAND_MODULE_OPTION_LIST) {
			if(brokerModuleNegotiator == null) {
				writePacket({
					command: BROKER_COMMAND_MODULE_OPTION_LIST_ACK,
					user: packet.user,
					status: CODE_ERROR,
					message: "Server is not ready yet",
					ids: []
				});
				return;
			}
			brokerModuleNegotiator.listOptions(identity.brokerId, packet.name).then( // no await
				k => {
					writePacket({
						command: BROKER_COMMAND_MODULE_OPTION_LIST_ACK,
						user: packet.user,
						status: CODE_OK,
						message: "",
						ids: k
					});
				},
				e => {
					writePacket({
						command: BROKER_COMMAND_MODULE_OPTION_LIST_ACK,
						user: packet.user,
						status: CODE_ERROR,
						message: e.stack,
						ids: []
					});
				}
			);
			return;
		}
		if(packet.command == BROKER_COMMAND_NODE_JOIN) {
			const nodeId = packet.nodeId;
			if(nodeHandles.has(nodeId)) return;
			debug(`Node ${nodeId} joined to broker ${name()}`);
			nodeHandles.add(nodeId);
			emitNodeJoin(nodeId, identity.brokerId);
			return;
		}
		if(packet.command == BROKER_COMMAND_NODE_LEAVE) {
			const nodeId = packet.nodeId;
			if(!nodeHandles.has(nodeId)) return;
			debug(`Node ${nodeId} left from broker ${name()}`);
			emitNodeLeave(nodeId, identity.brokerId);
			nodeHandles.delete(nodeId);
			return;
		}
		if(packet.command == BROKER_COMMAND_NODE_RELAY) {
			if(!nodeHandles.has(packet.nodeId)) {
				debug(`Broker ${name()} sent relay event for a node that it doesn't handle`);
				return;
			}
			emitNodeReceivePacket(packet);
			return;
		}
		const serverModuleId = packetModules.get(packet.command);
		if(serverModuleId != null) {
			const serverModule = serverModules.get(serverModuleId);
			serverModule.onReceive(identity.brokerId, packet);
			return;
		}
	};
	(async () => {
		while(!socket.closed) {
			const packet = await (async () => {
				try {
					return await readPacket();
				} catch(e) {
					if(e == ERR_PACKET_UNKNOWN_COMMAND) {
						// We can advance through unknown command without any structure information,
						// because we have length information beforehand.
						debug(`Received unknown command from broker ${name()}`);
						return null;
					}
					throw e;
				}
			})();
			if(packet == null)
				continue;
			onBrokerPacketReceive(packet);
		}
	})().catch(e => {
		if(e.message == "Socket closed")
			return;
		throw e;
	});
	return context;
}
const brokerServer = net.createServer(socket => {
	const context = newBrokerContext(socket);
	brokerContexts.push(context);
	socket.addListener("close", () => {
		const identity = context.identity;
		if(identity != null) {
			for(const nodeHandle of context.nodeHandles)
				emitNodeLeave(nodeHandle, identity.brokerId);
			brokerEmitter.emit("leave", identity.brokerId);
		}
		const index = brokerContexts.indexOf(context);
		if(index == -1) return;
		brokerContexts.splice(index, 1);
	});
});
brokerServer.listen(() => {
	const address = brokerServer.address() as net.AddressInfo;
	debug(`Broker server started at ${address.address}:${address.port}`);
});
export async function getBrokerServerAddress() {
	if(brokerServer.listening)
		return brokerServer.address() as net.AddressInfo;
	return await new Promise<net.AddressInfo>((resolve, reject) => {
		const cleanup = () => {
			brokerServer.removeListener("listening", onListening);
			brokerServer.removeListener("error", onError);
		};
		const onListening = () => {
			cleanup();
			resolve(brokerServer.address() as net.AddressInfo);
		};
		const onError = (e: Error) => {
			cleanup();
			reject(e);
		};
		brokerServer.on("listening", onListening);
		brokerServer.on("error", onError);
	});
}
export const brokerEmitter = new EventEmitter() as TypedEmitter<{
	join: (brokerId: number) => void;
	leave: (brokerId: number) => void;
	nodejoin: (nodeId: number, brokerId: number) => void;
	nodeleave: (nodeId: number, brokerId: number) => void;
	nodereceive: (nodeId: number, packet: NodeReceivePacketTypes) => void;
}>;
let brokerModuleNegotiator: {
	forBroker: (brokerId: number) => Promise<ModuleInfo[]>;
	compare: (localModuleInfos: ModuleInfo[], remoteModuleInfos: ModuleInfo[]) => Promise<({ action: "install" | "replace" } & ModuleInfo | { action: "uninstall", name: string })[]>;
	detail: (moduleInfo: ModuleInfo) => Promise<{ sourceCode: string, nodeBrokerPacketDefinitions: NodeBrokerPacketDefintion[], brokerServerPacketDefinitions: BrokerServerPacketDefintion[] }>;
	getOptions: (brokerId: number, name: string, ids: string[]) => Promise<any[]>;
	setOptions: (brokerId: number, name: string, ids: string[], values: any[]) => Promise<void>;
	deleteOptions: (brokerId: number, name: string, ids: string[]) => Promise<void>;
	listOptions: (brokerId: number, name: string) => Promise<string[]>;
};
export async function setBrokerModuleNegotiator(negotiator: typeof brokerModuleNegotiator) {
	brokerModuleNegotiator = negotiator;
	const promises = [];
	for(const brokerContext of brokerContexts) {
		if(brokerContext.identity == null) continue;
		promises.push(brokerContext.syncBrokerModules());
	}
	await Promise.all(promises);
}
const __doBroker = <A extends Array<any>, R>(cb: (brokerContext: BrokerContext, ...args: A) => Promise<R> | R) => {
	return async (brokerId: number, ...args: A) => {
		const brokerContext = brokerContexts.find(b => b.identity?.brokerId == brokerId);
		if(brokerContext == null) throw ERR_OFFLINE;
		return await cb(brokerContext, ...args);
	};
};
export const writePacket = __doBroker((c, packet: BrokerPacketStructs) => c.writePacket(packet));
export const syncBrokerModules = __doBroker(c => c.syncBrokerModules());
export const installBrokerModule = __doBroker((c, moduleInfo: ModuleInfo) => c.installBrokerModule(moduleInfo));
export const uninstallBrokerModule = __doBroker((c, name: string) => c.uninstallBrokerModule(name));
export const syncBrokerModuleOptions = __doBroker((c, name: string) => c.syncBrokerModuleOptions(name));
export const getBrokerModuleOptions = __doBroker((c, name: string, ids: string[]) => c.getBrokerModuleOptions(name, ids));
export const setBrokerModuleOptions = __doBroker((c, name: string, ids: string[], values: any[]) => c.setBrokerModuleOptions(name, ids, values));
export const deleteBrokerModuleOptions = __doBroker((c, name: string, ids: string[]) => c.deleteBrokerModuleOptions(name, ids));
export const listBrokerModuleOptions = __doBroker((c, name: string) => c.listBrokerModuleOptions(name));

interface NodeState {
	id: number;
	brokers: Set<number>;
	decouple: ReturnType<typeof newDecouplerMachine>;
	sendPacketId: number;
}
type NodePacketTypes<T extends keyof typeof BrokerPackets> = ReturnType<(typeof BrokerPackets)[T]["read"]>;
export type NodeReceivePacketTypes = NodePacketTypes<typeof BROKER_COMMAND_NODE_RELAY>;
export type NodeSendPacketTypes = NodePacketTypes<typeof BROKER_COMMAND_NODE_RELAY>;
const nodeStates = new Map<number, NodeState>();
function emitNodeJoin(nodeId: number, brokerId: number) {
	let nodeState = nodeStates.get(nodeId);
	if(nodeState == null) {
		nodeState = {
			id: nodeId,
			brokers: new Set(),
			decouple: newDecouplerMachine(2 ** 16 - 1, 32),
			sendPacketId: 0
		};
		nodeStates.set(nodeId, nodeState);
	}
	if(!nodeState.brokers.has(brokerId)) {
		nodeState.brokers.add(brokerId);
		brokerEmitter.emit("nodejoin", nodeId, brokerId);
	}
}
function emitNodeLeave(nodeId: number, brokerId: number) {
	const nodeState = nodeStates.get(nodeId);
	if(nodeState == null) return;
	if(nodeState.brokers.has(brokerId)) {
		brokerEmitter.emit("nodeleave", nodeId, brokerId);
		nodeState.brokers.delete(brokerId);
	}
	if(nodeState.brokers.size == 0)
		nodeStates.delete(nodeId);
}
function emitNodeReceivePacket(packet: NodeReceivePacketTypes) {
	const nodeState = nodeStates.get(packet.nodeId);
	if(packet.packetId != null && !nodeState.decouple(packet.packetId))
		return;
	brokerEmitter.emit("nodereceive", packet.nodeId, packet);
}
export async function sendNodePacket<T extends NodeSendPacketTypes>(packet: Omit<T, "packetId"> & { packetId?: number }) {
	const promises = [];
	const nodeState = nodeStates.get(packet.nodeId);
	if(packet.packetId == null) {
		if(nodeState.sendPacketId >= 2 ** 16)
			nodeState.sendPacketId = 0;
		packet.packetId = nodeState.sendPacketId++;
	}
	for(const brokerContext of brokerContexts) {
		if(!brokerContext.nodeHandles.has(packet.nodeId)) continue;
		debug(`Sending ${BrokerPacketNames[packet.command]} packet to ${brokerContext.identity.brokerId}`);
		promises.push(brokerContext.writePacket(packet as T));
	}
	await Promise.all(promises);
}

interface ServerModule {
	name: string;
	version: string;
	packetDefinitions: BrokerServerPacketDefintion[];
	onReceive: (brokerId: number, packet: any) => void;
}
const serverModules = new Map<string, ServerModule>();
const packetModules = new Map<number, string>();
export async function installServerBrokerModule(moduleInfo: ModuleInfo, packetDefinitions: BrokerServerPacketDefintion[], onReceive: (packet: any) => void) {
	if(serverModules.get(moduleInfo.name)?.version == moduleInfo.version)
		return;
	for(const packetDefinition of packetDefinitions) {
		if(BrokerPackets[packetDefinition.command] == null) continue;
		if(packetModules.get(packetDefinition.command) == moduleInfo.name) continue;
		throw new Error(`Error while installing server broker module: Conflict packet id ${packetDefinition.name} with ${BrokerPacketNames[packetDefinition.command]}`);
	}
	if(serverModules.has(moduleInfo.name))
		await uninstallServerBrokerModule(moduleInfo.name);
	const serverModule: ServerModule = {
		name: moduleInfo.name,
		version: moduleInfo.version,
		packetDefinitions: packetDefinitions,
		onReceive: onReceive
	};
	serverModules.set(moduleInfo.name, serverModule);
	for(const packetDefinition of packetDefinitions) {
		BrokerPackets[packetDefinition.command] = newStructType(packetDefinition.properties);
		BrokerPacketNames[packetDefinition.command] = `(${moduleInfo.name}) ${packetDefinition.name}`;
		packetModules.set(packetDefinition.command, moduleInfo.name);
	}
}
export async function uninstallServerBrokerModule(name: string) {
	const serverModule = serverModules.get(name);
	if(serverModule == null) return;
	const packetDefinitions = serverModule.packetDefinitions;
	for(const packetDefinition of packetDefinitions) {
		delete BrokerPackets[packetDefinition.command];
		delete BrokerPacketNames[packetDefinition.command];
		packetModules.delete(packetDefinition.command);
	}
	serverModules.delete(name);
}
