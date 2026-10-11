import { NotificationGroup, NotificationType } from '../../libs/enums/notification.enum';
import {
	allowedBySettings,
	GROUP_OF,
	renderNotification,
	seoulWhen,
	SETTING_OF,
} from './notification.rules';

describe('groups and switches', () => {
	it('puts every type in a tab', () => {
		for (const type of Object.values(NotificationType)) expect(GROUP_OF[type]).toBeDefined();
		expect(GROUP_OF[NotificationType.NEW_MESSAGE]).toBe(NotificationGroup.CHAT);
	});

	it('silences a type only when its switch is off', () => {
		expect(allowedBySettings(NotificationType.NEW_MESSAGE, { chatMessages: false })).toBe(false);
		expect(allowedBySettings(NotificationType.NEW_MESSAGE, { chatMessages: true })).toBe(true);
		expect(allowedBySettings(NotificationType.BOOKING_CONFIRMED, { bookingUpdates: false })).toBe(
			false,
		);
	});

	it('gives the visit reminder its own switch', () => {
		const remindersOff = { bookingUpdates: true, visitReminders: false };
		expect(allowedBySettings(NotificationType.VISIT_REMINDER, remindersOff)).toBe(false);
		expect(allowedBySettings(NotificationType.BOOKING_EXPIRED, remindersOff)).toBe(true);
	});

	it('treats a missing setting as on', () => {
		expect(allowedBySettings(NotificationType.NEW_MESSAGE, undefined)).toBe(true);
		expect(allowedBySettings(NotificationType.NEW_MESSAGE, {})).toBe(true);
	});

	it('never silences a type without a switch (support answers, follows, comments)', () => {
		for (const type of Object.values(NotificationType).filter((t) => !SETTING_OF[t]))
			expect(
				allowedBySettings(type, {
					bookingUpdates: false,
					chatMessages: false,
					visitReminders: false,
				}),
			).toBe(true);
	});
});

describe('text', () => {
	it('writes the time in Seoul', () => {
		expect(seoulWhen(new Date('2026-09-22T05:00:00Z'))).toBe('2026-09-22 14:00 KST');
		expect(seoulWhen(undefined)).toBe('');
	});

	it('renders every type, also with no params', () => {
		for (const type of Object.values(NotificationType)) {
			const r = renderNotification(type);
			expect(typeof r.title).toBe('string');
			expect(r.title.length).toBeGreaterThan(0);
		}
	});

	it('fills the params', () => {
		expect(
			renderNotification(NotificationType.BOOKING_CONFIRMED, {
				clinicName: 'Seoul Glow',
				treatmentName: 'Laser Toning',
				when: '2026-09-22 14:00 KST',
			}),
		).toEqual({
			title: 'Booking confirmed',
			desc: 'Seoul Glow confirmed Laser Toning on 2026-09-22 14:00 KST.',
		});
	});

	it('clips a long chat preview', () => {
		const desc = renderNotification(NotificationType.NEW_MESSAGE, {
			senderName: 'Feride K.',
			preview: 'x'.repeat(200),
		}).desc;
		expect(desc.length).toBe(80);
		expect(desc.endsWith('…')).toBe(true);
	});
});
