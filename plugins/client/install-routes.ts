import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Hono } from '../../corpus/server/hub/sdk.ts';

/** Install metadata and icons are public. App launches use the normal Hub login. */
export function createClientInstallRoutes(directory: string): Hono {
  const routes = new Hono();
  const files = [
    ['manifest.webmanifest', 'application/manifest+json'],
    ['icon-192.png', 'image/png'],
    ['icon-512.png', 'image/png'],
  ] as const;
  for (const [name, type] of files) {
    routes.get(`/client/${name}`, async c => {
      const bytes = await readFile(join(directory, name));
      return c.body(new Uint8Array(bytes), 200, {
        'Content-Type': type,
        'X-Content-Type-Options': 'nosniff',
      });
    });
  }
  return routes;
}
