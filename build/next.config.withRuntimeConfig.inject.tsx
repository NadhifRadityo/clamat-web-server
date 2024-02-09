import React from "react";
import getConfig from "next/config";
import { ignoreToJson, jsonEvalStringify, jsonEvalStringify0Client } from "./next.config.withRuntimeConfig.shared";

export default function RuntimeConfig() {
	const { publicRuntimeConfig } = getConfig();
	const renderedRuntimeConfig = JSON.stringify({
		publicRuntimeConfig: { __NEXT_RUNTIME_CONFIG__: jsonEvalStringify(ignoreToJson(publicRuntimeConfig), jsonEvalStringify0Client) }
	});

	return (
		<script
			id="__NEXT_RUNTIME_CONFIG__"
			type="application/json"
			dangerouslySetInnerHTML={{ __html: renderedRuntimeConfig }}
		></script>
	);
}
