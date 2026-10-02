/** @implements SPEC-GLAB-BOOTSTRAP */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
const execute = promisify(execFile);

function gitOptions(cwd) {
  return { cwd, encoding: 'utf8', windowsHide: true, timeout: 600000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } };
}

/** `git submodule status` の各行を { state, path } にする (' ' 一致 / '-' 未初期化 / '+' 'U' 不一致)。 */
export function parseSubmoduleStatus(stdout) {
  return stdout.split('\n').filter((line) => line.trim()).map((line) => ({
    state: line[0],
    path: line.slice(1).trim().split(/\s+/)[1],
  }));
}

/**
 * cwd の submodule (paths 指定時はその範囲) を記録済み gitlink に揃える。
 * 未初期化だけを初期化し、別 revision の checkout は reset せず拒否する。
 */
async function ensureSubmodules(cwd, paths, label) {
  const options = gitOptions(cwd);
  const read = async () =>
    parseSubmoduleStatus((await execute('git', ['submodule', 'status', '--', ...paths], options)).stdout);
  const entries = await read();
  const mismatched = entries.filter((entry) => entry.state !== ' ' && entry.state !== '-');
  if (mismatched.length) {
    throw new Error(label + ' submodule ' + mismatched.map((entry) => entry.path).join(', ')
      + ' must match the recorded gitlink; setup does not reset existing checkouts.');
  }
  const missing = entries.filter((entry) => entry.state === '-').map((entry) => entry.path);
  if (missing.length) await execute('git', ['submodule', 'update', '--init', '--', ...missing], options);
  if ((await read()).some((entry) => entry.state !== ' ')) {
    throw new Error(label + ' submodule initialization did not reach the recorded gitlink.');
  }
}

export async function prepareCorpus(root) {
  await ensureSubmodules(root, ['corpus'], 'Corpus');
  const corpus = join(root, 'corpus');
  // Corpus 自身の submodule (lib/vestigium = file: 依存、lib/cernere = ログイン UI の import 元)。
  // 非再帰の初期化では空のまま残り、新規 clone で依存解決と build が失敗する。
  await ensureSubmodules(corpus, [], 'Corpus nested');
  const dirty = await execute('git', ['status', '--porcelain', '--untracked-files=normal'], gitOptions(corpus));
  if (dirty.stdout.trim()) throw new Error('Corpus has local changes; preserve them before running setup.');
}
