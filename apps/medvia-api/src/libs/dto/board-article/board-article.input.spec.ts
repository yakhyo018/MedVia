import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BoardArticleCategory } from '../../enums/board-article.enum';
import { Language } from '../../enums/common.enum';
import { ArticleInput, ArticleUpdate } from './board-article.input';

const tip = (articleImages?: unknown) =>
	plainToInstance(ArticleInput, {
		articleCategory: BoardArticleCategory.HEALTH_TIP,
		articleTitle: 'Sun protection after laser',
		articleContent: 'Use SPF 50 every two hours for two weeks.',
		articleLang: Language.EN,
		articleImages,
	});
const photo = (n: number) => `uploads/article/0b8f9c2e-6a3d-4c1e-9f7a-2d5e8b1c4a9${n}.jpg`;
const failed = async (input: object) => (await validate(input)).map((e) => e.property);

describe('a health tip’s photos', () => {
	it('accepts none, one or two of our article uploads', async () => {
		expect(await failed(tip())).toEqual([]);
		expect(await failed(tip([photo(1)]))).toEqual([]);
		expect(await failed(tip([photo(1), photo(2)]))).toEqual([]);
	});

	it('refuses a third photo, a repeat, another folder and outside URLs', async () => {
		expect(await failed(tip([photo(1), photo(2), photo(3)]))).toEqual(['articleImages']);
		expect(await failed(tip([photo(1), photo(1)]))).toEqual(['articleImages']);
		expect(await failed(tip(['uploads/doctor/0b8f9c2e-6a3d-4c1e-9f7a-2d5e8b1c4a90.jpg']))).toEqual([
			'articleImages',
		]);
		expect(await failed(tip(['https://example.com/a.jpg']))).toEqual(['articleImages']);
		expect(await failed(tip(['javascript:alert(1)']))).toEqual(['articleImages']);
	});

	it('lets an update replace the set or clear it', async () => {
		const update = (articleImages: string[]) =>
			plainToInstance(ArticleUpdate, { articleId: '6ad03f3d34d376f68a804858', articleImages });
		expect(await failed(update([photo(1)]))).toEqual([]);
		expect(await failed(update([]))).toEqual([]);
		expect(await failed(update([photo(1), photo(2), photo(3)]))).toEqual(['articleImages']);
	});
});
