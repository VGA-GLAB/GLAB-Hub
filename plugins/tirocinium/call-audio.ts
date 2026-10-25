/** Browser audio lifetime. PCM is signed 16-bit little-endian bytes, never floats on wire. */
export class CallAudio {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: AudioWorkletNode | null = null;
  private gain: GainNode | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private nextPlayback = 0;
  muted = false;

  async start(onPcm: (pcm: number[]) => void, onEnded: () => void): Promise<void> {
    try {
      this.context = new AudioContext();
      await this.context.resume();
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: {
        channelCount: 1, echoCancellation: true, noiseSuppression: true,
      } });
      for (const track of this.stream.getAudioTracks()) track.addEventListener('ended', onEnded, { once: true });
      const code = `class TrPcm extends AudioWorkletProcessor {
        constructor(){super();this.phase=0;this.sum=0;this.count=0;this.bytes=[];}
        process(inputs){const data=inputs[0]?.[0];if(!data)return true;
          for(const value of data){this.sum+=value;this.count++;this.phase+=16000;
            if(this.phase>=sampleRate){this.phase-=sampleRate;
              const v=Math.max(-1,Math.min(1,this.sum/this.count));
              const n=Math.round(v*(v<0?32768:32767));this.bytes.push(n&255,(n>>8)&255);
              this.sum=0;this.count=0;
              if(this.bytes.length>=1600){this.port.postMessage(this.bytes);this.bytes=[];}
            }}return true;}}
        registerProcessor('tr-pcm',TrPcm);`;
      const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      try { await this.context.audioWorklet.addModule(url); }
      finally { URL.revokeObjectURL(url); }
      this.source = this.context.createMediaStreamSource(this.stream);
      this.node = new AudioWorkletNode(this.context, 'tr-pcm');
      this.node.port.onmessage = (event: MessageEvent<number[]>) => {
        if (!this.muted) onPcm(event.data);
      };
      this.gain = this.context.createGain();
      this.gain.gain.value = 0;
      this.source.connect(this.node).connect(this.gain).connect(this.context.destination);
    } catch (error) { await this.stop(); throw error; }
  }

  play(bytes: number[], sampleRate: number, channels: number): void {
    const context = this.context;
    if (!context || !Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 96000
      || ![1, 2].includes(channels) || bytes.length % (2 * channels) !== 0) {
      throw new Error('応答音声の形式が不正です。');
    }
    if (this.nextPlayback - context.currentTime > 30) throw new Error('応答音声の再生が遅れています。');
    const data = new Uint8Array(bytes);
    const view = new DataView(data.buffer);
    const frames = data.length / (2 * channels);
    if (!frames) return;
    const buffer = context.createBuffer(channels, frames, sampleRate);
    for (let channel = 0; channel < channels; channel++) {
      const output = buffer.getChannelData(channel);
      for (let frame = 0; frame < frames; frame++) output[frame] = view.getInt16((frame * channels + channel) * 2, true) / 32768;
    }
    const source = context.createBufferSource();
    source.buffer = buffer; source.connect(context.destination);
    source.onended = () => { source.disconnect(); this.sources.delete(source); };
    this.sources.add(source);
    const start = Math.max(context.currentTime, this.nextPlayback);
    source.start(start); this.nextPlayback = start + buffer.duration;
  }

  interrupt(): void {
    for (const source of this.sources) { source.stop(); source.disconnect(); }
    this.sources.clear(); this.nextPlayback = 0;
  }

  async stop(): Promise<void> {
    this.node?.port.close(); this.node?.disconnect(); this.source?.disconnect(); this.gain?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.interrupt();
    const context = this.context;
    this.context = null; this.stream = null; this.node = null; this.source = null; this.gain = null;
    if (context && context.state !== 'closed') await context.close();
  }
}
