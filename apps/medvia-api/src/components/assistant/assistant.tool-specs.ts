import { Language } from '../../libs/enums/common.enum';
import { District, Specialty } from '../../libs/enums/clinic.enum';
import { AgentToolSpec } from '../ai/ai.types';

/**
 * What the model is told about each tool — names, descriptions, JSON Schemas. Kept apart from
 * the handlers (assistant.tools.ts) so the specs can be read and tested without any service.
 */

const OBJECT_ID = '^[0-9a-f]{24}$';
const DATE = '^\\d{4}-\\d{2}-\\d{2}$';
const ISO_INSTANT = '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(:\\d{2}(\\.\\d+)?)?(Z|[+-]\\d{2}:\\d{2})$';

/**
 * Five tools, described once. Few and specific: a free model chooses better between five clear
 * tools than between fifteen. Every schema is closed (additionalProperties: false), which
 * Anthropic's strict mode requires and checkArgs enforces for every provider.
 */
export const TOOL_SPECS: AgentToolSpec[] = [
	{
		name: 'search_clinics',
		description:
			'Find verified Seoul clinics, best first ("Recommended"). Each clinic comes with its cheapest treatments (treatmentId, name, priceKrw, minutes). Use the filters the patient mentioned; all are optional.',
		parameters: {
			type: 'object',
			additionalProperties: false,
			properties: {
				text: {
					type: 'string',
					maxLength: 60,
					description: 'A clinic or treatment name, e.g. "laser toning".',
				},
				specialty: { type: 'string', enum: Object.values(Specialty) },
				district: { type: 'string', enum: Object.values(District) },
				language: {
					type: 'string',
					enum: Object.values(Language),
					description: 'A language the clinic speaks.',
				},
				interpreter: {
					type: 'boolean',
					description: 'Only clinics with an interpreter for `language`.',
				},
				priceMax: {
					type: 'integer',
					minimum: 0,
					maximum: 50000000,
					description: 'Highest starting price in KRW.',
				},
			},
			required: [],
		},
	},
	{
		name: 'find_slots',
		description:
			'Free start times for one treatment, earliest first, Seoul time. Without doctorId, every doctor who performs it.',
		parameters: {
			type: 'object',
			additionalProperties: false,
			properties: {
				treatmentId: { type: 'string', pattern: OBJECT_ID },
				doctorId: { type: 'string', pattern: OBJECT_ID },
				dateFrom: {
					type: 'string',
					pattern: DATE,
					description: 'First day, YYYY-MM-DD (Seoul). Default: tomorrow.',
				},
				days: {
					type: 'integer',
					minimum: 1,
					maximum: 7,
					description: 'How many days to look at. Default 7.',
				},
			},
			required: ['treatmentId'],
		},
	},
	{
		name: 'get_reviews',
		description: "A clinic's latest verified reviews (from completed visits only) and its rating.",
		parameters: {
			type: 'object',
			additionalProperties: false,
			properties: { clinicId: { type: 'string', pattern: OBJECT_ID } },
			required: ['clinicId'],
		},
	},
	{
		name: 'my_bookings',
		description: "The patient's upcoming bookings.",
		parameters: { type: 'object', additionalProperties: false, properties: {}, required: [] },
	},
	{
		name: 'propose_hold',
		description:
			'Propose one free time to the patient. This does NOT book or hold anything: the app shows a Confirm button, and only the patient can press it. Use a treatmentId, doctorId and slotStart exactly as find_slots returned them.',
		parameters: {
			type: 'object',
			additionalProperties: false,
			properties: {
				treatmentId: { type: 'string', pattern: OBJECT_ID },
				doctorId: { type: 'string', pattern: OBJECT_ID },
				slotStart: { type: 'string', pattern: ISO_INSTANT },
			},
			required: ['treatmentId', 'doctorId', 'slotStart'],
		},
	},
];

export const TOOL_BY_NAME = new Map(TOOL_SPECS.map((t) => [t.name, t]));
