/**
 * Nav "active" match: exact path, or a nested route under `href`.
 * Uses a `/` boundary so `/owner/cascade` does not match `/owner/cascade-requisites`.
 */
export function isNavHrefActive(pathname: string, href: string, rootHref: string): boolean {
  if (pathname === href) return true;
  if (href === rootHref) return false;
  return pathname.startsWith(`${href}/`);
}
