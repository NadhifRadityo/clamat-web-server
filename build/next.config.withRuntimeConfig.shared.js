exports.ignoreToJson = ignoreToJson;
exports.jsonEvalStringify0 = jsonEvalStringify0;
exports.jsonEvalStringify0Client = jsonEvalStringify0Client;
exports.jsonEvalStringify = jsonEvalStringify;

function ignoreToJson(value) {
	if(typeof value != "object" || value == null)
		return value;
	return new Proxy(value, {
		ownKeys(target) {
			const keys = Reflect.ownKeys(target);
			const toJSONIndex = keys.indexOf("toJSON");
			if(toJSONIndex != -1)
				keys.splice(toJSONIndex, 1);
			return keys;
		},
		get(target, property) {
			if(property == "toJSON") return null;
			return Reflect.get(target, property);
		}
	});
}

const KEEP_CLIENT = "/* KEEP CLIENT */";
function escapeJs(string) {
	return string.replaceAll("\\", "\\\\")
		.replaceAll("\t", "\\t")
		.replaceAll("\b", "\\b")
		.replaceAll("\n", "\\n")
		.replaceAll("\r", "\\r")
		.replaceAll("\u000c", "\\u000c")
		.replaceAll("\'", "\\'")
		.replaceAll("\"", "\\\"");
}
function findDescriptorBlock(functionBlock) {
	let matcher = functionBlock.match(/^(?:get|set)\s*\((.*)\)\s*{((?:.|\s)*)}$/); // get(a, b) { a, b }
	if(matcher) return [matcher[1].trim(), matcher[2].trim()];
	matcher = functionBlock.match(/^(?:get|set)\s*(?:[a-zA-Z_$][a-zA-Z0-9_$]*)\s*\((.*)\)\s*{((?:.|\s)*)}$/); // get name(a, b) { a, b }
	if(matcher) return [matcher[1].trim(), matcher[2].trim()];
	matcher = functionBlock.match(/^(?:get|set)\s*("|').*\1\s*\((.*)\)\s*{((?:.|\s)*)}$/); // get "name"(a, b) { a, b }
	if(matcher) return [matcher[2].trim(), matcher[3].trim()];
	return findFunctionObjectBlock(functionBlock);
}
function findFunctionObjectBlock(functionBlock) {
	let matcher = functionBlock.match(/^(?:function)?\s*(?:[a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(([a-zA-Z0-9_$,\s]*?)\)\s*{((?:.|\s)*)}$/); // function name(a, b) { a, b }
	if(matcher) return [matcher[1].trim(), matcher[2].trim()];
	matcher = functionBlock.match(/^(?:function)?\s*("|')(?:[a-zA-Z_$][a-zA-Z0-9_$]*)\1\s*\(([a-zA-Z0-9_$,\s]*?)\)\s*{((?:.|\s)*)}$/); // function "name"(a, b) { a, b }
	if(matcher) return [matcher[2].trim(), matcher[3].trim()];
	matcher = functionBlock.match(/^\s*\(([a-zA-Z0-9_$,\s]*?)\)\s*=>\s*{((?:.|\s)*)}$/); // (a, b) => { a, b }
	if(matcher) return [matcher[1].trim(), matcher[2].trim()];
	matcher = functionBlock.match(/^\s*\(([a-zA-Z0-9_$,\s]*?)\)\s*=>\s*((?:.|\s)*)$/); // (a, b) => [a, b]
	if(matcher) return [matcher[1].trim(), matcher[2].trim()];
	matcher = functionBlock.match(/^\s*([a-zA-Z0-9_$\s]*?)\s*=>\s*{((?:.|\s)*)}$/); // a => { a, a }
	if(matcher) return [matcher[1].trim(), matcher[2].trim()];
	matcher = functionBlock.match(/^\s*([a-zA-Z0-9_$\s]*?)\s*=>\s*((?:.|\s)*)$/); // a => a
	if(matcher) return [matcher[1].trim(), matcher[2].trim()];
	return [null, null];
}
function toStandaloneFunction(functionBlock) {
	if(functionBlock.startsWith("function"))
		return functionBlock;
	let matcher = functionBlock.match(/^\s*\(([a-zA-Z0-9_$,\s]*?)\)\s*=>\s*{((?:.|\s)*)}$/); // (a, b) => { a, b }
	if(matcher) return functionBlock;
	matcher = functionBlock.match(/^\s*\(([a-zA-Z0-9_$,\s]*?)\)\s*=>\s*((?:.|\s)*)$/); // (a, b) => [a, b]
	if(matcher) return functionBlock;
	matcher = functionBlock.match(/^\s*([a-zA-Z0-9_$\s]*?)\s*=>\s*{((?:.|\s)*)}$/); // a => { a, a }
	if(matcher) return functionBlock;
	matcher = functionBlock.match(/^\s*([a-zA-Z0-9_$\s]*?)\s*=>\s*((?:.|\s)*)$/); // a => a
	if(matcher) return functionBlock;
	return `function ${functionBlock}`;
}
function jsonEvalStringify0(key, value, assignments, assignmentUsages, index) {
	if(value != null && typeof value.toJSON == "function")
		value = value.toJSON();
	const type = typeof value;
	if(type == "boolean") return value.toString();
	if(type == "number") return value.toString();
	if(type == "string") return `"${escapeJs(value)}"`;
	if(type == "undefined") return `undefined`;
	if(type == "function") return `${toStandaloneFunction(value.toString())}`;
	if(type == "symbol") return `Symbol.for("${escapeJs(value.description)}")`;
	if(type == "bigint") return `${value}n`;
	if(value == null) return "null";
	if(value instanceof Date) return `new Date(${value.getTime()})`;
	let assignmentIndex = assignments.findIndex(([v]) => v == value);
	if(assignmentIndex == -1) {
		const assignment = [value, null, []];
		assignmentIndex = assignments.length;
		assignments.push(assignment);
		if(value instanceof Array) {
			assignment[1] = value.reduce((c, v, i) => (c = i == 0 ? c : c + ", ") +
				(() => jsonEvalStringify0(i, v, assignments, assignment[2], c.length))(), "[") + "]";
		} else {
			const propertyDescriptors = Object.getOwnPropertyDescriptors(value);
			assignment[1] = Reflect.ownKeys(propertyDescriptors).map(k => [k, propertyDescriptors[k]]).reduce((c, v, i) => (c = i == 0 ? c : c + ", ") +
				(([k, descriptor]) => {
					let getDescriptorFunction;
					let setDescriptorFunction;
					if(descriptor.get) {
						const [descriptorArg, descriptorBlock] = findDescriptorBlock(descriptor.get.toString());
						if(descriptorArg != null && descriptorBlock != null)
							getDescriptorFunction = `get "${escapeJs(k)}"(${descriptorArg}) { ${descriptorBlock} }`;
					}
					if(descriptor.set) {
						const [descriptorArg, descriptorBlock] = findDescriptorBlock(descriptor.set.toString());
						if(descriptorArg != null && descriptorBlock != null)
							setDescriptorFunction = `set "${escapeJs(k)}"(${descriptorArg}) { ${descriptorBlock} }`;
					}
					if(getDescriptorFunction != null || setDescriptorFunction != null)
						return [getDescriptorFunction, setDescriptorFunction].filter(c => c != null).join(",");
					const childValue = value[k];
					if(typeof childValue == "function") {
						const [functionArg, functionBlock] = findFunctionObjectBlock(childValue.toString());
						if(functionArg != null && functionBlock != null)
							return `"${escapeJs(k)}"(${functionArg}) { ${functionBlock} }`;
					}
					const childKeyJson = `${typeof k == "symbol" ? `[Symbol.for("${escapeJs(k.description)}")]` : `"${escapeJs(k)}"`}: `;
					const childValueJson = jsonEvalStringify0(k, childValue, assignments, assignment[2], c.length + childKeyJson.length);
					return `${childKeyJson}${childValueJson}`;
				})(v), "{") + "}";
		}
	}
	assignmentUsages.push([index, assignmentIndex, key]);
	return "";
}
function jsonEvalStringify0Client(key, value, assignments, assignmentUsages, index) {
	if(value != null && typeof value.toJSON == "function")
		value = value.toJSON();
	const type = typeof value;
	if(type == "boolean") return value.toString();
	if(type == "number") return value.toString();
	if(type == "string") return `"${escapeJs(value)}"`;
	if(type == "undefined") return `undefined`;
	if(type == "function") return `${toStandaloneFunction(value.toString())}`;
	if(type == "symbol") return `Symbol.for("${escapeJs(value.description)}")`;
	if(type == "bigint") return `${value}n`;
	if(value == null) return "null";
	if(value instanceof Date) return `new Date(${value.getTime()})`;
	let assignmentIndex = assignments.findIndex(([v]) => v == value);
	if(assignmentIndex == -1) {
		const assignment = [value, null, []];
		assignmentIndex = assignments.length;
		assignments.push(assignment);
		if(value instanceof Array) {
			assignment[1] = value.reduce((c, v, i) => (c = i == 0 ? c : c + ", ") +
				(() => jsonEvalStringify0Client(i, v, assignments, assignment[2], c.length))(), "[") + "]";
		} else {
			const propertyDescriptors = Object.getOwnPropertyDescriptors(value);
			assignment[1] = Reflect.ownKeys(propertyDescriptors).map(k => [k, propertyDescriptors[k]]).reduce((c, v, i) => (c = i == 0 ? c : c + ", ") +
				(([k, descriptor]) => {
					let getDescriptorFunction;
					let setDescriptorFunction;
					if(descriptor.get && descriptor.get.toString().includes(KEEP_CLIENT)) {
						const [descriptorArg, descriptorBlock] = findDescriptorBlock(descriptor.get.toString());
						if(descriptorArg != null && descriptorBlock != null)
							getDescriptorFunction = `get "${escapeJs(k)}"(${descriptorArg}) { ${descriptorBlock} }`;
					}
					if(descriptor.set && descriptor.set.toString().includes(KEEP_CLIENT)) {
						const [descriptorArg, descriptorBlock] = findDescriptorBlock(descriptor.set.toString());
						if(descriptorArg != null && descriptorBlock != null)
							setDescriptorFunction = `set "${escapeJs(k)}"(${descriptorArg}) { ${descriptorBlock} }`;
					}
					if(getDescriptorFunction != null || setDescriptorFunction != null)
						return [getDescriptorFunction, setDescriptorFunction].filter(c => c != null).join(",");
					const childValue = value[k];
					if(typeof childValue == "function") {
						const [functionArg, functionBlock] = findFunctionObjectBlock(childValue.toString());
						if(functionArg != null && functionBlock != null)
							return `"${escapeJs(k)}"(${functionArg}) { ${functionBlock} }`;
					}
					const childKeyJson = `${typeof k == "symbol" ? `[Symbol.for("${escapeJs(k.description)}")]` : `"${escapeJs(k)}"`}: `;
					const childValueJson = jsonEvalStringify0Client(k, childValue, assignments, assignment[2], c.length + childKeyJson.length);
					return `${childKeyJson}${childValueJson}`;
				})(v), "{") + "}";
		}
	}
	assignmentUsages.push([index, assignmentIndex, key]);
	return "";
}
function compileAssignment(entry, assignments, assignmentCounts, assignmentUsages, recursive, parents) {
	assignmentUsages.sort((a, b) => b[0] - a[0]);
	for(const [index, assignmentIndex, assignmentKey] of assignmentUsages) {
		const [_, assignmentJson, assignmentRequiredUsages] = assignments[assignmentIndex];
		const assignmentCount = assignmentCounts[assignmentIndex];
		const assignmentVariable = `$chunk$${assignmentIndex}`;
		if(assignmentCount <= 1) {
			const stack = [assignmentIndex, assignmentKey, false];
			parents.push(stack);
			const compiledAssignmentJson = compileAssignment(assignmentJson, assignments, assignmentCounts, assignmentRequiredUsages, recursive, parents);
			if(stack[2])
				assignments[assignmentIndex].extract = compiledAssignmentJson;
			else
				entry = entry.slice(0, index) + compiledAssignmentJson + entry.slice(index);
			parents.pop();
			continue;
		}
		const parentIndex = parents.findIndex(([i]) => i == assignmentIndex);
		if(parentIndex == -1) {
			entry = entry.slice(0, index) + assignmentVariable + entry.slice(index);
			continue;
		}
		const parentStack = parents[parentIndex];
		parentStack[2] = true;
		entry = entry.slice(0, index) + "undefined" + entry.slice(index);
		const recursiveVariable = `$chunk$${parentStack[0]}`;
		const path = recursiveVariable +
			[...parents.slice(parentIndex + 1).map(([_, k]) => k), assignmentKey]
				.map(k => (typeof k == "string" ? `["${escapeJs(k)}"]` : `[${k}]`)).join("");
		recursive.push(`${path} = ${recursiveVariable};`);
	}
	return entry;
}
function jsonEvalStringify(value, jsonImpl = jsonEvalStringify0) {
	const assignments = [];
	const assignmentUsages = [];
	let entry = jsonImpl(null, value, assignments, assignmentUsages, 0);
	const assignmentCounts = assignments.map((_, i) => assignmentUsages.filter(u => u[1] == i).length + assignments.reduce((v, c) => v + c[2].filter(u => u[1] == i).length, 0));
	const recursiveAssignments = [];
	entry = compileAssignment(entry, assignments, assignmentCounts, assignmentUsages, recursiveAssignments, []);
	const assignmentsEntry = assignments
		.map((v, i) => [v, i]).filter(([v, i]) => assignments[i].extract || assignmentCounts[i] > 1).reverse()
		.map(([[_, j, u], i]) => `const $chunk$${i} = ${assignments[i].extract || compileAssignment(j, assignments, assignmentCounts, u, recursiveAssignments, [[i, null, true]])};`)
		.filter(a => a != null).join(" ");
	const recursiveEntry = recursiveAssignments.join(" ");
	return `(() => { ${assignmentsEntry} ${recursiveEntry} return (${entry}); })()`;
}
