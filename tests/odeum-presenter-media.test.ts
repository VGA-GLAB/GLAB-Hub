import test from 'node:test';
import assert from 'node:assert/strict';
import { presenterCodecs, turnConfiguration } from '../plugins/odeum/presenter-media.ts';

test('screen sender requires authenticated TURN and forces relay transport', () => {
  assert.throws(() => turnConfiguration([]), /TURN/);
  assert.throws(() => turnConfiguration([{ urls: 'stun:example.test' }]), /TURN/);
  assert.throws(() => turnConfiguration([{ urls: 'turn:example.test' }]), /TURN/);
  const servers = [{ urls: ['turn:example.test', 'turns:example.test'], username: 'temporary', credential: 'test-only' }];
  assert.deepEqual(turnConfiguration(servers), { iceServers: servers, iceTransportPolicy: 'relay' });
});

test('only relay-compatible primary codecs are offered, never RTX or VP8', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'RTCRtpSender');
  const baseline = { mimeType: 'video/H264', clockRate: 90000,
    sdpFmtpLine: 'level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f' };
  Object.defineProperty(globalThis, 'RTCRtpSender', { configurable: true, value: {
    getCapabilities: (kind: string) => ({ codecs: kind === 'video' ? [
      { mimeType: 'video/VP8', clockRate: 90000 },
      { mimeType: 'video/rtx', clockRate: 90000 },
      { ...baseline, sdpFmtpLine: 'packetization-mode=1;profile-level-id=64001f' },
      { ...baseline, sdpFmtpLine: 'packetization-mode=0;profile-level-id=42e01f' }, baseline,
    ] : [] }),
  } });
  try {
    assert.deepEqual(presenterCodecs('video'), [baseline]);
    assert.throws(() => presenterCodecs('audio'), /対応/);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'RTCRtpSender', previous);
    else Reflect.deleteProperty(globalThis, 'RTCRtpSender');
  }
});
