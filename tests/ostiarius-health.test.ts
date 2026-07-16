import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ostiariusBrowserBaseUrl } from '../plugins/attendance/ostiarius-health.ts';

describe('Ostiarius browser route', () => {
  it('uses the LAN URL advertised by Ostiarius health', () => {
    assert.equal(
      ostiariusBrowserBaseUrl(
        { lanUrl: 'http://192.168.50.20:17590' },
      ),
      'http://192.168.50.20:17590',
    );
  });

  it('rejects an absent or non-HTTP LAN origin instead of exposing a fallback URL', () => {
    assert.equal(ostiariusBrowserBaseUrl({}), null);
    assert.equal(
      ostiariusBrowserBaseUrl({ lanUrl: 'javascript:alert(1)' }),
      null,
    );
    assert.equal(
      ostiariusBrowserBaseUrl({ lanUrl: 'http://user:pass@192.168.1.2:17590/path' }),
      null,
    );
  });
});
