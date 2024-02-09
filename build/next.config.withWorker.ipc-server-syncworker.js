const net = require("net");
const sharedMemory = require("@markusjx/shared_memory");
const {
	socketReader
} = require("./next.config.withWorker.ipc-server-shared.js");

const chunks = [];
process.stdin.resume();
process.stdin.setEncoding("utf-8");
process.stdin.on("data", chunk => chunks.push(chunk));
process.stdin.on("end", () => {
	const input = JSON.parse(chunks.join(""));
	const { workerPort, bufferId, bufferLength } = input;
	const callBuffer = new sharedMemory(bufferId, bufferLength, false, false);
	const payload = callBuffer.readBuffer();

	const socket = net.connect({ port: workerPort });
	const readBytes = socketReader(socket);
	async function readUntilFull() {
		const length = (await readBytes(4)).readUInt32BE();
		const buffer = await readBytes(length);
		return buffer;
	}

	socket.on("data", buffer => process.stdout.write(buffer));
	(async () => {
		await readUntilFull();
		process.exit(0);
	})().catch(e => {
		process.stderr.write(e.stack);
		process.exit(1);
	});
	socket.write(payload);
});
