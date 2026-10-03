/** Keep lazy GLab panels on the version loaded by this document.
 * @implements SPEC-GLAB-SHELL-010
 */
export function versionedPanelUrl(path: string): string {
  const version = document.querySelector<HTMLMetaElement>('meta[name="glab-build"]')?.content;
  if (!version) throw new Error('GLab build metadata is missing. Rebuild the frontend.');
  return `${path}?v=${encodeURIComponent(version)}`;
}
