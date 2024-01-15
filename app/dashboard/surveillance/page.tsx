"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CursorArrowIcon, EyeOpenIcon, Link1Icon, LinkBreak2Icon } from "@radix-ui/react-icons";
import { Group } from '@visx/group'
import { LinePath } from '@visx/shape'
import { curveMonotoneY, curveBasis } from '@visx/curve'
import { scaleLinear } from '@visx/scale'
import { Text } from '@visx/text'
import React, { SVGProps, useCallback, useLayoutEffect, useRef, useState } from "react";

const ECGGraph = React.forwardRef<SVGSVGElement>((props: SVGProps<SVGSVGElement>, ref) => {
	const data = "81,83,88,98,92,85,73,71,70,83,73,79,84,78,67,71,76,77,64,53,0,41,51,3,31,37,35,48,40,42,42,32,21,41,48,47,45,42,28,15,1,-12,-4,15,23,22,40,46,49,48,43,52,49,44,41,41,45,57,67,65,58,47,34,35,23,11,7,14,23,18,31,35,44,49,34,7,-3,-8,-11,-20,-28,-4,15,20,26,26,24,34,35,30,22,12,15,18,24,18,26,25,13,2,1,-10,-10,-4,8,15,15,15,15,18,19,3,-12,-14,-10,-22,-24,-29,-21,-19,-26,-9,-10,-6,-8,-31,-52,-57,-40,-20,7,14,10,6,12,-5,-2,9,23,36,52,61,56,48,48,38,29,33,20,1,-7,-9,-4,-12,-3,5,-3,12,6,-10,-2,15,17,21,22,15,16,1,-2,-9,-16,-18,-15,-4,0,-1,-1,-3,-12,-15,-13,-16,-29,-34,-28,-29,-27,-25,-25,-33,-38,-36,-12,-7,-20,-21,-14,-7,7,14,18,28,27,38,33,24,20,15,6,0,-2,2,0,-2,-12,-10,20,41,35,27,12,-1,-15,-20,-23,0,24,36,52,61,67,73,88,85,71,74,67,41,26,13,10,1,-10,-26,-33,-23,-25,-24,-24,-28,-24,-25,-21,-8,-5,-4,-13,-29,-42,-52,-52,-40,-40,-34,-28,-30,-37,-40,-38,-41,-39,-46,-48,-48,-40,-40,-45,-57,-61,-63,-78,-81,-87,-82,-88,-100,-100,-97,-104,-102,-79,-72,-72,-63,-35,-22,-10,2,5,9,-10,-16,-16,-10,-4,-1,2,14,21,23,17,13,10,0,-6,-5,11,22,28,31,33,29,26,27,28,26,35,44,52,80,100,101,111,120,128,150,174,201,232,278,350,422,510,580,662,738,806,869,907,939,954,971,961,912,826,713,553,382,166,-56,-275,-518,-824,-1122,-1325,-1453,-1507,-1547,-1568,-1559,-1553,-1537,-1499,-1447,-1424,-1398,-1352,-1291,-1189,-1085,-977,-852,-736,-649,-603,-576,-454,-443,-332,-264,-209,-153,-105,-61,-16,37,96,150,198,238,265,294,324,351,367,376,378,391,406,427,433,448,440,429,429,420,413,420,411,408,404,398,401,412,389,367,357,359,351,345,341,345,346,340,334,323,319,314,284,263,261,248,234,236,236,248,252,251,237,230,238,227,207,188,163,155,152,153,156,171,162,155,148,139,154,158,155,159,147,143,133,118,118,121,130,133,133,128,120,97,91,88,85,84,74,44,32,10,-2,-9,-4,-5,1,5,21,41,44,39,24,22,37,44,35,31,35,20,15,7,4,9,0,-15,-21,-31,-32,-48,-53,-29,-14,-6,1,4,-4,-3,2,1,-12,-37,-29,-25,-18,-31,-42,-26,-22,-18,-25,-16,-13,-23,-15,0,8,14,34,39,33,22,18,20,23,16,11,1,6,11,7,14,22,14,14,5,-6,-14,-27,-28,-21,-16,-8,-5,-8,3,22,29,27,23,22,25,34,36,39,44,55,54,44,39,41,49,44,33,27,23,20,18,20,19,8,7,2,4,-3,-16,-16,-19,-28,-37,-26,-14,-31,-45,-45,-43,-50,-59,-73,-79,-88,-92,-95,-101,-104,-124,-150,-152,-153,-174,-205,-215,-211,-214,-211,-222,-218,-211,-200,-200,-196,-184,-189,-202,-203,-202,-200,-205,-211,-226,-241,-242,-252,-273,-279,-288,-291,-289,-286,-269,-266,-280,-287,-277,-260,-271,-269,-271,-287,-299,-297,-288,-287,-287,-289,-287,-286,-276,-271,-266,-260,-252,-236,-223,-215,-213,-224,-230,-220,-209,-207,-194,-182,-181,-186,-189,-186,-174,-167,-161,-158,-155,-153,-139,-135,-130,-129,-116,-107,-98,-84,-85,-92,-100,-105,-97,-81,-72,-58,-49,-35,-33,-28,-13,-7,-9,-6,10,22,16,5,-12,-12,1,6,17,41,52,54,57,63,81,96,107,118,133,123,121,129,128,127,112,89,0,123,42,98,109,109,108,113,121,119,119,114,112,109,107,105,114,122,130,134,121,113,100,94,114,112,108,116,114,112,118,119,116,109,110,108,113,116,118,107,103,109,110,103,106,104,93,86,77,83,87,80,95,100,88,102,87,77,88,81,71,59,61,67,76,91,94,93,89,94,98,103,95,83,89,88,96,97,97,92,88,86,84,84,76,65,52,45,47,36,33,46,46,57,53,52,56,61,64,65,59,55,60,59,61,55,51,48,46,49,47,46,44,43,46,47,45,28,17,20,24,22,38,29,23,23,9,1,15,32,38,37,38,31,18,11,5,5,-1,-6,-8,-6,5,14,8,21,35,35,32,26,28,26,24,23,28,26,27,23,32,30,19,16,25,32,20,12,8,7,14,14,11,15,4,-5,-3,-3,-11,-2,18,11,-2,1,-9,-21,-13,-16,-4,15,31,55,52,35,23,24,20,19,18,13,6,7,12,12,3,2,-4,-11,-12,-9,-17,-6,1,-2,-6,-18,-17,-14,-13,-11,9,9,2,-2,-14,-27,-24,-16,-10,-3,2,7,16,29,40,47,46,30,19,20,21,22,12,0,-6,-6,-11,-9,-5,-9,-15,-18,-21,-19,-27,-31,-32,-35,-31,-26,-26,-19,-6,0,-3,-16,-16,-3,5,13,6,9,18,40,54,64,68,57,47,41,41,50,54,35,33,33,27,26,19,16,28,44,38,42,57,61,65,55,45,33,21,11,5,-14,-30,-35,-31,-32,-33,-25,-19,-18,-30,-42,-38,-44,-49,-43,-41,-30,-26,-29,-33,-53,-58,-58,-45,-37,-39,-51,-50,-52,-53,-36,-27,-29,-24,-27,-34,-46,-49,-42,-50,-49,-50,-42,-35,-24,-33,-40,-36,-37,-38,-51,-61,-67,-75,-81,-70,-66,-71,-72,-57,-48,-40,-31,0,31,-63,-16,-22,-30,-36,-37,-42,-40,-47,-38,-5,2,-9,-2,7,11,12,22,26,29,21,25,32,35,36,48,74,79,78,92,108,120,143,172,201,232,285,363,447,514,573,663,754,815,859,895,940,977,972,945,898,808,686,532,360,167,-33,-232,-472,-766,-1082,-1295,-1438,-1509,-1567,-1594,-1583,-1569,-1547,-1504,-1457,-1432,-1403,-1335,-1249,-1157,-1058,-957,-835,-733,-650,-567,-508,-446,-378,-304,-240,-180,-123,-63,-11,46,112,181,221,256,283,318,348,371,397,410,409,424,440,443,429,420,424,429,415,394,391,402,410,410,408,408,405,399,392,383,376,375,368,366,363,353,345,334,326,317,313,320,318,300,275,262,252,239,236,231,236,240,235,222,220,223,228,222,205,197,191,180,185,174,170,166,161,151,148,142,136,131,127,118,111,114,110,97,85,72,65,61,62,64,61,59,56,64,55,56,73,63,56,54,35,12,-3,-2,-9,-15,-13,1,27,48,53,55,54,27,20,14,10,3,9,21,15,9,5,0,0,-1,3,4,2,-4,-5,-12,-14,-20,-23,-21,-20,-28,-25,-25,-30,-34,-43,-39,-36,-44,-28,-22,-11,-12,-7,-14,-11,-13,-19,-19,-13,4,19,16,19,21,22,5,-12,-27,-24,-16,-15,-2,8,-1,-7,-1,12,26,27,32,27,19,22,30,36,38,43,46,40,35,27,24,23,16,7,7,11,16,10,6,3,3,12,12,8,5,4,4,4,12,22,9,0,-6,-23,-25,-25,-31,-45,-51,-50,-46,-55,-59,-60,-63,-62,-62,-63,-75,-85,-92,-94,-87,-85,-77,-91,-106,-114,-121,-133,-146,-159,-168,-167,-179,-190,-200,-205,-210,-213,-210,-217,-219,-225,-239,-246,-257,-276,-298,-297,-305,-312,-305,-300,-312,-321,-318,-306,-302,-296,-297,-294,-287,-290,-301,-310,-312,0,-265,-362,-303,-302,-293,-296,-295,-286,-291,-287,-268,-243,-231,-229,-228,-229,-236,-243,-242,-217,-206,-199,-189,-187,-178,-163,-152,-150,-149,-144,-137,-121,-119,-132,-126,-123,-104,-96,-97,-82,-56,-42,-47,-40,-33,-37,-43,-51,-51,-35,-19,-12,-11,-9,-2,12,24,24,32,42,39,45,55,43,42,45,46,51,58,61,57,55,46,29,23,24,21,27,45,56,79,102,103,114,129,116,112,127,130,135,143,144,157,153,140,135,129,111,103,106,108,94,96,89,85,89,94,82"
		.split(",").map(s => parseInt(s, 10));

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
	const xScale = scaleLinear({
		domain: [0, data.length],
		range: [0, currentWidth.current - xPadding]
	});
	const yScale = scaleLinear({
		domain: [Math.min(...data), Math.max(...data)],
		range: [currentHeight.current - yPadding, 0]
	});

	return (
		<svg ref={refCallback} {...props}>
			<Group left={xPadding / 2} top={yPadding / 2}>
				<LinePath
					data={data}
					x={(_, i) => xScale(i)}
					y={d => yScale(d)}
					stroke={'white'}
					strokeWidth={2.5}
					curve={curveBasis}
				/>
			</Group>
		</svg>
	);
});

export default function Page() {
	return (
		<div className="flex-1 space-y-4 p-8 pt-6">
			<div className="flex items-center justify-between space-y-2">
				<h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
			</div>
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<Card className="col-span-3">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Profile</CardTitle>
						<LinkBreak2Icon className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent className="grid gap-4 grid-cols-3">
						<div>
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
						<Tabs defaultValue="medical-history" className="space-y-4">
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
						<div>
							<img className="aspect-[3/4] w-1/2 mx-auto object-contain rounded-md border-[1px] border-solid border-muted-foreground" src={"https://www.random-name-generator.com/images/faces/male-asia/04.jpg"} />
						</div>
					</CardContent>
				</Card>
				<Card className="overflow-hidden">
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
						<ECGGraph className="w-[calc(100%_+_3rem)] h-64 -m-[1.5rem] -mt-[3rem] bg-gradient-to-tr from-blue-600 to-blue-500" />
					</CardContent>
				</Card>
				<Card className="overflow-hidden">
					<CardHeader className="relative">
						<div className="absolute inset-0 h-[300%] p-6 bg-gradient-to-b from-black/50 to-black/0 z-10 pointer-events-none">
							<CardTitle className="text-sm font-medium text-white pointer-events-auto inline">Body Temperature</CardTitle>
						</div>
					</CardHeader>
					<CardContent className="w-full h-full">
						<ECGGraph className="w-[calc(100%_+_3rem)] h-64 -m-[1.5rem] -mt-[3rem] bg-gradient-to-tr from-orange-600 to-orange-300" />
					</CardContent>
				</Card>
				<Card className="overflow-hidden">
					<CardHeader className="relative">
						<div className="absolute inset-0 h-[300%] p-6 bg-gradient-to-b from-black/50 to-black/0 z-10 pointer-events-none">
							<CardTitle className="text-sm font-medium text-white pointer-events-auto inline">Ambient Temperature</CardTitle>
						</div>
					</CardHeader>
					<CardContent className="w-full h-full">
						<ECGGraph className="w-[calc(100%_+_3rem)] h-64 -m-[1.5rem] -mt-[3rem] bg-gradient-to-tr from-amber-600 to-amber-300" />
					</CardContent>
				</Card>
				<Card className="overflow-hidden">
					<CardHeader className="relative">
						<div className="absolute inset-0 h-[300%] p-6 bg-gradient-to-b from-black/50 to-black/0 z-10 pointer-events-none">
							<CardTitle className="text-sm font-medium text-white pointer-events-auto inline">Ambient Humidity</CardTitle>
						</div>
					</CardHeader>
					<CardContent className="w-full h-full">
						<ECGGraph className="w-[calc(100%_+_3rem)] h-64 -m-[1.5rem] -mt-[3rem] bg-gradient-to-tr from-slate-600 to-slate-300" />
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
