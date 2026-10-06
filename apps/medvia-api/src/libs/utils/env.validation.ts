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

	// Added in later milestones; optional for now.
	GOOGLE_CLIENT_ID: Joi.string().allow('').optional(),
	MEDICAL_ENC_KEY: Joi.string().allow('').optional(),
}).unknown(true);
