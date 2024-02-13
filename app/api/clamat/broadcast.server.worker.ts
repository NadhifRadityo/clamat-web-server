import * as dgram from "dgram";
import ip from "ip";
import debug0 from "debug";
import {
	BROADCAST_COMMAND_ADVERTISE,
	BROADCAST_COMMAND_DISCOVER,
	BROADCAST_COMMAND_DISCOVER_ACK,
	ERR_PACKET_INVALID_CRC,
	ERR_PACKET_UNKNOWN_COMMAND,
	InjectStructPropertyCommand, newBufferReader, newBufferWriter,
	newStructType, newTempBuffer, serverCidr, serverId, serverIpAddress
} from "./logic.shared";
import { AddressInfo } from "net";
const debug = debug0("clamat:broadast");

// UDP Broadcast: https://gist.github.com/PierBover/34ab4222a49bfd121b6ab21d60572de6
const BroadcastAdvertisePacket = newStructType({ // Server -> ALL
	serverId: "ubyte",
	serverIp: "uint",
	serverPort: "ushort"
});
const BroadcastDiscoverPacket = newStructType({ // Broker -> Server
	serverId: "ubyte"
});
const BroadcastDiscoverAckPacket = newStructType({ // Server -> Broker
	serverIp: "uint",
	serverPort: "ushort"
});
const BroadcastPackets = {
	[BROADCAST_COMMAND_ADVERTISE]: BroadcastAdvertisePacket as InjectStructPropertyCommand<typeof BroadcastAdvertisePacket, typeof BROADCAST_COMMAND_ADVERTISE>,
	[BROADCAST_COMMAND_DISCOVER]: BroadcastDiscoverPacket as InjectStructPropertyCommand<typeof BroadcastDiscoverPacket, typeof BROADCAST_COMMAND_DISCOVER>,
	[BROADCAST_COMMAND_DISCOVER_ACK]: BroadcastDiscoverAckPacket as InjectStructPropertyCommand<typeof BroadcastDiscoverAckPacket, typeof BROADCAST_COMMAND_DISCOVER_ACK>
}
const BroadcastPacketNames = {
	[BROADCAST_COMMAND_ADVERTISE]: "BROADCAST_COMMAND_ADVERTISE",
	[BROADCAST_COMMAND_DISCOVER]: "BROADCAST_COMMAND_DISCOVER",
	[BROADCAST_COMMAND_DISCOVER_ACK]: "BROADCAST_COMMAND_DISCOVER_ACK",
}
const getBroadcastTempBuffer = newTempBuffer();
function decodeBroadcastPacket(buffer: Buffer) {
	const reader = newBufferReader(buffer);
	const command = reader.readUByte() as keyof typeof BroadcastPackets;
	const structType = BroadcastPackets[command];
	if (structType == null)
		throw ERR_PACKET_UNKNOWN_COMMAND;
	const struct = structType.read(reader);
	struct.command = command;
	if (!reader.readCRC())
		throw ERR_PACKET_INVALID_CRC;
	return struct;
}
function encodeBroadcastPacket(object: ReturnType<typeof decodeBroadcastPacket>) {
	const command = object.command;
	const structType = BroadcastPackets[command] as any;
	if (structType == null)
		throw ERR_PACKET_UNKNOWN_COMMAND;
	const buffer = getBroadcastTempBuffer(1 + structType.length(object) + 2);
	const writer = newBufferWriter(buffer);
	writer.writeUByte(command);
	structType.write(object, writer);
	writer.writeCRC();
	return buffer;
}

const broadcastSocket = dgram.createSocket("udp4");
const broadcastSendMessage = (remote: dgram.RemoteInfo, object: ReturnType<typeof decodeBroadcastPacket>) => {
	const responseBuffer = encodeBroadcastPacket(object);
	debug(`Sent ${BroadcastPacketNames[object.command]} packet to ${remote != null ? `${remote.address}:${remote.port}` : "broadcast"}`);
	if (remote != null)
		broadcastSocket.send(responseBuffer, 0, responseBuffer.length, remote.port, remote.address);
	else
		broadcastSocket.send(responseBuffer, 0, responseBuffer.length, 8346, serverCidr.broadcastAddress);
}
broadcastSocket.on("message", (buffer, remote) => {
	const object = decodeBroadcastPacket(buffer);
	debug(`Received ${BroadcastPacketNames[object.command]} packet from ${remote.address}:${remote.port}`);
	if (object.command == BROADCAST_COMMAND_DISCOVER) {
		if (brokerAddress == null || object.serverId != serverId) return;
		broadcastSendMessage(remote, {
			command: BROADCAST_COMMAND_DISCOVER_ACK,
			serverIp: ip.toLong(brokerAddress.address),
			serverPort: brokerAddress.port
		});
		return;
	}
});
broadcastSocket.bind(8345, serverIpAddress);
function advertiseBrokerServer() {
	if (brokerAddress == null) return;
	broadcastSendMessage(null, {
		command: BROADCAST_COMMAND_ADVERTISE,
		serverId: serverId,
		serverIp: ip.toLong(brokerAddress.address),
		serverPort: brokerAddress.port
	});
}
setInterval(() => advertiseBrokerServer(), 10 * 1000);

let brokerAddress: AddressInfo;
export async function setBrokerAddress(address: AddressInfo) {
	brokerAddress = address;
	debug(`Setting broker address to ${address != null ? `${address.address}:${address.port}` : "null"}`);
	advertiseBrokerServer();
}
