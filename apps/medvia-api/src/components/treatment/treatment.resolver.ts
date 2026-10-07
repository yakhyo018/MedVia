import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { TreatmentService } from './treatment.service';
import { Treatment, Treatments } from '../../libs/dto/treatment/treatment';
import {
	AdminTreatmentsInquiry,
	ClinicTreatmentsInquiry,
	TreatmentCreateInput,
	TreatmentReviewInput,
	TreatmentUpdate,
} from '../../libs/dto/treatment/treatment.input';
import { MemberType } from '../../libs/enums/member.enum';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

@Resolver()
export class TreatmentResolver {
	constructor(private readonly treatmentService: TreatmentService) {}

	/** CLINIC ACCOUNT **/

	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Mutation(() => Treatment)
	public async createTreatment(
		@Args('input') input: TreatmentCreateInput,
		@AuthMember('_id') agentId: ObjectId,
	): Promise<Treatment> {
		console.log('Mutation: createTreatment');
		return await this.treatmentService.createTreatment(agentId, input);
	}

	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Mutation(() => Treatment)
	public async updateTreatment(
		@Args('input') input: TreatmentUpdate,
		@AuthMember('_id') agentId: ObjectId,
	): Promise<Treatment> {
		console.log('Mutation: updateTreatment');
		return await this.treatmentService.updateTreatment(agentId, input);
	}

	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Mutation(() => Treatment)
	public async resubmitTreatment(
		@Args('treatmentId') treatmentId: string,
		@AuthMember('_id') agentId: ObjectId,
	): Promise<Treatment> {
		console.log('Mutation: resubmitTreatment');
		return await this.treatmentService.resubmitTreatment(agentId, treatmentId);
	}

	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Mutation(() => Treatment)
	public async cancelTreatmentReview(
		@Args('treatmentId') treatmentId: string,
		@AuthMember('_id') agentId: ObjectId,
	): Promise<Treatment> {
		console.log('Mutation: cancelTreatmentReview');
		return await this.treatmentService.cancelTreatmentReview(agentId, treatmentId);
	}

	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Mutation(() => Treatment)
	public async hideTreatment(
		@Args('treatmentId') treatmentId: string,
		@AuthMember('_id') agentId: ObjectId,
	): Promise<Treatment> {
		console.log('Mutation: hideTreatment');
		return await this.treatmentService.hideTreatment(agentId, treatmentId);
	}

	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Mutation(() => Treatment)
	public async showTreatment(
		@Args('treatmentId') treatmentId: string,
		@AuthMember('_id') agentId: ObjectId,
	): Promise<Treatment> {
		console.log('Mutation: showTreatment');
		return await this.treatmentService.showTreatment(agentId, treatmentId);
	}

	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Mutation(() => Treatment)
	public async removeTreatment(
		@Args('treatmentId') treatmentId: string,
		@AuthMember('_id') agentId: ObjectId,
	): Promise<Treatment> {
		console.log('Mutation: removeTreatment');
		return await this.treatmentService.removeTreatment(agentId, treatmentId);
	}

	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Query(() => [Treatment])
	public async getMyClinicTreatments(@AuthMember('_id') agentId: ObjectId): Promise<Treatment[]> {
		console.log('Query: getMyClinicTreatments');
		return await this.treatmentService.getMyClinicTreatments(agentId);
	}

	/** PUBLIC **/

	@Query(() => [Treatment])
	public async getClinicTreatments(
		@Args('input') input: ClinicTreatmentsInquiry,
	): Promise<Treatment[]> {
		console.log('Query: getClinicTreatments');
		return await this.treatmentService.getClinicTreatments(input);
	}

	/** ADMIN **/

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => Treatments)
	public async getTreatmentsByAdmin(
		@Args('input') input: AdminTreatmentsInquiry,
	): Promise<Treatments> {
		console.log('Query: getTreatmentsByAdmin');
		return await this.treatmentService.getTreatmentsByAdmin(input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Treatment)
	public async reviewTreatment(
		@Args('input') input: TreatmentReviewInput,
		@AuthMember('_id') adminId: ObjectId,
	): Promise<Treatment> {
		console.log('Mutation: reviewTreatment');
		return await this.treatmentService.reviewTreatment(adminId, input);
	}
}
