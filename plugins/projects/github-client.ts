// GitHub public API クライアント (spec/tasks/2026-07-30-01-github-game-list.md、
// spec/interface/projects-registry.md の `/projects/:id/github-sync`)。
// 接続先は api.github.com に固定し、 GLAB_GITHUB_TOKEN は rate-limit 緩和にだけ使う。

const GITHUB_API_ORIGIN = 'https://api.github.com';
const SUCCESS_TTL_MS = 10 * 60 * 1000;
const DEGRADED_TTL_MS = 60 * 1000;

export interface GitHubContributor { login: string; avatarUrl: string }
export interface GitHubReleaseAsset { id: number; name: string; size: number; browserDownloadUrl: string }
export interface GitHubRelease { releaseId: number; tag: string; name: string; publishedAt: string; assets: GitHubReleaseAsset[] }
export interface GitHubProjectData {
  description: string | null;
  topics: string[];
  readme: string | null;
  contributors: GitHubContributor[];
  releases: GitHubRelease[];
}

interface CacheEntry { value: GitHubProjectData | null; expiresAt: number }

/** HTTPS の github.com リポジトリ URL だけを受け付け、API の接続先は固定する。 */
export function parseRepoUrl(url: string): { owner: string; repo: string } | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com' || parsed.username || parsed.password
      || parsed.search || parsed.hash) return null;
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length !== 2) return null;
    const [owner, repository] = segments;
    if (!owner || !repository) return null;
    const repo = repository.endsWith('.git') ? repository.slice(0, -4) : repository;
    return repo ? { owner, repo } : null;
  } catch { return null; }
}

export function parseReleaseList(payload: unknown): GitHubRelease[] | null {
  if (!Array.isArray(payload)) return null;
  const releases: GitHubRelease[] = [];
  for (const item of payload) {
    if (!isRecord(item) || !isFiniteNumber(item.id) || typeof item.tag_name !== 'string'
      || !Array.isArray(item.assets)) return null;
    // draft は published_at を持たない。 未公開なので表示・通知の対象から外す
    // (token 付きで同期すると draft も応答に混ざる)。
    if (item.draft === true || typeof item.published_at !== 'string') continue;
    const assets: GitHubReleaseAsset[] = [];
    for (const asset of item.assets) {
      if (!isRecord(asset) || !isFiniteNumber(asset.id) || typeof asset.name !== 'string'
        || !isFiniteNumber(asset.size) || !isHttpsUrl(asset.browser_download_url)) return null;
      assets.push({ id: asset.id, name: asset.name, size: asset.size, browserDownloadUrl: asset.browser_download_url });
    }
    // 無題 Release の name は null で返る。 DB は NOT NULL なので tag で代替する。
    const name = typeof item.name === 'string' && item.name ? item.name : item.tag_name;
    releases.push({ releaseId: item.id, tag: item.tag_name, name, publishedAt: item.published_at, assets });
  }
  return releases;
}

export class GitHubClient {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly token: string | undefined,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async getProject(repoUrl: string): Promise<GitHubProjectData | null> {
    const repo = parseRepoUrl(repoUrl);
    if (!repo) return null;
    const key = `${repo.owner}/${repo.repo}`.toLowerCase();
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > this.now()) return cached.value;
    try {
      const base = `${GITHUB_API_ORIGIN}/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}`;
      const [metadata, readme, contributors, releases] = await Promise.all([
        this.request(base), this.requestOptional(`${base}/readme`),
        this.requestOptional(`${base}/contributors?per_page=20`),
        this.request(`${base}/releases?per_page=10`),
      ]);
      const value = parseProjectData(metadata, readme, contributors, releases);
      this.cache.set(key, { value, expiresAt: this.now() + (value ? SUCCESS_TTL_MS : DEGRADED_TTL_MS) });
      return value;
    } catch {
      this.cache.set(key, { value: null, expiresAt: this.now() + DEGRADED_TTL_MS });
      return null;
    }
  }

  private async request(url: string): Promise<unknown> {
    const headers: Record<string, string> = { accept: 'application/vnd.github+json' };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    const response = await this.fetchImpl(url, { headers });
    if (!response.ok) throw new Error(`GitHub API request failed: ${response.status}`);
    if (response.status === 204) return null;
    return response.json();
  }

  /** README (404) と contributors (204) は無いことがあるため、 同期全体を失敗させない。 */
  private async requestOptional(url: string): Promise<unknown> {
    try {
      return await this.request(url);
    } catch {
      return null;
    }
  }
}

function parseProjectData(metadata: unknown, readme: unknown, contributors: unknown, releases: unknown): GitHubProjectData | null {
  if (!isRecord(metadata)) return null;
  const rawDescription = metadata.description;
  if (rawDescription != null && typeof rawDescription !== 'string') return null;
  const description = typeof rawDescription === 'string' ? rawDescription : null;
  const parsedContributors = parseContributorList(contributors);
  if (!parsedContributors) return null;
  const parsedReleases = parseReleaseList(releases);
  if (!parsedReleases) return null;
  // topics は表示の補助情報でしかないため、 欠けていても同期全体は失敗させない。
  const topics = Array.isArray(metadata.topics)
    ? metadata.topics.filter((topic): topic is string => typeof topic === 'string')
    : [];
  const content = isRecord(readme) && typeof readme.content === 'string' ? readme.content : null;
  const readmeText = content ? decodeBase64(content).slice(0, 2_048) : null;
  return { description, topics, readme: readmeText,
    contributors: parsedContributors.slice(0, 20), releases: parsedReleases.slice(0, 10) };
}

/** contributors が取得できなかった場合 (空リポジトリの 204 等) は空リストとして扱う。 */
function parseContributorList(payload: unknown): GitHubContributor[] | null {
  if (payload === null || payload === undefined) return [];
  if (!Array.isArray(payload)) return null;
  const contributors: GitHubContributor[] = [];
  for (const contributor of payload) {
    if (!isRecord(contributor) || typeof contributor.login !== 'string' || !isHttpsUrl(contributor.avatar_url)) return null;
    contributors.push({ login: contributor.login, avatarUrl: contributor.avatar_url });
  }
  return contributors;
}

function decodeBase64(value: string): string {
  return Buffer.from(value.replace(/\n/g, ''), 'base64').toString('utf8');
}
/** panel が <a href> / <img src> にそのまま入れるため、 https の URL だけを通す。 */
function isHttpsUrl(value: unknown): value is string {
  return typeof value === 'string' && value.toLowerCase().startsWith('https://');
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
function isFiniteNumber(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
