// Anthropic API backend (fetch 直叩き。 SDK 依存を持たない)。
//
// API キーが要る (ANTHROPIC_API_KEY)。 サブスクではなく従量課金。

import type { BotConfig } from '../config.ts';
import type { LlmClient, LlmInvokeArgs, LlmResult } from './client.ts';

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  error?: { message?: string };
}

export class AnthropicClient implements LlmClient {
  readonly backend = 'anthropic';
  constructor(private readonly cfg: BotConfig) {}

  async invoke(args: LlmInvokeArgs): Promise<LlmResult> {
    const { anthropicApiKey, anthropicBaseUrl } = this.cfg.llm;
    if (!anthropicApiKey) throw new Error('ANTHROPIC_API_KEY が未設定です。');

    const res = await fetch(`${anthropicBaseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: args.model,
        max_tokens: args.maxTokens,
        system: args.system,
        messages: args.messages,
      }),
    });

    const data = (await res.json()) as AnthropicResponse;
    if (!res.ok) {
      throw new Error(`Anthropic API ${res.status}: ${data.error?.message ?? 'unknown'}`);
    }
    const text = (data.content ?? [])
      .filter((b) => b.type === 'text' && b.text)
      .map((b) => b.text)
      .join('');
    return { text: text.trim() };
  }
}
