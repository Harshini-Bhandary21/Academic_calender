import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import CoordinatorForm from "../app/components/admin/CoordinatorForm.jsx";
import DocumentHeader from "../app/components/document/DocumentHeader.jsx";
import TodayStatus from "../app/components/document/TodayStatus.jsx";
import InfoStrip from "../app/components/document/InfoStrip.jsx";
import CalendarView from "../app/components/calendar-grid/CalendarView.jsx";
import MilestoneSheet from "../app/components/milestones/MilestoneSheet.jsx";
import SignatureBlock from "../app/components/document/SignatureBlock.jsx";
import DocFooter from "../app/components/document/DocFooter.jsx";
import ContactInfo from "../app/components/document/ContactInfo.jsx";
import DayEditor from "../app/components/admin/DayEditor.jsx";
import PublishStatus from "../app/components/admin/PublishStatus.jsx";
import Sidebar from "../app/components/browser/Sidebar.jsx";
import CategoryCards from "../app/components/browser/CategoryCards.jsx";
import EmptyCalendarState from "../app/components/browser/EmptyCalendarState.jsx";
import HomePage from "../app/components/browser/HomePage.jsx";
import CalendarSkeleton from "../app/components/browser/CalendarSkeleton.jsx";
import OrgHierarchySection from "../app/components/org/OrgHierarchySection.jsx";
import OrgSelfLinkBanner from "../app/components/org/OrgSelfLinkBanner.jsx";
import GlobalBreadcrumb from "../app/components/org/GlobalBreadcrumb.jsx";
import { DEFAULT_COLORS } from "../app/components/shared/colorUtils.js";
import { colorCandidatesFor } from "../app/components/calendar-grid/monthGridHelpers.js";
import { parseISO } from "../app/components/shared/dateUtils.js";
import { exportElementAsPdf } from "../app/components/document/exportPdf.js";
import { useAuth } from "../app/AuthContext.jsx";
import { useCalendarDraft } from "../app/useCalendarDraft.js";
import { useCalendarBrowser } from "../app/useCalendarBrowser.js";
import { useDocumentTitle } from "../app/useDocumentTitle.js";
import { rememberVisitedCalendar } from "../app/lastVisitedCalendar.js";

const SITE_TITLE = "MIT Academy of Engineering";

// This page composes components/state around useCalendarDraft, which owns
// every backend call and mutation; everything under app/components/calendar
// is presentational and only receives data + callbacks. Navigation
// (Sidebar -> CategoryCards -> the calendar itself) lives in the URL --
// /:academicYear/:term/:category -- so every level is a real, shareable,
// deep-linkable route (see main.jsx's route definitions) rather than
// component-local state.
export default function CalendarPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const params = useParams();
  const selectedYear = params.academicYear ?? null;
  const selectedTerm = params.term ?? null;
  const selectedCategory = params.category ?? null;
  // The trailing department/cohort/division drill-down path, if any (e.g.
  // "dept-1/cohort-3" -> ["dept-1", "cohort-3"]) -- see main.jsx's splat
  // route. Empty means "just the institute's own calendar", same as before
  // this hierarchy existed.
  const orgPath = params["*"] ? params["*"].split("/").filter(Boolean) : [];
  const browser = useCalendarBrowser();

  const {
    draft,
    history,
    loading,
    fetching,
    error,
    setError,
    handleUndo,
    handleDelete,
    handleGenerate,
    handleMarkHoliday,
    handleUnmarkHoliday,
    handleRemoveHoliday,
    handleReschedule,
    handleAddEvent,
    handleRemoveEvent,
    handleSetDayColor,
    handlePublish,
    handleUnpublish,
  } = useCalendarDraft({ academicYear: selectedYear, term: selectedTerm, category: selectedCategory });

  // Reflects whatever's actually on screen in the tab/history title --
  // e.g. "2026-2027 · Term I · UG Calendar" once a real calendar is open --
  // instead of one static title for every route.
  useDocumentTitle(
    selectedCategory
      ? `${selectedYear} · ${selectedTerm} · ${selectedCategory} | ${SITE_TITLE}`
      : selectedTerm
      ? `${selectedYear} · ${selectedTerm} | ${SITE_TITLE}`
      : `Academic Calendar | ${SITE_TITLE}`
  );

  const [selectedDate, setSelectedDate] = useState(null);
  // No longer admin-customizable (see removed ColorSettings) -- color
  // choice happens per-event at creation time instead (MilestoneColumn's
  // "+ Add Event" swatch/custom-color picker).
  const colors = DEFAULT_COLORS;
  // Off by default so the document reads clean on open -- the inline +/×
  // add/remove controls in InfoStrip/MilestoneSheet only render once an
  // admin explicitly turns editing on, rather than always cluttering the
  // view just because they're logged in.
  const [isEditMode, setIsEditMode] = useState(false);
  const [exporting, setExporting] = useState(false);
  // The full generate form only needs to be open when nothing's been
  // generated anywhere yet -- once at least one calendar exists, collapse
  // it behind a single button so an admin isn't staring at a big form
  // every visit.
  const [showGenerateForm, setShowGenerateForm] = useState(false);
  const containerRef = useRef(null);

  // Categories depend on both the year and the term (a public visitor only
  // sees categories actually published for *this* year), and need loading
  // whenever either shows up in the URL -- not just when clicked from the
  // sidebar -- so a direct visit to /:year/:term (a shared link, or a
  // refresh) still populates the category cards correctly.
  useEffect(() => {
    if (selectedYear && selectedTerm) browser.loadCategories(selectedYear, selectedTerm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, selectedTerm]);

  // Powers the /manage dashboard's "Go to my calendar" shortcut, which has
  // no (academicYear, term, category) of its own to build a link with --
  // see lastVisitedCalendar.js.
  useEffect(() => {
    if (selectedYear && selectedTerm && selectedCategory) {
      rememberVisitedCalendar(selectedYear, selectedTerm, selectedCategory);
    }
  }, [selectedYear, selectedTerm, selectedCategory]);

  function handleSelectTerm(year, term) {
    navigate(`/${encodeURIComponent(year)}/${encodeURIComponent(term)}`);
  }

  function handleSelectCategory(category) {
    navigate(`/${encodeURIComponent(selectedYear)}/${encodeURIComponent(selectedTerm)}/${encodeURIComponent(category)}`);
  }

  async function handleGenerateAndCollapse(values) {
    await handleGenerate(values);
    setShowGenerateForm(false);
    // Show the calendar just generated instead of leaving the admin on
    // whatever they were previously looking at, and refresh the sidebar in
    // case this created a brand-new academic year/term.
    browser.loadCategories(values.academic_year, values.term);
    browser.refreshYears();
    navigate(
      `/${encodeURIComponent(values.academic_year)}/${encodeURIComponent(values.term)}/${encodeURIComponent(values.category)}`
    );
  }

  // Native browser printing (Ctrl+P / the OS print dialog) still uses the
  // same .print-compact sizing as the "Export as PDF" button below --
  // beforeprint/afterprint is the one hook that fires for that path.
  useEffect(() => {
    function addCompact() {
      document.body.classList.add("print-compact", "print-native");
    }
    function removeCompact() {
      document.body.classList.remove("print-compact", "print-native");
    }
    window.addEventListener("beforeprint", addCompact);
    window.addEventListener("afterprint", removeCompact);
    return () => {
      window.removeEventListener("beforeprint", addCompact);
      window.removeEventListener("afterprint", removeCompact);
    };
  }, []);

  // Deliberately keyed off the URL's own (selectedYear/Term/Category), not
  // draft.meta.* -- draft here is always the *institute's* calendar, which
  // is a different (or absent) document once orgPath is non-empty (a
  // department/cohort/division page). containerRef always points at
  // whatever's actually on screen for the current URL regardless of
  // level, so this works unchanged for the institute and every hierarchy
  // level alike.
  async function handleExportPdf() {
    if (!containerRef.current) return;
    setExporting(true);
    try {
      await exportElementAsPdf(containerRef.current, {
        filename: `${selectedYear}-${selectedTerm}-${selectedCategory}-calendar.pdf`,
        academicYear: selectedYear,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  }

  const selectedHolidays = draft && selectedDate ? draft.holidays.filter((h) => h.date === selectedDate) : [];
  const selectedEvents =
    draft && selectedDate ? draft.events.filter((e) => e.start <= selectedDate && selectedDate <= e.end) : [];
  // Every distinct color actually present on this date (across its
  // holidays and whichever event would win the grid's color) -- 2+ means
  // there's a real clash to resolve; DayEditor only shows that picker then.
  const selectedColorCandidates = draft && selectedDate ? colorCandidatesFor(parseISO(selectedDate), draft, colors) : [];

  // A specific year/term/category is selected, the fetch finished, and
  // there's genuinely nothing there yet. For an admin this is the one
  // moment the whole page should just be a single "Generate Calendar"
  // card pre-filled for this exact slot -- not that card *plus* a
  // separate "Generate Other Calendar" button *plus* a passive "doesn't
  // exist" message, which used to all show at once.
  const viewingEmptySlot = Boolean(selectedCategory) && !fetching && !draft;

  return (
    <div className="page-frame">
      <Sidebar
        academicYears={browser.academicYears}
        loadingYears={browser.loadingYears}
        yearsError={browser.yearsError}
        onRetryYears={browser.refreshYears}
        termsByYear={browser.termsByYear}
        termsErrorByYear={browser.termsErrorByYear}
        onExpandYear={browser.loadTerms}
        selectedYear={selectedYear}
        selectedTerm={selectedTerm}
        onSelectTerm={handleSelectTerm}
        isAdmin={isAdmin}
        onAddYear={browser.addYear}
        onRemoveYear={browser.removeYear}
        onAddTerm={browser.addTerm}
        onRemoveTerm={browser.removeTerm}
      />

      <div className="container" ref={containerRef}>
        <GlobalBreadcrumb academicYear={selectedYear} term={selectedTerm} category={selectedCategory} orgPath={orgPath} />

        {selectedCategory && (
          <OrgSelfLinkBanner academicYear={selectedYear} term={selectedTerm} category={selectedCategory} orgPath={orgPath} />
        )}

        {isAdmin && selectedCategory && orgPath.length === 0 && (
          <header className="app-header no-print">
            <div>
              <h1>Institutional Academic Calendar</h1>
              <div className="sub">Generate a term calendar from a few inputs, then adjust holidays as needed.</div>
            </div>
            <div className="header-actions">
              {draft && (
                <button
                  className={`btn ${isEditMode ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setIsEditMode((v) => !v)}
                >
                  {isEditMode ? "View Calendar" : "Edit Calendar"}
                </button>
              )}
              <button className="btn btn-secondary" onClick={handleUndo} disabled={history.length === 0}>
                Undo
              </button>
              {draft && (
                <button className="btn btn-secondary" onClick={handleExportPdf} disabled={exporting}>
                  {exporting ? "Exporting..." : "Export as PDF"}
                </button>
              )}
              {draft && (
                <button className="btn btn-danger" onClick={handleDelete}>
                  Delete Calendar
                </button>
              )}
            </div>
          </header>
        )}

        {/* The generate button/form only makes sense while an admin is
            actually looking at an existing calendar -- not on the landing
            page, the sidebar-prompt, or the category-cards screens, where
            it read as a stray control with nothing to attach to, and not
            when viewing an empty slot, which gets its own single
            pre-filled generate card below instead. Bootstrapping the very
            first calendar ever (zero academic years in the DB) doesn't
            need a special case here -- the sidebar's own "+" add-year
            control works from zero, and add year -> add term -> pick a
            category card lands on that same empty-slot generate card. */}
        {/* Shared row (built by OrgHierarchySection itself, see
            toolbarLeft): the admin's generate-controls (or, for a public
            visitor, "Export as PDF" -- admins already have that in their
            full toolbar above) on the left, the "browse departments"
            hierarchy trigger pinned to the right -- paired in one row
            instead of separate floating controls stacked above/below the
            institute calendar header. */}
        {selectedCategory && !fetching && orgPath.length === 0 && (
          <OrgHierarchySection
            academicYear={selectedYear}
            term={selectedTerm}
            category={selectedCategory}
            orgPath={orgPath}
            toolbarLeft={
              <>
                {isAdmin &&
                  !viewingEmptySlot &&
                  (browser.academicYears.length > 0 && !showGenerateForm ? (
                    <button className="btn btn-secondary" onClick={() => setShowGenerateForm(true)}>
                      Generate Other Calendar
                    </button>
                  ) : (
                    <CoordinatorForm onGenerate={handleGenerateAndCollapse} loading={loading} />
                  ))}
                {!isAdmin && draft && (
                  <button className="btn btn-secondary" onClick={handleExportPdf} disabled={exporting}>
                    {exporting ? "Exporting..." : "Export as PDF"}
                  </button>
                )}
              </>
            }
          />
        )}

        {error && <div className="error-banner no-print">{error}</div>}

        {!selectedTerm && <HomePage />}

        {selectedTerm && !selectedCategory && (
          <CategoryCards
            academicYear={selectedYear}
            term={selectedTerm}
            categories={browser.categoriesByTerm[selectedYear]?.[selectedTerm] || []}
            error={
              browser.categoriesByTerm[selectedYear]?.[selectedTerm]
                ? null
                : browser.categoriesErrorByTerm[selectedYear]?.[selectedTerm]
            }
            onRetry={() => browser.loadCategories(selectedYear, selectedTerm)}
            onSelectCategory={handleSelectCategory}
          />
        )}

        {selectedCategory && fetching && orgPath.length === 0 && <CalendarSkeleton />}

        {viewingEmptySlot && orgPath.length === 0 && (
          isAdmin ? (
            <CoordinatorForm
              onGenerate={handleGenerateAndCollapse}
              loading={loading}
              lockedContext={{ academic_year: selectedYear, term: selectedTerm, category: selectedCategory }}
            />
          ) : (
            <EmptyCalendarState />
          )
        )}

        {draft && orgPath.length === 0 && (
          <>
            {isAdmin && (
              <PublishStatus draft={draft} onPublish={handlePublish} onUnpublish={handleUnpublish} loading={loading} />
            )}
            <DocumentHeader term={draft.meta.term} />
            <TodayStatus draft={draft} />
            <CalendarView draft={draft} colors={colors} onSelectDay={(date) => isAdmin && setSelectedDate(date)} />
            <InfoStrip
              draft={draft}
              onReschedule={handleReschedule}
              onAddEvent={handleAddEvent}
              onRemoveEvent={handleRemoveEvent}
              canEdit={isAdmin && isEditMode}
            />

            {draft.issues.length > 0 && (
              <div className="issues-list no-print">
                {draft.issues.map((issue, i) => (
                  <div key={i} className={`issue issue-${issue.severity}`}>
                    {issue.message}
                  </div>
                ))}
              </div>
            )}

            <MilestoneSheet
              draft={draft}
              colors={colors}
              onReschedule={handleReschedule}
              onAddEvent={handleAddEvent}
              onRemoveEvent={handleRemoveEvent}
              onMarkHoliday={handleMarkHoliday}
              onUnmarkHoliday={handleUnmarkHoliday}
              canEdit={isAdmin && isEditMode}
            />

            {/* The official approval chain is admin/PDF-export-only -- a
                public viewer sees who to contact instead. */}
            <div className="pdf-only">
              <SignatureBlock />
              <DocFooter />
            </div>
            <ContactInfo />

            {isAdmin && selectedDate && (
              <DayEditor
                date={selectedDate}
                holidays={selectedHolidays}
                scheduledEvents={selectedEvents}
                colorCandidates={selectedColorCandidates}
                colors={colors}
                onMarkHoliday={(name, end, family, color) => {
                  handleMarkHoliday(selectedDate, end, name, family, color);
                }}
                onRemoveHoliday={(holidayId) => {
                  handleRemoveHoliday(holidayId);
                }}
                onSetDayColor={(color) => {
                  handleSetDayColor(selectedDate, color);
                }}
                onClose={() => setSelectedDate(null)}
              />
            )}
          </>
        )}

        {/* The department/cohort/division hierarchy -- mutually exclusive
            with the institute rendering above, not stacked underneath it:
            once the URL has drilled into an org node (orgPath non-empty),
            the institute's own calendar+edit-toolbar above is hidden
            entirely (all gated on orgPath.length === 0), so there is never
            a case where an institute admin's "Edit Calendar" controls sit
            visibly above a department's page and read as if they apply to
            it -- they never did (different document, different API), but
            showing both at once was genuinely confusing. The bare-
            institute-URL case (orgPath empty) is rendered separately,
            above instead of here -- see the orgPath.length === 0 render
            near the top of this container.
            "Export as PDF" (in the toolbarLeft slot, see
            OrgHierarchySection.jsx) applies to every hierarchy level, for
            whoever's looking (the owning coordinator via
            OrgCalendarSection, or any other viewer -- a parent, a public
            visitor, the institute admin -- via the read-only
            OrgCalendarViewer): department/cohort/division calendars had no
            export path at all before this, unlike the institute's own. */}
        {selectedCategory && !fetching && orgPath.length > 0 && (
          <OrgHierarchySection
            academicYear={selectedYear}
            term={selectedTerm}
            category={selectedCategory}
            orgPath={orgPath}
            toolbarLeft={
              <button className="btn btn-secondary" onClick={handleExportPdf} disabled={exporting}>
                {exporting ? "Exporting..." : "Export as PDF"}
              </button>
            }
          />
        )}
      </div>

      {draft ? (
        <div className="year-band">{draft.meta.academic_year}</div>
      ) : (
        selectedYear && <div className="year-band">{selectedYear}</div>
      )}
    </div>
  );
}
