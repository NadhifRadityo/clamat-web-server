Object.defineProperty(exports, "__esModule", {
	value: true
});
exports.default = nextNodeLoader;
exports.nextWorkerLoader = nextNodeLoader;
exports.raw = true;

const path = require("path");
const dedent = require("dedent-js");
const loaderUtils = require("next/dist/compiled/loader-utils3");

function nextNodeLoader(content) {
	const options = this.getOptions() || {};
	const name = loaderUtils.interpolateName(
		this,
		typeof options.name !== "undefined" ? options.name : "[contenthash].[ext]",
		{ context: this.rootContext, content }
	);
	this.emitFile(name, content);

	return dedent(`
		const contentSource = ${JSON.stringify(path.join(this._compiler.options.output.path, name))};
		process.dlopen(module, contentSource${typeof options.flags != "undefined" ? `, ${JSON.stringify(options.flags)}` : ""});
	`);
}
