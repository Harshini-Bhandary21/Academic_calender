import { useState } from "react";
import { useCalendarApi } from "./useCalendarApi.js";

// The draft-editing mutations (generate/mark/unmark/reschedule) --
// split out of useCalendarDraft.js since they all share the same
// loading/error/try-catch-finally skeleton. useCalendarDraft.js owns
// `draft`/`history`/undo/delete and composes this hook for the rest.
export function useCalendarMutations(draft, updateDraft, setError) {
  const { postJSON } = useCalendarApi();
  const [loading, setLoading] = useState(false);

  // Every endpoint that edits an existing draft needs the full calendar
  // round-tripped, or it would silently wipe whatever wasn't included --
  // day_color_overrides included, since NormalizedCalendar defaults it to
  // {} when omitted, which would erase any existing override on every
  // single mutation that isn't itself about day colors.
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

  function handleGenerate(values) {
    return runMutation(() => postJSON("/calendar/plan", values));
  }

  function handleMarkHoliday(start, end, name, family = "holiday", color) {
    if (!draft) return;
    return runMutation(() =>
      postJSON("/calendar/mark-holiday", { calendar: currentCalendar(), start, end, name, family, color })
    );
  }

  function handleUnmarkHoliday(date) {
    if (!draft) return;
    return runMutation(() => postJSON("/calendar/unmark-holiday", { calendar: currentCalendar(), date }));
  }

  function handleRemoveHoliday(holidayId) {
    if (!draft) return;
    return runMutation(() => postJSON("/calendar/remove-holiday", { calendar: currentCalendar(), holiday_id: holidayId }));
  }

  function handleReschedule(eventId, start, end, label, color) {
    if (!draft) return;
    return runMutation(() =>
      postJSON("/calendar/reschedule-event", { calendar: currentCalendar(), event_id: eventId, start, end, label, color })
    );
  }

  function handleSetDayColor(date, color) {
    if (!draft) return;
    return runMutation(() => postJSON("/calendar/set-day-color", { calendar: currentCalendar(), date, color }));
  }

  function handleAddEvent(label, category, cohort, start, end, color) {
    if (!draft) return;
    return runMutation(() =>
      postJSON("/calendar/add-event", { calendar: currentCalendar(), label, category, cohort, start, end, color })
    );
  }

  function handleRemoveEvent(eventId) {
    if (!draft) return;
    return runMutation(() => postJSON("/calendar/remove-event", { calendar: currentCalendar(), event_id: eventId }));
  }

  function draftPath() {
    const { academic_year, term, category } = draft.meta;
    return `/calendar/${encodeURIComponent(academic_year)}/${encodeURIComponent(term)}/${encodeURIComponent(category)}`;
  }

  // Publish snapshots the current draft as what public visitors see;
  // unpublish pulls it back out of public view without touching the draft
  // itself (so it can be published again later with no redo needed).
  function handlePublish() {
    if (!draft) return;
    return runMutation(() => postJSON(`${draftPath()}/publish`, {}));
  }

  function handleUnpublish() {
    if (!draft) return;
    return runMutation(() => postJSON(`${draftPath()}/unpublish`, {}));
  }

  return {
    loading,
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
  };
}
