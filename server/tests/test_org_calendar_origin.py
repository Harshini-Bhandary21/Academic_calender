"""Unit tests for routes/org_units.py's origin-based enforcement -- the
rule stopping a department/cohort/division from editing or removing
anything it copied from its parent's calendar (see schema.py's
CalendarEvent.origin/Holiday.origin), while still allowing full add/edit/
delete on anything it added itself. All pure dict/date logic operating on
a plain "saved draft" shape -- no Mongo needed, same testing philosophy as
test_org_units_children_permission.py.
"""
from datetime import date

import pytest
from fastapi import HTTPException

from agent.schema import CalendarEvent, Holiday, NormalizedCalendar, TermMeta
from routes.org_units import (
    _assert_event_editable,
    _assert_holiday_editable,
    _assert_no_inherited_conflict,
    _assert_no_inherited_holiday_on,
    _reconcile_origin,
    _stamp_inherited,
)

_META = TermMeta(academic_year="2026-2027", term="Term I", commencement=date(2026, 7, 27), teaching_end=date(2026, 11, 5), term_end=date(2026, 12, 12))


def _saved(events=None, holidays=None):
    return {"events": events or [], "holidays": holidays or []}


def test_stamp_inherited_overrides_whatever_origin_was_already_there():
    # Mirrors copy-from-parent copying a *cohort's* calendar, which itself
    # mixes the cohort's own additions and things it inherited from its
    # department -- both must become "inherited" fresh for whoever copies
    # from the cohort next.
    items = [{"id": "a", "origin": "own"}, {"id": "b", "origin": "inherited"}, {"id": "c"}]
    stamped = _stamp_inherited(items)
    assert [i["origin"] for i in stamped] == ["inherited", "inherited", "inherited"]
    # Every other field is preserved untouched.
    assert [i["id"] for i in stamped] == ["a", "b", "c"]


def test_inherited_event_cannot_be_rescheduled_or_removed():
    saved = _saved(events=[{"id": "e1", "origin": "inherited"}])
    with pytest.raises(HTTPException) as exc:
        _assert_event_editable(saved, "e1")
    assert exc.value.status_code == 403


def test_own_event_can_be_rescheduled_or_removed():
    saved = _saved(events=[{"id": "e1", "origin": "own"}])
    _assert_event_editable(saved, "e1")  # no raise


def test_unknown_event_id_is_left_to_the_pure_functions_own_404():
    # Not this helper's job -- it only blocks a *found* inherited event; a
    # stale/unknown id passes through untouched, letting event_agent's own
    # ValueError -> 404 handling catch it as before.
    _assert_event_editable(_saved(events=[]), "nonexistent")  # no raise


def test_inherited_holiday_cannot_be_removed():
    saved = _saved(holidays=[{"id": "h1", "origin": "inherited"}])
    with pytest.raises(HTTPException) as exc:
        _assert_holiday_editable(saved, "h1")
    assert exc.value.status_code == 403


def test_own_holiday_can_be_removed():
    saved = _saved(holidays=[{"id": "h1", "origin": "own"}])
    _assert_holiday_editable(saved, "h1")  # no raise


def test_unmark_day_refused_if_any_coinciding_holiday_is_inherited():
    # Two holidays can coincide on one date (see holiday_agent's own
    # dedup-by-(date,name) reasoning) -- unmark-holiday clears the whole
    # date at once, so it's refused entirely rather than silently only
    # clearing the "own" one.
    saved = _saved(
        holidays=[
            {"id": "h1", "date": "2026-08-15", "origin": "inherited"},
            {"id": "h2", "date": "2026-08-15", "origin": "own"},
        ]
    )
    with pytest.raises(HTTPException) as exc:
        _assert_no_inherited_holiday_on(saved, date(2026, 8, 15))
    assert exc.value.status_code == 403


def test_unmark_day_allowed_when_everything_on_it_is_own():
    saved = _saved(holidays=[{"id": "h1", "date": "2026-08-15", "origin": "own"}])
    _assert_no_inherited_holiday_on(saved, date(2026, 8, 15))  # no raise


def test_unmark_day_unaffected_by_an_inherited_holiday_on_a_different_date():
    saved = _saved(holidays=[{"id": "h1", "date": "2026-08-16", "origin": "inherited"}])
    _assert_no_inherited_holiday_on(saved, date(2026, 8, 15))  # no raise


def test_mark_holiday_refused_when_it_would_recolor_an_inherited_holiday():
    # mark_holiday_range upserts (recolors) in place when the (date, name)
    # pair already exists -- refused since that's really an edit.
    saved = _saved(holidays=[{"date": "2026-08-15", "name": "Independence Day", "origin": "inherited"}])
    with pytest.raises(HTTPException) as exc:
        _assert_no_inherited_conflict(saved, date(2026, 8, 15), date(2026, 8, 15), "Independence Day")
    assert exc.value.status_code == 403


def test_mark_holiday_allowed_for_a_genuinely_new_name_on_that_date():
    saved = _saved(holidays=[{"date": "2026-08-15", "name": "Independence Day", "origin": "inherited"}])
    _assert_no_inherited_conflict(saved, date(2026, 8, 15), date(2026, 8, 15), "A Brand New Holiday")


def test_mark_holiday_allowed_when_recoloring_an_own_holiday():
    saved = _saved(holidays=[{"date": "2026-08-15", "name": "Some Own Holiday", "origin": "own"}])
    _assert_no_inherited_conflict(saved, date(2026, 8, 15), date(2026, 8, 15), "Some Own Holiday")


def test_mark_holiday_conflict_check_covers_every_day_in_the_range():
    saved = _saved(holidays=[{"date": "2026-11-10", "name": "Diwali Break", "origin": "inherited"}])
    with pytest.raises(HTTPException) as exc:
        _assert_no_inherited_conflict(saved, date(2026, 11, 6), date(2026, 11, 12), "Diwali Break")
    assert exc.value.status_code == 403


def _event(event_id, origin="own"):
    return CalendarEvent(id=event_id, category="custom", start=date(2026, 8, 1), end=date(2026, 8, 1), origin=origin)


def _holiday(holiday_id, origin="own"):
    return Holiday(id=holiday_id, date=date(2026, 8, 15), name="Test Holiday", origin=origin)


def test_reconcile_origin_restores_the_trusted_tag_even_if_the_client_claims_otherwise():
    # The exact bug this guards against: a client (a stale tab, or a
    # tampered request) submits an inherited event/holiday relabeled as
    # "own" -- reconcile must force it back to whatever the trusted saved
    # draft actually says, regardless of the incoming tag.
    saved = _saved(
        events=[{"id": "e1", "origin": "inherited", "owner_org_id": "dept-1"}],
        holidays=[{"id": "h1", "origin": "inherited", "owner_org_id": "dept-1"}],
    )
    calendar = NormalizedCalendar(meta=_META, events=[_event("e1", origin="own")], holidays=[_holiday("h1", origin="own")])
    _reconcile_origin(saved, calendar, "sy-cohort")
    assert calendar.events[0].origin == "inherited"
    assert calendar.holidays[0].origin == "inherited"
    # owner_org_id is provenance, not permission -- it stays "dept-1" (who
    # actually created it) regardless of who's currently viewing/mutating.
    assert calendar.events[0].owner_org_id == "dept-1"
    assert calendar.holidays[0].owner_org_id == "dept-1"


def test_reconcile_origin_leaves_a_genuinely_own_item_alone():
    saved = _saved(events=[{"id": "e1", "origin": "own", "owner_org_id": "sy-cohort"}])
    calendar = NormalizedCalendar(meta=_META, events=[_event("e1", origin="own")], holidays=[])
    _reconcile_origin(saved, calendar, "sy-cohort")
    assert calendar.events[0].origin == "own"
    assert calendar.events[0].owner_org_id == "sy-cohort"


def test_reconcile_origin_defaults_a_brand_new_item_to_own_and_stamps_the_current_org():
    # A freshly added event/holiday has no id in `saved` at all yet --
    # nothing but copy-from-parent is ever allowed to produce "inherited",
    # and whoever is making this call is -- by definition -- the one who
    # just created it.
    saved = _saved(events=[])
    calendar = NormalizedCalendar(meta=_META, events=[_event("new-id", origin="inherited")], holidays=[])
    _reconcile_origin(saved, calendar, "sy-cohort")
    assert calendar.events[0].origin == "own"
    assert calendar.events[0].owner_org_id == "sy-cohort"


def test_reconcile_origin_does_not_cross_contaminate_events_and_holidays():
    # An id collision between the events list and the holidays list (they're
    # independent id spaces) must not let one leak the other's origin.
    saved = _saved(
        events=[{"id": "shared-id", "origin": "inherited", "owner_org_id": "dept-1"}],
        holidays=[{"id": "shared-id", "origin": "own", "owner_org_id": "sy-cohort"}],
    )
    calendar = NormalizedCalendar(
        meta=_META, events=[_event("shared-id", origin="own")], holidays=[_holiday("shared-id", origin="inherited")]
    )
    _reconcile_origin(saved, calendar, "sy-cohort")
    assert calendar.events[0].origin == "inherited"
    assert calendar.events[0].owner_org_id == "dept-1"
    assert calendar.holidays[0].origin == "own"
    assert calendar.holidays[0].owner_org_id == "sy-cohort"


def test_stamp_inherited_preserves_owner_org_id_regardless_of_how_many_hops_it_cascaded():
    # A department's own event copied down to a cohort, then further to a
    # division, must still say "the department created this" at every hop
    # -- _stamp_inherited only ever touches `origin`, never `owner_org_id`.
    items = [{"id": "a", "origin": "own", "owner_org_id": "dept-1"}, {"id": "b", "origin": "inherited", "owner_org_id": None}]
    stamped = _stamp_inherited(items)
    assert [i["owner_org_id"] for i in stamped] == ["dept-1", None]
