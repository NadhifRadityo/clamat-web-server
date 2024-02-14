import path from "path";
import fs0 from "fs";
import debug0 from "debug";
import seedrandom from "seedrandom";
import Comlink from "comlink";

import { BROKER_COMMAND_RELAY, newBufferReader, newTempBuffer, tempDir, u16touuidv4, uuidv4 } from "./logic.shared";
import * as broker from "./broker.server.worker";
import * as broadcast from "./broadcast.server.worker";
import * as tsdb from "./tsdb.server.worker";
import { prisma } from "@/prisma/client";
const debug = debug0("clamat:general");

const minerTsdb = path.join(tempDir, "miner-tsdb/");
if (!fs0.existsSync(minerTsdb))
	fs0.mkdirSync(minerTsdb, { recursive: true });

const brokerAddress = await broker.getBrokerServerAddress();
await broadcast.setBrokerAddress(brokerAddress);

interface NodeMinerState {
	id: number;
	nodeId: string; // uuidv4 version of id
	minerId: string;
	database: tsdb.StorageItem;
	__lastUsed: number;
}
const nodeMinerStates = new Map<number, NodeMinerState>();
setInterval(() => {
	const now = Date.now();
	for (const [id, nodeMinerState] of nodeMinerStates.entries()) {
		if (now - nodeMinerState.__lastUsed < 60 * 1000) continue;
		debug(`Deleting node miner state ${id}`);
		deleteNodeMinerState(id);
	}
}, 30 * 1000);
function deleteNodeMinerState(id: number) {
	const nodeMinerState = nodeMinerStates.get(id);
	if (nodeMinerState == null) return;
	nodeMinerStates.delete(id);
	nodeMinerState.database.destructor();
}
async function findMinerWithNodeId(nodeId: string) {
	const result = await prisma.cLamatSession.findFirstOrThrow({
		where: {
			nodeId: nodeId,
			active: true
		},
		orderBy: {
			runId: "desc"
		},
		take: 1
	});
	return result.minerId;
}
async function getNodeMinerState(id: number) {
	let nodeMinerState = nodeMinerStates.get(id);
	if (nodeMinerState == null) {
		const nodeId = u16touuidv4(id);
		const minerId = await findMinerWithNodeId(nodeId);
		const database = await new tsdb.StorageItem(minerTsdb, minerId, {
			maxPartitionAccessAge: 1000,
			maxPartitionLength: 100
		});
		await database.sync();
		nodeMinerState = {
			id: id,
			nodeId: nodeId,
			minerId: minerId,
			database: database,
			__lastUsed: Date.now()
		};
		nodeMinerStates.set(id, nodeMinerState);
	} else
		nodeMinerState.__lastUsed = Date.now();
	return nodeMinerState;
}

broker.nodeEmitter.on("join", Comlink.transfer(async (nodeId, brokerId) => {
	const nodeMinerState = await getNodeMinerState(nodeId);
	await nodeMinerState.database.append({
		event: "join_broker",
		brokerId: brokerId
	});
}));
broker.nodeEmitter.on("leave", Comlink.transfer(async (nodeId, brokerId) => {
	const nodeMinerState = await getNodeMinerState(nodeId);
	await nodeMinerState.database.append({
		event: "leave_broker",
		brokerId: brokerId
	});
}));
broker.nodeEmitter.on("receive", Comlink.transfer(async (nodeId, packet) => {
	const nodeMinerState = await getNodeMinerState(nodeId);
}));

// processor: (stateless) process packet (either directly or timestep from database) and do action (emit to visualizer) about it.
// visualizer: (stateless) visualize data from process

// decode node packet
// handle qos messages
// how to do modular? for message enc/dec and processing is fine, but frontend?
// 
const getBrokerTempBuffer = newTempBuffer();
function decodeBrokerPacket(buffer: Buffer) {
	const reader = newBufferReader(buffer);
	const moduleId = reader.readUByte();
}
function encodeBrokerPacket(object: ReturnType<typeof decodeBrokerPacket>) {

}
