import { redirect } from "next/navigation";
import { getServerSession } from "./api/auth/[...nextauth]/route";

export default async function Page() {
	const session = await getServerSession();
	if (session == null)
		return redirect("/login");
	return redirect("/dashboard/overview");
}
