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

  it('limits the member-visible daily roster to the fields used by the panel', async () => {
    const [module, panel] = await Promise.all([
      readFile('plugins/attendance/index.ts', 'utf8'),
      readFile('plugins/attendance/panel.ts', 'utf8'),
    ]);
    const view = module.match(/function todayAttendanceView[\s\S]*?\n}/)?.[0];
    assert.ok(view);
    assert.match(view, /displayName: getDisplayName/);
    assert.match(view, /checkedInAt: row\.checked_in_at/);
    assert.match(view, /source: row\.source/);
    assert.doesNotMatch(view, /userId|facilityId|assurance|event/);
    assert.match(module, /router\.get\('\/today'[\s\S]*?noStore\(c\)[\s\S]*?rows\.map\(\(row\) => todayAttendanceView\(db, row\)\)/);

    const roster = panel.match(/function appendTodayRoster[\s\S]*?\n}/)?.[0];
    assert.ok(roster);
    assert.doesNotMatch(roster, /userId|facilityId|assurance|eventTitle|appendFacePhoto/);
  });
});
