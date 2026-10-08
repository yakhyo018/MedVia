import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import type { ObjectId } from 'mongoose';
import { ChatService } from './chat.service';
import { ChatThrottlerGuard } from './chat-throttler.guard';
import { ChatMessage, ChatMessages, ChatRoom } from '../../libs/dto/chat/chat';
import { MessageSendInput, RoomMessagesInquiry } from '../../libs/dto/chat/chat.input';
import { MemberType } from '../../libs/enums/member.enum';
import type { AuthMember as AuthMemberType } from '../../libs/types/common';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

/** The two sides of a chat: the patient and the clinic account. */
const SIDES = [MemberType.USER, MemberType.AGENT];

@Resolver()
export class ChatResolver {
	constructor(private readonly chatService: ChatService) {}

	@Roles(MemberType.USER)
	@UseGuards(RolesGuard)
	@Mutation(() => ChatRoom)
	public async openRoom(
		@Args('clinicId') clinicId: string,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<ChatRoom> {
		console.log('Mutation: openRoom');
		return await this.chatService.openRoom(memberId, clinicId);
	}

	@Roles(...SIDES)
	@UseGuards(RolesGuard)
	@Query(() => [ChatRoom])
	public async getMyRooms(@AuthMember() authMember: AuthMemberType): Promise<ChatRoom[]> {
		console.log('Query: getMyRooms');
		return await this.chatService.getMyRooms(authMember);
	}

	@Roles(...SIDES)
	@UseGuards(RolesGuard)
	@Query(() => ChatMessages)
	public async getRoomMessages(
		@Args('input') input: RoomMessagesInquiry,
		@AuthMember() authMember: AuthMemberType,
	): Promise<ChatMessages> {
		console.log('Query: getRoomMessages');
		return await this.chatService.getRoomMessages(authMember, input);
	}

	/** 20 messages a minute per member — a person typing never gets near it. */
	@Roles(...SIDES)
	@Throttle({ default: { limit: 20, ttl: 60_000 } })
	@UseGuards(RolesGuard, ChatThrottlerGuard)
	@Mutation(() => ChatMessage)
	public async sendMessage(
		@Args('input') input: MessageSendInput,
		@AuthMember() authMember: AuthMemberType,
	): Promise<ChatMessage> {
		console.log('Mutation: sendMessage');
		return await this.chatService.sendMessage(authMember, input);
	}

	@Roles(...SIDES)
	@UseGuards(RolesGuard)
	@Mutation(() => ChatRoom)
	public async markRoomRead(
		@Args('roomId') roomId: string,
		@AuthMember() authMember: AuthMemberType,
	): Promise<ChatRoom> {
		console.log('Mutation: markRoomRead');
		return await this.chatService.markRoomRead(authMember, roomId);
	}
}
