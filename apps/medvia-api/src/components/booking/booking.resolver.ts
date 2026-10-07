import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { BookingService } from './booking.service';
import { Booking, Bookings } from '../../libs/dto/booking/booking';
import {
	BookingCreateInput,
	BookingsInquiry,
	BookingStatusUpdate,
} from '../../libs/dto/booking/booking.input';
import { MemberType } from '../../libs/enums/member.enum';
import type { AuthMember as AuthMemberType } from '../../libs/types/common';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

const EVERY_ROLE = [MemberType.USER, MemberType.AGENT, MemberType.DOCTOR, MemberType.ADMIN];

/**
 * Three of the four operations serve every role. The resolver does not branch on the role:
 * the service turns the token into a scope (whose bookings) and an actor (which moves).
 */
@Resolver()
export class BookingResolver {
	constructor(private readonly bookingService: BookingService) {}

	/** PATIENT **/

	@Roles(MemberType.USER)
	@UseGuards(RolesGuard)
	@Mutation(() => Booking)
	public async createBooking(
		@Args('input') input: BookingCreateInput,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Booking> {
		console.log('Mutation: createBooking');
		return await this.bookingService.createBooking(memberId, input);
	}

	/** EVERY ROLE — scoped by the token **/

	@Roles(...EVERY_ROLE)
	@UseGuards(RolesGuard)
	@Query(() => Bookings)
	public async getBookings(
		@Args('input') input: BookingsInquiry,
		@AuthMember() authMember: AuthMemberType,
	): Promise<Bookings> {
		console.log('Query: getBookings');
		return await this.bookingService.getBookings(authMember, input);
	}

	@Roles(...EVERY_ROLE)
	@UseGuards(RolesGuard)
	@Query(() => Booking)
	public async getBooking(
		@Args('bookingId') bookingId: string,
		@AuthMember() authMember: AuthMemberType,
	): Promise<Booking> {
		console.log('Query: getBooking');
		return await this.bookingService.getBooking(authMember, bookingId);
	}

	/** A doctor reads but never moves a booking — the clinic account does. */
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Booking)
	public async updateBookingStatus(
		@Args('input') input: BookingStatusUpdate,
		@AuthMember() authMember: AuthMemberType,
	): Promise<Booking> {
		console.log('Mutation: updateBookingStatus');
		return await this.bookingService.updateBookingStatus(authMember, input);
	}
}
