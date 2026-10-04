import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { Hono } from '../corpus/server/hub/sdk.ts';
import type { CorpusContext, ServiceConnector } from '../corpus/server/hub/sdk.ts';
import { makeRoutes } from '../plugins/attendance/index.ts';
import type { GpsPhotoFileStore } from '../plugins/attendance/gps-photo-files.ts';
import { sha256Hex } from '../plugins/attendance/gps-photo-files.ts';
import { GPS_PHOTO_MAX_BYTES } from '../plugins/attendance/gps-checkin-form.ts';
import { readLocationStatementClaims } from '../plugins/attendance/location-statement.ts';
import { getGpsPhoto, listAttendance } from '../plugins/data.ts';
import type { VersionedHttpServiceConnector } from '../plugins/service-health-connector.ts';
import { openTempDb, type TempDb } from './sqlite-fixture.ts';

const USER = { userId: 'user-1', isAdmin: false, displayName: 'User One' };
const PHOTO = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 1, 2, 3, 4, 0xff, 0xd9]);

function statement(payload: Record<string, unknown> = {
  lanId: 'lan-1', facilityId: 'room-a', lat: 35.6, lon: 139.7, radiusM: 80, issuedAt: Date.now(), purpose: 'location',
}): string {
  return `${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${Buffer.from('sig').toString('base64url')}`;
}

class MemoryPhotos implements GpsPhotoFileStore {
  readonly files = new Map<string, Uint8Array>();
  async write(sha256: string, bytes: Uint8Array): Promise<void> { this.files.set(sha256, bytes); }
  async read(sha256: string): Promise<Uint8Array | null> { return this.files.get(sha256) ?? null; }
}

interface Harness {
  app: Hono;
  photos: MemoryPhotos;
  logs: string[];
  aedilisCalls: Array<{ path: string; headers: Headers; form: FormData }>;
}

let temp: TempDb;
beforeEach(() => { temp = openTempDb('glab-gps-'); });
afterEach(() => { temp.close(); });

function harness(options: {
  healthPayload?: unknown;
  aedilis?: (form: FormData) => Response;
  authenticated?: boolean;
} = {}): Harness {
  const logs: string[] = [];
  const photos = new MemoryPhotos();
  const aedilisCalls: Harness['aedilisCalls'] = [];
  const ctx = {
    db: temp.db,
    env: () => undefined,
    logger: { error: (message: string) => logs.push(message), info() {} },
    tokenProvider: { mode: 'test', getDownstreamToken: async () => 'delegated-token' },
  } as unknown as CorpusContext;
  const ostiarius = {
    probe: async () => ({
      health: { status: 'up' },
      payload: 'healthPayload' in options ? options.healthPayload : { ok: true, locationStatement: statement() },
    }),
  } as unknown as VersionedHttpServiceConnector;
  const aedilis: ServiceConnector = {
    id: 'aedilis',
    title: 'Aedilis',
    scope: 'multi',
    baseUrl: 'http://aedilis.test',
    health: async () => ({ status: 'up' }),
    fetch: async (path, init) => {
      const form = await new Response(init?.body as FormData).formData();
      aedilisCalls.push({ path, headers: new Headers(init?.headers), form });
      return (options.aedilis ?? (() => Response.json({ ok: true, attendanceId: 'att-1' })))(form);
    },
  };
  const routes = makeRoutes(ctx, ostiarius, { aedilis, photos });
  const app = new Hono();
  app.use('*', async (c, next) => {
    // Corpus の requireAuth の代わり。 認証済みなら identity と user token を積む。
    if (options.authenticated !== false) {
      c.set('auth', USER as never);
      c.set('userToken', 'user-token');
    }
    await next();
  });
  app.route('/', routes);
  return { app, photos, logs, aedilisCalls };
}

function checkinForm(photo: Blob = new Blob([PHOTO], { type: 'image/jpeg' })): FormData {
  const form = new FormData();
  form.set('lat', '35.6001');
  form.set('lon', '139.7001');
  form.set('accuracyM', '12');
  form.set('positionAt', String(Date.now()));
  form.set('photo', photo, 'photo.jpg');
  return form;
}

async function post(h: Harness, form = checkinForm()): Promise<Response> {
  return h.app.request('/checkin/gps', { method: 'POST', body: form });
}

describe('POST /checkin/gps', () => {
  it('relays the latest location statement with the user token and stores the accepted photo', async () => {
    const h = harness();
    const response = await post(h);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const body = await response.json() as Record<string, unknown>;
    assert.deepEqual(body, { ok: true, attendanceId: 'att-1', alreadyCheckedIn: false, photoStored: true });

    assert.equal(h.aedilisCalls.length, 1);
    const call = h.aedilisCalls[0]!;
    assert.equal(call.path, '/api/checkin/gps');
    assert.equal(call.headers.get('authorization'), 'Bearer delegated-token');
    assert.equal(readLocationStatementClaims(String(call.form.get('locationStatement')))?.facilityId, 'room-a');
    for (const field of ['lat', 'lon', 'accuracyM', 'positionAt']) assert.ok(call.form.get(field));
    const relayed = call.form.get('photo');
    assert.ok(relayed instanceof Blob);
    assert.equal(relayed.type, 'image/jpeg');
    assert.deepEqual(new Uint8Array(await relayed.arrayBuffer()), PHOTO);

    const saved = getGpsPhoto(temp.db, 'att-1');
    assert.ok(saved);
    assert.equal(saved.user_id, 'user-1');
    assert.equal(saved.sha256, sha256Hex(PHOTO));
    assert.deepEqual(h.photos.files.get(saved.sha256), PHOTO);
    const [ledger] = listAttendance(temp.db, { userId: 'user-1' });
    assert.equal(ledger?.source, 'gps');
    assert.equal(ledger?.assurance, 'low');
    assert.equal(ledger?.facility_id, 'room-a');
    assert.equal(saved.ledger_id, ledger?.id);
  });

  it('returns 503 without calling Aedilis when Ostiarius has no location statement', async () => {
    for (const healthPayload of [null, { ok: true }, { ok: true, locationStatement: '' }]) {
      const h = harness({ healthPayload });
      const response = await post(h);
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: 'location_statement_unavailable' });
      assert.equal(h.aedilisCalls.length, 0);
    }
  });

  it('rejects photos over 10 MB with 413 before relaying', async () => {
    const h = harness();
    const big = new Blob([new Uint8Array(GPS_PHOTO_MAX_BYTES + 1)], { type: 'image/jpeg' });
    const response = await post(h, checkinForm(big));
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { error: 'photo_invalid' });
    assert.equal(h.aedilisCalls.length, 0);
  });

  it('rejects non jpeg/heic photos and missing fields as the contract codes', async () => {
    const h = harness();
    const png = await post(h, checkinForm(new Blob([PHOTO], { type: 'image/png' })));
    assert.equal(png.status, 400);
    assert.deepEqual(await png.json(), { error: 'photo_invalid' });
    const form = checkinForm();
    form.delete('accuracyM');
    const missing = await post(h, form);
    assert.equal(missing.status, 400);
    assert.deepEqual(await missing.json(), { error: 'invalid_input' });
    assert.equal(h.aedilisCalls.length, 0);
  });

  it('rejects unauthenticated submissions and photo reads', async () => {
    const authed = harness();
    assert.equal((await post(authed)).status, 200);
    const anonymous = harness({ authenticated: false });
    const submit = await post(anonymous);
    assert.equal(submit.status, 401);
    assert.equal(anonymous.aedilisCalls.length, 0);
    const read = await anonymous.app.request('/gps-photos/att-1');
    assert.equal(read.status, 401);
    assert.equal(read.headers.get('cache-control'), 'private, no-store');
  });

  it('does not store the photo when Aedilis rejects it, and passes the error code through', async () => {
    for (const [code, status] of [
      ['out_of_range', 403], ['photo_reused', 409], ['exif_missing', 422], ['rate_limited', 429], ['statement_stale', 400],
    ] as const) {
      const h = harness({ aedilis: () => Response.json({ error: code }, { status }) });
      const response = await post(h);
      assert.equal(response.status, status);
      assert.deepEqual(await response.json(), { error: code });
      assert.equal(h.photos.files.size, 0);
    }
    assert.equal(getGpsPhoto(temp.db, 'att-1'), null);
    assert.equal(listAttendance(temp.db, { userId: 'user-1' }).length, 0);
  });

  it('maps unknown upstream failures to 502 without storing anything', async () => {
    const h = harness({ aedilis: () => Response.json({ error: 'internal secret detail' }, { status: 500 }) });
    const response = await post(h);
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: 'aedilis_upstream_error' });
    assert.equal(h.photos.files.size, 0);
  });

  it('never writes photo bytes to the log', async () => {
    const h = harness({ aedilis: () => Response.json({ error: 'boom' }, { status: 500 }) });
    await post(h);
    const photoText = Buffer.from(PHOTO).toString('base64');
    for (const line of h.logs) {
      assert.equal(line.includes(photoText), false);
      assert.equal(line.includes(sha256Hex(PHOTO)), false);
    }
  });
});

describe('GET /gps-photos/:attendanceId', () => {
  it('serves the stored photo to logged-in users with no-store', async () => {
    const h = harness();
    await post(h);
    const response = await h.app.request('/gps-photos/att-1');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('content-type'), 'image/jpeg');
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), PHOTO);
    assert.equal((await h.app.request('/gps-photos/unknown')).status, 404);
  });
});
