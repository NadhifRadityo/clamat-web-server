"use client";

import React from "react";
import Link from "next/link";
import { useRouter, useSelectedLayoutSegment } from "next/navigation";
import { signOut } from "next-auth/react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { cn, sleep } from "@/utils/utils";

function MainNav({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
	const selectedLayoutSegment = useSelectedLayoutSegment();
	return (
		<nav className={cn("flex items-center space-x-4 lg:space-x-6", className)} {...props}>
			<Link
				href="/dashboard/overview"
				className={`text-sm font-medium transition-colors hover:text-primary ${selectedLayoutSegment != "overview" ? "text-muted-foreground" : ""}`}
			>
				Overview
			</Link>
			<Link
				href="/dashboard/surveillance"
				className={`text-sm font-medium transition-colors hover:text-primary ${selectedLayoutSegment != "surveillance" ? "text-muted-foreground" : ""}`}
			>
				Surveillance
			</Link>
			<Link
				href="/dashboard/management"
				className={`text-sm font-medium transition-colors hover:text-primary ${selectedLayoutSegment != "management" ? "text-muted-foreground" : ""}`}
			>
				Management
			</Link>
		</nav>
	);
}
function UserNav() {
	const router = useRouter();
	const { toast } = useToast();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" className="relative h-8 w-8 rounded-full">
					<Avatar className="h-8 w-8">
						<AvatarFallback>SC</AvatarFallback>
					</Avatar>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-56" align="end" forceMount>
				<DropdownMenuLabel>
					<p className="text-sm font-medium leading-none">admin</p>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem>Change Password</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					className="hover:!bg-destructive/90 hover:!text-destructive-foreground"
					onClick={async event => {
						event.preventDefault();
						const toast1 = toast({
							title: "Signing you out..."
						});
						try {
							const response = await signOut({ redirect: false });
							if (!response)
								throw new Error("Error occured");
							toast1.dismiss();
							const toast2 = toast({
								title: "Signed out!"
							});
							await sleep(1000);
							toast2.dismiss();
							router.push("/login");
						} catch (error) {
							toast1.dismiss();
							toast({
								title: `Error while signing you out!`,
								description: error.message
							});
						}
					}}
				>Sign out</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export default function Navbar() {
	return (
		<div className="border-b">
			<div className="flex h-16 items-center px-4">
				<MainNav className="mx-6" />
				<div className="ml-auto flex items-center space-x-4">
					<UserNav />
				</div>
			</div>
		</div>
	);
}
