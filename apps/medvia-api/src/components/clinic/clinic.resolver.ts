import { UseGuards } from '@nestjs/common';
import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import type { ObjectId } from 'mongoose';
import { ClinicService } from './clinic.service';
import { Clinic, Clinics } from '../../libs/dto/clinic/clinic';
import {
	AdminClinicsInquiry,
	ClinicReviewInput,
	ClinicSignupInput,
	ClinicsInquiry,
	ClinicStatusInput,
} from '../../libs/dto/clinic/clinic.input';
import { ClinicUpdate } from '../../libs/dto/clinic/clinic.update';
import { OrdinaryInquiry } from '../../libs/dto/common/inquiry';
import { Member } from '../../libs/dto/member/member';
import { MemberType } from '../../libs/enums/member.enum';
import type { AuthMember as AuthMemberType, T } from '../../libs/types/common';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { WithoutGuard } from '../auth/guards/without.guard';
import { GqlThrottlerGuard } from '../auth/guards/gql-throttler.guard';

const ONE_MINUTE = 60_000;

@Resolver()
export class ClinicResolver {
	constructor(private readonly clinicService: ClinicService) {}

	/** CLINIC ACCOUNT **/

	@Throttle({ default: { limit: 10, ttl: ONE_MINUTE } })
	@UseGuards(GqlThrottlerGuard)
	@Mutation(() => Member)
	public async signupClinic(
		@Args('input') input: ClinicSignupInput,
		@Context() { req, res }: T,
	): Promise<Member> {
		console.log('Mutation: signupClinic');
		return await this.clinicService.signupClinic(input, req, res);
	}

	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Query(() => Clinic)
	public async getMyClinic(@AuthMember('_id') memberId: ObjectId): Promise<Clinic> {
		console.log('Query: getMyClinic');
		return await this.clinicService.getMyClinic(memberId);
	}

	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Mutation(() => Clinic)
	public async updateMyClinic(
		@Args('input') input: ClinicUpdate,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Clinic> {
		console.log('Mutation: updateMyClinic');
		return await this.clinicService.updateMyClinic(memberId, input);
	}

	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Mutation(() => Clinic)
	public async resubmitClinic(@AuthMember('_id') memberId: ObjectId): Promise<Clinic> {
		console.log('Mutation: resubmitClinic');
		return await this.clinicService.resubmitClinic(memberId);
	}

	/** PUBLIC **/

	@UseGuards(WithoutGuard)
	@Query(() => Clinic)
	public async getClinic(
		@Args('clinicId') clinicId: string,
		@AuthMember() authMember: AuthMemberType | null,
	): Promise<Clinic> {
		console.log('Query: getClinic');
		return await this.clinicService.getClinic(authMember, clinicId);
	}

	@Query(() => Clinics)
	public async getClinics(@Args('input') input: ClinicsInquiry): Promise<Clinics> {
		console.log('Query: getClinics');
		return await this.clinicService.getClinics(input);
	}

	@Query(() => [Clinic])
	public async getNearbyClinics(
		@Args('clinicId') clinicId: string,
		@Args('limit', { type: () => Int, defaultValue: 3 }) limit: number,
	): Promise<Clinic[]> {
		console.log('Query: getNearbyClinics');
		return await this.clinicService.getNearbyClinics(clinicId, Math.min(Math.max(limit, 1), 10));
	}

	/** PATIENT **/

	@Roles(MemberType.USER)
	@UseGuards(RolesGuard)
	@Mutation(() => Clinic)
	public async likeTargetClinic(
		@Args('clinicId') clinicId: string,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Clinic> {
		console.log('Mutation: likeTargetClinic');
		return await this.clinicService.likeTargetClinic(memberId, clinicId);
	}

	@UseGuards(AuthGuard)
	@Query(() => Clinics)
	public async getFavoriteClinics(
		@Args('input') input: OrdinaryInquiry,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Clinics> {
		console.log('Query: getFavoriteClinics');
		return await this.clinicService.getFavoriteClinics(memberId, input);
	}

	/** ADMIN **/

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => Clinics)
	public async getClinicsByAdmin(@Args('input') input: AdminClinicsInquiry): Promise<Clinics> {
		console.log('Query: getClinicsByAdmin');
		return await this.clinicService.getClinicsByAdmin(input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Clinic)
	public async reviewClinic(
		@Args('input') input: ClinicReviewInput,
		@AuthMember('_id') adminId: ObjectId,
	): Promise<Clinic> {
		console.log('Mutation: reviewClinic');
		return await this.clinicService.reviewClinic(adminId, input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Clinic)
	public async suspendClinic(
		@Args('input') input: ClinicStatusInput,
		@AuthMember('_id') adminId: ObjectId,
	): Promise<Clinic> {
		console.log('Mutation: suspendClinic');
		return await this.clinicService.suspendClinic(adminId, input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Clinic)
	public async restoreClinic(
		@Args('input') input: ClinicStatusInput,
		@AuthMember('_id') adminId: ObjectId,
	): Promise<Clinic> {
		console.log('Mutation: restoreClinic');
		return await this.clinicService.restoreClinic(adminId, input);
	}
}
