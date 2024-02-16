import path from "path";
import fs0 from "fs";
import debug0 from "debug";
import seedrandom from "seedrandom";
import Comlink from "comlink";
import { MongoClient } from "mongodb";

import { BROKER_COMMAND_RELAY, ModuleInfo, adler32, crc16, newBufferReader, newStructType, newTempBuffer, tempDir, u16touuidv4, uuidv4, uuidv4tou16 } from "./logic.shared";
import * as broker from "./broker.server.worker";
import * as broadcast from "./broadcast.server.worker";
import * as tsdb from "./tsdb.server.worker";
import { prisma } from "@/prisma/client";
import { clamatBrokerModifierEditor, clamatModuleModifierEditor } from "@/prisma/utils";
import { CLamatBrokerModifiers, CLamatModuleModifiers } from "@/prisma/types";
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

async function getBrokerModules(brokerId: number) {
	const modifiers = (await prisma.cLamatBroker.findUniqueOrThrow({
		where: { id: u16touuidv4(brokerId) },
		select: { modifiers: true }
	})).modifiers as any as CLamatBrokerModifiers[];
	const moduleIds = clamatBrokerModifierEditor.filter(["Module"], modifiers).map(m => m.value);
	const moduleOptionValues = clamatBrokerModifierEditor.filter(["ModuleOption"], modifiers).map(m => m.value);
	const missingModules = moduleIds.filter(m => !mirrorModules.has(m));
	if (missingModules.length > 0) debug(`Missing modules ${JSON.stringify(missingModules)} for broker ${brokerId}`);
	const modules = moduleIds.map(m => mirrorModules.get(m)).filter(m => m != null);
	const moduleOptions = modules.map(m => Object.fromEntries(moduleOptionValues.filter(o => o.module == m.name).sort((o1, o2) => o1.id.localeCompare(o2.id)).map(o => [o.id, o.value])));
	const modulesWithOptions = modules.map((m, i) => ({ ...m, options: moduleOptions[i] }));
	return modulesWithOptions;
}
async function modifyBrokerModules(brokerId: number, callback: (modifiers: CLamatBrokerModifiers[]) => Promise<void>) {
	const modifiers = (await prisma.cLamatBroker.findUniqueOrThrow({
		where: { id: u16touuidv4(brokerId) },
		select: { modifiers: true }
	})).modifiers as any as CLamatBrokerModifiers[];
	const copyModifiers = structuredClone(modifiers);
	await callback(copyModifiers);
	if (JSON.stringify(copyModifiers) == JSON.stringify(modifiers))
		return;
	await prisma.cLamatBroker.update({
		where: { id: u16touuidv4(brokerId) },
		data: { modifiers: copyModifiers as any }
	});
}
async function syncBrokerModules(brokerId: number) {
	const result = await broker.syncBrokerModules(brokerId);
	if (result) debug(`Successfully syncing broker ${brokerId}`);
	else debug(`Trying to sync broker ${brokerId} but it is offline`);
}
broker.setBrokerModuleNegotiator({
	forBroker: Comlink.transfer(async (brokerId: number) => {
		const brokerModules = await getBrokerModules(brokerId);
		return brokerModules.map(m => ({ name: m.name, version: m.version }));
	}),
	compare: Comlink.transfer(async (localModuleInfos: ModuleInfo[], remoteModuleInfos: ModuleInfo[]) => {
		const missingModules = localModuleInfos.filter(m1 => remoteModuleInfos.findIndex(m2 => m1.name == m2.name) == -1);
		const deletedModules = remoteModuleInfos.filter(m1 => localModuleInfos.findIndex(m2 => m1.name == m2.name) == -1);
		const changedModules = localModuleInfos.filter(m1 => remoteModuleInfos.findIndex(m2 => m1.name == m2.name && m1.version != m2.version) != -1);
		return [
			...missingModules.map(m => ({ ...m, action: "install" as const })),
			...deletedModules.map(m => ({ ...m, action: "uninstall" as const })),
			...changedModules.map(m => ({ ...m, action: "replace" as const }))
		];
	}),
	detail: Comlink.transfer(async (moduleInfo: ModuleInfo) => {
		const module = [...mirrorModules.values()].find(m => m.name == moduleInfo.name && m.version == moduleInfo.version);
		const sourceCode = clamatModuleModifierEditor.findLast(["BrokerSourceCode"], module.modifiers).value;
		const nodeBrokerPacketDefinitions = clamatModuleModifierEditor.filter(["NodeBrokerPacketDefintion"], module.modifiers).map(m => m.value);
		const brokerServerPacketDefinitions = clamatModuleModifierEditor.filter(["BrokerServerPacketDefintion"], module.modifiers).map(m => m.value);
		return {
			sourceCode: sourceCode,
			nodeBrokerPacketDefinitions: nodeBrokerPacketDefinitions,
			brokerServerPacketDefinitions: brokerServerPacketDefinitions
		}
	}),
	getOptions: Comlink.transfer(async (brokerId: number, name: string, ids: string[]) => {
		const brokerModules = await getBrokerModules(brokerId);
		const moduleOptions = brokerModules.find(m => m.name == name).options;
		return ids.map(i => moduleOptions[i]);
	}),
	setOptions: Comlink.transfer(async (brokerId: number, name: string, ids: string[], values: any[]) => {
		await modifyBrokerModules(brokerId, async (modifiers) => {
			for (let i = 0; i < ids.length; i++) {
				const id = ids[i];
				const value = values[i];
				let modifier = clamatBrokerModifierEditor.findLast(["ModuleOption"], modifiers, m => m.value.module == name && m.value.id == id);
				if (modifier != null) { modifier.value = value; continue; }
				modifier = { name: "ModuleOption", value: { module: name, id: id, value: value } };
				clamatBrokerModifierEditor.add(modifiers, modifier);
			}
		});
	}),
	deleteOptions: Comlink.transfer(async (brokerId: number, name: string, ids: string[]) => {
		await modifyBrokerModules(brokerId, async (modifiers) => {
			for (const id of ids) {
				const index = clamatBrokerModifierEditor.findLastIndex(["ModuleOption"], modifiers, m => m.value.module == name && m.value.id == id);
				if (index == -1) continue;
				clamatBrokerModifierEditor.remove(modifiers, index);
			}
		})
	}),
	listOptions: Comlink.transfer(async (brokerId: number, name: string) => {
		const brokerModules = await getBrokerModules(brokerId);
		const moduleOptions = brokerModules.find(m => m.name == name).options;
		return Object.keys(moduleOptions);
	})
});

interface MirroredModule {
	id: string;
	name: string;
	version: string;
	modifiers: CLamatModuleModifiers[];
}
const mirrorModules = new Map<string, MirroredModule>();
const db = (new MongoClient(process.env.DATABASE_URL)).db("clamat");
const CLamatModuleCollection = db.collection("CLamatModule");
const CLamatBrokerCollection = db.collection("CLamatBroker");

(async () => {
	const moduleUpdateWatchStream = CLamatModuleCollection.watch([
		{
			$or: [
				{ $match: { operationType: "insert" } },
				{ $match: { operationType: "update" } },
				{ $match: { operationType: "replace" } },
				{ $match: { operationType: "delete" } }
			]
		}
	], {
		fullDocument: "whenAvailable"
	});
	for await (const change of moduleUpdateWatchStream) {
		if (change.operationType == "insert" || change.operationType == "update" || change.operationType == "replace") {
			const id = change.documentKey._id.toHexString();
			const fullDocument = change.fullDocument;
			mirrorModules.set(id, {
				id: id,
				name: fullDocument.name,
				version: fullDocument.version,
				modifiers: fullDocument.modifiers
			});
		}
		if (change.operationType == "delete") {
			const id = change.documentKey._id.toHexString();
			mirrorModules.delete(id);
		}
	}
	await moduleUpdateWatchStream.close();
})();
(async () => {
	const brokerUpdateWatchStream = CLamatBrokerCollection.watch([
		{ $match: { operationType: "update" } }
	], {
		fullDocument: "required",
		fullDocumentBeforeChange: "required"
	});
	for await (const change of brokerUpdateWatchStream) {
		if (change.operationType == "update") {
			const id = change.documentKey._id.toHexString();
			const fullDocument = change.fullDocument;
			const fullDocumentBeforeChange = change.fullDocumentBeforeChange;
			const newModifiers = clamatBrokerModifierEditor.filter(["Module", "ModuleOption"], fullDocument.modifiers).map(m => JSON.stringify(m)).sort().join("\n");
			const oldModifiers = clamatBrokerModifierEditor.filter(["Module", "ModuleOption"], fullDocumentBeforeChange.modifiers).map(m => JSON.stringify(m)).sort().join("\n");
			if (newModifiers == oldModifiers) continue;
			syncBrokerModules(uuidv4tou16(id));
		}
	}
	await brokerUpdateWatchStream.close();
})();

// processor: (stateless) process packet (either directly or timestep from database) and do action (emit to visualizer) about it.
// visualizer: (stateless) visualize data from process

const NodePingPacket = newStructType({ // Node -> Server, Server -> Node
	user: "ushort"
});
const NodePongPacket = newStructType({ // Node -> Server, Server -> Node
	user: "ushort"
});

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
