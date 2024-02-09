import { debug, newRequire } from "./next.config.shared.mjs";

const log = debug("build:plugin:withRuntimeConfig");
const require = newRequire(import.meta.url);

let requireHookInjected = false;
let originalConfigResolution = null;

/**
 * Note:
 * There are multiple ways you can describe how dynamic your objects are.
 *
 * Example:
 * ```
 * publicRuntimeConfig: {
 *     VALUE0: 1, // Will render statically on server and client,
 *     get VALUE1() { return Math.random(); }, // The value will be dynamically rendered on server,
 *                                             // but on client it will be static (though every refresh it will change)
 *     get VALUE2() { /* KEEP CLIENT *//* return Math.random(); }, // Will render dynamically both on server and client
 *     get VALUE3() { return process.env.SOME_VAR; }, // Same as VALUE2. But beware, there is no `process` on client browser.
 *     VALUE4: () => { return Math.random(); } // Function will be left as is. Though the function must be as simple as possible,
 *                                             // because the restricted environment. And it cannot access library/other context.
 * }
 * ```
 */
export default function withRuntimeConfig(nextConfig = {}) {
	// Note: This plugin is intended for appDir usage. Since it's experimental, NextJs
	// haven't implemented the mechanism. If you use pagesDir, this plugin is useless,
	// as NextJs implement the mechanism themselves.
	log("Initializing plugin...");
	const path = require("path");
	const url = require("url");
	const requireHook = require("next/dist/server/require-hook");
	const { jsonEvalStringify } = require("./next.config.withRuntimeConfig.shared");

	const base = path.dirname(url.fileURLToPath(import.meta.url));
	const NEXT_CONFIG_ENTRY = path.resolve(path.join(base, "./next.config.withRuntimeConfig.next.js"));

	if(!requireHookInjected) {
		originalConfigResolution = require.resolve("next/config");
		requireHook.addHookAliases([["next/config", NEXT_CONFIG_ENTRY]]);
		requireHookInjected = true;
	}

	// We need to create a custom object to bypass next js normalization to the object.
	// See next/dist/server/config.js#323 `!!value && value.constructor === Object`
	class RuntimeConfig {}
	const newRuntimeConfigHandler = () => {
		const handler = {};
		const proxyTarget = new RuntimeConfig();
		let current;
		Object.defineProperty(handler, "current", {
			get() {
				return current;
			},
			set(v) {
				current = v;
				Object.defineProperties(proxyTarget, Object.getOwnPropertyDescriptors(current));
			}
		});
		const runtimeConfigSerializer = () => ({ __NEXT_RUNTIME_CONFIG__: jsonEvalStringify(current) });
		const __symbolRuntimeConfig = Symbol.for("__NEXT_RUNTIME_CONFIG__");
		handler.proxy = new Proxy(proxyTarget, {
			ownKeys(_) {
				let target = current;
				if(typeof target == "function")
					target = target();
				return [...new Set(["toJSON", ...Reflect.ownKeys(proxyTarget), ...Reflect.ownKeys(target)])];
			},
			has(_, property) {
				if(property == "toJSON")
					return true;
				if(Reflect.has(proxyTarget, property))
					return true;
				let target = current;
				if(typeof target == "function")
					target = target();
				return Reflect.has(target, property);
			},
			get(_, property) {
				if(property == "toJSON")
					return runtimeConfigSerializer;
				if(property == __symbolRuntimeConfig)
					return true;
				if(Reflect.has(proxyTarget, property))
					return Reflect.get(proxyTarget, property);
				let target = current;
				if(typeof target == "function")
					target = target();
				return Reflect.get(target, property);
			},
			set(_, property, value) {
				if(property == "toJSON")
					return false;
				if(property == __symbolRuntimeConfig)
					return false;
				const target = current;
				if(typeof target == "function")
					throw new Error("Cannot set property to runtime config, because it is a function");
				Reflect.set(proxyTarget, property, value);
				return Reflect.set(target, property, value);
			}
		});
		return handler;
	};
	const serverRuntimeConfigMock = newRuntimeConfigHandler();
	serverRuntimeConfigMock.current = nextConfig.serverRuntimeConfig || {};
	const publicRuntimeConfigMock = newRuntimeConfigHandler();
	publicRuntimeConfigMock.current = nextConfig.publicRuntimeConfig || {};
	return {
		get serverRuntimeConfig() { return serverRuntimeConfigMock.proxy; },
		set serverRuntimeConfig(value) { serverRuntimeConfigMock.current = value; },
		get publicRuntimeConfig() { return publicRuntimeConfigMock.proxy; },
		set publicRuntimeConfig(value) { publicRuntimeConfigMock.current = value; },
		webpack(config, options) {
			log("Changing next/config resolve alias...");
			config.resolve.alias = {
				...config.resolve.alias,
				[originalConfigResolution]: NEXT_CONFIG_ENTRY
			};

			if(typeof nextConfig.webpack == "function")
				return nextConfig.webpack(config, options);
			return config;
		}
	};
}
