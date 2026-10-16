import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { AssistantService } from './assistant.service';
import {
	AssistantMessageInput,
	AssistantReply,
	AssistantSessionView,
} from '../../libs/dto/assistant/assistant';
import { SlotHold } from '../../libs/dto/slot/slot';
import { MemberType } from '../../libs/enums/member.enum';
import type { AuthMember as AuthMemberType } from '../../libs/types/common';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

/** Patients only: the assistant books for the person who is asking, nobody else. */
@Resolver()
export class AssistantResolver {
	constructor(private readonly assistantService: AssistantService) {}

	@Roles(MemberType.USER)
	@UseGuards(RolesGuard)
	@Mutation(() => AssistantReply)
	public async sendAssistantMessage(
		@Args('input') input: AssistantMessageInput,
		@AuthMember() authMember: AuthMemberType,
	): Promise<AssistantReply> {
		console.log('Mutation: sendAssistantMessage');
		return await this.assistantService.sendMessage(authMember, input);
	}

	/** The only door from a proposal to a held slot — pressed by the patient, never by the model. */
	@Roles(MemberType.USER)
	@UseGuards(RolesGuard)
	@Mutation(() => SlotHold)
	public async confirmAssistantHold(
		@Args('sessionId') sessionId: string,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<SlotHold> {
		console.log('Mutation: confirmAssistantHold');
		return await this.assistantService.confirmHold(memberId, sessionId);
	}

	@Roles(MemberType.USER)
	@UseGuards(RolesGuard)
	@Query(() => AssistantSessionView)
	public async getMyAssistantSession(
		@AuthMember('_id') memberId: ObjectId,
	): Promise<AssistantSessionView> {
		console.log('Query: getMyAssistantSession');
		return await this.assistantService.getMySession(memberId);
	}

	@Roles(MemberType.USER)
	@UseGuards(RolesGuard)
	@Mutation(() => AssistantSessionView)
	public async closeAssistantSession(
		@Args('sessionId') sessionId: string,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<AssistantSessionView> {
		console.log('Mutation: closeAssistantSession');
		return await this.assistantService.closeSession(memberId, sessionId);
	}
}
