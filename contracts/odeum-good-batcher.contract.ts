export default {
  /** C-6: 1 メッセージは 1〜50 件で、 切り出し分 + 繰り越し分 = 送信待ち。 */
  post: (result: { count: number; rest: number }, pending: number): boolean =>
    Number.isInteger(result.count) && result.rest >= 0
    && result.count + result.rest === pending
    && (pending === 0 ? result.count === 0 : result.count >= 1 && result.count <= 50),
};
