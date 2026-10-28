// @implements SPEC-GLAB-COCOIRU-DISTRIBUTION-001
import { lstat, open, realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { MAX_RELEASE, verifyRelease } from './signed-release.ts';
import type { LibraryEntry } from './types.ts';

/** Only trusted operators populate this root. No remote URLs or archive extraction. */
export async function readRelease(root: string, pin: string, entry: LibraryEntry): Promise<Buffer> {
  if (!isAbsolute(root) || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(entry.id)) throw new Error('Invalid release root');
  const rootPath = resolve(root), file = join(rootPath, `${entry.id}.cocoiru`);
  if ((await lstat(rootPath)).isSymbolicLink() || await realpath(rootPath) !== rootPath
    || (await lstat(file)).isSymbolicLink() || await realpath(file) !== file) throw new Error('Release links are forbidden');
  const handle = await open(file, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > MAX_RELEASE) throw new Error('Invalid release size');
    const raw = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < raw.length) {
      const { bytesRead } = await handle.read(raw, offset, raw.length - offset, offset);
      if (!bytesRead) throw new Error('Truncated release');
      offset += bytesRead;
    }
    const { manifest } = verifyRelease(raw, pin);
    if (manifest.id !== entry.id || manifest.version !== entry.version || manifest.sha256 !== entry.sha256
      || manifest.kind !== entry.kind || manifest.platform !== entry.platform) throw new Error('Catalog release mismatch');
    return raw;
  } finally { await handle.close(); }
}
