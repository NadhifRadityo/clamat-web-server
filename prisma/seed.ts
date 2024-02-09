/* eslint-disable no-console */
/* eslint-disable no-await-in-loop */
import path from "path";
import doetenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcrypt";

doetenv.config({ path: path.join(process.cwd(), `.env.${process.env.NODE_ENV}`) });
const prisma = new PrismaClient();

async function main() {
	await prisma.user.upsert({
		where: { username: "admin" },
		update: {},
		create: {
			username: "admin",
			password: await hash("admin", 12)
		}
	});
}

main()
	.then(async () => {
		await prisma.$disconnect();
	})
	.catch(async e => {
		console.error(e);
		await prisma.$disconnect();
		process.exit(1);
	});
