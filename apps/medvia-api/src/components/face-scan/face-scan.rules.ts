import { Specialty } from '../../libs/enums/clinic.enum';
import { FaceFinding } from '../ai/ai.types';

/** The face scan's rules as pure functions and constants: limits, keys, routing. */

/** A phone photo cropped to the face by the browser is well under 2 MB; 5 MB leaves room. */
export const MAX_FACE_IMAGE_BYTES = 5 * 1024 * 1024;

/** Scans per patient per Seoul day — each one is a paid vision call. */
export const DAILY_FACE_SCANS = 5;

/** `face:scans:<memberId>:<YYYY-MM-DD>` — a Redis counter with a 2-day TTL. */
export const dailyFaceScansKey = (memberId: unknown, seoulDate: string) =>
	`face:scans:${String(memberId)}:${seoulDate}`;

export const FACE_SCAN_DISCLAIMER =
	'This is an AI reading of a photo, not a medical diagnosis. A doctor at the clinic confirms it.';

/**
 * Which clinics the result links to. Decided here, not by the model: routing a patient is a
 * product decision and must not change with a prompt. Every concern MedVia reads is treated
 * at a dermatology clinic in Seoul — botox and fillers for wrinkles included. No findings, no
 * suggestion: the result page then shows no clinic list.
 */
export function specialtyFor(findings: FaceFinding[]): Specialty | undefined {
	return findings.length ? Specialty.DERMATOLOGY : undefined;
}
