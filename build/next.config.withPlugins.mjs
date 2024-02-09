import { debug } from "./next.config.shared.mjs";

const log = debug("build:plugin:withPlugins");

export const OPTIONAL_SYMBOL = Symbol.for("__NEXT_COMPOSE_PLUGINS_OPTIONAL__");
export function markOptional(plugin) {
	plugin[OPTIONAL_SYMBOL] = true;
	return plugin;
}
export default function withPlugins(plugins, nextConfig = {}) {
	const isInCurrentPhase = (phase, phaseTest) => {
		const phaseTestString = phaseTest instanceof Array ? phaseTest.join("") : phaseTest;
		if(phaseTestString.substr(0, 1) === "!")
			return phaseTestString.indexOf(phase) < 0;
		return phaseTestString.indexOf(phase) >= 0;
	};
	const mergePhaseConfiguration = (phase, config) => {
		const mergedConfig = {};
		for(const key in config) {
			if(key.startsWith("phase-") || key.startsWith("!phase-")) {
				if(!isInCurrentPhase(phase, key)) continue;
				Object.defineProperties(mergedConfig, Object.getOwnPropertyDescriptors(config[key]));
				continue;
			}
			Object.defineProperty(mergedConfig, key, Object.getOwnPropertyDescriptor(config, key));
		}
		return mergedConfig;
	};
	const isOptional = plugin => {
		return typeof plugin[OPTIONAL_SYMBOL] != "undefined";
	};
	const parsePluginConfig = plugin => {
		if(!(plugin instanceof Array)) {
			return {
				pluginFunction: plugin,
				pluginConfig: {},
				phases: null
			};
		}
		if(plugin.length > 2) {
			return {
				pluginFunction: plugin[0],
				pluginConfig: plugin[1],
				phases: plugin[2]
			};
		}
		if(plugin.length > 1 && plugin[1] instanceof Array) {
			return {
				pluginFunction: plugin[0],
				pluginConfig: {},
				phases: plugin[1]
			};
		}
		return {
			pluginFunction: plugin[0],
			pluginConfig: plugin[1] || {},
			phases: null
		};
	};
	const composePlugins = (phase, config) => {
		const mergedConfig = mergePhaseConfiguration(phase, config);
		const composePlugin = (plugin, composeNext) => {
			const { pluginFunction, pluginConfig, phases } = parsePluginConfig(plugin);
			if(phases != null && !isInCurrentPhase(phase, phases))
				return composeNext();
			const resolvedPlugin = !isOptional(pluginFunction) ? pluginFunction : pluginFunction();
			const mergedPluginConfig = mergePhaseConfiguration(phase, pluginConfig);
			const parsePluginConfigResult = pluginConfigResult => {
				const pluginPhases = pluginConfigResult.phases;
				if(pluginPhases != null) {
					if(!isInCurrentPhase(phase, pluginPhases))
						return composeNext();
					delete pluginConfigResult.phases;
				}
				Object.defineProperties(mergedConfig, Object.getOwnPropertyDescriptors(pluginConfigResult));
				return composeNext();
			};
			if(typeof resolvedPlugin == "object")
				return parsePluginConfigResult(resolvedPlugin);
			if(typeof resolvedPlugin == "function") {
				const pluginSpecificConfig = {};
				Object.defineProperties(pluginSpecificConfig, Object.getOwnPropertyDescriptors(mergedConfig));
				Object.defineProperties(pluginSpecificConfig, Object.getOwnPropertyDescriptors(mergedPluginConfig));
				const additionalInfo = { nextComposePlugin: true, phase };
				const pluginResult = resolvedPlugin(pluginSpecificConfig, additionalInfo);
				if(pluginResult instanceof Promise)
					return pluginResult.then(parsePluginConfigResult);
				return parsePluginConfigResult(pluginResult);
			}
			throw new Error("Incompatible plugin: plugin needs to export either a function or an object!");
		};
		let pluginIndex = 0;
		const composeNext = () => {
			if(pluginIndex >= plugins.length)
				return mergedConfig;
			return composePlugin(plugins[pluginIndex++], composeNext);
		};
		return composeNext();
	};
	return (phase, { defaultConfig = {} }) => {
		log("Composing plugins...");
		const config = {};
		Object.defineProperties(config, Object.getOwnPropertyDescriptors(defaultConfig));
		Object.defineProperties(config, Object.getOwnPropertyDescriptors(nextConfig));
		const result = composePlugins(phase, config);
		log("Plugins composed");
		return result;
	};
}
