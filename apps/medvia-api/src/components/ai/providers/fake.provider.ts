import { Language } from '../../../libs/enums/common.enum';
import { AiProvider, QuestionAnswer, TranslationResult } from '../ai.types';

/** A message containing this fails on purpose, so the suites can reach the FAILED path. */
export const FAKE_FAIL_MARKER = '#ai-fail';

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
}

function guessLang(text: string): Language {
	if (/[가-힯]/.test(text)) return Language.KO;
	if (/[Ѐ-ӿ]/.test(text)) return Language.RU;
	if (/[一-鿿]/.test(text)) return Language.ZH;
	return Language.EN;
}
