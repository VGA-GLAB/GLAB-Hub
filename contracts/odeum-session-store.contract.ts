import type { OdeumSessionRow } from '../plugins/odeum/session-store.ts';

export default {
  /** C-4: 終了は live → ended の一方向。 ended / 不在なら false で状態を変えない。 */
  post: (result: boolean, before: OdeumSessionRow | null, after: OdeumSessionRow | null): boolean => {
    if (before?.status === 'live') return result && after?.status === 'ended' && after.endedAt != null;
    return !result && JSON.stringify(before) === JSON.stringify(after);
  },
};
