// Turns an org unit's name into a URL-safe slug, purely for readability --
// lowercase, non-alphanumeric runs collapsed to a single hyphen, leading/
// trailing hyphens trimmed. Falls back to "unit" for a name that slugifies
// to nothing (e.g. one made entirely of punctuation).
function slugify(name) {
  const slug = (name || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "unit";
}

// Org unit ids are always exactly 8 lowercase hex characters (see
// server/agent/db.py's create_org_unit: uuid.uuid4().hex[:8]).
const ID_LENGTH = 8;
const ID_PATTERN = /^[0-9a-f]{8}$/;

// Builds the URL segment for an org unit: a readable name-derived prefix
// with the real id kept as a suffix, e.g. "computer-engineering-a5af43cb".
// The id is what every API call/permission check actually keys off (see
// extractOrgId below) -- this is purely cosmetic, and deliberately not a
// stored/looked-up slug, so there's no backend change, no uniqueness
// concern, and no risk to rules that already depend on the id alone (e.g.
// a coordinator's own "go to my calendar" link has to resolve even before
// they've published anything, which a stored/looked-up slug tied to
// publish-gated visibility could easily break).
export function buildOrgPathSegment(id, name) {
  return `${slugify(name)}-${id}`;
}

// The inverse -- given a URL segment, which may be a bare id from an
// older/shared link ("a5af43cb") or a slug-prefixed one
// ("computer-engineering-a5af43cb"), returns the real id. Just "the last 8
// characters, if they look like one" -- no lookup needed either way, so
// this is a pure, synchronous string operation.
export function extractOrgId(segment) {
  if (!segment) return segment;
  const tail = segment.slice(-ID_LENGTH);
  return ID_PATTERN.test(tail) ? tail : segment;
}
