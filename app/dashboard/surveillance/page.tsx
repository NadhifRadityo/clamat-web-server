"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CursorArrowIcon, EyeOpenIcon, Link1Icon, LinkBreak2Icon } from "@radix-ui/react-icons";
import { Group } from '@visx/group'
import { LinePath } from '@visx/shape'
import { curveMonotoneY, curveBasis } from '@visx/curve'
import { scaleLinear } from '@visx/scale'
import { Text } from '@visx/text'
import React, { SVGProps, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

const nummap = (v: number, a: number, b: number, x: number, y: number) => (v - a) / (b - a) * (y - x) + x;
const ECGGraph = React.forwardRef((props: SVGProps<SVGSVGElement> & { timestamp: number[], data: number[], min?: number, max?: number }, ref: React.ForwardedRef<SVGSVGElement>) => {
	const { timestamp, data } = props;
	if (timestamp.length != data.length)
		throw new Error("Timestamp length must be the same as data length");
	const nonNanDataSegments = useMemo(() => {
		const result = [] as Array<number[] & { start: number }>;
		let current = [] as number[] & { start: number };
		for (let i = 0; i < data.length; i++) {
			const value = data[i];
			if (!isNaN(value)) {
				if (current.start == null)
					current.start = i;
				current.push(value);
				continue;
			}
			if (current.length == 0)
				continue;
			result.push(current);
			current = [] as any;
		}
		if (current.length > 0)
			result.push(current);
		return result;
	}, [data.join()]);
	const propsMin = props.min;
	const propsMax = props.max;
	const propsWidth = parseInt(props.width as any, 10);
	const propsHeight = parseInt(props.height as any, 10);

	const [_, __rerender__] = useState(0);
	const rerender = useCallback(() => __rerender__(v => v + 1), []);
	const currentElement = useRef<SVGSVGElement>();
	const currentResizeObserver = useRef<ResizeObserver>();
	const currentWidth = useRef(propsWidth || 0);
	const currentHeight = useRef(propsHeight || 0);

	useLayoutEffect(() => {
		let changed = false;
		if (!isNaN(propsWidth)) {
			currentWidth.current = propsWidth;
			changed = true;
		}
		if (!isNaN(propsHeight)) {
			currentHeight.current = propsHeight;
			changed = true;
		}
		if (changed)
			rerender();
	}, [propsWidth, propsHeight]);

	const refCallback = useCallback((element: SVGSVGElement) => {
		if (currentResizeObserver.current != null)
			currentResizeObserver.current.disconnect();
		if (element != null) {
			currentElement.current = element;
			currentResizeObserver.current = new ResizeObserver(() => {
				let changed = false;
				if (isNaN(propsWidth)) {
					currentWidth.current = element.clientWidth;
					changed = true;
				}
				if (isNaN(propsHeight)) {
					currentHeight.current = element.clientHeight;
					changed = true;
				}
				if (changed)
					rerender();
			});
			currentResizeObserver.current.observe(element);
		} else {
			currentElement.current = null;
			currentResizeObserver.current = null;
			let changed = false;
			if (isNaN(propsWidth)) {
				currentWidth.current = NaN;
				changed = true;
			}
			if (isNaN(propsHeight)) {
				currentHeight.current = NaN;
				changed = true;
			}
			if (changed)
				rerender();
		}
		if (typeof ref == "function")
			ref(element);
		else if (ref != null)
			ref.current = element;
	}, [propsWidth, propsHeight]);

	const xPadding = 100;
	const yPadding = 150;
	const xScale = (i: number) => {
		const firstNonNan = timestamp.find(v => !isNaN(v));
		const lastNonNan = timestamp.findLast(v => !isNaN(v));
		const floorTs = timestamp[Math.floor(i)];
		const ceilTs = timestamp[Math.ceil(i)];
		const interTs = nummap(i % 1, 0, 1, floorTs, ceilTs);
		const result = nummap(interTs, firstNonNan, lastNonNan, 0, currentWidth.current - xPadding);
		return isNaN(result) ? 0 : result;
	}
	const [yMin, yMax] = useMemo(() => {
		const nonNan = data.filter(v => !isNaN(v));
		return [Math.min(...nonNan), Math.max(...nonNan)] as const;
	}, [data.join()]);
	const yScale = (v: number) => {
		return nummap(v, !isNaN(propsMin) ? propsMin : yMin, !isNaN(propsMax) ? propsMax : yMax, currentHeight.current - yPadding, 0);
	}

	return (
		<svg ref={refCallback} {...props}>
			<Group left={xPadding / 2} top={yPadding / 2}>
				{nonNanDataSegments.map(d => (
					<Group left={xScale(d.start)}>
						<LinePath
							data={d}
							x={(_, i) => xScale(d.start + i)}
							y={d => yScale(d)}
							stroke={'white'}
							strokeWidth={2.5}
							curve={curveBasis}
						/>
					</Group>
				))}
			</Group>
		</svg>
	);
});

export default function Page() {

	const __new_structure__ = (capacity: number) => {
		const result = {
			timestamp: new Array(capacity).fill(NaN),
			values: new Array(capacity).fill(NaN),
			push: null as (ts: number, v: number) => void
		};
		result.push = (ts, v) => {
			result.timestamp.push(ts);
			if (result.timestamp.length >= capacity)
				result.timestamp.shift();
			result.values.push(v);
			if (result.values.length >= capacity)
				result.values.shift();
		};
		return result;
	};
	const [__render__, __set_rerender__] = useState(0);
	const rerender = () => __set_rerender__(v => v + 1);
	const ecgData = useMemo(() => __new_structure__(150), []);
	const oxyData = useMemo(() => __new_structure__(150), []);
	const bodyTempData = useMemo(() => __new_structure__(150), []);
	const envTempData = useMemo(() => __new_structure__(150), []);
	const envHumidData = useMemo(() => __new_structure__(150), []);
	useLayoutEffect(() => {
		const eventSource = new EventSource("/api/arduino?property=ecg,oxy,bodytemp,envtemp,envhumid");
		eventSource.addEventListener("ecg", e => {
			const data = JSON.parse(e.data);
			ecgData.push(data.timestamp, data.value);
			rerender();
		});
		eventSource.addEventListener("oxy", e => {
			const data = JSON.parse(e.data);
			oxyData.push(data.timestamp, data.value);
			rerender();
		});
		eventSource.addEventListener("bodytemp", e => {
			const data = JSON.parse(e.data);
			bodyTempData.push(data.timestamp, data.value);
			rerender();
		});
		eventSource.addEventListener("envtemp", e => {
			const data = JSON.parse(e.data);
			envTempData.push(data.timestamp, data.value);
			rerender();
		});
		eventSource.addEventListener("envhumid", e => {
			const data = JSON.parse(e.data);
			envHumidData.push(data.timestamp, data.value);
			rerender();
		});
		return () => {
			eventSource.close();
		}
	}, []);

	return (
		<div className="flex-1 space-y-4 p-8 pt-6">
			<div className="flex items-center justify-between space-y-2">
				<h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
			</div>
			<div className="grid gap-4 grid-cols-4">
				<Card className="col-span-4 lg:col-span-3">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Profile</CardTitle>
						<LinkBreak2Icon className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent className="grid gap-4 grid-cols-[7fr_3fr] lg:grid-cols-[3fr_3fr_2fr]">
						<div className="col-start-1 col-end-2 row-start-1 row-end-2">
							<div className="text-2xl font-bold pb-2">Kenari Zulkarnain</div>
							<table className="text-md">
								<tbody>
									<tr><td className="font-semibold pr-8">Date of Birth</td><td>: 2 January 1983</td></tr>
									<tr><td className="font-semibold pr-8">Age</td><td>: 42 years <span className="text-xs text-muted-foreground">2 months</span></td></tr>
									<tr><td className="font-semibold pr-8">Gender</td><td>: Male</td></tr>
									<tr><td className="font-semibold pr-8">Occupation</td><td>: Underground Miner</td></tr>
									<tr><td className="font-semibold pr-8">Contact Information</td><td>: (+62) 428 4893 946</td></tr>
									<tr><td className="font-semibold pr-8">Height</td><td>: 177cm</td></tr>
									<tr><td className="font-semibold pr-8">Weight</td><td>: 71kg</td></tr>
								</tbody>
							</table>
						</div>
						<Tabs defaultValue="medical-history" className="col-start-1 col-end-2 row-start-2 row-end-3 lg:col-start-2 lg:col-end-3 lg:row-start-1 lg:row-end-2 space-y-4">
							<TabsList>
								<TabsTrigger value="medical-history">Medical History</TabsTrigger>
								<TabsTrigger value="family-history">Family History</TabsTrigger>
								<TabsTrigger value="social-history">Social History</TabsTrigger>
							</TabsList>
							<TabsContent value="medical-history" className="space-y-4">
								<table className="text-md">
									<tbody>
										<tr><td className="font-semibold pr-8">Blood Type</td><td className="-indent-[10px]">: AB-</td></tr>
										<tr><td className="font-semibold pr-8">Allergies</td><td className="-indent-[10px]">: Cetirizine, Levocetirizine</td></tr>
										<tr><td className="font-semibold pr-8">Chronic Conditions</td><td className="-indent-[10px]">: None Reported</td></tr>
										<tr><td className="font-semibold pr-8">Previous Surgeries</td><td className="-indent-[10px]">: None Reported</td></tr>
										<tr><td className="font-semibold pr-8">Medications</td><td className="-indent-[10px]">: None Reported</td></tr>
										<tr><td className="font-semibold pr-8">Immunizations</td><td className="-indent-[10px]">: Up-to-date</td></tr>
									</tbody>
								</table>
							</TabsContent>
							<TabsContent value="family-history" className="space-y-4">
								<table className="text-md">
									<tbody>
										<tr><td className="font-semibold pr-8">Genetic Conditions</td><td className="-indent-[10px]">: No known family history of genetic disorders</td></tr>
										<tr><td className="font-semibold pr-8">Chronic Illnesses</td><td className="-indent-[10px]">: No significant family history of chronic illnesses</td></tr>
										<tr><td className="font-semibold pr-8">Cancer</td><td className="-indent-[10px]">: No known family history of cancer</td></tr>
									</tbody>
								</table>
							</TabsContent>
							<TabsContent value="social-history" className="space-y-4">
								<table className="text-md">
									<tbody>
										<tr><td className="font-semibold pr-8">Occupation</td><td className="-indent-[10px]">: Underground Miner</td></tr>
										<tr><td className="font-semibold pr-8">Work Environment</td><td className="-indent-[10px]">: Exposure to dust, noise, and potential hazards</td></tr>
										<tr><td className="font-semibold pr-8">Smoking</td><td className="-indent-[10px]">: Non-smoker</td></tr>
										<tr><td className="font-semibold pr-8">Alcohol Use</td><td className="-indent-[10px]">: Occasional social drinking</td></tr>
										<tr><td className="font-semibold pr-8">Recreational Drug Use</td><td className="-indent-[10px]">: None reported</td></tr>
										<tr><td className="font-semibold pr-8">Physical Activity</td><td className="-indent-[10px]">: Regular physical activity, including work-related exercise</td></tr>
									</tbody>
								</table>
							</TabsContent>
						</Tabs>
						<div className="col-start-2 col-end-3 row-start-1 row-end-2 lg:col-start-3 lg:col-end-4 lg:row-start-1 lg:row-end-2">
							<img className="aspect-[3/4] w-2/3 lg:w-1/2 mx-auto object-contain rounded-md border-[1px] border-solid border-muted-foreground" src={"https://www.random-name-generator.com/images/faces/male-asia/04.jpg"} />
						</div>
					</CardContent>
				</Card>
				<Card className="col-span-4 lg:col-span-1 h-full min-h-[320px] overflow-hidden">
					<CardHeader className="relative">
						<div className="absolute inset-0 h-[300%] p-6 bg-gradient-to-b from-black/50 to-black/0 z-10 pointer-events-none">
							<CardTitle className="text-lg font-medium text-white pointer-events-auto inline">Location</CardTitle>
						</div>
					</CardHeader>
					<CardContent className="w-full h-full">
						<iframe
							loading="lazy"
							referrerPolicy="no-referrer-when-downgrade"
							src="https://www.google.com/maps/embed?pb=!1m16!1m12!1m3!1d13771.49221094654!2d137.12499972176136!3d-4.043203228644635!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!2m1!1sgrasberg%20mine!5e1!3m2!1sen!2sid!4v1705288363443!5m2!1sen!2sid"
							className="border-none w-[calc(100%_+_3rem)] h-[calc(100%_+_3rem_+_300px)] -translate-y-[20%] -m-[1.5rem] -mt-[3rem]"
						/>
					</CardContent>
				</Card>
			</div>
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<Card className="overflow-hidden">
					<CardHeader className="relative">
						<div className="absolute inset-0 h-[300%] p-6 bg-gradient-to-b from-black/50 to-black/0 z-10 pointer-events-none">
							<CardTitle className="text-sm font-medium text-white pointer-events-auto inline">ECG</CardTitle>
						</div>
					</CardHeader>
					<CardContent className="w-full h-full">
						<ECGGraph
							timestamp={ecgData.timestamp}
							data={ecgData.values}
							className="w-[calc(100%_+_3rem)] h-64 -m-[1.5rem] -mt-[3rem] bg-gradient-to-tr from-blue-600 to-blue-500"
						/>
					</CardContent>
				</Card>
				<Card className="overflow-hidden">
					<CardHeader className="relative">
						<div className="absolute inset-0 h-[300%] p-6 bg-gradient-to-b from-black/50 to-black/0 z-10 pointer-events-none">
							<CardTitle className="text-sm font-medium text-white pointer-events-auto inline">Body Temperature</CardTitle>
						</div>
					</CardHeader>
					<CardContent className="w-full h-full">
						<ECGGraph
							timestamp={oxyData.timestamp}
							data={oxyData.values}
							className="w-[calc(100%_+_3rem)] h-64 -m-[1.5rem] -mt-[3rem] bg-gradient-to-tr from-orange-600 to-orange-300"
						/>
					</CardContent>
				</Card>
				<Card className="overflow-hidden">
					<CardHeader className="relative">
						<div className="absolute inset-0 h-[300%] p-6 bg-gradient-to-b from-black/50 to-black/0 z-10 pointer-events-none">
							<CardTitle className="text-sm font-medium text-white pointer-events-auto inline">Ambient Temperature</CardTitle>
						</div>
					</CardHeader>
					<CardContent className="w-full h-full">
						<ECGGraph
							timestamp={envTempData.timestamp}
							data={envTempData.values}
							min={25}
							max={50}
							className="w-[calc(100%_+_3rem)] h-64 -m-[1.5rem] -mt-[3rem] bg-gradient-to-tr from-amber-600 to-amber-300"
						/>
					</CardContent>
				</Card>
				<Card className="overflow-hidden">
					<CardHeader className="relative">
						<div className="absolute inset-0 h-[300%] p-6 bg-gradient-to-b from-black/50 to-black/0 z-10 pointer-events-none">
							<CardTitle className="text-sm font-medium text-white pointer-events-auto inline">Ambient Humidity</CardTitle>
						</div>
					</CardHeader>
					<CardContent className="w-full h-full">
						<ECGGraph
							timestamp={envHumidData.timestamp}
							data={envHumidData.values}
							min={0}
							max={100}
							className="w-[calc(100%_+_3rem)] h-64 -m-[1.5rem] -mt-[3rem] bg-gradient-to-tr from-slate-600 to-slate-300"
						/>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
