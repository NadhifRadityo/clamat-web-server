import Comlink from "comlink";
import * as broker from "./broker.server.worker";
import * as broadcast from "./broadcast.server.worker";
import * as tsdb from "./tsdb.server.worker";
import { BROKER_COMMAND_RELAY } from "./logic.shared";

const brokerAddress = await broker.getBrokerServerAddress();
await broadcast.setBrokerAddress(brokerAddress);

broker.receiveUserPacket(Comlink.transfer((userId, packet) => {
	if (packet.command == BROKER_COMMAND_RELAY) {
		// map sessionUserId to realUserId
		const storageItem = new tsdb.StorageItem("aa", "aa", {});
		storageItem.append(packet);
		broker.sendUserPacket();
	}
}));
