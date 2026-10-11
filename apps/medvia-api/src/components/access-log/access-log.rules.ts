import { AccessType } from '../../libs/enums/access-log.enum';
import { MemberType } from '../../libs/enums/member.enum';
import { T } from '../../libs/types/common';

/**
 * Which readings of a booking's medical data go to the access log. Only someone else's: the
 * patient reading their own answers is not news to anyone. Only what was actually decrypted:
 * a booking without an AI summary logs no AI_SUMMARY reading.
 */
export function accessesOf(booking: T, readerId: unknown, decrypted: boolean): AccessType[] {
	if (!decrypted || String(readerId) === String(booking.memberId)) return [];
	const types: AccessType[] = [];
	if (booking.bookingQuestionnaire) types.push(AccessType.ANSWERS);
	if (booking.bookingAiSummaryEnc) types.push(AccessType.AI_SUMMARY);
	return types;
}

/** How the reader is named in the patient's list: the clinic, or "Dr. …". */
export function readerNameOf(memberType: MemberType, booking: T): string {
	if (memberType === MemberType.AGENT) return booking.clinicData?.clinicName ?? '';
	if (memberType === MemberType.DOCTOR) return `Dr. ${booking.doctorData?.doctorName ?? ''}`;
	return '';
}
