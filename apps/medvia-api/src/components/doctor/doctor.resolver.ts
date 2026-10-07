import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { DoctorService } from './doctor.service';
import { Doctor, Doctors } from '../../libs/dto/doctor/doctor';
import {
	AdminDoctorsInquiry,
	DoctorClinicUpdate,
	DoctorCreateInput,
	DoctorPasswordReset,
	DoctorProfileUpdate,
	DoctorsInquiry,
	DoctorStatusInput,
} from '../../libs/dto/doctor/doctor.input';
import { OrdinaryInquiry } from '../../libs/dto/common/inquiry';
import { MemberType } from '../../libs/enums/member.enum';
import type { AuthMember as AuthMemberType } from '../../libs/types/common';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { WithoutGuard } from '../auth/guards/without.guard';

@Resolver()
export class DoctorResolver {
	constructor(private readonly doctorService: DoctorService) {}

	/** CLINIC ACCOUNT **/

	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Mutation(() => Doctor)
	public async createDoctor(
		@Args('input') input: DoctorCreateInput,
		@AuthMember('_id') agentId: ObjectId,
	): Promise<Doctor> {
		console.log('Mutation: createDoctor');
		return await this.doctorService.createDoctor(agentId, input);
	}

	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Query(() => [Doctor])
	public async getMyClinicDoctors(@AuthMember('_id') agentId: ObjectId): Promise<Doctor[]> {
		console.log('Query: getMyClinicDoctors');
		return await this.doctorService.getMyClinicDoctors(agentId);
	}

	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Mutation(() => Doctor)
	public async updateDoctorByClinic(
		@Args('input') input: DoctorClinicUpdate,
		@AuthMember('_id') agentId: ObjectId,
	): Promise<Doctor> {
		console.log('Mutation: updateDoctorByClinic');
		return await this.doctorService.updateDoctorByClinic(agentId, input);
	}

	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Mutation(() => Doctor)
	public async hideDoctor(
		@Args('doctorId') doctorId: string,
		@AuthMember('_id') agentId: ObjectId,
	): Promise<Doctor> {
		console.log('Mutation: hideDoctor');
		return await this.doctorService.hideDoctor(agentId, doctorId);
	}

	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Mutation(() => Doctor)
	public async showDoctor(
		@Args('doctorId') doctorId: string,
		@AuthMember('_id') agentId: ObjectId,
	): Promise<Doctor> {
		console.log('Mutation: showDoctor');
		return await this.doctorService.showDoctor(agentId, doctorId);
	}

	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Mutation(() => Doctor)
	public async removeDoctor(
		@Args('doctorId') doctorId: string,
		@AuthMember('_id') agentId: ObjectId,
	): Promise<Doctor> {
		console.log('Mutation: removeDoctor');
		return await this.doctorService.removeDoctor(agentId, doctorId);
	}

	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Mutation(() => Boolean)
	public async resetDoctorPassword(
		@Args('input') input: DoctorPasswordReset,
		@AuthMember('_id') agentId: ObjectId,
	): Promise<boolean> {
		console.log('Mutation: resetDoctorPassword');
		return await this.doctorService.resetDoctorPassword(agentId, input);
	}

	/** DOCTOR ACCOUNT **/

	@Roles(MemberType.DOCTOR)
	@UseGuards(RolesGuard)
	@Query(() => Doctor)
	public async getMyDoctorProfile(@AuthMember('_id') memberId: ObjectId): Promise<Doctor> {
		console.log('Query: getMyDoctorProfile');
		return await this.doctorService.getMyDoctorProfile(memberId);
	}

	@Roles(MemberType.DOCTOR)
	@UseGuards(RolesGuard)
	@Mutation(() => Doctor)
	public async updateMyDoctorProfile(
		@Args('input') input: DoctorProfileUpdate,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Doctor> {
		console.log('Mutation: updateMyDoctorProfile');
		return await this.doctorService.updateMyDoctorProfile(memberId, input);
	}

	/** PUBLIC **/

	@UseGuards(WithoutGuard)
	@Query(() => Doctor)
	public async getDoctor(
		@Args('doctorId') doctorId: string,
		@AuthMember() authMember: AuthMemberType | null,
	): Promise<Doctor> {
		console.log('Query: getDoctor');
		return await this.doctorService.getDoctor(authMember, doctorId);
	}

	@UseGuards(WithoutGuard)
	@Query(() => Doctors)
	public async getDoctors(
		@Args('input') input: DoctorsInquiry,
		@AuthMember() authMember: AuthMemberType | null,
	): Promise<Doctors> {
		console.log('Query: getDoctors');
		return await this.doctorService.getDoctors(authMember, input);
	}

	/** PATIENT **/

	@UseGuards(AuthGuard)
	@Query(() => Doctors)
	public async getFavoriteDoctors(
		@Args('input') input: OrdinaryInquiry,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Doctors> {
		console.log('Query: getFavoriteDoctors');
		return await this.doctorService.getFavoriteDoctors(memberId, input);
	}

	/** ADMIN **/

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => Doctors)
	public async getAllDoctorsByAdmin(@Args('input') input: AdminDoctorsInquiry): Promise<Doctors> {
		console.log('Query: getAllDoctorsByAdmin');
		return await this.doctorService.getAllDoctorsByAdmin(input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Doctor)
	public async suspendDoctor(
		@Args('input') input: DoctorStatusInput,
		@AuthMember('_id') adminId: ObjectId,
	): Promise<Doctor> {
		console.log('Mutation: suspendDoctor');
		return await this.doctorService.suspendDoctor(adminId, input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Doctor)
	public async restoreDoctor(
		@Args('input') input: DoctorStatusInput,
		@AuthMember('_id') adminId: ObjectId,
	): Promise<Doctor> {
		console.log('Mutation: restoreDoctor');
		return await this.doctorService.restoreDoctor(adminId, input);
	}
}
