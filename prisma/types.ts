import { StructProperties } from "@/app/api/clamat/logic.shared";

export interface Modifier {
	name: string;
	value?: any;
}

export interface UserModifier extends Modifier { }
export interface UserModifierIsOperator extends UserModifier {
	name: "IsOperator",
	value: boolean;
}
export interface UserModifierMiner extends UserModifier {
	name: "Miner";
	value: string;
}
export type UserModifiers = UserModifierIsOperator | UserModifierMiner;

export interface CLamatMinerModifier extends Modifier { }
export interface CLamatMinerModifierOccupation extends CLamatMinerModifier {
	name: "Occupation";
	value: string;
}
export interface CLamatMinerModifierContact extends CLamatMinerModifier {
	name: "Contact";
	value: {
		name: string;
		contact: string;
	};
}
export interface CLamatMinerModifierMedicalHistory extends CLamatMinerModifier {
	name: "MedicalHistory";
	value: {
		weight: number;
		height: number;
		bloodType: string;
		allergies: string;
		chronicConditions: string;
		previousSurgeries: string;
		medications: string;
		immunizations: string;
	}
}
export interface CLamatMinerModifierFamilyHistory extends CLamatMinerModifier {
	name: "FamilyHistory";
	value: {
		geneticConditions: string;
		chronicIllnesses: string;
		cancer: string;
	}
}
export interface CLamatMinerModifierSocialHistory extends CLamatMinerModifier {
	name: "SocialHistory";
	value: {
		smoking: string;
		alcoholUse: string;
		recreationalDrugUse: string;
		physicalActivity: string;
	}
}
export type CLamatMinerModifiers = CLamatMinerModifierOccupation | CLamatMinerModifierContact | CLamatMinerModifierMedicalHistory | CLamatMinerModifierFamilyHistory | CLamatMinerModifierSocialHistory;

export interface CLamatModuleModifier extends Modifier { }
export interface CLamatModuleNodeOptionDefinitionModifier extends CLamatModuleModifier {
	name: "NodeOptionDefinition",
	value: {
		name: string;
		title: string;
		type: string;
		defaultValue?: any;
		description?: string;
	}
}
export interface CLamatModuleBrokerOptionDefinitionModifier extends CLamatModuleModifier {
	name: "BrokerOptionDefinition",
	value: {
		name: string;
		title: string;
		type: string;
		defaultValue?: any;
		description: string;
	}
}
export interface CLamatModuleServerOptionDefinitionModifier extends CLamatModuleModifier {
	name: "ServerOptionDefinition",
	value: {
		name: string;
		title: string;
		type: string;
		defaultValue?: any;
		description: string;
	}
}
export interface CLamatModuleClientOptionDefinitionModifier extends CLamatModuleModifier {
	name: "ClientOptionDefinition",
	value: {
		name: string;
		title: string;
		type: string;
		defaultValue?: any;
		description: string;
	}
}
export interface CLamatModuleNodeBrokerPacketDefintionModifier extends CLamatModuleModifier {
	name: "NodeBrokerPacketDefintion",
	value: {
		name: string;
		command: number;
		properties: StructProperties;
	}
}
export interface CLamatModuleNodeServerPacketDefintionModifier extends CLamatModuleModifier {
	name: "NodeServerPacketDefintion",
	value: {
		name: string;
		command: number;
		properties: StructProperties;
	}
}
export interface CLamatModuleBrokerServerPacketDefintionModifier extends CLamatModuleModifier {
	name: "BrokerServerPacketDefintion",
	value: {
		name: string;
		command: number;
		properties: StructProperties;
	}
}
export interface CLamatModuleServerClientPacketDefintionModifier extends CLamatModuleModifier {
	name: "ServerClientPacketDefintion",
	value: {
		name: string;
		command: number;
		properties: StructProperties;
	}
}
export interface CLamatModuleNodeSourceCodeModifier extends CLamatModuleModifier {
	name: "NodeSourceCode",
	value: string; // (node: CLamatNode) => string
}
export interface CLamatModuleBrokerSourceCodeModifier extends CLamatModuleModifier {
	name: "BrokerSourceCode",
	value: string; // (broker: CLamatBroker) => string
}
export interface CLamatModuleServerSourceCodeModifier extends CLamatModuleModifier {
	name: "ServerSourceCode",
	value: string; // () => string, handles 2 callback, node packets and broker packets
}
export interface CLamatModuleClientSourceCodeModifier extends CLamatModuleModifier {
	name: "ClientSourceCode",
	value: string; // () => string
}
export type CLamatModuleModifiers =
	CLamatModuleNodeOptionDefinitionModifier | CLamatModuleBrokerOptionDefinitionModifier | CLamatModuleServerOptionDefinitionModifier | CLamatModuleClientOptionDefinitionModifier |
	CLamatModuleNodeBrokerPacketDefintionModifier | CLamatModuleNodeServerPacketDefintionModifier | CLamatModuleBrokerServerPacketDefintionModifier | CLamatModuleServerClientPacketDefintionModifier |
	CLamatModuleNodeSourceCodeModifier | CLamatModuleBrokerSourceCodeModifier | CLamatModuleServerSourceCodeModifier | CLamatModuleClientSourceCodeModifier;

export interface CLamatBrokerModifier extends Modifier { }
export interface CLamatBrokerModuleModifier extends CLamatBrokerModifier {
	name: "Module";
	value: string; // refer to module id
}
export interface CLamatBrokerModuleOptionModifier extends CLamatBrokerModifier {
	name: "ModuleOption",
	value: {
		module: string; // refer to module name
		id: string;
		value: any;
	}
}
export type CLamatBrokerModifiers = CLamatBrokerModuleModifier | CLamatBrokerModuleOptionModifier;

export interface CLamatNodeModifier extends Modifier { }
export interface CLamatNodeModuleModifier extends CLamatNodeModifier {
	name: "Module";
	value: string; // refer to module id
}
export interface CLamatNodeModuleOptionModifier extends CLamatNodeModifier {
	name: "ModuleOption",
	value: {
		module: string; // refer to module name
		id: string;
		value: any;
	}
}
export type CLamatNodeModifiers = CLamatNodeModuleModifier | CLamatNodeModuleOptionModifier;

export interface CLamatSessionModifier extends Modifier { }
export type CLamatSessionModifiers = never;
