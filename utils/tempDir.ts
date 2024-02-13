import fs0 from "fs";
import path from "path";
import getConfig from "next/config";

const { serverRuntimeConfig } = getConfig();

export function newTempDir(name: string) {
	const tempDir = path.join(serverRuntimeConfig.PROJECT_ROOT, ".temp", serverRuntimeConfig.RUNTIME_ID, name);
	if(!fs0.existsSync(tempDir))
		fs0.mkdirSync(tempDir, { recursive: true });
	return tempDir;
}
