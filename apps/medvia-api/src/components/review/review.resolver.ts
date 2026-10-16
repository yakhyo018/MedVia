import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { ReviewService } from './review.service';
import { Review, Reviews } from '../../libs/dto/review/review';
import {
	AdminReviewsInquiry,
	ReviewCreateInput,
	ReviewModerationInput,
	ReviewReplyInput,
	ReviewsInquiry,
	ReviewUpdate,
} from '../../libs/dto/review/review.input';
import { OrdinaryInquiry } from '../../libs/dto/common/inquiry';
import { MemberType } from '../../libs/enums/member.enum';
import type { AuthMember as AuthMemberType } from '../../libs/types/common';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

@Resolver()
export class ReviewResolver {
	constructor(private readonly reviewService: ReviewService) {}

	/** PATIENT **/

	@Roles(MemberType.USER)
	@UseGuards(RolesGuard)
	@Mutation(() => Review)
	public async createReview(
		@Args('input') input: ReviewCreateInput,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Review> {
		console.log('Mutation: createReview');
		return await this.reviewService.createReview(memberId, input);
	}

	@Roles(MemberType.USER)
	@UseGuards(RolesGuard)
	@Mutation(() => Review)
	public async updateReview(
		@Args('input') input: ReviewUpdate,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Review> {
		console.log('Mutation: updateReview');
		return await this.reviewService.updateReview(memberId, input);
	}

	@Roles(MemberType.USER)
	@UseGuards(RolesGuard)
	@Mutation(() => Review)
	public async removeReview(
		@Args('reviewId') reviewId: string,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Review> {
		console.log('Mutation: removeReview');
		return await this.reviewService.removeReview(memberId, reviewId);
	}

	@Roles(MemberType.USER)
	@UseGuards(RolesGuard)
	@Query(() => Reviews)
	public async getMyReviews(
		@Args('input') input: OrdinaryInquiry,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Reviews> {
		console.log('Query: getMyReviews');
		return await this.reviewService.getMyReviews(memberId, input);
	}

	/** CLINIC ACCOUNT AND DOCTOR **/

	@Roles(MemberType.AGENT, MemberType.DOCTOR)
	@UseGuards(RolesGuard)
	@Mutation(() => Review)
	public async replyToReview(
		@Args('input') input: ReviewReplyInput,
		@AuthMember() authMember: AuthMemberType,
	): Promise<Review> {
		console.log('Mutation: replyToReview');
		return await this.reviewService.replyToReview(authMember, input);
	}

	/** PUBLIC **/

	@Query(() => Reviews)
	public async getReviews(@Args('input') input: ReviewsInquiry): Promise<Reviews> {
		console.log('Query: getReviews');
		return await this.reviewService.getReviews(input);
	}

	/** ADMIN **/

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => Reviews)
	public async getReviewsByAdmin(@Args('input') input: AdminReviewsInquiry): Promise<Reviews> {
		console.log('Query: getReviewsByAdmin');
		return await this.reviewService.getReviewsByAdmin(input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Review)
	public async moderateReview(
		@Args('input') input: ReviewModerationInput,
		@AuthMember('_id') adminId: ObjectId,
	): Promise<Review> {
		console.log('Mutation: moderateReview');
		return await this.reviewService.moderateReview(adminId, input);
	}
}
