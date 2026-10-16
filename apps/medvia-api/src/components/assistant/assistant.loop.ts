import { AgentMessage, AgentStep, AgentToolCall, AgentToolResult } from '../ai/ai.types';
import { MAX_STEPS } from './assistant.rules';

export interface TurnDeps {
	/** One model step over the whole conversation; null when the provider failed. */
	converse(messages: AgentMessage[]): Promise<AgentStep | null>;
	/** Runs one call (arguments already checked or not) and never throws: errors are results. */
	runTool(call: AgentToolCall): Promise<AgentToolResult>;
	provider: string;
}

export interface TurnResult {
	/** What this turn appends to the history: the user's message, every step, every result. */
	added: AgentMessage[];
	/** The final answer; null when the turn could not finish (step limit, provider failure). */
	text: string | null;
	toolsUsed: string[];
	/** The provider failed before anything happened: nothing should be stored. */
	unavailable: boolean;
}

/**
 * One turn of the agent loop, with no database and no Nest — the part worth testing alone.
 * model → tools → model … until the model answers without tool calls, or MAX_STEPS model calls
 * have been made. A provider failure on the first step means "unavailable"; later, the turn
 * ends without an answer and the caller says so in the patient's language.
 */
export async function runTurn(
	history: AgentMessage[],
	userText: string,
	deps: TurnDeps,
): Promise<TurnResult> {
	const added: AgentMessage[] = [{ role: 'user', text: userText }];
	const toolsUsed: string[] = [];
	for (let step = 0; step < MAX_STEPS; step++) {
		const answer = await deps.converse([...history, ...added]);
		if (!answer) return { added, text: null, toolsUsed, unavailable: step === 0 };
		added.push({
			role: 'assistant',
			text: answer.text,
			toolCalls: answer.toolCalls,
			raw: answer.raw,
			provider: deps.provider,
		});
		if (!answer.toolCalls.length) {
			return { added, text: answer.text.trim() || null, toolsUsed, unavailable: false };
		}
		const results: AgentToolResult[] = [];
		for (const call of answer.toolCalls) {
			toolsUsed.push(call.name);
			results.push(await deps.runTool(call));
		}
		// All results of one step in one message — what both providers expect.
		added.push({ role: 'tool', results });
	}
	return { added, text: null, toolsUsed, unavailable: false };
}
