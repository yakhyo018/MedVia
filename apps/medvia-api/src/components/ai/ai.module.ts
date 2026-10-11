import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { checkProvider } from './ai.rules';
import { AI_PROVIDER, AiProvider } from './ai.types';
import { AnthropicProvider } from './providers/anthropic.provider';
import { FakeProvider } from './providers/fake.provider';
import { OpenRouterProvider } from './providers/openrouter.provider';

/**
 * One provider for the whole app, chosen at boot from AI_PROVIDER. checkProvider throws on a
 * demo provider in production or a missing key — Nest then refuses to start, which is the point.
 */
export function createProvider(env: NodeJS.ProcessEnv = process.env): AiProvider {
	switch (checkProvider(env)) {
		case 'anthropic':
			return new AnthropicProvider({
				apiKey: env.ANTHROPIC_API_KEY,
				translateModel: env.AI_MODEL_TRANSLATE || 'claude-haiku-4-5',
				summaryModel: env.AI_MODEL_SUMMARY || 'claude-opus-5-5',
				assistantModel: env.AI_MODEL_ASSISTANT || 'claude-opus-5-5',
			});
		case 'openrouter': {
			const model = env.AI_MODEL_TRANSLATE;
			if (!model) throw new Error('AI_MODEL_TRANSLATE is required with AI_PROVIDER=openrouter');
			return new OpenRouterProvider({
				apiKey: env.OPENROUTER_API_KEY as string,
				translateModel: model,
				summaryModel: env.AI_MODEL_SUMMARY || model,
				// A model with tool calling; the translation model may not have it.
				assistantModel: env.AI_MODEL_ASSISTANT || model,
			});
		}
		default:
			return new FakeProvider();
	}
}

@Module({
	providers: [{ provide: AI_PROVIDER, useFactory: () => createProvider() }, AiService],
	exports: [AiService],
})
export class AiModule {}
