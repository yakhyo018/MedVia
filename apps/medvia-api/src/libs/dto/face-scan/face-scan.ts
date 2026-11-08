import { Field, ObjectType } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { Specialty } from '../../enums/clinic.enum';
import { Language } from '../../enums/common.enum';
import {
	ConcernSeverity,
	FaceScanStatus,
	FaceZone,
	PhotoQualityIssue,
	SkinConcern,
} from '../../enums/face-scan.enum';
import { TotalCounter } from '../member/member';

@ObjectType()
export class FaceFindingView {
	@Field(() => SkinConcern)
	concern!: SkinConcern;

	@Field(() => ConcernSeverity)
	severity!: ConcernSeverity;

	@Field(() => FaceZone)
	zone!: FaceZone;
}

/** What the patient sees; the summary is decrypted on the way out, for its owner only. */
@ObjectType()
export class FaceScan {
	@Field(() => String)
	_id!: ObjectId;

	@Field(() => FaceScanStatus)
	faceScanStatus!: FaceScanStatus;

	@Field(() => [FaceFindingView])
	findings!: FaceFindingView[];

	@Field(() => [PhotoQualityIssue])
	qualityIssues!: PhotoQualityIssue[];

	@Field(() => String, { nullable: true })
	faceScanSummary?: string;

	@Field(() => Language)
	faceScanLang!: Language;

	@Field(() => Specialty, { nullable: true })
	suggestedSpecialty?: Specialty;

	@Field(() => String)
	aiProvider!: string;

	/** Always shown next to the result: this is not a diagnosis. */
	@Field(() => String)
	disclaimer!: string;

	@Field(() => Date)
	createdAt!: Date;
}

@ObjectType()
export class FaceScans {
	@Field(() => [FaceScan])
	list!: FaceScan[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter!: TotalCounter[];
}
