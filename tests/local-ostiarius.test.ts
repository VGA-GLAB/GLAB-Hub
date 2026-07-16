import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canReachLocalOstiarius } from '../plugins/attendance/local-ostiarius.ts';

describe('local Ostiarius reachability', () => {
  it('accepts only a successful Ostiarius health response', async () => {
    const fetchImpl = async () => Response.json({ ok: true, service: 'ostiarius' });
    assert.equal(
      await canReachLocalOstiarius('http://192.168.50.20:17590/', fetchImpl),
      true,
    );
  });

  it('treats an unreachable or unrelated endpoint as outside the venue LAN', async () => {
    const unreachable = async (): Promise<Response> => {
      throw new Error('unreachable');
    };
    const unrelated = async () => Response.json({ ok: true, service: 'other' });
    assert.equal(await canReachLocalOstiarius('http://192.168.50.20:17590', unreachable), false);
    assert.equal(await canReachLocalOstiarius('http://192.168.50.20:17590', unrelated), false);
  });
});
