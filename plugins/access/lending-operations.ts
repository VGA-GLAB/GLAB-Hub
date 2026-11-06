/** Seven existing Bibliotheca target operations; the target repeats its own ACL.
 * @implements SPEC-GLAB-BOUND-AUTH-001
 */
import type { ServiceOperationPolicy } from '../../corpus/server/hub/sdk.ts';
import { approved, classify } from './operation-classification.ts';

const readOperations = new Map<string, readonly [string, 'read' | 'sensitive_read']>([
  ['/api/x/library/equipment', ['library.equipment.read', 'read']],
  ['/api/x/library/books', ['library.books.read', 'read']],
  ['/api/x/library/lookup', ['library.items.lookup', 'read']],
  ['/api/x/library/me', ['library.identity.self.read', 'sensitive_read']],
  ['/api/x/library/loans/mine', ['library.loans.own.read', 'sensitive_read']],
] as const);

export const lendingOperationPolicy: ServiceOperationPolicy = c => {
  if (c.req.method === 'GET') {
    const operation = readOperations.get(c.req.path);
    return operation ? classify(operation[0], operation[1], (_context, identity) => identity.userId.length > 0 && approved(identity)) : null;
  }
  if (c.req.method !== 'POST') return null;
  if (c.req.path === '/api/x/library/loans') {
    return classify('library.loans.create', 'important', (_context, identity) => identity.userId.length > 0 && approved(identity));
  }
  if (c.req.path === '/api/x/library/books') {
    return classify('library.books.create', 'important', (_context, identity) => identity.userId.length > 0 && approved(identity) && identity.isAdmin);
  }
  return null;
};
