import * as net from "net";
import { EventEmitter } from "stream";
import TypedEmitter from "typed-emitter"
import debug0 from "debug";
import {
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
	BROKER_COMMAND_NODE_JOIN,
	BROKER_COMMAND_NODE_LEAVE,
	BROKER_COMMAND_NODE_RELAY,
	ERR_PACKET_UNKNOWN_COMMAND,
	InjectStructPropertyCommand, newBufferReader, newBufferWriter,
	newStructType, newTempBuffer, socketReader, socketWriter, BrokerServerPacketDefintion, ModuleInfo
} from "./logic.shared";
const debug = debug0("clamat:broker");

const BrokerIdentifyPacket = newStructType({ // Broker -> Server
	brokerId: "ushort"
});
const BrokerIdentifyAckPacket = newStructType({}); // Server -> Broker
const BrokerPingPacket = newStructType({}); // Broker -> Server, Server -> Broker
const BrokerPongPacket = newStructType({}); // Broker -> Server, Server -> Broker
const BrokerModuleSyncPacket = newStructType({ // Broker -> Server, Server -> Broker
	packetId: "ushort",
	modules: [newStructType({
		name: "string",
		version: "string"
	}), "[]"] as const
});
const BrokerModuleSyncAckPacket = newStructType({ // Broker -> Server, Server -> Broker
	packetId: "ushort",
	modules: [newStructType({
		name: "string",
		version: "string"
	}), "[]"] as const
});
const BrokerModuleInstallPacket = newStructType({ // Server -> Broker
	packetId: "ushort",
	name: "string",
	version: "string",
	packetDefinitions: "string",
	sourceCode: "string"
});
const BrokerModuleInstallAckPacket = newStructType({ // Broker -> Server
	packetId: "ushort",
	status: "ubyte"
});
const BrokerModuleUninstallPacket = newStructType({ // Server -> Broker
	packetId: "ushort",
	name: "string"
});
const BrokerModuleUninstallAckPacket = newStructType({ // Broker -> Server
	packetId: "ushort",
	status: "ubyte"
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
	[BROKER_COMMAND_NODE_JOIN]: "BROKER_COMMAND_NODE_JOIN",
	[BROKER_COMMAND_NODE_LEAVE]: "BROKER_COMMAND_NODE_LEAVE",
	[BROKER_COMMAND_NODE_RELAY]: "BROKER_COMMAND_NODE_RELAY"
};
const getBrokerTempBuffer = newTempBuffer();
function decodeBrokerPacket(buffer: Buffer) {
	const reader = newBufferReader(buffer);
	const command = reader.readUByte() as keyof typeof BrokerPackets;
	const structType = BrokerPackets[command];
	if (structType == null)
		throw ERR_PACKET_UNKNOWN_COMMAND;
	const struct = structType.read(reader);
	struct.command = command;
	return struct;
}
function encodeBrokerPacket(object: ReturnType<typeof decodeBrokerPacket>) {
	const command = object.command;
	const structType = BrokerPackets[command] as any;
	if (structType == null)
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
		if (center == null)
			center = sequenceId;
		const withinLeftBound = floorMod(center - window, size) <= sequenceId;
		const withinRightBound = sequenceId < floorMod(center + window, size);
		if (!withinLeftBound || withinRightBound)
			return false;
		if (center > size - window / 4 && sequenceId < window / 2) {
			center = ratio * center + (1 - ratio) * (sequenceId + size);
			if (center >= size + window / 4)
				center = floorMod(center, size);
		} else if (center < window / 4 && sequenceId > size - window / 2) {
			center = ratio * center + (1 - ratio) * (sequenceId - size);
			if (center <= -window / 4)
				center = floorMod(center, size);
		} else
			center = ratio * center + (1 - ratio) * sequenceId;
		if (lastPruneCenter == null)
			lastPruneCenter = center;
		if (distanceMod(lastPruneCenter, center, size) >= window / 4) {
			lastPruneCenter = center;
			const leftBound = floorMod(center - window, size);
			const rightBound = floorMod(center + window, size);
			[...received]
				.filter(i => leftBound <= i && i < rightBound)
				.forEach(i => received.delete(i));
		}
		if (received.has(sequenceId))
			return false;
		received.add(sequenceId);
		return true;
	};
}

const brokerContexts = [];
const brokerServer = net.createServer(socket => {
	const context = {} as any;
	context.socket = socket;
	brokerContexts.push(context);
	socket.addListener("close", () => {
		if (identity != null) {
			for (const nodeHandle of nodeHandles)
				emitNodeLeave(nodeHandle, identity.brokerId);
			emitBrokerLeave(identity.brokerId);
		}
		const index = brokerContexts.indexOf(context);
		if (index == -1) return;
		brokerContexts.splice(index, 1);
	});

	const socketAddress = context.socketAddress = socket.address() as net.AddressInfo;
	const name = context.name = () => identity != null ? `${identity.brokerId}` : `${socketAddress.address}:${socketAddress.port}`;
	const getTempBuffer = context.getTempBuffer = newTempBuffer();
	const readBytes = context.readBytes = socketReader(socket);
	const writeBytes = context.writeBytes = socketWriter(socket);
	const readPayload = context.readPayload = async () => {
		const length = (await readBytes(4)).readUInt32BE();
		const buffer = (await readBytes(length)).subarray(0, length);
		return decodeBrokerPacket(buffer);
	}
	const writePayload = context.writePayload = async (payload: ReturnType<typeof decodeBrokerPacket>) => {
		const buffer = encodeBrokerPacket(payload);
		const tempBuffer = getTempBuffer(buffer.length + 4);
		tempBuffer.writeUInt32BE(buffer.length);
		buffer.copy(tempBuffer, 4, 0, buffer.length);
		await writeBytes(tempBuffer, 0, buffer.length + 4);
	}

	debug(`Connected to broker ${name()}`);
	socket.addListener("close", () => {
		debug(`Disconnected from broker ${name()}`);
	});
	let identity = context.identity = null;
	const nodeHandles = context.nodeHandles = new Set<number>();

	(async () => {
		while (!socket.closed) {
			const payload = await (async () => {
				try {
					return await readPayload();
				} catch (e) {
					if (e == ERR_PACKET_UNKNOWN_COMMAND) {
						// We can advance through unknown command without any structure information,
						// because we have length information beforehand.
						debug(`Received unknown command from ${name()}`);
						return null;
					}
				}
			})();
			if (payload == null)
				continue;
			debug(`Received ${BrokerPacketNames[payload.command]} packet from ${name()}`);
			if (payload.command == BROKER_COMMAND_IDENTIFY) {
				if (identity != null) {
					debug(`Broker ${name()} sent multiple identify command`);
					return;
				}
				debug(`Broker ${socketAddress.address}:${socketAddress.port} is identified as ${payload.brokerId}`);
				identity = context.identity = {
					brokerId: payload.brokerId
				};
				emitBrokerJoin(identity.brokerId);
				writePayload({ command: BROKER_COMMAND_IDENTIFY_ACK });
				return;
			}
			if (payload.command == BROKER_COMMAND_PING) {
				writePayload({ command: BROKER_COMMAND_PONG });
				return;
			}
			if (identity == null) return;
			if (payload.command == BROKER_COMMAND_NODE_JOIN) {
				const nodeId = payload.nodeId;
				if (nodeHandles.has(nodeId)) return;
				debug(`Node ${nodeId} joined to broker ${name()}`);
				nodeHandles.add(nodeId);
				emitNodeJoin(nodeId, identity.brokerId);
				return;
			}
			if (payload.command == BROKER_COMMAND_NODE_LEAVE) {
				const nodeId = payload.nodeId;
				if (!nodeHandles.has(nodeId)) return;
				debug(`Node ${nodeId} left from broker ${name()}`);
				emitNodeLeave(nodeId, identity.brokerId);
				nodeHandles.delete(nodeId);
				return;
			}
			if (payload.command == BROKER_COMMAND_NODE_RELAY) {
				if (!nodeHandles.has(payload.nodeId)) {
					debug(`Broker ${name()} sent relay event for a node that it doesn't handle`);
					return;
				}
				emitNodeReceivePacket(payload);
				return;
			}
			const serverModuleId = packetModules.get(payload.command);
			const serverModule = serverModules.get(serverModuleId);
			serverModule.onReceive(payload);
		}
	})().catch(e => {
		if (e.message == "Socket closed")
			return;
		throw e;
	});
});
brokerServer.listen(() => {
	const address = brokerServer.address() as net.AddressInfo;
	debug(`Broker server started at ${address.address}:${address.port}`);
});
function emitBrokerJoin(brokerId: number) {
	brokerEmitter.emit("join", brokerId);
}
function emitBrokerLeave(brokerId: number) {
	brokerEmitter.emit("leave", brokerId);
}
export const brokerEmitter = new EventEmitter() as TypedEmitter<{
	join: (brokerId: number) => void;
	leave: (brokerId: number) => void;
}>;
export async function getBrokerServerAddress() {
	if (brokerServer.listening)
		return brokerServer.address() as net.AddressInfo;
	return await new Promise<net.AddressInfo>((resolve, reject) => {
		const cleanup = () => {
			brokerServer.removeListener("listening", onListening);
			brokerServer.removeListener("error", onError);
		}
		const onListening = () => {
			cleanup();
			resolve(brokerServer.address() as net.AddressInfo);
		}
		const onError = (e: Error) => {
			cleanup();
			reject(e);
		}
		brokerServer.on("listening", onListening);
		brokerServer.on("error", onError)
	});
}

interface NodeState {
	id: number;
	brokers: Set<number>;
	decouple: ReturnType<typeof newDecouplerMachine>;
	sendPacketId: number;
}
const nodeStates = new Map<number, NodeState>();
function emitNodeJoin(nodeId: number, brokerId: number) {
	let nodeState = nodeStates.get(nodeId);
	if (nodeState == null) {
		nodeState = {
			id: nodeId,
			brokers: new Set(),
			decouple: newDecouplerMachine(2 ** 16 - 1, 32),
			sendPacketId: 0,
		};
		nodeStates.set(nodeId, nodeState);
	}
	if (!nodeState.brokers.has(brokerId)) {
		nodeState.brokers.add(brokerId);
		nodeEmitter.emit("join", nodeId, brokerId);
	}
}
function emitNodeLeave(nodeId: number, brokerId: number) {
	const nodeState = nodeStates.get(nodeId);
	if (nodeState == null) return;
	if (nodeState.brokers.has(brokerId)) {
		nodeEmitter.emit("leave", nodeId, brokerId);
		nodeState.brokers.delete(brokerId);
	}
	if (nodeState.brokers.size == 0)
		nodeStates.delete(nodeId);
}
function emitNodeReceivePacket(payload: NodeReceivePacketTypes) {
	const nodeState = nodeStates.get(payload.nodeId);
	if (payload.packetId != null && !nodeState.decouple(payload.packetId))
		return;
	nodeEmitter.emit("receive", payload.nodeId, payload);
}

type NodePacketTypes<T extends keyof typeof BrokerPackets> = ReturnType<(typeof BrokerPackets)[T]["read"]>;
type NodeReceivePacketTypes = NodePacketTypes<typeof BROKER_COMMAND_NODE_RELAY>;
type NodeSendPacketTypes = NodePacketTypes<typeof BROKER_COMMAND_NODE_RELAY>;
export const nodeEmitter = new EventEmitter() as TypedEmitter<{
	join: (nodeId: number, brokerId: number) => void;
	leave: (nodeId: number, brokerId: number) => void;
	receive: (nodeId: number, packet: NodeReceivePacketTypes) => void;
}>;
export async function sendNodePacket(packet: Omit<NodeSendPacketTypes, "packetId"> & { packetId?: number }) {
	const promises = [];
	const nodeState = nodeStates.get(packet.nodeId);
	if (packet.packetId == null) {
		if (nodeState.sendPacketId >= 2 ** 16)
			nodeState.sendPacketId = 0;
		packet.packetId = nodeState.sendPacketId++;
	}
	for (const brokerContext of brokerContexts) {
		if (!brokerContext.nodeHandles.has(packet.nodeId)) continue;
		debug(`Sending ${BrokerPacketNames[packet.command]} packet to ${brokerContext.identity.brokerId}`);
		promises.push(brokerContext.writePayload(packet));
	}
	await Promise.all(promises);
}

interface ServerModule {
	name: string;
	version: string;
	packetDefinitions: BrokerServerPacketDefintion[];
	onReceive: (packet: any) => void;
};
const serverModules = new Map<string, ServerModule>();
const packetModules = new Map<number, string>();
export async function installServerBrokerModule(moduleInfo: ModuleInfo, packetDefinitions: BrokerServerPacketDefintion[], onReceive: (packet: any) => void) {
	if (serverModules.get(moduleInfo.name)?.version == moduleInfo.version)
		return;
	for (const packetDefinition of packetDefinitions) {
		if (BrokerPackets[packetDefinition.command] == null) continue;
		if (packetModules.get(packetDefinition.command) == moduleInfo.name) continue;
		throw new Error(`Error while installing server broker module: Conflict packet id ${packetDefinition.name} with ${BrokerPacketNames[packetDefinition.command]}`);
	}
	if (serverModules.has(moduleInfo.name))
		await uninstallServerBrokerModule(moduleInfo.name);
	const serverModule: ServerModule = {
		name: moduleInfo.name,
		version: moduleInfo.version,
		packetDefinitions: packetDefinitions,
		onReceive: onReceive
	};
	serverModules.set(moduleInfo.name, serverModule);
	for (const packetDefinition of packetDefinitions) {
		BrokerPackets[packetDefinition.command] = newStructType(packetDefinition.properties);
		BrokerPacketNames[packetDefinition.command] = `(${moduleInfo.name}) ${packetDefinition.name}`;
		packetModules.set(packetDefinition.command, moduleInfo.name);
	}
}
export async function uninstallServerBrokerModule(name: string) {
	const serverModule = serverModules.get(name);
	if (serverModule == null) return;
	const packetDefinitions = serverModule.packetDefinitions;
	for (const packetDefinition of packetDefinitions) {
		delete BrokerPackets[packetDefinition.command];
		delete BrokerPacketNames[packetDefinition.command];
		packetModules.delete(packetDefinition.command);
	}
	serverModules.delete(name);
}

// installBrokerModule, syncBrokerModule, requestResponsePacket
// onBrokerConnect => automatically sync
// needs module access to database
