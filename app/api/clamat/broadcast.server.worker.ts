import * as dgram from "dgram";
import { AddressInfo } from "net";
import ip from "ip";
import debug0 from "debug";
import {
	ERR_PACKET_INVALID_CRC,
	ERR_PACKET_UNKNOWN_COMMAND,
	BROADCAST_COMMAND_ADVERTISE,
	BROADCAST_COMMAND_DISCOVER,
	InjectStructPropertyCommand,
	newStructType, newTempBuffer, newBufferReader, newBufferWriter,
	serverCidr, serverId, serverIpAddress
} from "./logic.shared";
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
const BroadcastPackets = {
	[BROADCAST_COMMAND_ADVERTISE]: BroadcastAdvertisePacket as InjectStructPropertyCommand<typeof BroadcastAdvertisePacket, typeof BROADCAST_COMMAND_ADVERTISE>,
	[BROADCAST_COMMAND_DISCOVER]: BroadcastDiscoverPacket as InjectStructPropertyCommand<typeof BroadcastDiscoverPacket, typeof BROADCAST_COMMAND_DISCOVER>
};
const BroadcastPacketNames = {
	[BROADCAST_COMMAND_ADVERTISE]: "BROADCAST_COMMAND_ADVERTISE",
	[BROADCAST_COMMAND_DISCOVER]: "BROADCAST_COMMAND_DISCOVER"
};
type BroadcastPacketStructs = ReturnType<(typeof BroadcastPackets)[keyof typeof BroadcastPackets]["read"]>;
const getBroadcastTempBuffer = newTempBuffer();
function decodeBroadcastPacket(buffer: Buffer) {
	const reader = newBufferReader(buffer);
	const command = reader.readUByte() as keyof typeof BroadcastPackets;
	const structType = BroadcastPackets[command];
	if(structType == null)
		throw ERR_PACKET_UNKNOWN_COMMAND;
	const struct = structType.read(reader);
	struct.command = command;
	if(!reader.readCRC())
		throw ERR_PACKET_INVALID_CRC;
	return struct;
}
function encodeBroadcastPacket(object: BroadcastPacketStructs) {
	const command = object.command;
	const structType = BroadcastPackets[command] as any;
	if(structType == null)
		throw ERR_PACKET_UNKNOWN_COMMAND;
	const buffer = getBroadcastTempBuffer(1 + structType.length(object) + 2);
	const writer = newBufferWriter(buffer);
	writer.writeUByte(command);
	structType.write(object, writer);
	writer.writeCRC();
	return buffer;
}

const broadcastSocket = dgram.createSocket("udp4");
const broadcastSendMessage = (remote: dgram.RemoteInfo, object: BroadcastPacketStructs) => {
	const responseBuffer = encodeBroadcastPacket(object);
	debug(`Sent ${BroadcastPacketNames[object.command]} packet to ${remote != null ? `${remote.address}:${remote.port}` : "broadcast"}`);
	if(remote != null)
		broadcastSocket.send(responseBuffer, 0, responseBuffer.length, remote.port, remote.address);
	else
		broadcastSocket.send(responseBuffer, 0, responseBuffer.length, 8346, serverCidr.broadcastAddress);
};
const onBroadcastPacketReceive = (packet: BroadcastPacketStructs, remote: dgram.RemoteInfo) => {
	debug(`Received ${BroadcastPacketNames[packet.command]} packet from ${remote.address}:${remote.port}`);
	if(packet.command == BROADCAST_COMMAND_DISCOVER) {
		if(brokerAddress == null || packet.serverId != serverId) return;
		broadcastSendMessage(remote, {
			command: BROADCAST_COMMAND_ADVERTISE,
			serverId: serverId,
			serverIp: ip.toLong(brokerAddress.address),
			serverPort: brokerAddress.port
		});
		return;
	}
};
broadcastSocket.on("message", (buffer, remote) => {
	const packet = decodeBroadcastPacket(buffer);
	onBroadcastPacketReceive(packet, remote);
});
broadcastSocket.bind(8345, serverIpAddress);
function advertiseBrokerServer() {
	if(brokerAddress == null) return;
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
