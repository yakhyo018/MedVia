import { T } from '../../../medvia-api/src/libs/types/common';

/**
 * MedVia content → Navi documents, as pure functions.
 *
 * The text must be byte-for-byte what `medvia-navi/scripts/export_medvia.py` produced: Navi
 * hashes title + source_type + lang + text and skips a document whose hash it already has. A
 * different space or "None" here would re-embed the whole catalogue on the first run — and
 * every change to these templates will, by design (that is how a new wording reaches Navi).
 * That is why a few Python habits are copied on purpose: an empty field prints as `None`,
 * `str.title()`, `f'{n:,}'`.
 */

/** Navi's limit per `POST /v1/documents` (its IngestRequest: max_length=200). */
export const NAVI_BATCH_SIZE = 200;
/** Hand-typed test posts in a developer's database ('test', 'dfdsfs') are not knowledge. */
export const MIN_CONTENT_CHARS = 30;

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** Monday first, Sunday last — the order on the clinic page. */
const WEEK = [1, 2, 3, 4, 5, 6, 0];

export type NaviSourceType = 'clinic' | 'treatment' | 'health_tip' | 'faq' | 'notice';

export interface NaviDocument {
	doc_id: string;
	title: string;
	source_type: NaviSourceType;
	lang: string;
	text: string;
	meta: Record<string, string | number | null>;
}

/** Python's f-string of a missing value: `None`. */
export function py(value: unknown): string {
	return value === null || value === undefined ? 'None' : String(value);
}

/** Python's `str.title()`: every run of letters gets a capital first and lower case after. */
export function pyTitle(value: string): string {
	return value.replace(/\p{L}+/gu, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

/** `f'{price:,} KRW'` — 1200000 → "1,200,000 KRW". */
export function won(price: number): string {
	const [int, frac] = String(price).split('.');
	const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	return `${frac ? `${grouped}.${frac}` : grouped} KRW`;
}

/** `len(s.strip()) >= 30`, counted in characters (code points), as Python does. */
export function hasContent(text: string | null | undefined): boolean {
	return [...(text ?? '').trim()].length >= MIN_CONTENT_CHARS;
}

export function hoursText(hours: T[] = []): string {
	const byDay = new Map<number, T>();
	for (const h of hours) byDay.set(h.day, h);
	return WEEK.map((day) => {
		const h = byDay.get(day);
		if (!h || h.closed) return `- ${DAYS[day]}: closed`;
		return `- ${DAYS[day]}: ${py(h.open)}–${py(h.close)}`;
	}).join('\n');
}

export const docIds = {
	clinic: (id: unknown) => `clinic-${String(id)}`,
	treatment: (id: unknown) => `treatment-${String(id)}`,
	tip: (id: unknown) => `tip-${String(id)}`,
	notice: (category: string, id: unknown) => `${category.toLowerCase()}-${String(id)}`,
};

/** Navi owns these (written by hand in its repository); MedVia never deletes them. */
export function isMedviaDocId(docId: string): boolean {
	return /^(clinic|treatment|tip|faq|notice)-/.test(docId);
}

/**
 * The clinic, its doctors (newest first, as getDoctors lists them) and its treatments (cheapest
 * first, as getClinicTreatments lists them).
 */
export function clinicDocument(clinic: T, doctors: T[], treatments: T[]): NaviDocument {
	const name: string = clinic.clinicName;
	const langs = (clinic.clinicLangs ?? []).join(', ');
	const interp = (clinic.clinicInterpreterLangs ?? []).join(', ') || 'none';
	const text =
		`# ${name} (${py(clinic.clinicNameKo)})\n\n` +
		`${name} is a ${String(clinic.clinicSpecialty).replace(/_/g, ' ').toLowerCase()} clinic in ` +
		`${pyTitle(clinic.clinicDistrict)}-gu, Seoul. Address: ${py(clinic.clinicAddress)}. ` +
		`Phone: ${py(clinic.clinicPhone)}.\n\n${py(clinic.clinicDesc)}\n\n` +
		`## Languages\n\nConsultations in: ${langs}. Interpreter languages: ${interp}.\n\n` +
		`## Opening hours (Seoul time)\n\n${hoursText(clinic.clinicHours)}\n\n` +
		`## Doctors\n\n` +
		doctors
			.map(
				(d) =>
					`- ${py(d.doctorName)} (${py(d.doctorNameKo)}), ${py(d.doctorExperience)} years of ` +
					`experience. ${py(d.doctorBio)}`,
			)
			.join('\n') +
		'\n\n## Treatments\n\n' +
		treatments
			.map(
				(t) =>
					`- ${t.treatmentName}: from ${won(t.treatmentPrice)}, ${py(t.treatmentDuration)} minutes.`,
			)
			.join('\n');
	return {
		doc_id: docIds.clinic(clinic._id),
		title: name,
		source_type: 'clinic',
		lang: 'EN',
		text,
		meta: { clinicId: String(clinic._id), clinicName: name, district: clinic.clinicDistrict },
	};
}

/** `treatment.doctors`: its live doctors, oldest first (the $lookup of getClinicTreatments). */
export function treatmentDocument(clinic: T, treatment: T): NaviDocument {
	const name: string = clinic.clinicName;
	const t = treatment;
	const doctorsOf = (t.doctors ?? []).map((d: T) => d.doctorName).join(', ') || 'any doctor';
	let text =
		`# ${t.treatmentName} at ${name}\n\n` +
		`${t.treatmentName} at ${name} (${pyTitle(clinic.clinicDistrict)}-gu) costs from ` +
		`${won(t.treatmentPrice)} and takes ${py(t.treatmentDuration)} minutes. ` +
		`${t.treatmentPriceNote || ''}\n\n${py(t.treatmentDesc)}\n\n` +
		`Performed by: ${doctorsOf}.`;
	if (t.treatmentAftercare) text += `\n\n## Aftercare\n\n${t.treatmentAftercare}`;
	return {
		doc_id: docIds.treatment(t._id),
		title: `${t.treatmentName} at ${name}`,
		source_type: 'treatment',
		lang: 'EN',
		text,
		meta: {
			clinicId: String(clinic._id),
			clinicName: name,
			treatmentName: t.treatmentName,
			price: t.treatmentPrice,
			duration: t.treatmentDuration,
		},
	};
}

/** `authorName` is the public byline ("Dr. Han Seo-yeon", "MedVia"), as getArticles shows it. */
export function tipDocument(article: T, authorName: string): NaviDocument {
	return {
		doc_id: docIds.tip(article._id),
		title: article.articleTitle,
		source_type: 'health_tip',
		lang: article.articleLang || 'EN',
		text: `# ${article.articleTitle}\n\n${article.articleContent}\n\nWritten by ${authorName}.`,
		meta: {},
	};
}

/** The notice in its own (English) words — no reader language, like an anonymous visitor. */
export function noticeDocument(notice: T): NaviDocument {
	const category = String(notice.noticeCategory).toLowerCase() as 'faq' | 'notice';
	return {
		doc_id: docIds.notice(notice.noticeCategory, notice._id),
		title: notice.noticeTitle,
		source_type: category,
		lang: 'EN',
		text: `# ${notice.noticeTitle}\n\n${notice.noticeContent}`,
		meta: { faqCategory: notice.noticeFaqCategory ?? null },
	};
}

export function chunk<V>(items: V[], size: number): V[][] {
	const out: V[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
}

/**
 * Ids Navi may still hold but must not: every id MedVia could ever have sent for these rows,
 * minus the live ones. Navi answers 404 for the ones it never had — that costs one lookup.
 */
export function staleIds(candidates: string[], live: Set<string>): string[] {
	return [...new Set(candidates)].filter((id) => isMedviaDocId(id) && !live.has(id));
}
