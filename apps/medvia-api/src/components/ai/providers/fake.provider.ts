import { Language } from '../../../libs/enums/common.enum';
import { T } from '../../../libs/types/common';
import {
	AgentMessage,
	AgentStep,
	AgentToolCall,
	AgentToolResult,
	AgentToolSpec,
	AiProvider,
	QuestionAnswer,
	TranslationResult,
} from '../ai.types';

/** A message containing this fails on purpose, so the suites can reach the FAILED path. */
export const FAKE_FAIL_MARKER = '#ai-fail';
/** The assistant asks for a tool with broken arguments (the validator's path). */
export const FAKE_BAD_ARGS_MARKER = '#bad-args';
/** The assistant never stops calling tools (the loop limit's path). */
export const FAKE_LOOP_MARKER = '#loop';
/** The assistant tries to hold a slot it was never shown (propose_hold's own checks). */
export const FAKE_FORGED_SLOT_MARKER = '#forged-slot';

/**
 * Deterministic and free, for Jest, Postman and local work without a key: "[KO] text".
 * The source language is guessed from the script — enough to exercise the pipeline.
 * Never allowed in production (checkProvider).
 */
export class FakeProvider implements AiProvider {
	public readonly name = 'fake' as const;

	public async translate(text: string, target: Language): Promise<TranslationResult> {
		if (text.includes(FAKE_FAIL_MARKER)) throw new Error('fake provider failure');
		return { sourceLang: guessLang(text), text: `[${target}] ${text}` };
	}

	public async summarize(answers: QuestionAnswer[]): Promise<string> {
		return `[KO] ${answers.map((a) => a.answer).join(' / ')}`.slice(0, 500);
	}

	/**
	 * A scripted assistant: reads the last message and plays the next move of the happy path —
	 * search → slots → propose — or one of the failure paths named by a marker. Enough to drive
	 * the real loop, the real tools and the confirm gate in Postman, for free and the same way
	 * every run. It replies in English with a "[fake]" prefix.
	 */
	public async converse(
		_system: string,
		messages: AgentMessage[],
		_tools: AgentToolSpec[],
	): Promise<AgentStep> {
		const last = messages[messages.length - 1];
		const userText = [...messages].reverse().find((m) => m.role === 'user') as
			{ text: string } | undefined;
		const text = userText?.text ?? '';
		if (text.includes(FAKE_FAIL_MARKER)) throw new Error('fake provider failure');
		const id = `fake-${messages.length}`;
		const call = (name: string, args: unknown): AgentStep => ({
			text: '',
			toolCalls: [{ id, name, args } as AgentToolCall],
			stop: 'tool_use',
		});
		const say = (reply: string): AgentStep => ({
			text: `[fake] ${reply}`,
			toolCalls: [],
			stop: 'end',
		});

		if (text.includes(FAKE_LOOP_MARKER)) return call('search_clinics', {});
		if (last.role === 'user') {
			if (text.includes(FAKE_BAD_ARGS_MARKER)) return call('find_slots', { treatmentId: 'nope' });
			if (/my bookings|мои записи|bronlarim/i.test(text)) return call('my_bookings', {});
			if (/\bbook\b|band qil|забронир/i.test(text)) {
				if (text.includes(FAKE_FORGED_SLOT_MARKER)) {
					const shown = lastSlot(messages);
					return call('propose_hold', { ...shown, slotStart: '2030-01-01T01:00:00.000Z' });
				}
				const slot = lastSlot(messages);
				return slot ? call('propose_hold', slot) : say('Which time would you like?');
			}
			return call('search_clinics', searchArgs(text));
		}
		if (last.role === 'tool') return afterTool(last.results[0], call, say);
		return say('How can I help?');
	}
}

/** The fake's reading of a request: a "quoted" name, a district, a language, an interpreter. */
function searchArgs(text: string): T {
	const args: T = {};
	const quoted = text.match(/"([^"]{2,60})"/);
	if (quoted) args.text = quoted[1];
	const district = ['GANGNAM', 'SEOCHO', 'JUNG', 'MAPO', 'YONGSAN', 'JONGNO', 'SONGPA'].find((d) =>
		text.toUpperCase().includes(d),
	);
	if (district) args.district = district;
	if (/uzbek|o'zbek|узбек/i.test(text)) args.language = Language.UZ;
	else if (/kazakh|қазақ|казах/i.test(text)) args.language = Language.KK;
	else if (/russian|рус/i.test(text)) args.language = Language.RU;
	if (/interpreter|tarjimon|переводчик/i.test(text)) args.interpreter = true;
	return args;
}

function afterTool(
	result: AgentToolResult,
	call: (name: string, args: unknown) => AgentStep,
	say: (reply: string) => AgentStep,
): AgentStep {
	if (result.isError) {
		return result.name === 'propose_hold'
			? say('That time cannot be held. Please choose another one.')
			: say(`I could not do that: ${result.content}`);
	}
	const data = parse(result.content);
	switch (result.name) {
		case 'search_clinics': {
			const clinic = (data.clinics ?? [])[0];
			const treatment = clinic?.treatments?.[0];
			if (!treatment) return say('No clinic matches that request.');
			return call('find_slots', { treatmentId: treatment.treatmentId, days: 7 });
		}
		case 'find_slots': {
			const slots = data.slots ?? [];
			if (!slots.length) return say('There is no free time in the next week.');
			return say(
				`Free times: ${slots
					.slice(0, 3)
					.map((s: T) => s.label)
					.join(', ')}. Say "book" to hold the first one.`,
			);
		}
		case 'propose_hold':
			return say(`Ready to hold ${data.label}. Press Confirm to hold it for 10 minutes.`);
		case 'my_bookings':
			return say(`You have ${(data.bookings ?? []).length} upcoming booking(s).`);
		default:
			return say('Done.');
	}
}

/** The first slot of the latest find_slots result in the conversation. */
function lastSlot(messages: AgentMessage[]): T | null {
	for (const m of [...messages].reverse()) {
		if (m.role !== 'tool') continue;
		const found = m.results.find((r) => r.name === 'find_slots' && !r.isError);
		const slot = found && (parse(found.content).slots ?? [])[0];
		if (slot)
			return { treatmentId: slot.treatmentId, doctorId: slot.doctorId, slotStart: slot.slotStart };
	}
	return null;
}

function parse(content: string): T {
	try {
		return JSON.parse(content);
	} catch {
		return {};
	}
}

function guessLang(text: string): Language {
	if (/[가-힯]/.test(text)) return Language.KO;
	if (/[Ѐ-ӿ]/.test(text)) return Language.RU;
	if (/[一-鿿]/.test(text)) return Language.ZH;
	return Language.EN;
}
