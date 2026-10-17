import { envValidationSchema } from './env.validation';

const base = {
	REDIS_URL: 'redis://localhost:6379',
	SECRET_TOKEN: 'a-secret-of-at-least-16',
	MEDICAL_ENC_KEY: 'q6Sb7dUJ0Yy0mFZ3m8fWc0bJ6fG2x9pQk4rT1vL8nHs=',
};
const DEV_URI = 'mongodb+srv://u:p@cluster.mongodb.net/MedVia';
const PROD_URI = 'mongodb+srv://u:p@cluster.mongodb.net/MedVia-Prod';
const errorOf = (env: Record<string, string>) => envValidationSchema.validate(env).error?.message;

describe('which database URI the app requires', () => {
	it('development needs MONGO_DEV, not MONGO_PROD', () => {
		expect(errorOf({ ...base, MONGO_DEV: DEV_URI })).toBeUndefined();
		expect(errorOf({ ...base })).toContain('"MONGO_DEV" is required');
	});

	it('production needs MONGO_PROD, not MONGO_DEV', () => {
		expect(errorOf({ ...base, NODE_ENV: 'production', MONGO_PROD: PROD_URI })).toBeUndefined();
		expect(errorOf({ ...base, NODE_ENV: 'production', MONGO_DEV: DEV_URI })).toContain(
			'"MONGO_PROD" is required',
		);
	});

	it('still refuses a value that is not a MongoDB URI', () => {
		expect(
			errorOf({ ...base, NODE_ENV: 'production', MONGO_PROD: 'https://example.com' }),
		).toContain('MONGO_PROD');
	});
});
