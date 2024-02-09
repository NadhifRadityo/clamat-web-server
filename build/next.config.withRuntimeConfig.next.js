/* eslint-disable no-undef */
/* eslint-disable no-eval */
Object.defineProperty(exports, "__esModule", {
	value: true
});
exports.default = getConfig;
exports.getConfig = getConfig;
exports.setConfig = setConfig;

const nextRuntimeConfig = require("next/dist/shared/lib/runtime-config.external");
const { ignoreToJson, jsonEvalStringify } = require("./next.config.withRuntimeConfig.shared");

const warnedProperty = [];
const wrapSymbol = Symbol.for("__NEXT_CONFIG_PROXY_WRAP__");
const configGlobalSymbol = Symbol.for("__NEXT_CONFIG__");
const __symbolRuntimeConfig = Symbol.for("__NEXT_RUNTIME_CONFIG__");

function getConfig() {
	return globalThis[configGlobalSymbol];
}
function setConfig(newConfig) {
	if(globalThis[configGlobalSymbol] == newConfig)
		return newConfig;
	if(typeof window == "undefined" && newConfig.serverRuntimeConfig != null) {
		if(newConfig.serverRuntimeConfig[__symbolRuntimeConfig])
			newConfig.serverRuntimeConfig = newConfig.serverRuntimeConfig.toJSON();
		if(typeof newConfig.serverRuntimeConfig.__NEXT_RUNTIME_CONFIG__ == "string")
			newConfig.serverRuntimeConfig = eval(`(${newConfig.serverRuntimeConfig.__NEXT_RUNTIME_CONFIG__})`);
		if(typeof newConfig.serverRuntimeConfig == "object" && newConfig.serverRuntimeConfig != null)
			newConfig.serverRuntimeConfig.toJSON = () => ({ __NEXT_RUNTIME_CONFIG__: jsonEvalStringify(ignoreToJson(newConfig.serverRuntimeConfig)) });
	}
	if(newConfig.publicRuntimeConfig != null) {
		if(newConfig.publicRuntimeConfig[__symbolRuntimeConfig])
			newConfig.publicRuntimeConfig = newConfig.publicRuntimeConfig.toJSON();
		if(typeof newConfig.publicRuntimeConfig.__NEXT_RUNTIME_CONFIG__ == "string")
			newConfig.publicRuntimeConfig = eval(`(${newConfig.publicRuntimeConfig.__NEXT_RUNTIME_CONFIG__})`);
		if(typeof newConfig.publicRuntimeConfig == "object" && newConfig.publicRuntimeConfig != null)
			newConfig.publicRuntimeConfig.toJSON = () => ({ __NEXT_RUNTIME_CONFIG__: jsonEvalStringify(ignoreToJson(newConfig.publicRuntimeConfig)) });
	}
	if(process.env.NODE_ENV == "development") {
		warnedProperty.splice(0);
		const handler = path => ({
			get(target, property) {
				if(property == wrapSymbol) return true;
				const value = target[property];
				if(typeof value != "object" || value == null)
					return value;
				if(typeof property == "symbol" && property.description?.startsWith("__NEXT_"))
					return value;
				if(value[wrapSymbol])
					return value;
				const current = `${path}.${property.toString()}`;
				return target[property] = new Proxy(value, handler(current));
			},
			set(target, property, value) {
				if(property == wrapSymbol) return false;
				target[property] = value;
				if(typeof property == "symbol" && property.description?.startsWith("__NEXT_"))
					return true;
				const current = `${path}.${property.toString()}`;
				if(warnedProperty[current]) return true;
				warnedProperty[current] = true;
				console.warn(`Setting property "${current}" to "${value}". Setting value to next/config is not recommended!`);
				return true;
			}
		});
		newConfig = new Proxy(newConfig, handler(`require('next/config')`));
	}
	return globalThis[configGlobalSymbol] = newConfig;
}

if(typeof window == "undefined") {
	// We set the config through the plugin loader. But in a case where this is running in a worker
	// where the entry point is set to the original holder, then we need to copy the config from the
	// original holder here. It doesn't matter if this isn't running in a worker, since we will
	// set it again later.
	const config = nextRuntimeConfig.default();
	if(config != null) {
		setConfig(config);
		nextRuntimeConfig.setConfig(getConfig());
	}
} else {
	const isInWorker = (
		(typeof WorkerGlobalScope != "undefined" && globalThis instanceof WorkerGlobalScope) ||
		(typeof DedicatedWorkerGlobalScope != "undefined" && globalThis instanceof DedicatedWorkerGlobalScope) ||
		(typeof SharedWorkerGlobalScope != "undefined" && globalThis instanceof SharedWorkerGlobalScope) ||
		(typeof ServiceWorkerGlobalScope != "undefined" && globalThis instanceof ServiceWorkerGlobalScope) ||
		(globalThis.parent != null && (globalThis.location.href == "about:blank" || globalThis.location.pathname == "/_next/static/chunks/ipc-client-management.html"))
	);
	if(!isInWorker) {
		// `<script id="__NEXT_RUNTIME_CONFIG__"/>` will be provided by layout page
		// (The user need to include it manually)
		const configScript = document.getElementById("__NEXT_RUNTIME_CONFIG__");
		if(configScript == null) {
			throw new Error(`Cannot load runtime config because \`<script id="__NEXT_RUNTIME_CONFIG__"/>\` is not available in the dom. ` +
				`Check your layout page if runtime config is loaded.`);
		}
		const deserializedConfig = JSON.parse(configScript.textContent);
		if(deserializedConfig.serverRuntimeConfig) {
			delete deserializedConfig.serverRuntimeConfig;
			console.warn(`Detected serverRuntimeConfig key in client page. Please check your layout config.`);
		}
		setConfig(deserializedConfig);
		nextRuntimeConfig.setConfig(getConfig());
	}
}

Object.defineProperty(exports.default, "__esModule", { value: true });
Object.assign(exports.default, exports);
module.exports = exports.default;
