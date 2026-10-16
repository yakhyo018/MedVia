/**
 * The chat socket, end to end — the part Newman cannot reach.
 *
 *   npm run test:socket          (needs the API running, like npm run test:api)
 *
 * Builds its own clinic and two patients, then checks: a socket without a valid token is
 * refused; a message sent through GraphQL reaches both sides of its room over the socket and
 * nobody else; "unread" moves for the other side; the other side's bell (notification:new)
 * rings on its own member room.
 */
const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const BASE = process.env.BASE_URL || `http://localhost:${process.env.PORT_API || 3000}`;
const stamp = Date.now();
let failed = 0;

const check = (name, ok, detail = '') => {
	console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || !detail ? '' : `  — ${detail}`}`);
	if (!ok) failed++;
};

async function gql(query, variables = {}, token) {
	const res = await fetch(`${BASE}/graphql`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
		body: JSON.stringify({ query, variables }),
	});
	const body = await res.json();
	if (body.errors) throw new Error(`${query.slice(0, 40)}…: ${body.errors[0].message}`);
	return body.data;
}

function connect(token) {
	return new Promise((resolve) => {
		const socket = io(`${BASE}/live`, { auth: token ? { token } : {}, transports: ['websocket'], reconnection: false });
		socket.on('connect', () => resolve({ socket }));
		socket.on('connect_error', (err) => resolve({ error: err.message, socket }));
	});
}

/** The first `event` whose payload passes `match`, or null after `ms`. */
function waitFor(socket, event, match, ms = 3000) {
	return new Promise((resolve) => {
		const timer = setTimeout(() => {
			socket.off(event, handler);
			resolve(null);
		}, ms);
		function handler(payload) {
			if (!match(payload)) return;
			clearTimeout(timer);
			socket.off(event, handler);
			resolve(payload);
		}
		socket.on(event, handler);
	});
}

async function setup() {
	const signupClinic = await gql(
		'mutation S($input: ClinicSignupInput!) { signupClinic(input: $input) { accessToken } }',
		{
			input: {
				memberEmail: `sclinic.${stamp}@medvia.test`, memberPassword: 'Clinic#2026', memberFullName: 'Kim Ji-won',
				clinicName: `Socket Test Clinic ${stamp}`, clinicSpecialty: 'DERMATOLOGY', clinicDistrict: 'GANGNAM',
				clinicAddress: '12 Teheran-ro, Gangnam-gu, Seoul', termsAccepted: true, authorizedConfirmed: true,
			},
		},
	);
	const clinicToken = signupClinic.signupClinic.accessToken;
	const clinicId = (await gql('query { getMyClinic { _id } }', {}, clinicToken)).getMyClinic._id;

	const form = new FormData();
	form.append('file', new Blob([fs.readFileSync(path.join(__dirname, 'fixtures', 'clinic-photo.png'))], { type: 'image/png' }), 'clinic-photo.png');
	const upload = await (await fetch(`${BASE}/upload/image?target=clinic`, { method: 'POST', headers: { Authorization: `Bearer ${clinicToken}` }, body: form })).json();
	await gql('mutation U($input: ClinicUpdate!) { updateMyClinic(input: $input) { _id } }', { input: { clinicImages: [upload.url], clinicLangs: ['KO', 'EN'] } }, clinicToken);

	const admin = await gql('mutation L($input: LoginInput!) { login(input: $input) { accessToken } }', {
		input: { memberEmail: process.env.ADMIN_EMAIL, memberPassword: process.env.ADMIN_PASSWORD },
	});
	await gql('mutation R($input: ClinicReviewInput!) { reviewClinic(input: $input) { clinicStatus } }', { input: { clinicId, decision: 'APPROVE' } }, admin.login.accessToken);

	const patient = async (name, lang, tag) =>
		(await gql('mutation S($input: MemberInput!) { signup(input: $input) { accessToken } }', {
			input: { memberType: 'USER', memberEmail: `s${tag}.${stamp}@medvia.test`, memberPassword: 'Patient#2026', memberFullName: name, memberLang: lang, termsAccepted: true },
		})).signup.accessToken;

	return {
		clinicToken,
		clinicId,
		feride: await patient('Feride Karimova', 'RU', 'feride'),
		yahyo: await patient('Yahyo Choriyev', 'EN', 'yahyo'),
	};
}

async function main() {
	console.log(`live socket → ${BASE}/live`);
	if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) throw new Error('ADMIN_EMAIL / ADMIN_PASSWORD missing in .env');
	const t = await setup();

	const none = await connect(null);
	check('a socket without a token is refused', none.error === 'Bearer token is not provided!', none.error);
	none.socket.close();

	const bad = await connect('not-a-jwt');
	check('a socket with a bad token is refused', !!bad.error && bad.error.includes('not authenticated'), bad.error);
	bad.socket.close();

	const [clinic, feride, yahyo] = await Promise.all([connect(t.clinicToken), connect(t.feride), connect(t.yahyo)]);
	check('the clinic, Feride and Yahyo connect', !clinic.error && !feride.error && !yahyo.error, clinic.error || feride.error || yahyo.error);

	const room = (await gql('mutation O($id: String!) { openRoom(clinicId: $id) { _id } }', { id: t.clinicId }, t.feride)).openRoom;

	// Feride writes: the clinic and Feride hear it, Yahyo does not.
	const text = `Здравствуйте! ${stamp}`;
	const hears = (s) => waitFor(s, 'message:new', (m) => m.messageText === text);
	const isChatLine = (n) => n && n.notificationType === 'NEW_MESSAGE' && n.notificationRefId === room._id;
	const [atClinic, atFeride, atYahyo, clinicBell, ferideBell, sent] = await Promise.all([
		hears(clinic.socket),
		hears(feride.socket),
		hears(yahyo.socket, 1500),
		waitFor(clinic.socket, 'notification:new', isChatLine),
		waitFor(feride.socket, 'notification:new', isChatLine, 1500),
		gql('mutation M($input: MessageSendInput!) { sendMessage(input: $input) { _id messageLang } }', { input: { roomId: room._id, messageText: text } }, t.feride),
	]);
	check('the clinic receives Feride\'s message over the socket', atClinic && atClinic._id === sent.sendMessage._id);
	check('Feride\'s other tabs receive it too', !!atFeride);
	check('Yahyo, a patient of another room, receives nothing', atYahyo === null);
	check('it is stored in Feride\'s language (RU)', sent.sendMessage.messageLang === 'RU', sent.sendMessage.messageLang);
	check(
		'the clinic\'s bell rings: "New message from Feride K."',
		!!clinicBell && clinicBell.notificationTitle === 'New message from Feride K.',
		clinicBell ? clinicBell.notificationTitle : 'no notification:new',
	);
	check('the sender\'s own bell stays silent', ferideBell === null);

	// The clinic answers: Feride's unread goes up, then to 0 when she reads.
	const unread = waitFor(feride.socket, 'room:updated', (r) => r && r._id === room._id && r.roomUnreadPatient === 1);
	const answerBell = waitFor(feride.socket, 'notification:new', isChatLine);
	await gql('mutation M($input: MessageSendInput!) { sendMessage(input: $input) { _id } }', { input: { roomId: room._id, messageText: '네, 내일 14시에 가능합니다.' } }, t.clinicToken);
	check('the clinic\'s answer is unread for Feride', !!(await unread));
	const bell = await answerBell;
	check(
		'Feride\'s bell rings with the clinic\'s name and the preview',
		!!bell && bell.notificationTitle === `New message from Socket Test Clinic ${stamp}` && bell.notificationDesc === '네, 내일 14시에 가능합니다.',
		bell ? `${bell.notificationTitle} · ${bell.notificationDesc}` : 'no notification:new',
	);

	const read = waitFor(clinic.socket, 'room:updated', (r) => r && r._id === room._id && r.roomUnreadPatient === 0);
	await gql('mutation R($id: String!) { markRoomRead(roomId: $id) { unread } }', { id: room._id }, t.feride);
	check('reading resets it, and the clinic\'s screen hears that', !!(await read));
	const badge = (await gql('query { getUnreadNotificationCount }', {}, t.feride)).getUnreadNotificationCount;
	check('reading the room also reads its bell line (badge 0)', badge === 0, `badge ${badge}`);

	// AI-1 (needs AI_PROVIDER=fake): with consent, the translation follows as message:translated.
	await gql('mutation C { setAiConsent(agreed: true) { memberAiConsentAt } }', {}, t.feride);
	const translatedText = `Пигментация ${stamp}`;
	const sentForAi = gql('mutation M($input: MessageSendInput!) { sendMessage(input: $input) { _id messageTranslationStatus } }', { input: { roomId: room._id, messageText: translatedText } }, t.feride);
	const translated = await waitFor(clinic.socket, 'message:translated', (m) => m.messageText === translatedText);
	const sentAi = (await sentForAi).sendMessage;
	check('the sender is answered before the translation (PENDING)', sentAi.messageTranslationStatus === 'PENDING', sentAi.messageTranslationStatus);
	const ko = translated && (translated.messageTranslations || [])[0];
	check(
		'the clinic receives the Korean translation over the socket',
		!!translated && translated.messageTranslationStatus === 'DONE' && ko && ko.lang === 'KO' && ko.text === `[KO] ${translatedText}`,
		translated ? JSON.stringify(translated.messageTranslations) : 'no message:translated (is AI_PROVIDER=fake?)',
	);

	// Flood control is per member: Yahyo's 21st message in a minute is refused, Feride is not affected.
	const yahyoRoom = (await gql('mutation O($id: String!) { openRoom(clinicId: $id) { _id } }', { id: t.clinicId }, t.yahyo)).openRoom;
	let refusedAt = null;
	for (let i = 1; i <= 21 && !refusedAt; i++) {
		try {
			await gql('mutation M($input: MessageSendInput!) { sendMessage(input: $input) { _id } }', { input: { roomId: yahyoRoom._id, messageText: `spam ${i}` } }, t.yahyo);
		} catch (err) {
			refusedAt = { i, message: err.message };
		}
	}
	check('the 21st message in a minute is refused', refusedAt && refusedAt.i === 21, JSON.stringify(refusedAt));
	let feridesStillWorks = true;
	try {
		await gql('mutation M($input: MessageSendInput!) { sendMessage(input: $input) { _id } }', { input: { roomId: room._id, messageText: 'still here' } }, t.feride);
	} catch {
		feridesStillWorks = false;
	}
	check('another member is not limited by it', feridesStillWorks);

	for (const s of [clinic, feride, yahyo]) s.socket.close();
	console.log(failed ? `\n${failed} check(s) failed` : '\nall socket checks passed');
	process.exit(failed ? 1 : 0);
}

main().catch((err) => {
	console.error(err.message);
	process.exit(1);
});
