import * as net from "net";
import ip from "ip";
import getConfig from "next/config";
import { newTempDir } from "@/utils/tempDir";
import seedrandom from "seedrandom";
import {
	CLamatModuleBrokerServerPacketDefintionModifier,
	CLamatModuleNodeBrokerPacketDefintionModifier,
	CLamatModuleNodeServerPacketDefintionModifier,
	CLamatModuleServerClientPacketDefintionModifier
} from "@/prisma/types";

const { serverRuntimeConfig } = getConfig();
export const serverIpAddress = serverRuntimeConfig.CLAMAT_SERVER_IP_ADDRESS;
export const serverIpSubnet = serverRuntimeConfig.CLAMAT_SERVER_IP_SUBNET;
export const serverId = serverRuntimeConfig.CLAMAT_SERVER_ID;
export const serverCidr = ip.cidrSubnet(`${serverIpAddress}/${serverIpSubnet}`);
export const tempDir = newTempDir("clamat");

export type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;
export type InjectStructPropertyCommand<T extends ReturnType<typeof newStructType>, C> =
	T extends ReturnType<typeof newStructType<infer P extends StructProperties>> ?
	ReturnType<typeof newStructType<P & { command: C }>> : never;
export type ModuleInfo = { name: string, version: string };
export type NodeBrokerPacketDefintion = CLamatModuleNodeBrokerPacketDefintionModifier["value"];
export type NodeServerPacketDefintion = CLamatModuleNodeServerPacketDefintionModifier["value"];
export type BrokerServerPacketDefintion = CLamatModuleBrokerServerPacketDefintionModifier["value"];
export type ServerClientPacketDefintion = CLamatModuleServerClientPacketDefintionModifier["value"];

export const CODE_OK = 0;
export const CODE_ERROR = 1;

export const ERR_PACKET_INCOMPLETE = Symbol.for("PACKET_INCOMPLETE");
export const ERR_PACKET_UNKNOWN_COMMAND = Symbol.for("PACKET_UNKNOWN_COMMAND");
export const ERR_PACKET_INVALID_CRC = Symbol.for("ERR_PACKET_INVALID_CRC");
export const ERR_OFFLINE = Symbol.for("ERR_OFFLINE");

// Broker, Server
export const BROADCAST_COMMAND_ADVERTISE = 0;
export const BROADCAST_COMMAND_DISCOVER = 1;

// Broker, Server
export const BROKER_COMMAND_IDENTIFY = 0;
export const BROKER_COMMAND_IDENTIFY_ACK = 1;
export const BROKER_COMMAND_PING = 2;
export const BROKER_COMMAND_PONG = 3;
export const BROKER_COMMAND_MODULE_SYNC = 4;
export const BROKER_COMMAND_MODULE_SYNC_ACK = 5;
export const BROKER_COMMAND_MODULE_INSTALL = 6;
export const BROKER_COMMAND_MODULE_INSTALL_ACK = 7;
export const BROKER_COMMAND_MODULE_UNINSTALL = 8;
export const BROKER_COMMAND_MODULE_UNINSTALL_ACK = 9;
export const BROKER_COMMAND_MODULE_OPTION_GET = 10;
export const BROKER_COMMAND_MODULE_OPTION_GET_ACK = 11;
export const BROKER_COMMAND_MODULE_OPTION_SET = 12;
export const BROKER_COMMAND_MODULE_OPTION_SET_ACK = 13;
export const BROKER_COMMAND_MODULE_OPTION_DELETE = 14;
export const BROKER_COMMAND_MODULE_OPTION_DELETE_ACK = 15;
export const BROKER_COMMAND_MODULE_OPTION_LIST = 16;
export const BROKER_COMMAND_MODULE_OPTION_LIST_ACK = 17;
export const BROKER_COMMAND_NODE_JOIN = 18;
export const BROKER_COMMAND_NODE_LEAVE = 19;
export const BROKER_COMMAND_NODE_RELAY = 20;

// Node, Server (over broker)
export const NODE_COMMAND_PING = 0;
export const NODE_COMMAND_PONG = 1;
export const NODE_COMMAND_MODULE_SYNC = 2;
export const NODE_COMMAND_MODULE_SYNC_ACK = 3;
export const NODE_COMMAND_MODULE_FLASH = 4;
export const NODE_COMMAND_MODULE_FLASH_ACK = 5;
export const NODE_COMMAND_MODULE_OPTION_GET = 6;
export const NODE_COMMAND_MODULE_OPTION_GET_ACK = 7;
export const NODE_COMMAND_MODULE_OPTION_SET = 8;
export const NODE_COMMAND_MODULE_OPTION_SET_ACK = 9;
export const NODE_COMMAND_MODULE_OPTION_DELETE = 10;
export const NODE_COMMAND_MODULE_OPTION_DELETE_ACK = 11;
export const NODE_COMMAND_MODULE_OPTION_LIST = 12;
export const NODE_COMMAND_MODULE_OPTION_LIST_ACK = 13;

export function crc16(current: number, previous: number = 0) {
	let crc = previous & 0xFFFF;
	crc = (crc ^ current << 8) & 0xFFFF;
	for(let i = 0; i < 8; i++) {
		if((crc & (1 << 15)) != 0) {
			crc = (crc << 1) & 0xFFFF;
			crc = (crc ^ 0x8001) & 0xFFFF;
		} else
			crc = (crc << 1) & 0xFFFF;
	}
	return crc;
}
export function adler32(str: string, seed?: string) {
	const L = str.length;
	let a = 1;
	let b = 0;
	if(typeof seed === "number") {
		a = seed & 0xFFFF;
		b = seed >>> 16;
	}
	for(let i = 0; i < L;) {
		let M = Math.min(L - i, 2918);
		while(M > 0) {
			let c = str.charCodeAt(i++);
			let d;
			if(c < 0x80) a += c; else if(c < 0x800) {
				a += 192 | ((c >> 6) & 31); b += a; --M;
				a += 128 | (c & 63);
			} else if(c >= 0xD800 && c < 0xE000) {
				c = (c & 1023) + 64;
				d = str.charCodeAt(i++) & 1023;
				a += 240 | ((c >> 8) & 7); b += a; --M;
				a += 128 | ((c >> 2) & 63); b += a; --M;
				a += 128 | ((d >> 6) & 15) | ((c & 3) << 4); b += a; --M;
				a += 128 | (d & 63);
			} else {
				a += 224 | ((c >> 12) & 15); b += a; --M;
				a += 128 | ((c >> 6) & 63); b += a; --M;
				a += 128 | (c & 63);
			}
			b += a; --M;
		}
		a = (15 * (a >>> 16) + (a & 65535));
		b = (15 * (b >>> 16) + (b & 65535));
	}
	return Math.abs(((b % 65521) << 16) | (a % 65521));
}
export function uuidv4(rand: () => number = () => Math.random()) {
	return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c => {
		const i = parseInt(c, 10);
		return (i ^ Math.floor(rand() * 256) & 15 >> i / 4).toString(16);
	});
}
export function properUuidv4(uuid: string) {
	const [matcher] = [...uuid.matchAll(/^([0-9a-fA-F]{8})-?([0-9a-fA-F]{4})-?([0-9a-fA-F]{4})-?([0-9a-fA-F]{4})-?([0-9a-fA-F]{12})$/g)];
	return `${matcher[1]}-${matcher[2]}-${matcher[3]}-${matcher[4]}-${matcher[5]}`;
}
export function u8touuidv4(id: number) {
	if(id < 0 || id >= 256) throw new Error("Id out of range");
	const result = uuidv4(seedrandom(`u8-${id}`));
	return result.substring(0, result.length - 1) + id.toString(16);
}
export function uuidv4tou8(id: string) {
	id = properUuidv4(id);
	const result = parseInt(id.substring(id.length - 1), 16);
	if(u8touuidv4(result) != id) throw new Error("Invalid u8touuidv4");
	return result;
}
export function u16touuidv4(id: number) {
	if(id < 0 || id >= 65536) throw new Error("Id out of range");
	const result = uuidv4(seedrandom(`u16-${id}`));
	return result.substring(0, result.length - 2) + id.toString(16);
}
export function uuidv4tou16(id: string) {
	id = properUuidv4(id);
	const result = parseInt(id.substring(id.length - 2), 16);
	if(u16touuidv4(result) != id) throw new Error("Invalid u16touuidv4");
	return result;
}
export function pascalToSnake(string: string) {
	return string.split(/(?=[A-Z])/).join("_").toLowerCase();
}
export function pascalToScreamingSnake(string: string) {
	return string.split(/(?=[A-Z])/).join("_").toUpperCase();
}
export function snakeToPascal(string: string) {
	return string.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("");
}

export function newStreamReader(reader: (n: number) => Buffer) {
	const catchError = <A extends Array<any>, R>(cb: (...args: A) => R) => {
		return (...args: A): R => {
			try {
				return cb(...args);
			} catch(e) {
				if(e.code == "ERR_OUT_OF_RANGE")
					throw ERR_PACKET_INCOMPLETE;
				throw e;
			}
		};
	};
	let crcValue = 0;
	const readWithCrc = (n: number) => {
		const buffer = reader(n);
		for(const v of buffer)
			crcValue = crc16(v, crcValue);
		return buffer;
	};
	const resetCrc = () => { crcValue = 0; };
	const readUByte = catchError(() => readWithCrc(1).readUInt8(0));
	const readUShort = catchError(() => readWithCrc(2).readUInt16LE(0));
	const readUInt = catchError(() => readWithCrc(4).readUInt32LE(0));
	const readULong = catchError(() => readWithCrc(8).readBigUInt64LE(0));
	const readByte = catchError(() => readWithCrc(1).readInt8(0));
	const readShort = catchError(() => readWithCrc(2).readInt16LE(0));
	const readInt = catchError(() => readWithCrc(4).readInt32LE(0));
	const readLong = catchError(() => readWithCrc(8).readBigInt64LE(0));
	const readFloat = catchError(() => readWithCrc(4).readFloatLE(0));
	const readDouble = catchError(() => readWithCrc(8).readDoubleLE(0));
	const readBuffer = catchError(() => Buffer.from(readWithCrc(readUShort()))); // copy warn
	const readString = catchError(() => readWithCrc(readUShort()).toString("ascii"));
	const readJson = catchError(() => JSON.parse(readString()));
	const readCRC = catchError(() => {
		// Don't shorten, comparison happens after expression evaluation
		const expectedCrc = crcValue;
		const receivedCrc = readUShort();
		resetCrc();
		return expectedCrc == receivedCrc;
	});
	return {
		resetCrc,
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
		readJson,
		readCRC
	};
}
export function newStreamWriter(writer: (buffer: Buffer) => void) {
	const catchError = <A extends Array<any>, R>(cb: (...args: A) => R) => {
		return (...args: A): R => {
			try {
				return cb(...args);
			} catch(e) {
				if(e.code == "ERR_OUT_OF_RANGE")
					throw ERR_PACKET_INCOMPLETE;
				throw e;
			}
		};
	};
	let crcValue = 0;
	const writeWithCrc = (buffer: Buffer) => {
		for(const v of buffer)
			crcValue = crc16(v, crcValue);
		writer(buffer);
	};
	const resetCrc = () => { crcValue = 0; };
	const getTempBuffer = newTempBuffer();
	const writeUByte = catchError((value: number) => {
		const tempBuffer = getTempBuffer(1);
		tempBuffer.writeUInt8(value, 0);
		writeWithCrc(tempBuffer);
	});
	const writeUShort = catchError((value: number) => {
		const tempBuffer = getTempBuffer(2);
		tempBuffer.writeUInt16LE(value, 0);
		writeWithCrc(tempBuffer);
	});
	const writeUInt = catchError((value: number) => {
		const tempBuffer = getTempBuffer(4);
		tempBuffer.writeUInt32LE(value, 0);
		writeWithCrc(tempBuffer);
	});
	const writeULong = catchError((value: bigint) => {
		const tempBuffer = getTempBuffer(8);
		tempBuffer.writeBigUInt64LE(value, 0);
		writeWithCrc(tempBuffer);
	});
	const writeByte = catchError((value: number) => {
		const tempBuffer = getTempBuffer(1);
		tempBuffer.writeInt8(value, 0);
		writeWithCrc(tempBuffer);
	});
	const writeShort = catchError((value: number) => {
		const tempBuffer = getTempBuffer(2);
		tempBuffer.writeInt16LE(value, 0);
		writeWithCrc(tempBuffer);
	});
	const writeInt = catchError((value: number) => {
		const tempBuffer = getTempBuffer(4);
		tempBuffer.writeInt32LE(value, 0);
		writeWithCrc(tempBuffer);
	});
	const writeLong = catchError((value: bigint) => {
		const tempBuffer = getTempBuffer(8);
		tempBuffer.writeBigInt64LE(value, 0);
		writeWithCrc(tempBuffer);
	});
	const writeFloat = catchError((value: number) => {
		const tempBuffer = getTempBuffer(4);
		tempBuffer.writeFloatLE(value, 0);
		writeWithCrc(tempBuffer);
	});
	const writeDouble = catchError((value: number) => {
		const tempBuffer = getTempBuffer(8);
		tempBuffer.writeDoubleLE(value, 0);
		writeWithCrc(tempBuffer);
	});
	const writeBuffer = catchError((value: Buffer) => {
		writeUShort(value.length);
		writeWithCrc(value);
	});
	const writeString = catchError((value: string) => {
		const byteLength = Buffer.byteLength(value, "ascii");
		const tempBuffer = getTempBuffer(byteLength);
		tempBuffer.write(value, 0, "ascii");
		writeUShort(byteLength);
		writeWithCrc(tempBuffer);
	});
	const writeJson = catchError((value: any) => writeString(JSON.stringify(value)));
	const writeCRC = catchError(() => {
		writeUShort(crcValue);
		resetCrc();
	});
	return {
		resetCrc,
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
		writeJson,
		writeCRC
	};
}
export type StreamReader = ReturnType<typeof newStreamReader>;
export type StreamWriter = ReturnType<typeof newStreamWriter>;

export function newBufferReader(buffer: Buffer, offset: number = 0) {
	let crcOffset = offset;
	const catchError = <A extends Array<any>, R>(cb: (...args: A) => R) => {
		return (...args: A): R => {
			try {
				return cb(...args);
			} catch(e) {
				if(e.code == "ERR_OUT_OF_RANGE")
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
	const readJson = catchError(() => {
		return JSON.parse(readString());
	});
	const readCRC = catchError(() => {
		const expectedCrc = buffer.subarray(crcOffset, offset).reduce((c, p) => crc16(c, p), 0);
		const receivedCrc = readUShort();
		crcOffset = offset;
		return expectedCrc == receivedCrc;
	});
	const _offset = (v?: number | null) => {
		if(v == null) return offset;
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
		readJson,
		readCRC,
		offset: _offset
	};
}
export function newBufferWriter(buffer: Buffer, offset: number = 0) {
	let crcOffset = offset;
	const catchError = <A extends Array<any>, R>(cb: (...args: A) => R) => {
		return (...args: A): R => {
			try {
				return cb(...args);
			} catch(e) {
				if(e.code == "ERR_OUT_OF_RANGE")
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
		const byteLength = Buffer.byteLength(value, "ascii");
		writeUShort(byteLength);
		buffer.write(value, offset, "ascii");
		offset += byteLength;
	});
	const writeJson = catchError((value: any) => {
		writeString(JSON.stringify(value));
	});
	const writeCRC = catchError(() => {
		writeUShort(buffer.subarray(crcOffset, offset).reduce((c, p) => crc16(c, p), 0));
		crcOffset = offset;
	});
	const _offset = (v?: number | null) => {
		if(v == null) return offset;
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
		writeJson,
		writeCRC,
		offset: _offset
	};
}
export type BufferReader = ReturnType<typeof newBufferReader>;
export type BufferWriter = ReturnType<typeof newBufferWriter>;

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
	"string": string,
	"json": any
};
export type StructTypes = keyof StructPropertyTypes | { properties: StructProperties } | (StructTypes | "[" | "]" | "[]" | number)[];
export type StructProperties = Record<string, StructTypes>;
export type StructType<T> =
	T extends keyof StructPropertyTypes ? StructPropertyTypes[T] :
	T extends ReturnType<typeof newStructType<infer P extends StructProperties>> ? Struct<P> :
	T extends Array<any> ? (
		T extends [infer R, "[]"] ? StructType<R>[] :
		T extends [infer R, "[", infer C extends number, "]"] ? StructType<R>[] & { length: C } :
		T extends ["[", ...infer R, "]"] ? { [K in keyof R]: StructType<R[K]> } :
		T extends [infer R] ? StructType<R> :
		never) :
	T;
export type Struct<P extends StructProperties> = { [K in keyof P]: StructType<P[K]> };
export function newStructType<P extends StructProperties>(properties: P) {
	const propertyEntries = Object.entries(properties);
	const readImpl = (type: any, reader: StreamReader | BufferReader) => {
		if(type instanceof Array) {
			if(type[1] == "[]") {
				const result = [];
				const length = type.length == 3 ? type[2] : reader.readUShort();
				for(let i = 0; i < length; i++)
					result.push(readImpl(type[0], reader));
				return result;
			}
			if(type[0] == "[" && type.at(-1) == "]") {
				const result = [];
				for(let i = 1; i < type.length - 1; i++)
					result.push(readImpl(type[i], reader));
				return result;
			}
			if(type.length == 1)
				return readImpl(type[0], reader);
		}
		if(typeof type == "object") {
			if(type.properties != null && type.read != null)
				return type.read(reader);
		}
		if(typeof type == "string") {
			if(type == "ubyte") return reader.readUByte();
			if(type == "ushort") return reader.readUShort();
			if(type == "uint") return reader.readUInt();
			if(type == "ulong") return reader.readULong();
			if(type == "byte") return reader.readByte();
			if(type == "short") return reader.readShort();
			if(type == "int") return reader.readInt();
			if(type == "long") return reader.readLong();
			if(type == "float") return reader.readFloat();
			if(type == "double") return reader.readDouble();
			if(type == "buffer") return reader.readBuffer();
			if(type == "string") return reader.readString();
			if(type == "json") return reader.readJson();
		}
		throw new Error(`Unknown type: ${type}`);
	};
	const read = (reader: StreamReader | BufferReader) => {
		const struct = {};
		for(const [key, type] of propertyEntries)
			struct[key] = readImpl(type, reader);
		return struct as Struct<P>;
	};
	const writeImpl = (type: any, value: any, writer: StreamWriter | BufferWriter) => {
		if(type instanceof Array) {
			if(type[1] == "[]") {
				if(type.length == 3) {
					for(let i = 0; i < type[2]; i++)
						writeImpl(type[0], value[i], writer);
				} else {
					writer.writeUShort(value.length);
					for(let i = 0; i < value.length; i++)
						writeImpl(type[0], value[i], writer);
				}
				return;
			}
			if(type[0] == "[" && type.at(-1) == "]") {
				for(let i = 1; i < type.length - 1; i++)
					writeImpl(type[i], value[i - 1], writer);
				return;
			}
			if(type.length == 1)
				return writeImpl(type[0], value, writer);
		}
		if(typeof type == "object") {
			if(type.properties != null && type.read != null)
				return type.write(value, writer);
		}
		if(typeof type == "string") {
			if(type == "ubyte") return writer.writeUByte(value);
			if(type == "ushort") return writer.writeUShort(value);
			if(type == "uint") return writer.writeUInt(value);
			if(type == "ulong") return writer.writeULong(value);
			if(type == "byte") return writer.writeByte(value);
			if(type == "short") return writer.writeShort(value);
			if(type == "int") return writer.writeInt(value);
			if(type == "long") return writer.writeLong(value);
			if(type == "float") return writer.writeFloat(value);
			if(type == "double") return writer.writeDouble(value);
			if(type == "buffer") return writer.writeBuffer(value);
			if(type == "string") return writer.writeString(value);
			if(type == "json") return writer.writeJson(value);
		}
		throw new Error(`Unknown type: ${type}`);
	};
	const write = (struct: Struct<P>, writer: StreamWriter | BufferWriter) => {
		for(const [key, type] of propertyEntries)
			writeImpl(type, struct[key], writer);
	};
	const lengthImpl = (type: any, value: any) => {
		if(type instanceof Array) {
			if(type[1] == "[]") {
				if(type.length == 3) {
					let result = 0;
					for(let i = 0; i < type[2]; i++)
						result += lengthImpl(type[0], value[i]);
					return result;
				} else {
					let result = 2;
					for(let i = 0; i < value.length; i++)
						result += lengthImpl(type[0], value[i]);
					return result;
				}
			}
			if(type[0] == "[" && type.at(-1) == "]") {
				let result = 0;
				for(let i = 1; i < type.length - 1; i++)
					result += lengthImpl(type[i], value[i - 1]);
				return result;
			}
			if(type.length == 1)
				return lengthImpl(type[0], value);
		}
		if(typeof type == "object") {
			if(type.properties != null && type.read != null)
				return type.length(value);
		}
		if(typeof type == "string") {
			if(type == "ubyte") return 1;
			if(type == "ushort") return 2;
			if(type == "uint") return 4;
			if(type == "ulong") return 8;
			if(type == "byte") return 1;
			if(type == "short") return 2;
			if(type == "int") return 4;
			if(type == "long") return 8;
			if(type == "float") return 4;
			if(type == "double") return 8;
			if(type == "buffer") return 2 + value.length;
			if(type == "string") return 2 + Buffer.byteLength(value, "ascii");
			if(type == "json") return 2 + Buffer.byteLength(JSON.stringify(value), "ascii");
		}
		throw new Error(`Unknown type: ${type}`);
	};
	const length = (struct: Struct<P>) => {
		let result = 0;
		for(const [key, type] of propertyEntries)
			result += lengthImpl(type, struct[key]);
		return result;
	};
	return {
		properties,
		read,
		write,
		length
	};
}
export function newTempBuffer() {
	let tempBufferRef = new WeakRef(Buffer.alloc(1024));
	return function getTempBuffer(size: number) {
		let tempBuffer = tempBufferRef.deref();
		if(tempBuffer == null || tempBuffer.length < size) {
			tempBuffer = Buffer.alloc(size);
			tempBufferRef = new WeakRef(tempBuffer);
		}
		return tempBuffer.subarray(0, size);
	};
}
export function socketReader(socket: net.Socket) {
	const getReadTempBuffer = newTempBuffer();
	const readBuffers = [] as Buffer[];
	let readBufferOffset = 0;
	let closed = false;
	let readUnlock = null;
	async function readBytes(length: number, outBuffer = getReadTempBuffer(length), outBufferOffset = 0) {
		if(outBufferOffset + length > outBuffer.length)
			throw new Error("Read offset+length must not exceed outBuffer length");
		if(closed)
			throw new Error("Socket closed");
		let remainingLength = length;
		while(remainingLength > 0) {
			let buffer: Buffer;
			while((buffer = readBuffers[0]) == null && !closed)
				await new Promise(resolve => readUnlock = resolve);
			if(closed)
				throw new Error("Socket closed");
			const availableLength = buffer.length - readBufferOffset;
			const readLength = Math.min(remainingLength, availableLength);
			buffer.copy(outBuffer, outBufferOffset + length - remainingLength, readBufferOffset, readBufferOffset + readLength);
			remainingLength -= readLength;
			readBufferOffset += readLength;
			if(readBufferOffset >= buffer.length) {
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
		if(readUnlock != null)
			readUnlock();
		socket.off("data", onData);
		socket.off("error", onClose);
		socket.off("close", onClose);
	};
	const onData = (buffer: Buffer) => {
		readBuffers.push(buffer);
		if(readUnlock != null)
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
		if(writeBufferPacks == null)
			writeBufferPacks = writeBufferPacks0[lengthIndex] = [];
		if(writeBufferPacks.hasFree) {
			for(let i = writeBufferPacks.length - 1; i >= 0; i--) {
				const writeBufferPackRef = writeBufferPacks[i];
				const writeBufferPack = writeBufferPackRef.deref();
				if(writeBufferPack == null) {
					writeBufferPacks.splice(i, 1);
					continue;
				}
				if(writeBufferPack[1]) continue;
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
		if(offset + length > buffer.length)
			throw new Error("Write offset+length must not exceed buffer length");
		if(closed)
			throw new Error("Socket closed");
		const startIndex = Math.floor(Math.log(length) / Math.log(4));
		const promises = [];
		for(let i = startIndex; i >= 0; i--) {
			const writeBufferLength = Math.pow(4, i);
			while(Math.floor(length / writeBufferLength) >= 1) {
				if(closed)
					throw new Error("Socket closed");
				const writeBufferPack = getWriteBufferPack(i);
				const writeBuffer = writeBufferPack[0];
				let onFinish: () => void; promises.push(new Promise(res => onFinish = () => res(null)));
				buffer.copy(writeBuffer, 0, offset, offset + writeBufferLength);
				socket.write(writeBuffer, null, () => { onFinish(); writeBuffer.__free__(); });
				offset += writeBufferLength;
				length -= writeBufferLength;
			}
			if(length <= 0)
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
