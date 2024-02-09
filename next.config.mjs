import withPlugins from "./build/next.config.withPlugins.mjs";
import withWorker from "./build/next.config.withWorker.mjs";
import withRuntimeId from "./build/next.config.withRuntimeId.mjs";
import withRuntimeConfig from "./build/next.config.withRuntimeConfig.mjs";
import withNode from "./build/next.config.withNode.mjs";

export default (phase, { defaultConfig }) => {
	return withPlugins([
		[withNode],
		[withRuntimeConfig],
		[withRuntimeId],
		[withWorker]
	], {
		experimental: {
			serverComponentsExternalPackages: ["@prisma/client"]
		},
		serverRuntimeConfig: {
			get PROJECT_ROOT() { return process.cwd(); },
			BUILD_PHASE: phase
		},
		publicRuntimeConfig: {
			PROJECT_NAME: "clamat-web-server",
			PROJECT_WEB_HOSTNAME: process.env.NODE_ENV == "production" ? "clamat.local" : "localhost",
			PROJECT_WEB_HOST: process.env.NODE_ENV == "production" ? "clamat.local" : "localhost:3000",
			PROJECT_WEB_PROTOCOL: process.env.NODE_ENV == "production" ? "https:" : "http:",
			PROJECT_WEB_ORIGIN: process.env.NODE_ENV == "production" ? "https://clamat.local" : "http://localhost:3000"
		},
		poweredByHeader: process.env.NODE_ENV == "production",
		eslint: {
			dirs: ["app", "components", "utils"],
			ignoreDuringBuilds: true
		},
		typescript: {
			ignoreBuildErrors: true
		}
	})(phase, {});
};
