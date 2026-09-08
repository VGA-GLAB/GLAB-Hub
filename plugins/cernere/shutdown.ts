/** client を閉じて新規 request を止めた後、全 store の cleanup を一度だけ実行する。 */
export function createShutdown(closeClients: () => void, closeStores: Array<() => Promise<void>>): () => Promise<void> {
  let pending: Promise<void> | undefined;
  return () => {
    pending ??= Promise.resolve().then(async () => {
      const failures: unknown[] = [];
      try { closeClients(); } catch (error) { failures.push(error); }
      const results = await Promise.allSettled(closeStores.map((close) => Promise.resolve().then(close)));
      for (const result of results) if (result.status === 'rejected') failures.push(result.reason);
      if (failures.length) throw new AggregateError(failures, 'GLAB shutdown failed');
    });
    return pending;
  };
}
