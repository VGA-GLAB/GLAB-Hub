import { apiJson } from '../../corpus/public/src/api.ts';
import { el } from './dom.ts';

interface Team {
  id: string; name: string; description: string | null; repoUrl: string | null;
  members: Array<{ userId: string; name: string | null; role: string }>;
  releases: Array<{ tag: string; name: string; publishedAt: string | null }>;
}
type Section = 'dashboard' | 'members' | 'releases';

/** Every selection rechecks server membership; never cache private team data.
 * @implements SPEC-GLAB-TEAM-NAVIGATION-001
 */
export function mountTeamNavigation(nav: HTMLElement, main: HTMLElement, beforeOpen: () => void): () => void {
  const area = el('div', 'team-navigation');
  area.append(el('div', 'nav-caption', 'TEAM'));
  nav.append(area);
  let disposed = false;
  let request = 0;
  const cancel = (): void => { request += 1; };
  nav.addEventListener('click', cancel, true);
  async function open(id: string, section: Section, button: HTMLButtonElement): Promise<void> {
    const current = ++request;
    beforeOpen();
    nav.querySelectorAll('button.tab').forEach(item => { item.classList.remove('active'); item.removeAttribute('aria-current'); });
    button.classList.add('active'); button.setAttribute('aria-current', 'page');
    main.replaceChildren(el('p', 'muted', 'チームを読み込んでいます…'));
    try {
      const { team } = await apiJson<{ team: Team }>(`/api/x/projects/teams/${encodeURIComponent(id)}`);
      if (disposed || current !== request) return;
      main.replaceChildren(el('h1', undefined, team.name));
      if (section === 'dashboard') {
        main.append(el('h2', undefined, 'チームダッシュボード'), el('p', undefined, team.description || '説明はまだありません。'),
          el('p', undefined, `メンバー ${team.members.length}人 · リリース ${team.releases.length}件`));
        if (team.repoUrl) {
          const url = new URL(team.repoUrl);
          if (url.protocol === 'https:') {
            const link = el('a', undefined, 'リポジトリを開く') as HTMLAnchorElement;
            link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; main.append(link);
          }
        }
      } else if (section === 'members') {
        main.append(el('h2', undefined, 'メンバー'));
        for (const member of team.members) main.append(el('p', undefined, `${member.name || member.userId} · ${member.role === 'producer' ? 'プロデューサー' : 'メンバー'}`));
      } else {
        main.append(el('h2', undefined, 'リリース'));
        if (!team.releases.length) main.append(el('p', 'muted', 'リリースはまだありません。'));
        for (const release of team.releases) main.append(el('p', undefined, `${release.name || release.tag} (${release.tag})`));
      }
    } catch {
      if (!disposed && current === request) main.replaceChildren(el('p', 'error', 'チームを表示できません。所属状況を確認してください。'));
    }
  }
  void apiJson<{ teams: Array<{ id: string; name: string }> }>('/api/x/projects/teams/mine').then(({ teams }) => {
    if (disposed) return;
    if (!teams.length) area.append(el('p', 'muted', '所属チームはありません'));
    for (const team of teams) {
      const group = el('details', 'nav-group') as HTMLDetailsElement;
      group.append(el('summary', undefined, team.name));
      for (const [section, label] of [['dashboard', 'ダッシュボード'], ['members', 'メンバー'], ['releases', 'リリース']] as const) {
        const button = el('button', 'tab', label);
        button.onclick = () => void open(team.id, section, button);
        group.append(button);
      }
      area.append(group);
    }
  }).catch(() => { if (!disposed) area.append(el('p', 'error', '所属チームを取得できませんでした')); });
  return () => { disposed = true; cancel(); nav.removeEventListener('click', cancel, true); };
}
