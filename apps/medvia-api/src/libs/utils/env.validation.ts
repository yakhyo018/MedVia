import * as Joi from 'joi';

const mongoUri = Joi.string().pattern(/^mongodb(\+srv)?:\/\//);

/**
 * The app refuses to boot when a required variable is missing or malformed.
 * Failing here is cheaper than failing on the first query in production.
 */
export const envValidationSchema = Joi.object({
	NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
	PORT_API: Joi.number().port().default(3000),
	PORT_BATCH: Joi.number().port().default(3001),

	MONGO_DEV: mongoUri.required(),
	MONGO_PROD: mongoUri.allow('').optional(),

	REDIS_URL: Joi.string()
		.pattern(/^rediss?:\/\//)
		.required(),

	SECRET_TOKEN: Joi.string().min(16).required(),

	// The only browser origin allowed to send the refresh cookie (comma-separated for several).
	FRONTEND_URL: Joi.string().default('http://localhost:4000'),

	// Read by `npm run seed:admin` and by `npm run test:api`; the API itself never needs them.
	ADMIN_EMAIL: Joi.string()
		.email({ tlds: { allow: false } })
		.allow('')
		.optional(),
	ADMIN_PASSWORD: Joi.string().allow('').optional(),

	// Name of the Atlas Search index on `clinics`. Empty: clinic text search falls back to
	// a regex on the names (docs/atlas-search/clinics.json describes the index).
	ATLAS_SEARCH_INDEX: Joi.string().allow('').optional(),

	// AES-256 key for the booking questionnaire: 32 random bytes, base64 (44 characters).
	// `openssl rand -base64 32`. Losing it makes every stored questionnaire unreadable.
	MEDICAL_ENC_KEY: Joi.string().base64().length(44).required(),

	// "true" registers the Postman-only test helpers (devShiftBookingTime). Ignored in production.
	ENABLE_TEST_SUPPORT: Joi.string().valid('true', 'false', '').optional(),

	// AI-1. fake (default, tests) | openrouter (demo, synthetic data) | anthropic (production).
	// The production lock and the per-provider key check live in ai.rules (checkProvider).
	AI_PROVIDER: Joi.string().valid('fake', 'openrouter', 'anthropic').default('fake'),
	OPENROUTER_API_KEY: Joi.string().allow('').optional(),
	ANTHROPIC_API_KEY: Joi.string().allow('').optional(),
	// Model ids; anthropic defaults to claude-haiku-4-5 (chat) and claude-opus-5-5 (summary).
	AI_MODEL_TRANSLATE: Joi.string().allow('').optional(),
	AI_MODEL_SUMMARY: Joi.string().allow('').optional(),

	// Added in later milestones; optional for now.
	GOOGLE_CLIENT_ID: Joi.string().allow('').optional(),
}).unknown(true);
