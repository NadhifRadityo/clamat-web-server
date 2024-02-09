import Comlink from "comlink";
import {
	COMMAND_BODYTEMP_READ_SET,
	COMMAND_BODYTEMP_READ_VALUE,
	COMMAND_ECG_READ_SET,
	COMMAND_ECG_READ_VALUE,
	COMMAND_ENVHUMID_READ_SET,
	COMMAND_ENVHUMID_READ_VALUE,
	COMMAND_ENVTEMP_READ_SET,
	COMMAND_ENVTEMP_READ_VALUE,
	COMMAND_OXY_READ_SET,
	COMMAND_OXY_READ_VALUE,
	createDeviceCommunication
} from "./comm";

let comm: ReturnType<typeof createDeviceCommunication>;
const releases = [];

export async function construct() {
	if (comm != null)
		await destruct();
	comm = createDeviceCommunication("COM7");
	await comm.start();
	ecgCounter = 0;
	oxyCounter = 0;
	bodyTempCounter = 0;
	envTempCounter = 0;
	envHumidCounter = 0;
}
export async function destruct() {
	if (comm == null) return;
	releases.forEach(r => r());
	try {
		await comm.stop();
	} finally {
		comm = null;
		ecgCounter = 0;
		oxyCounter = 0;
		bodyTempCounter = 0;
		envTempCounter = 0;
		envHumidCounter = 0;
		releases.splice(0);
	}
}

let ecgCounter = 0;
export async function readEcg(callback: (value: number) => void) {
	const comm0 = comm;
	if (ecgCounter == 0)
		await comm0.send(COMMAND_ECG_READ_SET, 1);
	ecgCounter++;
	const release = comm0.onPacket(packet => {
		if (packet.command != COMMAND_ECG_READ_VALUE) return;
		callback(packet.value as number);
	});
	releases.push(release);
	return Comlink.transfer(async () => {
		release();
		ecgCounter--;
		if (ecgCounter == 0)
			await comm0.send(COMMAND_ECG_READ_SET, 0);
	});
}

let oxyCounter = 0;
export async function readOxy(callback: (value: number) => void) {
	const comm0 = comm;
	if (oxyCounter == 0)
		await comm0.send(COMMAND_OXY_READ_SET, 1);
	oxyCounter++;
	const release = comm0.onPacket(packet => {
		if (packet.command != COMMAND_OXY_READ_VALUE) return;
		callback(packet.value as number);
	});
	releases.push(release);
	return Comlink.transfer(async () => {
		release();
		oxyCounter--;
		if (oxyCounter == 0)
			await comm0.send(COMMAND_OXY_READ_SET, 0);
	});
}

let bodyTempCounter = 0;
export async function readBodyTemp(callback: (value: number) => void) {
	const comm0 = comm;
	if (bodyTempCounter == 0)
		await comm0.send(COMMAND_BODYTEMP_READ_SET, 1);
	bodyTempCounter++;
	const release = comm0.onPacket(packet => {
		if (packet.command != COMMAND_BODYTEMP_READ_VALUE) return;
		callback(packet.value as number);
	});
	releases.push(release);
	return Comlink.transfer(async () => {
		release();
		bodyTempCounter--;
		if (bodyTempCounter == 0)
			await comm0.send(COMMAND_BODYTEMP_READ_SET, 0);
	});
}

let envTempCounter = 0;
export async function readEnvTemp(callback: (value: number) => void) {
	const comm0 = comm;
	if (envTempCounter == 0)
		await comm0.send(COMMAND_ENVTEMP_READ_SET, 1);
	envTempCounter++;
	const release = comm0.onPacket(packet => {
		if (packet.command != COMMAND_ENVTEMP_READ_VALUE) return;
		callback(packet.value as number);
	});
	releases.push(release);
	return Comlink.transfer(async () => {
		release();
		envTempCounter--;
		if (envTempCounter == 0)
			await comm0.send(COMMAND_ENVTEMP_READ_SET, 0);
	});
}

let envHumidCounter = 0;
export async function readEnvHumid(callback: (value: number) => void) {
	const comm0 = comm;
	if (envHumidCounter == 0)
		await comm0.send(COMMAND_ENVHUMID_READ_SET, 1);
	envHumidCounter++;
	const release = comm0.onPacket(packet => {
		if (packet.command != COMMAND_ENVHUMID_READ_VALUE) return;
		callback(packet.value as number);
	});
	releases.push(release);
	return Comlink.transfer(async () => {
		release();
		envHumidCounter--;
		if (envHumidCounter == 0)
			await comm0.send(COMMAND_ENVHUMID_READ_SET, 0);
	});
}
