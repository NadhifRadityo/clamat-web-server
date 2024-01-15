"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

import DarkModeButton from "@/components/DarkModeButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { sleep } from "@/utils/utils";

export default function Login() {
	const router = useRouter();
	const { toast } = useToast();
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");

	return (
		<div className="w-full h-screen flex justify-center items-center">
			<form
				className="w-full max-w-xl"
				onSubmit={async event => {
					event.preventDefault();
					const toast1 = toast({
						title: "Signing you in..."
					});
					try {
						const response = await signIn("credentials", {
							username: username,
							password: password,
							redirect: false,
							callbackUrl: "/"
						});
						if (!response.ok || response.error != null)
							throw new Error(response.error || "Invalid username or password");
						toast1.dismiss();
						const toast2 = toast({
							title: "Signed in!"
						});
						await sleep(1000);
						toast2.dismiss();
						router.push("/dashboard/overview");
					} catch (error) {
						toast1.dismiss();
						toast({
							title: `Error while signing you in!`,
							description: error.message
						});
					}
				}}
			>
				<Card>
					<div className="flex flex-row flex-nowrap justify-between">
						<CardHeader className="w-full">
							<CardTitle>Sign in</CardTitle>
							<CardDescription>Sign in to C-Lamat admin dashboard.</CardDescription>
						</CardHeader>
						<CardHeader>
							<DarkModeButton />
						</CardHeader>
					</div>
					<CardContent>
						<div className="grid w-full items-center gap-4">
							<div className="flex flex-col space-y-1.5">
								<Label htmlFor="username">Username</Label>
								<Input id="username" value={username} onChange={e => setUsername(e.target.value)} />
							</div>
							<div className="flex flex-col space-y-1.5">
								<Label htmlFor="password">Password</Label>
								<Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
							</div>
						</div>
					</CardContent>
					<CardFooter className="flex justify-between">
						<div></div>
						<Button type="submit">Sign in</Button>
					</CardFooter>
				</Card>
			</form>
		</div>
	);
}
