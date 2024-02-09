export const finalizerSymbol: unique symbol;
export const endpointSymbol: unique symbol;
export const getSymbol: unique symbol;
export const setSymbol: unique symbol;
export const applySymbol: unique symbol;
export const constructSymbol: unique symbol;
export const createEndpointSymbol: unique symbol;
export const releaseEndpointSymbol: unique symbol;
export const isEndpointClosedSymbol: unique symbol;
export const asyncSymbol: unique symbol;
export const syncSymbol: unique symbol;

export type ComlinkEndpoint = {
	start?: () => void;
	close?: () => void;
	addEventListener: (type: string, callback: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean) => void;
	removeEventListener: (type: string, callback: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean) => void;
	dispatchEvent: (event: Event) => boolean;
	postMessage: (payload: any, transferables: any[]) => void;
	postMessageSync: (payload: any, transferables: any[]) => any;
}
export type ComlinkTransferObject<T> = T & { readonly __transferred__?: unique symbol };
export type ComlinkAsyncObject<T> = 
	("__transferred__" extends keyof T ?
		ComlinkAsyncObject<Omit<T, "__transferred__">> :
		T extends (...args: infer ARGS) => infer RETURN ? 
			(...args: ARGS) => ("__transferred__" extends keyof RETURN ? ComlinkAsyncObject<RETURN> : Promise<RETURN>) : 
			T extends (string | number | symbol | bigint | boolean) ?
				Promise<T> :
				{ [K in keyof T]: ComlinkAsyncObject<T[K]> }
	) & {
		[getSymbol]: "__transferred__" extends keyof T ? ComlinkAsyncObject<T> : Promise<Awaited<T>>;
		[setSymbol]: Awaited<T>;
		[applySymbol]: T extends (...args: infer ARGS) => infer RETURN ? 
			(...args: ARGS) => ("__transferred__" extends keyof RETURN ? ComlinkAsyncObject<RETURN> : Promise<RETURN>) : never;
		[constructSymbol]: T extends ({ new (...args: infer ARGS): infer RETURN }) ?
			({ new (...args: ARGS): ("__transferred__" extends keyof RETURN ? ComlinkAsyncObject<RETURN> : Promise<RETURN>) }) : never;
		[createEndpointSymbol]: () => ComlinkAsyncObject<T>;
		[releaseEndpointSymbol]: () => Promise<void>;
		[isEndpointClosedSymbol]: () => boolean;
		[asyncSymbol]: ComlinkAsyncObject<T>;
		[syncSymbol]: ComlinkSyncObject<T>;
		[finalizerSymbol]: () => void;
		[endpointSymbol]: any;
	}
export type ComlinkSyncObject<T> = 
	("__transferred__" extends keyof T ?
		never :
		T extends (...args: infer ARGS) => infer RETURN ? 
			(...args: ARGS) => ("__transferred__" extends keyof RETURN ? never : RETURN) : 
			T extends (string | number | symbol | bigint | boolean) ?
				T :
				{ [K in keyof T]: ComlinkSyncObject<T[K]> }
	) & {
		[getSymbol]: "__transferred__" extends keyof T ? never : Awaited<T>;
		[setSymbol]: "__transferred__" extends keyof T ? never : Awaited<T>;
		[applySymbol]: T extends (...args: infer ARGS) => infer RETURN ? 
			(...args: ARGS) => ("__transferred__" extends keyof RETURN ? never : RETURN) : never;
		[constructSymbol]: T extends ({ new (...args: infer ARGS): infer RETURN }) ?
			({ new (...args: ARGS): ("__transferred__" extends keyof RETURN ? never : RETURN) }) : never;
		[createEndpointSymbol]: never;
		[releaseEndpointSymbol]: void;
		[isEndpointClosedSymbol]: () => boolean;
		[asyncSymbol]: ComlinkAsyncObject<T>;
		[syncSymbol]: ComlinkSyncObject<T>;
		[finalizerSymbol]: () => void;
		[endpointSymbol]: any;
	}
export type ComlinkObject<T> = ComlinkAsyncObject<T>;

export const transferCache: WeakSet<ComlinkTransferObject<any>>;
export function transfer<T>(object: T): ComlinkTransferObject<T>;
export function findTransferable(object: any, checked?: Set<any>, transferables?: Set<ComlinkTransferObject<T>>): Set<ComlinkTransferObject<T>>;

export function exposeEndpoint<T>(object: T, endpoint: ComlinkEndpoint): void;
export function wrapEndpoint<T>(endpoint: ComlinkEndpoint, sync?: boolean = true, path?: string[] = []): ComlinkAsyncObject<T>;
export function wrapEndpoint<T>(endpoint: ComlinkEndpoint, sync: false, path: string[]): ComlinkAsyncObject<T>;
export function wrapEndpoint<T>(endpoint: ComlinkEndpoint, sync: true, path: string[]): ComlinkSyncObject<T>;
export function isProxyClosed(proxy: ComlinkAsyncObject<any> | ComlinkSyncObject<any>): boolean;
