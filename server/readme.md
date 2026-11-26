# Academic Calendar Automation -- Agent Service

An AI-agent-assisted backend for generating and maintaining MITAOE's institutional
academic calendar. A coordinator enters a handful of values (academic year, term,
start date, exam durations) and gets a full term calendar back -- every milestone
MITAOE's real calendars track, holidays, clash-checked exam scheduling -- instead of
hand-building one in a spreadsheet every semester. Built as a pipeline of narrow,
single-purpose "agents" (plain Python modules, no agent framework) composed by an
orchestrator, with a human coordinator staying in the loop for every decision: the
pipeline drafts, the rules agent flags problems, the coordinator approves or edits.

## Tech stack

| Layer          | Technology                                                        |
|----------------|--------------------------------------------------------------------|
| API            | FastAPI + Uvicorn                                                   |
| Schemas        | Pydantic                                                             |
| Auth           | PyJWT (HS256) -- one shared admin password, no user table            |
| Persistence    | MongoDB (`pymongo`), one document per (academic_year, term, category) |
| Config         | `python-dotenv` (`.env`)                                             |

No agent framework is used. "Agent" here means a module with one clear job in the
pipeline, wired together by plain function calls in `orchestrator.py`.

## Folder structure

```
calendar/server/
├── main.py                        -- FastAPI app: auth, calendar CRUD
├── requirements.txt
└── agent/
    ├── schema.py                   -- Pydantic request/response models
    ├── scheduler_agent/            -- minimal inputs -> full draft calendar
    │   ├── templates.py              -- the day-offset template (both terms use it)
    │   ├── date_helpers.py           -- weekend/exclusion date arithmetic
    │   └── placement.py              -- the dynamic exam-chain repositioning
    ├── holiday_agent/               -- holiday sourcing, defaults, edits
    │   └── data.py                   -- fixed + verified movable holiday tables
    ├── rules_agent.py               -- deterministic validation
    ├── rules_helpers.py             -- small helpers validate() relies on
    ├── event_agent.py               -- move/rename/add an event
    ├── orchestrator.py              -- wires the above together
    ├── auth.py                      -- admin login + require_admin
    └── db.py                        -- MongoDB persistence
```

Both `scheduler_agent` and `holiday_agent` are packages rather than single files
because each has more than one concern worth keeping visually separate (a
template vs. the logic that repositions events against it; a data table vs. the
functions that read it). Each keeps a `__init__.py` that re-exports its public
names, so `orchestrator.py` and every other caller still just does
`from .scheduler_agent import plan_calendar` -- splitting either package
further (or merging it back into one file) never touches an import anywhere
else.

## The agentic pipeline

```
Coordinator's minimal inputs (year, term, start date, 3 exam durations,
                               + a holiday/non-instructional-day list)
   |
   v
orchestrator.expand_holidays()   -- flattens the coordinator's list into
   |                                 per-day Holiday rows (deduped)
   v
scheduler_agent/     -- lays out every milestone from a day-offset template,
   |                     then repositions the core exam chain dynamically
   v
rules_agent.py       -- validates; returns issues alongside the draft
   |
   v
db.py                -- upserts the result, keyed by (academic_year, term)
```

Holidays are no longer a backend guess -- the coordinator supplies them (see
`holiday_agent/` and `orchestrator.py` below). This also fixes the previous
"movable holidays only verified for 2026" limitation: instead of the backend
silently guessing (or omitting) festival dates for other years, the coordinator
enters the real dates every time, for every year.

```
Existing draft + an edit (mark holiday / unmark holiday / move an event)
   |
   v
holiday_agent/ or event_agent.py   -- applies the one edit
   |
   v
orchestrator.to_draft()   -- re-validates via rules_agent.py
   |
   v
db.py   -- upserts the updated draft
```

Every mutating request above is gated by `auth.require_admin` (see
[Auth](#auth) below) before any agent runs.

### 1. `schema.py` -- the shared shape

Every agent reads/writes the same Pydantic models: `TermMeta` (year, term,
commencement/teaching-end/term-end), `CalendarEvent` (category, cohort, date range,
stable `id`), `Holiday` (date, name, color family, stable `id`), `NormalizedCalendar`
(the three combined), and `CalendarDraft` (a `NormalizedCalendar` plus `rules_agent`
findings). `HolidayInput` (name, start, optional end, family) is the separate,
range-shaped model a coordinator submits *before* generation -- `Holiday` is always a
single flattened day, `HolidayInput` can span a range (e.g. a Diwali week). Nothing
downstream cares how a draft was produced -- planned or hand-edited -- because it's
always this one shape.

### 2. `scheduler_agent/` -- building a term from minimal input

Turns `(term, start date, 3 exam durations, term length)` into a full draft: not just
the exam blocks, but every milestone type MITAOE's real calendars track (Student's
Feedback, per-cohort Project Reviews, Prototyping Phases, the Detention List, Value
Addition Program, AMCAT, Academic Audit, Industry Practicum Evaluations, Re-Exams,
...). Placement is a deterministic heuristic, not an LLM call: each milestone's
day-offset and duration were read directly off MITAOE's own published 2026-27 Term I
document (commencement Monday 27 Jul 2026, Format No. ACAD/DI/02) -- `TERM_TEMPLATE`
in `templates.py`. Term II now builds from this exact same template too, just from
its own commencement date -- both terms follow one identical milestone structure, not
two separate ones. The three coordinator-configurable blocks (mid-sem, practical,
theory) use whichever duration the coordinator entered. Value Addition Program
genuinely starts a week *before* commencement (a negative day-offset) -- that's real,
taken directly off the document, not a bug.

Every term follows the same fixed sequence -- Mid-Sem, then Final Detention +
Make-up/Remedial, then Practical Exam, then End-Semester (theory) Exam, then Project
Examinations -- each anchored to the previous block's *actual* end rather than a
template offset, so a shorter/longer coordinator-chosen duration (or a
coordinator-entered vacation) never leaves a stale gap behind. This repositioning
logic lives in `placement.py`; the shared weekend/exclusion date arithmetic it calls
lives in `date_helpers.py`. See [Scheduling constraints](#scheduling-constraints)
below for the full checklist; the short version:

- `_place_practical_after_mid_sem` starts the Practical Exam exactly 7 weeks after the
  latest Mid-Sem Exam's actual end, replacing the template's fixed offset -- which
  otherwise has no idea where Mid-Sem or a coordinator-entered vacation actually
  landed. A coordinator-flagged non-instructional block (e.g. a Diwali break) that the
  raw 7-week mark lands inside isn't routed around first -- the resulting start is
  pushed clear of both weekends (start only) and non-instructional days (the whole
  span) via `_finalize_gap_start`, which already carries it past the block. Verified
  against MITAOE's published 2026-27 Term I calendar: Mid-Sem ends 26 Sep, the raw
  7-week mark (14 Nov) falls inside the coordinator-entered 6-15 Nov break, and the
  weekend push alone lands Practical on 16 Nov -- exactly matching the document.
- `_place_detention_and_makeup_before_practical` places Final Detention on the *last
  instructional day* before Practical's actual start -- walking backward over Sundays
  and any coordinator-entered vacation in between (`_last_instructional_day_before`),
  not simply "1 day before". Make-up/Remedial Sessions keeps its template duration and
  ends on that same Final Detention day. Both anchor to Practical's real position
  instead of a fixed offset. Matches the published calendar exactly: Final Detention 5
  Nov, the coordinator-entered 6-15 Nov vacation in between, Practical starting 16 Nov.
- `_sequence_practical_and_theory` starts the End-Semester Exam the day after the
  Practical Exam's actual end, with the same weekend/non-instructional-day handling
  as Practical above.
- `_place_project_examinations` starts Project Examinations the day after the
  End-Semester Exam's actual end, one day per cohort (SY, TY, BTech in that order).
  Each cohort's day is its own full exam, so each individually (not just the block's
  start) must avoid a weekend or a non-instructional date
  (`_skip_weekend_and_exclusions_block`). The "day after" gaps for both this and the
  theory-exam step above are shared constants used by both terms -- both terms build
  from the exact same `TERM_TEMPLATE`, only the commencement date differs.
- `_place_mdm_practical` nests the MDM TY & B.Tech sub-slot inside the Practical Exam
  block's actual end dates (its final day).

Total term length is coordinator input (`term_weeks`, default 20 -- 2025-26 ran 21
weeks, 2026-27 runs 20), not a hardcoded constant, since it genuinely varies year to
year. Teaching end always follows wherever Final Detention actually landed (same rule
for both terms now), because the published calendar merges "Teaching End" and "Final
Detention List" into one date. `rules_agent.py`, not this package, is what catches it
if a chosen exam duration doesn't fit inside the coordinator's chosen term length.

### 3. `holiday_agent/` -- expansion, defaults, and post-generation edits

Holidays are coordinator input now (see `orchestrator.py` below), not a backend guess
-- `__init__.py` supports that instead of deciding it unilaterally, and `data.py`
holds the actual date tables it reads from:

- `data.py` -- `FIXED_HOLIDAYS` (national/state holidays that don't move year to
  year, safe to hardcode) and `VERIFIED_MOVABLE_HOLIDAYS` (lunar/religious festivals,
  keyed by year, added only once cross-checked against a real published institute
  calendar). Currently covers 2026 only, stitched together from two source documents:
  Jan-Jun from the 2025-26 Term II sheet, Jul-Dec from the 2026-27 Term I document.
- `expand_holiday_range(start, end, name, family) -> list[Holiday]` -- pure day-by-day
  expansion of one range into one `Holiday` per day. No dedup (callers own that, since
  the two callers need different rules).
- `suggested_holiday_defaults(year) -> list[HolidayInput]` -- pre-fill suggestions for
  the coordinator's form: fixed-date holidays with real computed dates, plus movable
  festivals only for years actually cross-checked against a real institute calendar
  (`VERIFIED_MOVABLE_HOLIDAYS`, 2026 only so far) -- never a guess for other years.
  Returned in native range form (a Diwali week stays one row).
- `mark_holiday_range` / `unmark_holiday` -- post-generation edits a coordinator
  triggers from the UI on an *existing* draft, unrelated to the upfront input above.
- `fetch_holidays(year)` -- the old auto-fetch, flattening `FIXED_HOLIDAYS` +
  `VERIFIED_MOVABLE_HOLIDAYS` (the same two sources `suggested_holiday_defaults`
  reads) into one deduped per-day list. No longer called automatically by the
  pipeline, but kept -- still correct, still a reasonable building block if a
  future feature needs a flat auto-fetch again.
- `default_odd_sem_start` -- last Monday of July, the default commencement date.

### 4. `rules_agent.py` -- deterministic validation

No LLM here -- this is the gate that catches the kind of mistake a human scheduler (or
a generative model) can make: exams landing on a holiday, a range ending before it
starts, too few instructional days, two exams double-booking the same students, a
Mid-Sem Exam starting less than 7 weeks after commencement, or a draft with no holidays
entered at all (a warning, not an error -- confirms an empty list was intentional
rather than an accidentally-skipped form). Runs identically regardless of how a draft
was produced (planned or hand-edited), because every mutating endpoint routes back
through `orchestrator.to_draft()` before returning. Cross-category exam overlaps are
flagged; a same-category sub-slot (MDM inside the broader Practical Exam window) is
exempted so it doesn't false-positive. The small standalone helpers `validate()` relies
on (`_cohorts_overlap`, `_ranges_overlap`, `count_instructional_days`) live in the
sibling `rules_helpers.py`, kept separate so this file stays focused on the rules
themselves rather than the arithmetic behind them.

### 5. `event_agent.py` -- moving, renaming, and adding events

Lets a coordinator drag/move a single scheduled event (a mid-sem, a project review,
anything) to new dates, and optionally rename it in the same call (`label=None` leaves
the existing one untouched). `add_event` creates a brand-new event from scratch (label,
category, cohort, dates) with a fresh id via the same `default_factory` mechanism every
scheduler-placed event and `Holiday` already use, appended the same way
`holiday_agent.mark_holiday_range` appends a new `Holiday`. Neither function
re-validates itself -- the caller always re-validates through the same `to_draft()`
path every other edit uses, so a moved/renamed/added event that now clashes with
something else is caught the same way it would be anywhere else.

### 6. `orchestrator.py` -- wiring it together

```python
def run_plan(academic_year, term, start, mid_sem_exam_days, end_sem_practical_days,
             end_sem_theory_days, holidays, term_weeks=20):
    flat_holidays = expand_holidays(holidays)              # coordinator's ranges -> per-day Holidays, deduped
    non_instructional = {h.date for h in flat_holidays if h.family == "non_instructional"}
    draft = plan_calendar(..., non_instructional, term_weeks)  # scheduler_agent
    return _finalize(draft, flat_holidays)                  # attach the coordinator's holidays + validate

def to_draft(cal) -> CalendarDraft:
    return CalendarDraft(..., issues=validate(cal))   # shared by every edit endpoint
```

`expand_holidays()` is the one place that turns a coordinator's `HolidayInput` ranges
into a flat, deduped `list[Holiday]` -- deduped on `(date, name)` across the *whole*
list, so an overlapping range and an individually-added day don't produce a duplicate
row.

### 7. `auth.py` -- who's allowed to write

There's exactly one privileged role (admin), so a single shared password checked
against `ADMIN_PASSWORD` is enough -- no user table. `issue_token()` verifies the
password and returns a signed JWT (`role=admin`, 24h expiry); `require_admin()` is the
FastAPI dependency every mutating route depends on. Viewers hit the same API with no
token and can read (`GET`) but not write.

### 8. `db.py` -- persistence

A calendar is uniquely identified by `(academic_year, term, category)`, keyed via
`_key()`, a 3-field Mongo filter dict -- so every save **upserts**
(`update_one(..., {"$set": document}, upsert=True)`) into a single live document in
MongoDB's `calendars` collection, instead of accumulating duplicate copies. Connection
is lazy and optional: if `MONGODB_URI` isn't set, saves/reads are silently skipped
rather than crashing the API. Exposes `save_calendar_draft`, `get_calendar`,
`delete_calendar`.

## Scheduling constraints

Every rule currently implemented, in the order it applies. **Structural** means the
scheduler physically can't produce a draft that violates it; **validated** means
`rules_agent.py` flags it as an issue on the draft (so a manual reschedule, or a future
change, can still be caught). Use this as the spec to verify against and extend --
add a row here whenever you add or change a rule.

- [x] **Structural** -- Term length is coordinator input (`term_weeks`, default 20)
  rather than a hardcoded constant, since it genuinely varies year to year (2025-26
  ran 21 weeks, 2026-27 runs 20). Teaching end always follows wherever Final Detention
  actually lands (see below), matching the published calendar's merged "Teaching End /
  Final Detention" entry -- the same rule for both terms.
- [x] **Structural** -- Mid-Sem Exam is placed at a fixed day-offset from commencement
  per template, one combined block for all cohorts, same for both terms; duration is
  the coordinator's `mid_sem_exam_days`.
- [x] **Validated** -- Mid-Sem Exam must start at least 7 weeks (49 days) after
  commencement (`MIN_WEEKS_TO_MID_SEM`). Today's templates already satisfy this by
  construction (offsets of 56/63 days); the check exists for a manual reschedule or
  future template drift.
- [x] **Structural** -- Practical Exam starts exactly 7 weeks after the *latest*
  Mid-Sem Exam ends (`_MID_SEM_TO_PRACTICAL_WEEKS`). A coordinator-flagged
  non-instructional block the raw 7-week mark lands inside isn't routed around first --
  the weekend/exclusion push below already carries the start past it.
- [x] **Structural** -- Nothing is scheduled on a non-instructional day: Practical
  Exam's start can't be a Saturday/Sunday, and no day across its *entire* span can be a
  coordinator-flagged non-instructional date.
- [x] **Structural** -- Final Detention lands on the last instructional
  day before Practical Exam's actual start, walking backward over Sundays and any
  coordinator-entered vacation in between -- not simply "1 day before".
- [x] **Structural** -- Make-up/Remedial Sessions ends the same day as
  Final Detention, running backward for its configured duration.
- [x] **Validated** -- Final Detention must be scheduled before Practical Exam starts.
  Guaranteed true by construction now; kept as a safety net (e.g. if Final Detention is
  manually rescheduled after the fact via `/calendar/reschedule-event`).
- [x] **Structural** -- End-Semester (Theory) Exam starts the day after Practical
  Exam's actual end, with the same weekend-start/non-instructional-span handling as
  Practical.
- [x] **Structural** -- Project Examinations start the day after End-Semester Exam's
  actual end, one calendar day per cohort. Each individual day (not just the block's
  start) must avoid landing on a weekend or a non-instructional date.
- [x] **Structural** -- MDM TY & B.Tech Practical Exam is a single day on the
  Practical Exam block's actual final day, matching the published calendar and
  incapable of drifting outside the coordinator-configured window.
- [x] **Structural** -- "Commencement of Term Next Academic Year" is a fixed
  day-offset in the template (161 days from commencement), same as every other
  milestone -- no longer computed dynamically per term.
- [x] **Validated** -- No exam (Mid-Sem/End-Sem/Practical) may *start* on a date in the
  holidays list. This mostly guards `holiday`-family entries and manual reschedules now
  that Practical/End-Sem placement already avoids `non_instructional`-family dates by
  construction.
- [x] **Validated** -- No exam (Mid-Sem/End-Sem/Practical) may *end* after `term_end`.
  Only these three core blocks are checked -- Summer Internship, re-exams, and the
  later SLIP review slots are expected to run past `term_end` as part of the same
  academic-year cycle.
- [x] **Validated** -- No two different exam-like categories (Mid-Sem/End-Sem/
  Practical/Project Examination) with overlapping cohorts may have overlapping date
  ranges -- except a same-category pair (e.g. MDM nested inside the broader Practical
  Exam window), which is always an intentional nesting, not a clash.
- [x] **Validated** -- At least `MIN_INSTRUCTIONAL_DAYS` (80) instructional days
  (Mon-Sat minus every holiday, any family) between commencement and teaching_end --
  a warning, not a hard error.
- [x] **Validated** -- At least one holiday must be entered -- warns (doesn't block)
  if the holidays list is empty, so an accidentally-skipped form is visible instead of
  silently optimistic.

**Not currently enforced** (worth knowing before assuming it's covered):
- Milestones outside the Mid-Sem -> Practical -> End-Sem -> Project-Exam chain (Value
  Addition Program, Project Reviews, Academic Audit, AMCAT, ...) can freely overlap
  non-instructional days or holidays -- only the core exam chain avoids them.
- A coordinator-entered vacation long enough to push the exam chain past `term_end`
  produces a **validated** error (the "ends after term end" check above), not a
  structural prevention -- there's no automatic shortening of exam durations or
  extension of the term to compensate.

## Auth

One admin password, checked server-side on every write:

```
POST /auth/login {password}  ->  {token}          # JWT, 24h expiry
Authorization: Bearer <token>                       # on every mutating request after that
```

`GET`/read endpoints need no token -- anyone can view the published calendar.
`POST`/`DELETE` endpoints all depend on `require_admin`; a missing or invalid token
gets a 401, a token without `role=admin` gets a 403. There's no per-user table --
whoever has the shared `ADMIN_PASSWORD` (in `.env`) is admin.

## Persistence

Calendars live in MongoDB, one document per `(academic_year, term, category)`:

```
academic_calendar (db)
  └── calendars (collection)
        { meta: {...}, events: [...], holidays: [...], issues: [...], saved_at: "...",
          day_color_overrides: {...}, published: null | {...} }
```

Every admin write (plan, mark/unmark holiday, reschedule, or the generic
`/calendar/save` used to persist an undo) re-upserts the same document (matched by
`_key()`'s `meta.academic_year`/`meta.term`/`meta.category` filter), so the
collection never accumulates duplicate history for one year/term/category -- it's a
live document, not a log. If `MONGODB_URI` isn't set, the API still runs; persistence
is just silently skipped.

## API

| Method | Path                              | Auth  | Purpose                                                        |
|--------|------------------------------------|-------|-------------------------------------------------------------------|
| GET    | `/health`                          | --    | Liveness check                                                    |
| POST   | `/auth/login`                      | --    | `{password}` -> `{token}`                                          |
| GET    | `/calendar/holiday-defaults/{year}`| --    | Suggested rows to pre-fill the holiday-input form (never a guess)   |
| GET    | `/calendar/{academic_year}/{term}` | --    | A specific saved calendar                                          |
| DELETE | `/calendar/{academic_year}/{term}` | admin | Delete a saved calendar                                            |
| POST   | `/calendar/save`                   | admin | Re-validate + persist a calendar as-is (used by the frontend's undo) |
| POST   | `/calendar/plan`                   | admin | Build + persist a first draft from minimal coordinator inputs (including holidays) |
| POST   | `/calendar/mark-holiday`           | admin | Mark a day/range as a holiday, re-validate, persist                |
| POST   | `/calendar/unmark-holiday`         | admin | Remove a holiday, re-validate, persist                              |
| POST   | `/calendar/reschedule-event`       | admin | Move (and optionally rename) an event, re-validate, persist        |
| POST   | `/calendar/add-event`              | admin | Create a brand-new event, re-validate, persist                     |

## Running locally

```bash
cd calendar/server
pip install -r requirements.txt
cp .env.example .env   # MONGODB_URI, MONGODB_DB_NAME, ALLOWED_ORIGINS, ADMIN_PASSWORD, JWT_SECRET
python -m uvicorn main:app --reload --port 8000
```

- `MONGODB_URI` -- optional; without it, the API runs statelessly (nothing persists
  across restarts) instead of crashing.
- `ADMIN_PASSWORD` / `JWT_SECRET` -- required for any write to succeed. Generate a
  `JWT_SECRET` with `python -c "import secrets; print(secrets.token_hex(32))"`.

## Tests

```bash
cd calendar/server
pip install -r requirements-dev.txt
python -m pytest tests/
```

Covers the pure date-arithmetic helpers in `scheduler_agent/date_helpers.py` --
weekend/exclusion skipping and event-building -- since every exam/milestone
placement in `placement.py` depends on that logic being correct.

## Known limitations

- **`/calendar/holiday-defaults` only suggests movable festivals for 2026.** For any
  other year, the pre-fill form only offers the 5 fixed-date holidays -- the
  coordinator has to enter Diwali/Eid/Holi/etc. dates themselves. `rules_agent` warns
  if a calendar ends up with zero holidays at all, but doesn't know whether a
  *partial* list (e.g. fixed-date only, no movable festivals) is complete.
- **No rate limiting on `/auth/login`.** The shared admin password has no brute-force
  protection.
- **No automated tests.** `rules_agent`'s clash logic and `scheduler_agent`'s
  date-offset sequencing and dynamic repositioning (`placement.py`) have no pytest
  coverage; everything has been verified manually against published calendars so far.

## Deliberately not built yet

- **A real holiday API.** Recommended path: Google's public "Holidays in India"
  calendar as an automated first pass, with manual confirmation for
  Maharashtra/institute-specific dates no public API tracks.
- **Cross-year / cross-term validation.** Term II's `term_commencement_next` marker
  isn't checked against an actual generated Term I calendar for the same academic year.
- **Historical import / roll-forward.** An earlier version of this service could
  normalize raw historical spreadsheet rows and shift a prior year's saved calendar
  forward to a new start date. Both were fully implemented but never wired to any UI,
  so they were removed rather than left as dead code -- reintroduce only alongside the
  frontend flow that would actually use them.
- **Per-user accounts.** One shared admin password is enough for a single
  coordinator role today; if multiple named admins or an audit trail are ever needed,
  that's a real user table + hashed passwords, not this.

## A note on data honesty

A few places in this project deliberately don't guess: movable-holiday dates are only
hardcoded where cross-checked against a real published calendar; the exported
signature block uses role labels instead of names that change yearly; the document
footer doesn't reuse the institute's real format/revision numbers. Where the
scheduler's day-offset templates are a heuristic fit to one sample year, that's noted
in `scheduler_agent/templates.py` directly -- they should be re-validated against each
new year's actual published calendar rather than trusted indefinitely.
