import assert from 'node:assert/strict';
import { it } from 'node:test';
import { isWindowsExecutable } from '../plugins/projects/showcase-executable.ts';

it('rejects archives, disguised DLLs and malformed PE offsets', () => {
  const bytes = new Uint8Array(128);
  const view = new DataView(bytes.buffer);
  bytes[0] = 0x4d; bytes[1] = 0x5a;
  view.setUint32(0x3c, 64, true); view.setUint32(64, 0x4550, true); view.setUint16(86, 2, true);
  assert.equal(isWindowsExecutable('Game.exe', bytes), true);
  for (const name of ['source.zip', '../game.exe', 'game.exe\r\nfoo', 'game.dll']) assert.equal(isWindowsExecutable(name, bytes), false);
  view.setUint16(86, 0x2002, true);
  assert.equal(isWindowsExecutable('renamed.exe', bytes), false);
  view.setUint32(0x3c, 0xffffffff, true);
  assert.equal(isWindowsExecutable('broken.exe', bytes), false);
  assert.equal(isWindowsExecutable('renamed.exe', new TextEncoder().encode('not a program')), false);
});
