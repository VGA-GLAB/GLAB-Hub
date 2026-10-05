export default {
  /** C-15: キャッシュ期限は exp (= 発行時刻 + expiresIn) のちょうど 60 秒前。 */
  post: (deadline: number, issuedAtMs: number, expiresInSec: number): boolean =>
    deadline === issuedAtMs + expiresInSec * 1000 - 60_000 && deadline < issuedAtMs + expiresInSec * 1000,
};
