module.exports = {
	extends: [
		"eslint:recommended",
		"fbjs-opensource",
		"next"
	],
	rules: {
		"comma-dangle": ["warn", "never"],
		"curly": ["warn", "multi-or-nest"],
		"eqeqeq": "off",
		"object-shorthand": "off",
		"no-return-assign": "off",
		"indent": ["warn", "tab", { SwitchCase: 1 }],
		"jsx-quotes": ["warn", "prefer-double"],
		"max-len": ["warn", 160, { tabWidth: 4, ignoreUrls: true }],
		"require-await": "off",
		"no-tabs": "off",
		"object-curly-spacing": ["warn", "always"],
		"keyword-spacing": ["warn", {
			after: true,
			overrides: {
				if: { after: false },
				for: { after: false },
				while: { after: false },
				catch: { after: false },
				switch: { after: false }
			}
		}],
		"quotes": ["warn", "double", { avoidEscape: true, allowTemplateLiterals: true }],
		"no-useless-constructor": "off",
		"no-unused-vars": "off",
		"no-bitwise": "off",
		"import/no-anonymous-default-export": "off",
		"react/jsx-indent": ["warn", "tab"],
		"react/jsx-indent-props": ["warn", "tab"],
		"react/self-closing-comp": "off",
		"react/jsx-closing-bracket-location": ["warn", "line-aligned"],
		"@next/next/no-html-link-for-pages": ["error", "app/"],
		"no-useless-return": "off"
	},
	$schema: "https://json.schemastore.org/eslintrc.json"
};
