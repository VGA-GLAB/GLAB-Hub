import type { RelaySessionStatus } from '../plugins/odeum/relay-client.ts';

export default {
  /** C-7: 中継の応答は検証済みの Map か、 不達・異常時の null (例外にしない)。 */
  post: (result: Map<string, RelaySessionStatus> | null): boolean =>
    result === null || (result instanceof Map && [...result.values()].every((row) =>
      typeof row.sid === 'string' && typeof row.presenterConnected === 'boolean'
      && Number.isInteger(row.viewerCount) && row.viewerCount >= 0)),
};
