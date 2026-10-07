import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { SlotService } from './slot.service';
import { Slot, SlotHold, SlotsCreated } from '../../libs/dto/slot/slot';
import {
	AvailableSlotsInquiry,
	ClinicScheduleInquiry,
	SlotHoldInput,
	SlotsBlockInput,
	SlotsCreateInput,
} from '../../libs/dto/slot/slot.input';
import { MemberType } from '../../libs/enums/member.enum';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

@Resolver()
export class SlotResolver {
	constructor(private readonly slotService: SlotService) {}

	/** CLINIC ACCOUNT **/

	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Mutation(() => SlotsCreated)
	public async createSlots(
		@Args('input') input: SlotsCreateInput,
		@AuthMember('_id') agentId: ObjectId,
	): Promise<SlotsCreated> {
		console.log('Mutation: createSlots');
		return await this.slotService.createSlots(agentId, input);
	}

	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Mutation(() => [Slot])
	public async setSlotsBlocked(
		@Args('input') input: SlotsBlockInput,
		@AuthMember('_id') agentId: ObjectId,
	): Promise<Slot[]> {
		console.log('Mutation: setSlotsBlocked');
		return await this.slotService.setSlotsBlocked(agentId, input);
	}

	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Query(() => [Slot])
	public async getClinicSchedule(
		@Args('input') input: ClinicScheduleInquiry,
		@AuthMember('_id') agentId: ObjectId,
	): Promise<Slot[]> {
		console.log('Query: getClinicSchedule');
		return await this.slotService.getClinicSchedule(agentId, input);
	}

	/** PUBLIC **/

	@Query(() => [Date])
	public async getAvailableSlots(@Args('input') input: AvailableSlotsInquiry): Promise<Date[]> {
		console.log('Query: getAvailableSlots');
		return await this.slotService.getAvailableSlots(input);
	}

	/** PATIENT **/

	@Roles(MemberType.USER)
	@UseGuards(RolesGuard)
	@Mutation(() => SlotHold)
	public async holdSlots(
		@Args('input') input: SlotHoldInput,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<SlotHold> {
		console.log('Mutation: holdSlots');
		return await this.slotService.holdSlots(memberId, input);
	}
}
