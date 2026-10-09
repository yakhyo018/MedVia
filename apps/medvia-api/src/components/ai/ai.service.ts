import { Inject, Injectable, Logger } from '@nestjs/common';
import { Language } from '../../libs/enums/common.enum';
import { CacheService } from '../../redis/cache.service';
import { TRANSLATION_TTL_SECONDS, translationCacheKey } from './ai.rules';
import { AI_PROVIDER } from './ai.types';
import type { AiProvider, QuestionAnswer, TranslationResult } from './ai.types';

/**
 * The only door to AI. Callers get a result or null — never an exception: the chat and the
 * booking must work exactly the same when the provider is slow, down or out of quota.
 *
 * Logs carry the provider and the error, never the text: it is patient data.
 */
@Injectable()
export class AiService {
	private readonly logger = new Logger(AiService.name);

	constructor(
		@Inject(AI_PROVIDER) private readonly provider: AiProvider,
		private readonly cacheService: CacheService,
	) {}

	public get providerName(): string {
		return this.provider.name;
	}

	/** Cached for 30 days by a hash of (language, text): "Спасибо!" is translated once. */
	public async translate(text: string, target: Language): Promise<TranslationResult | null> {
		const key = translationCacheKey(text, target);
		const cached = await this.cacheService.get<TranslationResult>(key);
		if (cached) return cached;
		try {
			const result = await this.provider.translate(text, target);
			await this.cacheService.set(key, result, TRANSLATION_TTL_SECONDS);
			return result;
		} catch (err: any) {
			this.logger.warn(`${this.provider.name} translate → ${target} failed: ${err.message}`);
			return null;
		}
	}

	/** Not cached: one call per booking, and the answers are never repeated word for word. */
	public async summarize(answers: QuestionAnswer[]): Promise<string | null> {
		try {
			return await this.provider.summarize(answers);
		} catch (err: any) {
			this.logger.warn(`${this.provider.name} summarize failed: ${err.message}`);
			return null;
		}
	}
}
