import * as net from "net";
import { EventEmitter } from "stream";
import TypedEmitter from "typed-emitter"
import debug0 from "debug";
import {
	BROKER_COMMAND_IDENTIFY,
	BROKER_COMMAND_IDENTIFY_ACK,
	BROKER_COMMAND_PING,
	BROKER_COMMAND_PONG,
	BROKER_COMMAND_RELAY,
	ERR_PACKET_UNKNOWN_COMMAND,
	InjectStructPropertyCommand, newBufferReader, newBufferWriter,
	newStructType, newTempBuffer, socketReader, socketWriter
} from "./logic.shared";
const debug = debug0("clamat:broker");

const BrokerIdentifyPacket = newStructType({ // Broker -> Server
	brokerId: "ushort"
});
const BrokerIdentifyAckPacket = newStructType({}); // Server -> Broker
const BrokerPingPacket = newStructType({}); // Broker -> Server, Server -> Broker
const BrokerPongPacket = newStructType({}); // Broker -> Server, Server -> Broker
const BrokerRelayPacket = newStructType({ // Broker -> Server, Server -> Broker
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
	[BROKER_COMMAND_RELAY]: BrokerRelayPacket as InjectStructPropertyCommand<typeof BrokerRelayPacket, typeof BROKER_COMMAND_RELAY>
};
const BrokerPacketNames = {
	[BROKER_COMMAND_IDENTIFY]: "BROKER_COMMAND_IDENTIFY",
	[BROKER_COMMAND_IDENTIFY_ACK]: "BROKER_COMMAND_IDENTIFY_ACK",
	[BROKER_COMMAND_PING]: "BROKER_COMMAND_PING",
	[BROKER_COMMAND_PONG]: "BROKER_COMMAND_PONG",
	[BROKER_COMMAND_RELAY]: "BROKER_COMMAND_RELAY"
}
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
		const index = brokerContexts.indexOf(context);
		if (index == -1) return;
		brokerContexts.splice(index, 1);
	});

	const socketAddress = context.socketAddress = socket.address() as net.AddressInfo;
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

	let identity = context.identity = null;
	let nodeHandlesClearTask = context.nodeHandlesClearTask = null;
	const nodeHandles = context.nodeHandles = new Map<number, number>();
	const clearNodeHandles = context.clearNodeHandles = () => {
		const now = Date.now();
		for (const [nodeId, lastUsed] of nodeHandles.entries()) {
			if (now - lastUsed < 2 * 60 * 1000) continue;
			deleteNodeHandle(nodeId);
		}
	}
	const notifyNodeHandle = context.notifyNodeHandle = (nodeId: number) => {
		const oldSize = nodeHandles.size;
		nodeHandles.set(nodeId, Date.now());
		if (nodeHandles.size > oldSize) {
			debug(`Node ${nodeId} joined to broker ${identity.brokerId}`);
			emitNodeJoin(nodeId, identity.brokerId);
		}
		if (nodeHandlesClearTask == null)
			nodeHandlesClearTask = context.nodeHandlesClearTask = setTimeout(clearNodeHandles, 30 * 1000);
	}
	const deleteNodeHandle = context.deleteNodeHandle = (nodeId: number) => {
		if (nodeHandles.delete(nodeId)) {
			debug(`Node ${nodeId} left from broker ${identity.brokerId}`);
			emitNodeLeave(nodeId, identity.brokerId);
		}
		if (nodeHandles.size == 0 && nodeHandlesClearTask != null) {
			clearTimeout(nodeHandlesClearTask);
			nodeHandlesClearTask = context.nodeHandlesClearTask = null;
		}
	}

	(async () => {
		while (!socket.closed) {
			const payload = await readPayload();
			debug(`Received ${BrokerPacketNames[payload.command]} packet from ${identity != null ? identity.brokerId : `${socketAddress.address}:${socketAddress.port}`}`);
			if (payload.command == BROKER_COMMAND_IDENTIFY) {
				identity = context.identity = {
					brokerId: payload.brokerId
				};
				writePayload({ command: BROKER_COMMAND_IDENTIFY_ACK });
				return;
			}
			if (identity == null) return;
			if (payload.command == BROKER_COMMAND_PING) {
				writePayload({ command: BROKER_COMMAND_PONG });
				return;
			}
			if (payload.command == BROKER_COMMAND_RELAY) {
				notifyNodeHandle(payload.nodeId);
				emitNodeReceivePacket(payload);
				return;
			}
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
	decouple: ReturnType<typeof newDecouplerMachine>;
	sendPacketId: number;
	__lastUsed: number;
}
const nodeStates = new Map<number, NodeState>();
setInterval(() => {
	const now = Date.now();
	for (const [id, nodeState] of nodeStates.entries()) {
		if (now - nodeState.__lastUsed < 60 * 1000) continue;
		debug(`Deleting node state ${id}`);
		nodeStates.delete(id);
	}
}, 30 * 1000);
function getNodeState(id: number) {
	let nodeState = nodeStates.get(id);
	if (nodeState == null) {
		nodeState = {
			id: id,
			decouple: newDecouplerMachine(2 ** 16 - 1, 32),
			sendPacketId: 0,
			__lastUsed: Date.now()
		};
		nodeStates.set(id, nodeState);
	} else
		nodeState.__lastUsed = Date.now();
	return nodeState;
}
export function deleteNodeState(id: number) {
	debug(`Forcefully deleting node state ${id}`);
	nodeStates.delete(id);
	for (const brokerContext of brokerContexts)
		brokerContext.deleteNodeHandle(id);
}
function emitNodeJoin(nodeId: number, brokerId: number) {
	nodeEmitter.emit("join", nodeId, brokerId);
}
function emitNodeLeave(nodeId: number, brokerId: number) {
	nodeEmitter.emit("leave", nodeId, brokerId);
}
function emitNodeReceivePacket(payload: NodeReceivePacketTypes) {
	const nodeState = getNodeState(payload.nodeId);
	if (payload.packetId != null && !nodeState.decouple(payload.packetId))
		return;
	nodeEmitter.emit("receive", payload.nodeId, payload);
}

type NodePacketTypes<T extends keyof typeof BrokerPackets> = ReturnType<(typeof BrokerPackets)[T]["read"]>;
type NodeReceivePacketTypes = NodePacketTypes<typeof BROKER_COMMAND_RELAY>;
type NodeSendPacketTypes = NodePacketTypes<typeof BROKER_COMMAND_RELAY>;
export const nodeEmitter = new EventEmitter() as TypedEmitter<{
	join: (nodeId: number, brokerId: number) => void;
	leave: (nodeId: number, brokerId: number) => void;
	receive: (nodeId: number, packet: NodeReceivePacketTypes) => void;
}>;
export async function sendNodePacket(packet: Omit<NodeSendPacketTypes, "packetId"> & { packetId?: number }) {
	const promises = [];
	const nodeState = getNodeState(packet.nodeId);
	if (packet.packetId == null) {
		if (nodeState.sendPacketId >= 2 ** 16 - 1)
			nodeState.sendPacketId = 0;
		packet.packetId = nodeState.sendPacketId++;
	}
	for (const brokerContext of brokerContexts) {
		if (!brokerContext.nodeHandles.has(packet.nodeId)) continue;
		debug(`Sending ${BrokerPacketNames[packet.command]} packet to ${brokerContext.identity != null ? brokerContext.identity.brokerId : `${brokerContext.socketAddress.address}:${brokerContext.socketAddress.port}`}`);
		promises.push(brokerContext.writePayload(packet));
	}
	await Promise.all(promises);
}
