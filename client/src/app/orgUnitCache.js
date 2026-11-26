// Shared cache for GET /org-units/{id} lookups -- an org unit's name/level/
// parent_id essentially never change once created, so every hook that
// needs to resolve an id to its unit (useOrgAncestry's parent chain,
// useOrgPathNames' breadcrumb names) shares this one cache and one set of
// in-flight requests, instead of each hook keeping its own. Without this,
// two hooks resolving the same fresh id around the same moment would each
// see "not cached yet" and both fire a request -- getOrgUnit callers
// racing on the same id join the same in-flight promise instead.
const cache = new Map();
const inFlight = new Map();

function fallback(id) {
  return { id, name: id, level: null, parent_id: null };
}

export function peekOrgUnit(id) {
  return cache.get(id);
}

export function getOrgUnit(id, getJSON) {
  if (cache.has(id)) return Promise.resolve(cache.get(id));
  if (inFlight.has(id)) return inFlight.get(id);

  const promise = getJSON(`/org-units/${encodeURIComponent(id)}`)
    .catch(() => fallback(id))
    .then((unit) => {
      cache.set(id, unit);
      inFlight.delete(id);
      return unit;
    });

  inFlight.set(id, promise);
  return promise;
}
