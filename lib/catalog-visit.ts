/* Module state survives client-side navigation but resets on a full page load, so it
   records whether this tab reached an app page from the catalog. An app page opened
   directly (a shared link, a new tab) has no catalog entry behind it in history. */
let catalogVisited = false;

export function markCatalogVisited() {
  catalogVisited = true;
}

export function leaveAppOverlay(router: { back(): void; push(href: string): void }) {
  if (catalogVisited) router.back();
  else router.push("/apps");
}
