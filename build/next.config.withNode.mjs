import { debug, newRequire } from "./next.config.shared.mjs";

const log = debug("build:plugin:withNode");
const require = newRequire(import.meta.url);

export default function withVideos(nextConfig = {}) {
	log("Initializing plugin...");
	const path = require("path");
	const url = require("url");

	const base = path.dirname(url.fileURLToPath(import.meta.url));
	const LOADER = path.resolve(path.join(base, "./next.config.withNode.loader.js"));

	return {
		webpack(config, options) {
			if(options.isServer) {
				log("Adding resolve extensions...");
				config.resolve.extensions = [...config.resolve.extensions, ".node"];

				log("Adding resolve loader alias...");
				config.resolveLoader.alias = {
					...config.resolveLoader.alias,
					"next-node-loader": LOADER
				};

				log("Adding node rules...");
				config.module.rules = [
					...config.module.rules,
					{
						test: /\.node$/,
						loader: "next-node-loader"
					}
				];
			}

			if(typeof nextConfig.webpack == "function")
				return nextConfig.webpack(config, options);
			return config;
		}
	};
}
