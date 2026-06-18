// Mock backend (テスト / LLM 無効時)。

import type { LlmClient, LlmInvokeArgs, LlmResult } from './client.ts';

export class MockClient implements LlmClient {
  readonly backend = 'mock';
  async invoke(args: LlmInvokeArgs): Promise<LlmResult> {
    const last = args.messages.at(-1)?.content ?? '';
    return { text: `(mock) 受け取りました: ${last}` };
  }
}
