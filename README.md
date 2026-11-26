# MIT Academy of Engineering — Academic Calendar System

This is the top-level, whole-project reference for `calendar/`. It documents
every file on both the frontend (`client/`) and backend (`server/`), how
they fit together, and the request flow through the whole system end to
end. For the backend's own deep dive on scheduling *policy* (exact offsets,
why Mid-Sem lands 7 weeks after commencement, etc.), see
[`server/readme.md`](server/readme.md) — this document is the map of every
file plus the pipeline; that one is the canonical scheduling-rules
reference.

## What this system is

Two audiences, one app:

- **Public visitors** (students, faculty, anyone) browse published academic
  calendars: pick an academic year → a term → a category (UG/PG/FY
  Calendar) → see the full term calendar (month grids, a key-dates table,
  holidays), ask a plain-language question about it, and export it as a PDF.
- **Admins** (time-table coordinators) log in with a shared password and can
  *generate* a new calendar from a handful of inputs (start date, exam
  durations, holiday list), then hand-edit it afterward — mark/unmark
  holidays, reschedule any event, add a brand-new one — before it's
  auto-saved.

Nothing about a specific year/term/category is hardcoded in the frontend:
every list (years, terms, categories) and every date comes from the
backend, which reads it out of MongoDB.

## Repository layout

```
calendar/
├── client/                  React (Vite) frontend — see "Frontend" below
├── server/                  FastAPI backend — see "Backend" below
│   └── readme.md            Deep-dive on scheduling policy/rules
└── README.md                This file
```

## Architecture at a glance

```
 Browser (React SPA)                 FastAPI (server/main.py + routes/)       MongoDB
 ────────────────────                ───────────────────────────────────      ─────────
 Sidebar / CategoryCards  ──GET──▶ routes/taxonomy.py:                    ┐
                                   /calendar/academic-years                ├─▶ db.py reads
                                   /calendar/academic-years/{y}/terms      │   `calendars` /
                                   /calendar/categories/{y}/{term}         ┘   `calendar_categories` /
                                   (admin sees draft-only years/terms          `academic_years`
                                    too -- optional_admin, not require_admin)   collections
 CalendarView / MilestoneSheet ──GET──▶ routes/calendars.py:
                                        /calendar/{year}/{term}/{category}
                                        (admin -> live draft; public -> last-published snapshot only)
 "Export as PDF"           (client-side only: html2canvas + jsPDF, no request)
 ─────────────── admin-only below, needs a bearer token ───────────────
 CoordinatorForm "Generate" ──POST──▶ routes/calendars.py: /calendar/plan
                                        └▶ orchestrator.run_plan()
                                            └▶ scheduler_agent.plan_calendar()  (build the skeleton)
                                            └▶ holiday_agent.expand_holidays()  (attach holidays)
                                            └▶ rules_agent.validate()           (find issues)
                                        └▶ db.save_calendar_draft()  ──▶ upsert the draft into MongoDB
 DayEditor (mark/unmark holiday, remove-holiday, set-day-color) ──POST──▶ /calendar/mark-holiday,
                                        /calendar/unmark-holiday, /calendar/remove-holiday, /calendar/set-day-color
 MilestoneRow / InfoStrip (reschedule) ──POST──▶ /calendar/reschedule-event
 MilestoneColumn / InfoStrip / HolidayColumn (inline "+ Add") ──POST──▶ /calendar/add-event
 PublishStatus "Publish"/"Unpublish" ──POST──▶ routes/calendars.py:
                                        /calendar/{y}/{t}/{c}/publish, .../unpublish
                                        └▶ db.publish_calendar/unpublish_calendar (snapshot the draft into `published`)
 Sidebar "+"/"×" (years/terms)      ──POST/DELETE──▶ routes/taxonomy.py:
                                        /calendar/academic-years[/{y}], .../{y}/terms[/{t}]
                                        └▶ db.add_academic_year/remove_academic_year/add_term/remove_term
                                           (remove refuses with 409 if real calendars still exist under it)
```

Every mutating admin endpoint re-validates through the same
`orchestrator.to_draft()` path and re-saves, so a hand-edit is checked by
exactly the same rules a freshly-generated calendar is.

**Draft vs. published**, in one paragraph: every save (generate, mark
holiday, reschedule, etc.) writes to the document's top-level fields — the
*draft*, always freely editable. A separate `published` sub-document is a
full snapshot, only ever written when an admin explicitly clicks Publish.
An admin's own `GET`s always return the live draft plus computed
`is_published`/`has_unpublished_changes`/`published_at` flags
(`db._admin_view`); everyone else's `GET`s only ever return the last
published snapshot, or nothing at all if it's never been published
(`db._public_view`) — so in-progress edits never leak to a public visitor.
Same idea one level up: an academic year/term can be *declared* (so it
shows up in the sidebar, and an admin can start generating calendars for
it) before any calendar under it has ever been published — see
`db.add_academic_year`/`add_term` and the "declared vs. has-content" merge
logic in `list_academic_years`/`list_terms`.

---

## Backend (`server/`)

FastAPI + Pydantic + MongoDB (via `pymongo`). Run with
`uvicorn main:app --reload --port 8000` from `server/` (needs a `.env` —
see `server/readme.md`'s "Running locally" section).

### `main.py` (71 lines) — app setup only

The only FastAPI-aware file that isn't a route handler; it owns app
construction and wiring, not any individual endpoint. Responsibilities:

- **CORS**: restricted to `ALLOWED_ORIGINS` (comma-separated env var,
  defaulting to the local Vite dev server only) so only the real deployed
  frontend — and never `"*"` — can call it.
- **Two global exception handlers** (added during the error-handling
  hardening pass): `GoogleAPICallError` → clean `503 {"detail": "Database
  temporarily unavailable..."}` instead of a raw driver exception reaching
  the client; a catch-all `Exception` handler → clean `500 {"detail":
  "Something went wrong..."}` with the real traceback logged server-side via
  Python's `logging`. Both sit *below* FastAPI's own more-specific
  `HTTPException` handling, so every explicit `raise HTTPException(...)` in
  `routes/*.py` is unaffected.
- `GET /health` — liveness check (what the keep-alive cron pings) — the one
  route defined directly here rather than in `routes/`, since it's trivial
  and app-level.
- **Registers the three routers** from `routes/`, in this order:
  `auth`, `taxonomy`, `calendars`. The order of `taxonomy` before
  `calendars` is load-bearing, not stylistic — see `routes/taxonomy.py`'s
  docstring.

### `routes/` — every endpoint, grouped by what it's about

Split out of what used to be one 337-line `main.py` once the route count
grew past ~20; each file below is an `APIRouter()` `main.py` includes.

- **`auth.py`** — `POST /auth/login`, exchanges the shared admin password
  for a JWT via `agent.auth.issue_token`. Also holds the tiny
  `LoginRequest`/`LoginResponse` models, since they're only ever used here.
- **`taxonomy.py`** — the sidebar's year/term/category structure, plus
  suggested holiday defaults:
  - `GET /calendar/holiday-defaults/{year}` — pre-fill rows for the
    coordinator's holiday form.
  - `GET /calendar/academic-years`, `GET
    /calendar/academic-years/{academic_year}/terms`, `GET
    /calendar/categories/{term}` — the three discovery endpoints that power
    the sidebar/category-cards browsing UI. Each takes `optional_admin`
    (never raises) instead of `require_admin`, so an admin sees draft-only
    years/terms too while a public visitor only sees ones with real
    published content.
  - `POST /calendar/academic-years`, `DELETE
    /calendar/academic-years/{academic_year}`, `POST
    /calendar/academic-years/{academic_year}/terms`, `DELETE
    /calendar/academic-years/{academic_year}/terms/{term}` — admin-only
    (`require_admin`) declare/remove endpoints backing the sidebar's "+"/"×"
    UI. The two removals return `409` (not a silent no-op or a `500`) if
    real calendars still exist under that year/term — see `db.py` below.
  - **Registered in `main.py` before `routes/calendars.py`**: these
    literal-prefixed paths (`academic-years`, `categories`) would otherwise
    be shadowed by `calendars.py`'s generic
    `/calendar/{academic_year}/{term}/{category}` pattern, since FastAPI
    matches routes in registration order, not by specificity — a request
    for `/calendar/academic-years/2026-2027/terms` has the same segment
    count as that generic pattern and would incorrectly match it first if
    `calendars.py` were included first.
- **`calendars.py`** — reading, generating, and editing one specific
  `(academic_year, term, category)` document:
  - `GET /calendar/{academic_year}/{term}/{category}` — fetch one saved
    calendar; 404s (with `detail`) if it doesn't exist, which the frontend
    treats as "show the empty-state message," not an error. `optional_admin`
    here too: admin gets the live draft, anyone else gets the last
    *published* snapshot only.
  - `DELETE /calendar/{academic_year}/{term}/{category}` — admin-only; wipes
    the draft *and* any published snapshot together.
  - `POST /calendar/{academic_year}/{term}/{category}/publish` and
    `.../unpublish` — admin-only. Publish snapshots the current draft into
    `published`, making it visible to public visitors; unpublish clears
    that snapshot without touching the draft, so it can be republished
    later with no redo needed.
  - `POST /calendar/save` — re-validate and persist an already-built
    calendar as-is (used to keep the DB in sync after an undo).
  - `POST /calendar/plan` — the generate endpoint; resolves a default start
    date if the coordinator didn't give one, calls
    `orchestrator.run_plan()`, saves, returns.
  - `POST /calendar/mark-holiday`, `POST /calendar/unmark-holiday`, `POST
    /calendar/reschedule-event`, `POST /calendar/add-event` — each: call the
    matching agent function, re-validate via `orchestrator.to_draft()`,
    save, return. `reschedule-event` additionally catches a `ValueError`
    from `event_agent.reschedule_event` (unknown `event_id`) and turns it
    into a clean `404`. Every one of these ends by re-reading the admin view
    via a shared `_after_save()` helper, so the response's
    `is_published`/`has_unpublished_changes` reflect the actual stored
    document, not a guess made from the in-memory draft.

### `agent/schema.py` — every shared data shape

Pure Pydantic models, no logic. `Holiday` (date + name + color `family`),
`CalendarEvent` (category/cohort/start/end/label, each with a random
8-char `id` via `_short_id()` so the frontend can target a specific one),
`TermMeta` (academic_year/term/category/commencement/teaching_end/term_end),
`NormalizedCalendar` (meta + events + holidays — the shape every agent
passes around), `CalendarDraft` (`NormalizedCalendar` + validation `issues`
+ the read-only publish-status fields `is_published`/`published_at`/
`has_unpublished_changes`, computed by `db.py` from the stored document,
never set by a client), plus one request model per mutating endpoint
(`PlanRequest`, `MarkHolidayRequest`, `UnmarkHolidayRequest`,
`RescheduleEventRequest`, `AddEventRequest`,
`AddAcademicYearRequest`, `AddTermRequest`) and `HolidayInput`/
`ValidationIssue` as smaller supporting shapes.

### `agent/scheduler_agent/` — turning minimal input into a full term

Three files, split by concern:

- **`templates.py`** — the two hardcoded day-offset templates,
  `TERM_I_TEMPLATE` and `TERM_II_TEMPLATE`, each a list of `(day_offset,
  duration_days, category, cohort, label)` tuples read directly off
  MITAOE's own published calendars (Term I from the 2026-27 document,
  commencement Mon 27 Jul 2026; Term II from the 2025-26 sheet, commencement
  5 Jan 2026). `_CONFIGURABLE` is a sentinel marking an entry whose duration
  comes from the coordinator's input instead of a fixed number. Also holds
  `TERM_I_PROJECT_EXAM_COHORTS`/`TERM_II_PROJECT_EXAM_COHORTS` (Project
  Examinations aren't in the templates — they're placed dynamically, one
  day per cohort in this order, right after the End-Sem Exam's actual end).
- **`date_helpers.py`** — generic weekend/exclusion date arithmetic with no
  knowledge of specific milestones: `_skip_weekend_to_monday`,
  `_skip_excluded_days_block`, `_finalize_gap_start` (combines both,
  looping until stable), `_skip_weekend_and_exclusions_block` (same idea
  for a block of individual single-day exams), `_last_instructional_day_before`
  (walks backward over Sundays/non-instructional dates), and `_build_events`
  (turns a template into real `CalendarEvent`s). Covered by
  `server/tests/test_date_helpers.py` (12 tests).
- **`placement.py`** — the exam chain: Mid-Sem → Practical → End-Sem →
  Project Exams, each anchored to the *previous block's actual end* rather
  than a template offset, so a coordinator's chosen duration or an entered
  vacation never leaves a stale gap. `_place_practical_after_mid_sem`
  (7 weeks after Mid-Sem's actual end), `_place_detention_and_makeup_before_practical`
  (Term I only — Final Detention lands on the last instructional day before
  Practical, Make-up/Remedial ends on that same day), `_sequence_practical_and_theory`
  (End-Sem starts the day after Practical ends), `_place_mdm_practical` (a
  single extra day on Practical's final day), `_place_project_examinations`
  (one day per cohort after End-Sem ends).
- **`__init__.py`** — `plan_calendar()`, the one function everything else
  wires together: builds events from the right template, runs the exam
  chain in order, appends Term II's "next term commencement" marker,
  computes `teaching_end` (Term I: wherever Final Detention landed; Term
  II: a fixed 16-week formula) and `term_end` (`term_weeks` weeks from
  start, -2 days so it lands on a Saturday, not a Monday — matching how the
  published calendar's "N weeks" is read), and returns a `NormalizedCalendar`.

### `agent/holiday_agent/` — where holiday dates come from

- **`data.py`** — `FIXED_HOLIDAYS` (5 national/state holidays with
  hardcoded month/day, safe since they never move) and
  `VERIFIED_MOVABLE_HOLIDAYS` (a dict keyed by year; currently only 2026 is
  populated, cross-checked against real institute documents — deliberately
  *not* guessed forward for other years).
- **`__init__.py`** — `fetch_holidays(year)` (fixed + verified-movable,
  deduped by `(date, name)` since two festivals can genuinely coincide),
  `default_odd_sem_start(year)` (last Monday of July), `expand_holiday_range`
  (turns a `[start, end]` range into one `Holiday` per day),
  `mark_holiday_range` (the admin "mark a holiday" mutation — appends,
  deduped against what's already marked), `suggested_holiday_defaults`
  (native range form for the coordinator's pre-fill form, not expanded),
  `unmark_holiday` (removes every holiday entry on a given day — a
  no-op, not an error, if there wasn't one).

### `agent/rules_agent.py` + `agent/rules_helpers.py` — deterministic validation

`validate(cal)` runs every check and returns a flat list of
`ValidationIssue` (severity `error`/`warning`): date-ordering sanity
(teaching_end/term_end not before their predecessor), "no holidays
entered" warning, minimum instructional-day count (`MIN_INSTRUCTIONAL_DAYS
= 80`), an event ending before it starts, a core exam starting on a
holiday or ending past `term_end`, Mid-Sem starting too early
(`MIN_WEEKS_TO_MID_SEM = 7`), Final Detention not clearing before
Practical starts, and cross-category exam clashes (same-category overlaps
are expected and ignored — e.g. the MDM Practical sub-slot is *supposed*
to sit inside the main Practical window). `rules_helpers.py` holds the
small standalone pieces: `_cohorts_overlap`, `_ranges_overlap`, and
`count_instructional_days` (the backend's version of the frontend's
`countInstructionalDays` — same base/addition/total split, same
categories included).

### `agent/event_agent.py` — post-generation event edits

`reschedule_event` (move + optionally rename an existing event by id —
**raises `ValueError` if the id doesn't exist**, fixed this session so a
stale id can't silently no-op) and `add_event` (append a brand-new event
with a fresh id). Deliberately doesn't re-validate itself —
`routes/calendars.py` always re-validates through `orchestrator.to_draft()`
after calling
either, so a moved/added event that now clashes with something else is
caught the same way any other clash would be. Covered by
`server/tests/test_event_agent.py` (2 tests).

### `agent/orchestrator.py` — wiring it together

`to_draft(cal)` — re-validates and wraps as a `CalendarDraft`; every
mutation endpoint in `routes/calendars.py` ends with this (via the shared
`_after_save()` helper). `expand_holidays` — flattens
every coordinator-entered holiday/non-instructional range into one
`Holiday` per day, deduped across the whole list. `_finalize` — clips the
expanded holidays to the draft's actual span (earliest event start through
latest event end, since Term I's re-exam cycle genuinely runs into
January) before validating. `run_plan` — the full pipeline entry point:
expand holidays → `scheduler_agent.plan_calendar()` → `_finalize` (attach +
validate).

### `agent/auth.py` — the one privileged role

No user table — a single `ADMIN_PASSWORD` env var checked in
`issue_token()`, which returns a 24h-expiry JWT (`role: admin`) signed with
`JWT_SECRET`. `require_admin` is the FastAPI dependency every mutating
route uses: no token → `401 Missing admin token`; invalid/expired →
`401 Invalid or expired admin token`; valid but wrong role → `403 Admin
access required`.

### `agent/db.py` — MongoDB persistence

Lazy, optional connection: `_get_client()` reads `MONGODB_URI` at call time
and returns `None` (with a printed warning) if it isn't set, so the API
runs statelessly instead of crashing when persistence isn't configured
(reads return nothing, writes are skipped). A calendar is uniquely keyed
by `_key(academic_year, term, category)`, a 3-field Mongo filter dict.

**Draft vs. published.** A calendar document's top-level fields
(`meta`/`events`/`holidays`/`issues`/`saved_at`) are always the live,
freely-editable draft — every mutation writes here via
`save_calendar_draft()` (`update_one(..., {"$set": document}, upsert=True)`,
deliberately not `replace_one`, so it never clobbers a `published`
snapshot sitting alongside it). `publish_calendar()` copies the current
draft's meta/events/holidays into a `published` sub-document (plus a
`published_at` timestamp) — `None` until the first publish.
`unpublish_calendar()` sets `published` back to `None`, leaving the draft
itself untouched. `_admin_view(doc)` (always the live draft, plus computed
`is_published`/`published_at`/`has_unpublished_changes` — the last comparing
`saved_at` against `published.published_at` as plain ISO-8601 string
comparison) and `_public_view(doc)` (the `published` snapshot only, reshaped
to the flat `CalendarDraft` shape, or `None` if never published — even if a
draft exists) are the two pure reshaping functions everything else calls
through; see `server/tests/test_db_publish.py`.

**Declared vs. has-content**, the same pattern used twice: a
`calendar_categories` collection (one doc per term, listing its
categories) lets a category render as a clickable card before any document
exists for it; an `academic_years` collection (one doc per year, listing
its declared terms) does the same for years/terms, via
`add_academic_year`/`remove_academic_year`/`add_term`/`remove_term` — the
two removals return `(False, "...still has calendars saved under it...")`
rather than raising or silently orphaning real content, if any calendar
still exists under that year/term. `_merge_years`/`_merge_terms` are the
pure functions that union "declared" with "has an actual calendar,"
unit-tested without a live MongoDB connection
(`server/tests/test_db_academic_years.py`). These list functions use
`collection.distinct(...)` (with an optional filter dict) to get the
unique set of years/terms/categories directly from MongoDB.

Other functions: `get_calendar(..., admin=False)` (admin → `_admin_view`,
else → `_public_view`), `delete_calendar` (wipes draft + published
snapshot together),
`list_academic_years(admin=False)`/`list_terms(academic_year,
admin=False)` (declared years/terms are visible to *everyone* — an admin
setting up next year's structure ahead of time wants visitors to see it
too — only actual calendar *content* is gated by publish status for a
non-admin caller), `list_categories(academic_year, term, admin=False)`
(reads `calendar_categories` for the full configured list; an admin gets
that list unfiltered, a public caller only gets categories that actually
have a published calendar for that specific academic year/term).

### `server/tests/` — pytest suite (32 tests across 5 files)

- **`test_date_helpers.py`** (12 tests) — the weekend/exclusion-skipping
  helpers and `_build_events`, using concrete real dates (e.g. `2026-01-05`
  is a known Monday) so the assertions are hand-traceable, not just
  "doesn't crash."
- **`test_event_agent.py`** (2 tests) — `reschedule_event` moves the
  matching event correctly, and raises `ValueError` for an unknown
  `event_id` (the regression test for this session's silent-no-op fix).
- **`test_auth.py`** (5 tests) — `issue_token`/`require_admin`/
  `optional_admin`/`_payload_is_admin` against a missing, invalid, expired,
  and valid token, confirming `optional_admin` never raises where
  `require_admin` would.
- **`test_db_publish.py`** (6 tests) — `_admin_view`/`_public_view` as pure
  functions over plain dicts (no live MongoDB needed): never-published,
  in-sync-after-publishing, edited-since-publishing, and that a public view
  never leaks a newer unpublished draft. Fixtures deliberately use
  obviously-arbitrary placeholder values (not a real-looking academic
  year), since neither function inspects `meta`/event content at all — only
  `saved_at`/`published_at`/`published`'s presence.
- **`test_db_academic_years.py`** (7 tests) — `_merge_years`/`_merge_terms`
  (the declared-vs-has-content union logic) across a deliberately varied
  spread of years (2024-2025 through 2099-2100, not one hardcoded example),
  since this system is meant to keep working for years/decades, not just
  the one currently in use.

Run via `pip install -r requirements-dev.txt && python -m pytest tests/`
from `server/`.

---

## Frontend (`client/`)

React 18 + Vite + `react-router-dom` v7. No global state library — every
piece of shared state is a small custom hook. Run with `npm run dev --
--port 5180` (or any port) from `client/`.

### `index.html` — the one static HTML shell

Vite's entry point. Carries everything a JS-executing React tree can't
provide to a non-JS-executing consumer: the favicon set (`.ico` + 16/32/48
PNGs + apple-touch-icon, generated from the real MIT Academy of
Engineering logo), `<meta name="description">`, Open Graph/Twitter Card
tags, a `theme-color` meta tag, and a `schema.org` `EducationalOrganization`
JSON-LD block. `og:url`/canonical and `sitemap.xml` are deliberately left
for later — they need a fixed production domain this project doesn't have
yet (see the commented placeholders in `robots.txt` and this file).

### `public/` — static passthrough assets

`favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png`,
`favicon-48x48.png`, `apple-touch-icon.png` (all generated from
`favicon.jpg`, the real logo image, via Pillow), and `robots.txt`
(`Allow: /`, with a placeholder `Sitemap:` line).

### `main.jsx` — routes + app shell

Wraps everything in `BrowserRouter` → `AuthProvider` → a fixed
`app-shell`/`app-main` layout (`TopNav` always on top; `main` fills the
rest of the viewport and is the one scrolling container). Routes:
`/` and `/login` are literal; `/:academicYear/:term` and
`/:academicYear/:term/:category` are the deep-linkable browsing routes
(`CalendarPage` reads whichever params are present); `*` is a catch-all to
`NotFoundPage` for anything else (a typo'd single-segment path, 4+
segments — a *valid-looking* but nonexistent 2-3 segment path still
matches the routes above and shows `CategoryCards`' own empty state, which
is already a graceful non-broken result, not this catch-all).

### `pages/`

- **`calendar.jsx`** — the single largest file in the frontend; composes
  almost every component below. Owns: `useAuth`, `useCalendarBrowser` (the
  sidebar/category discovery data), `useCalendarDraft` (the actual saved
  calendar + its mutations), local UI state (selected date for
  `DayEditor`, custom colors, PDF-export-in-progress flag, whether the
  generate form is expanded). Sets a per-route `document.title` via
  `useDocumentTitle` (e.g. `"2026-2027 · Term I · UG Calendar | MIT Academy
  of Engineering"`). Renders, in order depending on what's selected:
  nothing selected → `HomePage`; a term but no category → `CategoryCards`;
  a category, still fetching → `CalendarSkeleton`; fetched but no document
  → `EmptyCalendarState`; a real draft → the full document tree
  (`DocumentHeader` → `TodayStatus` → `CalendarView` → `InfoStrip` → issues
  list → `MilestoneSheet` → `SignatureBlock`+`DocFooter` (PDF-only) →
  `ContactInfo`, plus `DayEditor` as a modal when a date's selected). The
  admin header (Undo/Export/Delete), the Generate button/form, and
  `ColorSettings`/`AddEventForm` in the side panel are all admin- and/or
  draft-conditional.
- **`login.jsx`** — a split-panel screen (navy gradient brand side + white
  form side), password show/hide toggle, calls `useAuth().login()`.
- **`notFound.jsx`** — the `*` route's target; a simple centered "404 /
  Page Not Found / Back to Home" card.

### `app/` — hooks, context, and every component

**Top-level hooks/context:**

- **`AuthContext.jsx`** — the only global state: a JWT in `localStorage`
  (`calendar_admin_token`). `login(password)` distinguishes an actual `401`
  ("Incorrect password") from a network failure ("Could not reach the
  server...") from any other status (shows the raw status + body) — fixed
  this session; it used to hardcode "Incorrect password" for every kind of
  failure. `isAdmin` is just `!!token` — no expiry check on the client side
  (an expired token simply gets rejected by `require_admin` on the next
  mutating request, surfaced through the normal error-banner path).
- **`useCalendarApi.js`** — the shared `fetch` wrapper (`getJSON`/`postJSON`/
  `deleteJSON`), attaches the bearer token when one exists. Exports
  `parseErrorMessage` (tested directly in `useCalendarApi.test.js`): parses
  FastAPI's `{"detail": "..."}` JSON error bodies instead of showing the
  raw JSON string, falling back to raw text for non-JSON bodies. Wraps
  `fetch` itself in `safeFetch` so a total network failure becomes "Could
  not reach the server..." instead of a raw browser message like "Failed
  to fetch." Both fixed this session — previously, every error banner in
  the app showed literal `{"detail":"..."}` text.
- **`useCalendarBrowser.js`** — owns the sidebar/category discovery data:
  `academicYears` (fetched once), `termsByYear`/`categoriesByTerm` (fetched
  lazily and cached per key). A failed fetch is tracked in a *separate*
  error map (`yearsError`/`termsErrorByYear`/`categoriesErrorByTerm`)
  instead of being silently cached as an empty list — fixed this session,
  since before, a backend outage looked identical to "this year genuinely
  has no terms yet." Also owns the admin-only `addYear`/`removeYear`/
  `addTerm`/`removeTerm` mutations backing the sidebar's "+"/"×" UI —
  errors from these (e.g. "still has calendars saved under it") are
  deliberately left to propagate rather than captured in a global error
  state, so `Sidebar.jsx` can show them next to the specific row the admin
  acted on.
- **`useCalendarDraft.js`** — owns `draft`/`history`/`fetching`/`error` for
  whatever `{academicYear, term, category}` selection is currently active;
  re-fetches whenever any of the three changes. Composes
  `useCalendarMutations` for the actual edit operations. `handleUndo` pops
  the history stack and re-`POST`s `/calendar/save` to keep the DB in sync.
  `handleDelete` confirms via `window.confirm` before calling `DELETE`.
- **`useCalendarMutations.js`** — the generate/mark/unmark/reschedule/
  add-event/publish/unpublish mutations, all sharing one
  `loading`/`error`/try-catch-finally skeleton (`runMutation`).
  `handlePublish`/`handleUnpublish` `POST` to `/calendar/{year}/{term}/
  {category}/publish` or `.../unpublish` for whatever draft is currently
  loaded.
- **`useDocumentTitle.js`** — one-line hook: `useEffect(() =>
  {document.title = title}, [title])`. Added this session so every route
  has an accurate tab title instead of one static string everywhere.

**`app/components/`, split into 9 folders by concern:**

- **`icons/`** — `ChevronIcon.jsx`, `EditIcon.jsx`, `CategoryIcon.jsx`
  (keyword-matched per-category glyph: graduation cap for UG, ribbon for
  PG, sprout for FY, generic calendar icon otherwise — never gates which
  categories render). All inline SVG, not Unicode glyphs, so nothing risks
  tofu-rendering on a system missing a specific character.
- **`shared/`** — cross-cutting utility modules, plus one generic component:
  - `dateUtils.js` — `parseISO`/`formatISO` (local-time, not UTC — a
    recurring source of off-by-one bugs elsewhere if bypassed),
    `isInRange`, `formatDisplay`/`formatRange`, `monthsBetween`,
    `countInstructionalDays` (mirrors the backend's version),
    `countWeeks`, `daysUntil` (added this session for the "Today" status
    banner), `isNextDay`, `groupConsecutive` (merges consecutive
    same-named single-day entries into one range — e.g. nine daily
    "Diwali" holiday rows become one 7-15 Nov range). Covered by
    `dateUtils.test.js` (30 tests).
  - `categoryFamilies.js` — `FAMILIES` (every event category grouped into
    ~8 colorable families), `familyKeyForCategory`, `BACKGROUND_FAMILIES`
    (Value Addition/AMCAT/Academic Audit/etc. — run concurrently with
    everything else, never "the" thing happening on a given day),
    `HOLIDAY_FAMILY_OPTIONS`, `AGENDA_HIGHLIGHT_FAMILIES`,
    `COLORED_GRID_FAMILIES` (which families get a solid grid-cell fill vs.
    just an underline).
  - `colorUtils.js` — `DEFAULT_COLORS` (the pastel default per family) and
    `contrastText` (picks black/white text for readability against
    whatever color a coordinator picks).
  - `ConfirmModal.jsx` — a generic "are you sure?" popup for a destructive
    action (currently: deleting an academic year/term from the sidebar).
    Centered, icon-led layout (a danger-tinted warning triangle) distinct
    from `DayEditor`'s left-aligned form dialog, since it only ever asks a
    single yes/no question; reuses the same `.modal-overlay`/
    `.modal-content`/`.modal-actions` shell so every popup in the app
    animates consistently.
- **`browser/`** — the year/term/category navigation experience:
  - `Sidebar.jsx` — academic years (expandable to 2 terms, no further
    nesting), auto-expands on a direct deep-link visit. Shows a skeleton
    while loading, a "Couldn't load... [Retry]" state on error (added this
    session), or the real list. Admin-only: a "+" toggle opens an inline
    add-year form, each year/term row gets a "×" to remove it and missing
    terms get a "+ Add {term}" affordance — all three wired to
    `useCalendarBrowser.js`'s add/remove functions. Clicking "×" doesn't
    delete anything directly: it queues a `pendingDelete` and renders a
    `ConfirmModal` (see `shared/` below), so a year/term is only actually
    removed after an explicit "Yes, delete."
  - `CategoryCards.jsx` — one card per category for the selected term
    (never a hardcoded list), each with a `CategoryIcon`, hover-lift +
    shine-sweep animation. Also shows a "Couldn't load... [Retry]" state on
    error.
  - `EmptyCalendarState.jsx` — the literal "Calendar does not exist. Please
    check again after some time." message, in a designed card (icon badge +
    heading), shown on a real 404 for a specific (year, term, category).
  - `HomePage.jsx` — the "nothing selected yet" landing view: a gradient
    hero banner (drifting decorative orbs, a pulsing badge, staggered
    fade-in text) pointing the visitor at the sidebar.
  - `CalendarSkeleton.jsx` — a shimmering placeholder shaped like the real
    document (header bar + two rows of month-grid blocks + a key-dates
    bar), shown while a specific calendar is being fetched.
- **`layout/`** — `TopNav.jsx`: the MIT brand mark (now a `Link` to `/`,
  fixed this session), Admin Login/Log Out.
- **`calendar-grid/`** — the month-grid rendering:
  - `CalendarView.jsx` — lays out every month spanning the term (3 per
    row). Exports `fullRange(draft)` (also used internally): widens
    `[commencement, term_end]` to cover any out-of-range holiday/event,
    then caps it — Term I never spills into January, Term II (added this
    session, fixing a real bug) never spills into July — even though a
    trailing milestone with a date outside that range still lists
    correctly in the milestone sheet below. Covered by
    `CalendarView.test.js` (5 tests).
  - `MonthGrid.jsx` — renders one month's day cells; each cell's color
    family comes from `monthGridHelpers.familyFor`. Also marks today's cell
    (`day-cell-today`, an inset ring rather than a background fill, so it
    stays visible whether today is also a holiday/exam day or a plain one
    — added this session for the "Today" status feature).
  - `monthGridHelpers.js` — `familyFor(date, draft)` (priority: start/
    term_end marker → holiday → foreground event, excluding background
    families → outside-term → nothing) and `tooltipFor` (hover text
    listing everything on that date).
- **`milestones/`** — the key-dates table:
  - `MilestoneSheet.jsx` — three milestone columns + the red Holidays
    column, built by `milestoneColumns.buildMilestoneSheet`.
  - `milestoneColumns.js` — sorts every event into the right column
    (feedback/reviews/detention; the 4 core exam categories; everything
    else), keeps the 3 term-boundary meta rows pinned first, and exports
    `displayLabel` (appends `(COHORT)` only when the label doesn't already
    mention it) — reused by `document/todayStatus.js` this session.
  - `MilestoneColumn.jsx`/`MilestoneRow.jsx`/`HolidayColumn.jsx` — the
    actual row rendering, including `MilestoneRow`'s inline
    start/end/label editor (the UI for `reschedule-event`).
- **`document/`** — the printed/exported document chrome plus PDF export:
  - `DocumentHeader.jsx` — the MIT/Academy of Engineering brand block
    (typographic, no logo image asset in the printed document itself) +
    title + cohort subtitle.
  - `TodayStatus.jsx` + `todayStatus.js` — added this session. The pure
    logic (`getTodayStatus`) finds whatever holiday or foreground event is
    active "today" (real date by default, injectable for tests — see
    `todayStatus.test.js`, 8 tests), computing a "N days left"/"1 day
    left"/"ends today" label; the component renders it as a small pulsing
    on-screen-only banner, or nothing at all on a quiet day.
  - `InfoStrip.jsx` — the italic summary band (long-running programs,
    AMCAT windows, industry-practicum schedule, term totals) between the
    grids and the key-dates table; entirely data-driven, so Term II (a
    different program set) just shows fewer cells.
  - `SignatureBlock.jsx`/`DocFooter.jsx` — PDF/print-only approval chain +
    document-control footer (Format No., Rev. No./Date), matching the real
    published document exactly.
  - `ContactInfo.jsx` — the live-UI public-facing replacement for
    `SignatureBlock` (who to contact instead of an internal approval
    chain).
  - `exportPdf.js` — `exportElementAsPdf`: toggles `.print-compact`, measures
    natural content height to solve for a capture width matching an A4
    landscape page's aspect ratio, captures via `html2canvas` (scale 4, for
    print-quality DPI), builds the PDF via `jsPDF`, and draws a vector
    (not rasterized) year-band down the right edge. `html2canvas`/`jspdf`
    are dynamically `import()`-ed inside this function (fixed this
    session) so their ~590KB combined weight is a separate on-demand chunk,
    not part of the app's main bundle.
- **`admin/`** — every admin-only input surface:
  - `CoordinatorForm.jsx` — the "generate a calendar" form; its Category
    dropdown is fetched fresh per selected term (never hardcoded), and now
    shows a "Couldn't load categories... [Retry]" message on fetch failure
    (fixed this session) instead of silently looking empty.
  - `FormField.jsx` — the shared `<div className="field"><label/>...`
    wrapper.
  - `HolidayListInput.jsx`/`NonInstructionalDaysInput.jsx` — repeatable
    name+date(+end) rows for the upfront holiday/vacation lists; the
    holiday list pre-fills from `/calendar/holiday-defaults/{year}` (a
    failed pre-fill is non-fatal — logged to console, not shown as an
    error banner, since the coordinator can still type holidays by hand).
  - `AddEventForm.jsx` — create a brand-new event from scratch (the
    scheduler only ever produces its fixed milestone set).
  - `DayEditor.jsx` — the modal shown on clicking any day: mark/unmark a
    holiday, optionally as a range. Has `role="dialog"`/`aria-modal`/
    `aria-labelledby` (added this session).
  - `ColorSettings.jsx` — lets an admin recolor any family; applies live to
    both the grid and the agenda list since both read the same `colors`
    map.
  - `eventOptions.js` — `CATEGORY_OPTIONS` (grouped by family, for
    `AddEventForm`'s `<optgroup>`s) and `COHORTS`.
  - `PublishStatus.jsx` — the draft/publish status banner + actions,
    rendered only for an admin viewing a real draft. Reads `is_published`/
    `has_unpublished_changes`/`published_at` straight off the draft
    (computed server-side by `db._admin_view`, never client logic): a
    neutral badge + explanatory sentence, tinted as a warning when there
    are unpublished changes, with "Publish"/"Publish Changes" and/or
    "Unpublish" buttons shown only when applicable.

### `globals.css` + `styles/` — the design system, split by topic

`globals.css` used to be one 2337-line file; it's now just nine `@import`
lines, in the same order the rules used to appear in that one file (CSS
cascade ties resolve on load order, so re-ordering these would risk
changing which rule wins where two selectors have equal specificity —
don't reorder them without checking for that). No CSS-in-JS or modules,
just plain files under `client/src/styles/`:

- **`tokens.css`** — CSS custom properties (`--navy`, `--surface`,
  `--border`, `--shadow-sm/md/lg`, `--ease`, semantic colors like
  `--error-fg`/`--holiday-hint`), the shared `@keyframes` used everywhere
  (`fade-in-up`, `slide-down`, `skeleton-shimmer`), and the skeleton-loading
  shimmer classes.
- **`layout.css`** — the global reset, `app-shell`/`app-main`, the top nav,
  `page-frame`/`.container`.
- **`login.css`** — the login split-panel screen.
- **`sidebar.css`** — the year/term sidebar, including the admin add/remove
  UI (add-year form, per-row "×", "+ Add Term" affordances).
- **`browse.css`** — the homepage hero, category-page header, category
  cards, empty-calendar state, 404 page.
- **`chrome.css`** — small shared chrome: `.stack`, `.side-panel`,
  `.year-band`, `.app-header`, `.status-pill`.
- **`forms.css`** — `.card`, `form.card`, `.field`, `.btn` and its
  primary/secondary/danger variants.
- **`document.css`** — the largest file: the printed/exported document's
  own styling (header, today-status banner, publish-status banner, info
  strip, color-settings panel, the calendar grid including today's ring
  highlight, milestone sheet, repeatable holiday-list rows, signature
  block/footer, contact card) plus the shared modal shell
  (`.modal-overlay`/`.modal-content`/`.modal-actions`, used by both
  `DayEditor` and `ConfirmModal`) and `ConfirmModal`'s own centered,
  icon-led layout.
- **`print.css`** — `.print-compact` (shared by real browser printing and
  the "Export as PDF" html2canvas capture) and the `@media print` block.

Every animation is still a named `@keyframes` block reused by
`animation:` declarations rather than one-off inline styles, so the same
easing/timing language is consistent everywhere — that didn't change, only
which file each rule lives in. Verified byte-for-byte: a production build
of this split produces an identical bundled CSS output to a build of the
original single file, so the split is purely organizational.

### `client` test suite (Vitest, 86 tests across 5 files)

`dateUtils.test.js` (24), `CalendarView.test.js` (25, the Term I/II
month-cap regression coverage), `useCalendarApi.test.js` (4, the
error-message-parsing fix), `todayStatus.test.js` (8, the "Today" status
banner logic), `HolidayListInput.test.js` (25, `yearForTerm`/
`isInTermWindow`). The two 25-test files both use `it.each` to
parametrize across a 75-year spread (2024-2025 through 2099-2100) rather
than one hardcoded example year — this system is meant to keep working for
years/decades, so its own tests shouldn't quietly assume "the current
year" is load-bearing. Run via `npm test` (= `vitest run`) from `client/`.

---

## End-to-end pipeline walkthroughs

### 1. A visitor browses a calendar

1. `GET /` renders `CalendarPage` with no route params → `HomePage`.
2. Clicking a year in the sidebar → `Sidebar` calls
   `useCalendarBrowser.loadTerms(year)` → `GET
   /calendar/academic-years/{year}/terms` → `db.list_terms`.
3. Clicking a term → `navigate("/2026-2027/Term I")` → `CalendarPage`'s
   `useEffect` calls `browser.loadCategories("Term I")` → `GET
   /calendar/categories/Term I` → `db.list_categories` (reads the
   `calendar_categories` collection, not the calendars themselves — so a
   category can show as a clickable card *before* any document exists for
   it).
4. `CategoryCards` renders one card per category. Clicking one →
   `navigate("/2026-2027/Term I/UG Calendar")` → `useCalendarDraft`'s
   effect fires → `GET /calendar/2026-2027/Term I/UG Calendar` →
   `db.get_calendar`. Found → the full document renders. Not found →
   `EmptyCalendarState`.
5. `TodayStatus` runs `getTodayStatus(draft)` client-side against the
   fetched draft — no extra request.
6. "Export as PDF" → `exportPdf.js` dynamically imports `html2canvas` +
   `jspdf`, captures the DOM, builds the file — no server round-trip at
   all beyond the calendar fetch that already happened.

### 2. An admin generates a new calendar

1. Logs in → `POST /auth/login` → `auth.issue_token` → JWT stored in
   `localStorage`.
2. Fills `CoordinatorForm` (academic year, term, category, start date,
   3 exam durations, term weeks, holiday/non-instructional rows) → submits
   → `POST /calendar/plan` (bearer token attached).
3. `routes/calendars.py`'s `plan_calendar_endpoint` resolves a default
   start date if none given, calls `orchestrator.run_plan(...)`.
4. `run_plan`: `expand_holidays()` flattens the coordinator's ranges into
   one `Holiday` per day → `scheduler_agent.plan_calendar()` builds every
   event from the right template, runs the Mid-Sem→Practical→End-Sem→
   Project-Exams chain via `placement.py`'s functions (each anchored to the
   previous block's *actual* end), computes `teaching_end`/`term_end` →
   `_finalize()` clips holidays to the draft's actual span and validates
   via `rules_agent.validate()`.
5. `save_calendar_draft()` upserts into MongoDB keyed by
   `(academic_year, term, category)`.
6. The frontend receives the `CalendarDraft`, `updateDraft()`s it onto
   screen, refreshes the sidebar's years/categories (in case this created a
   brand-new year/term), and navigates to the new calendar's URL.

### 3. An admin marks a holiday

1. Clicks a day cell → `calendar.jsx` opens `DayEditor` with that date.
2. Fills in a name (+ optionally a color family, + optionally a range end)
   → "Create Event" → `handleMarkHoliday` → `POST /calendar/mark-holiday`
   with the *entire current calendar* round-tripped in the body (every
   mutating endpoint needs the full calendar, or anything not included
   would be silently wiped).
3. `holiday_agent.mark_holiday_range` expands the range into `Holiday`
   entries, dedupes against what's already marked, returns the updated
   calendar.
4. `routes/calendars.py` re-validates via `to_draft()`, saves, returns.
5. Frontend's `runMutation` (`useCalendarMutations.js`) replaces `draft`
   with the response and pushes the pre-change draft onto the undo stack.

### 4. An admin publishes a calendar

1. After generating/editing, `PublishStatus` shows a "Draft" badge and a
   "Publish" button (an already-published calendar with newer edits shows
   "Publish Changes" instead, tinted as a warning) — driven entirely by
   `is_published`/`has_unpublished_changes` on the current `draft`.
2. Clicking it → `handlePublish` → `POST
   /calendar/{academic_year}/{term}/{category}/publish` →
   `db.publish_calendar` copies the draft's current meta/events/holidays
   into a `published` sub-document with a fresh `published_at`.
3. The response (a fresh `_admin_view`) replaces `draft`; the badge flips to
   "Published" and the warning tint clears.
4. From this point, any *public* `GET` of the same
   `(academic_year, term, category)` returns that snapshot
   (`db._public_view`) — further admin edits keep landing on the draft and
   don't reach a public visitor until "Publish" is clicked again.
   "Unpublish" (shown whenever `is_published`) clears the `published`
   snapshot without touching the draft, via the mirror-image
   `/unpublish` endpoint.

---

## Other files in this directory

- **`server/readme.md`** (468 lines) — the canonical deep-dive on
  scheduling *policy*: exact day offsets, why each constraint exists,
  the full API reference table, auth/persistence details, and "known
  limitations"/"deliberately not built yet" sections. Read this alongside
  the "Backend" section above for the full picture.

## Known quirks worth knowing

- **Colors were briefly changed to a deep-teal palette, then reverted** —
  `--navy: #1f4e79` (and the matching `rgba(31, 78, 121, ...)` shadow
  tints) in `globals.css`, and `NAVY = [31, 78, 121]` in `exportPdf.js`,
  are both back to the original navy blue. If you see a stray teal hex
  code anywhere, it's leftover from that experiment and should match navy
  instead.
- **No SSR/prerendering.** The initial HTML is just an empty `<div
  id="root">` — a non-JS-executing crawler sees nothing. The
  description/OG/JSON-LD tags in `index.html` are static so link previews
  still work, but the calendar *content* itself isn't crawlable without a
  prerendering setup, which hasn't been built.
- **No numeric bounds on `PlanRequest`'s fields server-side** — `term_weeks`,
  `mid_sem_exam_days`, etc. are typed `int` in `schema.py` with no `gt=0`
  constraint; only the frontend form's `min="1"` guards against a
  zero/negative value. Low risk (only an authenticated admin can call this
  endpoint) but worth knowing if the API is ever called directly.
