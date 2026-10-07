import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { LikeService, LikeTargetHandler } from './like.service';
import { LikeGroup } from '../../libs/enums/like.enum';

const memberId = new Types.ObjectId() as any;
const clinicId = new Types.ObjectId();

/** The two Mongoose calls toggleLike makes, with results the test controls. */
function fakeLikeModel(deletedCount: number, createError?: { code: number }) {
	return {
		deleteOne: jest.fn(() => ({ exec: async () => ({ deletedCount }) })),
		create: jest.fn(async () => {
			if (createError) throw createError;
			return {};
		}),
	};
}

async function serviceWith(model: object): Promise<LikeService> {
	const moduleRef = await Test.createTestingModule({
		providers: [LikeService, { provide: getModelToken('Like'), useValue: model }],
	}).compile();
	return moduleRef.get(LikeService);
}

const input = { memberId, likeGroup: LikeGroup.CLINIC, likeRefId: clinicId as any };

describe('LikeService.toggleLike — the write decides, not a prior read', () => {
	it('an existing like is deleted: -1', async () => {
		const model = fakeLikeModel(1);
		await expect((await serviceWith(model)).toggleLike(input)).resolves.toBe(-1);
		expect(model.create).not.toHaveBeenCalled();
	});

	it('no like yet: inserted, +1', async () => {
		const model = fakeLikeModel(0);
		await expect((await serviceWith(model)).toggleLike(input)).resolves.toBe(1);
		expect(model.create).toHaveBeenCalledTimes(1);
	});

	it('a twin request inserted first (duplicate key 11000): 0, the counter must not move', async () => {
		await expect(
			(await serviceWith(fakeLikeModel(0, { code: 11000 }))).toggleLike(input),
		).resolves.toBe(0);
	});

	it('any other database error is not swallowed', async () => {
		await expect(
			(await serviceWith(fakeLikeModel(0, { code: 2 }))).toggleLike(input),
		).rejects.toEqual({
			code: 2,
		});
	});
});

describe('LikeService.likeTarget — handlers registered by the target modules', () => {
	const handler = (): jest.Mocked<LikeTargetHandler> => ({
		isLikeable: jest.fn(async () => true),
		moveLikes: jest.fn(async (_id, modifier) => 10 + modifier),
		countLikes: jest.fn(async () => 10),
	});

	it('a group nobody registered is a bad request', async () => {
		const service = await serviceWith(fakeLikeModel(0));
		await expect(
			service.likeTarget(memberId, { likeGroup: LikeGroup.DOCTOR, likeRefId: String(clinicId) }),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it('a target the handler refuses is "not found", and nothing is written', async () => {
		const model = fakeLikeModel(0);
		const service = await serviceWith(model);
		const h = handler();
		h.isLikeable.mockResolvedValue(false);
		service.registerTarget(LikeGroup.CLINIC, h);

		await expect(
			service.likeTarget(memberId, { likeGroup: LikeGroup.CLINIC, likeRefId: String(clinicId) }),
		).rejects.toBeInstanceOf(NotFoundException);
		expect(model.deleteOne).not.toHaveBeenCalled();
	});

	it('a new like moves the counter through the handler', async () => {
		const service = await serviceWith(fakeLikeModel(0));
		const h = handler();
		service.registerTarget(LikeGroup.CLINIC, h);

		await expect(
			service.likeTarget(memberId, { likeGroup: LikeGroup.CLINIC, likeRefId: String(clinicId) }),
		).resolves.toEqual({
			likeGroup: LikeGroup.CLINIC,
			likeRefId: String(clinicId),
			meLiked: true,
			likes: 11,
		});
		expect(h.moveLikes).toHaveBeenCalledWith(clinicId, 1);
	});

	it('a lost race (modifier 0) only reads the count and still shows the heart on', async () => {
		const service = await serviceWith(fakeLikeModel(0, { code: 11000 }));
		const h = handler();
		service.registerTarget(LikeGroup.CLINIC, h);

		const result = await service.likeTarget(memberId, {
			likeGroup: LikeGroup.CLINIC,
			likeRefId: String(clinicId),
		});
		expect(result).toMatchObject({ meLiked: true, likes: 10 });
		expect(h.moveLikes).not.toHaveBeenCalled();
		expect(h.countLikes).toHaveBeenCalledTimes(1);
	});
});
