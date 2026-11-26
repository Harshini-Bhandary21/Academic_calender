import { usePublicOrgCalendar } from "../../usePublicOrgCalendar.js";
import { useOrgCalendarHeader } from "../../useOrgCalendarHeader.js";
import { useOrgAncestry } from "../../useOrgAncestry.js";
import { buildAncestorBlockTitle } from "../../orgHeaderLabel.js";
import DocumentHeader from "../document/DocumentHeader.jsx";
import CalendarView from "../calendar-grid/CalendarView.jsx";
import InfoStrip from "../document/InfoStrip.jsx";
import MilestoneSheet from "../milestones/MilestoneSheet.jsx";
import OwnEventsSheet from "../milestones/OwnEventsSheet.jsx";
import ContactInfo from "../document/ContactInfo.jsx";
import { DEFAULT_COLORS } from "../shared/colorUtils.js";

const NOOP = () => {};

// Read-only rendering of a specific org unit's PUBLISHED calendar -- shown
// to anyone who isn't that exact org unit (a public visitor, the institute
// admin, a parent/sibling/child account browsing through). Reuses the same
// presentational document components as the editable OrgCalendarSection/
// institute view; every callback is a no-op and canEdit is always false,
// since there's nothing here for a non-owner to change.
//
// Same institute-grid + one-block-per-ancestor split as OrgCalendarSection
// (see that component's docstring for the full reasoning) -- a viewer here
// should see exactly the same "who added what" structure the owning org
// unit sees when editing, just with every block uniformly read-only
// instead of only some of them being locked.
export default function OrgCalendarViewer({ academicYear, term, category, orgId, name, level }) {
  const { draft, fetching, notPublished, error } = usePublicOrgCalendar({ academicYear, term, category, orgId });
  const orgHeader = useOrgCalendarHeader(orgId, name, level);
  const chain = useOrgAncestry(orgId);
  const colors = DEFAULT_COLORS;

  if (fetching) return <div className="skeleton skeleton-block skeleton-h-200" />;
  if (error) return <div className="error-banner no-print">{error}</div>;
  if (notPublished) {
    return (
      <div className="card">
        <h2>Nothing published yet</h2>
        <p>{name ? `${name} hasn't` : "This account hasn't"} published a calendar for this year, term, and category yet.</p>
      </div>
    );
  }
  if (!draft) return null;

  const instituteDraft = {
    ...draft,
    events: draft.events.filter((e) => e.owner_org_id == null),
    holidays: draft.holidays.filter((h) => h.owner_org_id == null),
  };
  const ancestorChain = chain || [];

  return (
    <>
      <DocumentHeader term={draft.meta.term} orgHeader={orgHeader} />
      <CalendarView draft={draft} colors={colors} onSelectDay={NOOP} />
      <InfoStrip draft={draft} onReschedule={NOOP} onAddEvent={NOOP} onRemoveEvent={NOOP} canEdit={false} />
      <MilestoneSheet
        draft={instituteDraft}
        colors={colors}
        onReschedule={NOOP}
        onAddEvent={NOOP}
        onRemoveEvent={NOOP}
        onMarkHoliday={NOOP}
        onUnmarkHoliday={NOOP}
        canEdit={false}
      />
      {ancestorChain.map((unit) => (
        <OwnEventsSheet
          key={unit.id}
          title={buildAncestorBlockTitle(unit)}
          events={draft.events.filter((e) => e.owner_org_id === unit.id)}
          holidays={draft.holidays.filter((h) => h.owner_org_id === unit.id)}
          colors={colors}
          onReschedule={NOOP}
          onAddEvent={NOOP}
          onRemoveEvent={NOOP}
          onMarkHoliday={NOOP}
          onUnmarkHoliday={NOOP}
          canEdit={false}
        />
      ))}
      <ContactInfo />
    </>
  );
}
