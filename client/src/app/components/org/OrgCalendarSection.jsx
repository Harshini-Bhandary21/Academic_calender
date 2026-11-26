import { useState } from "react";
import { useAuth } from "../../AuthContext.jsx";
import { useOrgCalendarDraft } from "../../useOrgCalendarDraft.js";
import { useOrgCalendarHeader } from "../../useOrgCalendarHeader.js";
import { useOrgAncestry } from "../../useOrgAncestry.js";
import { buildAncestorBlockTitle } from "../../orgHeaderLabel.js";
import DocumentHeader from "../document/DocumentHeader.jsx";
import CalendarView from "../calendar-grid/CalendarView.jsx";
import InfoStrip from "../document/InfoStrip.jsx";
import MilestoneSheet from "../milestones/MilestoneSheet.jsx";
import OwnEventsSheet from "../milestones/OwnEventsSheet.jsx";
import ContactInfo from "../document/ContactInfo.jsx";
import ConfirmModal from "../shared/ConfirmModal.jsx";
import PublishStatus from "../admin/PublishStatus.jsx";
import { DEFAULT_COLORS } from "../shared/colorUtils.js";

const LEVEL_LABELS = { department: "department", cohort: "cohort", division: "division" };

// The org-unit coordinator's equivalent of CalendarPage's institute-admin
// view for a selected (academicYear, term, category). Reuses the exact
// same presentational document components the institute admin's view
// does (DocumentHeader/CalendarView/InfoStrip/MilestoneSheet/ContactInfo)
// -- only the data/mutations underneath differ (useOrgCalendarDraft,
// scoped to this org unit's own calendar via /org-calendar/*). Kept as its
// own component rather than branching deep inside pages/calendar.jsx, so
// the institute admin's already-tested flow there is never touched --
// CalendarPage just renders this instead of its own draft-rendering block
// when the logged-in visitor is an org unit (see calendar.jsx).
//
// Day-color-clash resolution (DayEditor, a per-date click) isn't wired up
// here yet -- out of scope for this pass, which covers add/reschedule/
// remove events & holidays, one-time copy, and publish/unpublish.
export default function OrgCalendarSection({ academicYear, term, category }) {
  const { orgLevel, orgId, orgName } = useAuth();
  const orgHeader = useOrgCalendarHeader(orgId, orgName, orgLevel);
  const {
    draft,
    fetching,
    error,
    copying,
    notCopiedYet,
    handleCopyFromParent,
    handlePublish,
    handleUnpublish,
    handleMarkHoliday,
    handleUnmarkHoliday,
    handleRemoveHoliday,
    handleReschedule,
    handleAddEvent,
    handleRemoveEvent,
    loading,
  } = useOrgCalendarDraft({ academicYear, term, category });

  const colors = DEFAULT_COLORS;
  const levelLabel = LEVEL_LABELS[orgLevel] || "your";
  // Whose calendar the one-time copy actually pulls from -- the immediate
  // parent in the *real* ancestry chain (chain[length-2], one step up from
  // this org unit itself), not just "the calendar published above", which
  // said nothing about who that actually was once you're more than one
  // level deep (a cohort copies its department's calendar, not the
  // institute's). null parent means this org unit is a department, whose
  // parent is the institute itself.
  const chain = useOrgAncestry(orgId);
  const parent = chain && chain.length > 1 ? chain[chain.length - 2] : null;
  const parentPossessive = parent ? `${parent.name}'s` : "the institute's";
  // The actual copy is permanent and can't be redone (plan.md §5.2) --
  // routed through the same ConfirmModal every other irreversible action
  // in this app uses (deleting a year/term/org unit), rather than firing
  // straight from the button click, so it gets the same deliberate pause.
  const [confirmingCopy, setConfirmingCopy] = useState(false);

  if (fetching) return <div className="skeleton skeleton-block skeleton-h-200" />;

  if (notCopiedYet) {
    return (
      <div className="card org-copy-prompt">
        <h2>Start editing your {levelLabel} calendar</h2>
        <p className="coordinator-form-context">
          Copy {parentPossessive} {academicYear} · {term} · {category} as your starting point. This is one-time -- but
          anything copied in stays synced automatically whenever {parentPossessive} calendar is next published, while
          anything you add yourself is always yours to edit or remove.
        </p>
        {error && <div className="error-banner no-print">{error}</div>}
        <button className="btn btn-primary org-copy-prompt-btn" onClick={() => setConfirmingCopy(true)} disabled={copying}>
          {copying ? "Copying..." : "Copy this calendar to start editing"}
        </button>
        {confirmingCopy && (
          <ConfirmModal
            variant="commit"
            title="Copy this calendar?"
            message={`This copies ${parentPossessive} published ${academicYear} · ${term} · ${category} into your own ${levelLabel} workspace as your starting point. The copy itself is permanent -- no re-copy or reverting later -- but whatever it brought in will keep updating automatically each time ${parentPossessive} calendar is republished. Anything you add yourself is unaffected either way.`}
            confirmLabel="Yes, copy it"
            onConfirm={() => {
              setConfirmingCopy(false);
              handleCopyFromParent();
            }}
            onCancel={() => setConfirmingCopy(false)}
          />
        )}
      </div>
    );
  }

  if (!draft) return error ? <div className="error-banner no-print">{error}</div> : null;

  // The milestone sheet used to show every ancestor's contributions mixed
  // into one flat list, one lock icon apart -- split here instead into the
  // institute-shaped sheet (only the institute's own events/holidays,
  // fully locked) plus one additional "{name} Calendar" block per ancestor
  // in the real chain (department, cohort, ..., this org unit itself),
  // each showing only what THAT specific level added -- see
  // CalendarEvent.owner_org_id/Holiday.owner_org_id, which (unlike origin,
  // which just says own-vs-inherited relative to whoever's looking) tracks
  // which org unit *originally* created an item, permanently, regardless
  // of how many further copies cascade it down. Only the block matching
  // this org unit's own id is ever editable; every other block -- the
  // institute's and every other ancestor's -- is read-only here, same as
  // the rest of this app's origin-based enforcement.
  // InfoStrip is left as-is (not split): the italic program-summary band
  // it renders is a different, narrower slice of events than the
  // milestone sheet's, and wasn't part of what was actually asked for here.
  const instituteDraft = {
    ...draft,
    events: draft.events.filter((e) => e.owner_org_id == null),
    holidays: draft.holidays.filter((h) => h.owner_org_id == null),
  };
  const ancestorChain = chain || [];

  return (
    <>
      {error && <div className="error-banner no-print">{error}</div>}
      <PublishStatus draft={draft} onPublish={handlePublish} onUnpublish={handleUnpublish} loading={loading} />
      <DocumentHeader term={draft.meta.term} orgHeader={orgHeader} />
      <CalendarView draft={draft} colors={colors} onSelectDay={() => {}} />
      <InfoStrip
        draft={draft}
        onReschedule={handleReschedule}
        onAddEvent={handleAddEvent}
        onRemoveEvent={handleRemoveEvent}
        canEdit
      />
      <MilestoneSheet
        draft={instituteDraft}
        colors={colors}
        onReschedule={handleReschedule}
        onAddEvent={handleAddEvent}
        onRemoveEvent={handleRemoveEvent}
        onMarkHoliday={handleMarkHoliday}
        onUnmarkHoliday={handleUnmarkHoliday}
        canEdit={false}
      />
      {ancestorChain.map((unit) => (
        <OwnEventsSheet
          key={unit.id}
          title={buildAncestorBlockTitle(unit)}
          events={draft.events.filter((e) => e.owner_org_id === unit.id)}
          holidays={draft.holidays.filter((h) => h.owner_org_id === unit.id)}
          colors={colors}
          onReschedule={handleReschedule}
          onAddEvent={handleAddEvent}
          onRemoveEvent={handleRemoveEvent}
          onMarkHoliday={handleMarkHoliday}
          onUnmarkHoliday={handleUnmarkHoliday}
          canEdit={unit.id === orgId}
        />
      ))}
      <ContactInfo />
    </>
  );
}
