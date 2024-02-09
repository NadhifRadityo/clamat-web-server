Object.defineProperty(exports, "__esModule", {
	value: true
});
exports.default = loader;
exports.loader = loader;
exports.pitch = pitch;

const path = require("path");
const dedent = require("dedent-js");
const { parseModule } = require("next/dist/build/analysis/parse-module");
const { extractExportedConstValue, UnsupportedValueError } = require("next/dist/build/analysis/extract-const-value");
const innerRegex = /\s*[#@]\s*sourceMappingURL\s*=\s*(.*?(?=[\s'"]|\\n|\*\/|$)(?:\\n)?)\s*/;
const sourceMappingURLRegex = RegExp("(?:/\\*(?:\\s*\r?\n(?://)?)?(?:" + innerRegex.source + ")\\s*\\*/|//(?:" + innerRegex.source + "))\\s*");
const sourceURLWebpackRegex = RegExp("\\/\\/#\\ssourceURL=webpack-internal:\\/\\/\\/(.*?)\\\\n");

function adler32(str, seed) {
	const L = str.length;
	let a = 1;
	let b = 0;
	if(typeof seed === "number") {
		a = seed & 0xFFFF;
		b = seed >>> 16;
	}
	for(let i = 0; i < L;) {
		let M = Math.min(L - i, 2918);
		while(M > 0) {
			let c = str.charCodeAt(i++);
			let d;
			if(c < 0x80) a += c; else if(c < 0x800) {
				a += 192 | ((c >> 6) & 31); b += a; --M;
				a += 128 | (c & 63);
			} else if(c >= 0xD800 && c < 0xE000) {
				c = (c & 1023) + 64;
				d = str.charCodeAt(i++) & 1023;
				a += 240 | ((c >> 8) & 7); b += a; --M;
				a += 128 | ((c >> 2) & 63); b += a; --M;
				a += 128 | ((d >> 6) & 15) | ((c & 3) << 4); b += a; --M;
				a += 128 | (d & 63);
			} else {
				a += 224 | ((c >> 12) & 15); b += a; --M;
				a += 128 | ((c >> 6) & 63); b += a; --M;
				a += 128 | (c & 63);
			}
			b += a; --M;
		}
		a = (15 * (a >>> 16) + (a & 65535));
		b = (15 * (b >>> 16) + (b & 65535));
	}
	return Math.abs(((b % 65521) << 16) | (a % 65521));
}
function getExternalsType(compilerOptions) {
	if(compilerOptions.output.libraryTarget)
		return compilerOptions.output.libraryTarget;
	if(compilerOptions.externalsType)
		return compilerOptions.externalsType;
	if(compilerOptions.output.library)
		return compilerOptions.output.library.type;
	if(compilerOptions.output.module)
		return "module";
	return "var";
}
async function getWorkerType(loaderContext, request) {
	const fileSystem = loaderContext._compiler.outputFileSystem;
	const sourcePath = request.split("!").at(-1);
	const source = await new Promise((res, rej) =>
		fileSystem.readFile(sourcePath, "utf-8", (e, d) => (e == null ? res(d) : rej(e))));
	let workerType;
	if(!/(?<!(_jsx|jsx-))export const/.test(source))
		return "worker";
	const swcAST = await parseModule(sourcePath, source);
	try {
		workerType = extractExportedConstValue(swcAST, "type");
		if(typeof workerType != "string")
			throw new UnsupportedValueError(`Expecting literal string but got ${typeof workerType}`);
	} catch(error) {
		if(error instanceof UnsupportedValueError) {
			console.warn(dedent`
				Next.js can't recognize the exported \`type\` field in "${sourcePath}":
				${error.message}${error.path != null ? ` at "${error.path}"` : ""}.
				The default value will be used instead.
			`);
		}
		return "worker";
	}
	return workerType;
}

async function workerGeneratorServer({ loaderContext, options, request, workerFilename, workerSource, workerSourcePath }) {
	return dedent(`
		const ipcServerParent = require(${JSON.stringify(options.ipcServerParent)});
		ipcServerParent.initSharedObjects(${JSON.stringify({ syncWorkerPath: options.ipcServerSyncworker })});
		const instance = ipcServerParent.newInstance(${workerSourcePath}, ${JSON.stringify(adler32(workerSourcePath))}, ${JSON.stringify(adler32(workerSource))});
		module.exports = instance.exports;
	`);
}
async function workerGeneratorClient({ loaderContext, options, request, workerFilename, workerSource, workerSourcePath }) {
	const workerType = await getWorkerType(loaderContext, request);
	return dedent(`
		const ipcClientParent = require(${JSON.stringify(options.ipcClientParent)});
		ipcClientParent.initSharedObjects(${JSON.stringify({ serviceWorkerPath: path.join(loaderContext._compiler.options.output.publicPath, "static/chunks", "ipc-client-serviceworker.js"), managementPath: path.join(loaderContext._compiler.options.output.publicPath, "static/chunks", "ipc-client-management.js") })});
		const instance = ipcClientParent.newInstance(${workerSourcePath}, ${JSON.stringify(adler32(workerSourcePath))}, ${JSON.stringify(adler32(workerSource))}, ${JSON.stringify(workerType)});
		module.exports = instance.exports;
	`);
}
async function workerGenerator(loaderContext, options, request, workerFilename, workerSource) {
	const config = { loaderContext, options, request, workerFilename, workerSource };
	if(options.isServer) {
		config.workerSourcePath = `${JSON.stringify(path.join(loaderContext._compiler.options.output.path, workerFilename))}`;
		return await workerGeneratorServer(config);
	} else {
		config.workerSourcePath = `${JSON.stringify(path.join(loaderContext._compiler.options.output.publicPath, workerFilename))}`;
		return await workerGeneratorClient(config);
	}
}

async function compileRuntime(request) {
	this.cacheable(false);
	const options = this.getOptions() || {};
	const webpack = this._compiler.webpack;
	const compilerOptions = this._compiler.options;

	const rootContext = this.rootContext;
	const resourcePath = this.resourcePath;
	const targetName = (path.isAbsolute(resourcePath) ? path.relative(rootContext, resourcePath) : resourcePath).replace(/[\\/.]/gm, "_");
	this.resourcePath = path.join(rootContext, targetName);
	const childCompiler = this._compilation.createChildCompiler(`next-worker-loader-main ${request}`, {
		publicPath: compilerOptions.output.publicPath,
		globalObject: "self"
	});

	(new webpack.webworker.WebWorkerTemplatePlugin()).apply(childCompiler);
	if(this.target != "webworker" && this.target != "web")
		(new webpack.node.NodeTargetPlugin()).apply(childCompiler);
	(new webpack.web.FetchCompileWasmPlugin({ mangleImports: compilerOptions.optimization.mangleWasmImports })).apply(childCompiler);
	(new webpack.web.FetchCompileAsyncWasmPlugin()).apply(childCompiler);
	(new webpack.ExternalsPlugin(getExternalsType(compilerOptions), compilerOptions.externals)).apply(childCompiler);
	(new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 })).apply(childCompiler);
	(new webpack.EntryPlugin(this.context, `!!${request}`, { name: targetName })).apply(childCompiler);

	return await new Promise((resolve, reject) => childCompiler.runAsChild((error, entries, compilation) => {
		if(error != null) { reject(error); return; }
		if(compilation.errors.length > 0) { reject(compilation.errors[0]); return; }
		if(!entries[0]) { reject(new Error(`Failed to compile web worker "${request}" request`)); return; }
		compilation.fileDependencies.forEach(dep => this.addDependency(dep));
		compilation.contextDependencies.forEach(dep => this.addContextDependency(dep));
		const [workerFilename] = [...entries[0].files];
		if(options.inline == "no-fallback") {
			delete this._compilation.assets[workerFilename];
			delete this._compilation.assets[`${workerFilename}.map`];
		}
		const cache = childCompiler.getCache("next-worker-loader");
		const cacheIdent = workerFilename;
		const cacheETag = cache.getLazyHashedEtag(compilation.assets[workerFilename]);
		cache.get(cacheIdent, cacheETag, (getCacheError, cacheContent) => {
			if(getCacheError != null) { reject(getCacheError); return; }
			if(cacheContent != null) { resolve(cacheContent); return; }
			let workerSource = compilation.assets[workerFilename].source();
			if(options.inline == "no-fallback") {
				workerSource = workerSource.replace(sourceMappingURLRegex, "");
				workerSource = workerSource.replace(sourceURLWebpackRegex, "");
			}
			workerGenerator(this, options, request, workerFilename, workerSource)
				.then(workerCode => {
					const workerCodeBuffer = Buffer.from(workerCode);
					cache.store(
						cacheIdent,
						cacheETag,
						workerCodeBuffer,
						storeCacheError => {
							if(storeCacheError != null)
								return reject(storeCacheError);
							return resolve(workerCodeBuffer);
						}
					);
				})
				.catch(e => reject(e));
		});
	}));
}

function loader() {

}
function pitch(request) {
	const callback = this.async();
	compileRuntime.call(this, request)
		.then(r => callback(null, r))
		.catch(e => callback(e, null));
}
