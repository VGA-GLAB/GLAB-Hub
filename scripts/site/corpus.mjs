/** @implements SPEC-GLAB-BOOTSTRAP */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
const execute = promisify(execFile);

export async function prepareCorpus(root) {
  const options = { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 600000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } };
  const status = await execute('git', ['submodule', 'status', '--', 'corpus'], options);
  if (status.stdout.startsWith('-')) {
    await execute('git', ['submodule', 'update', '--init', '--', 'corpus'], options);
  } else if (!status.stdout.startsWith(' ')) {
    throw new Error('Corpus must match the recorded gitlink; setup does not reset existing checkouts.');
  }
  const verified = await execute('git', ['submodule', 'status', '--', 'corpus'], options);
  if (!verified.stdout.startsWith(' ')) throw new Error('Corpus initialization did not reach the recorded gitlink.');
  const dirty = await execute('git', ['status', '--porcelain', '--untracked-files=normal'],
    { ...options, cwd: join(root, 'corpus') });
  if (dirty.stdout.trim()) throw new Error('Corpus has local changes; preserve them before running setup.');
}
