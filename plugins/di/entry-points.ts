export interface DiEntryPoints {
  discussionLaunchPath: string;
}

export function createDiEntryPoints(webBaseUrl: string): DiEntryPoints {
  new URL(webBaseUrl); // Validate the configured endpoint before exposing entry points.
  return {
    discussionLaunchPath: '/discussion-launch',
  };
}

export function resolveDiLaunchUrl(webBaseUrl: string, path: unknown): string | null {
  if (typeof path !== 'string' || !path.startsWith('/flow?glab_launch=')) return null;
  const baseUrl = new URL(webBaseUrl);
  const target = new URL(path, baseUrl);
  if (target.origin !== baseUrl.origin || target.username || target.password || target.hash) return null;
  return target.toString();
}
