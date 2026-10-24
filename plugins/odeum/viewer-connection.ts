// 視聴者の中継接続: WebSocket シグナリング + 受信専用 (recvonly) WebRTC。
//
// welcome で ICE を設定し、中継が送る offer に answer で応じる。 メディア以外の受信は
// コールバックで画面へ渡す。 チケットは URL にだけ載せ、 ログには出さない。

import type { ClientMessage, ServerMessage, StampKind, SubmissionCategory } from './viewer-protocol.ts';
import { parseServerMessage } from './viewer-protocol.ts';

export interface ViewerConnectionHandlers {
  onMessage(message: ServerMessage): void;
  onStream(stream: MediaStream): void;
  onClose(): void;
}

export class OdeumViewerConnection {
  private readonly socket: WebSocket;
  private peer: RTCPeerConnection | null = null;
  private closed = false;
  private reactionsReady = false;
  private incoming: Promise<void> = Promise.resolve();
  private candidates: RTCIceCandidateInit[] = [];
  private readonly stream = new MediaStream();

  constructor(wsUrl: string, ticket: string, private readonly handlers: ViewerConnectionHandlers) {
    const url = new URL(wsUrl);
    url.searchParams.set('ticket', ticket);
    this.socket = new WebSocket(url.toString());
    this.socket.onmessage = (event) => {
      const message = parseServerMessage(event.data);
      if (message) this.incoming = this.incoming.then(() => this.receive(message)).catch(() => this.finish());
    };
    this.socket.onclose = () => this.finish();
    this.socket.onerror = () => this.finish();
  }

  sendGood(count: number): void {
    this.send({ type: 'good', count });
  }

  sendStamp(kind: StampKind): void {
    this.send({ type: 'stamp', kind });
  }

  sendComment(text: string): void {
    this.send({ type: 'comment', text });
  }

  sendTelop(text: string): boolean {
    return this.reactionsReady && this.send({ type: 'telop', text });
  }

  sendSubmission(text: string, category: SubmissionCategory, showOnScreen: boolean): boolean {
    return this.reactionsReady && this.send({ type: 'submission', text, category, show_on_screen: showOnScreen });
  }

  answerPoll(pollId: string, choices: number[]): void {
    this.send({ type: 'poll.answer', poll_id: pollId, choices });
  }

  close(): void {
    this.reactionsReady = false;
    this.closed = true;
    this.peer?.close();
    this.peer = null;
    this.candidates = [];
    this.stream.getTracks().forEach((track) => track.stop());
    if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
      this.socket.close();
    }
  }

  private send(message: ClientMessage): boolean {
    if (this.closed || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  private finish(): void {
    if (this.closed) return;
    this.close();
    this.handlers.onClose();
  }

  private async receive(message: ServerMessage): Promise<void> {
    if (this.closed) return;
    if (message.type === 'presence') {
      this.reactionsReady = message.presenter_connected === true && message.reaction_version === 1;
    }
    try {
      if (message.type === 'welcome') {
        this.createPeer(message.ice_servers ?? []);
      } else if (message.type === 'sdp') {
        await this.applyDescription(message.sdp);
      } else if (message.type === 'candidate') {
        const candidate = { candidate: message.candidate, sdpMid: message.mid ?? null };
        if (this.peer?.remoteDescription) await this.peer.addIceCandidate(candidate);
        else {
          if (this.candidates.length >= 128) throw new Error('Too many ICE candidates');
          this.candidates.push(candidate);
        }
      }
    } catch {
      this.finish();
      return;
    }
    this.handlers.onMessage(message);
  }

  private createPeer(iceServers: RTCIceServer[]): RTCPeerConnection {
    this.peer?.close();
    const peer = new RTCPeerConnection({ iceServers });
    peer.onicecandidate = (event) => {
      if (event.candidate) {
        this.send({ type: 'candidate', candidate: event.candidate.candidate, mid: event.candidate.sdpMid });
      }
    };
    peer.ontrack = (event) => {
      // Native relay tracks may have no msid. Keep audio and video in one stream.
      for (const old of this.stream.getTracks().filter((track) => track.kind === event.track.kind)) {
        this.stream.removeTrack(old);
        old.stop();
      }
      this.stream.addTrack(event.track);
      this.handlers.onStream(this.stream);
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'failed') this.finish();
    };
    this.peer = peer;
    return peer;
  }

  private async applyDescription(description: { type: 'offer' | 'answer'; sdp: string }): Promise<void> {
    if (description.type !== 'offer' || !this.peer) throw new Error('Expected relay offer after welcome');
    // 中継側からの offer (再ネゴシエーション含む)。 受信専用で answer を返す。
    const peer = this.peer;
    await peer.setRemoteDescription(description);
    if (this.closed) return;
    for (const candidate of this.candidates.splice(0)) await peer.addIceCandidate(candidate);
    const answer = await peer.createAnswer();
    if (this.closed) return;
    await peer.setLocalDescription(answer);
    this.send({ type: 'sdp', sdp: { type: 'answer', sdp: answer.sdp ?? '' } });
  }
}
