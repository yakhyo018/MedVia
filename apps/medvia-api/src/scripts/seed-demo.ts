/**
 * A demo database that looks alive: 20 Seoul clinics, 40 doctors, 100 patients from Russia,
 * Uzbekistan and Kazakhstan, two weeks of open slots, 300 bookings in every status, verified
 * reviews, community posts, notices and FAQ.
 *
 *   npm run seed:demo              refuses if the demo data already exists
 *   npm run seed:demo -- --reset   removes the demo data (and only it), then seeds again
 *
 * Never in production. Every account is <name>@seed.medvia.test with SEED_PASSWORD from .env;
 * the demo logins are feride@seed.medvia.test (patient), clinic01@seed.medvia.test (clinic),
 * doctor01@seed.medvia.test (doctor) and admin@seed.medvia.test (admin).
 *
 * Fast on purpose: documents are built with the real schemas (defaults, casting, validation)
 * and inserted in bulk, not sent through the API. The rules still hold: answers are
 * encrypted, statuses and slots agree, and the derived numbers (followers, prices, ratings,
 * "Recommended") are computed by the batch's own RECOUNT and RANK at the end.
 */
import 'reflect-metadata';
import 'dotenv/config';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import mongoose, { Model, Schema, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { faker, fakerRU, fakerUZ_UZ_latin } from '@faker-js/faker';
import MemberSchema from '../schemas/Member.model';
import ClinicSchema from '../schemas/Clinic.model';
import DoctorSchema from '../schemas/Doctor.model';
import TreatmentSchema from '../schemas/Treatment.model';
import SlotSchema from '../schemas/Slot.model';
import BookingSchema from '../schemas/Booking.model';
import ReviewSchema from '../schemas/Review.model';
import BoardArticleSchema from '../schemas/BoardArticle.model';
import CommentSchema from '../schemas/Comment.model';
import NoticeSchema from '../schemas/Notice.model';
import FollowSchema from '../schemas/Follow.model';
import LikeSchema from '../schemas/Like.model';
import ViewSchema from '../schemas/View.model';
import ReportSchema from '../schemas/Report.model';
import NotificationSchema from '../schemas/Notification.model';
import ChatRoomSchema from '../schemas/ChatRoom.model';
import ChatMessageSchema from '../schemas/ChatMessage.model';
import AccessLogSchema from '../schemas/AccessLog.model';
import InquirySchema from '../schemas/Inquiry.model';
import SessionSchema from '../schemas/Session.model';
import { MemberAuthType, MemberType } from '../libs/enums/member.enum';
import { Language } from '../libs/enums/common.enum';
import { ClinicStatus } from '../libs/enums/clinic.enum';
import { DoctorStatus } from '../libs/enums/doctor.enum';
import { TreatmentStatus } from '../libs/enums/treatment.enum';
import {
	BookingActor,
	BookingConsentType,
	BookingStatus,
	SlotStatus,
} from '../libs/enums/booking.enum';
import { ReplierType, ReviewStatus, ReviewTag } from '../libs/enums/review.enum';
import { BoardArticleCategory } from '../libs/enums/board-article.enum';
import { NoticeCategory, NoticeStatus } from '../libs/enums/notice.enum';
import { LikeGroup } from '../libs/enums/like.enum';
import { T } from '../libs/types/common';
import { encrypt, parseKey } from '../libs/utils/crypto.util';
import { AI_CONSENT_VERSION, escapeRegex } from '../libs/config';
import {
	makeBookingCode,
	respondDeadline,
	seoulDateOf,
	seoulToUtc,
	slotsNeeded,
	snapshotConsents,
} from '../components/booking/booking.rules';
import { BatchCacheService } from '../../../medvia-batch/src/batch-cache.service';
import { RecountService } from '../../../medvia-batch/src/jobs/recount.service';
import { RankService } from '../../../medvia-batch/src/jobs/rank.service';
import {
	AI_SUMMARIES,
	ANSWERS,
	CLINICS,
	DISTRICT_ADDRESS,
	DISTRICT_CENTRE,
	DOCTOR_ANSWERS,
	FAQ,
	FREE_POSTS,
	HEALTH_TIPS,
	KAZAKH_NAMES,
	KOREAN_GIVEN,
	KOREAN_SURNAMES,
	MENU,
	NOTICES,
	PATIENT_COMMENTS,
	QNA_POSTS,
	QUESTIONS,
	REVIEW_REPLIES,
	REVIEWS,
} from './seed/seed-data';

const DOMAIN = '@seed.medvia.test';
const SEED = 2026;
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const PAST_DAYS = 60;
const FUTURE_DAYS = 14;
/** 10:00 … 17:30, every 30 minutes. */
const SLOT_TIMES = Array.from({ length: 16 }, (_, i) => 600 + i * 30);
const PHOTO = path.join(
	__dirname,
	'..',
	'..',
	'..',
	'..',
	'postman',
	'fixtures',
	'clinic-photo.png',
);
const UPLOADS = path.join(__dirname, '..', '..', '..', '..', 'uploads', 'clinic');

const STATUS_PLAN: [BookingStatus, number, 'past' | 'future'][] = [
	[BookingStatus.COMPLETED, 150, 'past'],
	[BookingStatus.NO_SHOW, 10, 'past'],
	[BookingStatus.CANCELLED, 15, 'past'],
	[BookingStatus.DECLINED, 10, 'past'],
	[BookingStatus.EXPIRED, 15, 'past'],
	[BookingStatus.CONFIRMED, 70, 'future'],
	[BookingStatus.PENDING, 30, 'future'],
];

const pick = <V>(list: readonly V[]): V => faker.helpers.arrayElement(list);
const chance = (p: number) => faker.number.float() < p;
const id = () => new Types.ObjectId();

type Models = Record<string, Model<T>>;

function models(): Models {
	const def = (name: string, schema: Schema) => mongoose.model<T>(name, schema);
	return {
		Member: def('Member', MemberSchema),
		Clinic: def('Clinic', ClinicSchema),
		Doctor: def('Doctor', DoctorSchema),
		Treatment: def('Treatment', TreatmentSchema),
		Slot: def('Slot', SlotSchema),
		Booking: def('Booking', BookingSchema),
		Review: def('Review', ReviewSchema),
		BoardArticle: def('BoardArticle', BoardArticleSchema),
		Comment: def('Comment', CommentSchema),
		Notice: def('Notice', NoticeSchema),
		Follow: def('Follow', FollowSchema),
		Like: def('Like', LikeSchema),
		View: def('View', ViewSchema),
		Report: def('Report', ReportSchema),
		Notification: def('Notification', NotificationSchema),
		ChatRoom: def('ChatRoom', ChatRoomSchema),
		ChatMessage: def('ChatMessage', ChatMessageSchema),
		AccessLog: def('AccessLog', AccessLogSchema),
		Inquiry: def('Inquiry', InquirySchema),
		Session: def('Session', SessionSchema),
	};
}

/**
 * Built through the schema — defaults, casting, validation — then written in one bulk insert
 * with the timestamps we chose (a review from last month must say last month).
 */
async function insert(model: Model<T>, docs: T[], now: Date): Promise<T[]> {
	if (!docs.length) return [];
	const raw = docs.map((data) => {
		const doc = new model(data);
		const error = doc.validateSync();
		if (error) throw new Error(`${model.modelName}: ${error.message}`);
		const plain: T = doc.toObject();
		plain.createdAt = data.createdAt ?? now;
		plain.updatedAt = data.updatedAt ?? plain.createdAt;
		return plain;
	});
	await model.collection.insertMany(raw);
	return raw;
}

/* ───────────────────────── reset ───────────────────────── */

async function reset(m: Models): Promise<void> {
	const members = await m.Member.find(
		{ memberEmail: { $regex: `${escapeRegex(DOMAIN)}$` } },
		{ _id: 1 },
	).lean();
	const memberIds = members.map((x) => x._id);
	if (!memberIds.length) return console.log('No demo data to remove.');

	const clinics = await m.Clinic.find(
		{ memberId: { $in: memberIds } },
		{ _id: 1, clinicImages: 1 },
	).lean();
	const clinicIds = clinics.map((c) => c._id);
	const doctorIds = (await m.Doctor.find({ clinicId: { $in: clinicIds } }, { _id: 1 }).lean()).map(
		(d) => d._id,
	);
	const articleIds = (
		await m.BoardArticle.find({ memberId: { $in: memberIds } }, { _id: 1 }).lean()
	).map((a) => a._id);
	const bookingIds = (
		await m.Booking.find(
			{ $or: [{ clinicId: { $in: clinicIds } }, { memberId: { $in: memberIds } }] },
			{ _id: 1 },
		).lean()
	).map((b) => b._id);
	const roomIds = (
		await m.ChatRoom.find(
			{ $or: [{ clinicId: { $in: clinicIds } }, { memberId: { $in: memberIds } }] },
			{ _id: 1 },
		).lean()
	).map((r) => r._id);
	const refIds = [...clinicIds, ...doctorIds, ...articleIds];

	// Demo data only — the app itself never hard-deletes; this removes what the seed created.
	await Promise.all([
		m.ChatMessage.deleteMany({ roomId: { $in: roomIds } }),
		m.ChatRoom.deleteMany({ _id: { $in: roomIds } }),
		m.Review.deleteMany({ bookingId: { $in: bookingIds } }),
		m.AccessLog.deleteMany({ bookingId: { $in: bookingIds } }),
		m.Slot.deleteMany({ clinicId: { $in: clinicIds } }),
		m.Treatment.deleteMany({ clinicId: { $in: clinicIds } }),
		m.Comment.deleteMany({
			$or: [{ memberId: { $in: memberIds } }, { articleId: { $in: articleIds } }],
		}),
		m.Report.deleteMany({
			$or: [{ memberId: { $in: memberIds } }, { reportRefId: { $in: articleIds } }],
		}),
		m.Follow.deleteMany({
			$or: [{ followerId: { $in: memberIds } }, { followingId: { $in: memberIds } }],
		}),
		m.Like.deleteMany({ $or: [{ memberId: { $in: memberIds } }, { likeRefId: { $in: refIds } }] }),
		m.View.deleteMany({ $or: [{ memberId: { $in: memberIds } }, { viewRefId: { $in: refIds } }] }),
		m.Notice.deleteMany({ memberId: { $in: memberIds } }),
		m.Notification.deleteMany({ receiverId: { $in: memberIds } }),
		m.Inquiry.deleteMany({ memberId: { $in: memberIds } }),
		m.Session.deleteMany({ memberId: { $in: memberIds } }),
	]);
	await m.Booking.deleteMany({ _id: { $in: bookingIds } });
	await m.BoardArticle.deleteMany({ _id: { $in: articleIds } });
	await m.Doctor.deleteMany({ _id: { $in: doctorIds } });
	await m.Clinic.deleteMany({ _id: { $in: clinicIds } });
	await m.Member.deleteMany({ _id: { $in: memberIds } });

	for (const clinic of clinics) {
		for (const image of clinic.clinicImages ?? []) {
			fs.rmSync(path.join(UPLOADS, '..', '..', image), { force: true });
		}
	}
	console.log(`Removed the demo data of ${memberIds.length} accounts.`);
}

/* ───────────────────────── seed ───────────────────────── */

async function seed(m: Models, password: string): Promise<void> {
	faker.seed(SEED);
	fakerRU.seed(SEED);
	fakerUZ_UZ_latin.seed(SEED);
	const now = new Date();
	const key = parseKey(process.env.MEDICAL_ENC_KEY);
	const hash = await bcrypt.hash(password, 10);
	const daysAgo = (d: number) => new Date(now.getTime() - d * DAY);
	const account = (
		email: string,
		memberType: MemberType,
		memberFullName: string,
		extra: T = {},
	): T => ({
		_id: id(),
		memberType,
		memberAuthType: MemberAuthType.EMAIL,
		memberEmail: `${email}${DOMAIN}`,
		memberPassword: hash,
		memberFullName,
		memberTermsAt: daysAgo(120),
		createdAt: daysAgo(faker.number.int({ min: 60, max: 180 })),
		...extra,
	});

	/* members */
	const admin = account('admin', MemberType.ADMIN, 'MedVia Team', { memberLang: Language.EN });
	const clinicAccounts = CLINICS.map((_, i) =>
		account(
			`clinic${String(i + 1).padStart(2, '0')}`,
			MemberType.AGENT,
			`${pick(KOREAN_SURNAMES)[0]} ${pick(KOREAN_GIVEN)[0]}`,
			{
				memberLang: Language.KO,
				memberCountry: 'Korea',
			},
		),
	);
	const doctorNames = Array.from({ length: CLINICS.length * 2 }, (_, i) => [
		KOREAN_SURNAMES[i % KOREAN_SURNAMES.length],
		KOREAN_GIVEN[(i * 7) % KOREAN_GIVEN.length],
	]);
	const doctorAccounts = doctorNames.map(([sur, given], i) =>
		account(`doctor${String(i + 1).padStart(2, '0')}`, MemberType.DOCTOR, `${sur[0]} ${given[0]}`, {
			memberLang: Language.KO,
			memberCountry: 'Korea',
		}),
	);
	const patient = (email: string, name: string, lang: Language, country: string) =>
		account(email, MemberType.USER, name, {
			memberLang: lang,
			memberCountry: country,
			memberLastLoginAt: daysAgo(faker.number.int({ min: 0, max: 20 })),
			...(chance(0.6)
				? { memberAiConsentAt: daysAgo(30), memberAiConsentVersion: AI_CONSENT_VERSION }
				: {}),
		});
	const patients: T[] = [
		patient('feride', 'Feride Karimova', Language.RU, 'Uzbekistan'),
		patient('yahyo', 'Yahyo Choriyev', Language.UZ, 'Uzbekistan'),
	];
	for (let i = 0; i < 98; i++) {
		const female = chance(0.6);
		const sex = female ? 'female' : 'male';
		const tag = `patient${String(i + 1).padStart(3, '0')}`;
		if (i < 38) {
			patients.push(
				patient(
					tag,
					`${fakerRU.person.firstName(sex)} ${fakerRU.person.lastName(sex)}`,
					Language.RU,
					pick(['Russia', 'Russia', 'Kazakhstan']),
				),
			);
		} else if (i < 73) {
			patients.push(
				patient(
					tag,
					`${fakerUZ_UZ_latin.person.firstName(sex)} ${fakerUZ_UZ_latin.person.lastName(sex)}`,
					Language.UZ,
					'Uzbekistan',
				),
			);
		} else {
			const surname = pick(KAZAKH_NAMES.surname);
			patients.push(
				patient(
					tag,
					`${pick(KAZAKH_NAMES[sex])} ${female ? `${surname}a` : surname}`,
					Language.KK,
					'Kazakhstan',
				),
			);
		}
	}
	await insert(m.Member, [admin, ...clinicAccounts, ...doctorAccounts, ...patients], now);

	/* clinics, with a real photo file each */
	fs.mkdirSync(UPLOADS, { recursive: true });
	const clinics: T[] = CLINICS.map((c, i) => {
		const [lat, lng] = DISTRICT_CENTRE[c.district];
		const image = `uploads/clinic/${randomUUID()}.png`;
		fs.copyFileSync(PHOTO, path.join(UPLOADS, path.basename(image)));
		const langs = [
			Language.KO,
			Language.EN,
			...faker.helpers.arrayElements([Language.RU, Language.UZ, Language.KK], { min: 1, max: 3 }),
		];
		const submittedAt = daysAgo(faker.number.int({ min: 90, max: 170 }));
		return {
			_id: id(),
			clinicStatus: ClinicStatus.ACTIVE,
			clinicName: c.name,
			clinicNameKo: c.nameKo,
			clinicSpecialty: c.specialty,
			clinicDistrict: c.district,
			clinicAddress: `${faker.number.int({ min: 10, max: 480 })} ${DISTRICT_ADDRESS[c.district]}`,
			clinicLocation: {
				type: 'Point',
				coordinates: [
					lng + faker.number.float({ min: -0.01, max: 0.01 }),
					lat + faker.number.float({ min: -0.008, max: 0.008 }),
				],
			},
			clinicPhone: `02-${faker.number.int({ min: 2000, max: 9999 })}-${faker.number.int({ min: 1000, max: 9999 })}`,
			// Monday to Saturday; Sunday closed — no slots on Sundays below.
			clinicHours: [1, 2, 3, 4, 5, 6].map((day) => ({ day, open: '09:00', close: '19:00' })),
			clinicLangs: langs,
			clinicInterpreterLangs: langs.filter((l) => l !== Language.KO && l !== Language.EN),
			clinicImages: [image],
			clinicDesc: `${c.name} in ${c.district.charAt(0)}${c.district.slice(1).toLowerCase()}-gu. Interpreters for ${langs.slice(2).join(', ')}.`,
			clinicViews: faker.number.int({ min: 80, max: 2400 }),
			memberId: clinicAccounts[i]._id,
			submittedAt,
			verifiedAt: new Date(submittedAt.getTime() + 2 * DAY),
			createdAt: submittedAt,
		};
	});
	await insert(m.Clinic, clinics, now);

	/* doctors: two per clinic */
	const doctors: T[] = doctorAccounts.map((acc, i) => {
		const clinic = clinics[Math.floor(i / 2)];
		const [sur, given] = doctorNames[i];
		return {
			_id: id(),
			doctorStatus: DoctorStatus.ACTIVE,
			doctorName: `${sur[0]} ${given[0]}`,
			doctorNameKo: `${sur[1]}${given[1]}`,
			doctorSpecialty: clinic.clinicSpecialty,
			doctorExperience: faker.number.int({ min: 4, max: 22 }),
			doctorLangs: [Language.KO, Language.EN],
			doctorBio: `Board-certified in ${clinic.clinicSpecialty.toLowerCase().replace('_', ' ')}.`,
			doctorViews: faker.number.int({ min: 30, max: 900 }),
			clinicId: clinic._id,
			memberId: acc._id,
			createdAt: clinic.createdAt,
		};
	});
	await insert(m.Doctor, doctors, now);

	/* treatments: four per clinic */
	const treatments: T[] = clinics.flatMap((clinic, i) =>
		faker.helpers
			.arrayElements(MENU[clinic.clinicSpecialty as keyof typeof MENU], 4)
			.map((item) => ({
				_id: id(),
				treatmentStatus: TreatmentStatus.ACTIVE,
				treatmentName: item.name,
				treatmentCategory: item.category,
				treatmentDuration: item.duration,
				treatmentPrice:
					Math.round((item.price * faker.number.float({ min: 0.85, max: 1.2 })) / 1000) * 1000,
				treatmentDesc: item.desc,
				treatmentLangs: clinic.clinicLangs,
				doctorIds: chance(0.7)
					? [doctors[i * 2]._id, doctors[i * 2 + 1]._id]
					: [doctors[i * 2 + faker.number.int(1)]._id],
				clinicId: clinic._id,
				submittedAt: clinic.verifiedAt,
				verifiedAt: new Date(clinic.verifiedAt.getTime() + DAY),
				createdAt: clinic.verifiedAt,
			})),
	);
	await insert(m.Treatment, treatments, now);

	/* bookings and their slots */
	const today = seoulDateOf(now);
	const seoulDay = (offset: number) =>
		seoulDateOf(new Date(Date.parse(`${today}T03:00:00Z`) + offset * DAY));
	const openOn = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() !== 0;
	const taken = new Set<string>(); // doctorId|start
	const slots: T[] = [];
	const bookings: T[] = [];
	const codes = new Set<string>();

	/** A free run of slots for one doctor on a day in the window. */
	const findTime = (doctorId: Types.ObjectId, span: 'past' | 'future', count: number) => {
		for (let attempt = 0; attempt < 50; attempt++) {
			const offset =
				span === 'past'
					? -faker.number.int({ min: 2, max: PAST_DAYS })
					: faker.number.int({ min: 1, max: FUTURE_DAYS });
			const date = seoulDay(offset);
			if (!openOn(date)) continue;
			const first = faker.number.int({ min: 0, max: SLOT_TIMES.length - count });
			const starts = SLOT_TIMES.slice(first, first + count).map((minutes) =>
				seoulToUtc(date, minutes),
			);
			if (starts.every((s) => !taken.has(`${doctorId}|${s.toISOString()}`))) {
				starts.forEach((s) => taken.add(`${doctorId}|${s.toISOString()}`));
				return starts;
			}
		}
		return null;
	};

	for (const [status, count, span] of STATUS_PLAN) {
		for (let n = 0; n < count; n++) {
			// The personas get one of each story: Feride a past visit and an upcoming one, Yahyo a
			// request the clinic has not answered yet.
			const persona: Partial<Record<BookingStatus, T>> = {
				[BookingStatus.COMPLETED]: patients[0],
				[BookingStatus.CONFIRMED]: patients[0],
				[BookingStatus.PENDING]: patients[1],
			};
			const who = (n === 0 && persona[status]) || pick(patients);
			const clinicIndex = faker.number.int(clinics.length - 1);
			const clinic = clinics[clinicIndex];
			const treatment = pick(treatments.filter((t) => String(t.clinicId) === String(clinic._id)));
			const doctorId: Types.ObjectId = pick(treatment.doctorIds);
			const starts = findTime(doctorId, span, slotsNeeded(treatment.treatmentDuration));
			if (!starts) continue;
			const bookingDate = starts[0];

			const createdAt =
				span === 'future'
					? new Date(
							now.getTime() -
								(status === BookingStatus.PENDING
									? faker.number.int({ min: 1, max: 20 }) * HOUR
									: faker.number.int({ min: 1, max: 6 }) * DAY),
						)
					: new Date(bookingDate.getTime() - faker.number.int({ min: 2, max: 10 }) * DAY);
			const deadline = respondDeadline(createdAt, bookingDate);
			const lang: Language =
				who.memberLang === Language.KK ? (chance(0.5) ? Language.KK : Language.RU) : who.memberLang;
			const answerLang = ANSWERS[lang] ? lang : Language.RU;
			const answers = pick(ANSWERS[answerLang]!).map((answer, i) => ({
				question: QUESTIONS[i],
				answer,
			}));
			const aiConsent = chance(0.5);
			const consents = snapshotConsents(
				[
					{ consentType: BookingConsentType.SHARE_DATA, agreed: true },
					{ consentType: BookingConsentType.BOOKING_TERMS, agreed: true },
					...(aiConsent ? [{ consentType: BookingConsentType.AI_SUMMARY, agreed: true }] : []),
				],
				createdAt,
			);
			let code = makeBookingCode(createdAt, () => faker.number.float());
			while (codes.has(code)) code = makeBookingCode(createdAt, () => faker.number.float());
			codes.add(code);

			const clinicAccountId = clinic.memberId;
			const decided = new Date(
				Math.min(
					createdAt.getTime() + faker.number.int({ min: 1, max: 20 }) * HOUR,
					deadline.getTime() - HOUR,
				),
			);
			const history: T[] = [
				{ status: BookingStatus.PENDING, changedBy: who._id, changedAt: createdAt },
			];
			const booking: T = {
				_id: id(),
				bookingCode: code,
				bookingStatus: status,
				bookingDate,
				bookingPrice: treatment.treatmentPrice,
				bookingLang: lang,
				bookingInterpreter: clinic.clinicInterpreterLangs.includes(lang) ? lang : undefined,
				bookingQuestionnaire: {
					answersEnc: encrypt(JSON.stringify(answers), key),
					originalLang: answerLang,
				},
				bookingAiSummaryEnc: aiConsent ? encrypt(pick(AI_SUMMARIES), key) : undefined,
				bookingConsents: consents,
				bookingHistory: history,
				respondDeadline: deadline,
				memberId: who._id,
				clinicId: clinic._id,
				doctorId,
				treatmentId: treatment._id,
				createdAt,
			};
			if (
				[BookingStatus.CONFIRMED, BookingStatus.COMPLETED, BookingStatus.NO_SHOW].includes(status)
			) {
				history.push({
					status: BookingStatus.CONFIRMED,
					changedBy: clinicAccountId,
					changedAt: decided,
				});
			}
			if (status === BookingStatus.COMPLETED || status === BookingStatus.NO_SHOW) {
				const at = new Date(bookingDate.getTime() + HOUR);
				history.push({ status, changedBy: clinicAccountId, changedAt: at });
				if (status === BookingStatus.COMPLETED) booking.completedAt = at;
			}
			if (status === BookingStatus.DECLINED) {
				booking.bookingDeclineReason = pick([
					'The doctor is away that day',
					'Fully booked at that time',
					'Please choose a longer slot',
				]);
				history.push({
					status,
					changedBy: clinicAccountId,
					reason: booking.bookingDeclineReason,
					changedAt: decided,
				});
			}
			if (status === BookingStatus.CANCELLED) {
				booking.cancelledBy = BookingActor.PATIENT;
				history.push({ status, changedBy: who._id, changedAt: decided });
			}
			if (status === BookingStatus.EXPIRED) {
				history.push({
					status,
					reason: 'The clinic did not answer before the deadline',
					changedAt: deadline,
				});
			}

			const holds = status === BookingStatus.PENDING;
			const keeps = [
				BookingStatus.CONFIRMED,
				BookingStatus.COMPLETED,
				BookingStatus.NO_SHOW,
			].includes(status);
			booking.slotIds = starts.map((slotStart) => {
				const slot: T = {
					_id: id(),
					slotStart,
					doctorId,
					clinicId: clinic._id,
					slotStatus: SlotStatus.OPEN,
					createdAt: new Date(createdAt.getTime() - DAY),
				};
				if (keeps) Object.assign(slot, { slotStatus: SlotStatus.BOOKED, bookingId: booking._id });
				if (holds)
					Object.assign(slot, {
						slotStatus: SlotStatus.HELD,
						bookingId: booking._id,
						holdMemberId: who._id,
						holdExpiresAt: deadline,
					});
				slots.push(slot);
				return slot._id;
			});
			bookings.push(booking);
		}
	}

	// Every other future slot of every doctor is open: the calendar a patient books from.
	for (const doctor of doctors) {
		for (let offset = 1; offset <= FUTURE_DAYS; offset++) {
			const date = seoulDay(offset);
			if (!openOn(date)) continue;
			for (const minutes of SLOT_TIMES) {
				const slotStart = seoulToUtc(date, minutes);
				if (taken.has(`${doctor._id}|${slotStart.toISOString()}`)) continue;
				slots.push({
					_id: id(),
					slotStart,
					doctorId: doctor._id,
					clinicId: doctor.clinicId,
					slotStatus: SlotStatus.OPEN,
					createdAt: daysAgo(7),
				});
			}
		}
	}
	await insert(m.Slot, slots, now);

	/* verified reviews for most completed visits */
	const reviews: T[] = [];
	for (const booking of bookings.filter((b) => b.bookingStatus === BookingStatus.COMPLETED)) {
		if (!chance(0.93)) continue;
		const submittedAt = new Date(
			Math.min(
				booking.completedAt.getTime() + faker.number.int({ min: 1, max: 5 }) * DAY,
				now.getTime() - HOUR,
			),
		);
		const reviewLang = REVIEWS[booking.bookingLang as Language] ? booking.bookingLang : Language.RU;
		const status = chance(0.9) ? ReviewStatus.ACTIVE : ReviewStatus.PENDING;
		const review: T = {
			_id: id(),
			reviewStatus: status,
			reviewRating: pick([5, 5, 5, 5, 4, 4, 4, 3, 5, 2]),
			reviewTags: faker.helpers.arrayElements(Object.values(ReviewTag), { min: 1, max: 3 }),
			reviewContent: pick(REVIEWS[reviewLang as Language]!),
			reviewLang,
			submittedAt,
			bookingId: booking._id,
			memberId: booking.memberId,
			clinicId: booking.clinicId,
			doctorId: booking.doctorId,
			treatmentId: booking.treatmentId,
			createdAt: submittedAt,
		};
		if (status === ReviewStatus.ACTIVE && chance(0.35)) {
			const byDoctor = chance(0.4);
			const replier = byDoctor
				? doctors.find((d) => String(d._id) === String(booking.doctorId))!.memberId
				: clinics.find((c) => String(c._id) === String(booking.clinicId))!.memberId;
			review.reviewReply = {
				replyContent: pick(REVIEW_REPLIES),
				replyLang: Language.EN,
				replierId: replier,
				replierType: byDoctor ? ReplierType.DOCTOR : ReplierType.CLINIC,
				repliedAt: new Date(submittedAt.getTime() + DAY),
			};
		}
		booking.bookingReviewed = true;
		reviews.push(review);
	}
	await insert(m.Booking, bookings, now);
	await insert(m.Review, reviews, now);

	/* community */
	const articles: T[] = [];
	const comments: T[] = [];
	const addArticle = (
		category: BoardArticleCategory,
		author: T,
		title: string,
		content: string,
		lang: Language,
	) => {
		const createdAt = daysAgo(faker.number.int({ min: 1, max: 45 }));
		const article: T = {
			_id: id(),
			articleCategory: category,
			articleTitle: title,
			articleContent: content,
			articleLang: lang,
			articleViews: faker.number.int({ min: 20, max: 450 }),
			memberId: author._id,
			createdAt,
		};
		articles.push(article);
		const comment = (who: T, text: string, type: MemberType, lang: Language) =>
			comments.push({
				_id: id(),
				commentContent: text,
				commentLang: lang,
				commentAuthorType: type,
				articleId: article._id,
				memberId: who._id,
				createdAt: new Date(createdAt.getTime() + faker.number.int({ min: 1, max: 72 }) * HOUR),
			});
		for (let i = 0; i < faker.number.int({ min: 1, max: 3 }); i++) {
			const who = pick(patients);
			const commentLang = PATIENT_COMMENTS[who.memberLang as Language]
				? who.memberLang
				: Language.RU;
			comment(who, pick(PATIENT_COMMENTS[commentLang as Language]!), MemberType.USER, commentLang);
		}
		if (category === BoardArticleCategory.QNA && chance(0.8)) {
			comment(pick(doctorAccounts), pick(DOCTOR_ANSWERS), MemberType.DOCTOR, Language.EN);
			article.articleAnswered = true;
		}
	};
	for (const post of [...QNA_POSTS, ...QNA_POSTS]) {
		addArticle(
			BoardArticleCategory.QNA,
			pick(patients.filter((p) => p.memberLang === post.lang || post.lang === Language.EN)),
			post.title,
			post.content,
			post.lang,
		);
	}
	for (const post of FREE_POSTS) {
		addArticle(
			BoardArticleCategory.FREE,
			pick(patients.filter((p) => p.memberLang === post.lang || post.lang === Language.EN)),
			post.title,
			post.content,
			post.lang,
		);
	}
	for (const tip of HEALTH_TIPS)
		addArticle(
			BoardArticleCategory.HEALTH_TIP,
			pick(doctorAccounts),
			tip.title,
			tip.content,
			Language.EN,
		);
	for (const article of articles)
		article.articleComments = comments.filter((c) => c.articleId === article._id).length;

	/* follows and likes, then their counters */
	const follows = new Map<string, T>();
	while (follows.size < 120) {
		const follower = pick(patients);
		const target = chance(0.6) ? pick(clinicAccounts) : pick(doctorAccounts);
		follows.set(`${follower._id}|${target._id}`, {
			followerId: follower._id,
			followingId: target._id,
			followingType: target.memberType,
			createdAt: daysAgo(faker.number.int({ min: 1, max: 60 })),
		});
	}
	const likes = new Map<string, T>();
	const likeTargets: [LikeGroup, T[]][] = [
		[LikeGroup.CLINIC, clinics],
		[LikeGroup.DOCTOR, doctors],
		[LikeGroup.ARTICLE, articles],
	];
	while (likes.size < 250) {
		const [group, list] = pick(likeTargets);
		const target = pick(list);
		const member = pick(patients);
		likes.set(`${member._id}|${target._id}`, {
			likeGroup: group,
			likeRefId: target._id,
			memberId: member._id,
			createdAt: daysAgo(faker.number.int({ min: 1, max: 60 })),
		});
	}
	const likeCount = (refId: unknown) =>
		[...likes.values()].filter((l) => String(l.likeRefId) === String(refId)).length;
	for (const article of articles) article.articleLikes = likeCount(article._id);
	await insert(m.BoardArticle, articles, now);
	await insert(m.Comment, comments, now);
	await insert(m.Follow, [...follows.values()], now);
	await insert(m.Like, [...likes.values()], now);
	await Promise.all([
		...clinics.map((c) =>
			m.Clinic.updateOne(
				{ _id: c._id },
				{ $set: { clinicLikes: likeCount(c._id) } },
				{ timestamps: false },
			),
		),
		...doctors.map((d) =>
			m.Doctor.updateOne(
				{ _id: d._id },
				{ $set: { doctorLikes: likeCount(d._id) } },
				{ timestamps: false },
			),
		),
	]);

	/* notices and FAQ by the team */
	const notices = [
		...NOTICES.map((n, i) => ({
			noticeCategory: NoticeCategory.NOTICE,
			noticeStatus: NoticeStatus.ACTIVE,
			noticePinned: !!n.pinned,
			noticeTitle: n.title,
			noticeContent: n.content,
			noticeTranslations: n.ru ? [{ lang: Language.RU, title: n.ru[0], content: n.ru[1] }] : [],
			noticeViews: faker.number.int({ min: 40, max: 900 }),
			publishedAt: daysAgo(5 + i * 9),
			memberId: admin._id,
			createdAt: daysAgo(6 + i * 9),
		})),
		...FAQ.map((f) => ({
			noticeCategory: NoticeCategory.FAQ,
			noticeFaqCategory: f.category,
			noticeStatus: NoticeStatus.ACTIVE,
			noticeTitle: f.title,
			noticeContent: f.content,
			publishedAt: daysAgo(100),
			memberId: admin._id,
			createdAt: daysAgo(100),
		})),
	];
	await insert(m.Notice, notices, now);

	/* the derived numbers, by the batch's own code */
	const cache = new BatchCacheService();
	const recount = await new RecountService(
		m.Clinic,
		m.Doctor,
		m.Follow,
		m.Treatment,
		m.Review,
		cache,
	).run();
	const rank = await new RankService(m.Clinic, m.Doctor, m.Booking, cache).run();
	await cache.onModuleDestroy();

	console.log(
		[
			`Seeded: ${clinics.length} clinics, ${doctors.length} doctors, ${treatments.length} treatments, ${patients.length} patients,`,
			`${slots.length} slots, ${bookings.length} bookings, ${reviews.length} reviews, ${articles.length} posts, ${comments.length} comments,`,
			`${follows.size} follows, ${likes.size} likes, ${notices.length} notices and FAQ.`,
			`RECOUNT — ${recount}`,
			`RANK — ${rank}`,
			`Sign in with feride${DOMAIN}, clinic01${DOMAIN}, doctor01${DOMAIN} or admin${DOMAIN} and SEED_PASSWORD.`,
		].join('\n'),
	);
}

async function main(): Promise<void> {
	if (process.env.NODE_ENV === 'production') throw new Error('seed:demo never runs in production.');
	const password = process.env.SEED_PASSWORD;
	if (!password || password.length < 8)
		throw new Error('Set SEED_PASSWORD (at least 8 characters) in .env first.');
	if (!process.env.MONGO_DEV) throw new Error('No MONGO_DEV in .env.');

	await mongoose.connect(process.env.MONGO_DEV);
	const m = models();
	const exists = await m.Member.exists({ memberEmail: `admin${DOMAIN}` });
	if (process.argv.includes('--reset')) await reset(m);
	else if (exists)
		throw new Error('The demo data already exists. Run with -- --reset to rebuild it.');
	await seed(m, password);
	await mongoose.disconnect();
}

main().catch(async (err) => {
	console.error(`\n${err.message}\n`);
	await mongoose.disconnect();
	process.exit(1);
});
