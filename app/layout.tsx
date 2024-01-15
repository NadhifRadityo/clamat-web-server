import React from "react";
import getConfig from "next/config";

import favicon16x16 from "./_static/favicons/favicon-16x16.ico";
import favicon32x32 from "./_static/favicons/favicon-32x32.ico";
import favicon96x96 from "./_static/favicons/favicon-96x96.ico";
import favicon128x128 from "./_static/favicons/favicon-128x128.ico";
import favicon192x192 from "./_static/favicons/favicon-192x192.ico";
import favicon196x196 from "./_static/favicons/favicon-196x196.ico";
import favicon256x256 from "./_static/favicons/favicon-256x256.ico";
import favicon512x512 from "./_static/favicons/favicon-512x512.png";
import faviconApple57x57 from "./_static/favicons/favicon-apple-57x57.png";
import faviconApple60x60 from "./_static/favicons/favicon-apple-60x60.png";
import faviconApple72x72 from "./_static/favicons/favicon-apple-72x72.png";
import faviconApple76x76 from "./_static/favicons/favicon-apple-76x76.png";
import faviconApple114x114 from "./_static/favicons/favicon-apple-114x114.png";
import faviconApple120x120 from "./_static/favicons/favicon-apple-120x120.png";
import faviconApple144x144 from "./_static/favicons/favicon-apple-144x144.png";
import faviconApple152x152 from "./_static/favicons/favicon-apple-152x152.png";
import faviconApple167x167 from "./_static/favicons/favicon-apple-167x167.png";
import faviconApple180x180 from "./_static/favicons/favicon-apple-180x180.png";
import faviconMstile70x70 from "./_static/favicons/favicon-mstile-70x70.png";
import faviconMstile144x144 from "./_static/favicons/favicon-mstile-144x144.png";
import faviconMstile150x150 from "./_static/favicons/favicon-mstile-150x150.png";
import faviconMstile310x310 from "./_static/favicons/favicon-mstile-310x310.png";

import "./layout.scss";
import App from "./layout.app";
import { getServerSession } from "./api/auth/[...nextauth]/route";

const { publicRuntimeConfig } = getConfig();

export const metadata = {
	metadataBase: publicRuntimeConfig.PROJECT_WEB_ORIGIN,
	generator: "Next.js",
	applicationName: "Website Link Shortener SMA Negeri 3 Malang",
	title: {
		default: "Link Shortener • SMA Negeri 3 Malang",
		template: "%s • Link Shortener • SMA Negeri 3 Malang"
	},
	description: "",
	creator: "SMA Negeri 3 Malang",
	publisher: "SMA Negeri 3 Malang",
	authors: [
		{ name: "SMA Negeri 3 Malang", url: "https://sman3-malang.sch.id" }
	],
	openGraph: {
		title: {
			default: "Link Shortener • SMA Negeri 3 Malang",
			template: "%s • Link Shortener • SMA Negeri 3 Malang"
		},
		description: ""
	},
	twitter: {
		title: {
			default: "Link Shortener • SMA Negeri 3 Malang",
			template: "%s • Link Shortener • SMA Negeri 3 Malang"
		},
		description: ""
	},

	colorScheme: "light",
	themeColor: "#ff0000",
	viewport: {
		width: "device-width",
		initialScale: 1,
		maximumScale: 6
	},
	icons: {
		icon: [
			{ url: favicon16x16.src, sizes: "16x16", type: "image/x-icon" },
			{ url: favicon32x32.src, sizes: "32x32", type: "image/x-icon" },
			{ url: favicon96x96.src, sizes: "96x96", type: "image/x-icon" },
			{ url: favicon128x128.src, sizes: "128x128", type: "image/x-icon" },
			{ url: favicon192x192.src, sizes: "192x192", type: "image/x-icon" },
			{ url: favicon196x196.src, sizes: "196x196", type: "image/x-icon" },
			{ url: favicon256x256.src, sizes: "256x256", type: "image/x-icon" },
			{ url: favicon512x512.src, sizes: "512x512", type: "image/png" }
		],
		apple: [
			{ url: faviconApple57x57.src, size: "57x57" },
			{ url: faviconApple60x60.src, size: "60x60" },
			{ url: faviconApple72x72.src, size: "72x72" },
			{ url: faviconApple76x76.src, size: "76x76" },
			{ url: faviconApple114x114.src, size: "114x114" },
			{ url: faviconApple120x120.src, size: "120x120" },
			{ url: faviconApple144x144.src, size: "144x144" },
			{ url: faviconApple152x152.src, size: "152x152" },
			{ url: faviconApple167x167.src, size: "167x167" },
			{ url: faviconApple180x180.src, size: "180x180" }
		]
	},
	other: {
		"msapplication-TileColor": "#ff0000",
		"msapplication-TileImage": faviconMstile144x144.src,
		"msapplication-square70x70logo": faviconMstile70x70.src,
		"msapplication-square144x144logo": faviconMstile144x144.src,
		"msapplication-square150x150logo": faviconMstile150x150.src,
		"msapplication-square310x310logo": faviconMstile310x310.src
	}
};

export default async function Layout({ children }: { children?: React.ReactNode }) {
	const session = await getServerSession();
	return (
		<html>
			<head>
			</head>
			<body>
				<App session={session}>
					{children}
				</App>
			</body>
		</html>
	);
}
