export interface DiEntryPoints {
  discussionLaunchPath: string;
  learningUrl: string;
}

export function normalizeDiBaseUrl(value: string | undefined, envName: string): string | null {
  const candidate = value?.trim();
  if (!candidate) return null;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error(`${envName} must be an absolute HTTP(S) URL`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${envName} must use HTTP or HTTPS`);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`${envName} must not contain credentials, query, or fragment`);
  }
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
  return url.toString();
}

export function createDiEntryPoints(webBaseUrl: string): DiEntryPoints {
  const baseUrl = new URL(webBaseUrl);
  return {
    discussionLaunchPath: '/discussion-launch',
    learningUrl: new URL('learning', baseUrl).toString(),
  };
}

export function resolveDiLaunchUrl(webBaseUrl: string, path: unknown): string | null {
  if (typeof path !== 'string' || !path.startsWith('/flow?glab_launch=')) return null;
  const baseUrl = new URL(webBaseUrl);
  const target = new URL(path, baseUrl);
  if (target.origin !== baseUrl.origin || target.username || target.password || target.hash) return null;
  return target.toString();
}
