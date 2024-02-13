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

export interface MinerModifier extends Modifier { }
export interface MinerModifierOccupation extends MinerModifier {
	name: "Occupation";
	value: string;
}
export interface MinerModifierContact extends MinerModifier {
	name: "Contact";
	value: {
		name: string;
		contact: string;
	};
}
export interface MinerModifierMedicalHistory extends MinerModifier {
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
export interface MinerModifierFamilyHistory extends MinerModifier {
	name: "FamilyHistory";
	value: {
		geneticConditions: string;
		chronicIllnesses: string;
		cancer: string;
	}
}
export interface MinerModifierSocialHistory extends MinerModifier {
	name: "SocialHistory";
	value: {
		smoking: string;
		alcoholUse: string;
		recreationalDrugUse: string;
		physicalActivity: string;
	}
}
export type MinerModifiers = MinerModifierOccupation | MinerModifierContact | MinerModifierMedicalHistory | MinerModifierFamilyHistory | MinerModifierSocialHistory;

export interface CLamatNodeModifier extends Modifier { }
export type CLamatNodeModifiers = never;

export interface CLamatSessionModifier extends Modifier { }
export type CLamatSessionModifiers = never;
