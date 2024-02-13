import * as net from "net";
import ip from "ip";
import getConfig from "next/config";
import { newTempDir } from "@/utils/tempDir";

const { serverRuntimeConfig } = getConfig();
export const serverIpAddress = serverRuntimeConfig.CLAMAT_SERVER_IP_ADDRESS;
export const serverIpSubnet = serverRuntimeConfig.CLAMAT_SERVER_IP_SUBNET;
export const serverId = serverRuntimeConfig.CLAMAT_SERVER_ID;
export const serverCidr = ip.cidrSubnet(`${serverIpAddress}/${serverIpSubnet}`);
export const tempDir = newTempDir("clamat");
export type InjectStructPropertyCommand<T extends ReturnType<typeof newStructType>, C> =
	T extends ReturnType<typeof newStructType<infer P extends StructProperty>> ?
	ReturnType<typeof newStructType<P & { command: C }>> : never;

export const ERR_PACKET_INCOMPLETE = Symbol.for("PACKET_INCOMPLETE");
export const ERR_PACKET_UNKNOWN_COMMAND = Symbol.for("PACKET_UNKNOWN_COMMAND");
export const ERR_PACKET_INVALID_CRC = Symbol.for("ERR_PACKET_INVALID_CRC");

export const BROADCAST_COMMAND_ADVERTISE = 0;
export const BROADCAST_COMMAND_DISCOVER = 2;
export const BROADCAST_COMMAND_DISCOVER_ACK = 3;

export const BROKER_COMMAND_PING = 0;
export const BROKER_COMMAND_PONG = 1;
export const BROKER_COMMAND_RELAY = 2;

export function crc16(current: Uint8Array, previous: number = 0) {
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
}
export function newBufferReader(buffer: Buffer, offset: number = 0) {
	let crcOffset = offset;
	const catchError = <A extends Array<any>, R>(cb: (...args: A) => R) => {
		return (...args: A): R => {
			try {
				return cb(...args);
			} catch (e) {
				if (e.code == "ERR_OUT_OF_RANGE")
					throw ERR_PACKET_INCOMPLETE;
				throw e;
			}
		};
	};
	const readUByte = catchError(() => {
		const result = buffer.readUInt8(offset);
		offset += 1;
		return result;
	});
	const readUShort = catchError(() => {
		const result = buffer.readUInt16LE(offset);
		offset += 2;
		return result;
	});
	const readUInt = catchError(() => {
		const result = buffer.readUInt32LE(offset);
		offset += 4;
		return result;
	});
	const readULong = catchError(() => {
		const result = buffer.readBigUInt64LE(offset);
		offset += 8;
		return result;
	});
	const readByte = catchError(() => {
		const result = buffer.readInt8(offset);
		offset += 1;
		return result;
	});
	const readShort = catchError(() => {
		const result = buffer.readInt16LE(offset);
		offset += 2;
		return result;
	});
	const readInt = catchError(() => {
		const result = buffer.readInt32LE(offset);
		offset += 4;
		return result;
	});
	const readLong = catchError(() => {
		const result = buffer.readBigInt64LE(offset);
		offset += 8;
		return result;
	});
	const readFloat = catchError(() => {
		const result = buffer.readFloatLE(offset);
		offset += 4;
		return result;
	});
	const readDouble = catchError(() => {
		const result = buffer.readDoubleLE(offset);
		offset += 8;
		return result;
	});
	const readBuffer = catchError(() => {
		const length = readUShort();
		const result = buffer.subarray(offset, offset + length);
		offset += length;
		return result;
	});
	const readString = catchError(() => {
		const length = readUShort();
		const result = buffer.toString("ascii", offset, offset + length);
		offset += length;
		return result;
	});
	const readCRC = catchError(() => {
		const expectedCrc = crc16(buffer.subarray(crcOffset, offset));
		const receivedCrc = readUShort();
		return expectedCrc == receivedCrc;
	});
	const _offset = (v?: number | null) => {
		if (v == null) return offset;
		return offset = crcOffset = v;
	};
	return {
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
		readBuffer,
		readString,
		readCRC,
		offset: _offset
	}
}
export function newBufferWriter(buffer: Buffer, offset: number = 0) {
	let crcOffset = offset;
	const catchError = <A extends Array<any>, R>(cb: (...args: A) => R) => {
		return (...args: A): R => {
			try {
				return cb(...args);
			} catch (e) {
				if (e.code == "ERR_OUT_OF_RANGE")
					throw ERR_PACKET_INCOMPLETE;
				throw e;
			}
		};
	};
	const writeUByte = catchError((value: number) => {
		buffer.writeUInt8(value, offset);
		offset += 1;
	});
	const writeUShort = catchError((value: number) => {
		buffer.writeUInt16LE(value, offset);
		offset += 2;
	});
	const writeUInt = catchError((value: number) => {
		buffer.writeUInt32LE(value, offset);
		offset += 4;
	});
	const writeULong = catchError((value: bigint) => {
		buffer.writeBigUInt64LE(value, offset);
		offset += 8;
	});
	const writeByte = catchError((value: number) => {
		buffer.writeInt8(value, offset);
		offset += 1;
	});
	const writeShort = catchError((value: number) => {
		buffer.writeInt16LE(value, offset);
		offset += 2;
	});
	const writeInt = catchError((value: number) => {
		buffer.writeInt32LE(value, offset);
		offset += 4;
	});
	const writeLong = catchError((value: bigint) => {
		buffer.writeBigInt64LE(value, offset);
		offset += 8;
	});
	const writeFloat = catchError((value: number) => {
		buffer.writeFloatLE(value, offset);
		offset += 4;
	});
	const writeDouble = catchError((value: number) => {
		buffer.writeDoubleLE(value, offset);
		offset += 8;
	});
	const writeBuffer = catchError((value: Buffer) => {
		writeUShort(value.length);
		value.copy(buffer, offset, 0, value.length);
		offset += value.length;
	});
	const writeString = catchError((value: string) => {
		writeUShort(value.length);
		buffer.write(value, "ascii");
		offset += value.length;
	});
	const writeCRC = catchError(() => {
		writeUShort(crc16(buffer.subarray(crcOffset, offset)));
	});
	const _offset = (v?: number | null) => {
		if (v == null) return offset;
		return offset = v;
	};
	return {
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
		writeBuffer,
		writeString,
		writeCRC,
		offset: _offset
	}
}
export type StructPropertyTypes = {
	"ubyte": number,
	"ushort": number,
	"uint": number,
	"ulong": bigint,
	"byte": number,
	"short": number,
	"int": number,
	"long": bigint,
	"float": number,
	"double": number,
	"buffer": Buffer,
	"string": string
};
export type StructProperty = Record<string, keyof StructPropertyTypes>;
export type Struct<P extends StructProperty> = { [K in keyof P]:
	P[K] extends keyof StructPropertyTypes ? StructPropertyTypes[P[K]] : P[K] };
export function newStructType<P extends StructProperty>(properties: P) {
	const read = (bufferReader: ReturnType<typeof newBufferReader>) => {
		const struct = {};
		for (const [key, type] of Object.entries(properties)) {
			let value: any;
			if (type == "ubyte") value = bufferReader.readUByte();
			if (type == "ushort") value = bufferReader.readUShort();
			if (type == "uint") value = bufferReader.readUInt();
			if (type == "ulong") value = bufferReader.readULong();
			if (type == "byte") value = bufferReader.readByte();
			if (type == "short") value = bufferReader.readShort();
			if (type == "int") value = bufferReader.readInt();
			if (type == "long") value = bufferReader.readLong();
			if (type == "float") value = bufferReader.readFloat();
			if (type == "double") value = bufferReader.readDouble();
			if (type == "buffer") value = bufferReader.readBuffer();
			if (type == "string") value = bufferReader.readString();
			struct[key] = value;
		}
		return struct as Struct<P>;
	}
	const write = (struct: Struct<P>, bufferWriter: ReturnType<typeof newBufferWriter>) => {
		for (const [key, type] of Object.entries(properties)) {
			const value = struct[key] as any;
			if (type == "ubyte") bufferWriter.writeUByte(value);
			if (type == "ushort") bufferWriter.writeUShort(value);
			if (type == "uint") bufferWriter.writeUInt(value);
			if (type == "ulong") bufferWriter.writeULong(value);
			if (type == "byte") bufferWriter.writeByte(value);
			if (type == "short") bufferWriter.writeShort(value);
			if (type == "int") bufferWriter.writeInt(value);
			if (type == "long") bufferWriter.writeLong(value);
			if (type == "float") bufferWriter.writeFloat(value);
			if (type == "double") bufferWriter.writeDouble(value);
			if (type == "buffer") bufferWriter.writeBuffer(value);
			if (type == "string") bufferWriter.writeString(value);
		}
	}
	const length = (struct: Struct<P>) => {
		let result = 0;
		for (const [key, type] of Object.entries(properties)) {
			const value = struct[key] as any;
			if (type == "ubyte") result += 1;
			if (type == "ushort") result += 2;
			if (type == "uint") result += 4;
			if (type == "ulong") result += 8;
			if (type == "byte") result += 1;
			if (type == "short") result += 2;
			if (type == "int") result += 4;
			if (type == "long") result += 8;
			if (type == "float") result += 4;
			if (type == "double") result += 8;
			if (type == "buffer") result += 2 + value.length;
			if (type == "string") result += 2 + Buffer.byteLength(value, "ascii");
		}
		return result;
	}
	return {
		properties,
		read,
		write,
		length
	}
}
export function newTempBuffer() {
	let tempBufferRef = new WeakRef(Buffer.alloc(1024));
	return function getTempBuffer(size: number) {
		let tempBuffer = tempBufferRef.deref();
		if (tempBuffer == null || tempBuffer.length < size) {
			tempBuffer = Buffer.alloc(size);
			tempBufferRef = new WeakRef(tempBuffer);
		}
		return tempBuffer.subarray(0, size);
	};
}
export function socketReader(socket: net.Socket) {
	const getReadTempBuffer = newTempBuffer();
	const readBuffers = [];
	let readBufferOffset = 0;
	let closed = false;
	let readUnlock = null;
	async function readBytes(length: number, outBuffer = getReadTempBuffer(length), outBufferOffset = 0) {
		if (outBufferOffset + length > outBuffer.length)
			throw new Error("Read offset+length must not exceed outBuffer length");
		if (closed)
			throw new Error("Socket closed");
		let remainingLength = length;
		while (remainingLength > 0) {
			let buffer;
			while ((buffer = readBuffers[0]) == null && !closed)
				await new Promise(resolve => readUnlock = resolve);
			if (closed)
				throw new Error("Socket closed");
			const availableLength = buffer.length - readBufferOffset;
			const readLength = Math.min(remainingLength, availableLength);
			buffer.copy(outBuffer, outBufferOffset + length - remainingLength, readBufferOffset, readBufferOffset + readLength);
			remainingLength -= readLength;
			readBufferOffset += readLength;
			if (readBufferOffset >= buffer.length) {
				readBuffers.splice(0, 1);
				readBufferOffset = 0;
			}
		}
		return outBuffer;
	}
	const onClose = () => {
		readBuffers.splice(0);
		readBufferOffset = 0;
		closed = true;
		if (readUnlock != null)
			readUnlock();
		socket.off("data", onData);
		socket.off("error", onClose);
		socket.off("close", onClose);
	};
	const onData = (buffer: Buffer) => {
		readBuffers.push(buffer);
		if (readUnlock != null)
			readUnlock();
	};
	socket.on("data", onData);
	socket.on("error", onClose);
	socket.on("close", onClose);
	return readBytes;
}
export function socketWriter(socket: net.Socket) {
	const writeBufferPacks0 = [];
	let closed = false;
	function getWriteBufferPack(lengthIndex: number) {
		let writeBufferPacks = writeBufferPacks0[lengthIndex];
		if (writeBufferPacks == null)
			writeBufferPacks = writeBufferPacks0[lengthIndex] = [];
		if (writeBufferPacks.hasFree) {
			for (let i = writeBufferPacks.length - 1; i >= 0; i--) {
				const writeBufferPackRef = writeBufferPacks[i];
				const writeBufferPack = writeBufferPackRef.deref();
				if (writeBufferPack == null) {
					writeBufferPacks.splice(i, 1);
					continue;
				}
				if (writeBufferPack[1]) continue;
				writeBufferPack[1] = true;
				writeBufferPacks.splice(i, 1);
				writeBufferPacks.unshift(writeBufferPackRef);
				return writeBufferPack;
			}
		}
		writeBufferPacks.hasFree = false;
		const writeBufferPack = [Buffer.alloc(Math.pow(4, lengthIndex)), true] as any;
		writeBufferPack[0].__pack__ = writeBufferPack;
		writeBufferPack[0].__free__ = () => {
			writeBufferPack[1] = false;
			writeBufferPacks.hasFree = true;
		};
		writeBufferPacks.unshift(new WeakRef(writeBufferPack));
		return writeBufferPack;
	}
	async function writeBytes(buffer: Buffer, offset: number, length: number) {
		if (offset + length > buffer.length)
			throw new Error("Write offset+length must not exceed buffer length");
		if (closed)
			throw new Error("Socket closed");
		const startIndex = Math.floor(Math.log(length) / Math.log(4));
		const promises = [];
		for (let i = startIndex; i >= 0; i--) {
			const writeBufferLength = Math.pow(4, i);
			while (Math.floor(length / writeBufferLength) >= 1) {
				if (closed)
					throw new Error("Socket closed");
				const writeBufferPack = getWriteBufferPack(i);
				const writeBuffer = writeBufferPack[0];
				let onFinish; promises.push(new Promise(res => onFinish = res));
				buffer.copy(writeBuffer, 0, offset, offset + writeBufferLength);
				socket.write(writeBuffer, null, () => { onFinish(); writeBuffer.__free__(); });
				offset += writeBufferLength;
				length -= writeBufferLength;
			}
			if (length <= 0)
				return;
		}
		await Promise.all(promises);
	}
	const onClose = () => {
		closed = true;
		socket.off("error", onClose);
		socket.off("close", onClose);
	};
	socket.on("error", onClose);
	socket.on("close", onClose);
	return writeBytes;
}
