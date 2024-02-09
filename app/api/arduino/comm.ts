import { SerialPort } from 'serialport'

export const COMMAND_PING = 0b00000000;
export const COMMAND_PONG = 0b00000001;
export const COMMAND_SYSTEM_STARTSEQUENCE_PRINT = 0b00010000;
export const COMMAND_SYSTEM_STARTSEQUENCE_PRINT_ACK = 0b00010001;
export const COMMAND_SYSTEM_IDENTITY_GET = 0b00010010;
export const COMMAND_SYSTEM_IDENTITY_GET_ACK = 0b00010011;
export const COMMAND_LED_SET = 0b00100000;
export const COMMAND_LED_SET_ACK = 0b00100001;
export const COMMAND_LED_GET = 0b00100010;
export const COMMAND_LED_GET_ACK = 0b00100011;
export const COMMAND_ECG_READ_SET = 0b00110000;
export const COMMAND_ECG_READ_SET_ACK = 0b00110001;
export const COMMAND_ECG_READ_GET = 0b00110010;
export const COMMAND_ECG_READ_GET_ACK = 0b00110011;
export const COMMAND_ECG_READ_VALUE = 0b00110100;
export const COMMAND_OXY_READ_SET = 0b01000000;
export const COMMAND_OXY_READ_SET_ACK = 0b01000001;
export const COMMAND_OXY_READ_GET = 0b01000010;
export const COMMAND_OXY_READ_GET_ACK = 0b01000011;
export const COMMAND_OXY_READ_VALUE = 0b01000100;
export const COMMAND_BODYTEMP_READ_SET = 0b01010000;
export const COMMAND_BODYTEMP_READ_SET_ACK = 0b01010001;
export const COMMAND_BODYTEMP_READ_GET = 0b01010010;
export const COMMAND_BODYTEMP_READ_GET_ACK = 0b01010011;
export const COMMAND_BODYTEMP_READ_VALUE = 0b01010100;
export const COMMAND_ENVTEMP_READ_SET = 0b01100000;
export const COMMAND_ENVTEMP_READ_SET_ACK = 0b01100001;
export const COMMAND_ENVTEMP_READ_GET = 0b01100010;
export const COMMAND_ENVTEMP_READ_GET_ACK = 0b01100011;
export const COMMAND_ENVTEMP_READ_VALUE = 0b01100100;
export const COMMAND_ENVHUMID_READ_SET = 0b01110000;
export const COMMAND_ENVHUMID_READ_SET_ACK = 0b01110001;
export const COMMAND_ENVHUMID_READ_GET = 0b01110010;
export const COMMAND_ENVHUMID_READ_GET_ACK = 0b01110011;
export const COMMAND_ENVHUMID_READ_VALUE = 0b01110100;

const startSequence = Buffer.from([
	121, 210, 15, 129, 98, 30, 111, 175,
	122, 239, 156, 151, 121, 157, 204, 157,
	106, 39, 39, 174, 198, 3, 80, 135,
	123, 94, 76, 247, 13, 38, 124, 174,
	76, 162, 111, 108, 228, 37, 43, 0,
	202, 101, 70, 189, 145, 200, 121, 156,
	207, 85, 243, 217, 126, 39, 197, 128,
	124, 100, 71, 95, 206, 182, 74, 17
]);

function newTempBuffer() {
	let tempBufferRef = new WeakRef(Buffer.alloc(1024));
	return function getTempBuffer(size: number) {
		let tempBuffer = tempBufferRef.deref();
		if (tempBuffer == null || tempBuffer.length < size) {
			tempBuffer = Buffer.alloc(size);
			tempBufferRef = new WeakRef(tempBuffer);
		}
		return tempBuffer;
	};
}
function crc16(current: Uint8Array, previous: number = 0) {
	let crc = previous & 0xFFFF;
	for (const value of current) {
		crc = (crc ^ value << 8) & 0xFFFF;
		for (let i = 0; i < 8; i++) {
			if ((crc & (1 << 15)) != 0) {
				crc = (crc << 1) & 0xFFFF;
				crc = (crc ^ 0x8001) & 0xFFFF;
			} else
				crc = (crc << 1) & 0xFFFF;
		}
	}
	return crc;
};

export function createDeviceCommunication(address: string) {
	const serialport = new SerialPort({
		path: address,
		baudRate: 9600,
		endOnClose: true,
		autoOpen: false,
		hupcl: false
	});
	const getReadTempBuffer = newTempBuffer();
	const READ_BAILOUT = Symbol("READ_BAILOUT");
	let readBuffer = Buffer.alloc(1024);
	let readIndex = 0;
	let readLength = 0;
	let readCrcValue = 0;
	let readBailoutIndex = 0;
	let readBailoutLength = 0;
	let readBailoutCrcValue = 0;
	let readUnlock: () => void = null;
	const readCaptureBailout = () => {
		readBailoutIndex = readIndex;
		readBailoutLength = readLength;
		readBailoutCrcValue = readCrcValue;
	};
	const readApplyBailout = () => {
		readIndex = readBailoutIndex;
		readLength = readBailoutLength;
		readCrcValue = readBailoutCrcValue;
	};
	const readBytes = (length: number, outBuffer = getReadTempBuffer(length), outBufferOffset = 0) => {
		if (ended)
			throw new Error("Communication closed");
		if (readLength < length)
			throw READ_BAILOUT;
		if (readIndex >= readLength) {
			const index = readIndex - readLength;
			try {
				readBuffer.copy(outBuffer, outBufferOffset + 0, index, index + length);
				readCrcValue = crc16(readBuffer.subarray(index, index + length), readCrcValue);
				readLength -= length;
				return outBuffer;
			} catch (e) {
				console.log("read data Copy error", JSON.stringify({ readIndex, readLength, index }));
				throw e;
			}
		}
		const rightIndex = (readBuffer.length + readIndex) - readLength;
		const leftIndex = 0;
		const rightLength = readBuffer.length - rightIndex;
		const leftLength = length - rightLength;
		if (length <= rightLength) {
			readBuffer.copy(outBuffer, outBufferOffset + 0, rightIndex, rightIndex + length);
			readCrcValue = crc16(readBuffer.subarray(rightIndex, rightIndex + length), readCrcValue);
			readLength -= length;
			return outBuffer;
		}
		readBuffer.copy(outBuffer, outBufferOffset + 0, rightIndex, rightIndex + rightLength);
		readBuffer.copy(outBuffer, outBufferOffset + rightLength, leftIndex, leftIndex + leftLength);
		readCrcValue = crc16(readBuffer.subarray(rightIndex, rightIndex + rightLength), readCrcValue);
		readCrcValue = crc16(readBuffer.subarray(leftIndex, leftIndex + leftLength), readCrcValue);
		readLength -= length;
		return outBuffer;
	};
	const readUByte = () => {
		return readBytes(1).readUInt8(0);
	};
	const readUShort = () => {
		return readBytes(2).readUInt16LE(0);
	};
	const readUInt = () => {
		return readBytes(4).readUInt32LE(0);
	};
	const readULong = () => {
		return readBytes(8).readBigUInt64LE(0);
	};
	const readByte = () => {
		return readBytes(1).readInt8(0);
	};
	const readShort = () => {
		return readBytes(2).readInt16LE(0);
	};
	const readInt = () => {
		return readBytes(4).readInt32LE(0);
	};
	const readLong = () => {
		return readBytes(8).readBigInt64LE(0);
	};
	const readFloat = () => {
		return readBytes(4).readFloatLE(0);
	};
	const readDouble = () => { // Warn, double on arduino uno is the same size as float.
		return readBytes(8).readDoubleLE(0);
	};
	const readString = () => {
		const length = readUShort();
		const bytes = readBytes(length);
		return bytes.toString("ascii", 0, length);
	};
	const readCRC = () => {
		return readUShort();
	};

	let writeTempBuffer = Buffer.alloc(256);
	let writeTempLength = 0;
	let writeCrcValue = 0;
	const writeBytes = (buffer: Buffer, length: number, offset = 0) => {
		if (ended)
			throw new Error("Communication closed");
		if (writeTempLength + length > writeTempBuffer.length) {
			const newBuffer = Buffer.alloc(writeTempBuffer.length + Math.max(128, length));
			writeTempBuffer.copy(newBuffer, 0, 0, writeTempLength);
			writeTempBuffer = newBuffer;
		}
		buffer.copy(writeTempBuffer, writeTempLength, offset, offset + length);
		writeCrcValue = crc16(buffer.subarray(offset, offset + length), writeCrcValue);
		writeTempLength += length;
	};
	const flushWrite = async () => {
		const flushedData = writeTempBuffer.toString("base64", 0, writeTempLength);
		writeTempLength = 0;
		serialport.write(flushedData, "base64");
		await new Promise((resolve, reject) => {
			serialport.drain(error => {
				if (error != null) reject(error);
				else resolve(null);
			});
		});
	};
	const getWorkingWriteTempBuffer = newTempBuffer();
	const writeUByte = (value: number) => {
		const tempBuffer = getWorkingWriteTempBuffer(1);
		tempBuffer.writeUInt8(value);
		writeBytes(tempBuffer, 1);
	};
	const writeUShort = (value: number) => {
		const tempBuffer = getWorkingWriteTempBuffer(2);
		tempBuffer.writeUInt16LE(value);
		writeBytes(tempBuffer, 2);
	};
	const writeUInt = (value: number) => {
		const tempBuffer = getWorkingWriteTempBuffer(4);
		tempBuffer.writeUInt32LE(value);
		writeBytes(tempBuffer, 4);
	};
	const writeULong = (value: bigint) => {
		const tempBuffer = getWorkingWriteTempBuffer(8);
		tempBuffer.writeBigUInt64LE(value);
		writeBytes(tempBuffer, 8);
	};
	const writeByte = (value: number) => {
		const tempBuffer = getWorkingWriteTempBuffer(1);
		tempBuffer.writeInt8(value);
		writeBytes(tempBuffer, 1);
	};
	const writeShort = (value: number) => {
		const tempBuffer = getWorkingWriteTempBuffer(2);
		tempBuffer.writeInt16LE(value);
		writeBytes(tempBuffer, 2);
	};
	const writeInt = (value: number) => {
		const tempBuffer = getWorkingWriteTempBuffer(4);
		tempBuffer.writeInt32LE(value);
		writeBytes(tempBuffer, 4);
	};
	const writeLong = (value: bigint) => {
		const tempBuffer = getWorkingWriteTempBuffer(8);
		tempBuffer.writeBigInt64LE(value);
		writeBytes(tempBuffer, 8);
	};
	const writeFloat = (value: number) => {
		const tempBuffer = getWorkingWriteTempBuffer(4);
		tempBuffer.writeFloatLE(value);
		writeBytes(tempBuffer, 4);
	};
	const writeDouble = (value: number) => {
		const tempBuffer = getWorkingWriteTempBuffer(8);
		tempBuffer.writeDoubleLE(value);
		writeBytes(tempBuffer, 8);
	};
	const writeString = (value: string) => { // not yet supported in arduino side
		const tempBuffer = getWorkingWriteTempBuffer(4 + value.length);
		tempBuffer.writeUint16LE(value.length);
		tempBuffer.write(value, 4, "ascii");
		writeBytes(tempBuffer, 4 + value.length);
	};
	const writeCRC = () => {
		writeUShort(writeCrcValue);
		writeCrcValue = 0;
	};

	let started = false;
	let ended = false;
	let cleanup = () => { };
	const pushData = (buffer: Buffer) => {
		if (readBailoutLength + buffer.length > readBuffer.length) {
			const newReadBuffer = Buffer.alloc(readBuffer.length + Math.max(Math.floor(readBuffer.length / 4), buffer.length + 64));
			if (readIndex >= readLength)
				readBuffer.copy(newReadBuffer, 0, readIndex - readLength, readIndex);
			else {
				const index1 = (readBuffer.length + readIndex) - readLength;
				const index2 = 0;
				const length1 = readBuffer.length - index1;
				const length2 = readLength - length1;
				readBuffer.copy(newReadBuffer, 0, index1, index1 + length1);
				readBuffer.copy(newReadBuffer, length1, index2, index2 + length2);
			}
			readBuffer = newReadBuffer;
			readIndex = readLength;
		}
		const forwardLength = Math.min(readIndex + buffer.length, readBuffer.length) - readIndex;
		const backwardLength = buffer.length - forwardLength;
		try {
			buffer.copy(readBuffer, readIndex, 0, forwardLength);
			buffer.copy(readBuffer, 0, forwardLength, forwardLength + backwardLength);
		} catch (e) {
			console.log("push data Copy error", JSON.stringify({ readIndex, readLength, forwardLength, backwardLength }));
			throw e;
		}
		readLength += buffer.length;
		readIndex += buffer.length;
		if (readIndex >= readBuffer.length)
			readIndex -= readBuffer.length;
		if (readUnlock != null) {
			readUnlock();
			readUnlock = null;
		}
	};
	const start = async (timeout: number = 10 * 1000) => {
		if (started) return;
		started = true;
		await new Promise((resolve, reject) => {
			serialport.open(error => {
				if (error != null) reject(error);
				else resolve(null);
			});
		});
		await alignSequence(timeout);
		const releaseOnDataReceived = (() => {
			const onData = (chunk: Uint8Array) => {
				pushData(Buffer.from(chunk));
			}
			serialport.on("data", onData);
			return () => {
				serialport.off("data", onData);
			}
		})();
		const releaseOnDeviceDisconnected = (() => {
			const onEnd = () => {
				stop();
			}
			serialport.on("end", onEnd);
			return () => {
				serialport.off("end", onEnd);
			}
		})();
		(async () => {
			while (!ended) {
				readCaptureBailout();
				try {
					const packet = readPacket();
					for (const packetListener of packetListeners)
						packetListener(packet);
				} catch (e) {
					if (e instanceof Error && e.message == "Communication closed")
						return;
					if (e == READ_BAILOUT) {
						readApplyBailout();
						await new Promise(res => readUnlock = () => res(null));
						continue;
					}
					if (e == READ_PACKET_INVALID) {
						readApplyBailout();
						let recovered = false;
						for (let i = 0; i < 8 && i < readLength; i++) {
							readCaptureBailout();
							readIndex += i + 1;
							readLength -= i + 1;
							let packet: ReturnType<typeof readPacket>;
							try {
								packet = readPacket(true);
							} catch (e2) {
								readApplyBailout();
								if (e2 instanceof Error && e2.message == "Communication closed")
									return;
								if (e2 == READ_BAILOUT || e2 == READ_PACKET_INVALID) continue;
								throw e2;
							}
							recovered = true;
							console.warn(`Recovered with offset ${i + 1}`);
							for (const packetListener of packetListeners)
								packetListener(packet);
							break;
						}
						if (!recovered) {
							readIndex++;
							readLength--;
						}
						continue;
					}
					console.warn(e?.stack || e?.message || e);
					throw e;
				}
			}
		})();
		(async () => {
			let lastPing = -1;
			const pingInterval = 1000;
			while (!ended) {
				try {
					const wait = pingInterval - (Date.now() - lastPing);
					if (wait > 0) await new Promise(res => setTimeout(res, wait));
					await send(COMMAND_PING, null, 2000);
					lastPing = Date.now();
				} catch (e) {
					if (e instanceof Error && e.message == "Timed out waiting packet")
						continue;
					if (e instanceof Error && e.message == "Communication closed")
						return;
					throw e;
				}
			}
		})();
		cleanup = () => {
			releaseOnDataReceived();
			releaseOnDeviceDisconnected();
		};
	};
	const stop = async () => {
		if (!started)
			throw new Error("Communication not started");
		if (ended) return;
		await new Promise((resolve, reject) => {
			serialport.close(error => {
				if (error != null) reject(error);
				else resolve(null);
			});
		});
		ended = true;
		cleanup();
		readBuffer = null;
		readIndex = 0;
		readLength = 0;
		readBailoutIndex = 0;
		readBailoutLength = 0;
		if (readUnlock != null) {
			readUnlock();
			readUnlock = null;
		}
		writeTempBuffer = null;
		writeTempLength = 0;
	};

	const generateUser = () => Math.floor(Math.random() * 256);
	const alignSequence = async (timeout: number) => {
		const user = generateUser();
		writeUByte(COMMAND_SYSTEM_STARTSEQUENCE_PRINT);
		writeUByte(user);
		writeCRC();
		await flushWrite();
		const targetSequence = Buffer.alloc(1 + 1 + startSequence.length + 2);
		targetSequence.writeUInt8(COMMAND_SYSTEM_STARTSEQUENCE_PRINT_ACK, 0);
		targetSequence.writeUInt8(user, 1);
		startSequence.copy(targetSequence, 1 + 1, 0, startSequence.length);
		targetSequence.writeUInt16LE(crc16(targetSequence.subarray(0, 1 + 1 + startSequence.length)), 1 + 1 + startSequence.length);
		const start = Date.now();
		let now: number;
		let index = 0;
		while (((now = Date.now()) - start) <= timeout) {
			const remaining = start + timeout - now;
			let handle = null;
			let cleanup = null;
			const buffer = await Promise.race<null | Buffer>([
				new Promise(res => handle = setTimeout(res, remaining)),
				new Promise((resolve, reject) => {
					const _cleanup = cleanup = () => {
						serialport.off("data", onData);
						serialport.off("end", onEnd);
					}
					const onData = (chunk: Uint8Array) => {
						_cleanup();
						resolve(Buffer.from(chunk));
					}
					const onEnd = () => {
						_cleanup();
						reject(new Error("Communication closed"));
					}
					serialport.on("data", onData);
					serialport.on("end", onEnd);
				})
			]);
			clearTimeout(handle);
			cleanup();
			if (buffer == null)
				continue;
			console.log("passed", buffer.length, "bytes");
			let endIndex = -1;
			for (let i = 0; i < buffer.length; i++) {
				if (buffer[i] != targetSequence[index]) {
					index = 0;
					continue;
				}
				index++;
				if (index < targetSequence.length)
					continue;
				endIndex = i + 1;
			}
			if (endIndex == -1) continue;
			if (endIndex < buffer.length)
				pushData(buffer.subarray(endIndex));
			return;
		}
		throw new Error("Timed out while searching start sequence");
	};
	const READ_PACKET_INVALID = Symbol("READ_PACKET_INVALID");
	const assertCRC = () => {
		const recievedCrc = readCrcValue;
		const packetCrc = readCRC();
		readCrcValue = 0;
		if (recievedCrc == packetCrc)
			return;
		throw READ_PACKET_INVALID;
	};
	const readPacket = (recovery = false) => {
		const command = readUByte();
		const user = readUByte();
		if (command == COMMAND_PONG) {
			assertCRC();
			return { command: COMMAND_PONG, user };
		}
		if (command == COMMAND_SYSTEM_STARTSEQUENCE_PRINT_ACK) {
			const seq = readBytes(64, Buffer.alloc(64));
			assertCRC();
			return { command: COMMAND_SYSTEM_STARTSEQUENCE_PRINT_ACK, user, startSequence: seq };
		}
		if (command == COMMAND_SYSTEM_IDENTITY_GET_ACK) {
			const identity = readString();
			assertCRC();
			return { command: COMMAND_SYSTEM_IDENTITY_GET_ACK, user, identity: identity };
		}
		if (command == COMMAND_LED_SET_ACK) {
			assertCRC();
			return { command: COMMAND_LED_SET_ACK, user };
		}
		if (command == COMMAND_LED_GET_ACK) {
			const value = readByte() != 0;
			assertCRC();
			return { command: COMMAND_LED_GET_ACK, user, value: value };
		}
		if (command == COMMAND_ECG_READ_SET_ACK) {
			assertCRC();
			return { command: COMMAND_ECG_READ_SET_ACK, user };
		}
		if (command == COMMAND_ECG_READ_GET_ACK) {
			const value = readByte() != 0;
			assertCRC();
			return { command: COMMAND_ECG_READ_GET_ACK, user, value: value };
		}
		if (command == COMMAND_ECG_READ_VALUE) {
			const value = readFloat();
			assertCRC();
			return { command: COMMAND_ECG_READ_VALUE, user, value: value };
		}
		if (command == COMMAND_OXY_READ_SET_ACK) {
			assertCRC();
			return { command: COMMAND_OXY_READ_SET_ACK, user };
		}
		if (command == COMMAND_OXY_READ_GET_ACK) {
			const value = readByte() != 0;
			assertCRC();
			return { command: COMMAND_OXY_READ_GET_ACK, user, value: value };
		}
		if (command == COMMAND_OXY_READ_VALUE) {
			const value = readFloat();
			assertCRC();
			return { command: COMMAND_OXY_READ_VALUE, user, value: value };
		}
		if (command == COMMAND_BODYTEMP_READ_SET_ACK) {
			assertCRC();
			return { command: COMMAND_BODYTEMP_READ_SET_ACK, user };
		}
		if (command == COMMAND_BODYTEMP_READ_GET_ACK) {
			const value = readByte() != 0;
			assertCRC();
			return { command: COMMAND_BODYTEMP_READ_GET_ACK, user, value: value };
		}
		if (command == COMMAND_BODYTEMP_READ_VALUE) {
			const value = readFloat();
			assertCRC();
			return { command: COMMAND_BODYTEMP_READ_VALUE, user, value: value };
		}
		if (command == COMMAND_ENVTEMP_READ_SET_ACK) {
			assertCRC();
			return { command: COMMAND_ENVTEMP_READ_SET_ACK, user };
		}
		if (command == COMMAND_ENVTEMP_READ_GET_ACK) {
			const value = readByte() != 0;
			assertCRC();
			return { command: COMMAND_ENVTEMP_READ_GET_ACK, user, value: value };
		}
		if (command == COMMAND_ENVTEMP_READ_VALUE) {
			const value = readFloat();
			assertCRC();
			return { command: COMMAND_ENVTEMP_READ_VALUE, user, value: value };
		}
		if (command == COMMAND_ENVHUMID_READ_SET_ACK) {
			assertCRC();
			return { command: COMMAND_ENVHUMID_READ_SET_ACK, user };
		}
		if (command == COMMAND_ENVHUMID_READ_GET_ACK) {
			const value = readByte() != 0;
			assertCRC();
			return { command: COMMAND_ENVHUMID_READ_GET_ACK, user, value: value };
		}
		if (command == COMMAND_ENVHUMID_READ_VALUE) {
			const value = readFloat();
			assertCRC();
			return { command: COMMAND_ENVHUMID_READ_VALUE, user, value: value };
		}
		assertCRC();
		if (!recovery)
			console.warn(`Invalid receive command ${command} with user ${user}`);
		throw READ_PACKET_INVALID;
	};
	const writePacket = ({ command, user, value }: { command: number, user: number, value?: any }) => {
		if (command == COMMAND_PING) {
			writeUByte(COMMAND_PING);
			writeUByte(user);
			writeCRC();
			return;
		}
		if (command == COMMAND_SYSTEM_STARTSEQUENCE_PRINT) {
			writeUByte(COMMAND_SYSTEM_STARTSEQUENCE_PRINT);
			writeUByte(user);
			writeCRC();
			return;
		}
		if (command == COMMAND_SYSTEM_IDENTITY_GET) {
			writeUByte(COMMAND_SYSTEM_IDENTITY_GET);
			writeUByte(user);
			writeCRC();
			return;
		}
		if (command == COMMAND_LED_SET) {
			writeUByte(COMMAND_LED_SET);
			writeUByte(user);
			writeUByte(value);
			writeCRC();
			return;
		}
		if (command == COMMAND_LED_GET) {
			writeUByte(COMMAND_LED_GET);
			writeUByte(user);
			writeCRC();
			return;
		}
		if (command == COMMAND_ECG_READ_SET) {
			writeUByte(COMMAND_ECG_READ_SET);
			writeUByte(user);
			writeUByte(value);
			writeCRC();
			return;
		}
		if (command == COMMAND_ECG_READ_GET) {
			writeUByte(COMMAND_ECG_READ_GET);
			writeUByte(user);
			writeCRC();
			return;
		}
		if (command == COMMAND_OXY_READ_SET) {
			writeUByte(COMMAND_OXY_READ_SET);
			writeUByte(user);
			writeUByte(value);
			writeCRC();
			return;
		}
		if (command == COMMAND_OXY_READ_GET) {
			writeUByte(COMMAND_OXY_READ_GET);
			writeUByte(user);
			writeCRC();
			return;
		}
		if (command == COMMAND_BODYTEMP_READ_SET) {
			writeUByte(COMMAND_BODYTEMP_READ_SET);
			writeUByte(user);
			writeUByte(value);
			writeCRC();
			return;
		}
		if (command == COMMAND_BODYTEMP_READ_GET) {
			writeUByte(COMMAND_BODYTEMP_READ_GET);
			writeUByte(user);
			writeCRC();
			return;
		}
		if (command == COMMAND_ENVTEMP_READ_SET) {
			writeUByte(COMMAND_ENVTEMP_READ_SET);
			writeUByte(user);
			writeUByte(value);
			writeCRC();
			return;
		}
		if (command == COMMAND_ENVTEMP_READ_GET) {
			writeUByte(COMMAND_ENVTEMP_READ_GET);
			writeUByte(user);
			writeCRC();
			return;
		}
		if (command == COMMAND_ENVHUMID_READ_SET) {
			writeUByte(COMMAND_ENVHUMID_READ_SET);
			writeUByte(user);
			writeUByte(value);
			writeCRC();
			return;
		}
		if (command == COMMAND_ENVHUMID_READ_GET) {
			writeUByte(COMMAND_ENVHUMID_READ_GET);
			writeUByte(user);
			writeCRC();
			return;
		}
		console.warn(`Invalid send command ${command} with user ${user}`);
	};
	type ReadPacket = Awaited<ReturnType<typeof readPacket>>;
	const packetListeners: ((packet: ReadPacket) => void)[] = [];
	const send = async (command: number, value = null, timeout = 5000) => {
		const user = generateUser();
		let resolve: (v: ReadPacket) => void;
		let reject: (e: any) => void;
		const promise = new Promise<ReadPacket>((res, rej) => { resolve = res; reject = rej; });
		const releaseOnPacket = onPacket(packet => {
			if (packet.user != user) return;
			releaseOnPacket();
			clearTimeout(handle);
			resolve(packet);
		});
		const handle = isFinite(timeout) ? setTimeout(() => {
			releaseOnPacket();
			reject(new Error("Timed out waiting packet"));
		}, timeout) : null;
		writePacket({ command, user: user, value });
		await flushWrite();
		return await promise;
	};
	const onPacket = (callback: (packet: ReadPacket) => void) => {
		packetListeners.push(callback);
		return () => {
			packetListeners.splice(packetListeners.indexOf(callback), 1);
		};
	};

	return {
		__: {
			readCaptureBailout,
			readApplyBailout,
			readBytes,
			readUByte,
			readUShort,
			readUInt,
			readULong,
			readByte,
			readShort,
			readInt,
			readLong,
			readFloat,
			readDouble,
			readString,
			readCRC,
			writeBytes,
			writeUByte,
			writeUShort,
			writeUInt,
			writeULong,
			writeByte,
			writeShort,
			writeInt,
			writeLong,
			writeFloat,
			writeDouble,
			writeString,
			writeCRC,
			flushWrite
		},
		start,
		stop,
		send,
		onPacket
	};
}
