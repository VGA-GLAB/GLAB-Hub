// グッドの連打を 200ms ごとにまとめて送る (frontend / テスト共用、 DOM 非依存)。
//
// 押下は即座に自分の押下数へ反映し、 送信は `{"type":"good","count":n}` を
// 200ms に 1 回だけ出す。 中継は 1 メッセージ 1〜50 件を受けるので、 溜まった分が
// 50 を超えたら次の窓へ繰り越す。 タイマーは差し替え可能 (テストで時間を進める)。

export const GOOD_FLUSH_INTERVAL_MS = 200;
export const MAX_GOOD_PER_MESSAGE = 50;

/** 送信待ち pending から 1 メッセージぶん (1〜50 件) を切り出す。 0 件なら count 0。 */
export function takeGoodBatch(pending: number): { count: number; rest: number } {
  const count = Math.min(Math.max(0, Math.floor(pending)), MAX_GOOD_PER_MESSAGE);
  return { count, rest: Math.max(0, Math.floor(pending)) - count };
}

export interface BatchTimer {
  set(callback: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const defaultTimer: BatchTimer = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export class GoodBatcher {
  private pending = 0;
  private total = 0;
  private handle: unknown = null;
  private disposed = false;

  constructor(
    private readonly send: (count: number) => void,
    private readonly timer: BatchTimer = defaultTimer,
    private readonly intervalMs = GOOD_FLUSH_INTERVAL_MS,
  ) {}

  /** 1 回押した。 自分の累計押下数を返す (画面の即時の手応え用)。 */
  press(): number {
    if (this.disposed) return this.total;
    this.pending += 1;
    this.total += 1;
    this.schedule();
    return this.total;
  }

  /** 自分の累計押下数。 */
  get pressed(): number {
    return this.total;
  }

  /** 送信待ちの件数。 */
  get queued(): number {
    return this.pending;
  }

  /** 窓の終わりに呼ばれる。 溜まった分を 1 メッセージで送り、 残りは次の窓へ。 */
  flush(): void {
    this.handle = null;
    if (this.disposed || this.pending === 0) return;
    const { count, rest } = takeGoodBatch(this.pending);
    this.pending = rest;
    this.send(count);
    if (this.pending > 0) this.schedule();
  }

  /** 画面を閉じるとき。 未送信分は捨てる (切断後に送れないため)。 */
  dispose(): void {
    this.disposed = true;
    this.pending = 0;
    if (this.handle != null) this.timer.clear(this.handle);
    this.handle = null;
  }

  private schedule(): void {
    if (this.handle != null) return;
    this.handle = this.timer.set(() => this.flush(), this.intervalMs);
  }
}
