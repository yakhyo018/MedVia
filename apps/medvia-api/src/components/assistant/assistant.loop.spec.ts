import { AgentStep, AgentToolCall } from '../ai/ai.types';
import { runTurn, TurnDeps } from './assistant.loop';
import { MAX_STEPS } from './assistant.rules';

const answer = (text: string): AgentStep => ({ text, toolCalls: [], stop: 'end' });
const wants = (name: string): AgentStep => ({
	text: '',
	toolCalls: [{ id: `c-${name}`, name, args: {} }],
	stop: 'tool_use',
});

function deps(steps: (AgentStep | null)[]): TurnDeps & { calls: AgentToolCall[]; seen: number[] } {
	const calls: AgentToolCall[] = [];
	const seen: number[] = [];
	let i = 0;
	return {
		provider: 'fake',
		calls,
		seen,
		converse: async (messages) => (
			seen.push(messages.length),
			steps[Math.min(i++, steps.length - 1)]
		),
		runTool: async (call) => (
			calls.push(call),
			{ callId: call.id, name: call.name, content: '{}' }
		),
	};
}

describe('runTurn — the agent loop', () => {
	it('model → tool → model → answer', async () => {
		const d = deps([wants('search_clinics'), answer('Here are two clinics.')]);
		const turn = await runTurn([], 'laser in Gangnam', d);
		expect(turn.text).toBe('Here are two clinics.');
		expect(turn.toolsUsed).toEqual(['search_clinics']);
		expect(turn.added.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
		// The second step sees the first step and its tool result.
		expect(d.seen).toEqual([1, 3]);
	});

	it('stops after MAX_STEPS model calls when the model never stops calling tools', async () => {
		const d = deps([wants('search_clinics')]);
		const turn = await runTurn([], '#loop', d);
		expect(turn.text).toBeNull();
		expect(d.seen).toHaveLength(MAX_STEPS);
		expect(d.calls).toHaveLength(MAX_STEPS);
		expect(turn.unavailable).toBe(false);
	});

	it('is "unavailable" only when the very first step fails', async () => {
		expect((await runTurn([], 'hi', deps([null]))).unavailable).toBe(true);
		const late = await runTurn([], 'hi', deps([wants('my_bookings'), null]));
		expect([late.unavailable, late.text]).toEqual([false, null]);
	});

	it('keeps the provider and the raw reply on the assistant turn', async () => {
		const raw = [
			{ type: 'thinking', thinking: '' },
			{ type: 'text', text: 'Hi' },
		];
		const turn = await runTurn([], 'hi', deps([{ ...answer('Hi'), raw }]));
		expect(turn.added[1]).toMatchObject({ role: 'assistant', provider: 'fake', raw });
	});

	it('answers every call of a step in one tool message', async () => {
		const two: AgentStep = {
			text: '',
			toolCalls: [
				{ id: 'a', name: 'get_reviews', args: {} },
				{ id: 'b', name: 'my_bookings', args: {} },
			],
			stop: 'tool_use',
		};
		const turn = await runTurn([], 'hi', deps([two, answer('ok')]));
		const tool = turn.added[2];
		expect(tool.role === 'tool' && tool.results.map((r) => r.callId)).toEqual(['a', 'b']);
	});
});
