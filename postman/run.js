/**
 * Runs the Postman tests from the terminal.
 *
 *   npm run test:api          every milestone folder
 *   npm run test:api -- M1    only folders whose name starts with "M1"
 *
 * Postman 12 stores a collection as one YAML file per request. This script reads
 * those same files, builds a collection in memory and hands it to Newman, so the
 * tests have one source: what you edit in Postman is what runs here.
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const newman = require('newman');

const POSTMAN_DIR = __dirname;
const COLLECTION_NAME = 'MedVia API';
const SCRIPT_EVENT = { afterResponse: 'test', beforeRequest: 'prerequest' };

/** Finds `<anything>/collections/MedVia API`, wherever Postman put it. */
function findCollectionDir(dir) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (!entry.isDirectory() || entry.name === 'node_modules') continue;
		const full = path.join(dir, entry.name);
		if (entry.name === COLLECTION_NAME && path.basename(dir) === 'collections') return full;
		const found = findCollectionDir(full);
		if (found) return found;
	}
	return null;
}

function readYaml(file) {
	return fs.existsSync(file) ? yaml.load(fs.readFileSync(file, 'utf8')) : {};
}

function toNewmanRequest(name, spec) {
	const request = {
		method: spec.method,
		url: spec.url,
		header: Object.entries(spec.headers || {}).map(([key, value]) => ({ key, value })),
	};

	if (spec.body?.type === 'graphql') {
		const { query = '', variables = '' } = spec.body.content || {};
		if (!query.trim()) throw new Error(`"${name}" has an empty GraphQL query`);
		const vars = typeof variables === 'string' ? variables : JSON.stringify(variables);
		request.body = { mode: 'graphql', graphql: { query, variables: vars } };
	} else if (spec.body?.type === 'json') {
		request.body = { mode: 'raw', raw: spec.body.content, options: { raw: { language: 'json' } } };
	}

	const event = (spec.scripts || []).map((script) => ({
		listen: SCRIPT_EVENT[script.type] || 'test',
		script: { type: 'text/javascript', exec: script.code.split('\n') },
	}));

	return { name, request, event, order: spec.order ?? 0 };
}

function loadFolder(folderDir) {
	return fs
		.readdirSync(folderDir)
		.filter((file) => file.endsWith('.request.yaml'))
		.map((file) =>
			toNewmanRequest(file.replace('.request.yaml', ''), readYaml(path.join(folderDir, file))),
		)
		.sort((a, b) => a.order - b.order);
}

function loadEnvironment(collectionDir) {
	const envFile = path.join(
		collectionDir,
		'..',
		'..',
		'environments',
		'MedVia Local.environment.yaml',
	);
	const values = (readYaml(envFile).values || []).map(({ key, value }) => ({
		key,
		value,
		enabled: true,
	}));
	if (process.env.BASE_URL) {
		const base = values.find((v) => v.key === 'baseUrl');
		if (base) base.value = process.env.BASE_URL;
		else values.push({ key: 'baseUrl', value: process.env.BASE_URL, enabled: true });
	}
	return { name: 'MedVia Local', values };
}

async function assertApiIsUp(baseUrl) {
	try {
		await fetch(baseUrl, { signal: AbortSignal.timeout(3000) });
	} catch {
		console.error(`\nAPI is not reachable at ${baseUrl}. Start it first: npm run start:dev\n`);
		process.exit(1);
	}
}

async function main() {
	const filter = process.argv[2];
	const collectionDir = findCollectionDir(POSTMAN_DIR);
	if (!collectionDir)
		throw new Error(`No "${COLLECTION_NAME}" collection found under ${POSTMAN_DIR}`);

	const folders = fs
		.readdirSync(collectionDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && entry.name !== '.resources')
		.filter((entry) => !filter || entry.name.startsWith(filter))
		.map((entry) => {
			const dir = path.join(collectionDir, entry.name);
			const meta = readYaml(path.join(dir, '.resources', 'definition.yaml'));
			return { name: entry.name, order: meta.order ?? 0, item: loadFolder(dir) };
		})
		.sort((a, b) => a.order - b.order);

	if (folders.length === 0) throw new Error(`No folder matches "${filter}"`);

	const environment = loadEnvironment(collectionDir);
	const baseUrl =
		environment.values.find((v) => v.key === 'baseUrl')?.value || 'http://localhost:3000';
	await assertApiIsUp(baseUrl);

	console.log(`Running: ${folders.map((f) => f.name).join(', ')}  →  ${baseUrl}\n`);

	const collection = {
		info: {
			name: COLLECTION_NAME,
			schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
		},
		item: folders.map(({ name, item }) => ({ name, item })),
	};

	newman.run({ collection, environment, reporters: ['cli'] }, (err, summary) => {
		if (err) throw err;
		process.exit(summary.run.failures.length > 0 ? 1 : 0);
	});
}

main().catch((err) => {
	console.error(`\n${err.message}\n`);
	process.exit(1);
});
