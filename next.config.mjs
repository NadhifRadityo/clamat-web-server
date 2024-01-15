export default (phase, { defaultConfig }) => {
	return {
		experimental: {
			serverComponentsExternalPackages: ["@prisma/client"]
		}
	};
};
