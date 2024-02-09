import React from "react";
import Navbar from "./layout.navbar";
import { getServerSession } from "../api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";

export default async function Layout({ children }: { children?: React.ReactNode }) {
	const session = await getServerSession();
	if (session == null)
		return redirect("/login");
	return (
		<div className="flex flex-col">
			<Navbar />
			{children}
		</div>
	);
}
