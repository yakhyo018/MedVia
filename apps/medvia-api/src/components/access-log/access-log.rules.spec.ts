import { AccessType } from '../../libs/enums/access-log.enum';
import { MemberType } from '../../libs/enums/member.enum';
import { accessesOf, readerNameOf } from './access-log.rules';

const patientId = 'p1';
const booking = {
	memberId: patientId,
	bookingQuestionnaire: { answersEnc: 'x' },
	bookingAiSummaryEnc: 'y',
	clinicData: { clinicName: 'Seoul Glow' },
	doctorData: { doctorName: 'Han Seo-yeon' },
};

describe('accessesOf', () => {
	it('logs both readings by someone else', () => {
		expect(accessesOf(booking, 'clinic-account', true)).toEqual([
			AccessType.ANSWERS,
			AccessType.AI_SUMMARY,
		]);
	});

	it('logs nothing when the patient reads their own data', () => {
		expect(accessesOf(booking, patientId, true)).toEqual([]);
	});

	it('logs nothing when nothing was decrypted (the admin)', () => {
		expect(accessesOf(booking, 'admin', false)).toEqual([]);
	});

	it('logs only what exists', () => {
		const noSummary = { ...booking, bookingAiSummaryEnc: undefined };
		expect(accessesOf(noSummary, 'doctor', true)).toEqual([AccessType.ANSWERS]);
	});
});

describe('readerNameOf', () => {
	it('names the clinic or the doctor', () => {
		expect(readerNameOf(MemberType.AGENT, booking)).toBe('Seoul Glow');
		expect(readerNameOf(MemberType.DOCTOR, booking)).toBe('Dr. Han Seo-yeon');
	});
});
