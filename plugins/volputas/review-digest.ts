// 感想本文のダイジェスト整形。 パネル間 (volputas / projects) で切り方を揃えるため、
// DOM に触れない純関数としてここに置く (テストから直接 import できる)。

/** 感想本文は 4000 字まで許すので、 カード一覧を長文で埋めないよう先頭だけ見せる。 */
export const PROJECT_REVIEW_COMMENT_MAX = 120;

/**
 * 本文を先頭 `max` 文字で切り詰め、 切ったときだけ省略記号を付ける。
 *
 * 長さ判定と切り出しは code point 単位で行う。 `String.prototype.slice` は UTF-16
 * code unit 単位なので、 絵文字などサロゲートペアの途中で切ると壊れた文字が残る。
 *
 * @implements SPEC-VOLPUTAS-REVIEWS-005
 */
export function digestComment(comment: string, max = PROJECT_REVIEW_COMMENT_MAX): string {
  const points = [...comment];
  return points.length > max ? `${points.slice(0, max).join('')}…` : comment;
}
