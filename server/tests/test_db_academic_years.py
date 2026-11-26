"""Unit tests for db.py's _merge_years/_merge_terms -- the pure dedup/
ordering logic behind admin year/term management (add_academic_year,
add_term, and the union list_academic_years()/list_terms() do between
explicitly-declared years/terms and years/terms that already have a real
calendar). No live MongoDB connection needed.
"""
from agent.db import _merge_terms, _merge_years


def test_merge_years_unions_declared_and_existing_without_duplicates():
    declared = {"2027-2028", "2026-2027"}
    from_calendars = {"2026-2027", "2025-2026"}
    assert _merge_years(declared, from_calendars) == ["2027-2028", "2026-2027", "2025-2026"]


def test_merge_years_sorts_newest_first():
    assert _merge_years({"2024-2025"}, {"2099-2100", "2030-2031"}) == ["2099-2100", "2030-2031", "2024-2025"]


def test_merge_years_with_nothing_declared_yet():
    assert _merge_years(set(), {"2026-2027"}) == ["2026-2027"]


def test_merge_terms_unions_declared_and_existing():
    # Declared "Term II" ahead of any calendar existing for it; a real
    # calendar already exists for Term I.
    assert _merge_terms(["Term II"], {"Term I"}) == ["Term I", "Term II"]


def test_merge_terms_keeps_fixed_order_regardless_of_input_order():
    assert _merge_terms(["Term II", "Term I"], set()) == ["Term I", "Term II"]


def test_merge_terms_with_only_one_term_declared():
    assert _merge_terms(["Term I"], set()) == ["Term I"]


def test_merge_terms_ignores_unknown_terms():
    # _merge_terms only ever emits from the fixed Term I/Term II order --
    # anything else declared elsewhere (shouldn't happen given add_term's
    # own validation, but this is the safety net) is silently dropped
    # rather than corrupting the sidebar's term list.
    assert _merge_terms(["Term III"], {"Term I"}) == ["Term I"]
