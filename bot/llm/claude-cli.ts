// claude CLI backend。
//
// `claude -p --output-format json` を subprocess 起動し、 プロンプトを stdin で渡す
// (Windows の ENAMETOOLONG 回避、 [[feedback_claude_cli_long_prompt]])。 Node から
// spawn するときは CLAUDE_CODE_GIT_BASH_PATH が必要 ([[feedback_claude_cli_windows_bash]])。
// サブスク CLI なので API キー不要。

import { spawn } from 'node:child_process';
import type { BotConfig } from '../config.ts';
import type { LlmClient, LlmInvokeArgs, LlmResult } from './client.ts';

/** system + 会話履歴を 1 本のプロンプト文字列にまとめる (claude -p は単一プロンプト)。 */
function flatten(args: LlmInvokeArgs): string {
  const parts: string[] = [];
  if (args.system) parts.push(args.system, '');
  for (const m of args.messages) {
    parts.push(`${m.role === 'user' ? 'ユーザ' : 'アシスタント'}: ${m.content}`);
  }
  parts.push('アシスタント:');
  return parts.join('\n');
}

export class ClaudeCliClient implements LlmClient {
  readonly backend = 'claude-cli';
  constructor(private readonly cfg: BotConfig) {}

  invoke(args: LlmInvokeArgs): Promise<LlmResult> {
    const prompt = flatten(args);
    const { claudeCliPath, claudeCliTimeoutMs, gitBashPath, model } = this.cfg.llm;

    return new Promise<LlmResult>((resolvePromise, reject) => {
      const child = spawn(
        claudeCliPath,
        ['-p', '--output-format', 'json', '--model', model],
        {
          env: { ...process.env, CLAUDE_CODE_GIT_BASH_PATH: gitBashPath },
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );

      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`claude CLI timeout (${claudeCliTimeoutMs}ms)`));
      }, claudeCliTimeoutMs);

      child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
      child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
      child.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(new Error(`claude CLI exited ${code}: ${stderr.slice(0, 500)}`));
          return;
        }
        try {
          const env = JSON.parse(stdout) as { result?: string; error?: string };
          if (typeof env.result === 'string') {
            resolvePromise({ text: env.result.trim() });
          } else {
            reject(new Error(`claude CLI: unexpected envelope: ${stdout.slice(0, 300)}`));
          }
        } catch {
          // --output-format json でないケースの保険: 生テキストを返す
          resolvePromise({ text: stdout.trim() });
        }
      });

      child.stdin.end(prompt);
    });
  }
}
