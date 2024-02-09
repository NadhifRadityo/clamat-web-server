import { NextResponse } from "next/server";
import getConfig from "next/config";
import { headers } from "next/dist/client/components/headers";
import { ReadonlyHeaders } from "next/dist/server/web/spec-extension/adapters/headers";
import * as nextConstants from "next/dist/shared/lib/constants";
import zlib from "zlib";
import { isArrayBuffer, isUint8Array } from "util/types";

const { serverRuntimeConfig } = getConfig();
const { BUILD_PHASE } = serverRuntimeConfig;

const cacheControlNoTransformRegExp = /(?:^|,)\s*?no-transform\s*?(?:,|$)/i;
const textMimeType = /(?:^|,)\s*?text\/[^;]?(?:;\s*charset=([^;]?))?\s*?(?:,|$)/i;
function isAlreadyHandled(responseHeaders: Headers) {
	if((responseHeaders.get("Content-Encoding") || "identity") != "identity")
		return true;
	return false;
}

const simpleEncodingRegExp = /^\s*([^\s;]+)\s*(?:;(.*))?$/;
function parseAcceptEncodings(acceptEncodings: string) {
	const encodings = acceptEncodings
		.split(",").map(a => a.trim())
		.map((a, i) => parseEncodingQuery(a, i))
		.filter(e => e != null);
	if(encodings.some(e => getEncodingMatch("identity", e.encoding) >= 0)) {
		const minQuality = encodings.reduce((q, v) => Math.min(q, v.quality), 1);
		encodings.push({
			encoding: "identity",
			quality: minQuality,
			index: encodings.length
		});
	}
	return encodings;
}
function parseEncodingQuery(encodingQuery: string, index: number) {
	const match = simpleEncodingRegExp.exec(encodingQuery);
	if(!match) return null;
	const encoding = match[1];
	const params = match[2]?.split(";") || [];
	let quality = 1;
	for(let i = 0; i < params.length; i++) {
		const [name, value] = params[i].trim().split("=").map(a => a.trim());
		if(name != "q") continue;
		quality = parseFloat(value);
		break;
	}
	return {
		encoding: encoding,
		quality: quality,
		index: index
	};
}
function getEncodingMatch(providedEncoding: string, acceptEncoding: string) {
	providedEncoding = providedEncoding.toLowerCase();
	acceptEncoding = acceptEncoding.toLowerCase();
	if(providedEncoding.toLowerCase() == acceptEncoding.toLowerCase())
		return 1;
	if(acceptEncoding == "*")
		return 0;
	return -Infinity;
}
function getEncodingBestMatch(providedEncoding: string, acceptEncodings: { encoding: string, quality: number, index: number }[]) {
	let currentIndex = -1;
	let currentMatch = -1;
	for(let i = 0; i < acceptEncodings.length; i++) {
		const acceptEncoding = acceptEncodings[i];
		const currentEncoding = acceptEncodings[currentIndex];
		const match = getEncodingMatch(providedEncoding, acceptEncoding.encoding);
		if(currentMatch > match) continue;
		if(currentEncoding != null) {
			if(currentEncoding.quality > acceptEncoding.quality) continue;
			if(currentEncoding.index > acceptEncoding.index) continue;
		}
		currentIndex = i;
		currentMatch = match;
	}
	return [currentIndex, currentMatch];
}
function preferredEncodings(acceptEncodings: string, providedEncodings: string[]) {
	const accepts = parseAcceptEncodings(acceptEncodings);
	const priorities = providedEncodings
		.map(e => getEncodingBestMatch(e, accepts))
		.map(([i, m]) => [accepts[i], m] as const);
	return priorities
		.filter(([e, m]) => e != null && m != -1)
		.sort(([ea, ma], [eb, mb]) => (eb.quality - ea.quality) || (mb - ma) || (ea.index - eb.index) || 0)
		.map(s => providedEncodings[priorities.indexOf(s)]);
}

function lzwEncode(string: string) {
	const dictionary = new Map<string, string>();
	let result = "";
	let phrase = string.charAt(0);
	let id = 256;
	for(let i = 1; i < string.length; i++) {
		const currentChar = string.charAt(i);
		if(dictionary.has(phrase + currentChar)) {
			phrase += currentChar;
			continue;
		}
		result += phrase.length > 1 ? dictionary.get(phrase) : phrase;
		dictionary.set(phrase + currentChar, String.fromCharCode(id++));
		phrase = currentChar;
	}
	result += phrase.length > 1 ? dictionary.get(phrase) : phrase;
	return result;
}

const FIELD_NAME_REGEXP = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
function addVary(responseHeaders: Headers, value: string) {
	value = value.trim();
	if(!FIELD_NAME_REGEXP.test(value))
		throw new TypeError("field argument contains an invalid header name");
	const oldVary = responseHeaders.get("Vary")?.trim();
	if(oldVary == "*") return;
	if(value == "*" || oldVary == null || oldVary.length == 0) {
		responseHeaders.set("Vary", value);
		return;
	}
	const varies = oldVary.toLowerCase().split(",").map(m => m.trim());
	if(varies.includes(value.toLowerCase())) return;
	responseHeaders.set("Vary", `${value}, ${value}`);
}

function newHeaders(originalHeader: ReadonlyHeaders | Record<string, string | undefined>, modifiyHeaders?: Record<string, string | undefined>) {
	const result = new Headers();
	if(!(originalHeader instanceof Headers)) {
		modifiyHeaders = originalHeader;
		originalHeader = null;
	}
	if(originalHeader != null) {
		for(const [name, value] of (originalHeader as ReadonlyHeaders).entries())
			result.set(name, value);
	}
	if(modifiyHeaders != null) {
		for(const [name, value] of Object.entries(modifiyHeaders)) {
			if(typeof value == "undefined") {
				result.delete(name);
				continue;
			}
			result.set(name, value);
		}
	}
	return result;
}

class ZlibTransformStream extends TransformStream<Uint8Array> {
	constructor(stream: zlib.BrotliCompress | zlib.Gzip | zlib.Deflate, flushDelay: number, flushBytes: number) {
		let dataCallback: (chunk: Uint8Array) => void;
		let errorCallback: (error: any) => void;
		let flushTimeoutHandle: any;
		let lastFlushBytesWritten = 0;
		super({
			start: controller => {
				stream.on("data", dataCallback = chunk => {
					// Currently, cancelled streams are not handled in node.js
					// https://github.com/nodejs/node/issues/49971
					try { controller.enqueue(chunk); } catch(e) {}
				});
				stream.on("error", errorCallback = e => {
					stream.close();
					stream.off("data", dataCallback);
					stream.off("error", errorCallback);
					controller.error(e);
					controller.terminate();
				});
			},
			flush: controller => {
				return new Promise(resolve => {
					if(flushTimeoutHandle != null)
						clearTimeout(flushTimeoutHandle);
					// Set to zero instead of null to disable future flushing
					flushTimeoutHandle = 0;
					lastFlushBytesWritten = stream.bytesWritten;
					stream.flush(() => {
						stream.close();
						stream.off("data", dataCallback);
						stream.off("error", errorCallback);
						controller.terminate();
						resolve();
					});
				});
			},
			transform: chunk => {
				stream.write(chunk);
				const bytesWritten = stream.bytesWritten;
				if(flushDelay <= 0 || bytesWritten - lastFlushBytesWritten >= flushBytes) {
					lastFlushBytesWritten = bytesWritten;
					stream.flush();
					if(flushTimeoutHandle != null)
						clearTimeout(flushTimeoutHandle);
					flushTimeoutHandle = null;
					return;
				}
				// Don't reschedule flush timeout, since we are accumulating chunks
				if(flushTimeoutHandle != null || !isFinite(flushDelay))
					return;
				const timeoutHandle = flushTimeoutHandle = setTimeout(() => {
					lastFlushBytesWritten = stream.bytesWritten;
					stream.flush(() => {
						if(flushTimeoutHandle != timeoutHandle) return;
						flushTimeoutHandle = null;
					});
				}, flushDelay);
			}
		});
	}
}
class SplitTransformStream extends TransformStream<Uint8Array> {
	constructor(chunkSize: number) {
		let lastChunk: Uint8Array;
		let lastChunkOffset: number;
		let cancelled: boolean;
		let cancel: () => void;
		let cancelPromise: Promise<void>;
		super({
			start: controller => {
				lastChunk = null;
				lastChunkOffset = null;
				cancelled = false;
				cancelPromise = new Promise(res => cancel = () => { cancelled = true; res(); });
			},
			flush: controller => {
				if(lastChunk == null) return;
				cancel();
				if(lastChunkOffset == 0)
					controller.enqueue(lastChunk);
				else
					controller.enqueue(lastChunk.subarray(0, lastChunkOffset));
			},
			transform: async (chunk, controller) => {
				let i = 0;
				if(lastChunk != null) {
					if(lastChunkOffset == 0) {
						const readOnlySubarray = lastChunk;
						const splitChunk = chunk.subarray(0, chunkSize - readOnlySubarray.length);
						lastChunk = new Uint8Array(chunkSize);
						lastChunk.set(readOnlySubarray, lastChunkOffset);
						lastChunk.set(splitChunk, lastChunkOffset + readOnlySubarray.length);
						lastChunkOffset += readOnlySubarray.length + splitChunk.length;
					} else {
						const splitChunk = chunk.subarray(0, chunkSize - lastChunkOffset);
						lastChunk.set(splitChunk, lastChunkOffset);
						lastChunkOffset += splitChunk.length;
						i += splitChunk.length;
					}
					if(lastChunkOffset < chunkSize)
						return;
					controller.enqueue(lastChunk);
					lastChunk = null;
					lastChunkOffset = null;
					await Promise.race([new Promise(res => setTimeout(res)), cancelPromise]);
					if(cancelled) return;
				}
				while(i + chunkSize <= chunk.length) {
					const split = chunk.subarray(i, i + chunkSize);
					controller.enqueue(split);
					await Promise.race([new Promise(res => setTimeout(res)), cancelPromise]);
					if(cancelled) return;
					i += chunkSize;
				}
				if(i < chunk.length) {
					lastChunk = chunk.subarray(i);
					lastChunkOffset = 0;
				} else {
					lastChunk = null;
					lastChunkOffset = null;
				}
			}
		});
	}
}

const { state: kState } = Object.fromEntries(Object.getOwnPropertySymbols(new Response()).map(s => [s.description, s]));
function getResponseBody(response: NextResponse) {
	const body = { ...response[kState].body } as { stream: ReadableStream<Uint8Array>, source: any, length: number };
	const contentLength = parseInt(response.headers.get("Content-Length"), 10);
	if(!isNaN(contentLength) && (body.length == null || body.length > contentLength))
		body.length = contentLength;
	return body;
}

const defaultCache = createCache(20, 15 * 60 * 1000, 96 * 1024 * 1024, 32 * 1024 * 1024);
function createCache(maxEntry: number, maxAge: number, maxSize: number, bailoutSize: number) {
	interface CacheItem {
		lastUsed: number;
		buffer: Uint8Array | ReadableStream<Uint8Array>;
		size: number;
		cleanup: () => void
	}
	const caches: Record<string, Record<string, CacheItem>> = {};
	const lastUsedKeys = [];
	let currentSize = 0;
	let timeoutHandle = null;
	function deleteCache(encoding: string, cacheKey: string) {
		const encodingCaches = caches[encoding];
		if(encodingCaches == null) return;
		const item = encodingCaches[cacheKey];
		if(item == null) return;
		item.cleanup();
		const index = lastUsedKeys.findIndex(p => p[0] == encoding && p[1] == cacheKey);
		lastUsedKeys.splice(index, 1);
		currentSize -= item.size;
		if(currentSize < 0)
			currentSize = 0;
		delete encodingCaches[cacheKey];
		if(Object.keys(encodingCaches).length == 0)
			delete caches[encoding];
	}
	function pushbackCache(encoding: string, cacheKey: string) {
		const encodingCaches = caches[encoding];
		if(encodingCaches == null) return;
		const item = encodingCaches[cacheKey];
		if(item == null) return;
		item.lastUsed = Date.now();
		const index = lastUsedKeys.findIndex(p => p[0] == encoding && p[1] == cacheKey);
		lastUsedKeys.unshift(lastUsedKeys.splice(index, 1)[0]);
	}
	function clean() {
		const now = Date.now();
		for(let i = lastUsedKeys.length - 1; i >= 0; i--) {
			const [encoding, cacheKey] = lastUsedKeys[i];
			const item = caches[encoding][cacheKey];
			if(now - item.lastUsed < maxAge && lastUsedKeys.length <= maxEntry && currentSize <= maxSize) break;
			deleteCache(encoding, cacheKey);
		}
	}
	function startCleaning() {
		if(timeoutHandle != null) return;
		let handle = timeoutHandle = setTimeout(function loop() {
			try {
				clean();
			} finally {
				if(timeoutHandle == handle) {
					if(lastUsedKeys.length == 0) {
						clearTimeout(timeoutHandle);
						timeoutHandle = null;
					} else
						handle = timeoutHandle = setTimeout(loop, maxAge / 4);
				}
			}
		}, maxAge / 4);
	}
	return {
		addStatic: (encoding: string, cacheKey: string, compressedBuffer: Uint8Array, originalBuffer: Uint8Array, encodingTransform: zlib.BrotliCompress | zlib.Gzip | zlib.Deflate) => {
			if(compressedBuffer.length >= bailoutSize)
				return;
			let encodingCaches = caches[encoding];
			if(encodingCaches == null)
				encodingCaches = caches[encoding] = {};
			if(encodingCaches[cacheKey] != null)
				return;
			let cancelOptimize: (reason?: any) => void;
			const cancelOptimizePromise = new Promise((_, reject) => cancelOptimize = reject);
			const item: CacheItem = encodingCaches[cacheKey] = {
				lastUsed: Date.now(),
				buffer: compressedBuffer,
				size: compressedBuffer.length,
				cleanup: () => cancelOptimize()
			};
			lastUsedKeys.unshift([encoding, cacheKey]);
			currentSize += compressedBuffer.length;
			if(lastUsedKeys.length > maxEntry || currentSize > maxSize)
				clean();
			startCleaning();
			// Don't capture compressedBuffer, only capture its length.
			const originalCompressedLength = compressedBuffer.length;
			(async () => {
				let reader: ReadableStreamDefaultReader;
				try {
					const stream = new TransformStream<Uint8Array>();
					const writer = stream.writable.getWriter();
					await Promise.race([writer.ready, cancelOptimizePromise]);
					reader = stream.readable
						.pipeThrough(new SplitTransformStream(2048)) // Split the stream, so that in won't use the full thread.
						.pipeThrough(new ZlibTransformStream(encodingTransform, 2000, 32768))
						.getReader();
					await writer.write(originalBuffer);
					await writer.close();
					const buffers = [];
					let bufferLength = 0;
					while(true) {
						const { done, value } = await Promise.race([reader.read(), cancelOptimizePromise]) as any;
						if(value != null) {
							buffers.push(value);
							bufferLength += value.length;
							item.size += value.length;
							currentSize += value.length;
							pushbackCache(encoding, cacheKey);
						}
						if(bufferLength >= bailoutSize)
							throw new Error("Bailout");
						if(done)
							break;
					}
					currentSize -= originalCompressedLength;
					item.size -= originalCompressedLength;
					item.buffer = Buffer.concat(buffers);
					pushbackCache(encoding, cacheKey);
				} catch(_) {
					reader.cancel().catch(() => {});
					deleteCache(encoding, cacheKey);
				}
			})();
		},
		addProgressive: (encoding: string, cacheKey: string, compressedStream: ReadableStream, originalStream: ReadableStream, encodingTransform: zlib.BrotliCompress | zlib.Gzip | zlib.Deflate) => {
			let encodingCaches = caches[encoding];
			if(encodingCaches == null)
				encodingCaches = caches[encoding] = {};
			if(encodingCaches[cacheKey] != null)
				return;
			let cancelOptimize: (reason?: any) => void;
			const cancelOptimizePromise = new Promise((_, reject) => cancelOptimize = reject);
			const item: CacheItem = encodingCaches[cacheKey] = {
				lastUsed: Date.now(),
				buffer: compressedStream,
				size: 0,
				cleanup: () => cancelOptimize()
			};
			lastUsedKeys.unshift([encoding, cacheKey]);
			if(lastUsedKeys.length > maxEntry || currentSize > maxSize)
				clean();
			startCleaning();
			(async () => {
				let reader: ReadableStreamDefaultReader;
				try {
					reader = originalStream
						.pipeThrough(new SplitTransformStream(4096))
						.pipeThrough(new ZlibTransformStream(encodingTransform, 4000, 65536))
						.getReader();
					const buffers = [];
					let bufferLength = 0;
					while(true) {
						const { done, value } = await Promise.race([reader.read(), cancelOptimizePromise]) as any;
						if(value != null) {
							buffers.push(value);
							bufferLength += value.length;
							item.size += value.length;
							currentSize += value.length;
							pushbackCache(encoding, cacheKey);
						}
						if(bufferLength >= bailoutSize)
							throw new Error("Bailout");
						if(done)
							break;
					}
					(item.buffer as ReadableStream<Uint8Array>).cancel().catch(() => {});
					item.buffer = Buffer.concat(buffers);
					pushbackCache(encoding, cacheKey);
				} catch(_) {
					(item.buffer as ReadableStream<Uint8Array>).cancel().catch(() => {});
					reader.cancel().catch(() => {});
					deleteCache(encoding, cacheKey);
				}
			})();
		},
		lookup: (encoding: string, cacheKey: string) => {
			const encodingCaches = caches[encoding];
			if(encodingCaches == null) return null;
			const item = encodingCaches[cacheKey];
			if(item == null) return null;
			pushbackCache(encoding, cacheKey);
			const buffer = item.buffer;
			if(isUint8Array(buffer)) return buffer;
			const [tee1, tee2] = buffer.tee();
			item.buffer = tee1;
			return tee2;
		},
		has: (encoding: string, cacheKey: string) => {
			const encodingCaches = caches[encoding];
			if(encodingCaches == null) return false;
			const item = encodingCaches[cacheKey];
			if(item == null) return false;
			return true;
		}
	};
}

interface CompressableOptions {
	threshold?: number;
	encodings?: Array<"br" | "gzip" | "deflate" | "compress">;
	brotliOptions?: zlib.BrotliOptions;
	gzipOptions?: zlib.ZlibOptions;
	deflateOptions?: zlib.ZlibOptions;
	bestBrotliOptions?: zlib.BrotliOptions;
	bestGzipOptions?: zlib.ZlibOptions;
	bestDeflateOptions?: zlib.ZlibOptions;
	flushDelay?: number;
	flushBytes?: number;
	cache?: ReturnType<typeof createCache>;
}
const defaultCompressableOptions: CompressableOptions = {
	threshold: 1024,
	encodings: ["br", "gzip", "deflate", "compress"],
	brotliOptions: { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } },
	gzipOptions: null,
	deflateOptions: null,
	bestBrotliOptions: { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } },
	bestGzipOptions: null,
	bestDeflateOptions: null,
	flushDelay: 10,
	flushBytes: 8192,
	cache: defaultCache
};
export function sendCompressableResponse(response: NextResponse, options?: CompressableOptions) {
	const noopResponse0 = () => {
		return response;
	};
	if(isAlreadyHandled(response.headers) ||
		BUILD_PHASE == nextConstants.PHASE_EXPORT ||
		BUILD_PHASE == nextConstants.PHASE_INFO ||
		BUILD_PHASE == nextConstants.PHASE_PRODUCTION_BUILD
	)
		return noopResponse0();
	const {
		threshold, encodings,
		brotliOptions, gzipOptions, deflateOptions,
		bestBrotliOptions, bestGzipOptions, bestDeflateOptions,
		flushDelay, flushBytes, cache
	} = { ...defaultCompressableOptions, ...options };
	const requestHeaders = headers();
	const responseHeaders = response.headers;
	const responseBody = getResponseBody(response);
	let content: ReadableStream<Uint8Array> | Uint8Array;
	let length = Infinity;
	content = responseBody.stream;
	if(responseBody.length != null)
		length = responseBody.length;
	if(responseBody.source != null) {
		const source = responseBody.source;
		if(typeof source == "string")
			content = new TextEncoder().encode(source);
		if(source instanceof URLSearchParams)
			content = new TextEncoder().encode(source.toString());
		if(isArrayBuffer(source))
			content = new Uint8Array(source.slice(0));
		if(ArrayBuffer.isView(source))
			content = new Uint8Array(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength));
	}
	if(content == null)
		return noopResponse0();
	if(requestHeaders.has("Cache-Control") && cacheControlNoTransformRegExp.test(requestHeaders.get("Cache-Control")))
		return noopResponse0();
	addVary(responseHeaders, "Accept-Encoding");
	if(length < threshold)
		return noopResponse0();
	const availableEncodings = preferredEncodings(requestHeaders.get("Accept-Encoding") || "", [...encodings, "identity"]);
	let chosenEncoding = availableEncodings[0];
	let encodedContent: ReadableStream<Uint8Array> | Uint8Array;
	// Prefer brotli encoding even though the user may have it on lower priority.
	// Transfer-Encoding doesn't support brotli.
	const useTransferEncoding = response.status == 206 && !isUint8Array(content);
	if(availableEncodings.includes("br") && !useTransferEncoding)
		chosenEncoding = "br";
	if(chosenEncoding == null || chosenEncoding == "identity")
		return noopResponse0();
	const cacheKey = responseHeaders.get("ETag") || responseHeaders.get("Last-Modified");
	const cachable = chosenEncoding != "compress" && cache != null && cacheKey != null &&
			response.status >= 200 && response.status < 300 && response.status != 206;
	if(cachable) {
		// Cache doesn't care if you have different compression options, it just looks up the compression method and cache key.
		// So it is possible, to get a compressed buffer that's different from the options. If you want to separate it out,
		// use a different cache database.
		const cached = cache.lookup(chosenEncoding, cacheKey);
		if(cached != null) {
			responseBody.stream.cancel().catch(() => {});
			return new NextResponse(cached, {
				status: response.status,
				statusText: response.statusText,
				headers: newHeaders(responseHeaders, {
					"Content-Encoding": chosenEncoding,
					"Content-Length": isUint8Array(cached) ? `${cached.length}` : undefined
				})
			});
		}
	}
	if(isUint8Array(content)) {
		if(chosenEncoding == "br")
			encodedContent = zlib.brotliCompressSync(content, brotliOptions);
		else if(chosenEncoding == "gzip")
			encodedContent = zlib.gzipSync(content, gzipOptions);
		else if(chosenEncoding == "deflate")
			encodedContent = zlib.deflateSync(content, deflateOptions);
		else if(chosenEncoding == "compress") {
			if(!responseHeaders.has("Content-Type") || !textMimeType.test(responseHeaders.get("Content-Type")))
				return noopResponse0();
			encodedContent = new TextEncoder().encode(lzwEncode(new TextDecoder().decode(content)));
		} else
			return noopResponse0();
		responseBody.stream.cancel().catch(() => {});
		if(cachable && !cache.has(chosenEncoding, cacheKey)) {
			let bestEncodingTransform: zlib.BrotliCompress | zlib.Gzip | zlib.Deflate;
			if(chosenEncoding == "br")
				bestEncodingTransform = zlib.createBrotliCompress(bestBrotliOptions);
			else if(chosenEncoding == "gzip")
				bestEncodingTransform = zlib.createGzip(bestGzipOptions);
			else if(chosenEncoding == "deflate")
				bestEncodingTransform = zlib.createDeflate(bestDeflateOptions);
			cache.addStatic(chosenEncoding, cacheKey, encodedContent, content, bestEncodingTransform);
		}
	} else {
		let encodingTransform: zlib.BrotliCompress | zlib.Gzip | zlib.Deflate;
		if(chosenEncoding == "br")
			encodingTransform = zlib.createBrotliCompress(brotliOptions);
		else if(chosenEncoding == "gzip")
			encodingTransform = zlib.createGzip(gzipOptions);
		else if(chosenEncoding == "deflate")
			encodingTransform = zlib.createDeflate(deflateOptions);
		else if(chosenEncoding == "compress")
			return noopResponse0();
		else
			return noopResponse0();
		if(cachable && !cache.has(chosenEncoding, cacheKey)) {
			const [contentTee1, contentTee2] = content.tee();
			encodedContent = contentTee1.pipeThrough(new ZlibTransformStream(encodingTransform, flushDelay, flushBytes));
			const [encodedContentTee1, encodedContentTee2] = encodedContent.tee();
			// ** if encodedContentTee1 is cancelled then abort contentTee2 **
			// on encodedContentTee1 cancelled -> abort contentTee2 (manual)
			// on contentTee2 aborted -> cancel encodedContentTee2 (see addProgressive)
			// both [encodedContentTee1, encodedContentTee2] are cancelled -> cancel encodedContent (native)
			// on encodedContent cancelled -> cancel contentTee1 (native)
			// both [contentTee1, contentTee2] are cancelled -> cancel content (native)
			const interceptStream = (readable: ReadableStream<Uint8Array>, onCleanup: (success: boolean) => void = () => {}) => {
				const stream = new TransformStream<Uint8Array>();
				const writer = stream.writable.getWriter();
				const reader = readable.getReader();
				let cleaned = false;
				const cleanup = (success = false) => {
					if(cleaned) return;
					cleaned = true;
					onCleanup(success);
					reader.cancel().catch(() => {});
					if(!success)
						writer.abort().catch(() => {});
					writer.close().catch(() => {});
				};
				writer.closed.then(() => cleanup(true), () => cleanup());
				(async () => {
					try {
						if(!cleaned)
							await writer.ready;
						if(cleaned)
							return;
						while(true) {
							const { done, value } = await reader.read();
							if(cleaned)
								return;
							if(value != null)
								await writer.write(value);
							if(done)
								break;
						}
						cleanup(true);
					} catch(_) {
						cleanup();
					}
				})();
				return [stream, writer, reader, cleanup] as const;
			};
			const [interceptContentTee2, __, ___, cleanupContentTee2] = interceptStream(contentTee2);
			const [interceptEncodedContentTee1] = interceptStream(encodedContentTee1, s => cleanupContentTee2(s));
			encodedContent = interceptEncodedContentTee1.readable;
			let bestEncodingTransform: zlib.BrotliCompress | zlib.Gzip | zlib.Deflate;
			if(chosenEncoding == "br")
				bestEncodingTransform = zlib.createBrotliCompress(bestBrotliOptions);
			else if(chosenEncoding == "gzip")
				bestEncodingTransform = zlib.createGzip(bestGzipOptions);
			else if(chosenEncoding == "deflate")
				bestEncodingTransform = zlib.createDeflate(bestDeflateOptions);
			cache.addProgressive(chosenEncoding, cacheKey, encodedContentTee2, interceptContentTee2.readable, bestEncodingTransform);
		} else
			encodedContent = content.pipeThrough(new ZlibTransformStream(encodingTransform, flushDelay, flushBytes));
	}
	return new NextResponse(encodedContent, {
		status: response.status,
		statusText: response.statusText,
		headers: newHeaders(responseHeaders, {
			...(!useTransferEncoding ? {
				"Content-Encoding": chosenEncoding,
				"Content-Length": isUint8Array(encodedContent) ? `${encodedContent.length}` : undefined
			} : {
				"Transfer-Encoding": chosenEncoding
			})
		})
	});
}
