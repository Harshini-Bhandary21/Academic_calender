import { useState } from "react";
import { useCalendarApi } from "./useCalendarApi.js";

// The org-unit equivalent of useCalendarMutations.js -- identical shape,
// pointed at /org-calendar/* instead of /calendar/*. `org_id` is never
// part of any request here: the backend derives it from the caller's own
// bearer token (require_org_unit()), so an org unit can only ever mutate
// its own calendar, never another's.
export function useOrgCalendarMutations(draft, updateDraft, setError) {
  const { postJSON } = useCalendarApi();
  const [loading, setLoading] = useState(false);

  function currentCalendar() {
    return { meta: draft.meta, events: draft.events, holidays: draft.holidays, day_color_overrides: draft.day_color_overrides };
  }

  async function runMutation(request) {
    setLoading(true);
    setError(null);
    try {
      updateDraft(await request());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleMarkHoliday(start, end, name, family = "holiday", color) {
    if (!draft) return;
    return runMutation(() =>
      postJSON("/org-calendar/mark-holiday", { calendar: currentCalendar(), start, end, name, family, color })
    );
  }

  function handleUnmarkHoliday(date) {
    if (!draft) return;
    return runMutation(() => postJSON("/org-calendar/unmark-holiday", { calendar: currentCalendar(), date }));
  }

  function handleRemoveHoliday(holidayId) {
    if (!draft) return;
    return runMutation(() => postJSON("/org-calendar/remove-holiday", { calendar: currentCalendar(), holiday_id: holidayId }));
  }

  function handleReschedule(eventId, start, end, label, color) {
    if (!draft) return;
    return runMutation(() =>
      postJSON("/org-calendar/reschedule-event", { calendar: currentCalendar(), event_id: eventId, start, end, label, color })
    );
  }

  function handleSetDayColor(date, color) {
    if (!draft) return;
    return runMutation(() => postJSON("/org-calendar/set-day-color", { calendar: currentCalendar(), date, color }));
  }

  function handleAddEvent(label, category, cohort, start, end, color) {
    if (!draft) return;
    return runMutation(() =>
      postJSON("/org-calendar/add-event", { calendar: currentCalendar(), label, category, cohort, start, end, color })
    );
  }

  function handleRemoveEvent(eventId) {
    if (!draft) return;
    return runMutation(() => postJSON("/org-calendar/remove-event", { calendar: currentCalendar(), event_id: eventId }));
  }

  return {
    loading,
    handleMarkHoliday,
    handleUnmarkHoliday,
    handleRemoveHoliday,
    handleReschedule,
    handleAddEvent,
    handleRemoveEvent,
    handleSetDayColor,
  };
}
