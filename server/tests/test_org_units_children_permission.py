"""Unit tests for routes/org_units.py's _is_children_owner -- the rule
deciding whether a caller sees every direct child of a node (regardless of
publish status) or only the published ones, powering the hierarchy
browser's GET .../children endpoint. Pure dict logic, no Mongo needed.
"""
from routes.org_units import _is_children_owner


def test_institute_admin_owns_the_top_level_department_list():
    identity = {"role": "admin", "org_id": None, "level": None}
    assert _is_children_owner(identity, None) is True


def test_institute_admin_owns_every_org_units_children_list():
    # Same blanket oversight the institute admin already gets from
    # GET /org-units (any parent_id, unrestricted) -- consistent full
    # visibility into the whole hierarchy, not just the top level.
    identity = {"role": "admin", "org_id": None, "level": None}
    assert _is_children_owner(identity, "dept-1") is True
    assert _is_children_owner(identity, "cohort-3") is True


def test_org_unit_owns_its_own_childrens_list():
    identity = {"role": "org", "org_id": "dept-1", "level": "department"}
    assert _is_children_owner(identity, "dept-1") is True


def test_org_unit_does_not_own_a_siblings_childrens_list():
    identity = {"role": "org", "org_id": "dept-2", "level": "department"}
    assert _is_children_owner(identity, "dept-1") is False


def test_org_unit_does_not_own_the_top_level_department_list():
    identity = {"role": "org", "org_id": "dept-1", "level": "department"}
    assert _is_children_owner(identity, None) is False


def test_public_visitor_never_owns_anything():
    identity = {"role": "public", "org_id": None, "level": None}
    assert _is_children_owner(identity, None) is False
    assert _is_children_owner(identity, "dept-1") is False
