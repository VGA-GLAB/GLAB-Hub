import { presenterCodecs, turnConfiguration } from './presenter-media.ts';
import { parseServerMessage, type ClientMessage, type ServerMessage } from './viewer-protocol.ts';

interface PresenterHandlers {
  onConnected(): void;
  onEnded(message: string): void;
}

/** Owns capture and transport until explicit stop, capture ended, or connection failure. */
export class OdeumPresenterConnection {
  private readonly socket: WebSocket;
  private peer: RTCPeerConnection | null = null;
  private closed = false;
  private incoming: Promise<void> = Promise.resolve();
  private candidates: RTCIceCandidateInit[] = [];
  private readonly deadline: ReturnType<typeof setTimeout>;

  constructor(wsUrl: string, ticket: string, private readonly stream: MediaStream,
    private readonly handlers: PresenterHandlers) {
    const url = new URL(wsUrl);
    url.searchParams.set('ticket', ticket);
    this.socket = new WebSocket(url);
    this.deadline = setTimeout(() => this.finish('中継への接続が時間切れになりました。'), 30_000);
    this.socket.onmessage = (event) => {
      const message = parseServerMessage(event.data);
      if (message) this.incoming = this.incoming.then(() => this.receive(message))
        .catch((error: unknown) => this.finish(error instanceof Error ? error.message : '配信を開始できませんでした。'));
    };
    this.socket.onclose = () => this.finish('中継との接続が切れたため、画面共有を停止しました。');
    this.socket.onerror = () => this.finish('中継に接続できませんでした。');
    for (const track of stream.getVideoTracks()) track.addEventListener('ended', this.captureEnded);
  }

  private readonly captureEnded = (): void => { this.finish('画面共有を停止しました。'); };

  close(): void {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.deadline);
    this.peer?.close();
    this.peer = null;
    this.socket.onmessage = this.socket.onclose = this.socket.onerror = null;
    this.socket.close();
    for (const track of this.stream.getTracks()) {
      track.removeEventListener('ended', this.captureEnded);
      track.stop();
    }
    this.candidates = [];
  }

  private finish(message: string): void {
    if (this.closed) return;
    this.close();
    this.handlers.onEnded(message);
  }

  private send(message: ClientMessage): void {
    if (!this.closed && this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  private async receive(message: ServerMessage): Promise<void> {
    if (this.closed) return;
    if (message.type === 'error') {
      this.finish(message.code === 'presenter_exists'
        ? 'このイベントは別の画面から配信中です。' : '中継が配信を受け付けませんでした。');
    } else if (message.type === 'welcome') {
      if (this.peer) throw new Error('中継から重複した接続情報を受信しました。');
      const peer = new RTCPeerConnection(turnConfiguration(message.ice_servers ?? []));
      this.peer = peer;
      peer.onicecandidate = ({ candidate }) => {
        if (candidate) this.send({ type: 'candidate', candidate: candidate.candidate, mid: candidate.sdpMid });
      };
      peer.onconnectionstatechange = () => {
        if (this.closed) return;
        if (peer.connectionState === 'connected') {
          clearTimeout(this.deadline);
          this.handlers.onConnected();
        } else if (['failed', 'disconnected', 'closed'].includes(peer.connectionState)) {
          this.finish('通信が途切れたため、画面共有を停止しました。もう一度配信開始を押してください。');
        }
      };
      for (const track of this.stream.getTracks()) {
        const sender = peer.addTransceiver(track, { direction: 'sendonly', streams: [this.stream] });
        sender.setCodecPreferences(presenterCodecs(track.kind));
      }
      const offer = await peer.createOffer();
      if (this.closed) return;
      await peer.setLocalDescription(offer);
      this.send({ type: 'sdp', sdp: { type: 'offer', sdp: offer.sdp ?? '' } });
    } else if (message.type === 'sdp') {
      const peer = this.peer;
      if (!peer || message.sdp.type !== 'answer') throw new Error('中継の接続情報が正しくありません。');
      await peer.setRemoteDescription(message.sdp);
      for (const candidate of this.candidates.splice(0)) {
        if (this.closed) return;
        await peer.addIceCandidate(candidate);
      }
    } else if (message.type === 'candidate') {
      const candidate = { candidate: message.candidate, sdpMid: message.mid ?? null };
      if (this.peer?.remoteDescription) await this.peer.addIceCandidate(candidate);
      else {
        if (this.candidates.length >= 128) throw new Error('中継の接続情報が多すぎます。');
        this.candidates.push(candidate);
      }
    }
  }
}
