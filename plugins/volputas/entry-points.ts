export interface VolputasEntryPoints {
  homeUrl: string;
  videoReviewUrl: string;
  gameReviewUrl: string;
}

export function normalizeHttpBaseUrl(value: string | undefined, envName: string): string | null {
  const candidate = value?.trim();
  if (!candidate) return null;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error(`${envName} must be an absolute HTTP(S) URL`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${envName} must use HTTP or HTTPS`);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`${envName} must not contain credentials, query, or fragment`);
  }

  url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
  return url.toString();
}

export function createVolputasEntryPoints(webBaseUrl: string): VolputasEntryPoints {
  const baseUrl = new URL(webBaseUrl);
  return {
    homeUrl: baseUrl.toString(),
    videoReviewUrl: new URL('video-reviews/new', baseUrl).toString(),
    gameReviewUrl: new URL('game-reviews/new', baseUrl).toString(),
  };
}
