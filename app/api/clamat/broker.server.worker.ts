import * as net from "net";
import debug0 from "debug";
import Comlink from "comlink";
import {
	BROKER_COMMAND_PING,
	BROKER_COMMAND_PONG,
	BROKER_COMMAND_RELAY,
	ERR_PACKET_UNKNOWN_COMMAND,
	InjectStructPropertyCommand, newBufferReader, newBufferWriter,
	newStructType, newTempBuffer, socketReader, socketWriter
} from "./logic.shared";
const debug = debug0("clamat:broker");

const BrokerPingPacket = newStructType({}); // Broker -> Server, Server -> Broker
const BrokerPongPacket = newStructType({}); // Broker -> Server, Server -> Broker
const BrokerRelayPacket = newStructType({ // Broker -> Server, Server -> Broker
	userId: "ushort",
	packetId: "ushort",
	flag: "ushort",
	message: "buffer"
});
const BrokerPackets = {
	[BROKER_COMMAND_PING]: BrokerPingPacket as InjectStructPropertyCommand<typeof BrokerPingPacket, typeof BROKER_COMMAND_PING>,
	[BROKER_COMMAND_PONG]: BrokerPongPacket as InjectStructPropertyCommand<typeof BrokerPongPacket, typeof BROKER_COMMAND_PONG>,
	[BROKER_COMMAND_RELAY]: BrokerRelayPacket as InjectStructPropertyCommand<typeof BrokerRelayPacket, typeof BROKER_COMMAND_RELAY>
};
const BrokerPacketNames = {
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

	let userHandlesClearTask = context.userHandlesClearTask = null;
	const userHandles = context.userHandles = new Map<number, number>();
	const clearUserHandles = context.clearUserHandles = () => {
		const now = Date.now();
		for (const [userId, lastUsed] of userHandles.entries()) {
			if (now - lastUsed < 2 * 60 * 1000) continue;
			userHandles.delete(userId);
		}
		if (userHandles.size == 0) {
			userHandlesClearTask = context.userHandlesClearTask = null;
			return;
		}
		userHandlesClearTask = context.userHandlesClearTask = setTimeout(clearUserHandles, 30 * 1000);
	}
	const notifyUserHandle = context.notifyUserHandle = (userId: number) => {
		userHandles.set(userId, Date.now());
		if (userHandlesClearTask == null)
			userHandlesClearTask = context.userHandlesClearTask = setTimeout(clearUserHandles, 30 * 1000);
	}

	(async () => {
		while (!socket.closed) {
			const payload = await readPayload();
			debug(`Received ${BrokerPacketNames[payload.command]} packet from ${socketAddress.address}:${socketAddress.port}`);
			if (payload.command == BROKER_COMMAND_PING)
				writePayload({ command: BROKER_COMMAND_PONG });
			if (payload.command == BROKER_COMMAND_RELAY) {
				notifyUserHandle(payload.userId);
				emitReceivedUserPacket(payload);
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

interface UserState {
	id: number;
	decouple: ReturnType<typeof newDecouplerMachine>;
	__lastUsed: number;
}
const userStates = new Map<number, UserState>();
setInterval(() => {
	const now = Date.now();
	for (const [id, userState] of userStates.entries()) {
		if (now - userState.__lastUsed < 60 * 1000) continue;
		debug(`Deleting user state ${id}`);
		userStates.delete(id);
	}
}, 30 * 1000);
function getUserState(id: number) {
	let userState = userStates.get(id);
	if (userState == null) {
		userState = {
			id: id,
			decouple: newDecouplerMachine(2 ** 16 - 1, 32),
			__lastUsed: Date.now()
		};
		userStates.set(id, userState);
	} else
		userState.__lastUsed = Date.now();
	return userState;
}
export function deleteUserState(id: number) {
	debug(`Forcefully deleting user state ${id}`);
	userStates.delete(id);
	for (const brokerContext of brokerContexts)
		brokerContext.userHandles.delete(id);
}
function emitReceivedUserPacket(payload: UserReceiverPacketTypes) {
	const userState = getUserState(payload.userId);
	if (payload.packetId != null && !userState.decouple(payload.packetId))
		return;
	for (const userReceiver of userReceivers)
		userReceiver(payload.userId, payload);
}

type UserPacketTypes<T extends keyof typeof BrokerPackets> = ReturnType<(typeof BrokerPackets)[T]["read"]>;
type UserReceiverPacketTypes = UserPacketTypes<typeof BROKER_COMMAND_RELAY>;
type UserSenderPacketTypes = UserPacketTypes<typeof BROKER_COMMAND_RELAY>;
type UserReceiver = (userId: number, packet: UserReceiverPacketTypes) => any;
const userReceivers = [] as UserReceiver[];
export async function receiveUserPacket(receiver: UserReceiver) {
	userReceivers.push(receiver);
	return Comlink.transfer(() => {
		const index = userReceivers.indexOf(receiver);
		if (index == -1) return;
		userReceivers.splice(index, 1);
	});
}
export async function sendUserPacket(packet: UserSenderPacketTypes) {
	const promises = [];
	for (const brokerContext of brokerContexts) {
		if (!brokerContext.userHandles.has(packet.userId)) continue;
		promises.push(brokerContext.writePayload(packet));
	}
	await Promise.all(promises);
}
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
