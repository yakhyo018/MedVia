import { BoardArticleCategory, BoardArticleStatus } from '../../libs/enums/board-article.enum';
import { Direction, Messages } from '../../libs/enums/common.enum';
import { MemberType } from '../../libs/enums/member.enum';
import { ModerationDecision, ReportStatus } from '../../libs/enums/report.enum';
import {
	answersQuestion,
	articleMatch,
	articleSort,
	authorName,
	checkCanPost,
	checkCanReport,
	POSTERS,
	reportOutcome,
} from './community.rules';

describe('who posts where', () => {
	it('patients ask and use the free board; doctors and the team write tips', () => {
		expect(() => checkCanPost(MemberType.USER, BoardArticleCategory.QNA)).not.toThrow();
		expect(() => checkCanPost(MemberType.USER, BoardArticleCategory.FREE)).not.toThrow();
		expect(() => checkCanPost(MemberType.DOCTOR, BoardArticleCategory.HEALTH_TIP)).not.toThrow();
		expect(() => checkCanPost(MemberType.ADMIN, BoardArticleCategory.HEALTH_TIP)).not.toThrow();
	});

	it('refuses every other pair, and clinic accounts everywhere', () => {
		let refused = 0;
		for (const category of Object.values(BoardArticleCategory))
			for (const type of Object.values(MemberType)) {
				if (POSTERS[category].includes(type)) continue;
				expect(() => checkCanPost(type, category)).toThrow(Messages.CATEGORY_NOT_ALLOWED);
				refused++;
			}
		// 3 boards × 4 member types, 4 allowed.
		expect(refused).toBe(8);
	});

	it('only a doctor commenting on a question answers it', () => {
		expect(answersQuestion(BoardArticleCategory.QNA, MemberType.DOCTOR)).toBe(true);
		expect(answersQuestion(BoardArticleCategory.QNA, MemberType.USER)).toBe(false);
		expect(answersQuestion(BoardArticleCategory.FREE, MemberType.DOCTOR)).toBe(false);
	});
});

describe('the public list', () => {
	it('shows only ACTIVE posts and narrows by board, author and the "Waiting" filter', () => {
		expect(
			articleMatch({ articleCategory: BoardArticleCategory.QNA, memberId: 'm', answered: false }),
		).toEqual({
			articleStatus: BoardArticleStatus.ACTIVE,
			articleCategory: BoardArticleCategory.QNA,
			memberId: 'm',
			articleAnswered: false,
		});
	});

	it('escapes the search text (no ReDoS, no regex injection)', () => {
		const match = articleMatch({ text: '(a+)+$' });
		expect(match.articleTitle.$regex.source).toBe('\\(a\\+\\)\\+\\$');
		expect(match.articleTitle.$regex.test('(a+)+$ in a title')).toBe(true);
		expect(match.articleTitle.$regex.test('aaaa')).toBe(false);
	});

	it('ignores an empty search text', () => {
		expect(articleMatch({ text: '   ' })).toEqual({ articleStatus: BoardArticleStatus.ACTIVE });
	});

	it('sorts by a whitelisted field only, with _id breaking ties', () => {
		expect(articleSort('articleLikes', Direction.DESC)).toEqual({ articleLikes: -1, _id: -1 });
		expect(articleSort('memberPassword')).toEqual({ createdAt: -1, _id: -1 });
	});
});

describe('authors and reports', () => {
	it('names patients short, doctors with the title, the team as MedVia', () => {
		expect(authorName('Feride Karimova', MemberType.USER)).toBe('Feride K.');
		expect(authorName('Han Seo-yeon', MemberType.DOCTOR)).toBe('Dr. Han Seo-yeon');
		expect(authorName('Admin', MemberType.ADMIN)).toBe('MedVia');
	});

	it("refuses reporting one's own post", () => {
		expect(() => checkCanReport('m1', 'm1')).toThrow(Messages.CANNOT_REPORT_OWN);
		expect(() => checkCanReport('m1', 'm2')).not.toThrow();
	});

	it('hiding resolves the reports, showing dismisses them', () => {
		expect(reportOutcome(ModerationDecision.HIDE)).toBe(ReportStatus.RESOLVED);
		expect(reportOutcome(ModerationDecision.SHOW)).toBe(ReportStatus.DISMISSED);
	});
});
