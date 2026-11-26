"""The sidebar's year/term/category structure -- suggested holiday
defaults, and every route for declaring/browsing academic years, terms,
and calendar categories.

Registered in main.py *before* routes.calendars: these literal-prefixed
paths (academic-years, categories) would otherwise be shadowed by
calendars.py's generic /calendar/{academic_year}/{term}/{category}
pattern, since FastAPI/Starlette matches routes in registration order,
not by specificity -- e.g. a request for
/calendar/academic-years/2026-2027/terms has the same segment count as
the generic pattern and would incorrectly match it first if that router
were included first.
"""
from fastapi import APIRouter, Depends, HTTPException

from agent.auth import optional_admin, require_admin
from agent.db import (
    add_academic_year,
    add_term,
    list_academic_years,
    list_categories,
    list_terms,
    remove_academic_year,
    remove_term,
)
from agent.holiday_agent import suggested_holiday_defaults
from agent.schema import AddAcademicYearRequest, AddTermRequest, HolidayInput

router = APIRouter()


@router.get("/calendar/holiday-defaults/{year}", response_model=list[HolidayInput])
def holiday_defaults(year: int):
    """Suggested rows to pre-fill the coordinator's holiday-input form --
    fixed-date holidays with real dates, movable festivals only for years
    we've actually verified. Never a guess; the coordinator edits/adds/
    removes from here before generating."""
    return suggested_holiday_defaults(year)


@router.get("/calendar/academic-years", response_model=list[str])
def academic_years(is_admin: bool = Depends(optional_admin)):
    """Every academic year with at least one saved calendar, newest first
    -- powers the sidebar's top level. An admin sees every year (including
    draft-only ones still being worked on); a public visitor only sees
    years with at least one *published* calendar."""
    return list_academic_years(admin=is_admin)


@router.get("/calendar/academic-years/{academic_year}/terms", response_model=list[str])
def terms_for_year(academic_year: str, is_admin: bool = Depends(optional_admin)):
    """The terms saved for a given academic year -- powers the sidebar's
    expanded-year list. Same admin/public distinction as academic_years()."""
    return list_terms(academic_year, admin=is_admin)


@router.post("/calendar/academic-years")
def add_academic_year_endpoint(req: AddAcademicYearRequest, _: None = Depends(require_admin)):
    """Explicitly add a new academic year to the sidebar -- optionally
    scoped to only some terms -- before any calendar exists for it."""
    add_academic_year(req.academic_year, req.terms)
    return {"status": "added"}


@router.delete("/calendar/academic-years/{academic_year}")
def remove_academic_year_endpoint(academic_year: str, _: None = Depends(require_admin)):
    """Removes a declared academic year from the sidebar -- refuses (409)
    if any real calendar still exists under it, so this can never
    silently orphan actual content."""
    ok, error = remove_academic_year(academic_year)
    if not ok:
        raise HTTPException(status_code=409, detail=error or "Could not remove this academic year")
    return {"status": "removed"}


@router.post("/calendar/academic-years/{academic_year}/terms")
def add_term_endpoint(academic_year: str, req: AddTermRequest, _: None = Depends(require_admin)):
    """Add a single term to a (possibly not-yet-declared) academic year."""
    ok, error = add_term(academic_year, req.term)
    if not ok:
        raise HTTPException(status_code=400, detail=error or "Could not add this term")
    return {"status": "added"}


@router.delete("/calendar/academic-years/{academic_year}/terms/{term}")
def remove_term_endpoint(academic_year: str, term: str, _: None = Depends(require_admin)):
    """Removes a term from a declared academic year -- refuses (409) if
    any real calendar still exists for that (year, term)."""
    ok, error = remove_term(academic_year, term)
    if not ok:
        raise HTTPException(status_code=409, detail=error or "Could not remove this term")
    return {"status": "removed"}


@router.get("/calendar/categories/{academic_year}/{term}", response_model=list[str])
def categories_for_term(academic_year: str, term: str, is_admin: bool = Depends(optional_admin)):
    """The calendar categories offered for a given (academic_year, term)
    (e.g. Term I -> UG/PG/FY Calendar) -- sourced from the
    calendar_categories collection, not hardcoded, so a new category can be
    added without a code change. Same admin/public distinction as
    academic_years()/terms_for_year(): a public visitor only sees
    categories with an actual published calendar for this specific year."""
    return list_categories(academic_year, term, admin=is_admin)
