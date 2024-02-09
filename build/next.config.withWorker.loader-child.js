Object.defineProperty(exports, "__esModule", {
	value: true
});
exports.default = loader;
exports.loader = loader;
exports.pitch = pitch;

const dedent = require("dedent-js");
const loaderUtils = require("next/dist/compiled/loader-utils2/index.js");

async function workerGeneratorServer({ loaderContext, options, request }) {
	return dedent(`
		const ipcServerChild = require(${JSON.stringify(options.ipcServerChild)});
		ipcServerChild.initSharedObjects(${JSON.stringify({ syncWorkerPath: options.ipcServerSyncworker })});
		const instance = ipcServerChild.newInstance();
		instance.expose((async () => require(${loaderUtils.stringifyRequest(loaderContext, `!!${request}`)}))());
		module.exports = instance;
	`);
}
async function workerGeneratorClient({ loaderContext, options, request }) {
	return dedent(`
		const ipcClientChild = require(${JSON.stringify(options.ipcClientChild)});
		ipcClientChild.initSharedObjects(${JSON.stringify({})});
		const instance = ipcClientChild.newInstance();
		instance.expose((async () => require(${loaderUtils.stringifyRequest(loaderContext, `!!${request}`)}))());
		module.exports = instance;
	`);
}
async function workerGenerator(loaderContext, options, request) {
	const config = { loaderContext, options, request };
	if(options.isServer)
		return await workerGeneratorServer(config);
	else
		return await workerGeneratorClient(config);
}

async function compileRuntime(request) {
	const options = this.getOptions() || {};
	const webpack = this._compiler.webpack;

	return await workerGenerator(this, options, request);
}

function loader() {

}
function pitch(request) {
	const callback = this.async();
	compileRuntime.call(this, request)
		.then(r => callback(null, r))
		.catch(e => callback(e, null));
}
