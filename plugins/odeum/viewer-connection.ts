// 視聴者の中継接続: WebSocket シグナリング + 受信専用 (recvonly) WebRTC。
//
// welcome を受けたら recvonly の映像/音声 transceiver で offer を作って送る。
// 中継が offer を送ってきた場合も answer で応じる。 メディア以外の受信は
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

  constructor(wsUrl: string, ticket: string, private readonly handlers: ViewerConnectionHandlers) {
    const url = new URL(wsUrl);
    url.searchParams.set('ticket', ticket);
    this.socket = new WebSocket(url.toString());
    this.socket.onmessage = (event) => {
      const message = parseServerMessage(event.data);
      if (message) void this.receive(message);
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
    this.reactionsReady = false;
    if (this.closed) return;
    this.closed = true;
    this.peer?.close();
    this.peer = null;
    this.handlers.onClose();
  }

  private async receive(message: ServerMessage): Promise<void> {
    if (message.type === 'presence') {
      this.reactionsReady = message.presenter_connected === true && message.reaction_version === 1;
    }
    try {
      if (message.type === 'welcome') {
        await this.startPeer(message.ice_servers ?? []);
      } else if (message.type === 'sdp') {
        await this.applyDescription(message.sdp);
      } else if (message.type === 'candidate') {
        await this.peer?.addIceCandidate({ candidate: message.candidate, sdpMid: message.mid ?? null });
      }
    } catch {
      // ネゴシエーション失敗は映像が出ないだけで、 リアクションは続けられる。
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
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      this.handlers.onStream(stream);
    };
    this.peer = peer;
    return peer;
  }

  private async startPeer(iceServers: RTCIceServer[]): Promise<void> {
    const peer = this.createPeer(iceServers);
    peer.addTransceiver('video', { direction: 'recvonly' });
    peer.addTransceiver('audio', { direction: 'recvonly' });
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    this.send({ type: 'sdp', sdp: { type: 'offer', sdp: offer.sdp ?? '' } });
  }

  private async applyDescription(description: { type: 'offer' | 'answer'; sdp: string }): Promise<void> {
    if (description.type === 'answer') {
      await this.peer?.setRemoteDescription(description);
      return;
    }
    // 中継側からの offer (再ネゴシエーション含む)。 受信専用で answer を返す。
    const peer = this.peer ?? this.createPeer([]);
    await peer.setRemoteDescription(description);
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    this.send({ type: 'sdp', sdp: { type: 'answer', sdp: answer.sdp ?? '' } });
  }
}
