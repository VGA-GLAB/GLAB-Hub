import type {
  Context,
  ServiceConnector,
  TokenProvider,
} from '../../corpus/server/hub/sdk.ts';
import { authorizedConnectorFetch } from '../shared.ts';

export interface AedilisFacilityCandidate {
  id: string;
  name: string;
  location: string | null;
}

export class AedilisRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`Aedilis request failed (${status}: ${code})`);
  }
}

export class AedilisEventClient {
  constructor(
    private readonly connector: ServiceConnector,
    private readonly tokenProvider: TokenProvider,
  ) {}

  async listFacilities(c: Context): Promise<AedilisFacilityCandidate[]> {
    const response = await this.request(c, '/api/facilities');
    const body = await response.json().catch(() => null) as { items?: unknown[] } | null;
    if (!body || !Array.isArray(body.items)) throw new AedilisRequestError(502, 'invalid_response');
    return body.items.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const value = item as Record<string, unknown>;
      if (typeof value.id !== 'string' || typeof value.name !== 'string') return [];
      return [{
        id: value.id,
        name: value.name,
        location: typeof value.location === 'string' ? value.location : null,
      }];
    });
  }

  async createReservation(
    c: Context,
    input: { facilityId: string; startsAt: number; endsAt: number; purpose: string },
  ): Promise<string> {
    const response = await this.request(c, '/api/reservations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        facilityId: input.facilityId,
        startAt: new Date(input.startsAt).toISOString(),
        endAt: new Date(input.endsAt).toISOString(),
        purpose: input.purpose,
      }),
    });
    const body = await response.json().catch(() => null) as
      | { reservation?: { id?: unknown } }
      | null;
    const reservationId = body?.reservation?.id;
    if (typeof reservationId !== 'string' || !reservationId) {
      throw new AedilisRequestError(502, 'invalid_reservation_response');
    }
    return reservationId;
  }

  async cancelReservation(c: Context, reservationId: string): Promise<void> {
    await this.request(c, `/api/reservations/${encodeURIComponent(reservationId)}`, {
      method: 'DELETE',
    });
  }

  private async request(c: Context, path: string, init: RequestInit = {}): Promise<Response> {
    let response: Response;
    try {
      response = await authorizedConnectorFetch(
        c,
        this.connector,
        path,
        this.tokenProvider,
        'aedilis',
        init,
      );
    } catch {
      throw new AedilisRequestError(502, 'unreachable');
    }
    if (response.ok) return response;
    const body = await response.clone().json().catch(() => null) as
      | { code?: unknown; error?: unknown }
      | null;
    const code = typeof body?.code === 'string'
      ? body.code
      : typeof body?.error === 'string' ? body.error : 'request_failed';
    throw new AedilisRequestError(response.status, code);
  }
}
