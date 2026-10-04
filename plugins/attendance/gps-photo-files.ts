/**
 * GPS チェックイン写真の本体を CORPUS_DATA 配下へ置くファイルストア。
 *
 * ファイル名は SHA-256 (内容アドレス) なので、 利用者の入力がパスに入らない。
 * 書き込みは一時ファイル → rename で、 途中で落ちても壊れた写真を残さない。
 */

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const SHA256_HEX = /^[0-9a-f]{64}$/;

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export interface GpsPhotoFileStore {
  write(sha256: string, bytes: Uint8Array): Promise<void>;
  read(sha256: string): Promise<Uint8Array | null>;
}

export class DirectoryGpsPhotoFiles implements GpsPhotoFileStore {
  constructor(private readonly dir: string) {}

  async write(sha256: string, bytes: Uint8Array): Promise<void> {
    const target = this.pathOf(sha256);
    await mkdir(this.dir, { recursive: true });
    const temporary = join(this.dir, `.${sha256}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, bytes, { flag: 'wx' });
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  async read(sha256: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await readFile(this.pathOf(sha256)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  private pathOf(sha256: string): string {
    if (!SHA256_HEX.test(sha256)) throw new Error('invalid photo digest');
    return join(this.dir, sha256);
  }
}
