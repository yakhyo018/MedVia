/**
 * The hand-written part of the demo database: what faker cannot make believable — Seoul clinics
 * with Korean names in real districts, a treatment menu per specialty, Kazakh names (faker has
 * no Kazakh locale), and the texts patients and doctors write.
 */
import { District, Specialty } from '../../libs/enums/clinic.enum';
import { TreatmentCategory } from '../../libs/enums/treatment.enum';
import { InquiryCategory } from '../../libs/enums/inquiry.enum';
import { Language } from '../../libs/enums/common.enum';

const { DERMATOLOGY, PLASTIC_SURGERY, DENTAL, CHECK_UP } = Specialty;
const { GANGNAM, SEOCHO, JUNG, MAPO, YONGSAN, JONGNO, SONGPA } = District;

/** [lat, lng] of each district's centre; clinics get a small offset from it. */
export const DISTRICT_CENTRE: Record<District, [number, number]> = {
	[GANGNAM]: [37.4979, 127.0276],
	[SEOCHO]: [37.4837, 127.0324],
	[JUNG]: [37.5636, 126.9976],
	[MAPO]: [37.5563, 126.9236],
	[YONGSAN]: [37.5326, 126.9905],
	[JONGNO]: [37.573, 126.9794],
	[SONGPA]: [37.5145, 127.1059],
};

export const DISTRICT_ADDRESS: Record<District, string> = {
	[GANGNAM]: 'Teheran-ro, Gangnam-gu, Seoul',
	[SEOCHO]: 'Seocho-daero, Seocho-gu, Seoul',
	[JUNG]: 'Myeongdong-gil, Jung-gu, Seoul',
	[MAPO]: 'Yanghwa-ro, Mapo-gu, Seoul',
	[YONGSAN]: 'Itaewon-ro, Yongsan-gu, Seoul',
	[JONGNO]: 'Insadong-gil, Jongno-gu, Seoul',
	[SONGPA]: 'Olympic-ro, Songpa-gu, Seoul',
};

/** One of a clinic's doctors: written by hand so the name, the portrait and the story agree. */
export interface SeedDoctor {
	name: string;
	nameKo: string;
	female: boolean;
	experience: number;
	bio: string;
	/** Earlier work before this clinic (generic places: a fictional doctor is never tied to a real one). */
	before?: string;
}

/** Opening hours: weekday 0 = Sunday … 6 = Saturday; a missing day is closed. */
export interface SeedHours {
	day: number;
	open: string;
	close: string;
}

export interface SeedClinic {
	/** File-name stem of the clinic's photos (seed/photos/clinics/<slug>-<n>.jpg). */
	slug: string;
	name: string;
	nameKo: string;
	specialty: Specialty;
	district: District;
	desc: string;
	hours: SeedHours[];
	doctors: [SeedDoctor, SeedDoctor, SeedDoctor];
}

const weekdays = (open: string, close: string, days = [1, 2, 3, 4, 5]): SeedHours[] =>
	days.map((day) => ({ day, open, close }));

/**
 * Eight fictional Seoul clinics, two per specialty, three doctors each. Every name was searched
 * (in Korean) on 2026-10-15 and matched no real clinic — the site shows ratings and reviews for
 * them, so they must never point at a real place or person.
 */
export const CLINICS: SeedClinic[] = [
	{
		slug: 'seoul-glow',
		name: 'Seoul Glow Dermatology',
		nameKo: '서울글로우피부과',
		specialty: DERMATOLOGY,
		district: GANGNAM,
		desc: 'A laser and pigmentation clinic two minutes from Gangnam Station. Most visitors come for toning and melasma care before a trip home, so every plan is written for a short stay — results, aftercare and the next visit fit into one week. Russian-speaking coordinator at the front desk.',
		hours: [
			...weekdays('10:00', '19:00', [1, 2, 3, 5]),
			{ day: 4, open: '10:00', close: '21:00' },
			{ day: 6, open: '10:00', close: '16:00' },
		],
		doctors: [
			{
				name: 'Han Seo-yeon',
				nameKo: '한서연',
				female: true,
				experience: 14,
				bio: 'Focuses on pigmentation — melasma, sun spots and post-acne marks — with low-energy laser toning that keeps downtime to a day.',
				before: 'Dermatologist at a skin clinic, Busan',
			},
			{
				name: 'Kim Tae-hoon',
				nameKo: '김태훈',
				female: false,
				experience: 8,
				bio: 'Treats acne and acne scars in steps: calming the skin first, then resurfacing. Explains every session with photos so patients can follow their progress.',
			},
			{
				name: 'Park Joon-ho',
				nameKo: '박준호',
				female: false,
				experience: 11,
				bio: 'Works with skin boosters and redness-prone skin. Prefers a few gentle sessions over one aggressive one, especially for first-time visitors.',
				before: 'Clinical fellow at a university hospital, Seoul',
			},
		],
	},
	{
		slug: 'myeongdong-mintleaf',
		name: 'Myeongdong Mintleaf Dermatology',
		nameKo: '명동민트리프피부과',
		specialty: DERMATOLOGY,
		district: JUNG,
		desc: 'A bright, small clinic above the Myeongdong shopping street, open on Sundays for travellers. Known for hydration and sensitive-skin programmes; consultations in Uzbek, Russian and Kazakh through the clinic interpreter.',
		hours: [
			...weekdays('10:30', '20:00', [1, 2, 3, 4, 5, 6]),
			{ day: 0, open: '11:00', close: '17:00' },
		],
		doctors: [
			{
				name: 'Lee Ha-eun',
				nameKo: '이하은',
				female: true,
				experience: 9,
				bio: 'Builds hydration and barrier-repair plans for dry and sensitive skin, often combined with a skin booster before a long flight home.',
			},
			{
				name: 'Choi Min-jae',
				nameKo: '최민재',
				female: false,
				experience: 16,
				bio: 'Senior dermatologist for scars and texture. Uses fractional laser carefully on darker skin types and plans sessions around the patient’s travel dates.',
				before: 'Dermatologist at a general hospital, Daegu',
			},
			{
				name: 'Yoon Jae-sung',
				nameKo: '윤재성',
				female: false,
				experience: 6,
				bio: 'Sees most first visits: skin analysis, a written plan in the patient’s language and an honest estimate of how many sessions are worth it.',
			},
		],
	},
	{
		slug: 'dosan-petalline',
		name: 'Dosan Petalline Clinic',
		nameKo: '도산페탈라인의원',
		specialty: PLASTIC_SURGERY,
		district: GANGNAM,
		desc: 'A non-surgical contouring clinic near Dosan Park: fillers, botox and thread lifts with a natural finish. Each treatment starts with a 3D face scan and a printed plan the patient takes home.',
		hours: [...weekdays('10:00', '19:00'), { day: 6, open: '10:00', close: '15:00' }],
		doctors: [
			{
				name: 'Jung Woo-jin',
				nameKo: '정우진',
				female: false,
				experience: 18,
				bio: 'Plastic surgeon who moved to non-surgical contouring. Known for conservative filler amounts — the goal is that friends notice rest, not work.',
				before: 'Plastic surgeon at a surgical clinic, Seoul',
			},
			{
				name: 'Kang Ye-jin',
				nameKo: '강예진',
				female: true,
				experience: 10,
				bio: 'Specialises in jawline botox and lip filler, with a slow, two-step approach for patients trying fillers for the first time.',
			},
			{
				name: 'Oh Seung-min',
				nameKo: '오승민',
				female: false,
				experience: 7,
				bio: 'Performs thread lifts and under-eye treatments; spends the extra time on aftercare instructions for patients flying within days.',
			},
		],
	},
	{
		slug: 'cheongdam-willowgate',
		name: 'Cheongdam Willowgate Clinic',
		nameKo: '청담윌로우게이트의원',
		specialty: PLASTIC_SURGERY,
		district: GANGNAM,
		desc: 'A quiet clinic in Cheongdam for lifting and anti-ageing: ultrasound and radio-frequency lifting, fillers and skin boosters. Private rooms, no waiting room — every patient has a fixed time.',
		hours: weekdays('09:30', '18:30', [1, 2, 3, 4, 5, 6]),
		doctors: [
			{
				name: 'Shin Hye-won',
				nameKo: '신혜원',
				female: true,
				experience: 20,
				bio: 'Medical director. Plans lifting by decade rather than by device — what to do now, and what to leave for later.',
				before: 'Plastic surgeon at a university-affiliated hospital, Incheon',
			},
			{
				name: 'Lim Dong-hyun',
				nameKo: '임동현',
				female: false,
				experience: 12,
				bio: 'Performs ultrasound and RF lifting; measures skin thickness first so the energy is set for the face, not for the machine.',
			},
			{
				name: 'Song Min-gyu',
				nameKo: '송민규',
				female: false,
				experience: 5,
				bio: 'Works with skin boosters and fine lines around the eyes; known among patients for a gentle hand and clear explanations.',
			},
		],
	},
	{
		slug: 'seorae-maplewood',
		name: 'Seorae Maplewood Dental',
		nameKo: '서래메이플우드치과',
		specialty: DENTAL,
		district: SEOCHO,
		desc: 'A family dental clinic in the Seorae Village area, popular with foreign residents. Implants, crowns and whitening planned around short stays: digital scans, same-week crowns where possible, and a written plan for the dentist back home.',
		hours: [...weekdays('09:00', '18:00'), { day: 6, open: '09:00', close: '13:00' }],
		doctors: [
			{
				name: 'Baek Jae-min',
				nameKo: '백재민',
				female: false,
				experience: 17,
				bio: 'Implant surgeon. Plans two-visit implant treatment for patients who live abroad and explains each step with the 3D scan on screen.',
				before: 'Dentist at a dental hospital, Gwangju',
			},
			{
				name: 'Seo Hyun-seok',
				nameKo: '서현석',
				female: false,
				experience: 9,
				bio: 'Restorative dentist for crowns, resin fillings and whitening; keeps a gentle pace for anxious patients.',
			},
			{
				name: 'Hwang Tae-yang',
				nameKo: '황태양',
				female: false,
				experience: 6,
				bio: 'Sees check-ups and scaling, and treats gum problems before larger work begins.',
			},
		],
	},
	{
		slug: 'itaewon-compass',
		name: 'Itaewon Compass Dental',
		nameKo: '이태원컴퍼스치과',
		specialty: DENTAL,
		district: YONGSAN,
		desc: 'An international dental clinic in Itaewon with evening hours on weekdays. Most patients come for scaling, whitening and veneers; the team writes treatment notes in English and the patient’s own language.',
		hours: weekdays('11:00', '20:00', [1, 2, 3, 4, 5, 6]),
		doctors: [
			{
				name: 'Moon Yu-na',
				nameKo: '문유나',
				female: true,
				experience: 13,
				bio: 'Cosmetic dentist for whitening and laminate veneers; designs the smile on a mock-up first so nothing is decided in the chair.',
				before: 'Dentist at a dental clinic, Busan',
			},
			{
				name: 'Jang Hyun-woo',
				nameKo: '장현우',
				female: false,
				experience: 10,
				bio: 'General dentist for fillings, root canals and urgent pain — keeps same-day slots for travellers with a toothache.',
			},
			{
				name: 'Ko Min-seo',
				nameKo: '고민서',
				female: true,
				experience: 4,
				bio: 'Hygiene and prevention: scaling, polishing and a home-care routine explained in simple steps.',
			},
		],
	},
	{
		slug: 'namsan-health',
		name: 'Namsan Health Check-up',
		nameKo: '남산건강검진센터',
		specialty: CHECK_UP,
		district: JUNG,
		desc: 'A check-up centre at the foot of Namsan with half-day programmes: blood work, ultrasound, endoscopy and a doctor’s summary the same afternoon. Results are explained with an interpreter and sent home as a PDF.',
		hours: [...weekdays('07:30', '16:30'), { day: 6, open: '07:30', close: '12:30' }],
		doctors: [
			{
				name: 'Yoo Sang-hoon',
				nameKo: '유상훈',
				female: false,
				experience: 22,
				bio: 'Internal medicine specialist who reads the full check-up and explains it in one conversation — what is fine, what to watch, what to do next.',
				before: 'Internist at a general hospital, Seoul',
			},
			{
				name: 'Nam Ji-eun',
				nameKo: '남지은',
				female: true,
				experience: 11,
				bio: 'Performs gastroscopy and colonoscopy under sedation; sees many first-time patients and walks them through the preparation the day before.',
			},
			{
				name: 'Cho Seong-jin',
				nameKo: '조성진',
				female: false,
				experience: 8,
				bio: 'Abdominal and thyroid ultrasound; known for showing patients the screen and explaining what they see.',
			},
		],
	},
	{
		slug: 'jongno-lantern',
		name: 'Jongno Lantern Health Center',
		nameKo: '종로랜턴건강검진센터',
		specialty: CHECK_UP,
		district: JONGNO,
		desc: 'A modern check-up centre near Insadong for busy travellers: express and comprehensive programmes, women’s health screening and cardiology tests. Breakfast after fasting tests is included.',
		hours: [...weekdays('07:00', '17:00'), { day: 6, open: '07:00', close: '13:00' }],
		doctors: [
			{
				name: 'Kwon Mi-rae',
				nameKo: '권미래',
				female: true,
				experience: 15,
				bio: 'Internal medicine and women’s health screening; plans the programme with the patient beforehand so no test is a surprise.',
				before: 'Internist at a health screening centre, Daejeon',
			},
			{
				name: 'Bae Jun-seo',
				nameKo: '배준서',
				female: false,
				experience: 12,
				bio: 'Cardiology tests — ECG, echocardiography and stress tests — with a plain-language summary of heart risk.',
			},
			{
				name: 'Ahn Ji-hwan',
				nameKo: '안지환',
				female: false,
				experience: 7,
				bio: 'Leads the express programme for travellers with one free morning, and follows up on results by message after the visit.',
			},
		],
	},
];

/** Romanised and Hangul, combined into 40 doctors. */
export const KOREAN_SURNAMES: [string, string][] = [
	['Kim', '김'],
	['Lee', '이'],
	['Park', '박'],
	['Choi', '최'],
	['Jung', '정'],
	['Kang', '강'],
	['Cho', '조'],
	['Yoon', '윤'],
	['Jang', '장'],
	['Lim', '임'],
	['Han', '한'],
	['Shin', '신'],
];
export const KOREAN_GIVEN: [string, string][] = [
	['Seo-yeon', '서연'],
	['Min-ho', '민호'],
	['Ji-hoon', '지훈'],
	['Su-jin', '수진'],
	['Ha-eun', '하은'],
	['Dong-hyun', '동현'],
	['Ji-woo', '지우'],
	['Seo-jun', '서준'],
	['Yu-na', '유나'],
	['Hae-won', '해원'],
	['Jae-min', '재민'],
	['Eun-ji', '은지'],
	['Hyun-woo', '현우'],
	['So-yeon', '소연'],
	['Tae-yang', '태양'],
];

export interface MenuItem {
	name: string;
	category: TreatmentCategory;
	duration: number;
	price: number;
	desc: string;
}

/** Four treatments per clinic, from its specialty's menu. Prices in KRW. */
export const MENU: Record<Specialty, MenuItem[]> = {
	[DERMATOLOGY]: [
		{
			name: 'Laser Toning',
			category: TreatmentCategory.PIGMENTATION,
			duration: 30,
			price: 99000,
			desc: 'Low-energy laser for melasma and uneven tone, spaced two weeks apart.',
		},
		{
			name: 'Pico Laser',
			category: TreatmentCategory.PIGMENTATION,
			duration: 30,
			price: 150000,
			desc: 'Picosecond laser for freckles and sun spots.',
		},
		{
			name: 'Acne Clearing Peel',
			category: TreatmentCategory.ACNE,
			duration: 30,
			price: 80000,
			desc: 'Salicylic peel with extraction for active acne.',
		},
		{
			name: 'Skin Booster',
			category: TreatmentCategory.HYDRATION,
			duration: 60,
			price: 250000,
			desc: 'Hyaluronic micro-injections for hydration and texture.',
		},
		{
			name: 'Ulthera Lifting',
			category: TreatmentCategory.ANTI_AGING,
			duration: 60,
			price: 690000,
			desc: 'Focused ultrasound lifting for the lower face.',
		},
	],
	[PLASTIC_SURGERY]: [
		{
			name: 'Nose Filler',
			category: TreatmentCategory.FILLER,
			duration: 30,
			price: 300000,
			desc: 'Non-surgical nose shaping with hyaluronic filler.',
		},
		{
			name: 'Jawline Botox',
			category: TreatmentCategory.ANTI_AGING,
			duration: 30,
			price: 120000,
			desc: 'Botulinum toxin for a slimmer jawline.',
		},
		{
			name: 'Thread Lift',
			category: TreatmentCategory.ANTI_AGING,
			duration: 60,
			price: 900000,
			desc: 'Dissolving threads that lift the cheeks and jowls.',
		},
		{
			name: 'Lip Filler',
			category: TreatmentCategory.FILLER,
			duration: 30,
			price: 280000,
			desc: 'Natural-looking volume for the lips.',
		},
		{
			name: 'Surgery Consultation',
			category: TreatmentCategory.CONSULTATION,
			duration: 30,
			price: 50000,
			desc: 'A first consultation with an interpreter on request.',
		},
	],
	[DENTAL]: [
		{
			name: 'Dental Scaling',
			category: TreatmentCategory.DENTAL_CARE,
			duration: 30,
			price: 60000,
			desc: 'Professional cleaning and polishing.',
		},
		{
			name: 'Teeth Whitening',
			category: TreatmentCategory.DENTAL_CARE,
			duration: 60,
			price: 350000,
			desc: 'In-office whitening in one visit.',
		},
		{
			name: 'Resin Filling',
			category: TreatmentCategory.DENTAL_CARE,
			duration: 30,
			price: 90000,
			desc: 'Tooth-coloured filling for small cavities.',
		},
		{
			name: 'Implant Consultation',
			category: TreatmentCategory.CONSULTATION,
			duration: 30,
			price: 40000,
			desc: 'CT scan review and an implant plan.',
		},
	],
	[CHECK_UP]: [
		{
			name: 'Basic Health Check-up',
			category: TreatmentCategory.CHECK_UP,
			duration: 60,
			price: 350000,
			desc: 'Blood tests, chest X-ray, ECG and a doctor’s summary.',
		},
		{
			name: 'Premium Check-up',
			category: TreatmentCategory.CHECK_UP,
			duration: 60,
			price: 1200000,
			desc: 'Basic plus endoscopy and abdominal ultrasound.',
		},
		{
			name: 'Thyroid Ultrasound',
			category: TreatmentCategory.CHECK_UP,
			duration: 30,
			price: 120000,
			desc: 'Thyroid scan with a same-day reading.',
		},
		{
			name: 'Check-up Consultation',
			category: TreatmentCategory.CONSULTATION,
			duration: 30,
			price: 30000,
			desc: 'Going through your results with a doctor.',
		},
	],
};

/** faker has no Kazakh locale. */
export const KAZAKH_NAMES = {
	female: [
		'Aigerim',
		'Aruzhan',
		'Dana',
		'Saule',
		'Madina',
		'Zhanar',
		'Gulnara',
		'Ainur',
		'Dinara',
		'Asel',
	],
	male: [
		'Nursultan',
		'Yerlan',
		'Timur',
		'Askar',
		'Dias',
		'Arman',
		'Bauyrzhan',
		'Daniyar',
		'Serik',
		'Almas',
	],
	surname: [
		'Abenov',
		'Nurlanov',
		'Seitkali',
		'Zhakupov',
		'Omarov',
		'Kassymov',
		'Tulegenov',
		'Akhmetov',
		'Bekov',
		'Sarsenov',
	],
};

/** The questionnaire every booking carries, answered in the patient's language. */
export const QUESTIONS = ['Main concern', 'Medications', 'Allergies', 'Previous treatments'];
export const ANSWERS: Partial<Record<Language, string[][]>> = {
	[Language.RU]: [
		['Пигментация на щеках', 'Нет', 'Нет', 'Пилинг год назад'],
		['Акне на подбородке', 'Витамин D', 'Пенициллин', 'Нет'],
		['Хочу отбелить зубы', 'Нет', 'Нет', 'Чистка зубов'],
		['Плановое обследование', 'Метформин', 'Нет', 'Нет'],
	],
	[Language.UZ]: [
		["Yuzimda dog'lar bor", "Yo'q", "Yo'q", 'Bir yil oldin piling'],
		['Iyagimda husnbuzar', 'D vitamini', 'Penitsillin', "Yo'q"],
		['Tishlarimni oqartirmoqchiman', "Yo'q", "Yo'q", 'Tish tozalash'],
		["Rejali ko'rik", "Yo'q", "Yo'q", "Yo'q"],
	],
	[Language.EN]: [
		['Melasma on both cheeks', 'None', 'None', 'A chemical peel last year'],
		['Acne on the chin', 'Vitamin D', 'Penicillin', 'None'],
		['I would like whiter teeth', 'None', 'None', 'Scaling'],
		['A routine check-up', 'Metformin', 'None', 'None'],
	],
};

/** The Korean summary the doctor reads (AI-1), for bookings with the AI_SUMMARY consent. */
export const AI_SUMMARIES = [
	'주 호소: 양 볼의 기미. 복용 약 없음, 알레르기 없음. 1년 전 필링 경험.',
	'주 호소: 턱 부위 여드름. 비타민 D 복용 중, 페니실린 알레르기.',
	'주 호소: 치아 미백 희망. 특이 병력 없음. 스케일링 경험 있음.',
	'주 호소: 정기 건강검진. 메트포르민 복용 중, 알레르기 없음.',
];

export const REVIEWS: Partial<Record<Language, string[]>> = {
	[Language.RU]: [
		'Врач всё подробно объяснил, переводчик помог с каждым вопросом. Цена совпала с указанной.',
		'Очень чисто, приняли точно по времени. Результат видно уже через неделю.',
		'Хорошая клиника, но пришлось немного подождать. Персонал вежливый.',
		'Понравилось, что можно было задать вопросы в чате до визита.',
	],
	[Language.UZ]: [
		'Shifokor hammasini batafsil tushuntirdi, tarjimon juda yordam berdi.',
		"Klinika toza, vaqtida qabul qilishdi. Narx saytdagidek bo'ldi.",
		"Yaxshi xizmat, lekin biroz kutishga to'g'ri keldi.",
		"Tashrifdan oldin chatda savol bera olganim juda qulay bo'ldi.",
	],
	[Language.EN]: [
		'The doctor explained every step and the price matched the listing.',
		'Spotless clinic, seen on time. I could already see a difference after a week.',
		'Good care, a short wait at reception. Friendly staff.',
		'Being able to ask questions in the chat before the visit made it easy.',
	],
};

export const REVIEW_REPLIES = [
	'Thank you for visiting us — we are glad the explanation helped.',
	'Thank you! We look forward to seeing you at your follow-up.',
	'Thank you for the feedback; we are working on shorter waiting times.',
];

export const QNA_POSTS: { lang: Language; title: string; content: string }[] = [
	{
		lang: Language.RU,
		title: 'Помогает ли лазерное тонирование при мелазме?',
		content: 'Читала, что некоторые лазеры ухудшают мелазму. Кто делал в Сеуле?',
	},
	{
		lang: Language.RU,
		title: 'Сколько дней нужно на восстановление после филлера?',
		content: 'Лечу на неделю, успею ли восстановиться?',
	},
	{
		lang: Language.UZ,
		title: 'Tish oqartirish qancha vaqt saqlanadi?',
		content: "Seulda oqartirgan bo'lsangiz, natija qancha turdi?",
	},
	{
		lang: Language.UZ,
		title: "Tibbiy ko'rikka och qoringa borish kerakmi?",
		content: "Ertalabki ko'rikdan oldin nima yeyish mumkin?",
	},
	{
		lang: Language.EN,
		title: 'Is Pico laser painful?',
		content: 'Thinking about Pico laser for freckles. How much does it hurt?',
	},
	{
		lang: Language.EN,
		title: 'Can I fly the day after a thread lift?',
		content: 'My flight home is the next morning. Is that safe?',
	},
];

export const FREE_POSTS: { lang: Language; title: string; content: string }[] = [
	{
		lang: Language.RU,
		title: 'Где остановиться рядом с Каннамом?',
		content: 'Посоветуйте недорогой отель рядом с клиниками.',
	},
	{
		lang: Language.UZ,
		title: 'Seulda halol taom qayerda bor?',
		content: 'Itaewon atrofida yaxshi joylarni bilasizmi?',
	},
	{
		lang: Language.EN,
		title: 'T-money or taxi to the clinics?',
		content: 'First time in Seoul — how do you get around?',
	},
	{
		lang: Language.RU,
		title: 'Мой опыт: чистка зубов в Сеуле',
		content: 'Всё прошло отлично, делюсь впечатлениями.',
	},
];

export const HEALTH_TIPS: { title: string; content: string }[] = [
	{
		title: 'Sun protection after laser treatment',
		content: 'Use SPF 50 every two hours for two weeks after any laser session, even indoors.',
	},
	{
		title: 'What to eat before a health check-up',
		content: 'Fast for eight hours; water is fine. Bring a list of your medications.',
	},
	{
		title: 'Filler aftercare in five steps',
		content: 'No massage, no sauna and no alcohol for 48 hours.',
	},
	{
		title: 'How often should you have scaling?',
		content: 'Every six months for most adults; more often with gum disease.',
	},
	{
		title: 'Melasma: why gentle is better',
		content: 'Aggressive lasers can make melasma worse. Low-energy toning is the safer start.',
	},
];

export const PATIENT_COMMENTS: Partial<Record<Language, string[]>> = {
	[Language.RU]: [
		'Спасибо, очень полезно!',
		'У меня было так же, всё прошло.',
		'Подскажите название клиники?',
	],
	[Language.UZ]: [
		'Rahmat, juda foydali!',
		"Menda ham shunday bo'lgan edi.",
		'Qaysi klinika ekanini aytasizmi?',
	],
	[Language.EN]: [
		'Thanks, this helps a lot!',
		'Same for me — it settled after a week.',
		'Which clinic did you go to?',
	],
};

export const DOCTOR_ANSWERS = [
	'Low-fluence toning is generally safe for melasma when sessions are spaced two weeks apart.',
	'Most patients can fly 24 hours after the procedure; avoid pressure on the area.',
	'Results usually last six to twelve months, depending on diet and care.',
	'Please fast for eight hours; you may drink water.',
];

export const NOTICES: {
	title: string;
	content: string;
	pinned?: boolean;
	ru?: [string, string];
}[] = [
	{
		title: 'Chuseok holiday: partner clinic hours',
		content: 'Most partner clinics close 25–28 September. Bookings for those days are not offered.',
		pinned: true,
		ru: ['Чхусок: часы работы клиник', 'Большинство клиник закрыты 25–28 сентября.'],
	},
	{
		title: 'Updated privacy policy for health data',
		content:
			'Your questionnaire answers are encrypted and shown only to the clinic and doctor of your booking.',
		pinned: true,
		ru: [
			'Обновлённая политика конфиденциальности',
			'Ваши ответы зашифрованы и видны только клинике и врачу.',
		],
	},
	{
		title: 'Kazakh language support is now available',
		content: 'You can now use MedVia in Kazakh.',
	},
	{
		title: 'New dental partners in Songpa',
		content: 'Two dental clinics in Songpa-gu joined MedVia this month.',
	},
];

export const FAQ: { category: InquiryCategory; title: string; content: string }[] = [
	{
		category: InquiryCategory.BOOKING,
		title: 'Can I cancel a booking?',
		content: 'Yes — up to 24 hours before the visit, from My Bookings.',
	},
	{
		category: InquiryCategory.BOOKING,
		title: 'What if the clinic does not answer?',
		content: 'A request the clinic does not answer in time expires, and the time is released.',
	},
	{
		category: InquiryCategory.PAYMENT,
		title: 'Do I pay on MedVia?',
		content:
			'No. You pay the clinic directly at the visit; the listed price is the starting price.',
	},
	{
		category: InquiryCategory.INTERPRETER,
		title: 'Is an interpreter free?',
		content: 'Clinics that list your language provide an interpreter at no extra charge.',
	},
	{
		category: InquiryCategory.MEDICAL_DATA,
		title: 'Who can see my answers?',
		content:
			'Only the clinic and the doctor of the booking. You can see every reading under Privacy.',
	},
	{
		category: InquiryCategory.ACCOUNT,
		title: 'How do I delete my account?',
		content: 'Write to us under 1:1 Inquiry — Account.',
	},
];
