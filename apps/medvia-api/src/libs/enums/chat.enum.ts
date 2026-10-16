import { registerEnumType } from '@nestjs/graphql';

/** TEXT is written by a person; SYSTEM is a line the server adds ("Booking confirmed · 22 Sep"). */
export enum MessageType {
	TEXT = 'TEXT',
	SYSTEM = 'SYSTEM',
}
registerEnumType(MessageType, { name: 'MessageType' });

/** The chat is between the patient and the clinic account; doctors do not write in it. */
export enum SenderType {
	PATIENT = 'PATIENT',
	CLINIC = 'CLINIC',
	SYSTEM = 'SYSTEM',
}
registerEnumType(SenderType, { name: 'SenderType' });

/**
 * PENDING  the translation is being made (AI-1)
 * DONE     messageTranslations holds it
 * FAILED   the provider failed; the original is shown and the next read tries again
 * SKIPPED  nothing to translate (same language, a system line, no consent, AI off)
 */
export enum TranslationStatus {
	PENDING = 'PENDING',
	DONE = 'DONE',
	FAILED = 'FAILED',
	SKIPPED = 'SKIPPED',
}
registerEnumType(TranslationStatus, { name: 'TranslationStatus' });
