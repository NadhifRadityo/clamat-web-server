/* eslint-disable no-console */
/* eslint-disable no-await-in-loop */
import path from "path";
import doetenv from "dotenv";
import { hash } from "bcrypt";

doetenv.config({ path: path.join(process.cwd(), `.env.${process.env.NODE_ENV}`) });
import { prisma } from "./client";
import { MinerModifiers, UserModifiers } from "./types";

async function main() {
	await prisma.user.upsert({
		where: { username: "admin" },
		update: {},
		create: {
			username: "admin",
			password: await hash("admin", 12),
			modifiers: [
				{
					name: "IsOperator",
					value: true
				}
			] as UserModifiers[] as any
		}
	});
	await prisma.user.upsert({
		where: { username: "kenari" },
		update: {},
		create: {
			username: "kenari",
			password: await hash("kenari", 12),
			modifiers: [
				{
					name: "Miner",
					value: "5ee24871-9e59-4d39-a298-ed08276f826f"
				}
			] as UserModifiers[] as any
		}
	});
	await prisma.miner.upsert({
		where: { id: "5ee24871-9e59-4d39-a298-ed08276f826f" },
		update: {},
		create: {
			id: "5ee24871-9e59-4d39-a298-ed08276f826f",
			name: "Kenari Zulkarnain",
			birthdate: new Date("23 March 1982"),
			gender: true,
			modifiers: [
				{
					name: "Occupation",
					value: "Underground Miner"
				},
				{
					name: "Contact",
					value: {
						name: "Self",
						contact: "(+62) 428 4893 946"
					}
				},
				{
					name: "MedicalHistory",
					value: {
						weight: 71,
						height: 177,
						bloodType: "AB-",
						allergies: "Cetirizine, Levocetirizine",
						chronicConditions: "None Reported",
						previousSurgeries: "None Reported",
						medications: "None Reported",
						immunizations: "Up-to-date",
					}
				},
				{
					name: "FamilyHistory",
					value: {
						geneticConditions: "No known family history of genetic disorders",
						chronicIllnesses: "No significant family history of chronic illnesses",
						cancer: "No known family history of cancer",
					}
				},
				{
					name: "SocialHistory",
					value: {
						smoking: "Non-smoker",
						alcoholUse: "Occasional social drinking",
						recreationalDrugUse: "None reported",
						physicalActivity: "Regular physical activity, including work-related exercise"
					}
				}
			] as MinerModifiers[] as any
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
