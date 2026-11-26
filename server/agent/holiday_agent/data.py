"""Holiday date tables.

Religious/lunar holidays (Eid, Diwali, Ganesh Chaturthi, Mahashivratri...)
shift every year, so last year's dates can never be reused directly -- each
year's movable-festival dates are added here only once cross-checked
against a real institute document.
"""

# Fixed-date national/state holidays only -- safe to hardcode since they
# don't move year to year.
FIXED_HOLIDAYS = [
    (1, 26, "Republic Day"),
    (5, 1, "Maharashtra Din"),
    (8, 15, "Independence Day"),
    (10, 2, "Gandhi Jayanti"),
    (12, 25, "Christmas"),
]

# Movable-festival dates confirmed against MITAOE's own published calendars:
# Jan-Jun 2026 from the 2025-26 Term II sheet, Jul-Dec 2026 from the 2026-27
# Term I document (Format No. ACAD/DI/02) -- each cross-checked against the
# document itself, never guessed forward from a previous year. Add a year
# here only once it's been checked against a real institute document.
#
# Each entry is either a single day (month, day, name) or a range
# (start_month, start_day, end_month, end_day, name) -- some festivals (e.g.
# Diwali) are observed by the institute as a whole non-instructional week,
# not one day, so the range form exists to record that once verified.
VERIFIED_MOVABLE_HOLIDAYS = {
    2026: [
        (1, 26, "Republic Day"),
        (2, 15, "Mahashivratri"),
        (2, 19, "Chhatrapati Shivaji Maharaj Jayanti"),
        (3, 3, "Holi (Second Day)"),
        (3, 19, "Gudi Padwa"),
        (3, 21, "Ramzan-Eid"),
        (4, 14, "Dr. B. R. Ambedkar Jayanti"),
        (4, 26, "Ram Navami"),
        (5, 1, "Budha Pournima"),
        (5, 27, "Bakari-Eid"),
        (6, 26, "Moharram"),
        (8, 17, "Janmashtami"),
        (8, 26, "Eid-e-Milad"),
        (9, 7, "Bakri Eid (Id-ul-Adha)"),
        (9, 14, "Ganesh Chaturthi"),
        (9, 25, "Anant Chaturdashi"),
        (10, 20, "Dussehra (Vijayadashami)"),
        (11, 24, "Gurunanak Jayanti"),
    ],
}
