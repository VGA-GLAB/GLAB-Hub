// LLM クライアント抽象 (Discutere の LLMClient 流儀)。
//
// backend を差し替え可能にする: claude-cli (既定。 Lictor/サブスク経由、 API キー不要) /
// anthropic (API 直叩き) / mock (テスト)。 local (OpenAI 互換) は follow-up。

import type { BotConfig } from '../config.ts';
import { ClaudeCliClient } from './claude-cli.ts';
import { AnthropicClient } from './anthropic.ts';
import { MockClient } from './mock.ts';

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmInvokeArgs {
  system: string;
  messages: LlmMessage[];
  model: string;
  maxTokens: number;
}

export interface LlmResult {
  text: string;
}

export interface LlmClient {
  readonly backend: string;
  invoke(args: LlmInvokeArgs): Promise<LlmResult>;
}

export function createLlmClient(cfg: BotConfig): LlmClient {
  switch (cfg.llm.backend) {
    case 'anthropic':
      return new AnthropicClient(cfg);
    case 'mock':
      return new MockClient();
    case 'claude-cli':
    default:
      return new ClaudeCliClient(cfg);
  }
}
