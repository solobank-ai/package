/**
 * OpenAI provider — wraps chat completions with function calling.
 */

import type { ToolDefinition } from './tools.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export interface ProviderUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface ProviderResponse {
  message: ChatMessage;
  usage: ProviderUsage;
  finishReason: string;
}

export class OpenAIProvider {
  private apiKey: string;
  private model: string;

  constructor(options: { apiKey: string; model?: string }) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? 'gpt-4o-mini';
  }

  async chat(messages: ChatMessage[], tools: ToolDefinition[]): Promise<ProviderResponse> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
        temperature: 0.3,
        max_tokens: 2048,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${err}`);
    }

    const data = (await res.json()) as {
      choices: Array<{
        message: ChatMessage;
        finish_reason: string;
      }>;
      usage: {
        prompt_tokens: number;
        completion_tokens: number;
      };
    };

    const choice = data.choices[0];
    return {
      message: choice.message,
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
      },
      finishReason: choice.finish_reason,
    };
  }
}
