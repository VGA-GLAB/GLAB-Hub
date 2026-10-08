import { el } from '../panel-kit.ts';
import { STAMP_KINDS, type ServerMessage, type StampKind } from './viewer-protocol.ts';

const STAMP: Record<StampKind, string> = { clap: '👏', laugh: '😂', wow: '😮', question: '❓', agree: '🙆' };

/** Bounded, ephemeral DOM overlay. Owns no media controls and cannot pause playback. */
export function viewerEffects(stage: HTMLElement): { receive(message: ServerMessage): void; dispose(): void } {
  const layer = el('div', 'od-effects');
  layer.setAttribute('aria-hidden', 'true');
  const telops = el('div', 'od-telops');
  const posts = el('div', 'od-public-posts');
  const particles = el('div', 'od-particles');
  layer.append(telops, posts, particles);
  stage.append(layer);
  const timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
  let sequence = 0;
  let disposed = false;
  const remove = (node: HTMLElement): void => {
    const timer = timers.get(node);
    if (timer !== undefined) clearTimeout(timer);
    timers.delete(node);
    node.remove();
  };
  const add = (area: HTMLElement, node: HTMLElement, limit: number, lifetime: number): void => {
    while (area.childElementCount >= limit) remove(area.firstElementChild as HTMLElement);
    area.append(node);
    timers.set(node, setTimeout(() => remove(node), lifetime));
  };
  const burst = (glyph: string, count: number): void => {
    if (!Number.isFinite(count) || count <= 0) return;
    for (let i = 0; i < Math.min(5, Math.floor(count)); i++) {
      const node = el('span', 'od-particle', glyph);
      node.style.left = `${10 + (sequence++ * 17) % 80}%`;
      add(particles, node, 20, 2000);
    }
  };
  return {
    receive(message) {
      if (disposed) return;
      if (message.type === 'telop') {
        add(telops, el('div', 'od-telop', message.text), 3, 5000);
      } else if (message.type === 'submission' && message.show_on_screen === true) {
        const label = message.category === 'question' ? '質問' : '感想';
        add(posts, el('div', 'od-public-post', `${message.from.name} · ${label}\n${message.text}`), 2, 8000);
      } else if (message.type === 'reaction.burst') {
        burst('👍', message.good);
        for (const kind of STAMP_KINDS) burst(STAMP[kind], message.stamps?.[kind] ?? 0);
      }
    },
    dispose() {
      disposed = true;
      for (const node of [...timers.keys()]) remove(node);
      layer.remove();
    },
  };
}
