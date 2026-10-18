import type { EnvReader } from '../shared.ts';

/** Server-only Cloudflare Access credentials; never forwarded across redirects. */
export function diAccessHeaders(env: EnvReader, baseUrl: string | null): Record<string, string> {
  const id = env('DISCUTERE_CF_ACCESS_CLIENT_ID')?.trim();
  const secret = env('DISCUTERE_CF_ACCESS_CLIENT_SECRET')?.trim();
  if (!id && !secret) return {};
  if (!id || !secret || !baseUrl || new URL(baseUrl).protocol !== 'https:') {
    throw new Error('Di Access requires both credentials and an HTTPS DISCUTERE_URL');
  }
  return { 'CF-Access-Client-Id': id, 'CF-Access-Client-Secret': secret };
}
