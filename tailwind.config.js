/* eslint-disable max-len */
const plugin = require("tailwindcss/plugin");

/** @type {import('tailwindcss').Config} */
module.exports = {
	darkMode: ["class"],
	content: [
		"./app/**/*.{ts,tsx,js,jsx}",
		"./components/**/*.{ts,tsx,js,jsx}"
	],
	important: "html",
	theme: {
		fontFamily: {
			sans: ["WatDaFawkCarl", "sans-serif"]
		},
		container: {
			center: true,
			padding: "2rem",
			screens: {
				"2xl": "1400px"
			}
		},
		extend: {
			colors: {
				border: "hsl(var(--border))",
				input: "hsl(var(--input))",
				ring: "hsl(var(--ring))",
				background: "hsl(var(--background))",
				foreground: "hsl(var(--foreground))",
				primary: {
					DEFAULT: "hsl(var(--primary))",
					foreground: "hsl(var(--primary-foreground))"
				},
				secondary: {
					DEFAULT: "hsl(var(--secondary))",
					foreground: "hsl(var(--secondary-foreground))"
				},
				destructive: {
					DEFAULT: "hsl(var(--destructive))",
					foreground: "hsl(var(--destructive-foreground))"
				},
				muted: {
					DEFAULT: "hsl(var(--muted))",
					foreground: "hsl(var(--muted-foreground))"
				},
				accent: {
					DEFAULT: "hsl(var(--accent))",
					foreground: "hsl(var(--accent-foreground))"
				},
				popover: {
					DEFAULT: "hsl(var(--popover))",
					foreground: "hsl(var(--popover-foreground))"
				},
				card: {
					DEFAULT: "hsl(var(--card))",
					foreground: "hsl(var(--card-foreground))"
				},
				transitionTimingFunction: {
					DEFAULT: "cubic-bezier(0.28, 0.12, 0.22, 1)"
				},
				transitionDuration: {
					...Object.fromEntries(new Array(20).fill().map((_, i) => (i + 1) * 50).map(v => [`${v}`, `${v}ms`]))
				},
				transitionDelay: {
					...Object.fromEntries(new Array(20).fill().map((_, i) => (i + 1) * 50).map(v => [`${v}`, `${v}ms`]))
				},
				gridTemplateColumns: {
					...Object.fromEntries(new Array(20).fill().map((_, i) => i).map(v => [`${v + 1}`, `repeat(${v + 1}, minmax(0, 1fr))`]))
				},
				gridColumnStart: {
					...Object.fromEntries(new Array(30).fill().map((_, i) => i).map(v => [`${v + 1}`, `${v + 1}`]))
				},
				gridColumnEnd: {
					...Object.fromEntries(new Array(30).fill().map((_, i) => i).map(v => [`${v + 1}`, `${v + 1}`]))
				},
				gridColumn: {
					...Object.fromEntries(new Array(30).fill().map((_, i) => i).map(v => [`span-${v + 1}`, `span ${v + 1} / span ${v + 1}`]))
				},
				gridRow: {
					...Object.fromEntries(new Array(30).fill().map((_, i) => i).map(v => [`span-${v + 1}`, `span ${v + 1} / span ${v + 1}`]))
				},
				width: {
					...Object.fromEntries(new Array(20).fill().map((_, i) => i).map(v => new Array(v + 2).fill().map((_, i) => [`${i}/${v + 1}`, `${(i * 100) / (v + 1).toFixed(3)}%`])).reduce((a, v) => [...a, ...v], []))
				},
				height: {
					...Object.fromEntries(new Array(20).fill().map((_, i) => i).map(v => new Array(v + 2).fill().map((_, i) => [`${i}/${v + 1}`, `${(i * 100) / (v + 1).toFixed(3)}%`])).reduce((a, v) => [...a, ...v], []))
				},
				maxWidth: {
					...Object.fromEntries(new Array(20).fill().map((_, i) => i).map(v => new Array(v + 2).fill().map((_, i) => [`${i}/${v + 1}`, `${(i * 100) / (v + 1).toFixed(3)}%`])).reduce((a, v) => [...a, ...v], []))
				},
				maxHeight: {
					...Object.fromEntries(new Array(20).fill().map((_, i) => i).map(v => new Array(v + 2).fill().map((_, i) => [`${i}/${v + 1}`, `${(i * 100) / (v + 1).toFixed(3)}%`])).reduce((a, v) => [...a, ...v], []))
				},
				aspectRatio: {
					...Object.fromEntries(new Array(20).fill().map((_, i) => i).map(v => new Array(v + 2).fill().map((_, i) => [[`${i}/${v + 1}`, `${(i)}/${(v + 1)}`], [`${v + 1}/${i}`, `${v + 1}/${i}`]])).reduce((a, v) => [...a, ...v.reduce((a, v) => [...a, ...v], [])], []))
				},
				inset: {
					...Object.fromEntries(new Array(20).fill().map((_, i) => i).map(v => new Array(v + 2).fill().map((_, i) => [`${i}/${v + 1}`, `${(i * 100) / (v + 1).toFixed(3)}%`])).reduce((a, v) => [...a, ...v], []))
				},
				margin: {
					...Object.fromEntries(new Array(20).fill().map((_, i) => i).map(v => new Array(v + 2).fill().map((_, i) => [`${i}/${v + 1}`, `${(i * 100) / (v + 1).toFixed(3)}%`])).reduce((a, v) => [...a, ...v], []))
				},
				padding: {
					...Object.fromEntries(new Array(20).fill().map((_, i) => i).map(v => new Array(v + 2).fill().map((_, i) => [`${i}/${v + 1}`, `${(i * 100) / (v + 1).toFixed(3)}%`])).reduce((a, v) => [...a, ...v], []))
				},
				fontSize: {
					"10xl": "10.5rem",
					"11xl": "13rem",
					"12xl": "15rem"
				},
				content: {
					empty: "''"
				}
			},
			borderRadius: {
				lg: "var(--radius)",
				md: "calc(var(--radius) - 2px)",
				sm: "calc(var(--radius) - 4px)"
			},
			keyframes: {
				"accordion-down": {
					from: { height: 0 },
					to: { height: "var(--radix-accordion-content-height)" }
				},
				"accordion-up": {
					from: { height: "var(--radix-accordion-content-height)" },
					to: { height: 0 }
				}
			},
			animation: {
				"accordion-down": "accordion-down 0.2s ease-out",
				"accordion-up": "accordion-up 0.2s ease-out"
			}
		}
	},
	plugins: [
		require("tailwindcss-animate"),
		plugin(({ addUtilities }) => {
			addUtilities({
				".drag-none": {
					"-webkit-user-drag": "none",
					"-khtml-user-drag": "none",
					"-moz-user-drag": "none",
					"-o-user-drag": "none",
					"user-drag": "none"
				}
			});
		})
	]
};
