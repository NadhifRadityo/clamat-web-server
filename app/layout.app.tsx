"use client";

import React from "react";
import { SessionProvider } from "next-auth/react";
import ThemeProvider from "@/components/ThemeProvider";
import { Toaster } from "@/components/ui/toaster";
import { Session } from "./api/auth/[...nextauth]/route";

export default function Element({ children, session }: { children?: React.ReactNode, session: Session }) {
	return (
		<SessionProvider session={session}>
			<ThemeProvider
				attribute="class"
				defaultTheme="system"
				enableSystem
				disableTransitionOnChange
			>
				<main>
					{children}
				</main>
				<Toaster />
			</ThemeProvider>
		</SessionProvider>
	);
}
