"use client";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/utils/utils";
import Link from "next/link";
import { usePathname } from "next/navigation"

interface SidebarNavProps extends React.HTMLAttributes<HTMLElement> {
	items: {
		href: string
		title: string
	}[]
}

export function SidebarNav({ className, items, ...props }: SidebarNavProps) {
	const pathname = usePathname();

	return (
		<nav
			className={cn("flex space-x-2 lg:flex-col lg:space-x-0 lg:space-y-1", className)}
			{...props}
		>
			{items.map((item) => (
				<Link
					key={item.href}
					href={item.href}
					className={cn(
						buttonVariants({ variant: "ghost" }),
						pathname === item.href ?
							"bg-muted hover:bg-muted" :
							"hover:bg-transparent hover:underline",
						"justify-start"
					)}
				>
					{item.title}
				</Link>
			))}
		</nav>
	)
}

export default function Layout({ children }: { children?: React.ReactNode }) {
	return (
		<div className="flex-1 space-y-4 p-8 pt-6">
			<div className="flex items-center justify-between space-y-2">
				<h2 className="text-3xl font-bold tracking-tight">Management</h2>
			</div>
			<div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
				<aside className="-mx-4 lg:w-1/5">
					<SidebarNav items={[
						{
							title: "Modules",
							href: "/dashboard/management/modules"
						},
						{
							title: "Nodes",
							href: "/dashboard/management/nodes"
						},
						{
							title: "Brokers",
							href: "/dashboard/management/brokers"
						},
						{
							title: "Servers",
							href: "/dashboard/management/servers"
						},
						{
							title: "Clients",
							href: "/dashboard/management/clients"
						}
					]} />
				</aside>
				<div className="flex-1 lg:max-w-2xl">{children}</div>
			</div>
		</div>
	);
}
