// Odeum 視聴画面 / 発表中カードのスタイル (1 度だけ注入)。

let injected = false;

export function ensureOdeumStyles(): void {
  if (injected) return;
  injected = true;
  const style = document.createElement('style');
  style.textContent = `
    .od-live-card { display: grid; gap: 0.4rem; margin-bottom: 0.6rem; }
    .od-live-title { font-size: 1.1rem; }
    .od-live-waiting { border-color: var(--line); }
    .od-viewer { display: grid; gap: 0.8rem; margin-bottom: 1.4rem; }
    .od-viewer-head { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; }
    .od-viewer-title { font-size: 1.1rem; margin-right: auto; }
    .od-stage { position: relative; }
    .od-video { width: 100%; max-height: 70vh; background: #000; border-radius: var(--radius); }
    .od-sound { position: absolute; right: 0.5rem; bottom: 0.5rem; }
    .od-burst { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; }
    .od-burst-label { font-weight: 700; min-width: 9rem; }
    .od-meter { flex: 1; min-width: 6rem; height: 0.6rem; background: var(--bg-2); border-radius: 999px; overflow: hidden; }
    .od-meter-fill { height: 100%; width: 0; background: var(--accent); transition: width 0.25s ease-out; }
    .od-poll-choices { display: grid; gap: 0.3rem; margin: 0.5rem 0; }
    .od-reactions {
      display: grid; gap: 0.8rem;
      grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
      grid-template-areas: "good stamps" "good comment";
    }
    .od-good-area { grid-area: good; }
    .od-stamps { grid-area: stamps; display: flex; gap: 0.4rem; flex-wrap: wrap; align-content: flex-start; }
    .od-comment { grid-area: comment; display: flex; gap: 0.4rem; }
    .od-comment-input { flex: 1; min-width: 0; }
    .od-stamp { font-size: 0.9rem; padding: 0.35rem 0.6rem; }
    .od-good {
      width: 100%; min-height: 160px; font: inherit; cursor: pointer;
      display: flex; gap: 0.8rem; align-items: center; justify-content: center;
      border: none; border-radius: calc(var(--radius) * 2);
      background: var(--accent); color: var(--accent-fg);
      font-size: 1.6rem; font-weight: 700;
      user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
      touch-action: manipulation;
    }
    .od-good:active { filter: brightness(0.92); }
    .od-good-icon { font-size: 2.6rem; }
    .od-good-mine { font-size: 1.1rem; opacity: 0.85; min-width: 2.5rem; }
    .od-good.od-pop .od-good-icon { animation: od-pop 0.22s ease-out; }
    @keyframes od-pop { 0% { transform: scale(1); } 45% { transform: scale(1.35); } 100% { transform: scale(1); } }
    .od-notice { min-height: 1.2em; margin: 0; font-size: 0.85rem; color: var(--muted); }
    @media (max-width: 640px) {
      .od-reactions { grid-template-columns: minmax(0, 1fr); grid-template-areas: "good" "stamps" "comment"; }
      .od-good { min-height: 96px; }
    }
  `;
  document.head.appendChild(style);
}
