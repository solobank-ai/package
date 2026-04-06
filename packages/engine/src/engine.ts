/**
 * QueryEngine — orchestrates LLM + tools in an async generator loop.
 */

import { OpenAIProvider, type ChatMessage } from './provider.js';
import { TOOL_DEFINITIONS, READ_TOOLS, executeTool, type Agent } from './tools.js';
import { SessionStore } from './session.js';
import { CostTracker } from './cost.js';

export interface EngineEvent {
  type: 'text' | 'tool_call' | 'tool_result' | 'error' | 'done';
  data: unknown;
}

const SYSTEM_PROMPT = `You are Solobank AI — an autonomous DeFi banking agent on Solana.

You help users manage their finances: check balances, send tokens, swap via Jupiter, earn yield on Kamino/Marginfi, borrow, repay, and pay for APIs.

Rules:
- Always check balance before suggesting financial operations
- Be concise — use exact numbers, format USD amounts with $
- For send/swap, confirm the action before executing (use dryRun first if unsure)
- Never reveal private keys or sensitive wallet data
- If an operation fails, explain why clearly
- When comparing lending rates, recommend the best option with reasoning`;

const MAX_ITERATIONS = 10;

export class QueryEngine {
  private provider: OpenAIProvider;
  private agent: Agent;
  private sessions: SessionStore;
  private costs: CostTracker;
  private model: string;

  constructor(options: {
    apiKey: string;
    agent: Agent;
    model?: string;
  }) {
    this.model = options.model ?? 'gpt-4o-mini';
    this.provider = new OpenAIProvider({ apiKey: options.apiKey, model: this.model });
    this.agent = options.agent;
    this.sessions = new SessionStore();
    this.costs = new CostTracker();
  }

  async *query(sessionId: string, userMessage: string): AsyncGenerator<EngineEvent> {
    // Get or create session
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = this.sessions.create(sessionId);
      session.messages.push({ role: 'system', content: SYSTEM_PROMPT });
    }

    // Append user message
    session.messages.push({ role: 'user', content: userMessage });

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      // Call LLM
      let response;
      try {
        response = await this.provider.chat(session.messages, TOOL_DEFINITIONS);
      } catch (err) {
        yield { type: 'error', data: { message: err instanceof Error ? err.message : String(err) } };
        return;
      }

      // Track cost
      const cost = this.costs.track(this.model, response.usage);
      session.totalCost += cost;

      // Append assistant message
      session.messages.push(response.message);

      // If no tool calls — return text
      if (response.finishReason === 'stop' || !response.message.tool_calls?.length) {
        if (response.message.content) {
          yield { type: 'text', data: { content: response.message.content } };
        }
        yield {
          type: 'done',
          data: {
            sessionId,
            cost: this.costs.getTotalCost(),
            tokens: this.costs.getTotalTokens(),
          },
        };
        this.sessions.save(session);
        return;
      }

      // Dispatch tool calls
      const toolCalls = response.message.tool_calls;

      // Separate read and write tools
      const reads = toolCalls.filter((tc) => READ_TOOLS.has(tc.function.name));
      const writes = toolCalls.filter((tc) => !READ_TOOLS.has(tc.function.name));

      // Execute reads in parallel
      if (reads.length > 0) {
        const readResults = await Promise.all(
          reads.map(async (tc) => {
            const args = JSON.parse(tc.function.arguments || '{}');
            yield_event: {
              // We can't yield from inside Promise.all, so collect results
            }
            const result = await executeTool(this.agent, tc.function.name, args);
            return { tc, result };
          }),
        );

        for (const { tc, result } of readResults) {
          yield { type: 'tool_call', data: { name: tc.function.name, args: JSON.parse(tc.function.arguments || '{}') } };
          yield { type: 'tool_result', data: { name: tc.function.name, result: JSON.parse(result) } };
          session.messages.push({
            role: 'tool',
            content: result,
            tool_call_id: tc.id,
          });
        }
      }

      // Execute writes sequentially
      for (const tc of writes) {
        const args = JSON.parse(tc.function.arguments || '{}');
        yield { type: 'tool_call', data: { name: tc.function.name, args } };

        const result = await executeTool(this.agent, tc.function.name, args);
        yield { type: 'tool_result', data: { name: tc.function.name, result: JSON.parse(result) } };

        session.messages.push({
          role: 'tool',
          content: result,
          tool_call_id: tc.id,
        });
      }

      // Continue loop — LLM will process tool results
    }

    yield { type: 'error', data: { message: 'Max iterations reached' } };
  }

  getSessionStore(): SessionStore {
    return this.sessions;
  }

  getCostTracker(): CostTracker {
    return this.costs;
  }
}
