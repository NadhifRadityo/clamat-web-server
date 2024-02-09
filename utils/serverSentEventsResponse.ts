import { NextResponse } from "next/server";

type ResponseInit = ConstructorParameters<typeof NextResponse>[1];
interface ServerSentEvent {
	id?: number;
	event?: string;
	data?: any;
}
export function sendServerSentEventsResponse(
	handle: AsyncGenerator<ServerSentEvent, ServerSentEvent | void, unknown>,
	{
		status: responseStatus,
		statusText: responseStatusText,
		headers: responseHeaders,
		nextConfig: responseNextConfig,
		url: responseUrl
	}: ResponseInit = {}
) {
	const stream = new TransformStream();
	const writer = stream.writable.getWriter();
	const encoder = new TextEncoder();
	let cleaned = false;
	const cleanup = async (success = false) => {
		if(cleaned) return;
		cleaned = true;
		handle.return(null);
		if(!success)
			writer.abort().catch(() => {});
		writer.close().catch(() => {});
	};
	writer.closed.then(cleanup, cleanup);
	(async () => {
		try {
			if(!cleaned)
				await writer.ready;
			if(cleaned)
				return;
			while(true) {
				const { done, value } = await handle.next();
				if(cleaned)
					return;
				if(value != null && value) {
					let payload = "";
					if(value.id != null)
						payload += `id: ${value.id}\n`;
					if(value.event != null)
						payload += `event: ${value.event}\n`;
					if(value.data != null)
						payload += `data: ${JSON.stringify(value.data)}\n`;
					writer.write(encoder.encode(`${payload}\n`)).catch(cleanup);
				}
				if(done)
					break;
			}
			cleanup(true);
		} catch(_) {
			cleanup();
		}
	})();
	return new NextResponse(stream.readable, {
		status: responseStatus,
		statusText: responseStatusText,
		headers: { "Content-Type": "text/event-stream", ...responseHeaders },
		nextConfig: responseNextConfig,
		url: responseUrl
	});
}
