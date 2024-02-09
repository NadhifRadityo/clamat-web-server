import { NextResponse } from "next/server";
import getConfig from "next/config";
import { headers } from "next/dist/client/components/headers";
import { ReadonlyHeaders } from "next/dist/server/web/spec-extension/adapters/headers";
import * as nextConstants from "next/dist/shared/lib/constants";
import { isUint8Array, isArrayBuffer } from "util/types";
import crypto from "crypto";

const { serverRuntimeConfig } = getConfig();
const { BUILD_PHASE } = serverRuntimeConfig;

function isConditionalGET(requestHeaders: ReadonlyHeaders) {
	return requestHeaders.get("If-Match") != null ||
		requestHeaders.get("If-Unmodified-Since") != null ||
		requestHeaders.get("If-None-Match") != null ||
		requestHeaders.get("If-Modified-Since") != null;
}
function isPreconditionFailure(requestHeaders: ReadonlyHeaders, responseHeaders: ReadonlyHeaders) {
	const match = requestHeaders.get("If-Match");
	if(match != null) {
		const etag = responseHeaders.get("ETag");
		if(etag == null) return true;
		if(match != "*" && !match.split(",").map(m => m.trim()).some(m => m == etag || m == "W/" + etag || "W/" + m == etag))
			return true;
	}
	const unmodifiedSince = Date.parse(requestHeaders.get("If-Unmodified-Since"));
	if(!isNaN(unmodifiedSince)) {
		const lastModified = Date.parse(responseHeaders.get("Last-Modified"));
		if(isNaN(lastModified)) return true;
		if(lastModified > unmodifiedSince) return true;
	}
	return false;
}
function isCachable(responseCode: number) {
	return (responseCode >= 200 && responseCode < 300) || responseCode == 304;
}
function isAlreadyHandled(responseCode: number) {
	return responseCode == 412 || responseCode == 416 || responseCode == 304 || responseCode == 206;
}
const CACHE_CONTROL_NO_CACHE_REGEXP = /(?:^|,)\s*?no-cache\s*?(?:,|$)/i;
function isFresh(requestHeaders: ReadonlyHeaders, responseHeaders: ReadonlyHeaders) {
	const cacheControl = requestHeaders.get("Cache-Control");
	if(cacheControl != null && CACHE_CONTROL_NO_CACHE_REGEXP.test(cacheControl))
		return false;
	const noneMatch = requestHeaders.get("If-None-Match");
	if(noneMatch != null) {
		const etag = responseHeaders.get("ETag");
		if(etag == null) return false;
		if(noneMatch != "*" && !noneMatch.split(",").map(m => m.trim()).some(m => m == etag || m == "W/" + etag || "W/" + m == etag))
			return false;
	}
	const modifiedSince = Date.parse(requestHeaders.get("If-Modified-Since"));
	if(!isNaN(modifiedSince)) {
		const lastModified = Date.parse(responseHeaders.get("Last-Modified"));
		if(isNaN(lastModified)) return false;
		if(lastModified > modifiedSince) return false;
	}
	if(noneMatch == null && isNaN(modifiedSince))
		return false;
	return true;
}

const BYTES_RANGE_REGEXP = /^\s*bytes=/i;
function rangeParser(size: number, string: string) {
	const typeIndex = string.indexOf("=");
	if(typeIndex === -1)
		return -2;
	const rawRanges = string.slice(typeIndex + 1).split(",");
	const ranges: any = [];
	ranges.type = string.slice(0, typeIndex);
	for(let i = 0; i < rawRanges.length; i++) {
		const rawRange = rawRanges[i].split("-");
		let start = parseInt(rawRange[0], 10);
		let end = parseInt(rawRange[1], 10) + 1;
		if(isNaN(start)) {
			start = size - end + 1;
			end = size;
		} else if(isNaN(end))
			end = size;
		if(end > size)
			end = size;
		if(isNaN(start) || isNaN(end) || start > end || start < 0)
			continue;
		ranges.push({ start: start, end: end });
	}
	if(ranges.length == 0)
		return -1;
	return ranges as Array<{ start: number, end: number }> & { type: string };
}
function combineRanges(ranges: Array<{ start: number, end: number }> & { type: string } | -2 | -1, coalesceGap: number = 80) {
	if(ranges == -2) return -2;
	if(ranges == -1) return -1;
	const ordered = ranges
		.map((r, i) => ({ start: r.start, end: r.end, index: i }))
		.sort((a, b) => a.start - b.start);
	let j = 0;
	for(let i = 1; i < ordered.length; i++) {
		const current = ordered[j];
		const next = ordered[i];
		if(next.start > current.end + coalesceGap)
			ordered[++j] = next;
		else if(next.end > current.end) {
			current.end = next.end;
			current.index = Math.min(current.index, next.index);
		}
	}
	ordered.length = j + 1;
	const combined: any = ordered
		.sort((a, b) => a.index - b.index)
		.map(r => ({ start: r.start, end: r.end }));
	combined.type = ranges.type;
	return combined as Array<{ start: number, end: number }> & { type: string };
}
function isRangeFresh(requestHeaders: ReadonlyHeaders, responseHeaders: ReadonlyHeaders) {
	const ifRange = requestHeaders.get("If-Range");
	if(!ifRange) return true;
	if(ifRange.indexOf('"') != -1) {
		const etag = responseHeaders.get("ETag");
		return etag != null && ifRange.includes(etag);
	}
	const lastModified = responseHeaders.get("Last-Modified");
	return Date.parse(lastModified) <= Date.parse(ifRange);
}
function contentRange(type: string, size: number, range?: { start: number, end: number }) {
	const rangeString = range != null && (isFinite(range.start) || isFinite(range.end)) ?
		`${isFinite(range.start) ? range.start : ""}-${isFinite(range.end) ? range.end - 1 : ""}` : "*";
	const sizeString = isFinite(size) ? `${size}` : "*";
	// Note: "bytes */*" is out of spec.
	return `${type} ${rangeString}/${sizeString}`;
}

function generateEtag(buffer: Uint8Array, weak: boolean = false) {
	if(buffer.length == 0)
		return `${weak ? "W/" : ""}"0-2jmj7l5rSw0yVb/vlWAYkK/YBwk"`;
	const hash = crypto
		.createHash("sha1")
		.update(buffer)
		.digest("base64")
		.substring(0, 27);
	return `${weak ? "W/" : ""}"${buffer.length.toString(16)}-${hash}"`;
}
function generateEtagStat(modifiedTime: number, size: number, weak: boolean = true) {
	return `${weak ? "W/" : ""}"${size.toString(16)}-${modifiedTime.toString(16)}"`;
}

class SliceTransformStream extends TransformStream<Uint8Array> {
	constructor(begin: number = 0, end: number = Infinity) {
		let offset: number;
		let emitUp: boolean;
		let emitDown: boolean;
		super({
			start: () => {
				offset = 0;
				emitUp = false;
				emitDown = false;
			},
			flush: controller => {
				controller.terminate();
			},
			transform: (chunk, controller) => {
				offset += chunk.length;
				if(!emitUp && offset >= begin) {
					emitUp = true;
					const beginOffset = chunk.length - (offset - begin);
					if(offset >= end - 1) {
						emitDown = true;
						const endOffset = chunk.length - (offset - end);
						controller.enqueue(chunk.subarray(beginOffset, endOffset));
					} else
						controller.enqueue(chunk.subarray(beginOffset, chunk.length));
					return;
				}
				if(emitUp && !emitDown) {
					if(offset >= end - 1) {
						emitDown = true;
						const endOffset = chunk.length - (offset - end);
						controller.enqueue(chunk.subarray(0, endOffset));
					} else
						controller.enqueue(chunk);
					return;
				}
				controller.terminate();
			}
		});
	}
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

function generateRandomBoundary() {
	const chars = "-_1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
	return new Array(30 + Math.floor(Math.random() * 10))
		.fill(null)
		.map(() => chars[Math.floor(Math.random() * chars.length)])
		.join("");
}
function generateMultipartStream({
	length,
	responseHeaders,
	ranges,
	request,
	voidRequest
}: {
	length: number,
	responseHeaders: ReadonlyHeaders,
	ranges: Array<{ start: number, end: number }>,
	request: (begin: number, end: number) => ReadableStream<Uint8Array> | Uint8Array,
	voidRequest: () => void,
}) {
	const boundary = generateRandomBoundary();
	const contentType = responseHeaders.has("Content-Type") ? `\r\nContent-Type: ${responseHeaders.get("Content-Type")}` : {};
	const multipartHeaders = ranges.map(r => `--${boundary}${contentType}\r\nContent-Range: ${contentRange("bytes", length, r)}\r\n\r\n`);
	const headerSuffix = `--${boundary}--\r\n`;
	const multipartHeadersLength = multipartHeaders.reduce((p, h) => p + h.length, 0) + headerSuffix.length;
	const contentLength = ranges.reduce((p, r) => p + (r.end - r.start), 0);
	const firstData = request(ranges[0].start, ranges[0].end);
	if(isUint8Array(firstData)) {
		const buffers = [];
		buffers.push(Buffer.from(multipartHeaders[0], "latin1"), firstData);
		for(let i = 1; i < ranges.length; i++) {
			const data = request(ranges[i].start, ranges[i].end);
			buffers.push(Buffer.from(multipartHeaders[i], "latin1"), data);
		}
		buffers.push(Buffer.from(headerSuffix, "latin1"));
		voidRequest();
		return new NextResponse(Buffer.concat(buffers), {
			status: 206,
			headers: newHeaders(responseHeaders, {
				"Content-Type": `multipart/byteranges; boundary=${boundary}`,
				"Content-Length": isFinite(contentLength) ? `${contentLength + multipartHeadersLength}` : undefined
			})
		});
	}
	const stream = new TransformStream();
	const writer = stream.writable.getWriter();
	const parts = [firstData, ...ranges.map(r => request(r.start, r.end) as ReadableStream<Uint8Array>)];
	let cleaned = false;
	const cleanup = async (success = false) => {
		if(cleaned) return;
		cleaned = true;
		parts.map(p => p.cancel().catch(() => {}));
		if(!success)
			writer.abort().catch(() => {});
		writer.close().catch(() => {});
		voidRequest();
	};
	writer.closed.then(() => cleanup(true), () => cleanup());
	(async () => {
		try {
			if(!cleaned)
				await writer.ready;
			if(cleaned)
				return;
			for(let i = 0; i < parts.length; i++) {
				await writer.write(Buffer.from(multipartHeaders[i], "latin1"));
				const reader = parts[i].getReader();
				while(true) {
					const { done, value } = await reader.read();
					if(cleaned)
						return;
					if(value != null)
						await writer.write(value);
					if(done)
						break;
				}
				await writer.write(Buffer.from(headerSuffix, "latin1"));
				cleanup(true);
			}
		} catch(_) {
			cleanup();
		}
	})();
	return new NextResponse(stream.readable, {
		status: 206,
		headers: newHeaders(responseHeaders, {
			"Content-Type": `multipart/byteranges; boundary=${boundary}`,
			"Content-Length": isFinite(contentLength) ? `${contentLength + multipartHeadersLength}` : undefined
		})
	});
}

const { state: kState } = Object.fromEntries(Object.getOwnPropertySymbols(new Response()).map(s => [s.description, s]));
function getResponseBody(response: NextResponse) {
	const body = { ...response[kState].body } as { stream: ReadableStream<Uint8Array>, source: any, length: number };
	const contentLength = parseInt(response.headers.get("Content-Length"), 10);
	if(!isNaN(contentLength) && (body.length == null || body.length > contentLength))
		body.length = contentLength;
	return body;
}

type ResponseInit = ConstructorParameters<typeof NextResponse>[1];
export function sendCachableResponseDemand({
	noopResponse,
	status: responseStatus,
	statusText: responseStatusText,
	headers: responseHeaders,
	nextConfig: responseNextConfig,
	url: responseUrl,
	length,
	lastModified,
	request,
	voidRequest,
	coalesceGap = 80
}: ResponseInit & {
	noopResponse?: NextResponse,
	length: number,
	lastModified: number,
	request: (begin: number, end: number) => ReadableStream<Uint8Array> | Uint8Array,
	voidRequest: () => void,
	coalesceGap?: number
}) {
	const noopResponse0 = () => {
		if(noopResponse != null)
			return noopResponse;
		const content = request(0, length);
		voidRequest();
		return new NextResponse(content, {
			status: responseStatus,
			statusText: responseStatusText,
			headers: responseHeaders,
			nextConfig: responseNextConfig,
			url: responseUrl
		});
	};
	if(!isCachable(responseStatus) ||
		isAlreadyHandled(responseStatus) ||
		BUILD_PHASE == nextConstants.PHASE_EXPORT ||
		BUILD_PHASE == nextConstants.PHASE_INFO ||
		BUILD_PHASE == nextConstants.PHASE_PRODUCTION_BUILD
	)
		return noopResponse0();
	const requestHeaders = headers();
	if(!(responseHeaders instanceof Headers))
		responseHeaders = new Headers(responseHeaders);
	if(responseHeaders.has("Content-Range")) {
		// Doesn't make sense to receive Content-Range header. Normalize if the user provided this header.
		responseHeaders.delete("Content-Range");
	}
	if(!isNaN(length) && isFinite(length))
		responseHeaders.set("Content-Length", `${length}`);
	else
		responseHeaders.delete("Content-Length");
	if(!isNaN(lastModified) && isFinite(lastModified))
		responseHeaders.set("Last-Modified", `${new Date(lastModified).toUTCString()}`);
	else
		responseHeaders.delete("Last-Modified");
	if(!responseHeaders.has("ETag") && !isNaN(lastModified) && isFinite(lastModified) && !isNaN(length) && isFinite(length))
		responseHeaders.set("ETag", generateEtagStat(lastModified, length));
	if(isConditionalGET(requestHeaders)) {
		if(isPreconditionFailure(requestHeaders, responseHeaders)) {
			voidRequest();
			return new NextResponse(null, { status: 412 });
		}
		if(isFresh(requestHeaders, responseHeaders)) {
			voidRequest();
			return new NextResponse(null, {
				status: 304,
				headers: newHeaders(responseHeaders, {
					"Content-Encoding": undefined,
					"Content-Language": undefined,
					"Content-Length": undefined,
					"Content-Range": undefined,
					"Content-Type": undefined
				})
			});
		}
	}
	const range = requestHeaders.get("Range");
	if(!BYTES_RANGE_REGEXP.test(range)) {
		const content = request(0, length);
		voidRequest();
		return new NextResponse(content, {
			status: responseStatus,
			statusText: responseStatusText,
			headers: newHeaders(responseHeaders, {
				"Accept-Ranges": "bytes"
			}),
			nextConfig: responseNextConfig,
			url: responseUrl
		});
	}
	const parsedRange = combineRanges(rangeParser(length, range), coalesceGap);
	if(parsedRange == -2 || !isRangeFresh(requestHeaders, responseHeaders))
		return noopResponse0();
	if(parsedRange == -1) {
		voidRequest();
		return new NextResponse(null, {
			status: 416,
			headers: newHeaders({
				"Content-Range": contentRange("bytes", length)
			})
		});
	}
	if(parsedRange.length > 1) {
		return generateMultipartStream({
			length: length,
			responseHeaders: responseHeaders,
			ranges: parsedRange,
			request: request,
			voidRequest: voidRequest
		});
	}
	const partialBegin = parsedRange[0].start;
	const partialEnd = parsedRange[0].end;
	const partialLength = partialEnd - partialBegin;
	if(!isFinite(partialBegin))
		return noopResponse0();
	const content = request(partialBegin, partialEnd);
	voidRequest();
	return new NextResponse(content, {
		status: 206,
		headers: newHeaders(responseHeaders, {
			"Content-Range": contentRange("bytes", length, parsedRange[0]),
			"Content-Length": isFinite(partialLength) ? `${partialLength}` : undefined
		})
	});
}
export function sendCachableResponse(response: NextResponse, { coalesceGap }: { coalesceGap?: number } = {}) {
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
		return response;
	if(!responseHeaders.has("ETag") && isUint8Array(content))
		responseHeaders.set("ETag", generateEtag(content));
	return sendCachableResponseDemand({
		noopResponse: response,
		status: response.status,
		statusText: response.statusText,
		headers: responseHeaders,
		length: length,
		lastModified: Date.parse(responseHeaders.get("Last-Modified")),
		request: (start, end) => {
			if(isUint8Array(content)) return content.subarray(start, end);
			const [tee1, tee2] = content.tee();
			content = tee1;
			return tee2.pipeThrough(new SliceTransformStream(start, end));
		},
		voidRequest: () => {
			if(isUint8Array(content)) return;
			content.cancel().catch(() => {});
		},
		coalesceGap: coalesceGap
	});
}
