import React from "react";
import Navbar from "./layout.navbar";

export default function Layout({ children }: { children?: React.ReactNode }) {
	return (
		<div className="flex flex-col">
			<Navbar />
			{children}
		</div>
	);
}
