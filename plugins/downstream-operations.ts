/** Destination-owned HTTP contracts to adopt together with the target services.
 * No fallback classification from method, connector id or a client-supplied action.
 * @implements SPEC-GLAB-BOUND-AUTH-001
 */
export interface DownstreamOperation { action: string; additionalHeaders?: readonly string[] }
interface Route { project: string; method: string; path: RegExp; action: string; booking?: true }
const routes: readonly Route[] = [
  { project: 'aedilis', method: 'GET', path: /^\/api\/facilities$/, action: 'facility.list' },
  { project: 'aedilis', method: 'GET', path: /^\/api\/facilities\/[^/]+$/, action: 'facility.read' },
  { project: 'aedilis', method: 'GET', path: /^\/api\/reservations\/capabilities$/, action: 'reservation.capabilities' },
  { project: 'aedilis', method: 'POST', path: /^\/api\/checkin\/gps$/, action: 'checkin.gps' },
  { project: 'aedilis', method: 'GET', path: /^\/api\/meet\/status$/, action: 'meet.status', booking: true },
  { project: 'aedilis', method: 'POST', path: /^\/api\/meet\/oauth\/start$/, action: 'meet.oauth.start', booking: true },
  { project: 'aedilis', method: 'POST', path: /^\/api\/meet\/oauth\/complete$/, action: 'meet.oauth.complete', booking: true },
  { project: 'aedilis', method: 'GET', path: /^\/api\/meet\/[0-9a-f-]{36}$/i, action: 'meet.read', booking: true },
  { project: 'aedilis', method: 'POST', path: /^\/api\/meet\/[0-9a-f-]{36}$/i, action: 'meet.create', booking: true },
  { project: 'aedilis', method: 'POST', path: /^\/api\/meet\/external\/glab-event\/\d+$/, action: 'meet.event.create', booking: true },
  ...['reservations', 'meetings'].flatMap(resource => [
    { project: 'aedilis', method: 'GET', path: new RegExp(`^/api/${resource}$`), action: `${resource}.list`, booking: true as const },
    { project: 'aedilis', method: 'GET', path: new RegExp(`^/api/${resource}/mine$`), action: `${resource}.own`, booking: true as const },
    { project: 'aedilis', method: 'POST', path: new RegExp(`^/api/${resource}$`), action: `${resource}.create`, booking: true as const },
    { project: 'aedilis', method: 'GET', path: new RegExp(`^/api/${resource}/[^/]+$`), action: `${resource}.read`, booking: true as const },
    { project: 'aedilis', method: 'PATCH', path: new RegExp(`^/api/${resource}/[^/]+$`), action: `${resource}.update`, booking: true as const },
    { project: 'aedilis', method: 'DELETE', path: new RegExp(`^/api/${resource}/[^/]+$`), action: `${resource}.delete`, booking: true as const },
  ]),
  { project: 'aedilis', method: 'POST', path: /^\/api\/meetings\/[^/]+\/finalize$/, action: 'meetings.finalize', booking: true },
  { project: 'aedilis', method: 'POST', path: /^\/api\/meetings\/[^/]+\/responses$/, action: 'meetings.respond', booking: true },
  { project: 'aedilis', method: 'PATCH', path: /^\/api\/meetings\/[^/]+\/responses\/[^/]+$/, action: 'meetings.response.update', booking: true },
  { project: 'bibliotheca', method: 'GET', path: /^\/api\/integrations\/glab\/items\/equipment$/, action: 'equipment.list' },
  { project: 'bibliotheca', method: 'GET', path: /^\/api\/integrations\/glab\/items\/books$/, action: 'inventory.books.list' },
  { project: 'bibliotheca', method: 'POST', path: /^\/api\/integrations\/glab\/items\/books$/, action: 'inventory.books.create' },
  { project: 'bibliotheca', method: 'GET', path: /^\/api\/integrations\/glab\/items\/lookup$/, action: 'items.lookup' },
  { project: 'bibliotheca', method: 'GET', path: /^\/api\/integrations\/glab\/me$/, action: 'identity.self.read' },
  { project: 'bibliotheca', method: 'GET', path: /^\/api\/integrations\/glab\/loans\/mine$/, action: 'loans.own.read' },
  { project: 'bibliotheca', method: 'POST', path: /^\/api\/integrations\/glab\/loans$/, action: 'loans.create' },
  { project: 'tirocinium', method: 'GET', path: /^\/api\/v1\/companies$/, action: 'companies.list' },
  { project: 'tirocinium', method: 'POST', path: /^\/api\/v1\/sessions$/, action: 'interview.create' },
  { project: 'tirocinium', method: 'POST', path: /^\/api\/v1\/sessions\/[^/]+\/materials$/, action: 'interview.material.submit' },
  { project: 'tirocinium', method: 'POST', path: /^\/api\/v1\/sessions\/[^/]+\/call-ticket$/, action: 'interview.call-ticket' },
  { project: 'tirocinium', method: 'POST', path: /^\/api\/v1\/sessions\/[^/]+\/end$/, action: 'interview.end' },
  { project: 'tirocinium', method: 'DELETE', path: /^\/api\/v1\/sessions\/[^/]+$/, action: 'interview.delete' },
  ...[
    ['GET', 'surveys', 'survey.list'], ['GET', 'surveys/[^/]+', 'survey.read'], ['POST', 'surveys', 'survey.create'],
    ['PATCH', 'surveys/[^/]+', 'survey.update'], ['PUT', 'surveys/[^/]+/response', 'survey.respond'],
    ['GET', 'reviews', 'review.list'], ['POST', 'reviews', 'review.create'],
    ['GET', 'reviews/[^/]+/follow-up', 'review.follow-up.read'], ['POST', 'reviews/[^/]+/follow-up', 'review.follow-up.write'],
    ['GET', 'reviews/analysis/catalog', 'review.analysis.catalog'],
    ['GET', 'reviews/analysis/[^/]+', 'review.analysis.read'], ['POST', 'reviews/analysis/(?!catalog$)[^/]+', 'review.analysis.create'],
    ['GET', 'reviews/recent-games', 'games.recent'], ['GET', 'games', 'games.list'], ['POST', 'games', 'games.create'], ['PATCH', 'games/[^/]+', 'games.update'],
    ['GET', 'evidence/emotion-curves', 'evidence.curves.read'], ['POST', 'evidence/emotion-curves', 'evidence.curves.create'],
    ['POST', 'evidence/emotion-curves/[^/]+/evaluate', 'evidence.evaluate'],
    ['GET', 'evidence/media/[^/]+/[^/]+/ticket', 'evidence.media.ticket'],
    ['GET', 'evidence/media/[^/]+/[^/]+', 'evidence.media.read'], ['PUT', 'evidence/media/[^/]+/[^/]+', 'evidence.media.write'],
  ].map(([method, path, action]) => ({ project: 'voluptas', method: method ?? '',
    path: new RegExp(`^/api/v1/integrations/glab/${path}$`), action: action ?? '' })),
];

export function classifyDownstreamOperation(projectKey: string, method: string, path: string): DownstreamOperation | null {
  const parsed = new URL(path, 'https://operation.invalid');
  if (parsed.origin !== 'https://operation.invalid' || parsed.pathname + parsed.search !== path || parsed.hash) return null;
  const route = routes.find(candidate => candidate.project === projectKey && candidate.method === method && candidate.path.test(parsed.pathname));
  return route ? { action: route.action, ...(route.booking ? { additionalHeaders: ['x-glab-booking-context'] } : {}) } : null;
}
