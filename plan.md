# Department Sub-Admin Feature — Implementation Plan

> **Update:** the hierarchy isn't just Institute → Department. It's a 4-level chain: **Institute Admin → Department Coordinator → Cohort Coordinator (SY / TY / B.Tech) → Division Coordinator (class coordinators, e.g. 3 divisions per cohort)**. Each level is created by the level above it, follows the exact same "copy the parent's published calendar, edit your own copy, publish when ready" pattern, and can only ever touch its own copy. Section 3 below has been redesigned around a single generic **"org unit"** concept instead of one-off "department" plumbing, so department/cohort/division (and any future 5th level) all reuse the same collections, routes, and permission logic instead of tripling the code three times over. Section 2 and the open-questions list are updated to match; see §3.1–3.3 for the org-unit design specifically, and the flowchart (`hierarchy-flowchart.pdf`) for the visual (note: the PDF still says "Year" — flagged for a follow-up update to "Cohort").

## 1. Current implementation (context)

**Auth (`server/agent/auth.py`, `server/routes/auth.py`)**
- Single shared password (`ADMIN_PASSWORD` env var). `POST /auth/login {password}` → `issue_token()` checks the password and returns a JWT: `{role: "admin", exp: +24h}`.
- `require_admin` (hard 401/403) and `optional_admin` (never raises, just returns bool) are FastAPI dependencies that decode the JWT and check `role == "admin"`.
- Frontend (`AuthContext.jsx`) stores the JWT in `localStorage`, decodes `exp` client-side only for UX (auto-logout timer), never trusts it for security — the server re-checks the signature on every request.

**Calendar data model (`server/agent/schema.py`, `server/agent/db.py`)**
- A calendar is uniquely keyed by `(academic_year, term, category)` — `category` already supports multiple variants per term (e.g. "UG Calendar", "PG Calendar", "FY Calendar"), sourced from a `calendar_categories` collection.
- One Mongo document per key in the `calendars` collection, shaped as `{meta, events, holidays, day_color_overrides, saved_at, published}`.
  - The top-level fields are always the **live draft** (every mutation endpoint writes here).
  - `published` is `None` until an admin explicitly publishes; it's a full snapshot taken at that moment.
  - `_admin_view()` returns the live draft + computed publish-status flags. `_public_view()` returns only the last published snapshot (or `None` if never published) — this is what makes unpublished edits invisible to the public.
- All calendar mutations (`mark-holiday`, `reschedule-event`, `add-event`, `remove-event`, `remove-holiday`, `unmark-holiday`, `set-day-color`, `plan`, `save`) follow the same shape: take a `NormalizedCalendar` (or enough info to build one), run it through the relevant pure `agent/*.py` function, re-validate via `orchestrator.to_draft()`, `save_calendar_draft()`, return `_after_save()` (re-reads admin view so publish flags are fresh).
- `routes/taxonomy.py` owns academic-year/term/category browsing (declared-vs-actually-has-content, admin sees more than a public visitor).

**Frontend (`client/src`)**
- `Sidebar.jsx` → year → term navigation; `CategoryCards.jsx` → category cards; `CalendarPage` (`pages/calendar.jsx`) renders the actual calendar for a selected `(year, term, category)`, gated entirely on `isAdmin` from `AuthContext`.
- `useCalendarApi.js` attaches the bearer token to every request when logged in, and auto-redirects to `/login` on a 401.
- `LoginPage` is a single password field — no username/role selector.

---

## 2. What's being asked for

A 4-level chain, same pattern repeated at every level:

```
Institute Admin
   └── creates → Department Coordinators           (e.g. Computer, Mechanical, ...)
                    └── creates → Cohort Coordinators   (SY, TY, B.Tech)
                                     └── creates → Division Coordinators   (e.g. Div A, B, C)
```

1. **Creation.** Every level creates the level directly below it with the same 2-field form: a name + a password. The parent can see its own children's passwords masked (dots) with an eye-toggle to reveal — same UI at every level.
2. **Login.** One shared login page/form (password only) for *everyone*, at every level — the backend figures out whose password it is (institute admin, or which department/cohort/division) and issues a token with the right role/identity. No role picker, no separate URLs per level.
3. **Browsing.** Any coordinator (department/cohort/division) can only ever browse the **published** calendar of the level directly above them — never that parent's live draft, and never anything above the parent either (a division coordinator can't see the institute's or department's draft, only their own cohort's published calendar).
4. **Copying.** A coordinator can **copy** their parent's published calendar "as-is" into their own space, then freely add/edit/remove events & holidays on *that copy* — same capabilities the institute admin already has, reused unchanged at every level.
5. **Publishing.** Edits stay completely private — not visible to the public, to the parent, to siblings, or to anyone — until the coordinator explicitly publishes. Publishing makes it visible to (a) the public, and (b) its own children (if any) as the thing *they* can now copy from. A division coordinator's publish is the end of the chain — no level below it.
6. **Editing scope.** Nobody can edit anything above their own level — a department coordinator can't touch the institutional calendar; a cohort coordinator can't touch the institutional or department calendar; a division coordinator can't touch any of the three levels above it.

---

## 3. Proposed design

Department, Cohort, and Division are three instances of the exact same concept: *"an account, created by the level above it, that can copy its parent's published calendar and manage its own draft/publish cycle."* Rather than building `departments`/`department_calendars`, then a near-identical `cohorts`/`cohort_calendars`, then `divisions`/`division_calendars`, the design below generalizes all three into one **"org unit"** abstraction — so the collections, routes, and permission checks are written *once* and work at every level (and would keep working if a 5th level were ever added later).

### 3.1 New Mongo collections

**`org_units`** — one doc per department/cohort/division account, all in a single collection:
```
{
  id: str,
  name: str,                          # e.g. "Computer Engineering", "SY", "Div A"
  level: "department" | "cohort" | "division",
  parent_id: str | None,              # None only for a department (its parent is the institute itself)
  password_hash: str,
  created_at: iso
}
```
- `password_hash` — a proper one-way hash (bcrypt), used for the actual login check. **No reversible/encrypted field is stored at all** — see decision §5.4: the create/reset endpoints echo the plaintext back in their own response (the caller just typed it, so this isn't a storage concern), and the frontend caches that for the eye-toggle reveal; a listing fetch can never produce a password for something created in an earlier session, by design.
- Password uniqueness must be enforced **globally** across `ADMIN_PASSWORD` + every org unit at every level (not just siblings) — since login detects role/identity purely by which password matched, any collision anywhere is ambiguous. Checked by bcrypt-verifying the candidate against every existing hash (small N, acceptable cost) plus a plain compare against `ADMIN_PASSWORD`.
- Permission rule for *who can create what* (enforced in the creation endpoint, not by trusting the client) — see decision §5.7 for the department→division edge case:
  - `role: admin` → may create a `level: "department"` unit (`parent_id: null`).
  - a `department`-level org unit → may create a child at **either** `level: "cohort"` **or** `level: "division"`, with `parent_id: <itself>` (both allowed — a department chooses per-child which it wants; this is what lets a department skip the cohort layer entirely, e.g. First Year).
  - a `cohort`-level org unit → may create a `level: "division"` unit with `parent_id: <itself>`.
  - a `division`-level org unit → cannot create anything (bottom of the chain today).

**`org_calendars`** — same document shape as `calendars` (`meta/events/holidays/day_color_overrides/saved_at/published`), keyed by `(owner_org_id, academic_year, term, category)` instead of `(academic_year, term, category)`. One collection shared by department/cohort/division calendars alike — `owner_org_id` is the only thing distinguishing whose calendar it is. Kept **separate from `calendars`** so the existing, already-tested institute draft/publish path is completely undisturbed; a small set of functions (mirroring `save_calendar_draft`/`get_calendar`/`publish_calendar`/`unpublish_calendar`/`delete_calendar`) is added, parametrized by `owner_org_id` instead of duplicated per level.

**Generic "copy from parent" rule** (one code path for all 3 levels): given an org unit, resolve its parent's *published* calendar —
- if `parent_id is None` (a department) → parent source is the institute's own `calendars` collection, public view (`get_calendar(..., admin=False)` — exactly what a public visitor sees).
- else (a cohort or division) → parent source is `org_calendars` for that `parent_id`, published view.

This single rule is what makes the chain arbitrary-depth instead of hardcoded to "department copies institute, cohort copies department, division copies cohort" as three separate implementations.

### 3.2 Auth changes (`server/agent/auth.py`)

- `issue_token(password)`:
  1. `password == ADMIN_PASSWORD` → `{role: "admin", exp}` (unchanged).
  2. Else look up `org_units` by `password_hash` match → `{role: "org", org_id, level, exp}`.
  3. Else 401 "Incorrect password" (unchanged message/shape either way).
- New dependencies:
  - `require_org_unit(level=None)` — decodes the JWT, 401/403 unless `role == "org"` (and, if `level` was given, unless it matches) — returns `(org_id, level)` **from the token**, never trusted from the request body/URL, so a coordinator can never spoof another org unit or another level.
  - `optional_role` (replaces `optional_admin` for GETs that now serve 3+ audiences) — returns `{"role": "public" | "admin" | "org", "org_id": id | None}`.
- `require_admin` is untouched — org-unit tokens are automatically rejected by every existing institute-admin-only endpoint with zero changes there.

### 3.3 New backend routes (`server/routes/org_units.py`)

**Org-unit management** (creation gated by the permission rule in §3.1 — `require_admin` OR `require_org_unit(level="department")` OR `require_org_unit(level="cohort")` depending on which child level is being created):
- `POST /org-units {name, password, parent_id?}` — create a child one level down from the caller. Response echoes `{id, name, level, parent_id, created_at, password}` — the `password` field here is just the plaintext the caller already typed, handed back so the frontend can display/reveal it for this session (never re-derived from storage).
- `GET /org-units?parent_id=...` — list the caller's own direct children as `{id, name, level, created_at}` — **no password field**, per decision §5.4 (the DB only ever has a hash; nothing to return). A department only ever sees its own cohorts/divisions here, never another department's.
- `PATCH /org-units/{id} {password}` — reset a child's password (re-checks global uniqueness); response echoes the new plaintext back, same reasoning as `POST`.
- `DELETE /org-units/{id}` — remove a child account. 409s per decision §5.1 if it has any child org unit or owns any `org_calendars` document.

**Org-unit calendar routes** (mirroring `routes/calendars.py`, scoped by `org_id` from `require_org_unit()`, using `org_calendars`):
- `GET /org-calendar/{academic_year}/{term}/{category}?org_id=...` — the org unit's own live draft if authenticated as it, else its last-published snapshot (same admin/public split as today, one level down at whichever depth).
- `POST /org-calendar/{academic_year}/{term}/{category}/copy-from-parent` (`require_org_unit()`) — resolves and copies the parent's published calendar per the §3.1 rule. 409 if a draft already exists for this org unit + key — permanent, per decision §5.2 (no re-copy, ever).
- `POST .../publish`, `POST .../unpublish` (`require_org_unit()`) — identical semantics to the institute versions, against `org_calendars`. Publish additionally cascades: see the amendment to decision §5.2 below.
- `POST /org-calendar/mark-holiday`, `/reschedule-event`, `/add-event`, `/remove-event`, `/remove-holiday`, `/unmark-holiday`, `/set-day-color` (`require_org_unit()`) — **reuse the exact same pure functions** from `agent/event_agent.py`/`agent/holiday_agent.py` unchanged (storage-agnostic already) — only the save/read calls point at `org_calendars` instead of `calendars`.

No changes needed to `agent/event_agent.py`, `agent/holiday_agent.py`, `agent/orchestrator.py`, or `agent/rules_agent.py` at all — this whole hierarchy is a persistence + permissions concern layered on top of logic that already doesn't know or care what it's editing.

### 3.4 Frontend changes

- `AuthContext.jsx`: decode `role`/`org_id`/`level` out of the JWT payload alongside the existing `exp` read (same "client-side UX signal only" pattern already used); expose `isAdmin` (only `role === "admin"`), `isOrgUnit`, `orgLevel` (`"department" | "cohort" | "division"`), `orgId`.
- `LoginPage.jsx`: form itself is unchanged (still just a password field) at every level — only the post-login redirect differs by role/level (institute admin → today's landing page; any org unit → its own calendar list).
- New **`OrgUnitAdmin.jsx`** (reused at every level, not just for the institute admin): name + password inputs to create a child; a list of the caller's own direct children, each row showing the password masked with an eye-icon toggle — same show/hide pattern already in `LoginPage.jsx`. Shown to the institute admin (managing departments), to a department coordinator (managing its cohorts), and to a cohort coordinator (managing its divisions) — same component, just scoped by whoever's logged in. Not shown to a division coordinator (nothing below it).
- Org-unit coordinator experience: reuse `CalendarPage`/`CalendarView`/`MilestoneSheet`/etc. almost entirely as-is, pointed at `/org-calendar/...` instead of `/calendar/...` when `role === "org"`. Concretely:
  - Browsing reuses the **existing public-facing taxonomy pattern** — a department/cohort/division coordinator's "browse my parent's calendars" view is structurally identical to a public visitor's (published-only), just scoped to one specific parent org unit instead of the whole institute.
  - Opening a published parent calendar not yet copied shows a "Copy this calendar to start editing" call-to-action instead of edit controls; after copying, the same edit UI the institute admin already uses becomes available, pointed at the org-unit endpoints.
  - Publish/unpublish button reused as-is.
- `main.jsx` — new route(s) for the org-unit admin panel and an org-scoped calendar route (or role-based branching on the existing `/:year/:term/:category` path).

---

## 4. Suggested implementation order

1. `org_units` collection + `agent/auth.py` changes (create/list/reveal endpoints, extended `issue_token`, `require_org_unit(level=...)`). Independently testable (unit tests mirroring `test_holiday_agent.py`'s style) before touching any calendar logic. Verify the permission rule at all 3 creation edges (admin→department, department→cohort, cohort→division) plus that division→(nothing) is correctly rejected.
2. `org_calendars` collection + org-scoped db functions + the generic `copy-from-parent` resolution rule (institute-as-parent vs. org-unit-as-parent).
3. `routes/org_units.py` — management endpoints, then calendar mutation endpoints (thin wrappers reusing `event_agent`/`holiday_agent`, same shape as `routes/calendars.py`).
4. Frontend: `AuthContext` role/org support, `OrgUnitAdmin.jsx` panel, org-unit login redirect.
5. Frontend: point `CalendarPage` at org-calendar endpoints when applicable, add the "copy to start editing" call-to-action.
6. End-to-end pass, walking the *whole* chain: create a department → log in as it → copy the institute's published calendar → edit → publish. Create a cohort under that department → log in as it → copy the department's published calendar → edit → publish. Create a division under that cohort → same → publish. Confirm at each step that only the public + the direct child level can see a *published* calendar, and that nobody can see anyone's unpublished draft except that exact org unit itself.

---

## 5. Decisions (confirmed — implementation proceeds on this basis)

1. **Deleting an org unit is refused, not cascaded**, if there's any data below it — matching the existing `remove_academic_year`/`remove_term` precedent. Concretely: `DELETE /org-units/{id}` returns 409 if that org unit has *any* child org unit, or owns *any* calendar document (draft or published) in `org_calendars`. No cascade-delete path exists at all — the parent must be data-free below itself before its account can be removed.
2. **Copying is strictly one-time, forever.** Once an org unit has copied its parent's published calendar for a given `(academic_year, term, category)`, that action is permanently unavailable for that key — no re-copy via the UI. `POST .../copy-from-parent` 409s if a draft already exists for that key; the frontend removes/hides the "Copy" button entirely once a draft exists (not just disables it).

   **Amendment:** what the one-time copy brought in is *not* frozen forever, though. Every event/holiday carries an `origin: "own" | "inherited"` tag (own additions vs. copied-from-parent), enforced server-side so a child can never edit or remove something it merely inherited (`_assert_*_editable` in `routes/org_units.py`). Whenever an org unit (or the institute itself) publishes, `cascade_publish_to_children` walks every direct child that has already copied a draft for that key, fully replaces its `inherited` items with whatever was just published (own items untouched), and publishes that child too — recursing arbitrarily deep, so one institute publish can ripple department → cohort → division automatically. A child that never copied in the first place is unaffected; there's nothing stored there to refresh.
3. **Public discovery of department/cohort/division calendars** — left open for the UI pass (§3.4); proceeding with the "extra cards next to the existing category cards" approach as the default, revisited once the rest is working end-to-end.
4. **Password storage: hash-only in the database, plaintext only in the UI at the moment it's known.** No reversible encryption field (`password_enc`/`ORG_SECRET_KEY` from the earlier draft is dropped). `POST /org-units` (create) and `PATCH /org-units/{id}` (reset) each echo the plaintext password back in their response — since the caller just typed it, this isn't a storage/security issue, just handing back what's already known — and the frontend caches that value in local component state for the eye-toggle reveal. `GET /org-units` (listing existing children on page load) never returns a password at all — the DB genuinely cannot produce one, only its hash. Practical effect: reveal works for anything created/reset in the current session; anything from an earlier session shows masked dots with no reveal option (only "Reset password", which then makes it revealable again).
5. **One password per org unit, one org unit per token** — confirmed, no multi-coordinator accounts.
6. **Cohort/division names are fully configurable**, not fixed lists — a department creates any number of arbitrarily-named cohort units, a cohort creates any number of arbitrarily-named division units, same free-text "name + password" form at every level. "SY / TY / B.Tech" and "Div A/B/C" are just the illustrative example, not a hardcoded set.
7. **Edge case: a department can create division-level children directly, skipping the cohort level.** Confirmed example: "Humanities and Engineering Sciences (First Year)" has no SY/TY/B.Tech split — its own children are divisions/classes directly. The permission rule in §3.1 is relaxed accordingly: a `department`-level org unit may create a child at **either** `level: "cohort"` **or** `level: "division"` (both allowed, chosen per-department); a `cohort`-level org unit may only create `level: "division"` children. This needs no special-casing in the calendar-copy logic — §3.1's "resolve parent's published calendar via `parent_id`" rule already works identically whether that `parent_id` points at a department or a cohort, since it never inspects the parent's `level` at all. This is kept as the **only** such edge case for now, not a general N-deep configurable hierarchy.
