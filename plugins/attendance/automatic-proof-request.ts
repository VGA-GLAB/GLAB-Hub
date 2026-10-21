export type FacilityProofResult = { kind: 'proof'; attestation: string } | { kind: 'outside-lan' | 'verification-failed' | 'cancelled' };

/** The three-second deadline covers connection and response body, not GLab's later ledger write. */
export async function requestFacilityProof(
  url: string, challenge: string, parentSignal: AbortSignal, fetchImpl: typeof fetch = fetch,
): Promise<FacilityProofResult> {
  if (parentSignal.aborted) return { kind: 'cancelled' };
  const controller = new AbortController();
  const abort = () => controller.abort();
  parentSignal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 3_000);
  try {
    const response = await fetchImpl(`${url}/checkin/automatic`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, credentials: 'omit', cache: 'no-store', redirect: 'error',
      signal: controller.signal, body: JSON.stringify({ challenge }),
    });
    if (!response.ok) return { kind: 'verification-failed' };
    const proof = await response.json() as { attestation?: unknown };
    if (parentSignal.aborted) return { kind: 'cancelled' };
    if (controller.signal.aborted) return { kind: 'outside-lan' };
    return typeof proof.attestation === 'string' && proof.attestation.length > 0
      ? { kind: 'proof', attestation: proof.attestation } : { kind: 'verification-failed' };
  } catch { return { kind: parentSignal.aborted ? 'cancelled' : 'outside-lan' }; }
  finally { clearTimeout(timer); parentSignal.removeEventListener('abort', abort); }
}
