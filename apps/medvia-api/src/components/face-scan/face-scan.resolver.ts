import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { OrdinaryInquiry } from '../../libs/dto/common/inquiry';
import { FaceScan, FaceScans } from '../../libs/dto/face-scan/face-scan';
import { MemberType } from '../../libs/enums/member.enum';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { FaceScanService } from './face-scan.service';

/** Patients only, and only their own scans. The scan itself is POST /face-scan (REST). */
@Resolver()
export class FaceScanResolver {
	constructor(private readonly faceScanService: FaceScanService) {}

	@Roles(MemberType.USER)
	@UseGuards(RolesGuard)
	@Query(() => FaceScans)
	public async getMyFaceScans(
		@Args('input') input: OrdinaryInquiry,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<FaceScans> {
		console.log('Query: getMyFaceScans');
		return await this.faceScanService.getMyScans(memberId, input);
	}

	@Roles(MemberType.USER)
	@UseGuards(RolesGuard)
	@Query(() => FaceScan)
	public async getFaceScan(
		@Args('scanId') scanId: string,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<FaceScan> {
		console.log('Query: getFaceScan');
		return await this.faceScanService.getScan(memberId, scanId);
	}

	@Roles(MemberType.USER)
	@UseGuards(RolesGuard)
	@Mutation(() => FaceScan)
	public async deleteFaceScan(
		@Args('scanId') scanId: string,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<FaceScan> {
		console.log('Mutation: deleteFaceScan');
		return await this.faceScanService.deleteScan(memberId, scanId);
	}
}
