import {
	CLamatMinerModifiers,
	CLamatModuleModifiers,
	CLamatBrokerModifiers,
	CLamatNodeModifiers,
	CLamatSessionModifiers,
	UserModifiers
} from "./types";

/* Start microdiff definition. They did not export these */
interface DifferenceCreate {
	type: "CREATE";
	path: (string | number)[];
	value: any;
}
interface DifferenceRemove {
	type: "REMOVE";
	path: (string | number)[];
	oldValue: any;
}
interface DifferenceChange {
	type: "CHANGE";
	path: (string | number)[];
	value: any;
	oldValue: any;
}
declare type Difference =
	| DifferenceCreate
	| DifferenceRemove
	| DifferenceChange;
/* End microdiff definition. */

export function modifierEditor<TYPES extends { name: string }>() {
	type NAMES = TYPES["name"];
	type FILTER<MODIFIER, WHAT> = MODIFIER extends { name: infer NAME } ? WHAT extends NAME ? MODIFIER : never : never;
	function defineIndices(modifiers: Array<TYPES>, indices = new Map()) {
		if((modifiers as any).indices) return;
		Object.defineProperty(modifiers, "indices", {
			value: indices,
			enumerable: false,
			configurable: false
		});
		return indices;
	}
	function patchIndices(modifiers: Array<TYPES>, differences: Difference[]) {
		// The input difference's paths should be relative to modifiers,
		// this way we only check if the path only has one/two entry, which means
		// the diff applied directly to modifiers and not the content of it.
		let indices: Map<string, Array<number>> = (modifiers as any).indices;
		if(!indices) indices = defineIndices(modifiers);
		for(const difference of differences) {
			const path = difference.path;
			const index = path[0] as number;
			if(path.length == 1) {
				if(difference.type == "CREATE") {
					const name = difference.value.name;
					for(const [key, value] of indices.entries()) {
						// We don't need to increment the indices.
						// Since CREATE is always at the back.
						if(key != "" && !key.split("|").includes(name)) continue;
						value.push(index);
					}
				}
				if(difference.type == "REMOVE") {
					for(const [key, value] of indices.entries()) {
						// DELETE always follow to the end.
						let nextIndex = value.findIndex(i => i >= index);
						if(nextIndex == -1) nextIndex = value.length;
						value.splice(nextIndex);
					}
				}
			}
			if(path.length == 2) {
				if(difference.type == "CHANGE") {
					const oldName = difference.value.oldName;
					const name = difference.value.name;
					if(name != oldName) {
						for(const [key, value] of indices.entries()) {
							if(key == "")
								continue;
							if(key.split("|").includes(oldName)) {
								const index = value.findIndex(i => i == index);
								value.splice(index, 1);
							}
							if(key.split("|").includes(name)) {
								let nextIndex = value.findIndex(i => i >= index);
								if(nextIndex == -1) nextIndex = value.length;
								value.splice(nextIndex, 0, index);
							}
						}
					}
				}
			}
		}
	}
	function forEach<NAME extends NAMES[]>(name: NAME, modifiers: Array<TYPES>, callback: (v: FILTER<TYPES, NAME[number]>, i: number) => boolean | unknown) {
		let indices: Map<string, Array<number>> = (modifiers as any).indices;
		if(!indices) indices = defineIndices(modifiers);
		let nameIndices = indices.get(name.join("|"));
		if(nameIndices) {
			for(const index of nameIndices) {
				const modifier = modifiers[index];
				const result = callback(modifier as unknown as FILTER<TYPES, NAME[number]>, index);
				if(result) return;
			}
			return;
		}
		nameIndices = [];
		indices.set(name.join("|"), nameIndices);
		let resolved = false;
		for(let i = 0; i < modifiers.length; i++) {
			const modifier = modifiers[i];
			if(name.length > 0 && !name.includes(modifier.name as NAMES)) continue;
			nameIndices.push(i);
			if(resolved) continue;
			const result = callback(modifier as unknown as FILTER<TYPES, NAME[number]>, i);
			if(result) resolved = true;
		}

	}
	function forEachReverse<NAME extends NAMES[]>(name: NAME, modifiers: Array<TYPES>, callback: (v: FILTER<TYPES, NAME[number]>, i: number) => boolean | unknown) {
		let indices: Map<string, Array<number>> = (modifiers as any).indices;
		if(!indices) indices = defineIndices(modifiers);
		let nameIndices = indices.get(name.join("|"));
		if(nameIndices) {
			for(let i = nameIndices.length - 1; i >= 0; i--) {
				const index = nameIndices[i];
				const modifier = modifiers[index];
				const result = callback(modifier as unknown as FILTER<TYPES, NAME[number]>, index);
				if(result) return;
			}
			return;
		}
		nameIndices = [];
		indices.set(name.join("|"), nameIndices);
		let resolved = false;
		for(let i = modifiers.length - 1; i >= 0; i--) {
			const modifier = modifiers[i];
			if(name.length > 0 && !name.includes(modifier.name as NAMES)) continue;
			nameIndices.unshift(i);
			if(resolved) continue;
			const result = callback(modifier as unknown as FILTER<TYPES, NAME[number]>, i);
			if(result) resolved = true;
		}

	}
	function filter<NAME extends NAMES[]>(name: NAME, modifiers: Array<TYPES>, callback: (v: FILTER<TYPES, NAME[number]>, i: number) => boolean = () => true) {
		const result = [] as FILTER<TYPES, NAME[number]>[];
		forEach(name, modifiers, (modifier, index) => {
			if(!callback(modifier, index)) return;
			result.push(modifier);
		});
		return result;
	}
	function map<NAME extends NAMES[], T>(name: NAME, modifiers: Array<TYPES>, callback: (v: FILTER<TYPES, NAME[number]>, i: number) => T) {
		const result = [] as T[];
		forEach(name, modifiers, (modifier, index) => {
			result.push(callback(modifier, index));
		});
		return result;
	}
	function findIndex<NAME extends NAMES[]>(name: NAME, modifiers: Array<TYPES>, callback: (v: FILTER<TYPES, NAME[number]>, i: number) => boolean | unknown = () => true) {
		let result = -1;
		forEach(name, modifiers, (modifier, index) => {
			if(!callback(modifier, index))
				return false;
			result = index;
			return true;
		});
		return result;
	}
	function findLastIndex<NAME extends NAMES[]>(name: NAME, modifiers: Array<TYPES>, callback: (v: FILTER<TYPES, NAME[number]>, i: number) => boolean | unknown = () => true) {
		let result = -1;
		forEachReverse(name, modifiers, (modifier, index) => {
			if(!callback(modifier, index))
				return false;
			result = index;
			return true;
		});
		return result;
	}
	function find<NAME extends NAMES[]>(name: NAME, modifiers: Array<TYPES>, callback: (v: FILTER<TYPES, NAME[number]>, i: number) => boolean | unknown = () => true) {
		return modifiers[findIndex(name, modifiers, callback)] as FILTER<TYPES, NAME[number]>;
	}
	function findLast<NAME extends NAMES[]>(name: NAME, modifiers: Array<TYPES>, callback: (v: FILTER<TYPES, NAME[number]>, i: number) => boolean | unknown = () => true) {
		return modifiers[findLastIndex(name, modifiers, callback)] as FILTER<TYPES, NAME[number]>;
	}
	function add<NAME extends NAMES[]>(modifiers: Array<TYPES>, modifier: TYPES, index: number = Infinity) {
		let indices: Map<string, Array<number>> = (modifiers as any).indices;
		if(!indices) indices = defineIndices(modifiers);
		index = Math.max(0, Math.min(modifiers.length, index));
		modifiers.splice(index, 0, modifier);
		const name = modifier.name;
		for(const [key, value] of indices.entries()) {
			let nextIndex = value.findIndex(i => i >= index);
			if(nextIndex == -1) nextIndex = value.length;
			for(let i = nextIndex; i < value.length; i++)
				value[i]++;
			if(key != "" && !key.split("|").includes(name)) continue;
			value.splice(nextIndex, 0, index);
		}
	}
	function remove<NAME extends NAMES[]>(modifiers: Array<TYPES>, index: number) {
		let indices: Map<string, Array<number>> = (modifiers as any).indices;
		if(!indices) indices = defineIndices(modifiers);
		const [modifier] = modifiers.splice(index, 1);
		if(modifier == null) return false;
		const name = modifier.name;
		for(const [key, value] of indices.entries()) {
			let nextIndex = value.findIndex(i => i >= index);
			if(nextIndex == -1) nextIndex = value.length;
			for(let i = nextIndex; i < value.length; i++)
				value[i]--;
			if(key != "" && !key.split("|").includes(name)) continue;
			value.splice(nextIndex, 1);
		}
	}
	function upsert<NAME extends NAMES>(name: NAME, modifiers: Array<TYPES>, callback: (v: FILTER<TYPES, NAME[number]>, i: number, c: boolean) => boolean | unknown) {
		let found = null;
		findLast([name], modifiers, (modifier, index) => {
			const result = callback(modifier, index, false);
			if(!result) return;
			found = modifier;
			return true;
		});
		if(found) return found;
		const modifier = { name: name, value: null } as any;
		const result = callback(modifier, -1, true);
		if(!result) return;
		add(modifiers, modifier);
		return modifier;
	}
	return {
		defineIndices,
		patchIndices,
		forEach,
		forEachReverse,
		filter,
		map,
		findIndex,
		findLastIndex,
		find,
		findLast,
		add,
		remove,
		upsert
	};
}
export const genericEditor = modifierEditor<any>();
export const userModifierEditor = modifierEditor<UserModifiers>();
export const clamatMinerModifierEditor = modifierEditor<CLamatMinerModifiers>();
export const clamatModuleModifierEditor = modifierEditor<CLamatModuleModifiers>();
export const clamatBrokerModifierEditor = modifierEditor<CLamatBrokerModifiers>();
export const clamatNodeModifierEditor = modifierEditor<CLamatNodeModifiers>();
export const clamatSessionModifierEditor = modifierEditor<CLamatSessionModifiers>();
