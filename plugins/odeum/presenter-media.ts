// Match Odeum's forwarding-only relay: one H.264 baseline SSRC, optional Opus.
export function presenterCodecs(kind: string): RTCRtpCodec[] {
  const codecs = RTCRtpSender.getCapabilities(kind)?.codecs ?? [];
  const selected = codecs.filter((codec) => kind === 'video'
    ? codec.mimeType.toLowerCase() === 'video/h264'
      && /(?:^|;)\s*packetization-mode=1(?:;|$)/i.test(codec.sdpFmtpLine ?? '')
      && /(?:^|;)\s*profile-level-id=42(?:e0|c0)[0-9a-f]{2}(?:;|$)/i.test(codec.sdpFmtpLine ?? '')
    : codec.mimeType.toLowerCase() === 'audio/opus' && codec.clockRate === 48000);
  if (!selected.length) throw new Error('このブラウザは配信に必要な映像・音声形式に対応していません。');
  // Exclude RTX: the relay requires exactly one source SSRC per media section.
  return selected;
}

export function turnConfiguration(iceServers: RTCIceServer[]): RTCConfiguration {
  const hasTurn = iceServers.some((server) => {
    const urls = typeof server.urls === 'string' ? [server.urls] : server.urls;
    return urls.some((url) => /^turns?:/i.test(url)) && !!server.username && !!server.credential;
  });
  if (!hasTurn) throw new Error('中継用のTURN設定がありません。管理者に設定を依頼してください。');
  return { iceServers, iceTransportPolicy: 'relay' };
}
