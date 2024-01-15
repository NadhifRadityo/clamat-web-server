"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CursorArrowIcon, EyeOpenIcon, Link1Icon, LinkBreak2Icon } from "@radix-ui/react-icons";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from "recharts";

const data = new Array(60).fill(null).map((_, i) => ({ name: ` ${i + 1}`.substr(-2), total: Math.floor(Math.random() * 4000) + 2000 }));

export default function Page() {
	return (
		<div className="flex-1 space-y-4 p-8 pt-6">
			<div className="flex items-center justify-between space-y-2">
				<h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
			</div>
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Endpoint Servers</CardTitle>
						<LinkBreak2Icon className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">3 Servers</div>
						<p className="text-xs text-muted-foreground">1 Primary - 2 Backup</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Receiver Nodes</CardTitle>
						<Link1Icon className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">8 Nodes</div>
						<p className="text-xs text-muted-foreground">7 Active — 1 Inactive</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Packets</CardTitle>
						<CursorArrowIcon className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">521 p/s</div>
						<p className="text-xs text-muted-foreground">↑ 31 p/s ↓ 490 p/s</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Active Surveillances</CardTitle>
						<EyeOpenIcon className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">3 Surveillances</div>
						<p className="text-xs text-muted-foreground">21 Inactive</p>
					</CardContent>
				</Card>
			</div>
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
				<Card className="col-span-4">
					<CardHeader>
						<CardTitle>Overview</CardTitle>
						<CardDescription>Packets each minute.</CardDescription>
					</CardHeader>
					<CardContent className="pl-2">
						<ResponsiveContainer width="100%" height={350}>
							<BarChart data={data}>
								<XAxis
									dataKey="name"
									stroke="#888888"
									fontSize={12}
									tickLine={false}
									axisLine={false}
								/>
								<YAxis
									stroke="#888888"
									fontSize={12}
									tickLine={false}
									axisLine={false}
								/>
								<Bar dataKey="total" fill="#adfa1d" radius={[4, 4, 0, 0]} />
							</BarChart>
						</ResponsiveContainer>
					</CardContent>
				</Card>
				<Card className="col-span-3">
					<CardHeader>
						<CardTitle>Recent Surveillances</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-8">
							<div className="space-y-1">
								<p className="text-sm font-medium leading-none">Kenari Zulkarnain</p>
								<p className="text-sm text-muted-foreground">Active →</p>
							</div>
							<div className="space-y-1">
								<p className="text-sm font-medium leading-none">Ismail Najmudin</p>
								<p className="text-sm text-muted-foreground">Active →</p>
							</div>
							<div className="space-y-1">
								<p className="text-sm font-medium leading-none">Aswani Mandala</p>
								<p className="text-sm text-muted-foreground">Active →</p>
							</div>
							<div className="space-y-1">
								<p className="text-sm font-medium leading-none">Prakosa Nainggolan</p>
								<p className="text-sm text-muted-foreground">Inactive</p>
							</div>
							<div className="space-y-1">
								<p className="text-sm font-medium leading-none">Rahmat Pradipta</p>
								<p className="text-sm text-muted-foreground">Inactive</p>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
