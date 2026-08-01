import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

describe('attendance ledger contract', () => {
  it('keeps replay detection distinct from same-day idempotency', async () => {
    const source = await readFile('plugins/attendance/index.ts', 'utf8');
    assert.match(source, /error: 'replay_detected'.*409/s);
    assert.match(source, /alreadyCheckedIn: true/);
    assert.ok(source.indexOf('if (!reserveAttendanceNonce') < source.indexOf('const created = recordAttendance'));
  });

  it('does not delegate attendance verification to Aedilis or offer self-checkin', async () => {
    const [module, panel] = await Promise.all([
      readFile('plugins/attendance/index.ts', 'utf8'),
      readFile('plugins/attendance/panel.ts', 'utf8'),
    ]);
    assert.doesNotMatch(module, /authorizedConnectorFetch|AEDILIS_BASE_URL|mine\/checkin/);
    assert.doesNotMatch(panel, /mine\/checkin/);
  });
});
