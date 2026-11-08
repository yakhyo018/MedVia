import {
	chunk,
	clinicDocument,
	docIds,
	hasContent,
	hoursText,
	isMedviaDocId,
	noticeDocument,
	py,
	pyTitle,
	staleIds,
	tipDocument,
	treatmentDocument,
	won,
} from './navi.rules';

const clinic = {
	_id: 'c1',
	clinicName: 'Seoul Glow',
	clinicNameKo: '서울글로우',
	clinicSpecialty: 'PLASTIC_SURGERY',
	clinicDistrict: 'GANGNAM',
	clinicAddress: '1 Teheran-ro',
	clinicPhone: '02-123-4567',
	clinicDesc: 'Skin and laser.',
	clinicLangs: ['EN', 'RU'],
	clinicInterpreterLangs: [],
	clinicHours: [
		{ day: 1, open: '09:00', close: '18:00', closed: false },
		{ day: 0, closed: true },
	],
};
const treatment = {
	_id: 't1',
	treatmentName: 'Laser toning',
	treatmentPrice: 1200000,
	treatmentDuration: 30,
	treatmentPriceNote: '',
	treatmentDesc: 'Evens the tone.',
	treatmentAftercare: '',
	doctors: [{ doctorName: 'Han Seo-yeon' }],
};

describe('navi rules — Python habits of export_medvia.py', () => {
	it('prints a missing value as None', () => {
		expect(py(null)).toBe('None');
		expect(py(undefined)).toBe('None');
		expect(py(0)).toBe('0');
	});

	it('title-cases like str.title()', () => {
		expect(pyTitle('GANGNAM')).toBe('Gangnam');
		expect(pyTitle('jung_gu')).toBe('Jung_Gu');
	});

	it('groups thousands like f"{n:,}"', () => {
		expect(won(1200000)).toBe('1,200,000 KRW');
		expect(won(900)).toBe('900 KRW');
		expect(won(1500.5)).toBe('1,500.5 KRW');
	});

	it('drops content shorter than 30 characters after trimming', () => {
		expect(hasContent('   test   ')).toBe(false);
		expect(hasContent('x'.repeat(30))).toBe(true);
		expect(hasContent(null)).toBe(false);
	});

	it('lists the week Monday first and closes missing days', () => {
		const lines = hoursText(clinic.clinicHours).split('\n');
		expect(lines[0]).toBe('- Monday: 09:00–18:00');
		expect(lines[1]).toBe('- Tuesday: closed');
		expect(lines[6]).toBe('- Sunday: closed');
	});
});

describe('navi rules — documents', () => {
	it('renders a clinic with its doctors and treatments', () => {
		const doc = clinicDocument(
			clinic,
			[
				{
					doctorName: 'Han Seo-yeon',
					doctorNameKo: null,
					doctorExperience: 12,
					doctorBio: 'Laser.',
				},
			],
			[treatment],
		);
		expect(doc.doc_id).toBe('clinic-c1');
		expect(doc.text).toContain('# Seoul Glow (서울글로우)\n\n');
		expect(doc.text).toContain('Seoul Glow is a plastic surgery clinic in Gangnam-gu, Seoul.');
		expect(doc.text).toContain('Interpreter languages: none.');
		expect(doc.text).toContain('- Han Seo-yeon (None), 12 years of experience. Laser.');
		expect(doc.text.endsWith('- Laser toning: from 1,200,000 KRW, 30 minutes.')).toBe(true);
		expect(doc.meta).toEqual({ clinicId: 'c1', clinicName: 'Seoul Glow', district: 'GANGNAM' });
	});

	it('renders a treatment; aftercare only when there is one', () => {
		const doc = treatmentDocument(clinic, treatment);
		expect(doc.doc_id).toBe('treatment-t1');
		expect(doc.title).toBe('Laser toning at Seoul Glow');
		// An empty price note leaves the space before the blank line, as the f-string does.
		expect(doc.text).toContain(
			'takes 30 minutes. \n\nEvens the tone.\n\nPerformed by: Han Seo-yeon.',
		);
		expect(doc.text).not.toContain('Aftercare');
		const withCare = treatmentDocument(clinic, { ...treatment, treatmentAftercare: 'No sun.' });
		expect(withCare.text.endsWith('\n\n## Aftercare\n\nNo sun.')).toBe(true);
		expect(treatmentDocument(clinic, { ...treatment, doctors: [] }).text).toContain(
			'Performed by: any doctor.',
		);
	});

	it('renders a tip and the two kinds of notices', () => {
		const tip = tipDocument(
			{ _id: 'a1', articleTitle: 'Sunscreen', articleContent: 'Every day.', articleLang: 'RU' },
			'Dr. Han',
		);
		expect(tip).toMatchObject({ doc_id: 'tip-a1', lang: 'RU', source_type: 'health_tip' });
		expect(tip.text).toBe('# Sunscreen\n\nEvery day.\n\nWritten by Dr. Han.');

		const faq = noticeDocument({
			_id: 'n1',
			noticeCategory: 'FAQ',
			noticeFaqCategory: 'BOOKING',
			noticeTitle: 'Q',
			noticeContent: 'A',
		});
		expect(faq).toMatchObject({
			doc_id: 'faq-n1',
			source_type: 'faq',
			meta: { faqCategory: 'BOOKING' },
		});
		const notice = noticeDocument({
			_id: 'n2',
			noticeCategory: 'NOTICE',
			noticeTitle: 'T',
			noticeContent: 'C',
		});
		expect(notice).toMatchObject({ doc_id: 'notice-n2', meta: { faqCategory: null } });
	});
});

describe('navi rules — ids and batches', () => {
	it('maps ids with MedVia prefixes', () => {
		expect(docIds.clinic('x')).toBe('clinic-x');
		expect(docIds.notice('FAQ', 'y')).toBe('faq-y');
	});

	it('never treats a Navi guide as MedVia content', () => {
		expect(isMedviaDocId('guide-visa')).toBe(false);
		expect(
			staleIds(['guide-visa', 'clinic-1', 'clinic-2', 'clinic-2'], new Set(['clinic-1'])),
		).toEqual(['clinic-2']);
	});

	it('splits into batches of at most the given size', () => {
		const parts = chunk(
			Array.from({ length: 450 }, (_, i) => i),
			200,
		);
		expect(parts.map((p) => p.length)).toEqual([200, 200, 50]);
	});
});
