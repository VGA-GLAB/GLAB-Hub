import test from 'node:test';
import assert from 'node:assert/strict';
import { OdeumViewerConnection } from '../plugins/odeum/viewer-connection.ts';

test('viewer waits for relay offers, queues early ICE and keeps audio/video together', async () => {
  const names = ['WebSocket', 'RTCPeerConnection', 'MediaStream'] as const;
  const previous = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  const received: string[] = [];
  const sent: { type: string; sdp?: { type: string } }[] = [];
  let socket: FakeSocket;
  let peer: FakePeer;
  class FakeSocket {
    static OPEN = 1;
    static CONNECTING = 0;
    readyState = 1;
    onmessage: ((event: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor() { socket = this; }
    send(raw: string): void { sent.push(JSON.parse(raw)); }
    close(): void { this.readyState = 3; }
    emit(value: object): void { this.onmessage?.({ data: JSON.stringify(value) }); }
  }
  class FakeStream {
    tracks: { kind: string; stop(): void }[] = [];
    getTracks() { return this.tracks; }
    addTrack(track: { kind: string; stop(): void }) { this.tracks.push(track); }
    removeTrack(track: { kind: string; stop(): void }) { this.tracks = this.tracks.filter((item) => item !== track); }
  }
  class FakePeer {
    remoteDescription: object | null = null;
    connectionState = 'new';
    ontrack: ((event: { track: { kind: string; stop(): void }; streams: unknown[] }) => void) | null = null;
    constructor(public config: unknown) { peer = this; }
    async setRemoteDescription(value: object) {
      await Promise.resolve();
      received.push('description');
      this.remoteDescription = value;
    }
    async addIceCandidate() {
      assert.ok(this.remoteDescription);
      received.push('candidate');
    }
    async createAnswer() { return { type: 'answer', sdp: 'test-answer' }; }
    async setLocalDescription() { received.push('local'); }
    close() { this.connectionState = 'closed'; }
  }
  for (const [i, value] of [FakeSocket, FakePeer, FakeStream].entries()) {
    Object.defineProperty(globalThis, names[i]!, { configurable: true, value });
  }
  const streams: MediaStream[] = [];
  const connection = new OdeumViewerConnection('wss://relay.example.test/v1/ws', 'test-only', {
    onMessage() {}, onStream: (stream) => streams.push(stream), onClose() {},
  });
  const drain = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
  try {
    const servers = [{ urls: 'turn:relay.example.test', username: 'test', credential: 'test-only' }];
    socket!.emit({ type: 'welcome', ice_servers: servers });
    await drain();
    assert.equal(sent.length, 0, 'viewer must not send an offer on welcome');
    assert.deepEqual(peer!.config, { iceServers: servers });
    socket!.emit({ type: 'candidate', candidate: 'test-candidate', mid: 'input1-1' });
    socket!.emit({ type: 'sdp', sdp: { type: 'offer', sdp: 'test-offer' } });
    await drain();
    assert.deepEqual(received, ['description', 'candidate', 'local']);
    assert.equal(sent[0]?.sdp?.type, 'answer');
    peer!.ontrack?.({ track: { kind: 'video', stop() {} }, streams: [] });
    peer!.ontrack?.({ track: { kind: 'audio', stop() {} }, streams: [] });
    assert.equal(streams[0], streams[1]);
    assert.equal(streams[0]?.getTracks().length, 2);
    connection.close();
    assert.equal(socket!.readyState, 3);
    assert.equal(peer!.connectionState, 'closed');
  } finally {
    connection.close();
    names.forEach((name, index) => {
      const descriptor = previous[index];
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
});
