import { createRequire } from "module";
export const newRequire = path => createRequire(path);

import * as constants from "next/constants.js";
export { constants };

import * as Log from "next/dist/build/output/log.js";
export { Log };

import debug from "next/dist/compiled/debug/index.js";
export { debug };
