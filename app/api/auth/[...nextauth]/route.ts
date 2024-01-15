import NextAuth, { NextAuthOptions, Session as DefaultSession, getServerSession as getServerSession0 } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "../../prisma/client";
import { compare } from "bcrypt";

export const authOptions: NextAuthOptions = {
	session: {
		strategy: "jwt"
	},
	providers: [
		CredentialsProvider({
			name: "Credentials",
			credentials: {
				username: { label: "Username" },
				password: { label: "Password", type: "password" }
			},
			async authorize(credentials) {
				if(credentials.username == null || credentials.password == null)
					throw new Error("Missing username or password");
				const user = await prisma.user.findFirst({ where: { username: credentials.username } });
				if(user == null || !(await compare(credentials.password, user.password)))
					throw new Error("Invalid username or password");
				return {
					id: user.id,
					name: user.username,
					email: user.username
				};
			}
		})
	]
};

export type Session = (typeof authOptions) extends { session: (...args: any[]) => infer U } ? U : DefaultSession;
export async function getServerSession() { return getServerSession0(authOptions); }

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
