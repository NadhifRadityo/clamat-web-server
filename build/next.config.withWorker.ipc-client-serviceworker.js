const {
	newFinalizationRegistry
} = require("./next.config.withWorker.ipc-client-shared");

self.addEventListener("install", () => {
	self.skipWaiting();
});

self.addEventListener("activate", () => {
	self.clients.claim();
});

const cachedBroadcastChannels = []; // Array<WeakRef<BroadcastChannel>>
const finalizerBroadcastChannels = newFinalizationRegistry();
finalizerBroadcastChannels.addEventListener("released", e => {
	const index = cachedBroadcastChannels.indexOf(e.heldValue);
	if(index == -1) return;
	cachedBroadcastChannels.splice(index, 1);
});
function getBroadcastChannel(name) {
	for(let i = cachedBroadcastChannels.length - 1; i >= 0; i--) {
		const broadcastChannelRef = cachedBroadcastChannels[i];
		const broadcastChannel = broadcastChannelRef.deref();
		if(broadcastChannel == null) {
			cachedBroadcastChannels.splice(i, 1);
			continue;
		}
		if(broadcastChannel.name == name)
			return broadcastChannel;
	}
	const broadcastChannel = new BroadcastChannel(name);
	const broadcastChannelRef = new WeakRef(broadcastChannel);
	cachedBroadcastChannels.push(broadcastChannelRef);
	finalizerBroadcastChannels.register(broadcastChannel, broadcastChannelRef);
	return broadcastChannel;
}

async function syncProxy(/** @type Request */ request) {
	const workerId = request.headers.get("X-IPC-Id");
	const workerHash = request.headers.get("X-IPC-Hash");
	const ipcId = request.headers.get("X-IPC-Target");
	const side = request.headers.get("X-IPC-Side");
	const channelName = `${workerId}-${workerHash}-${ipcId}-${side == "parent" ? "child" : "parent"}`;
	// FixMe: In shared-worker mode if underlying tab is closed while requesting a proxy to it, the request will stall.
	// This happens because no one responds to the broadcast channel. One possible fix is we can listen to beforeunload
	// event, and send the notification to service worker. If any ongoing (and future) requests contain the target tab,
	// then just throw an error.
	const broadcastChannel = getBroadcastChannel(channelName);
	const buffer = Buffer.from(await request.arrayBuffer());
	return await new Promise((resolve, reject) => {
		const cleanup = () => {
			broadcastChannel.removeEventListener("message", messageListener);
			broadcastChannel.removeEventListener("messageerror", closeListener);
			broadcastChannel.removeEventListener("close", closeListener);
		};
		const messageListener = e => {
			cleanup();
			resolve(new Response(e.data));
		};
		const closeListener = () => {
			cleanup();
			reject(new Error("Endpoint closed"));
		};
		broadcastChannel.addEventListener("message", messageListener);
		broadcastChannel.addEventListener("messageerror", closeListener);
		broadcastChannel.addEventListener("close", closeListener);
		broadcastChannel.postMessage(buffer);
	});
}

self.addEventListener("fetch", e => {
	const request = e.request;
	const url = new URL(request.url);
	if(url.origin != location.origin) return;
	if(url.pathname == "/_next/static/chunks/ipc-client-management.html") {
		const managementUrl = new URL(url.searchParams.get("managementPath"), location.origin);
		e.respondWith(new Response(
			`<!DOCTYPE html><html><head><meta charset="utf-8" /><script src="${JSON.stringify(managementUrl.href).slice(1, -1)}"></script></head></html>`,
			{
				headers: {
					"Content-Type": "text/html",
					"Cache-Control": "no-store"
				}
			}
		));
	}
	if(url.pathname == "/_next/static/chunks/ipc-client-syncproxy")
		e.respondWith(syncProxy(request));
});
