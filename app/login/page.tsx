import { getServerSession } from "next-auth";
import Login from "./page.login";
import { redirect } from "next/navigation";

export default async function Page() {
	const session = await getServerSession();
	if (session != null)
		return redirect("/dashboard/overview");
	return (
		<Login />
	);
}
