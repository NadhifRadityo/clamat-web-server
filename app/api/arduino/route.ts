import Comlink from "comlink";
import { sendServerSentEventsResponse } from "@/utils/serverSentEventsResponse";
import { NextRequest, NextResponse } from "next/server";
import { readBodyTemp, readEcg, readEnvHumid, readEnvTemp, readOxy, construct, destruct } from "./logic.server.worker";

export async function GET(request: NextRequest) {
	const properties = request.nextUrl.searchParams.get("property").split(",");
	const sseEntries = [] as Array<(push: (v: { event: string, data: any }) => void) => Promise<() => Promise<void>>>;
	for (const property of properties) {
		if (property == "construct") {
			await construct();
			return new NextResponse(null, { status: 200 });
		} else if (property == "destruct") {
			await destruct();
			return new NextResponse(null, { status: 200 });
		} else if (property == "ecg") {
			sseEntries.push(async (push) =>
				await readEcg(Comlink.transfer(v => push({ event: "ecg", data: v })))
			);
		} else if (property == "oxy") {
			sseEntries.push(async (push) =>
				await readOxy(Comlink.transfer(v => push({ event: "oxy", data: v })))
			);
		} else if (property == "bodytemp") {
			sseEntries.push(async (push) =>
				await readBodyTemp(Comlink.transfer(v => push({ event: "bodytemp", data: v })))
			);
		} else if (property == "envtemp") {
			sseEntries.push(async (push) =>
				await readEnvTemp(Comlink.transfer(v => push({ event: "envtemp", data: v })))
			);
		} else if (property == "envhumid") {
			sseEntries.push(async (push) =>
				await readEnvHumid(Comlink.transfer(v => push({ event: "envhumid", data: v })))
			);
		} else
			return new NextResponse(null, { status: 400 });
	}
	return sendServerSentEventsResponse((async function* () {
		const buffer = [] as Array<{ event: string, data: any }>;
		let unlock = null as () => void;
		const push = (v: { event: string, data: any }) => {
			buffer.push(v);
			if (unlock == null) return;
			unlock(); unlock = null;
		}
		const cleanups = await Promise.all(sseEntries.map(e => e(push)));
		try {
			while (true) {
				while (buffer.length == 0)
					await new Promise(res => unlock = () => res(null));
				let value: { event: string, data: any };
				while ((value = buffer.shift()))
					yield { event: value.event, data: { timestamp: Date.now(), value: value.data } };
			}
		} finally {
			await Promise.all(cleanups.map(c => c()));
		}
	})())
}
